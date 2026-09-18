import { NextResponse } from 'next/server';
import plivo from 'plivo';
import { createClient } from '@supabase/supabase-js';

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const roomName = url.searchParams.get('room');
    if (!roomName) return NextResponse.json({ error: 'Missing room' }, { status: 400 });

    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;
    const client = new plivo.Client(authId, authToken);

    let members = [];
    try {
      const conference = await client.conferences.get(roomName);
      const rawMembers = conference.members || [];
      
      if (rawMembers.length > 0) {
        members = await Promise.all(rawMembers.map(async (member) => {
          try {
            const callDetails = await client.calls.get(member.callUuid);
            return {
              ...member,
              from: callDetails.fromNumber || callDetails.from,
              to: callDetails.toNumber || callDetails.to,
              direction: callDetails.direction
            };
          } catch (e) {
            return member;
          }
        }));
      }
    } catch (_confErr) {
      // Conference not found or not yet initiated
    }

    // If conference members are empty, inspect the live call_sessions row
    // In direct 2-way <Dial> mode, there is no Plivo conference object, but the 2 parties are live!
    if (members.length === 0) {
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data: session } = await adminClient
        .from('call_sessions')
        .select('*')
        .eq('room_name', roomName)
        .maybeSingle();

      if (session && session.status !== 'ended' && session.status !== 'failed') {
        const cleanCust = session.customer_number ? `+91 ${session.customer_number.replace(/\D/g, '').slice(-10)}` : 'Customer';
        members = [
          {
            memberId: session.agent_member_id || 'agent_leg',
            callerName: 'Agent (You)',
            role: 'agent',
            direction: 'outbound',
            callUuid: session.agent_call_uuid,
            from: session.agent_dial_to,
            joinTime: session.agent_answer_time
              ? new Date(session.agent_answer_time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
              : 'Active',
            muted: false
          },
          {
            memberId: session.customer_member_id || 'customer_leg',
            callerName: cleanCust,
            to: session.customer_number,
            direction: 'outbound',
            role: 'customer',
            callUuid: session.customer_call_uuid,
            joinTime: session.customer_answer_time
              ? new Date(session.customer_answer_time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
              : (session.status === 'customer_ringing' ? 'Ringing...' : 'Active'),
            muted: false
          }
        ];
      }
    }

    return NextResponse.json({ members });
  } catch (error) {
    console.error('Fetch members error:', error);
    return NextResponse.json({ members: [] });
  }
}
