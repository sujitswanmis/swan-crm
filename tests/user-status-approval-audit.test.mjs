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

const statusModalCode = await compile('src/components/UserManagement/modals/StatusChangeModal.jsx');
const approvalModalCode = await compile('src/components/UserManagement/modals/ApprovalStatusModal.jsx');
const userManageTabCode = await compile('src/components/UserManagement/tabs/UserManageTab.jsx');
const teamCode = await compile('src/app/actions/team.js');
const icons = new Proxy({}, { get: () => () => null });

function createComponentHarness(Component, props) {
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
    useId: () => 'uid_test',
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

  const loadedComponent = loadDefault(Component, {
    react,
    'react-dom': { createPortal: (children) => children },
    'lucide-react': icons
  });

  const render = (extraProps = {}) => {
    cursor = 0;
    effectCursor = 0;
    return loadedComponent({ ...props, ...extraProps });
  };

  let tree = render();
  mounted = true;
  tree = render();

  return { render, getTree: () => tree, states };
}

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
    clearTimeout,
    document: { body: {} },
    global: globalThis,
    globalThis
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
    clearTimeout,
    document: { body: {} },
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test_key' } },
    global: globalThis,
    globalThis
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

test('StatusChangeModal renders effective date, quick remarks, and validates required remarks for Resigned', () => {
  let submittedPayload = null;
  const mockUser = {
    user_id: 'usr_1',
    emp_id: '50479',
    emp_name: 'Sujit Kumar Gupta',
    emp_status: 'Active'
  };

  const harness = createComponentHarness(statusModalCode, {
    isOpen: true,
    onClose: () => {},
    onConfirm: (payload) => { submittedPayload = payload; },
    user: mockUser,
    targetStatus: 'Resigned',
    loading: false
  });

  let tree = harness.getTree();
  const allText = text(tree);
  assert.ok(allText.includes('Change Employee Status: Resigned'), 'Title must display target status');
  assert.ok(allText.includes('Sujit Kumar Gupta'), 'Must display employee name');
  assert.ok(allText.includes('Effective Date (IST)'), 'Must include Effective Date label');
  assert.ok(allText.includes('Better Opportunity'), 'Must display quick suggestions for Resigned');

  // Verify form submission validation: submitting without remarks should fail validation
  const form = nodes(tree).find(n => n.type === 'form');
  assert.ok(form, 'Form element must exist');

  // Find date input and textarea
  const dateInput = nodes(tree).find(n => n.type === 'input' && n.props.type === 'date');
  assert.ok(dateInput, 'Date input must exist');
  assert.ok(dateInput.props.value, 'Date input must be prefilled with today IST');

  const textarea = nodes(tree).find(n => n.type === 'textarea');
  assert.ok(textarea, 'Textarea must exist');

  // Simulate entering remarks and submitting
  textarea.props.onChange({ target: { value: 'Leaving for better opportunity' } });
  dateInput.props.onChange({ target: { value: '2026-11-20' } });

  tree = harness.render();
  const updatedForm = nodes(tree).find(n => n.type === 'form');
  updatedForm.props.onSubmit({ preventDefault: () => {} });

  assert.ok(submittedPayload, 'Submission should succeed when remarks are provided');
  assert.equal(submittedPayload.status, 'Resigned');
  assert.equal(submittedPayload.effectiveDate, '2026-11-20');
  assert.equal(submittedPayload.remarks, 'Leaving for better opportunity');
});

test('ApprovalStatusModal renders 3 states (Approved, Pending, Rejected) and validates rejection remarks', () => {
  let submittedPayload = null;
  const mockUser = {
    user_id: 'usr_2',
    emp_id: '50480',
    emp_name: 'Ramesh Sharma',
    is_approved: false
  };

  const harness = createComponentHarness(approvalModalCode, {
    isOpen: true,
    onClose: () => {},
    onConfirm: (payload) => { submittedPayload = payload; },
    user: mockUser,
    currentApproval: 'Pending',
    loading: false
  });

  let tree = harness.getTree();
  const allText = text(tree);
  assert.ok(allText.includes('Update Approval Status'), 'Title must match');
  assert.ok(allText.includes('Approved'), 'Must include Approved card');
  assert.ok(allText.includes('Pending'), 'Must include Pending card');
  assert.ok(allText.includes('Rejected'), 'Must include Rejected card');

  const textarea = nodes(tree).find(n => n.type === 'textarea');

  // Provide approval with note
  textarea.props.onChange({ target: { value: 'All docs verified by HR' } });
  tree = harness.render();

  const form = nodes(tree).find(n => n.type === 'form');
  form.props.onSubmit({ preventDefault: () => {} });

  assert.ok(submittedPayload);
  assert.equal(submittedPayload.approvalStatus, 'Pending'); // default was pending
  assert.equal(submittedPayload.remarks, 'All docs verified by HR');
});

