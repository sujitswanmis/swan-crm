import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { plannedCompletion, tatHours, formatWorkflowIST, workflowVariance } from '../src/utils/workflowTiming.mjs';

const startedAt = '2026-10-06T09:00:00+05:30';
const previousPlannedEnd = '2026-10-06T11:00:00+05:30';
const previousActualEnd = '2026-10-06T13:00:00+05:30';

test('first stage is planned from instance start in either mode', () => {
  for (const mode of ['ACTUAL_PLUS_TAT', 'PLANNED_PLUS_TAT']) {
    assert.equal(plannedCompletion({ mode, startedAt, hours: 2 }), '2026-10-06T05:30:00.000Z');
  }
});
test('a late handover changes only actual-based plans', () => {
  const args = { startedAt, previousPlannedEnd, previousActualEnd, hours: 2 };
  assert.equal(plannedCompletion(args), '2026-10-06T09:30:00.000Z');
  assert.equal(plannedCompletion({ ...args, mode: 'PLANNED_PLUS_TAT' }), '2026-10-06T07:30:00.000Z');
});
test('minute TAT remains exact and day TAT crosses IST midnight', () => {
  assert.equal(plannedCompletion({ startedAt, hours: tatHours(1, 'MINUTES') }), '2026-10-06T03:31:00.000Z');
  const end = plannedCompletion({ startedAt: '2026-10-06T23:45:00+05:30', hours: tatHours(1, 'DAYS') });
  assert.equal(end, '2026-10-07T18:15:00.000Z');
  assert.match(formatWorkflowIST(end), /07 Oct 2026.*11:45:00.*pm IST/i);
});
test('invalid TAT, modes and timezone-free timestamps are rejected', () => {
  for (const value of [0, -1, NaN, Infinity, 'bad', 10000]) assert.throws(() => tatHours(value));
  assert.throws(() => tatHours(1, 'WEEKS'));
  assert.throws(() => plannedCompletion({ startedAt, hours: 1, mode: 'UNKNOWN' }));
  assert.throws(() => plannedCompletion({ startedAt: '2026-10-06T09:00:00', hours: 1 }));
});
test('variance shows late, early, on-time and overdue work', () => {
  assert.equal(workflowVariance(previousPlannedEnd, previousActualEnd), '120 min late');
  assert.equal(workflowVariance(previousActualEnd, previousPlannedEnd), '120 min early');
  assert.equal(workflowVariance(previousActualEnd, previousActualEnd), 'On time');
  assert.equal(workflowVariance(previousPlannedEnd, null, previousActualEnd), '120 min overdue');
  assert.equal(workflowVariance(previousActualEnd, null, previousPlannedEnd), 'Within TAT');
});

