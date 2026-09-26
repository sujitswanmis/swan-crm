import plivo from 'plivo';

export async function transferDialToConference(session, adminClient, baseUrl) {
  if (session.conference_name) return;
  if (session.status !== 'connected' || !session.agent_call_uuid || !session.customer_call_uuid) {
    throw new Error('Both call legs must be connected before adding participants');
  }
  const roomName = session.room_name;
  const { data: claimed, error } = await adminClient.from('call_sessions')
    .update({ conference_name: roomName })
    .eq('id', session.id).is('conference_name', null).eq('status', 'connected').select('id');
  if (error) throw error;
  if (!claimed?.length) return;

  try {
    const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
    await client.calls.transfer(session.agent_call_uuid, {
      legs: 'both',
      alegUrl: `${baseUrl}/api/plivo/answer?room=${encodeURIComponent(roomName)}&role=agent_conf`,
      alegMethod: 'POST',
      blegUrl: `${baseUrl}/api/plivo/answer?room=${encodeURIComponent(roomName)}&role=customer_conf`,
      blegMethod: 'POST'
    });
  } catch (error) {
    await adminClient.from('call_sessions').update({ conference_name: null })
      .eq('id', session.id).eq('conference_name', roomName).eq('status', 'connected');
    throw error;
  }
}
