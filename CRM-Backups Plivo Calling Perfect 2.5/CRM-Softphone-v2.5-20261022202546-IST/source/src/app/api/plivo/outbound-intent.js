export function outboundRoomToken(roomName) {
  return String(roomName || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
}

export function incomingMatchesOutboundRoom(roomName, extraHeaders, callerName) {
  const token = outboundRoomToken(roomName);
  if (!token) return false;
  const header = Object.entries(extraHeaders || {}).find(([key]) =>
    key.toLowerCase().replace(/^x-ph-/, '') === 'crmroom'
  )?.[1];
  return header === token || callerName === `CRM${token}`;
}

export function shouldAutoAnswerOutbound(pending, activeRoom, extraHeaders, callerName, now = Date.now()) {
  return !!pending && activeRoom === pending.roomName &&
    now >= pending.startedAt && now - pending.startedAt < 20000 &&
    incomingMatchesOutboundRoom(pending.roomName, extraHeaders, callerName);
}
