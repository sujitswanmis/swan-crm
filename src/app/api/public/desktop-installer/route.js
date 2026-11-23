import { NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_WINDOWS_RELEASE_POLICY } from '@/config/appReleaseConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXE_LOCAL_PATH = path.join(process.cwd(), 'SPC-APPS', 'SPC Workspace Setup (Installer).exe');
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

async function resolveDesktopVersionCode() {
  try {
    const admin = getAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from('app_release_policies')
        .select('latest_version_code')
        .eq('platform', 'windows')
        .maybeSingle();
      if (!error && data?.latest_version_code) {
        return Number(data.latest_version_code);
      }
    }
  } catch {}

  try {
    const raw = await fsp.readFile(POLICY_FALLBACK_PATH, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    if (parsed?.platforms?.windows?.latest_version_code) {
      return Number(parsed.platforms.windows.latest_version_code);
    }
  } catch {}

  return DEFAULT_WINDOWS_RELEASE_POLICY.latest_version_code || 3;
}

export async function GET() {
  try {
    const versionCode = await resolveDesktopVersionCode();
    const versionedExePath = path.join(process.cwd(), 'SPC-APPS', `SPC Workspace Setup v${versionCode}.exe`);
    let finalPath = EXE_LOCAL_PATH;
    let stat = await fsp.stat(versionedExePath).catch(() => null);
    if (stat && stat.isFile() && stat.size > 0) {
      finalPath = versionedExePath;
    } else {
      stat = await fsp.stat(EXE_LOCAL_PATH).catch(() => null);
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
          'Content-Type': 'application/vnd.microsoft.portable-executable',
          'Content-Disposition': `attachment; filename="SPC-Workspace-Setup-v${versionCode}.exe"`,
          'Content-Length': String(stat.size),
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }

    return NextResponse.json(
      { success: false, error: 'Desktop installer executable binary not found on host.' },
      { status: 404 }
    );
  } catch (err) {
    console.error('[desktop-installer] Download error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
