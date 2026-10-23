import { normalizeIndianPhoneNumber } from './phone-number.js';

const escapeXml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
})[character]);

export function buildOutboundDialXml({ roomName, customerNumber, callerId, baseUrl }) {
  const number = normalizeIndianPhoneNumber(customerNumber);
  if (!number || !/^room_[A-Za-z0-9_]{1,64}$/.test(roomName || '')) {
    throw new Error('Invalid outbound dial target');
  }
  const root = String(baseUrl || '').replace(/\/$/, '');
  if (!/^https:\/\//.test(root)) throw new Error('Outbound dial requires a public HTTPS URL');
  const query = `room=${encodeURIComponent(roomName)}`;
  const actionUrl = escapeXml(`${root}/api/plivo/dial-action?${query}`);
  const callbackUrl = escapeXml(`${root}/api/plivo/dial-callback?${query}`);
  const recordUrl = escapeXml(`${root}/api/plivo/recording-callback?${query}`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Record action="${recordUrl}" startOnDialAnswer="true" redirect="false" maxLength="3600" />
  <Dial callerId="${escapeXml(callerId)}" timeout="35" dialMusic="real" callbackUrl="${callbackUrl}" callbackMethod="POST" action="${actionUrl}" method="POST" redirect="true">
    <Number>${escapeXml(number)}</Number>
  </Dial>
  <Hangup/>
</Response>`;
}
