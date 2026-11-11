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

export async function GET(request) {
  try {
    const stat = await fsp.stat(APK_LOCAL_PATH).catch(() => null);
    if (stat && stat.isFile() && stat.size > 0) {
      const fileStream = fs.createReadStream(APK_LOCAL_PATH);
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
          'Content-Disposition': 'attachment; filename="SPC-Workspace-Android.apk"',
          'Content-Length': String(stat.size),
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }

    const configuredUrl = await resolvePolicyDownloadUrl();
    const requestPath = new URL(request.url).pathname;
    if (configuredUrl && configuredUrl !== requestPath && !configuredUrl.startsWith('/api/public/android-apk')) {
      return NextResponse.redirect(new URL(configuredUrl, request.url));
    }

    return NextResponse.json(
      {
        error: 'Android APK binary is not present on this server host.',
        hint: 'Ask your administrator to configure an external download URL in App & Permission Health -> Release Policy.'
      },
      { status: 404 }
    );
  } catch (err) {
    console.error('[android-apk] Download error:', err);
    return NextResponse.json({ error: 'Failed to serve Android APK' }, { status: 500 });
  }
}
