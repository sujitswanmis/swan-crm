import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let pkgVersion = '2.5.1234';
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      const rawPkg = fs.readFileSync(pkgPath, 'utf8');
      const parsed = JSON.parse(rawPkg);
      if (parsed?.version) pkgVersion = parsed.version;
    } catch {}

    let androidPolicy = {
      latest_version_code: 8,
      latest_version_name: pkgVersion,
      min_supported_version_code: 4,
      download_url: '/api/public/android-apk'
    };
    try {
      const policyPath = path.join(process.cwd(), 'src', 'config', 'app_release_policy.json');
      const rawPolicy = fs.readFileSync(policyPath, 'utf8');
      const parsedPolicy = JSON.parse(rawPolicy);
      if (parsedPolicy) {
        androidPolicy = { ...androidPolicy, ...parsedPolicy };
      }
    } catch {}

    return NextResponse.json(
      {
        success: true,
        version: pkgVersion,
        timestamp: Date.now(),
        android: androidPolicy
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
