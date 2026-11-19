import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billing, harness, postgres, operation, PGlite, TENANT, ACTOR, USER, REQUEST } from './saas-access.test.mjs';

test('IST date-only expiry ends on the selected date and invalid dates are rejected', () => {
  assert.equal(billing.saasEndOfDay('2026-12-01').toISOString(), '2026-12-01T18:29:59.999Z');
  assert.throws(() => billing.saasEndOfDay('2026-02-31'));
  assert.equal(billing.saasDateKey('2026-11-15T20:00:00Z'), '2026-11-16');
});
test('month-end renewals clamp in IST without overflowing February', () => {
  assert.equal(billing.saasAddMonths('2028-01-31T23:59:59+05:30', 1).toISOString(), '2028-02-29T18:29:59.000Z');
  assert.equal(billing.saasAddMonths('2027-01-31T23:59:59+05:30', 1).toISOString(), '2027-02-28T18:29:59.000Z');
});
test('negative, fractional seats and out-of-range discounts are rejected', () => {
  for (const seats of [-1, 1.5, Infinity]) assert.throws(() => billing.calculateSaasPrice({ items: [], seats, months: 12 }));
  assert.throws(() => billing.calculateSaasPrice({ items: [], seats: 5, months: 12, discountPercent: 101 }));
  assert.equal(billing.saasInvoiceAmounts(10.25, 'IGST').total_payable, 12.1);
  assert.equal(billing.saasInvoiceAmounts(10.25, 'NON_GST').tax_amount, 0);
  const split = billing.saasInvoiceTotals(10.25, 'CGST_SGST');
  assert.equal(split.cgst, 0.93);
  assert.equal(split.sgst, 0.92);
  assert.equal(Math.round((split.cgst + split.sgst) * 100) / 100, split.tax_amount);
});
test('failed billing RPC never returns payment success or makes separate writes', async () => {
  const { actions, calls } = harness({ rpc: async () => ({ data: null, error: { message: 'Ledger failed' } }) });
  const result = await actions.recordPaymentAndGenerateInvoice({ tenantId: TENANT, amount: 100, requestId: REQUEST });
  assert.equal(result.success, false);
  assert.match(result.error, /Ledger failed/);
  assert.equal(calls.filter(q => ['insert','upsert','update'].includes(q.operation)).length, 0);
});
test('missing migration blocks writes with a useful error', async () => {
  const { actions } = harness();
  const result = await actions.updateTenantSeats(TENANT, 10, REQUEST);
  assert.equal(result.success, false);
  assert.match(result.error, /migration 54/);
});

