import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { DEFAULT_ANDROID_RELEASE_POLICY, sanitizeReleasePolicy } from '@/config/appReleaseConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APK_LOCAL_PATH = path.join(process.cwd(), 'SPC-APPS', 'SPC Workspace (Android).apk');
const POLICY_FALLBACK_PATH = path.join(process.cwd(), 'src', 'config', 'app_release_policy.json');

function getDirectStorageUrl(versionCode = 10) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qosmckbxvzpdccbrttkd.supabase.co';
  return `${supabaseUrl}/storage/v1/object/public/app_releases/SPC-Workspace-Android-v${versionCode}.apk`;
}

function getAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function resolvePolicyDownloadUrl() {
  try {
    const admin = getAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from('app_release_policies')
        .select('*')
        .eq('platform', 'android')
        .maybeSingle();
      if (!error && data) {
        return sanitizeReleasePolicy(data).download_url;
      }
    }
  } catch {
    // Fallback to local policy file
  }

  try {
    const raw = await fsp.readFile(POLICY_FALLBACK_PATH, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    if (parsed?.download_url) {
      return sanitizeReleasePolicy(parsed).download_url;
    }
  } catch {
    // Fallback to default
  }

  return DEFAULT_ANDROID_RELEASE_POLICY.download_url;
}

async function resolvePolicyVersionCode() {
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

  return DEFAULT_ANDROID_RELEASE_POLICY.latest_version_code || 10;
}

export async function GET(request) {
  try {
    const versionCode = await resolvePolicyVersionCode();
    const versionedApkPath = path.join(process.cwd(), 'SPC-APPS', `SPC Workspace (Android) v${versionCode}.apk`);
    let finalPath = APK_LOCAL_PATH;
    let stat = await fsp.stat(versionedApkPath).catch(() => null);
    if (stat && stat.isFile() && stat.size > 0) {
      finalPath = versionedApkPath;
    } else {
      stat = await fsp.stat(APK_LOCAL_PATH).catch(() => null);
    }

    if (stat && stat.isFile() && stat.size > 0) {
      const fileStream = fs.createReadStream(finalPath);
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

      return new NextResponse(webStream, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': `attachment; filename="SPC-Workspace-Android-v${versionCode}.apk"`,
          'Content-Length': String(stat.size),
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }

    const configuredUrl = await resolvePolicyDownloadUrl();
    const requestUrlObj = new URL(request.url);
    const requestPath = requestUrlObj.pathname;

    // Check if configuredUrl is self-referencing (points to this same endpoint or host path)
    const isSelfReferencing =
      !configuredUrl ||
      configuredUrl.includes('/api/public/android-apk') ||
      configuredUrl === requestPath ||
      configuredUrl === request.url;

    // If external non-loop URL is configured, use it. Otherwise, redirect directly to Supabase Storage CDN binary
    const targetUrl = isSelfReferencing ? getDirectStorageUrl(versionCode) : configuredUrl;

    return NextResponse.redirect(new URL(targetUrl, request.url), 307);
  } catch (err) {
    console.error('[android-apk] Download error:', err);
    return NextResponse.redirect(getDirectStorageUrl(10), 307);
  }
}
