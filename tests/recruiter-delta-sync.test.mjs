import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const actor = 'aaaaaaaa-0000-4000-8000-000000000001';
const other = 'aaaaaaaa-0000-4000-8000-000000000002';
const tenant = 'bbbbbbbb-0000-4000-8000-000000000001';
const opening = 'cccccccc-0000-4000-8000-000000000001';
const candidate = 'dddddddd-0000-4000-8000-000000000001';
const branch = 'TNT00003-B0001';
const cacheScope = { userId: actor, tenantId: tenant, filter: branch, permissions: 'manager' };
const clone = value => JSON.parse(JSON.stringify(value));

async function load(path, mocks, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
  } }).outputText;
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports, console, ...globals,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name)
  });
  return module.exports;
}

async function loadClient({ online = false, enqueue, apply } = {}) {
  return load('../src/utils/recruiterLocalDb.js', {
    '@/app/actions/recruitment': { applyRecruiterMutation: apply },
    '@/utils/offlineSync': { canPerformOfflineAction: () => ({ allowed: true }), enqueueOfflineAction: enqueue }
  }, { navigator: { onLine: online }, crypto: { randomUUID } });
}

test('Recruiter cache keys isolate account, role, branch and candidate history', async () => {
  const { recruiterScopeKey } = await loadClient();
  const key = recruiterScopeKey(cacheScope);
  assert.notEqual(key, recruiterScopeKey({ ...cacheScope, userId: other }));
  assert.notEqual(key, recruiterScopeKey({ ...cacheScope, permissions: 'viewer' }));
  assert.notEqual(key, recruiterScopeKey({ ...cacheScope, filter: 'All' }));
  assert.notEqual(key, recruiterScopeKey({ ...cacheScope, candidateId: candidate }));
  assert.equal(recruiterScopeKey({ tenantId: tenant }), '');
});

test('a delta replaces one candidate without dropping the others', async () => {
  const { mergeRecruiterRows } = await loadClient();
  const row = { id: candidate, name: 'Candidate', position_id: opening };
  const initial = { positions: [{ id: opening, title: 'Vacancy' }], candidates: [row, { ...row, id: other }] };
  const updated = { ...row, current_stage: 'S03' };
  const result = mergeRecruiterRows(initial, [{ entity: 'candidates', id: candidate, row: updated }]);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates.find(item => item.id === candidate).current_stage, 'S03');
  assert.equal(result.candidates.find(item => item.id === other).current_stage, undefined);
});

test('a vacancy tombstone removes its candidates and a renamed vacancy refreshes candidate labels', async () => {
  const { mergeRecruiterRows } = await loadClient();
  const initial = {
    positions: [{ id: opening, title: 'Old title' }],
    candidates: [{ id: candidate, position_id: opening, recruitment_positions: { title: 'Old title' } }]
  };
  const rename = mergeRecruiterRows(initial, [{ entity: 'positions', id: opening, row: { id: opening, title: 'New title' } }]);
  assert.equal(rename.candidates[0].recruitment_positions.title, 'New title');
  assert.equal(mergeRecruiterRows(rename, [{ entity: 'positions', id: opening, row: null }]).candidates.length, 0);
});

test('a lost server response queues the identical mutation for a safe retry', async () => {
  let sent;
  let queued;
  const { submitRecruiterChange } = await loadClient({
    online: true,
    apply: async request => { sent = request; throw new Error('lost response'); },
    enqueue: async (operation, entity, request) => { queued = { operation, entity, request }; return 'committed'; }
  });
  const response = await submitRecruiterChange(cacheScope, 'candidate:save', { id: candidate, candidate_status: 'Joined' });
  assert.equal(response.queued, true);
  assert.equal(queued.entity, 'recruiter');
  assert.equal(queued.request, sent);
  assert.equal(sent.scope.userId, actor);
});

test('separate offline notes receive unique IDs and uncommitted entries fail visibly', async () => {
  const queued = [];
  const { submitRecruiterChange } = await loadClient({
    enqueue: async (_, entity, item) => {
      queued.push({ entity, item });
      return queued.length < 2 ? 'committed' : null;
    }
  });
  const save = () => submitRecruiterChange(cacheScope, 'note:add', { candidate_id: candidate, note_text: 'Interview' }, { candidateId: candidate });
  assert.equal((await save()).queued, true);
  assert.equal((await save()).success, false);
  assert.notEqual(queued[0].item.payload.id, queued[1].item.payload.id);
  assert.equal(queued[0].item.payload.candidate_id, candidate);
});

