import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorizeHangupCause } from '../src/app/api/plivo/utils.js';
import { normalizeIndianPhoneNumber } from '../src/app/api/plivo/phone-number.js';
import { outboundRoomToken, shouldAutoAnswerOutbound } from '../src/app/api/plivo/outbound-intent.js';
import { buildOutboundDialXml } from '../src/app/api/plivo/outbound-dial-xml.js';

test('provider codes distinguish busy, invalid, unavailable and timeout', () => {
  assert.equal(categorizeHangupCause('', 'Busy Line', 'Carrier', 30, false, 3010), 'busy');
  assert.equal(categorizeHangupCause('', 'User Busy', 'Carrier', 5, false, 17), 'busy');
  assert.equal(categorizeHangupCause('', 'Call Rejected', 'Carrier', 2, false, 21), 'rejected');
  assert.equal(categorizeHangupCause('', 'Subscriber Absent', 'Carrier', 0, false, 20), 'unreachable');
  assert.equal(categorizeHangupCause('', 'Unallocated Number', 'Carrier', 0, false, 3050), 'invalid_number');
  assert.equal(categorizeHangupCause('', 'Destination Out of Service', 'Carrier', 2, false, 2010), 'unreachable');
  assert.equal(categorizeHangupCause('', 'Ring Timeout', 'Carrier', 35, false, 6010), 'no_answer');
  assert.equal(categorizeHangupCause('', 'Routing Error', 'Error', 0, false, 5020), 'network_error');
  assert.equal(categorizeHangupCause('timeout', '', '', 35), 'no_answer');
  assert.equal(categorizeHangupCause('busy', 'USER_BUSY', 'Carrier', 12), 'busy');
  assert.equal(categorizeHangupCause('completed', 'Normal Clearing', 'Carrier', 0, false, 16, 'false'), 'unreachable');
});

test('outbound Dial passes real carrier audio and reports final status', () => {
  const xml = buildOutboundDialXml({
    roomName: 'room_123_abc',
    customerNumber: '9876543210',
    callerId: '+918035340622',
    baseUrl: 'https://crm.example.com'
  });
  assert.match(xml, /<Dial [^>]*dialMusic="real"/);
  assert.match(xml, /callbackUrl="https:\/\/crm\.example\.com\/api\/plivo\/dial-callback\?room=room_123_abc"/);
  assert.match(xml, /action="https:\/\/crm\.example\.com\/api\/plivo\/dial-action\?room=room_123_abc"/);
  assert.match(xml, /<Number>\+919876543210<\/Number>/);
  assert.match(xml, /startOnDialAnswer="true"/);
  assert.throws(() => buildOutboundDialXml({ roomName: 'bad', customerNumber: '9876543210', callerId: '+918035340622', baseUrl: 'https://crm.example.com' }));
});

test('outbound auto-answer requires the active room and provider call marker', () => {
  const room = 'room_123_abc';
  const pending = { roomName: room, startedAt: 1000 };
  const marker = outboundRoomToken(room);
  assert.equal(shouldAutoAnswerOutbound(pending, room, { 'X-PH-CrmRoom': marker }, '', 2000), true);
  assert.equal(shouldAutoAnswerOutbound(pending, room, {}, `CRM${marker}`, 2000), true);
  assert.equal(shouldAutoAnswerOutbound(pending, room, {}, '', 2000), false);
  assert.equal(shouldAutoAnswerOutbound(pending, 'room_other', { 'X-PH-CrmRoom': marker }, '', 2000), false);
  assert.equal(shouldAutoAnswerOutbound(pending, room, { 'X-PH-CrmRoom': marker }, '', 22000), false);
});

test('ambiguous and app-cancelled calls do not claim the phone was switched off', () => {
  assert.equal(categorizeHangupCause('', 'Cancelled', 'API Request', 10, false, 1000), 'call_cancelled');
  assert.equal(categorizeHangupCause('completed', 'Normal Clearing', 'Carrier', 10), 'failed');
  assert.equal(categorizeHangupCause('completed', 'Normal Clearing', 'Carrier', 29), 'failed');
});

test('outbound customer number accepts Indian mobile and landline formats', () => {
  assert.equal(normalizeIndianPhoneNumber('98765 43210'), '+919876543210');
  assert.equal(normalizeIndianPhoneNumber('09876543210'), '+919876543210');
  assert.equal(normalizeIndianPhoneNumber('+91-98765-43210'), '+919876543210');
  assert.equal(normalizeIndianPhoneNumber('3312345678'), '+913312345678');
  for (const input of ['1234567890', '+91987654321099', '99999', '++919876543210', 'foo9876543210']) {
    assert.equal(normalizeIndianPhoneNumber(input), null, input);
  }
});
