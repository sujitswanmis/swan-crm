import plivo from 'plivo';

export async function transferDialToConference(session, adminClient, baseUrl, force = false) {
  if (session.conference_name && !force) return;
  if (session.status !== 'connected' || !session.agent_call_uuid || !session.customer_call_uuid) {
    throw new Error('Both call legs must be connected before adding participants');
  }
  const roomName = session.room_name;
  if (!session.conference_name) {
    const { data: claimed, error } = await adminClient.from('call_sessions')
      .update({ conference_name: roomName })
      .eq('id', session.id).is('conference_name', null).eq('status', 'connected').select('id');
    if (error) throw error;
    if (!claimed?.length && !force) return;
  }

  try {
    const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
    const agentConfUrl = `${baseUrl}/api/plivo/answer?room=${encodeURIComponent(roomName)}&role=agent_conf`;
    const custConfUrl = `${baseUrl}/api/plivo/answer?room=${encodeURIComponent(roomName)}&role=customer_conf`;

    await client.calls.transfer(session.agent_call_uuid, {
      legs: 'both',
      aleg_url: agentConfUrl,
      alegUrl: agentConfUrl,
      aleg_method: 'POST',
      alegMethod: 'POST',
      bleg_url: custConfUrl,
      blegUrl: custConfUrl,
      bleg_method: 'POST',
      blegMethod: 'POST'
    });
  } catch (error) {
    await adminClient.from('call_sessions').update({ conference_name: null })
      .eq('id', session.id).eq('conference_name', roomName).eq('status', 'connected');
    throw error;
  }
}
