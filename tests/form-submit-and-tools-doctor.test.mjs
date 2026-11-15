import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CRM_TOOLS_CATALOG,
  CRM_PAGES_AND_FORMS_REGISTRY,
  formatISTTimestamp
} from '../src/utils/formSubmitAuditor.js';

test('CRM Tools Catalog contains all required operational services', () => {
  assert.ok(Array.isArray(CRM_TOOLS_CATALOG), 'CRM_TOOLS_CATALOG is an array');
  assert.ok(CRM_TOOLS_CATALOG.length >= 20, `Catalog has at least 20 tools, found ${CRM_TOOLS_CATALOG.length}`);

  const toolIds = CRM_TOOLS_CATALOG.map(t => t.id);
  assert.ok(toolIds.includes('tool_postgrest'), 'Has PostgREST tool');
  assert.ok(toolIds.includes('tool_supabase_auth'), 'Has Supabase Auth tool');
  assert.ok(toolIds.includes('tool_realtime_ws'), 'Has Realtime tool');
  assert.ok(toolIds.includes('tool_plivo_sdk'), 'Has Plivo SDK tool');
  assert.ok(toolIds.includes('tool_gemini_ai'), 'Has Gemini AI tool');
  assert.ok(toolIds.includes('tool_whatsapp_cloud'), 'Has WhatsApp tool');
  assert.ok(toolIds.includes('tool_indexed_db'), 'Has IndexedDB tool');
  assert.ok(toolIds.includes('tool_nodejs_server'), 'Has Node.js Server tool');
});

test('CRM Pages & Forms Registry covers all core operational modules', () => {
  assert.ok(Array.isArray(CRM_PAGES_AND_FORMS_REGISTRY), 'CRM_PAGES_AND_FORMS_REGISTRY is an array');
  assert.ok(CRM_PAGES_AND_FORMS_REGISTRY.length >= 15, `Registry has at least 15 forms, found ${CRM_PAGES_AND_FORMS_REGISTRY.length}`);

  const modules = new Set(CRM_PAGES_AND_FORMS_REGISTRY.map(f => f.module));
  assert.ok(modules.has('Sales & Pipeline'), 'Has Sales & Pipeline');
  assert.ok(modules.has('Smart Attendance'), 'Has Smart Attendance');
  assert.ok(modules.has('Field Force & Forms'), 'Has Field Force');
  assert.ok(modules.has('User Management'), 'Has User Management');
  assert.ok(modules.has('Config Master'), 'Has Config Master');

  for (const item of CRM_PAGES_AND_FORMS_REGISTRY) {
    assert.ok(item.targetTable, `Item ${item.id} has targetTable`);
    assert.ok(Array.isArray(item.requiredColumns) && item.requiredColumns.length > 0, `Item ${item.id} has requiredColumns`);
    assert.ok(Array.isArray(item.fields) && item.fields.length > 0, `Item ${item.id} has fields`);
    assert.ok(item.buttonLabel, `Item ${item.id} has buttonLabel`);
  }
});

test('formatISTTimestamp returns strict IST format with suffix', () => {
  const ts = formatISTTimestamp(new Date('2026-11-14T12:00:00Z'));
  assert.ok(ts.includes('IST'), 'Includes IST');
  assert.ok(ts.includes('2026'), 'Includes Year 2026');
});
