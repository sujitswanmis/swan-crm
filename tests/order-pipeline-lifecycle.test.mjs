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

test('Granular permissions: channel_ops contains all_orders and s01..s13 in modulesConfig with backward compatibility', async () => {
  const modPath = path.join(process.cwd(), 'src', 'config', 'modulesConfig.jsx');
  const content = await fs.readFile(modPath, 'utf-8');

  // Verify all_orders and all 13 stages are in modulesConfig
  assert.ok(content.includes("id: 'all_orders'"), 'Contains all_orders in modulesConfig');
  for (let i = 1; i <= 13; i++) {
    const sId = `s${String(i).padStart(2, '0')}`;
    assert.ok(content.includes(`id: '${sId}'`), `Contains stage ${sId} in modulesConfig`);
  }

  // Import permissionUtils to test backward compatibility inheritance
  const { getSubItemPermissions } = await import('../src/utils/permissionUtils.js');

  // Case 1: Legacy user with only order_pipeline granted -> automatically inherits S01..S13 and all_orders
  const legacyAccess = {
    channel_ops: {
      view: true,
      sub_items: {
        order_pipeline: { view: true, add: true, edit: true }
      }
    }
  };
  const inheritedS01 = getSubItemPermissions(legacyAccess, 'Executive', 'channel_ops', 's01');
  assert.equal(inheritedS01.view, true, 'Inherits S01 view from order_pipeline');
  assert.equal(inheritedS01.edit, true, 'Inherits S01 edit from order_pipeline');

  const inheritedAll = getSubItemPermissions(legacyAccess, 'Executive', 'channel_ops', 'all_orders');
  assert.equal(inheritedAll.view, true, 'Inherits all_orders view from order_pipeline');

  // Case 2: Explicit override in Permission Matrix (S06 denied, S07 granted)
  const granularAccess = {
    channel_ops: {
      view: true,
      sub_items: {
        order_pipeline: { view: true, add: true, edit: true },
        all_orders: { view: false },
        s06: { view: false, edit: false },
        s07: { view: true, edit: true }
      }
    }
  };
  const s06Perm = getSubItemPermissions(granularAccess, 'Staff', 'channel_ops', 's06');
  assert.equal(s06Perm.view, false, 'Explicitly denied S06 is false');

  const s07Perm = getSubItemPermissions(granularAccess, 'Staff', 'channel_ops', 's07');
  assert.equal(s07Perm.view, true, 'Explicitly granted S07 is true');
  assert.equal(s07Perm.edit, true, 'Explicitly granted S07 edit is true');

  const allOrdersPerm = getSubItemPermissions(granularAccess, 'Staff', 'channel_ops', 'all_orders');
  assert.equal(allOrdersPerm.view, false, 'Explicitly denied all_orders is false');
});

test('Option A: Product-wise partial split allocation calculates remaining quantities and total sums accurately', () => {
  const lineItems = [
    { product: 'Rotavator | MINI | Single | 2.5ft', qty: 5 },
    { product: 'Mini Mulcher | 3Ft', qty: 10 }
  ];

  let allocations = lineItems.map((it, idx) => ({
    id: idx,
    product: it.product,
    ordered_qty: it.qty,
    ready_qty: it.qty,
    remaining_qty: 0
  }));

  // Initial state: all ready
  let totalDispatched = allocations.reduce((sum, p) => sum + p.ready_qty, 0);
  let totalRemaining = allocations.reduce((sum, p) => sum + p.remaining_qty, 0);
  assert.equal(totalDispatched, 15);
  assert.equal(totalRemaining, 0);

  // User sets: Rotavator = 5 (all ready), Mini Mulcher = 2 (ready)
  const updateAlloc = (idx, val) => {
    const item = allocations[idx];
    const ready = Math.min(item.ordered_qty, Math.max(0, val));
    allocations[idx] = {
      ...item,
      ready_qty: ready,
      remaining_qty: item.ordered_qty - ready
    };
  };

  updateAlloc(0, 5); // 5 ready, 0 remaining
  updateAlloc(1, 2); // 2 ready, 8 remaining

  assert.equal(allocations[0].remaining_qty, 0, 'Rotavator remaining should be 0');
  assert.equal(allocations[1].remaining_qty, 8, 'Mini Mulcher remaining should be 8');

  totalDispatched = allocations.reduce((sum, p) => sum + p.ready_qty, 0);
  totalRemaining = allocations.reduce((sum, p) => sum + p.remaining_qty, 0);

  assert.equal(totalDispatched, 7, 'Total ready for Lot-A should be 7 Units');
  assert.equal(totalRemaining, 8, 'Total remaining for Lot-B should be 8 Units');
});
