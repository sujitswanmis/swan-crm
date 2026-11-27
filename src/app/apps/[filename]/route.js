import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_ANDROID_RELEASE_POLICY } from '@/config/appReleaseConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POLICY_FALLBACK_PATH = path.join(process.cwd(), 'src', 'config', 'app_release_policy.json');

function getAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function resolveLatestVersionCode() {
  try {
    const admin = getAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from('app_release_policies')
        .select('latest_version_code')
        .eq('platform', 'android')
        .maybeSingle();
      if (!error && data?.latest_version_code) {
        return Number(data.latest_version_code);
      }
    }
  } catch {}

  try {
    const raw = await fsp.readFile(POLICY_FALLBACK_PATH, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    if (parsed?.platforms?.android?.latest_version_code) {
      return Number(parsed.platforms.android.latest_version_code);
    }
    if (parsed?.latest_version_code) {
      return Number(parsed.latest_version_code);
    }
  } catch {}

  return Number(DEFAULT_ANDROID_RELEASE_POLICY.latest_version_code || 11);
}

function parseVersionFromFilename(rawFilename, fallbackVersion) {
  const clean = String(rawFilename || '').trim();
  if (!clean || clean.includes('..') || clean.includes('/') || clean.includes('\\')) {
    return null;
  }
  if (!/^[a-zA-Z0-9._-]+\.apk$/i.test(clean)) {
    return null;
  }
  const match = clean.match(/v(\d+)/i);
  if (match && Number(match[1]) > 0) {
    return Number(match[1]);
  }
  return fallbackVersion;
}

function getStorageApkUrl(versionCode) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qosmckbxvzpdccbrttkd.supabase.co';
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/app_releases/SPC-Workspace-Android-v${versionCode}.apk`;
}

async function handleApkRequest(request, context, isHead = false) {
  try {
    const params = await context?.params;
    const rawFilename = params?.filename || '';
    const latestCode = await resolveLatestVersionCode();
    const versionCode = parseVersionFromFilename(rawFilename, latestCode);

    if (!versionCode) {
      return NextResponse.json({ success: false, error: 'Invalid APK filename' }, { status: 404 });
    }

    const downloadFilename = `SPC-Workspace-Android-v${versionCode}.apk`;

    // 1. Serve from local SPC-APPS if available (local dev / self-hosted)
    const localCandidates = [
      path.join(process.cwd(), 'SPC-APPS', `SPC Workspace (Android) v${versionCode}.apk`),
      ...(versionCode === latestCode ? [path.join(process.cwd(), 'SPC-APPS', 'SPC Workspace (Android).apk')] : [])
    ];

    for (const candidate of localCandidates) {
      const stat = await fsp.stat(candidate).catch(() => null);
      if (stat && stat.isFile() && stat.size > 0) {
        const headers = {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': `attachment; filename="${downloadFilename}"`,
          'Content-Length': String(stat.size),
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Content-Type-Options': 'nosniff'
        };
        if (isHead) {
          return new NextResponse(null, { status: 200, headers });
        }
        const fileStream = fs.createReadStream(candidate);
        const webStream = new ReadableStream({
          start(controller) {
            fileStream.on('data', (chunk) => controller.enqueue(chunk));
            fileStream.on('end', () => controller.close());
            fileStream.on('error', (err) => controller.error(err));
          },
          cancel() {
            fileStream.destroy();
          }
        });
        return new NextResponse(webStream, { status: 200, headers });
      }
    }

    // 2. Proxy-stream from Supabase Storage directly on this branded domain (no external redirect)
    const upstreamUrl = getStorageApkUrl(versionCode);
    const upstream = await fetch(upstreamUrl, {
      method: isHead ? 'HEAD' : 'GET',
      cache: 'no-store'
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, error: `APK v${versionCode} not found` },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const headers = {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${downloadFilename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    };
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    if (isHead) {
      return new NextResponse(null, { status: 200, headers });
    }

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (err) {
    console.error('[apps/apk] Download error:', err);
    return NextResponse.json({ success: false, error: 'Failed to download APK' }, { status: 500 });
  }
}

export async function GET(request, context) {
  return handleApkRequest(request, context, false);
}

export async function HEAD(request, context) {
  return handleApkRequest(request, context, true);
}
