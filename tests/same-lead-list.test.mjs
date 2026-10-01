import assert from 'node:assert/strict';
import test from 'node:test';
import { sameLeadList } from '../src/utils/sameLeadList.js';

test('equivalent lead arrays do not need another state update', () => {
  const current = [{ id: 1, name: 'A', lead_notes: [{ id: 9, note_text: 'Called' }] }];
  const rebuilt = [{ id: 1, name: 'A', lead_notes: [{ id: 9, note_text: 'Called' }] }];
  assert.equal(sameLeadList(current, current), true);
  assert.equal(sameLeadList(current, rebuilt), true);
  assert.equal(sameLeadList(current, [{ lead_notes: [{ note_text: 'Called', id: 9 }], name: 'A', id: 1 }]), true);
});

test('changed leads and list order still update the visible table', () => {
  const current = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
  assert.equal(sameLeadList(current, [{ id: 1, name: 'Updated' }, current[1]]), false);
  assert.equal(sameLeadList(current, [current[1], current[0]]), false);
  assert.equal(sameLeadList(current, [current[0]]), false);
});
