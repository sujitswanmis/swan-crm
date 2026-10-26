import { NextResponse } from 'next/server';
import { requireCallCenterAccess, readPageCalls, privateHeaders } from '@/lib/callCenterPageData';

export async function GET(req) {
  try {
    const context = await requireCallCenterAccess(req, { desk: true });
    const params = new URL(req.url).searchParams;
    // Never accept an agent/user ID supplied by the browser for this personal desk.
    const { data: agent, error } = await context.db.from('call_agents')
      .select('id, user_id, display_name, is_active, status, mobile_number, default_calling_mode, plivo_username, plivo_endpoint_key, plivo_sip_uri')
      .eq('user_id', context.user.id).maybeSingle();
    if (error) throw new Error('Profile read failed.');
    if (params.get('section') === 'calls') {
      const result = await readPageCalls(context, params, agent ? [agent] : []);
      return NextResponse.json(result, { headers: privateHeaders });
    }
    const name = context.role.emp_name || context.role.email || agent?.display_name;
    const employeeId = context.role.emp_id || context.role.emp_code;
    return NextResponse.json({ data: agent ? { ...agent,
      display_name: employeeId && !String(name).includes(String(employeeId)) ? `${name} - ${employeeId}` : name,
      mobile_number: context.role.emp_mobile || agent.mobile_number } : null }, { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ error: error.status ? error.message : 'Telecalling Desk could not be loaded.' }, { status: error.status || 503, headers: privateHeaders });
  }
}