// Optional real PostgreSQL/WASM integration checks, with no production writes.
// WORKFLOW_PGLITE_RUNTIME points to the externally installed PGlite module.
test('workflow migration preserves templates and advances runs atomically', {
  skip: !process.env.WORKFLOW_PGLITE_RUNTIME,
}, async (t) => {
  const { PGlite } = await import(pathToFileURL(process.env.WORKFLOW_PGLITE_RUNTIME).href);
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE tenants(id uuid PRIMARY KEY); CREATE TABLE designations(id uuid PRIMARY KEY);
      CREATE TABLE employees(id uuid PRIMARY KEY); CREATE TABLE party_master(id uuid PRIMARY KEY);
      INSERT INTO tenants VALUES ('00000000-0000-0000-0000-000000000001');`);
    const original = await readFile(new URL('../migrations/09_10_phase_9_10_target_workflow.sql', import.meta.url), 'utf8');
    await db.exec(original.slice(original.indexOf('-- 3. UNIVERSAL WORKFLOW')));
    const migration = await readFile(new URL('../migrations/27_workflow_timing_persistence.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Safe to apply again.
    const tenant = '00000000-0000-0000-0000-000000000001';
    const call = async (sql, params) => (await db.query(sql, params)).rows[0];
    for (const mode of ['ACTUAL_PLUS_TAT', 'PLANNED_PLUS_TAT']) {
      await t.test(mode, async () => {
        const definition = { workflow_name: 'Test workflow', workflow_code: mode, category: 'SALES', planning_mode: mode,
          stages: [{ stage_name: 'Entry', stage_code: 'S00', execution_type: 'SEQUENTIAL', planned_tat_hours: 1 / 60,
            tat_value: 1, tat_unit: 'MINUTES', fields: [{ field_name: 'Quantity', field_key: 'quantity', data_type: 'NUMBER', is_required: true }] },
          { stage_name: 'Dispatch', stage_code: 'S01', execution_type: 'SEQUENTIAL', planned_tat_hours: 2, fields: [] }] };
        const { id: workflowId } = await call('SELECT crm_save_workflow($1,$2) AS id', [tenant, definition]);
        const { id: versionId } = await call('SELECT id FROM workflow_versions WHERE workflow_id=$1', [workflowId]);
        const context = { request_key: crypto.randomUUID(), reference_no: 'TEST', customer_name: 'Internal test' };
        const { id: instanceId } = await call('SELECT crm_start_workflow($1,$2,$3) AS id', [tenant, versionId, context]);
        assert.equal((await call('SELECT crm_start_workflow($1,$2,$3) AS id', [tenant, versionId, context])).id, instanceId);
        let runs = (await db.query('SELECT * FROM stage_instances WHERE workflow_instance_id=$1 ORDER BY actual_start NULLS LAST', [instanceId])).rows;
        const first = runs.find(r => r.status === 'IN_PROGRESS');
        assert.equal(Date.parse(first.planned_end) - Date.parse(first.actual_start), 60000);
        assert.equal(runs.filter(r => r.status === 'PENDING').length, 1);
        if (mode === 'ACTUAL_PLUS_TAT') assert.equal(runs.find(r => r.status === 'PENDING').planned_end, null);
        await assert.rejects(call('SELECT crm_advance_workflow($1,$2,$3,$4)', [tenant, instanceId, first.id, {}]), /required stage fields/);
        assert.equal((await call('SELECT status FROM stage_instances WHERE id=$1', [first.id])).status, 'IN_PROGRESS');
        await db.query("UPDATE stage_instances SET planned_end=clock_timestamp()-interval '2 hours' WHERE id=$1", [first.id]);
        await db.query("UPDATE workflow_definitions SET planning_mode=$2,workflow_name='Changed template' WHERE id=$1", [workflowId,
          mode === 'ACTUAL_PLUS_TAT' ? 'PLANNED_PLUS_TAT' : 'ACTUAL_PLUS_TAT']);
        await call('SELECT crm_advance_workflow($1,$2,$3,$4)', [tenant, instanceId, first.id, { quantity: 5 }]);
        runs = (await db.query('SELECT * FROM stage_instances WHERE workflow_instance_id=$1', [instanceId])).rows;
        const completed = runs.find(r => r.id === first.id);
        const next = runs.find(r => r.status === 'IN_PROGRESS');
        assert.equal(completed.stage_data_json.quantity, 5);
        const base = mode === 'ACTUAL_PLUS_TAT' ? completed.actual_end : completed.planned_end;
        assert.equal(Date.parse(next.planned_end) - Date.parse(base), 7200000);
        const inst = await call('SELECT * FROM workflow_instances WHERE id=$1', [instanceId]);
        assert.equal(inst.s00_context_json.planning_mode, mode);
        assert.equal(inst.s00_context_json.workflow_name, 'Test workflow');
        // Retry of the completed stage must not complete the second stage.
        await call('SELECT crm_advance_workflow($1,$2,$3,$4)', [tenant, instanceId, first.id, { quantity: 5 }]);
        assert.equal((await call('SELECT status FROM stage_instances WHERE id=$1', [next.id])).status, 'IN_PROGRESS');
        await assert.rejects(call('SELECT crm_advance_workflow($1,$2,$3,$4)', [crypto.randomUUID(), instanceId, next.id, {}]), /not found/);
        await call('SELECT crm_advance_workflow($1,$2,$3,$4)', [tenant, instanceId, next.id, {}]);
        const done = await call('SELECT * FROM workflow_instances WHERE id=$1', [instanceId]);
        assert.equal(done.instance_status, 'COMPLETED');
        assert.ok(done.completed_at);
        assert.equal((await call('SELECT count(*)::int AS count FROM stage_instances WHERE workflow_instance_id=$1 AND status=\'COMPLETED\'', [instanceId])).count, 2);
        // Reordering and repeated saves keep UUIDs and the existing unique-order constraint.
        const stages = (await db.query('SELECT * FROM workflow_stages WHERE workflow_version_id=$1 ORDER BY stage_order', [versionId])).rows;
        const metadata = { id: workflowId, workflow_name: 'Reordered', workflow_code: mode, planning_mode: mode,
          stages: [...stages].reverse() };
        await call('SELECT crm_save_workflow($1,$2)', [tenant, metadata]);
        await call('SELECT crm_save_workflow($1,$2)', [tenant, metadata]);
        assert.equal((await call('SELECT id FROM workflow_stages WHERE workflow_version_id=$1 AND stage_order=1', [versionId])).id, stages[1].id);
        metadata.expected_updated_at = '2000-01-01T00:00:00Z';
        await assert.rejects(call('SELECT crm_save_workflow($1,$2)', [tenant, metadata]), /another session/);
      });
    }
  } finally { await db.close(); }
});