test('PostgreSQL: early renewal preserves remaining paid validity and persists an invoice', { skip: !PGlite }, async () => {
  const db = await postgres();
  try {
    const result = await operation(db, 'RENEWAL', { amount: 100, months: 12, gst_type: 'IGST' });
    assert.equal(new Date(result.newExpiry).toISOString(), '2029-12-31T18:29:59.000Z');
    assert.equal(result.invoice.tax_amount, 18);
    assert.equal(result.invoice.total_payable, 118);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM saas_billing_events')).rows[0].n, 1);
  } finally { await db.close(); }
});
test('PostgreSQL: concurrent duplicate requests reuse one invoice; changed details are rejected', { skip: !PGlite }, async () => {
  const db = await postgres();
  try {
    const payload = { amount: 100, months: 1, gst_type: 'NON_GST' };
    const [a,b] = await Promise.all([operation(db,'RENEWAL',payload), operation(db,'RENEWAL',payload)]);
    assert.equal(a.invoice.invoice_number, b.invoice.invoice_number);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM saas_billing_events')).rows[0].n, 1);
    await assert.rejects(operation(db, 'RENEWAL', { ...payload, amount: 101 }), /different details/);
  } finally { await db.close(); }
});
test('PostgreSQL: ledger failure rolls back subscription and tenant changes', { skip: !PGlite }, async () => {
  const db = await postgres();
  try {
    await db.exec("ALTER TABLE saas_billing_events ADD CONSTRAINT simulate_ledger_failure CHECK ((invoice->>'amount')::numeric < 500)");
    await assert.rejects(operation(db,'RENEWAL',{amount:600,months:12,gst_type:'IGST'}), /simulate_ledger_failure/);
    const sub = (await db.query('SELECT valid_until FROM tenant_subscriptions WHERE id=$1',[USER])).rows[0];
    assert.equal(new Date(sub.valid_until).toISOString(), '2028-12-31T18:29:59.000Z');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM saas_billing_events')).rows[0].n, 0);
  } finally { await db.close(); }
});
test('PostgreSQL: a repeated payment reference with a new request cannot renew twice', { skip: !PGlite }, async () => {
  const db=await postgres();
  try {
    const payload={amount:100,months:1,gst_type:'IGST',transaction_id:'UPI-123'};
    await operation(db,'RENEWAL',payload);
    await assert.rejects(operation(db,'RENEWAL',{...payload,transaction_id:'upi-123'},randomUUID()),/already recorded/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM saas_billing_events')).rows[0].n,1);
  } finally {await db.close();}
});
test('PostgreSQL: pending proforma changes neither seats nor expiry; payment converts it once', { skip: !PGlite }, async () => {
  const db = await postgres();
  try {
    const payload = { current_seats:5,new_seats:10,months:12,billing_mode:'EXTEND_VALIDITY',amount:100,gst_type:'IGST' };
    const quote = await operation(db,'ADDON_PROFORMA',payload);
    const before = (await db.query('SELECT user_seat_limit,valid_until FROM tenant_subscriptions WHERE id=$1',[USER])).rows[0];
    assert.equal(before.user_seat_limit, 5);
    assert.equal(new Date(before.valid_until).toISOString(),'2028-12-31T18:29:59.000Z');
    assert.equal(quote.invoice.status,'PENDING');
    const payment = { ...payload, source_invoice_number:quote.invoice.invoice_number };
    const paid = await operation(db,'ADDON_PAYMENT',payment,randomUUID());
    assert.equal(paid.newSeatLimit,10);
    assert.equal(paid.invoice.status,'PAID');
    await assert.rejects(operation(db,'ADDON_PAYMENT',payment,randomUUID()),/already paid|Seat limit changed/);
    const source = (await db.query('SELECT invoice FROM saas_billing_events WHERE request_id=$1',[REQUEST])).rows[0];
    assert.equal(source.invoice.status,'CONVERTED');
  } finally { await db.close(); }
});
test('PostgreSQL: cross-tenant and protected-admin HOLD requests cannot affect any user', { skip: !PGlite }, async () => {
  const db = await postgres();
  try {
    for (const id of [USER, ACTOR]) await assert.rejects(operation(db,'DOWNGRADE',{current_seats:5,new_seats:1,hold_user_ids:[id]},randomUUID()),/protected|out-of-workspace/);
    const users = (await db.query('SELECT is_approved FROM user_roles')).rows;
    assert.equal(users.every(u=>u.is_approved),true);
    assert.equal((await db.query('SELECT user_seat_limit FROM tenant_subscriptions WHERE id=$1',[USER])).rows[0].user_seat_limit,5);
  } finally { await db.close(); }
});
test('PostgreSQL: eligible HOLD and seat downgrade commit together', { skip: !PGlite }, async () => {
  const db = await postgres();
  try {
    const employee=randomUUID();
    await db.query("INSERT INTO user_roles(user_id,tenant_id,company,role,is_approved,emp_status,email) VALUES ($1,$2,'Audit Company','agent',true,'Active','agent@audit.invalid')",[employee,TENANT]);
    const result=await operation(db,'DOWNGRADE',{current_seats:5,new_seats:1,hold_user_ids:[employee]});
    assert.equal(result.newSeatLimit,1);
    assert.equal(result.heldUsersCount,1);
    assert.equal((await db.query('SELECT is_approved FROM user_roles WHERE user_id=$1',[employee])).rows[0].is_approved,false);
  } finally { await db.close(); }
});
test('PostgreSQL: public roles cannot execute billing or provisioning functions', { skip: !PGlite }, async () => {
  const db = await postgres();
  try {
    const permissions=(await db.query("SELECT has_function_privilege('authenticated','saas_apply_billing_operation(uuid,uuid,uuid,text,jsonb)','execute') AS billing,has_function_privilege('anon','saas_prepare_workspace(uuid,uuid,jsonb)','execute') AS provisioning")).rows[0];
    assert.equal(permissions.billing,false);
    assert.equal(permissions.provisioning,false);
  } finally { await db.close(); }
});
test('PostgreSQL: module access changes only when its saved proforma is paid', {skip:!PGlite}, async()=>{
  const db=await postgres();
  try{
    const payload={module_key:'ATTENDANCE',amount:100,gst_type:'IGST'};
    const quote=await operation(db,'MODULE_PROFORMA',payload);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM tenant_entitlements')).rows[0].n,0);
    await operation(db,'MODULE_PAYMENT',{...payload,source_invoice_number:quote.invoice.invoice_number},randomUUID());
    assert.equal((await db.query("SELECT is_enabled FROM tenant_entitlements WHERE tenant_id=$1 AND module_key='ATTENDANCE'",[TENANT])).rows[0].is_enabled,true);
    assert.equal((await db.query('SELECT user_seat_limit FROM tenant_subscriptions WHERE id=$1',[USER])).rows[0].user_seat_limit,5);
  }finally{await db.close();}
});
