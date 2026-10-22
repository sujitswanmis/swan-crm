import { getModulePermissions } from './permissionUtils.js';

const REPORTING_FIELDS = ['primary_reporting_person', 'secondary_reporting_person', 'hod_person'];
const LEAD_STAGES = ['01 - New Stage', '02 - Contact Stage', '03 - Qualification Stage',
  '04 - Follow Up Stage', '05 - Sales Process Stage', '06 - Conversion Stage', '07 - Final Stage', '08 - Transfer to Party'];

// Legacy records contain names; newer selectors return employee objects.
export function normalizeReportingValue(value) {
  if (typeof value === 'string') {
    const reference = value.trim();
    return ['none', 'null', 'undefined'].includes(reference.toLowerCase()) ? '' : reference;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  for (const key of ['email', 'emp_official_mail_id', 'work_email', 'user_id', 'emp_name', 'name']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
  }
  return '';
}

export function getReportingFields(employee = {}) {
  return Object.fromEntries(REPORTING_FIELDS.map(field => [field,
    normalizeReportingValue(employee[field]) || normalizeReportingValue(employee.module_access?.[field])
  ]));
}

const clean = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

function createIdentityIndex(employees) {
  const identifiers = new Map();
  const names = new Map();
  const codes = new Map();
  const add = (map, value, employee) => {
    const key = clean(value);
    if (!key) return;
    const matches = map.get(key) || [];
    if (!matches.includes(employee)) matches.push(employee);
    map.set(key, matches);
  };
  for (const employee of employees) {
    if (!employee || typeof employee !== 'object') continue;
    for (const key of ['user_id', 'id', 'email', 'emp_official_mail_id', 'work_email']) {
      add(identifiers, employee[key], employee);
    }
    const name = employee.emp_name || employee.name;
    add(names, name, employee);
    const code = employee.emp_id || employee.emp_code;
    add(codes, code, employee);
    if (name && code) add(names, `${name} - ${code}`, employee);
  }
  return { identifiers, names, codes };
}

function resolveWithIndex(value, index) {
  const key = clean(normalizeReportingValue(value));
  if (!key) return null;
  const legacyCode = key.match(/\s+-\s+([a-z0-9_-]+)$/i)?.[1];
  const matches = index.identifiers.get(key) || index.names.get(key) ||
    (legacyCode && index.codes.get(legacyCode)) || [];
  // Official-email aliases of the same employee do not make a name ambiguous.
  const distinct = new Map(matches.map(employee => [clean(employee.user_id || employee.id || employee.email), employee]));
  return distinct.size === 1 ? distinct.values().next().value : null;
}

export function resolveEmployeeReference(value, employees = []) {
  return resolveWithIndex(value, createIdentityIndex(Array.isArray(employees) ? employees : []));
}

export function getReportingEmail(value, employees = []) {
  const employee = resolveEmployeeReference(value, employees);
  const reference = employee?.email || normalizeReportingValue(value);
  return reference.includes('@') ? reference.toLowerCase() : reference;
}

export function getReportingTeam(employees = [], viewer = {}, { fields = REPORTING_FIELDS } = {}) {
  if (!Array.isArray(employees)) return [];
  const index = createIdentityIndex(employees);
  const current = resolveWithIndex(viewer.user_id || viewer.email, index) || viewer;
  const identities = new Set([current.user_id, current.id, current.email, current.emp_official_mail_id,
    current.work_email, viewer.user_id, viewer.email].map(clean).filter(Boolean));
  if (!identities.size) return [];
  const viewerName = clean(current.emp_name || current.name || viewer.emp_name || viewer.name);
  return employees.filter(employee => {
    if (!employee || employee.role === 'customer') return false;
    const status = clean(employee.emp_status || employee.status || employee.module_access?.emp_status || 'Active');
    if (['inactive', 'in_active', 'trash', 'terminated'].includes(status)) return false;
    if (current.tenant_id && employee.tenant_id && current.tenant_id !== employee.tenant_id) return false;
    if ([employee.user_id, employee.id, employee.email].some(value => identities.has(clean(value)))) return false;
    const reporting = getReportingFields(employee);
    return fields.some(field => {
      const value = reporting[field];
      if (!value) return false;
      const target = resolveWithIndex(value, index);
      if (target) return [target.user_id, target.id, target.email, target.emp_official_mail_id]
        .some(identity => identities.has(clean(identity)));
      const key = clean(value);
      if (identities.has(key)) return true;
      // Keep exact legacy names working when the viewer is absent from the list.
      return Boolean(viewerName && key === viewerName && !index.names.has(key));
    });
  });
}

export function getHodTeam(employees = [], viewer = {}) {
  return getReportingTeam(employees, viewer, { fields: ['hod_person'] });
}

export function getLeadAssignees(team = [], viewer = {}) {
  return [...new Set([viewer.user_id, viewer.emp_name,
    ...team.flatMap(employee => [employee.user_id, employee.emp_name || employee.name])]
    .filter(value => typeof value === 'string' && value.trim()))];
}

export function isLeadInAssignmentScope(lead, assignees) {
  return lead.assigned_to === null || lead.assigned_to === undefined || assignees.has(lead.assigned_to);
}

export function getLeadStageKey(status) {
  const value = typeof status === 'string' ? status.trim() : '';
  const numbered = value.match(/^(?:S)?0?([1-8])(?:\s*[-;:]|$)/i);
  if (numbered) return LEAD_STAGES[Number(numbered[1]) - 1];
  if (/transfer to party/i.test(value)) return LEAD_STAGES[7];
  if (/converted|order received|closed|won|lost/i.test(value)) return LEAD_STAGES[6];
  return LEAD_STAGES[0];
}

// Stage keys may be stored as S04, full labels, or legacy numeric status prefixes.
export function getLeadStageAccess(employee, status) {
  const role = employee?.role || 'agent';
  const moduleAccess = employee?.module_access || {};
  const parent = getModulePermissions(moduleAccess, role, 'leads');
  const denied = { view: false, edit: false };
  if (!parent.view || employee?.can_read === false || employee?.is_approved === false) return denied;
  const access = moduleAccess.leads || {};
  const canEdit = parent.edit && access.write !== false && employee?.can_write !== false;
  if (role === 'admin' || role === 'Admin' || access.is_manager) return { view: true, edit: canEdit };
  if (access.read === false) return denied;
  const stage = getLeadStageKey(status);
  const subEntry = Object.entries(access.sub_items || {}).find(([key]) =>
    /^(?:S)?0?[1-8](?:\s*[-;:]|$)/i.test(key.trim()) && getLeadStageKey(key) === stage);
  const sub = subEntry?.[1];
  if (sub === false || sub?.view === false) return denied;
  const configuredSteps = access.assigned_steps;
  const visible = Array.isArray(configuredSteps) && configuredSteps.length > 0
    ? configuredSteps.some(key => /^(?:S)?0?[1-8](?:\s*[-;:]|$)/i.test(String(key).trim()) && getLeadStageKey(key) === stage)
    : Boolean(sub === true || sub?.view === true);
  return { view: visible, edit: visible && canEdit && sub?.edit !== false && sub?.write !== false };
}

export function getPrimaryLeadHandoff(lead, nextStatus, employees) {
  const owner = resolveEmployeeReference(lead?.assigned_to, employees);
  if (!owner) return null;
  const primary = resolveEmployeeReference(getReportingFields(owner).primary_reporting_person, employees);
  if (!primary?.user_id || !getLeadStageAccess(primary, nextStatus).view) return null;
  const team = getReportingTeam(employees, primary, { fields: ['primary_reporting_person'] });
  return team.includes(owner) ? primary : null;
}

export function canClaimPrimaryTeamLead(lead, employee, primaryAssignees) {
  if (!employee?.user_id || !lead?.assigned_to || lead.is_offline_pending) return false;
  if (lead.assigned_to === employee.user_id || lead.assigned_to === employee.emp_name) return false;
  if (employee.tenant_id && lead.tenant_id && employee.tenant_id !== lead.tenant_id) return false;
  return primaryAssignees.has(lead.assigned_to) && getLeadStageAccess(employee, lead.status).edit;
}

export function getPrimaryClaimAssignees(employees, viewer) {
  const team = getReportingTeam(employees, viewer, { fields: ['primary_reporting_person'] });
  const index = createIdentityIndex(employees);
  return new Set(getLeadAssignees(team).filter(reference => {
    const owner = resolveWithIndex(reference, index);
    return owner && team.includes(owner);
  }));
}
