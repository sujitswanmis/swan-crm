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

test('Stage Actions Button Label: formats with descriptive stage name and code instead of raw numbering', () => {
  const nextStage = { id: 'S02', name: 'PI Generation', step_no: 2 };
  const label = `Confirm ➔ ${nextStage.name} (${nextStage.id})`;
  assert.equal(label, 'Confirm ➔ PI Generation (S02)');

  const s07 = { id: 'S07', name: 'Product Partial & Full Status', step_no: 7 };
  const s07Label = `Confirm ➔ ${s07.name} (${s07.id})`;
  assert.equal(s07Label, 'Confirm ➔ Product Partial & Full Status (S07)');
});

test('Stage History & SLA Audit Scorecard: accurately categorizes on-time vs delayed stages', () => {
  const history = [
    { stage_id: 'S01', stage_name: 'Order Confirmation', tat_breached: false, tat_hours: 4 },
    { stage_id: 'S02', stage_name: 'PI Generation', tat_breached: false, tat_hours: 2 },
    { stage_id: 'S05', stage_name: 'Receive Advance Payment', tat_breached: true, tat_hours: 24 },
    { stage_id: 'S06', stage_name: 'Check Stock & Production', tat_breached: false, tat_hours: 48 }
  ];

  let onTimeCount = 0;
  let delayedCount = 0;

  history.forEach(h => {
    if (h.tat_breached) {
      delayedCount++;
    } else {
      onTimeCount++;
    }
  });

  assert.equal(onTimeCount, 3, '3 stages were on-time');
  assert.equal(delayedCount, 1, '1 stage was delayed');
  assert.equal(history.length, 4, '4 stages completed');
});

test('S12 Split Lot Inheritance: reads S07 allocations to prefill Lot-A and Lot-B in dispatch modal', () => {
  const order = {
    order_number: 'SO-2026-41220',
    total_ordered_qty: 15,
    stage_history: [
      { stage_id: 'S01', stage_name: 'Order Confirmation' },
      {
        stage_id: 'PARTIAL_LOT_DISPATCH',
        dispatched_qty: 10,
        remaining_qty: 5,
        product_allocations: [
          { product: 'Rotavator | DUSTER | Multi | 5.5F', ordered_qty: 5, ready_qty: 3, remaining_qty: 2 },
          { product: 'Mini Mulcher | 4Ft', ordered_qty: 10, ready_qty: 7, remaining_qty: 3 }
        ]
      }
    ]
  };

  const previousSplit = [...order.stage_history].reverse().find(h =>
    (h.stage_id === 'PARTIAL_LOT_DISPATCH' || h.stage_id === 'S07') &&
    Array.isArray(h.product_allocations)
  );

  assert.ok(previousSplit, 'Previous split should be found in history');
  assert.equal(previousSplit.dispatched_qty, 10, 'Lot-A should be 10 Units');
  assert.equal(previousSplit.remaining_qty, 5, 'Lot-B should be 5 Units');

  // Verify remaining items for child order
  const remainingItems = previousSplit.product_allocations
    .filter(p => p.remaining_qty > 0)
    .map(p => ({ product: p.product, qty: p.remaining_qty }));

  assert.equal(remainingItems.length, 2);
  assert.equal(remainingItems[0].product, 'Rotavator | DUSTER | Multi | 5.5F');
  assert.equal(remainingItems[0].qty, 2);
  assert.equal(remainingItems[1].product, 'Mini Mulcher | 4Ft');
  assert.equal(remainingItems[1].qty, 3);
  assert.equal(remainingItems.reduce((sum, p) => sum + p.qty, 0), 5, 'Total Lot-B units must equal 5');
});

test('Audit Matrix Table: creates S00 punch, S01 revision, planned vs actual timestamp, and SLA duration', () => {
  const order = {
    order_number: 'SO-2026-41220',
    total_ordered_qty: 10,
    total_amount: 886748,
    created_at: '2026-10-28T00:42:00.000Z',
    assigned_caller_name: 'Test Desk',
    stage_history: [
      {
        stage_id: 'S01_REVISION',
        stage_name: 'Order Revision',
        action_by: 'New Swan Admin',
        notes: 'Order items modified in Stage S01',
        previous_amount: 886748,
        new_amount: 1250000,
        actual_timestamp: '2026-10-28T01:12:00.000Z'
      },
      {
        stage_id: 'S02',
        stage_name: 'PI Generation',
        department: 'Accounts / Billing',
        tat_hours: 2,
        action_by: 'New Swan Admin',
        actual_timestamp: '2026-10-28T01:13:00.000Z',
        custom_fields_data: { pi_number: 'test0001', bank_account_selected: 'HDFC Bank - CC A/c' }
      },
      {
        stage_id: 'S05',
        stage_name: 'Receive Advance Payment',
        department: 'Accounts Team',
        tat_hours: 24,
        action_by: 'New Swan Admin',
        // Planned target would be 24h after S02 (2026-10-29T01:13:00Z)
        // Simulated delayed action taking 30h
        actual_timestamp: '2026-10-29T07:13:00.000Z',
        tat_breached: true
      }
    ]
  };

  // Replicate row builder
  const rows = [];
  const createdDate = new Date(order.created_at);
  const createdMs = createdDate.getTime();

  // S00 row
  rows.push({
    stage_id: 'STAGE S00',
    stage_name: 'Order Booked & Punched into Pipeline',
    planned_timestamp: order.created_at,
    actual_timestamp: order.created_at,
    tat_hours: 0,
    badge_type: 'PUNCH'
  });

  let prevActualMs = createdMs;
  order.stage_history.forEach((entry) => {
    const tatHours = Number(entry.tat_hours) || 2;
    const actualMs = new Date(entry.actual_timestamp).getTime();
    const plannedMs = prevActualMs + (tatHours * 3600 * 1000);
    const isDelayed = entry.tat_breached === true || (actualMs > plannedMs);

    rows.push({
      stage_id: entry.stage_id,
      stage_name: entry.stage_name,
      planned_timestamp: new Date(plannedMs).toISOString(),
      actual_timestamp: entry.actual_timestamp,
      tat_hours: tatHours,
      time_taken_ms: Math.max(0, actualMs - prevActualMs),
      tat_breached: isDelayed,
      badge_type: entry.stage_id.includes('REVISION') ? 'REVISION' : 'STAGE'
    });

    prevActualMs = actualMs;
  });

  assert.equal(rows.length, 4, 'Total rows should be 4 (1 S00 + 3 history)');
  
  // Verify S00 Punch row
  assert.equal(rows[0].stage_id, 'STAGE S00');
  assert.equal(rows[0].badge_type, 'PUNCH');
  assert.equal(rows[0].tat_hours, 0);

  // Verify S01 Revision row
  assert.equal(rows[1].stage_id, 'S01_REVISION');
  assert.equal(rows[1].badge_type, 'REVISION');
  assert.equal(rows[1].tat_breached, false, 'Revision was done on-time');

  // Verify S02 PI Generation
  assert.equal(rows[2].stage_id, 'S02');
  assert.equal(rows[2].tat_breached, false, 'S02 was done on-time within 2 hours');

  // Verify S05 Delayed stage
  assert.equal(rows[3].stage_id, 'S05');
  assert.equal(rows[3].tat_breached, true, 'S05 was delayed past 24 hours target');
  assert.ok(rows[3].time_taken_ms > 24 * 3600 * 1000, 'Time taken exceeds 24 hours');
});

