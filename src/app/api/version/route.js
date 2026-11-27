import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { PLATFORM_RELEASE_DEFAULTS, sanitizeReleasePolicy } from '@/config/appReleaseConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET() {
  try {
    let pkgVersion = '2.5.1333';
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      const rawPkg = fs.readFileSync(pkgPath, 'utf8');
      const parsed = JSON.parse(rawPkg);
      if (parsed?.version) pkgVersion = parsed.version;
    } catch {}

    const policies = {
      android: { ...PLATFORM_RELEASE_DEFAULTS.android },
      windows: { ...PLATFORM_RELEASE_DEFAULTS.windows },
      ios: { ...PLATFORM_RELEASE_DEFAULTS.ios }
    };

    // 1. Fetch live policies directly from Supabase
    try {
      const admin = getAdminClient();
      if (admin) {
        const { data, error } = await admin.from('app_release_policies').select('*');
        if (!error && Array.isArray(data)) {
          for (const row of data) {
            const p = String(row?.platform || '').trim().toLowerCase();
            if (policies[p]) {
              policies[p] = sanitizeReleasePolicy(row, p);
            }
          }
        }
      }
    } catch {}

    // 2. Fallback to local JSON file if database is unreachable
    try {
      const policyPath = path.join(process.cwd(), 'src', 'config', 'app_release_policy.json');
      const rawPolicy = fs.readFileSync(policyPath, 'utf8');
      const parsedPolicy = JSON.parse(rawPolicy);
      if (parsedPolicy?.platforms) {
        for (const [p, val] of Object.entries(parsedPolicy.platforms)) {
          if (policies[p] && !policies[p].updated_at) {
            policies[p] = sanitizeReleasePolicy(val, p);
          }
        }
      } else if (parsedPolicy?.latest_version_code && !policies.android.updated_at) {
        policies.android = sanitizeReleasePolicy(parsedPolicy, 'android');
      }
    } catch {}

    const commitSha =
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
      null;

    return NextResponse.json(
      {
        success: true,
        version: pkgVersion,
        commitSha,
        timestamp: Date.now(),
        android: policies.android,
        windows: policies.windows,
        ios: policies.ios,
        platforms: policies
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
