import { NextResponse } from 'next/server';

// GET /api/plivo/admin/call-logs - Fetch call logs from Plivo + DB merged
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get('limit') || '25';
    const offset = url.searchParams.get('offset') || '0';
    const source = url.searchParams.get('source') || 'db'; // 'db' or 'plivo'
    const startDate = url.searchParams.get('start_date') || url.searchParams.get('startDate');
    const endDate = url.searchParams.get('end_date') || url.searchParams.get('endDate');
    const company = url.searchParams.get('company') || '';

    const SWAN_COMPANIES = ['nsmlr', 'nstlp', 'nstl', 'new swan group', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl'];
    const reqLower = String(company || '').toLowerCase().trim();
    const isSwanRequester = !company || SWAN_COMPANIES.includes(reqLower);

    const adminClient = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (source === 'db') {
      let workspaceAgentIds = null;
      if (!isSwanRequester) {
        const { data: users } = await adminClient
          .from('user_roles')
          .select('user_id')
          .ilike('company', reqLower);

        const userIds = (users || []).map(u => u.user_id).filter(Boolean);
        if (userIds.length === 0) {
          return NextResponse.json({ calls: [], total: 0 });
        }

        const { data: agents } = await adminClient
          .from('call_agents')
          .select('id')
          .in('user_id', userIds);

        workspaceAgentIds = (agents || []).map(a => a.id).filter(Boolean);
        if (workspaceAgentIds.length === 0) {
          return NextResponse.json({ calls: [], total: 0 });
        }
      }

      let query = adminClient
        .from('call_sessions')
        .select(`
          *,
          call_agents (
            display_name,
            plivo_username
          )
        `, { count: 'exact' });

      if (workspaceAgentIds) {
        query = query.in('agent_id', workspaceAgentIds);
      }

      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

      if (error) throw error;
      return NextResponse.json({ calls: data || [], total: count || 0 });
    }

    // Plivo CDR logs: strictly isolate to Swan Master, client workspaces have 0 Plivo raw leakage
    if (!isSwanRequester) {
      return NextResponse.json({ calls: [], total: 0 });
    }

    // Plivo CDR logs
    const authId = (process.env.PLIVO_AUTH_ID || '').trim().replace(/['"]/g, '');
    const authToken = (process.env.PLIVO_AUTH_TOKEN || '').trim().replace(/['"]/g, '');
    const b64 = Buffer.from(`${authId}:${authToken}`).toString('base64');

    let plivoUrl = `https://api.plivo.com/v1/Account/${authId}/Call/?limit=${limit}&offset=${offset}`;
    if (startDate) {
      const cleanStart = startDate.replace('T', ' ').split('.')[0];
      plivoUrl += `&end_time__gte=${encodeURIComponent(cleanStart)}`;
    }
    if (endDate) {
      const cleanEnd = endDate.replace('T', ' ').split('.')[0];
      plivoUrl += `&end_time__lte=${encodeURIComponent(cleanEnd)}`;
    }

    const res = await fetch(plivoUrl, {
      headers: { 'Authorization': 'Basic ' + b64 }
    });

    const data = await res.json();
    return NextResponse.json({
      calls: data.objects || [],
      total: data.meta?.total_count || 0
    });

  } catch (error) {
    console.error('Admin call logs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