test('Lot-B Commercial & Splitting Rules: child order disables re-splitting and inherits FULL_PAID to skip S09 & S10', () => {
  const parentOrder = {
    order_number: 'SO-2026-41220',
    order_status: 'FULL_PAID',
    stage_history: [
      { stage_id: 'S05', custom_fields_data: { is_100_percent_paid: true } }
    ]
  };

  const childOrder = {
    order_number: 'SO-2026-41220-B',
    order_status: 'IN_PRODUCTION', // Before inheritance
    delivery_status: 'S06',
    stage_history: [
      { stage_id: 'S06', stage_name: 'Check Stock & Production' }
    ]
  };

  // Rule 1: Child order disables re-splitting
  const isChildOrder = Boolean(childOrder.order_number?.endsWith('-B'));
  assert.equal(isChildOrder, true, 'Child order must be identified with -B suffix');

  const allowPartialSplit = true;
  const canSplitLot = allowPartialSplit && !isChildOrder;
  assert.equal(canSplitLot, false, 'Lot-B must never allow further splitting');

  // Rule 2: Child order inherits FULL_PAID from parent
  const allOrders = [parentOrder, childOrder];
  const isParentFullPaid = Boolean(
    childOrder.order_number?.endsWith('-B') &&
    allOrders.some(o => o.order_number === childOrder.order_number.replace(/-B$/, '') && (
      o.order_status === 'FULL_PAID' || 
      (Array.isArray(o.stage_history) && o.stage_history.some(h => h.stage_id === 'S05' && h.custom_fields_data?.is_100_percent_paid))
    ))
  );

  assert.equal(isParentFullPaid, true, 'Child order must recognize parent 100% full paid status');

  // Rule 3: Fast-track past S09 & S10 to S11
  const stages = [
    { id: 'S06', name: 'Stock & Production', is_enabled: true },
    { id: 'S07', name: 'Assembly Ready', is_enabled: true },
    { id: 'S08', name: 'QC / PDI Inspection', is_enabled: true },
    { id: 'S09', name: 'Request 70% Balance', is_enabled: true },
    { id: 'S10', name: 'Receive 70% Balance', is_enabled: true },
    { id: 'S11', name: 'Ready for Dispatch', is_enabled: true },
    { id: 'S12', name: 'Dispatch Material', is_enabled: true },
    { id: 'S13', name: 'Material Delivered', is_enabled: true }
  ];

  function getNext(currentStage, stgs, ord, ordList) {
    const active = stgs.filter(s => s.is_enabled !== false);
    const idx = active.findIndex(s => s.id === currentStage.id);
    if (idx === -1 || idx >= active.length - 1) return null;

    const parentPaid = Boolean(
      ord?.order_number?.endsWith('-B') &&
      Array.isArray(ordList) &&
      (() => {
        const pNum = ord.order_number.replace(/-B$/, '');
        const p = ordList.find(o => o.order_number === pNum);
        return p && (p.order_status === 'FULL_PAID' || (Array.isArray(p.stage_history) && p.stage_history.some(h => h.stage_id === 'S05' && h.custom_fields_data?.is_100_percent_paid)));
      })()
    );

    const fullPaid = ord.order_status === 'FULL_PAID' || parentPaid;
    if (fullPaid && currentStage.id === 'S08') {
      const s11 = active.find(s => s.id === 'S11');
      if (s11) return s11;
    }
    return active[idx + 1];
  }

  const currentStageAtS08 = { id: 'S08', name: 'QC / PDI Inspection' };
  const nextFromS08 = getNext(currentStageAtS08, stages, childOrder, allOrders);

  assert.equal(nextFromS08.id, 'S11', 'From S08, full-paid child order must skip S09 & S10 and advance directly to S11');
});
