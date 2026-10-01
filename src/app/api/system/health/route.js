import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const startTime = performance.now();
  const checks = {
    server: {
      status: 'operational',
      uptimeSeconds: typeof process.uptime === 'function' ? Math.round(process.uptime()) : 0,
      nodeVersion: process.version,
      memory: {
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(process.memoryUsage().heapTotal / (1024 * 1024)),
        rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024))
      },
      istTimestamp: new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(new Date()) + ' IST'
    },
    env: {
      supabaseUrlConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabaseServiceRoleConfigured: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      plivoTelephonyConfigured: !!(process.env.PLIVO_AUTH_ID && process.env.PLIVO_AUTH_TOKEN),
      aiEngineConfigured: !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_KEY)
    },
    database: {
      status: 'checking',
      latencyMs: null,
      error: null
    },
    tables: {}
  };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    checks.database.status = 'error';
    checks.database.error = 'Supabase environment credentials missing on server';
    return NextResponse.json({
      status: 'degraded',
      totalLatencyMs: Math.round(performance.now() - startTime),
      checks
    }, { status: 200 });
  }

  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false }
      }
    );

    const dbStart = performance.now();
    // Test basic database query
    const { data: leadCheck, error: leadErr, count: leadCount } = await adminClient
      .from('leads')
      .select('id, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(1);

    const dbLatency = Math.round(performance.now() - dbStart);
    checks.database.latencyMs = dbLatency;

    if (leadErr) {
      checks.database.status = 'error';
      checks.database.error = leadErr.message;
    } else {
      checks.database.status = dbLatency > 1200 ? 'warning' : 'operational';
      checks.tables.leads = {
        status: 'operational',
        rowCount: leadCount || 0,
        latestRecord: leadCheck?.[0]?.created_at || null
      };
    }

    // Parallel checks for other vital tables
    const [notesRes, punchRes, rolesRes, tasksRes, auditRes] = await Promise.allSettled([
      adminClient.from('lead_notes').select('id, created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(1),
      adminClient.from('attendance_records').select('id, attendance_date, created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(1),
      adminClient.from('user_roles').select('id', { count: 'exact', head: true }),
      adminClient.from('delegation_tasks').select('id', { count: 'exact', head: true }),
      adminClient.from('audit_logs').select('id, created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(1)
    ]);

    if (notesRes.status === 'fulfilled' && !notesRes.value.error) {
      checks.tables.lead_notes = {
        status: 'operational',
        rowCount: notesRes.value.count || 0,
        latestRecord: notesRes.value.data?.[0]?.created_at || null
      };
    } else {
      checks.tables.lead_notes = {
        status: 'warning',
        error: notesRes.reason?.message || notesRes.value?.error?.message || 'Query error'
      };
    }

    if (punchRes.status === 'fulfilled' && !punchRes.value.error) {
      checks.tables.attendance_records = {
        status: 'operational',
        rowCount: punchRes.value.count || 0,
        latestRecord: punchRes.value.data?.[0]?.created_at || null
      };
    } else {
      checks.tables.attendance_records = {
        status: 'warning',
        error: punchRes.reason?.message || punchRes.value?.error?.message || 'Query error'
      };
    }

    if (rolesRes.status === 'fulfilled' && !rolesRes.value.error) {
      checks.tables.user_roles = {
        status: 'operational',
        userCount: rolesRes.value.count || 0
      };
    } else {
      checks.tables.user_roles = {
        status: 'warning',
        error: rolesRes.reason?.message || rolesRes.value?.error?.message || 'Query error'
      };
    }

    if (tasksRes.status === 'fulfilled' && !tasksRes.value.error) {
      checks.tables.delegation_tasks = {
        status: 'operational',
        taskCount: tasksRes.value.count || 0
      };
    } else {
      checks.tables.delegation_tasks = {
        status: 'warning',
        error: tasksRes.reason?.message || tasksRes.value?.error?.message || 'Query error'
      };
    }

    if (auditRes.status === 'fulfilled' && !auditRes.value.error) {
      checks.tables.audit_logs = {
        status: 'operational',
        rowCount: auditRes.value.count || 0,
        latestRecord: auditRes.value.data?.[0]?.created_at || null
      };
    } else {
      checks.tables.audit_logs = {
        status: 'warning',
        error: auditRes.reason?.message || auditRes.value?.error?.message || 'Query error'
      };
    }

  } catch (err) {
    checks.database.status = 'error';
    checks.database.error = err.message || 'Server database inspection failed';
  }

  const overallStatus = checks.database.status === 'error'
    ? 'critical'
    : (checks.database.status === 'warning' || Object.values(checks.tables).some(t => t.status === 'warning'))
      ? 'degraded'
      : 'healthy';

  return NextResponse.json({
    status: overallStatus,
    totalLatencyMs: Math.round(performance.now() - startTime),
    checks
  }, { status: 200 });
}