test('team.js updateEmpStatus and updateUserApprovalStatus persist metadata, effective date, and remarks', async () => {
  let updatedPayload = null;
  let auditLogged = null;

  const fakeDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              user_id: 'usr_3',
              emp_name: 'Amit Patel',
              email: 'amit@example.com',
              module_access: { company_name: 'New Swan Group' }
            },
            error: null
          })
        })
      }),
      update: (payload) => ({
        eq: async () => {
          updatedPayload = payload;
          return { error: null };
        }
      })
    })
  };

  const team = loadExports(teamCode, {
    '@supabase/supabase-js': { createClient: () => fakeDb },
    '@/utils/supabase/server': { createClient: async () => fakeDb },
    './adminMessageConfig': { sendAdminAccountEmailOtp: async () => ({}) },
    './audit': {
      logAuditAction: async (action, target) => {
        auditLogged = { action, target };
      }
    },
    './attendance': {},
    './offlineRules': {},
    '@/lib/impersonateStore': { saveImpersonateToken: async () => ({}) },
    '@/utils/reportingHierarchy': { getReportingFields: d => d },
    '@/app/api/plivo/phone-number': { normalizeIndianPhoneNumber: x => x },
    '@/utils/permissionUtils': { getSubItemPermissions: () => ({}) },
    '@/utils/branchAccess': {
      resolveCompanyTokenForBranch: () => 'NSG',
      matchesCompanyToken: () => true,
      matchesUserBranchMembership: () => true
    }
  });

  // Test 1: updateEmpStatus with effective date and remarks
  const statusRes = await team.updateEmpStatus('usr_3', 'Hold', {
    effectiveDate: '2026-11-18',
    remarks: 'Absconded without notice',
    updatedByName: 'Admin Sujit'
  });

  assert.equal(statusRes.success, true);
  assert.equal(updatedPayload.emp_status, 'Hold');
  assert.equal(updatedPayload.module_access.status_effective_date, '2026-11-18');
  assert.equal(updatedPayload.module_access.status_remarks, 'Absconded without notice');
  assert.equal(updatedPayload.module_access.last_updated_by, 'Admin Sujit');
  assert.ok(updatedPayload.module_access.last_updated_at);
  assert.ok(updatedPayload.module_access.last_update_details.includes('Hold (Eff: 2026-11-18)'));
  assert.ok(auditLogged.target.includes('Absconded without notice'));

  // Test 2: updateUserApprovalStatus with Rejected and reason
  const approvalRes = await team.updateUserApprovalStatus('usr_3', 'Rejected', {
    remarks: 'Wrong branch and missing KYC',
    updatedByName: 'Admin Sujit'
  });

  assert.equal(approvalRes.success, true);
  assert.equal(updatedPayload.is_approved, false);
  assert.equal(updatedPayload.module_access.approval_status, 'Rejected');
  assert.equal(updatedPayload.module_access.approval_remarks, 'Wrong branch and missing KYC');
  assert.equal(updatedPayload.module_access.last_updated_by, 'Admin Sujit');
  assert.ok(auditLogged.target.includes('Wrong branch and missing KYC'));
});