function testDb({ existing } = {}) {
  const calls = [];
  const parent = { id: opening, tenant_id: tenant, branch_code: branch, status: 'S01', title: 'Example' };
  const row = { id: candidate, position_id: opening, current_stage: 'S02', updated_at: '2026-11-22T04:00:00+00:00', recruitment_positions: parent };
  const tables = {
    user_roles: [{ user_id: actor, tenant_id: tenant, role: 'admin', can_read: true, can_write: true }],
    tenants: [{ id: tenant, tenant_code: 'TNT00003', name: 'Example', status: 'ACTIVE' }],
    tenant_branches: [{ tenant_id: tenant, branch_code: branch, is_active: true }],
    recruiter_sync_clock: [{ tenant_id: tenant, revision: 7 }],
    recruiter_sync_changes: [{ tenant_id: tenant, revision: 7, entity: 'candidates', row_id: candidate }],
    recruitment_positions: [parent],
    recruitment_candidates: [row],
    recruiter_mutation_receipts: existing ? [{ ...existing, user_id: actor }] : []
  };
  const db = {
    from(table) {
      const filters = [];
      let single, limit;
      const get = (row, field) => field.split('.').reduce((value, name) => value?.[name], row);
      const filter = (field, value, compare) => {
        filters.push(row => compare(get(row, field), value));
        return query;
      };
      const query = {
        select() { return this; },
        eq: (field, value) => filter(field, value, (a, b) => a === b),
        neq: (field, value) => filter(field, value, (a, b) => a !== b),
        gt: (field, value) => filter(field, value, (a, b) => a > b),
        lte: (field, value) => filter(field, value, (a, b) => a <= b),
        in: (field, value) => filter(field, value, (a, b) => b.includes(a)),
        order() { return this; },
        limit(value) { limit = value; return this; },
        maybeSingle() { single = true; return this; },
        then(resolve, reject) {
          calls.push(table);
          const rows = (tables[table] || []).filter(item => filters.every(fn => fn(item))).slice(0, limit);
          return Promise.resolve({ data: single ? rows[0] || null : rows }).then(resolve, reject);
        }
      };
      return query;
    },
    async rpc(name, params) {
      calls.push({ name, params });
      return { data: { ...params.p_payload, id: params.p_id } };
    }
  };
  return { db, calls, row };
}

async function loadServer(db) {
  return load('../src/app/actions/recruitment.js', {
    '@supabase/supabase-js': { createClient: () => db },
    './recruiterConfig': {},
    '@/utils/supabase/server': { createClient: async () => ({ auth: {
      getUser: async () => ({ data: { user: { id: actor, email: 'example@example.test' } } })
    } }) },
    '@/utils/branchAccess': { getUserBranchAccess: () => ({ isAllBranches: true }) },
    '@/utils/permissionUtils': {
      checkIsAdminRole: () => true,
      checkIsMasterAdmin: () => false,
      getModulePermissions: () => ({ view: true }),
      getSubItemPermissions: () => ({ view: true, edit: true, add: true })
    }
  }, { process: { env: {} } });
}

test('snapshot and delta are scoped, and a delta fetches only the changed table rows', async () => {
  const { db, calls } = testDb();
  const { readRecruiterSync } = await loadServer(db);
  const initial = await readRecruiterSync(cacheScope);
  assert.equal(initial.success, true);
  assert.equal(initial.changes[0].id, opening);
  const second = await readRecruiterSync({ ...cacheScope, continuation: initial.continuation });
  assert.equal(second.changes[0].id, candidate);
  calls.length = 0;
  const next = await readRecruiterSync({ ...cacheScope, cursor: '6', token: initial.token });
  assert.deepEqual(clone(next.changes.map(change => [change.entity, change.id])), [['candidates', candidate]]);
  assert.equal(next.cursor, '7');
  assert.ok(!calls.includes('recruitment_positions'));
  assert.deepEqual(clone(await readRecruiterSync({ ...cacheScope, token: 'stale-role' })), { success: true, reset: true });
  assert.equal((await readRecruiterSync({ ...cacheScope, userId: other })).code, 'denied');
});

test('mutation replay checks the real user, restricts stage jumps and uses a transactional receipt', async () => {
  const id = randomUUID();
  const { db, calls, row } = testDb();
  const { applyRecruiterMutation } = await loadServer(db);
  const form = { scope: cacheScope, mutationId: id, operation: 'candidate:save',
    payload: { id: candidate, current_stage: 'S03' }, note: 'Interview scheduled' };
  assert.equal((await applyRecruiterMutation({ ...form, scope: { ...cacheScope, userId: other } })).code, 'denied');
  assert.equal((await applyRecruiterMutation({ ...form, payload: { id: candidate, current_stage: 'S07' } })).code, 'denied');
  assert.equal((await applyRecruiterMutation(form)).success, true);
  const rpc = calls.find(call => call.name === 'recruiter_apply_mutation');
  assert.equal(rpc.params.p_mutation, id);
  assert.equal(rpc.params.p_expected, row.updated_at);
  assert.equal(rpc.params.p_note, 'Interview scheduled');

  const duplicate = testDb({ existing: { mutation_id: id, tenant_id: tenant, entity: 'candidates', row_id: candidate } });
  const retry = await loadServer(duplicate.db);
  assert.equal((await retry.applyRecruiterMutation(form)).success, true);
  assert.ok(!duplicate.calls.some(call => call.name === 'recruiter_apply_mutation'));
});
