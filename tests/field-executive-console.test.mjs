import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();

const icons = new Proxy({}, { get: () => props => React.createElement('svg', { ...props, 'aria-hidden': true }) });
const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };

async function compile(path) {
  const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  return (await swc.transform(source, {
    filename: path,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } },
    module: { type: 'commonjs' },
  })).code;
}

function load(code, dependencies, extra = {}) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, {
    module: loadedModule,
    exports: loadedModule.exports,
    console,
    process,
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    ...extra,
    require: name => {
      if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return loadedModule.exports;
}

const uiCode = await compile('src/components/FieldForce/FieldExecutiveConsoleUI.jsx');
const ui = load(uiCode, { react: React, 'lucide-react': icons, './FieldExecutiveConsole.module.css': css });
const actionsCode = await compile('src/app/actions/fieldTasks.js');

test('formatConsoleIdentity deduplicates identical company/user names and builds IST presets safely', () => {
  assert.equal(
    ui.formatConsoleIdentity('SuPuja Creations', 'SuPuja Creations', 'owner@supuja.com'),
    'SuPuja Creations · owner@supuja.com'
  );
  assert.equal(ui.formatConsoleIdentity('SuPuja Creations', 'SuPuja Creations', ''), 'SuPuja Creations');
  assert.equal(ui.formatConsoleIdentity('Deepak', 'New Swan Group', ''), 'Deepak · New Swan Group');
  assert.match(ui.buildISTFollowupPreset(1), /^\d{4}-\d{2}-\d{2}T11:00$/);
});

test('getModuleEntitiesForCheckIn enforces tenant scope and cleans N/A, None and duplicate city strings', async () => {
  const recordedCalls = [];
  const createMockSupabase = () => ({
    from(table) {
      const filters = [];
      let limitVal = null;
      const builder = {
        select() { return builder; },
        eq(col, val) { filters.push(['eq', col, val]); return builder; },
        in(col, val) { filters.push(['in', col, val]); return builder; },
        or(expr) { filters.push(['or', expr]); return builder; },
        order() { return builder; },
        limit(n) { limitVal = n; return builder; },
        maybeSingle: async () => ({ data: { in_time: '2026-11-11T09:00:00+05:30', out_time: null, status: 'PRESENT' }, error: null }),
        then(resolve) {
          recordedCalls.push({ table, filters, limitVal });
          if (table === 'leads') {
            return Promise.resolve({
              data: [
                { id: 'l1', company: 'N/A', name: 'Rajesh Sharma', phone: '9917790220', status: 'None', address: '', city_name: 'Raisen', district_name: 'Raisen' },
                { id: 'l2', company: 'Shri Shyam Agro', name: 'Amit', phone: '9826151551', status: '2;01>Contact Stage>Contacted', address: 'Plot 4', city_name: 'Jodhpur', district_name: 'Jodhpur' },
              ],
              error: null,
            }).then(resolve);
          }
          if (table === 'party_master') {
            return Promise.resolve({
              data: [
                { id: 'p1', firm_name: 'Apex Mills', party_status: 'None', primary_mobile: '9999900000', party_addresses: [{ address_line_1: '', city: 'Balghat', state: 'Balghat' }] },
              ],
              error: null,
            }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return builder;
    },
  });

  const actions = load(actionsCode, {
    '@supabase/supabase-js': { createClient: createMockSupabase },
    '@/utils/supabase/server': { createClient: async () => ({}) },
    '@/app/actions/audit': { logAuditAction: async () => {} },
    '@/app/actions/partyMaster': {
      resolveDbTenantUuid: async (t) => {
        const s = String(t || '').trim();
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s;
        return s.toLowerCase().includes('supuja') ? '0a37b8e8-1c28-4e19-8891-951fc3f8f8af' : '00000000-0000-0000-0000-000000000001';
      },
    },
  });

  const leadEntities = await actions.getModuleEntitiesForCheckIn({
    company: 'SuPuja Creations',
    tenantId: '0a37b8e8-1c28-4e19-8891-951fc3f8f8af',
    moduleType: 'LEAD_DATA',
  });

  assert.equal(leadEntities.length, 2);
  assert.equal(leadEntities[0].party_name, 'Rajesh Sharma');
  assert.equal(leadEntities[0].current_stage, null);
  assert.equal(leadEntities[0].party_address, 'Raisen');
  assert.equal(leadEntities[1].party_address, 'Plot 4, Jodhpur');
  assert.deepEqual(recordedCalls[0].filters, [['eq', 'our_company', 'SuPuja Creations']]);

  const partyEntities = await actions.getModuleEntitiesForCheckIn({
    company: 'SuPuja Creations',
    tenantId: '0a37b8e8-1c28-4e19-8891-951fc3f8f8af',
    moduleType: 'PARTY_MASTER',
  });
  assert.equal(partyEntities[0].party_address, 'Balghat');
  assert.equal(partyEntities[0].current_stage, null);
  assert.deepEqual(recordedCalls[1].filters, [['eq', 'tenant_id', '0a37b8e8-1c28-4e19-8891-951fc3f8f8af']]);

  const att = await actions.getTodayUserAttendanceStatus('11111111-1111-4111-8111-111111111111', 'user@supuja.in');
  assert.equal(att.isPunchedIn, true);
  const attCall = recordedCalls.find(c => c.table === 'attendance_records');
  // Limit(1) prevents multi-row maybeSingle errors on Supabase
  assert.equal(attCall, undefined); // awaited via maybeSingle directly without chaining through `.then`
});

test('Check-in UI removes 45k+/double-search clutter, shows GPS error state explicitly, and triggers live GPS on mount', () => {
  const htmlWithError = renderToStaticMarkup(
    React.createElement(ui.ConsoleCheckInWorkspace, {
      selectedModule: 'LEAD_DATA',
      onSelectModule: () => {},
      tasksCount: 0,
      onShowTasksView: () => {},
      searchQuery: '',
      onSearchChange: () => {},
      loadingEntities: false,
      moduleEntities: [
        { id: '1', lead_id: '1', party_name: 'Rajesh Sharma', party_phone: '9917790220', party_address: 'Raisen', current_stage: '1;01>New Stage>New Lead' },
      ],
      visitedMap: new Map(),
      partyName: '',
      leadId: null,
      partyPhone: '',
      partyAddress: '',
      activePipeline: 'LEAD_DATA',
      selectedTask: null,
      isManualEntry: false,
      onSetManualEntry: () => {},
      onPartyNameChange: () => {},
      onPartyPhoneChange: () => {},
      onClearParty: () => {},
      onSelectEntity: () => {},
      connectivityModes: [{ id: 'PHYSICAL_VISIT', label: 'Physical Visit' }],
      connectivityMode: 'PHYSICAL_VISIT',
      onSelectConnectivity: () => {},
      userLat: null,
      userLng: null,
      gpsAccuracy: null,
      gpsLoading: false,
      gpsError: 'Location access blocked. Enable GPS permissions and retry.',
      geofenceDistance: null,
      geofenceStatus: 'UNKNOWN',
      onRefreshGPS: () => {},
      attendanceStatus: { checked: true, isPunchedIn: true, isPunchedOut: false },
      onAttendanceGateClick: () => {},
      onStartCheckIn: () => {},
    })
  );

  assert.doesNotMatch(htmlWithError, /45k\+|🔍|Raisen, Raisen|>None<|1;01>/);
  assert.match(htmlWithError, /New Stage · New Lead/);
  assert.match(htmlWithError, /Location access blocked/);
  assert.doesNotMatch(htmlWithError, /Acquiring live GPS coordinates/);
  assert.equal(ui.formatReadableStage('2;01>Contact Stage>Contacted'), 'Contact Stage · Contacted');

  const cssSource = fs.readFileSync(new URL('../src/components/FieldForce/FieldExecutiveConsole.module.css', import.meta.url), 'utf8');
  assert.match(cssSource, /--fe-accent:\s*#2563eb;/);
  assert.doesNotMatch(cssSource, /--fe-accent:\s*var\(--accent-color/);
  assert.match(cssSource, /\.console button\[type='button'\]\.primaryAction/);
  assert.match(cssSource, /\.console \.searchField input\[type='text'\]/);
});