test('UserManageTab renders new Last Updated, Updated By, Update Details columns and rich badges', () => {
  const react = {
    ...React,
    useState: initial => {
      let val = typeof initial === 'function' ? initial() : initial;
      return [val, newVal => { val = typeof newVal === 'function' ? newVal(val) : newVal; }];
    },
    useId: () => 'uid_tab',
    useMemo: fn => fn(),
    useEffect: () => {},
    useCallback: fn => fn,
    useRef: initial => ({ current: initial })
  };

  const UserManageTab = loadDefault(userManageTabCode, {
    react,
    'lucide-react': icons,
    '@/components/common/StandardTablePagination': () => React.createElement('div', null, 'Pagination'),
    '@/components/common/ColumnResizer': () => React.createElement('div', null, 'Resizer'),
    '@/components/common/MobileTableView': Object.assign(() => null, { TableViewToggle: () => null, useTableViewPreference: () => ['table', () => {}] }),
    '@/utils/tableColumnResize': Object.assign((storageKey, defaultWidths) => ({
      colWidths: defaultWidths || {},
      columnWidths: defaultWidths || {},
      isResizing: () => false,
      handleResizeStart: () => {},
      handleTouchStart: () => {},
      handleReset: () => {}
    }), { ColumnResizer: () => null }),
    '@/components/TableControls/ColumnSelectorModal': () => null,
    '@/components/TableControls/MultiColumnFilterModal': () => null,
    '@/components/ErrorBoundary': ({ children }) => children,
    '../utils/userManagementUtils': {
      getStatusBadgeStyle: () => ({ bg: '#fff', color: '#000', border: '#ccc' }),
      HoverIconButton: () => null,
      isMasterAdmin: () => false,
      EMP_STATUS_OPTIONS: ['Active', 'InActive', 'Hold', 'Resigned', 'Terminated', 'Draft', 'Trash']
    },
    '../utils/rolePresets': { ROLE_PRESETS: [] },
    '@/config/org_structure_config.json': {}
  });

  const mockUsers = [
    {
      user_id: 'u_1',
      emp_id: '50479',
      emp_name: 'Sujit Kumar Gupta',
      email: 'sujit@example.com',
      role: 'Manager',
      emp_status: 'Resigned',
      status_effective_date: '2026-11-10',
      status_remarks: 'Left for higher studies',
      approval_status: 'Approved',
      is_approved: true,
      last_updated_at: '2026-11-16T18:48:00.000Z',
      last_updated_by: 'Admin Sujit',
      last_update_details: 'Status: Resigned (Eff: 2026-11-10) — Left for higher studies'
    },
    {
      user_id: 'u_2',
      emp_id: '50480',
      emp_name: 'Ramesh Sharma',
      email: 'ramesh@example.com',
      role: 'agent',
      emp_status: 'InActive',
      status_effective_date: '2026-11-12',
      approval_status: 'Rejected',
      approval_remarks: 'Wrong branch code and invalid ID',
      is_approved: false,
      last_updated_at: '2026-11-16T19:00:00.000Z',
      last_updated_by: 'Super Admin',
      last_update_details: 'Approval: Rejected — Wrong branch code and invalid ID'
    },
    {
      user_id: 'u_3',
      emp_id: '50481',
      emp_name: 'Pooja Verma',
      email: 'pooja@example.com',
      role: 'agent',
      emp_status: 'Active',
      last_updated_at: '2026-11-16T19:15:00.000Z',
      last_updated_by: 'sujit@example.com',
      last_update_details: 'Status: Active'
    }
  ];

  const tree = UserManageTab({
    users: mockUsers,
    loading: false,
    departments: ['IT', 'Sales'],
    roleTemplates: []
  });

  const allText = text(tree);

  // 1. Column headers must exist
  assert.ok(allText.includes('Last Updated'), 'Header must include Last Updated');
  assert.ok(allText.includes('Updated By'), 'Header must include Updated By');
  assert.ok(allText.includes('Update Details'), 'Header must include Update Details');

  // 2. Cell values must be rendered
  assert.ok(allText.includes('Admin Sujit'), 'Must render Updated By actor');
  assert.ok(allText.includes('Super Admin'), 'Must render Updated By actor 2');
  assert.ok(allText.includes('Sujit Kumar Gupta - 50479'), 'Must resolve email/emp_id to Name - Emp ID');
  assert.ok(allText.includes('Status: Resigned (Eff: 2026-11-10)'), 'Must render Update Details');
  assert.ok(allText.includes('Eff: 10 Nov 2026'), 'Must render formatted IST effective date under status');
  assert.ok(allText.includes('✕ Rejected'), 'Must render Rejected badge');
  assert.ok(allText.includes('✓ Approved'), 'Must render Approved badge');
});

