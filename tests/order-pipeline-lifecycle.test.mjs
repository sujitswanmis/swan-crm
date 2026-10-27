import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('order_pipeline_config.json contains 13 master stages with custom fields and TATs', async () => {
  const configPath = path.join(process.cwd(), 'src', 'config', 'order_pipeline_config.json');
  const content = await fs.readFile(configPath, 'utf-8');
  const data = JSON.parse(content);

  assert.ok(data['TNT00002'], 'TNT00002 tenant config exists');
  const defaultBranch = data['TNT00002']['All Branches'];
  assert.ok(defaultBranch, 'All Branches default config exists');
  assert.equal(defaultBranch.stages.length, 13, 'Contains exactly 13 stages');

  // Verify S01
  const s01 = defaultBranch.stages[0];
  assert.equal(s01.id, 'S01');
  assert.equal(s01.name, 'Order Confirmation');
  assert.equal(s01.allow_modify, true);
  assert.equal(s01.allow_cancel, true);

  // Verify S02 (PI Generation) and S03 (PI Shared)
  const s02 = defaultBranch.stages[1];
  assert.equal(s02.id, 'S02');
  assert.equal(s02.name, 'PI Generation');

  const s03 = defaultBranch.stages[2];
  assert.equal(s03.id, 'S03');
  assert.equal(s03.name, 'PI Shared');

  // Verify S05 (Advance Received)
  const s05 = defaultBranch.stages[4];
  assert.equal(s05.id, 'S05');
  assert.ok(s05.custom_fields.some(f => f.id === 'is_100_percent_paid'));

  // Verify S12 (Dispatch Material)
  const s12 = defaultBranch.stages[11];
  assert.equal(s12.id, 'S12');
  assert.ok(s12.custom_fields.some(f => f.id === 'lr_number'));

  // Verify S13 (Material Delivered)
  const s13 = defaultBranch.stages[12];
  assert.equal(s13.id, 'S13');
  assert.equal(s13.short_code, 'DELIVERED');
});

test('Commercial policies: auto skip balance and partial lot settings are active', async () => {
  const configPath = path.join(process.cwd(), 'src', 'config', 'order_pipeline_config.json');
  const content = await fs.readFile(configPath, 'utf-8');
  const data = JSON.parse(content);
  const cfg = data['TNT00002']['All Branches'];

  assert.equal(cfg.auto_skip_balance_on_full_advance, true);
  assert.equal(cfg.allow_regular_party_credit_waiver, true);
  assert.equal(cfg.allow_partial_split_lots, true);
  assert.equal(cfg.tat_mode, 'DYNAMIC');
});

test('3-Tier stage ownership: all stages have authorized_roles, assigned_emp_id, and assigned_emp_name keys', async () => {
  const configPath = path.join(process.cwd(), 'src', 'config', 'order_pipeline_config.json');
  const content = await fs.readFile(configPath, 'utf-8');
  const data = JSON.parse(content);
  const stages = data['TNT00002']['All Branches'].stages;

  for (const st of stages) {
    assert.ok(Array.isArray(st.authorized_roles), `Stage ${st.id} has authorized_roles array`);
    assert.equal(typeof st.assigned_emp_id, 'string', `Stage ${st.id} has assigned_emp_id string`);
    assert.equal(typeof st.assigned_emp_name, 'string', `Stage ${st.id} has assigned_emp_name string`);
  }
});
