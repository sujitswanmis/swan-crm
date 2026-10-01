import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const startTime = performance.now();
  const now = new Date();

  // Strict IST evaluation
  const istDateString = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now); // 'YYYY-MM-DD'
  const todayStartUTC = new Date(`${istDateString}T00:00:00+05:30`).toISOString();
  const fourteenDaysAgoUTC = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const istFormattedTimestamp = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(now) + ' IST';

  const result = {
    server: {
      status: 'operational',
      uptimeSeconds: typeof process.uptime === 'function' ? Math.round(process.uptime()) : 0,
      nodeVersion: process.version,
      memory: {
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(process.memoryUsage().heapTotal / (1024 * 1024)),
        rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024))
      },
      istDate: istDateString,
      istTimestamp: istFormattedTimestamp
    },
    env: {
      supabaseUrlConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabaseServiceRoleConfigured: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      plivoTelephonyConfigured: !!(process.env.PLIVO_AUTH_ID && process.env.PLIVO_AUTH_TOKEN),
      aiEngineConfigured: !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_KEY)
    },
    database: {
      status: 'operational',
      latencyMs: null,
      error: null
    },
    leadsDoctor: {
      totalLeads: 0,
      unassignedLeads: 0,
      leadsToday: 0,
      staleLeads: 0,
      latestLeadCreated: null,
      status: 'operational'
    },
    telephonyDoctor: {
      callsToday: 0,
      failedCallsToday: 0,
      totalRegisteredAgents: 0,
      status: 'operational'
    },
    attendanceDoctor: {
      punchedInToday: 0,
      punchedOutToday: 0,
      unclosedPastShifts: 0,
      pendingRegularizations: 0,
      status: 'operational'
    },
    tasksChecklistsDoctor: {
      totalTasks: 0,
      pendingTasks: 0,
      overdueTasks: 0,
      checklistsSubmittedToday: 0,
      status: 'operational'
    },
    sessionsSecurityDoctor: {
      totalUsers: 0,
      activeSessions: 0,
      auditLogsToday: 0,
      latestAuditTimestamp: null,
      status: 'operational'
    },
    whatsappDoctor: {
      totalInstances: 0,
      connectedInstances: 0,
      messagesToday: 0,
      status: 'operational'
    },
    storageDoctor: {
      bucketsAvailable: [],
      bucketsCount: 0,
      status: 'operational',
      error: null
    },
    masterRecordsDoctor: {
      totalParties: 0,
      totalProducts: 0,
      totalDepartments: 0,
      status: 'operational'
    }
  };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    result.database.status = 'error';
    result.database.error = 'Supabase environment credentials missing on server';
    return NextResponse.json({
      status: 'critical',
      totalLatencyMs: Math.round(performance.now() - startTime),
      checks: result
    }, { status: 200 });
  }

  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const dbPingStart = performance.now();

    // Run parallel multi-table audits
    const [
      dbPingRes,
      leadsTotalRes,
      leadsUnassignedRes,
      leadsTodayRes,
      leadsStaleRes,
      leadNotesTodayRes,
      callsTodayRes,
      callsFailedTodayRes,
      callAgentsRes,
      attendanceInRes,
      attendanceOutRes,
      attendanceUnclosedRes,
      attendanceRegRes,
      tasksTotalRes,
      tasksPendingRes,
      tasksOverdueRes,
      checklistsTodayRes,
      userRolesRes,
      userSessionsRes,
      auditTodayRes,
      partyRes,
      productsRes,
      departmentsRes,
      waInstancesRes,
      waMessagesTodayRes,
      storageBucketsRes
    ] = await Promise.allSettled([
      // 0. Base Ping
      adminClient.from('leads').select('id, created_at').order('created_at', { ascending: false }).limit(1),
      // 1. Leads
      adminClient.from('leads').select('id', { count: 'exact', head: true }),
      adminClient.from('leads').select('id', { count: 'exact', head: true }).is('assigned_to', null),
      adminClient.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', todayStartUTC),
      adminClient.from('leads').select('id', { count: 'exact', head: true }).lte('updated_at', fourteenDaysAgoUTC),
      adminClient.from('lead_notes').select('id', { count: 'exact', head: true }).gte('created_at', todayStartUTC),
      // 2. Telephony
      adminClient.from('call_sessions').select('id', { count: 'exact', head: true }).gte('created_at', todayStartUTC),
      adminClient.from('call_sessions').select('id', { count: 'exact', head: true }).gte('created_at', todayStartUTC).in('status', ['failed', 'no-answer', 'busy', 'rejected']),
      adminClient.from('call_agents').select('id', { count: 'exact', head: true }),
      // 3. Attendance
      adminClient.from('attendance_records').select('id', { count: 'exact', head: true }).eq('attendance_date', istDateString).not('in_time', 'is', null),
      adminClient.from('attendance_records').select('id', { count: 'exact', head: true }).eq('attendance_date', istDateString).not('out_time', 'is', null),
      adminClient.from('attendance_records').select('id', { count: 'exact', head: true }).lt('attendance_date', istDateString).not('in_time', 'is', null).is('out_time', null),
      adminClient.from('attendance_regularization_requests').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
      // 4. Tasks & Checklists
      adminClient.from('delegation_tasks').select('id', { count: 'exact', head: true }),
      adminClient.from('delegation_tasks').select('id', { count: 'exact', head: true }).in('status', ['PENDING', 'IN_PROGRESS']),
      adminClient.from('delegation_tasks').select('id', { count: 'exact', head: true }).neq('status', 'COMPLETED').lt('due_date', istDateString),
      adminClient.from('checklist_submissions').select('id', { count: 'exact', head: true }).gte('created_at', todayStartUTC),
      // 5. Users & Sessions
      adminClient.from('user_roles').select('id', { count: 'exact', head: true }),
      adminClient.from('user_sessions').select('id', { count: 'exact', head: true }).eq('is_active', true),
      adminClient.from('audit_logs').select('id, created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(1),
      // 6. Master Records
      adminClient.from('party_master').select('id', { count: 'exact', head: true }),
      adminClient.from('products').select('id', { count: 'exact', head: true }),
      adminClient.from('departments').select('id', { count: 'exact', head: true }),
      // 7. WhatsApp
      adminClient.from('whatsapp_instances').select('id, status', { count: 'exact' }),
      adminClient.from('wa_messages').select('id', { count: 'exact', head: true }).gte('created_at', todayStartUTC),
      // 8. Storage Buckets
      adminClient.storage.listBuckets()
    ]);

    result.database.latencyMs = Math.round(performance.now() - dbPingStart);

    if (dbPingRes.status === 'fulfilled' && !dbPingRes.value.error) {
      result.leadsDoctor.latestLeadCreated = dbPingRes.value.data?.[0]?.created_at || null;
    } else if (dbPingRes.status === 'fulfilled' && dbPingRes.value.error) {
      result.database.status = 'error';
      result.database.error = dbPingRes.value.error.message;
    }

    // Unpack Leads
    if (leadsTotalRes.status === 'fulfilled' && !leadsTotalRes.value.error) {
      result.leadsDoctor.totalLeads = leadsTotalRes.value.count || 0;
    }
    if (leadsUnassignedRes.status === 'fulfilled' && !leadsUnassignedRes.value.error) {
      result.leadsDoctor.unassignedLeads = leadsUnassignedRes.value.count || 0;
    }
    if (leadsTodayRes.status === 'fulfilled' && !leadsTodayRes.value.error) {
      result.leadsDoctor.leadsToday = leadsTodayRes.value.count || 0;
    }
    if (leadsStaleRes.status === 'fulfilled' && !leadsStaleRes.value.error) {
      result.leadsDoctor.staleLeads = leadsStaleRes.value.count || 0;
    }

    // Unpack Telephony
    if (callsTodayRes.status === 'fulfilled' && !callsTodayRes.value.error) {
      result.telephonyDoctor.callsToday = callsTodayRes.value.count || 0;
    }
    if (callsFailedTodayRes.status === 'fulfilled' && !callsFailedTodayRes.value.error) {
      result.telephonyDoctor.failedCallsToday = callsFailedTodayRes.value.count || 0;
    }
    if (callAgentsRes.status === 'fulfilled' && !callAgentsRes.value.error) {
      result.telephonyDoctor.totalRegisteredAgents = callAgentsRes.value.count || 0;
    }

    // Unpack Attendance
    if (attendanceInRes.status === 'fulfilled' && !attendanceInRes.value.error) {
      result.attendanceDoctor.punchedInToday = attendanceInRes.value.count || 0;
    }
    if (attendanceOutRes.status === 'fulfilled' && !attendanceOutRes.value.error) {
      result.attendanceDoctor.punchedOutToday = attendanceOutRes.value.count || 0;
    }
    if (attendanceUnclosedRes.status === 'fulfilled' && !attendanceUnclosedRes.value.error) {
      result.attendanceDoctor.unclosedPastShifts = attendanceUnclosedRes.value.count || 0;
    }
    if (attendanceRegRes.status === 'fulfilled' && !attendanceRegRes.value.error) {
      result.attendanceDoctor.pendingRegularizations = attendanceRegRes.value.count || 0;
    }

    // Unpack Tasks & Checklists
    if (tasksTotalRes.status === 'fulfilled' && !tasksTotalRes.value.error) {
      result.tasksChecklistsDoctor.totalTasks = tasksTotalRes.value.count || 0;
    }
    if (tasksPendingRes.status === 'fulfilled' && !tasksPendingRes.value.error) {
      result.tasksChecklistsDoctor.pendingTasks = tasksPendingRes.value.count || 0;
    }
    if (tasksOverdueRes.status === 'fulfilled' && !tasksOverdueRes.value.error) {
      result.tasksChecklistsDoctor.overdueTasks = tasksOverdueRes.value.count || 0;
    }
    if (checklistsTodayRes.status === 'fulfilled' && !checklistsTodayRes.value.error) {
      result.tasksChecklistsDoctor.checklistsSubmittedToday = checklistsTodayRes.value.count || 0;
    }

    // Unpack Users & Sessions
    if (userRolesRes.status === 'fulfilled' && !userRolesRes.value.error) {
      result.sessionsSecurityDoctor.totalUsers = userRolesRes.value.count || 0;
    }
    if (userSessionsRes.status === 'fulfilled' && !userSessionsRes.value.error) {
      result.sessionsSecurityDoctor.activeSessions = userSessionsRes.value.count || 0;
    }
    if (auditTodayRes.status === 'fulfilled' && !auditTodayRes.value.error) {
      result.sessionsSecurityDoctor.auditLogsToday = auditTodayRes.value.count || 0;
      result.sessionsSecurityDoctor.latestAuditTimestamp = auditTodayRes.value.data?.[0]?.created_at || null;
    }

    // Unpack Master Records
    if (partyRes.status === 'fulfilled' && !partyRes.value.error) {
      result.masterRecordsDoctor.totalParties = partyRes.value.count || 0;
    }
    if (productsRes.status === 'fulfilled' && !productsRes.value.error) {
      result.masterRecordsDoctor.totalProducts = productsRes.value.count || 0;
    }
    if (departmentsRes.status === 'fulfilled' && !departmentsRes.value.error) {
      result.masterRecordsDoctor.totalDepartments = departmentsRes.value.count || 0;
    }

    // Unpack WhatsApp
    if (waInstancesRes.status === 'fulfilled' && !waInstancesRes.value.error) {
      const instances = waInstancesRes.value.data || [];
      result.whatsappDoctor.totalInstances = instances.length;
      result.whatsappDoctor.connectedInstances = instances.filter(i => i.status === 'CONNECTED').length;
    }
    if (waMessagesTodayRes.status === 'fulfilled' && !waMessagesTodayRes.value.error) {
      result.whatsappDoctor.messagesToday = waMessagesTodayRes.value.count || 0;
    }

    // Unpack Storage Buckets
    if (storageBucketsRes.status === 'fulfilled' && !storageBucketsRes.value.error) {
      const buckets = storageBucketsRes.value.data || [];
      result.storageDoctor.bucketsAvailable = buckets.map(b => b.name);
      result.storageDoctor.bucketsCount = buckets.length;
      result.storageDoctor.status = 'operational';
    } else {
      result.storageDoctor.status = 'warning';
      result.storageDoctor.error = storageBucketsRes.reason?.message || storageBucketsRes.value?.error?.message || 'Unable to list storage buckets';
    }

  } catch (err) {
    result.database.status = 'error';
    result.database.error = err.message || 'Server database health evaluation failed';
  }

  // Calculate Overall Status
  const hasCriticalIssue = result.database.status === 'error';
  const hasWarnings = (
    result.database.latencyMs > 1200 ||
    result.leadsDoctor.unassignedLeads > 100 ||
    result.attendanceDoctor.unclosedPastShifts > 10 ||
    result.tasksChecklistsDoctor.overdueTasks > 20 ||
    result.storageDoctor.status === 'warning'
  );

  const overallStatus = hasCriticalIssue ? 'critical' : hasWarnings ? 'degraded' : 'healthy';

  return NextResponse.json({
    status: overallStatus,
    totalLatencyMs: Math.round(performance.now() - startTime),
    checks: result
  }, { status: 200 });
}
