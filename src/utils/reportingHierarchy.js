const REPORTING_FIELDS = ['primary_reporting_person', 'secondary_reporting_person', 'hod_person'];

// Legacy records contain names; newer selectors return employee objects.
export function normalizeReportingValue(value) {
  if (typeof value === 'string') return value.trim();
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
    add(names, employee.emp_name || employee.name, employee);
  }
  return { identifiers, names };
}

function resolveWithIndex(value, index) {
  const key = clean(normalizeReportingValue(value));
  if (!key) return null;
  const matches = index.identifiers.get(key) || index.names.get(key) || [];
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

export function getReportingTeam(employees = [], viewer = {}) {
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
    return Object.values(getReportingFields(employee)).some(value => {
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

export function getLeadAssignees(team = [], viewer = {}) {
  return [...new Set([viewer.user_id, viewer.emp_name,
    ...team.flatMap(employee => [employee.user_id, employee.emp_name || employee.name])]
    .filter(value => typeof value === 'string' && value.trim()))];
}

export function isLeadInAssignmentScope(lead, assignees) {
  return lead.assigned_to === null || lead.assigned_to === undefined || assignees.has(lead.assigned_to);
}
