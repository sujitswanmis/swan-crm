import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();

async function compile(file) {
  const result = await swc.transform(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    filename: file,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } },
    module: { type: 'commonjs' }
  });
  return result.code;
}

const modalCode = await compile('src/components/UserManagement/modals/AddEditUserModal.jsx');
const utilsCode = await compile('src/components/UserManagement/utils/userManagementUtils.js');
const icons = new Proxy({}, { get: () => () => null });

function loadDefault(code, dependencies) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: name => {
      if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console,
    setTimeout,
    clearTimeout
  });
  return loadedModule.exports.default;
}

function loadExports(code, dependencies) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: name => {
      if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console,
    setTimeout,
    clearTimeout
  });
  return loadedModule.exports;
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}

function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join('');
  return tree && typeof tree === 'object' ? text(tree.props?.children) : '';
}

function createModalHarness({ user = null, onSave = () => {} } = {}) {
  const states = [];
  const effects = [];
  let cursor = 0;
  let effectCursor = 0;
  let mounted = false;

  const react = {
    ...React,
    useState: initial => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useMemo: fn => fn(),
    useEffect: (fn, deps) => {
      const idx = effectCursor++;
      const prev = effects[idx];
      const hasChanged = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
      effects[idx] = { deps, cleanup: prev?.cleanup };
      if (hasChanged && mounted) {
        if (typeof prev?.cleanup === 'function') prev.cleanup();
        effects[idx].cleanup = fn();
      }
    },
    useCallback: fn => fn,
    useRef: initial => ({ current: initial })
  };

  const userUtils = loadExports(utilsCode, { react });

  const Modal = loadDefault(modalCode, {
    react,
    'lucide-react': icons,
    '@/components/common/SearchableEmployeeSelect': () => null,
    '@/components/common/UniversalBranchSelect': () => null,
    '@/utils/reportingHierarchy': { getReportingEmail: () => '', getReportingFields: () => ({}) },
    '@/utils/branchAccess': {
      resolveCompanyTokenForBranch: () => 'NSG',
      matchesCompanyToken: () => true
    },
    '../utils/userManagementUtils': userUtils,
    '../utils/rolePresets': { ROLE_PRESETS: [] },
    '@/app/actions/tenantBranches': {
      resolveKnownTenant: async () => ({ tenantCode: 'TNT00002', companyName: 'New Swan Group', tenantId: '00000000-0000-0000-0000-000000000001' }),
      getTenantBranches: async () => ({ success: true, branches: [] })
    },
    '@/app/actions/attendance': {
      getTenantAttendancePolicy: async () => ({ success: true, data: { shifts: [] } })
    },
    '@/app/actions/saasSubscription': {
      getAllTenantsWithSubscriptions: async () => ({ success: true, tenants: [] })
    },
    '@/app/actions/team': {
      getTeamMembers: async () => ({ success: true, members: [] })
    }
  });

  const render = () => {
    cursor = 0;
    effectCursor = 0;
    return Modal({
      isOpen: true,
      onClose: () => {},
      user,
      onSave,
      currentUserCompany: 'New Swan Group',
      tenantId: '00000000-0000-0000-0000-000000000001',
      isMasterAdmin: false
    });
  };

  let tree = render();
  mounted = true;
  tree = render();

  return { render, getTree: () => tree, states };
}

test('DESIGNATIONS catalog includes standard manufacturing, operations, and IT designations', () => {
  const userUtils = loadExports(utilsCode, { react: React });
  assert.ok(Array.isArray(userUtils.DESIGNATIONS));
  assert.ok(userUtils.DESIGNATIONS.includes('MIS Executive'), 'Should include MIS Executive');
  assert.ok(userUtils.DESIGNATIONS.includes('Quality Engineer'), 'Should include Quality Engineer');
  assert.ok(userUtils.DESIGNATIONS.includes('Plant Head'), 'Should include Plant Head');
  assert.ok(userUtils.DESIGNATIONS.includes('Sales Executive'), 'Should include Sales Executive');
});

test('AddEditUserModal Step 2 renders Designation with + Type Custom button and supports custom text typing', () => {
  const harness = createModalHarness({ user: null });
  let tree = harness.getTree();

  // Switch to step 2 'Job & Location'
  const stepBtns = nodes(tree).filter(n => n.type === 'button' && text(n).includes('2. Job & Location'));
  assert.equal(stepBtns.length, 1);
  stepBtns[0].props.onClick();

  tree = harness.render();
  const fullText = text(tree);

  assert.ok(fullText.includes('Designation'), 'Designation field label must exist');
  assert.ok(fullText.includes('+ Type Custom'), '+ Type Custom button must exist for Designation');

  // Find + Type Custom button for Designation
  const customToggleBtn = nodes(tree).find(n => n.type === 'button' && text(n) === '+ Type Custom');
  assert.ok(customToggleBtn, '+ Type Custom button must be rendered');

  // Toggle to custom text input
  customToggleBtn.props.onClick();
  tree = harness.render();

  const customInput = nodes(tree).find(n => n.type === 'input' && n.props.placeholder?.includes('MIS Executive'));
  assert.ok(customInput, 'Custom text input with placeholder must render when custom mode is toggled');

  // Type a custom designation
  customInput.props.onChange({ target: { value: 'Senior MIS Lead' } });
  tree = harness.render();

  // Switch back to dropdown mode
  const listToggleBtn = nodes(tree).find(n => n.type === 'button' && text(n) === '← Select from List');
  assert.ok(listToggleBtn, '← Select from List button must be present in custom mode');
  listToggleBtn.props.onClick();

  tree = harness.render();
  const desigSelect = nodes(tree).find(n => n.type === 'select' && nodes(n).some(o => o.props?.value === '__custom__'));
  assert.ok(desigSelect, 'Dropdown must render with __custom__ option');
  assert.equal(desigSelect.props.value, 'Senior MIS Lead', 'Value must be preserved across mode switches');
});

test('AddEditUserModal automatically enables custom input for user with existing custom designation', () => {
  const customUser = {
    user_id: 'usr_custom_1',
    emp_id: '50479',
    emp_name: 'Sujit Kumar Gupta',
    emp_designation: 'Senior Tool Designer',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    company: 'New Swan Group'
  };

  const harness = createModalHarness({ user: customUser });
  let tree = harness.getTree();

  // Switch to step 2
  const stepBtns = nodes(tree).filter(n => n.type === 'button' && text(n).includes('2. Job & Location'));
  stepBtns[0].props.onClick();

  tree = harness.render();

  // Since 'Senior Tool Designer' is not in standard list, custom input mode is active or rendered cleanly
  const allInputs = nodes(tree).filter(n => n.type === 'input' && n.props.value === 'Senior Tool Designer');
  assert.equal(allInputs.length, 1, 'Custom designation input must have value prefilled');
});
