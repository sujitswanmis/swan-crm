import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIncomingCallGuard } from '../src/lib/softphoneIncomingCall.js';

function sdk(calls = [{ callUUID: 'call-a', state: 'ringing' }]) {
  const actions = [];
  return { calls, actions, getIncomingCalls: () => calls,
    answer: uuid => { actions.push(['answer', uuid]); return true; },
    reject: uuid => { actions.push(['reject', uuid]); return true; },
  };
}

test('a real ringing invite is answered once by its exact UUID, including double-clicks', () => {
  const guard = createIncomingCallGuard(), client = sdk();
  const ticket = guard.begin(client, { callUUID: 'call-a' });
  assert.equal(guard.isCurrent(ticket), true);
  assert.equal(guard.act(client, { callInfo: { callUUID: 'call-a' } }, 'answer').success, true);
  assert.equal(guard.act(client, { callUUID: 'call-a' }, 'answer').success, false);
  assert.deepEqual(client.actions, [['answer', 'call-a']]);
  assert.equal(guard.begin(client, { callUUID: 'call-a' }), null);
});

test('slow lead lookup cannot recreate a cancelled invite even if the SDK list briefly lags', async () => {
  const guard = createIncomingCallGuard(), client = sdk();
  const ticket = guard.begin(client, { callUUID: 'call-a' });
  let finishLookup;
  const lookup = new Promise(resolve => { finishLookup = resolve; });
  let displayed = 'call-a';
  const enrich = lookup.then(() => { if (guard.isCurrent(ticket)) displayed = 'late lead metadata'; });
  guard.clear(client, { callUUID: 'call-a', state: 'canceled' });
  displayed = null;
  finishLookup(); await enrich;
  assert.equal(displayed, null);
  assert.equal(guard.begin(client, { callUUID: 'call-a' }), null);
  assert.equal(guard.act(client, { callUUID: 'call-a' }, 'answer').success, false);
  assert.equal(client.actions.length, 0);
});

test('late metadata and cancellation for one call cannot overwrite a newer invitation', async () => {
  const guard = createIncomingCallGuard(), client = sdk();
  const first = guard.begin(client, { callUUID: 'call-a' });
  client.calls.push({ callUUID: 'call-b', state: 'ringing' });
  const second = guard.begin(client, { callUUID: 'call-b' });
  await Promise.resolve();
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.clear(client, { callUUID: 'call-a' }), false);
  assert.equal(guard.isCurrent(second), true);
  assert.equal(guard.act(client, { callUUID: 'call-a' }, 'reject').success, false);
  assert.equal(guard.isCurrent(second), true);
  assert.equal(guard.act(client, { callUUID: 'call-b' }, 'answer').success, true);
  assert.deepEqual(client.actions, [['answer', 'call-b']]);
});

test('a popup whose invite disappeared never calls SDK answer or creates a connected result', () => {
  const guard = createIncomingCallGuard(), client = sdk();
  guard.begin(client, { callUUID: 'call-a' });
  client.calls.splice(0);
  const result = guard.act(client, { callUUID: 'call-a' }, 'answer');
  assert.equal(result.success, false); assert.equal(result.reason, 'stale');
  assert.equal(client.actions.length, 0); assert.equal(guard.current(), null);
});

test('answered, rejected, ignored, cancelled, failed and ended SDK calls are not answerable', () => {
  for (const state of ['answered', 'rejected', 'ignored', 'canceled', 'cancelled', 'failed', 'ended']) {
    const guard = createIncomingCallGuard(), client = sdk([{ callUUID: 'call-a', state }]);
    assert.equal(guard.begin(client, { callUUID: 'call-a' }), null);
    assert.equal(guard.act(client, { callUUID: 'call-a' }, 'answer').success, false);
    assert.equal(client.actions.length, 0);
  }
});

test('SDK false/throw results are failures and never fall back to answering another call', () => {
  for (const throws of [false, true]) {
    const guard = createIncomingCallGuard(), client = sdk();
    guard.begin(client, { callUUID: 'call-a' });
    client.answer = uuid => { client.actions.push(['answer', uuid]); if (throws) throw new Error('gone'); return false; };
    const result = guard.act(client, { callUUID: 'call-a' }, 'answer');
    assert.equal(result.success, false); assert.equal(result.reason, 'failed');
    assert.equal(guard.current(), null); assert.deepEqual(client.actions, [['answer', 'call-a']]);
  }
});

test('old SDK instances and their cleanup cannot clear invitations owned by the replacement client', () => {
  const guard = createIncomingCallGuard(), firstClient = sdk(), secondClient = sdk([{ callUUID: 'call-b', state: 'ringing' }]);
  const first = guard.begin(firstClient, { callUUID: 'call-a' });
  const second = guard.begin(secondClient, { callUUID: 'call-b' });
  assert.equal(guard.clear(firstClient), false); assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.act(firstClient, { callUUID: 'call-b' }, 'answer').success, false);
  assert.equal(guard.isCurrent(second), true);
  assert.equal(guard.act(secondClient, { callUUID: 'call-b' }, 'reject').success, true);
  assert.deepEqual(firstClient.actions, []); assert.deepEqual(secondClient.actions, [['reject', 'call-b']]);
});

test('an invalid or absent UUID never falls back to the most recent ringing call', () => {
  const guard = createIncomingCallGuard(), client = sdk();
  const ticket = guard.begin(client, { callUUID: 'call-a' });
  assert.equal(guard.begin(client, {}), null);
  assert.equal(guard.act(client, {}, 'answer').success, false);
  assert.equal(client.actions.length, 0);
  // A stale popup with no UUID must not consume the valid invite either.
  assert.equal(guard.isCurrent(ticket), true);
});

test('unavailable SDK inventory fails safely and a subsequent new call still works', () => {
  const guard = createIncomingCallGuard(), client = sdk();
  const ticket = guard.begin(client, { callUUID: 'call-a' });
  client.getIncomingCalls = () => { throw new Error('SDK unavailable'); };
  assert.equal(guard.isCurrent(ticket), false);
  assert.equal(guard.act(client, { callUUID: 'call-a' }, 'answer').success, false);
  assert.equal(client.actions.length, 0);
  client.calls.push({ callUUID: 'call-b', state: 'ringing' });
  client.getIncomingCalls = () => client.calls;
  guard.begin(client, { callUUID: 'call-b' });
  assert.equal(guard.act(client, { callUUID: 'call-b' }, 'answer').success, true);
});
