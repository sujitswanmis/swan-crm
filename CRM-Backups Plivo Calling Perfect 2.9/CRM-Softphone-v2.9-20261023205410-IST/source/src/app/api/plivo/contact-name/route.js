import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSoftphoneAgentProfile } from '@/app/actions/team';
import { normalizeIndianPhoneNumber } from '@/app/api/plivo/phone-number';

const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001';
const SWAN = ['nsmlr', 'nstlp', 'nstl', 'new swan group', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl'];
const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
const UNKNOWN = { name: 'UnKnow Person', source: null, recordId: null };
const LEAD_GROUPS = [
  [['name', 'cp1_name'], ['phone', 'cp1_mobile_1', 'cp1_mobile_2', 'cp1_alt_1', 'cp1_alt_2']],
  ...[2, 3].map(index => [[`cp${index}_name`], [`cp${index}_mobile_1`, `cp${index}_mobile_2`, `cp${index}_alt_1`, `cp${index}_alt_2`]]),
  [['name', 'cp1_name'], ['business_contact_1', 'business_contact_2', 'business_alt_1', 'business_alt_2']]
];
const PARTY_GROUPS = [
  ...[1, 2, 3].map(index => [[`contact_person_name_${index}`], [
    `contact_mobile_${index}_1`, `contact_mobile_${index}_2`, `contact_alt_mobile_${index}_1`, `contact_alt_mobile_${index}_2`
  ]]),
  [['contact_person_name_1', 'contact_person', 'owner_name'], ['primary_mobile', 'biz_contact_no_1', 'biz_contact_no_2', 'biz_alt_no_1', 'biz_alt_no_2']]
];
const USER_PHONES = ['emp_mobile', 'emp_alt_mobile', 'module_access->>emp_alt_mobile'];
const missingColumns = new Map();
const clean = value => String(value || '').trim();
const lower = value => clean(value).toLowerCase();
const phoneValues = value => String(value || '').split(/[,;\/|\n]+/).map(normalizeIndianPhoneNumber).filter(Boolean);
const fieldValue = (row, field) => field.includes('->>') ? row.module_access?.[field.split('->>')[1]] : row[field];

function belongsToWorkspace(row, scope, companyField = 'company') {
  const tenantId = row.tenant_id || row.module_access?._tenantId;
  if (tenantId && tenantId !== DEFAULT_TENANT) return tenantId === scope.tenantId;
  const company = lower(row[companyField]);
  if (scope.isSwan) return (!tenantId || tenantId === DEFAULT_TENANT) && (!company || SWAN.includes(company));
  return !!company && scope.companies.some(value => lower(value) === company);
}

async function resolveWorkspace(db, role) {
  let tenantId = role.tenant_id || role.module_access?._tenantId || null;
  const company = clean(role.company);
  let tenant = null;
  // Existing New Swan profiles may predate both workspace fields. The CRM
  // already identifies these authenticated employees by their official domain.
  const swanEmail = [role.email, role.emp_official_mail_id].some(email => lower(email).endsWith('@newswangroup.com'));
  if (!tenantId && !company && swanEmail) tenantId = DEFAULT_TENANT;
  if (!tenantId && !company && !swanEmail) {
    const email = clean(role.email || role.emp_official_mail_id);
    if (!email) throw new Error('Workspace unavailable');
    const result = await db.from('tenants').select('id,name,tenant_code').eq('primary_contact_email', email).limit(2);
    if (result.error || result.data?.length !== 1) throw new Error('Workspace unavailable');
    tenant = result.data[0];
    tenantId = tenant.id;
  }
  if (tenantId && tenantId !== DEFAULT_TENANT) {
    const result = await db.from('tenants').select('id,name,tenant_code').eq('id', tenantId).maybeSingle();
    if (result.error) throw result.error;
    tenant = result.data;
  } else if (company && !SWAN.includes(lower(company))) {
    const result = await db.from('tenants').select('id,name,tenant_code').eq('name', company).limit(2);
    if (result.error) throw result.error;
    if (result.data?.length === 1) { tenant = result.data[0]; tenantId = tenant.id; }
  }
  const isSwan = (!tenantId || tenantId === DEFAULT_TENANT) && (SWAN.includes(lower(company)) || (!company && tenantId === DEFAULT_TENANT));
  if (!isSwan && !tenantId && !company) throw new Error('Workspace unavailable');
  if (isSwan) tenantId = DEFAULT_TENANT;
  const companies = [...new Set([
    ...(isSwan ? SWAN : []),
    ...((!tenantId || tenantId === DEFAULT_TENANT || !SWAN.includes(lower(company))) ? [company] : []),
    tenant?.name, tenant?.tenant_code
  ].filter(Boolean).flatMap(value => [clean(value), lower(value), clean(value).toUpperCase(), lower(value).replace(/\b\w/g, character => character.toUpperCase())]))];
  if (isSwan) companies.push('');
  return { tenantId, isSwan, companies };
}

function phoneFilter(phones, fields) {
  // Match formatting separators in SQL, then verify the complete normalized
  // number below. A partial number can never identify a person.
  return phones.flatMap(phone => fields.map(field => `${field}.ilike.*${phone.slice(-10).split('').join('*')}*`)).join(',');
}

async function scopedMatches(db, table, phones, phoneFields, scope, companyField) {
  let unavailable = missingColumns.get(table);
  if (!unavailable || unavailable.expiresAt <= Date.now()) {
    unavailable = { columns: new Set(), expiresAt: Date.now() + 5 * 60 * 1000 };
    missingColumns.set(table, unavailable);
  }
  const fields = new Set(phoneFields.filter(field => !unavailable.columns.has(field)));
  const rows = new Map();
  partitions: for (const partition of ['tenant', 'company', ...(scope.isSwan ? ['unassigned'] : [])]) {
    if (partition === 'tenant' && !scope.tenantId) continue;
    if (partition === 'company' && !scope.companies.length) continue;
    const scopeColumn = partition === 'tenant' ? 'tenant_id' : companyField;
    if (unavailable.columns.has(scopeColumn)) continue;
    // Keep PostgREST URLs bounded even for a larger conference lookup.
    for (let offset = 0; offset < phones.length; offset += 4) {
      for (let attempt = 0; attempt < phoneFields.length + 2 && fields.size; attempt += 1) {
        let query = db.from(table).select('*').or(phoneFilter(phones.slice(offset, offset + 4), [...fields]));
        query = partition === 'tenant' ? query.eq('tenant_id', scope.tenantId)
          : partition === 'unassigned' ? query.is(companyField, null) : query.in(companyField, scope.companies);
        const result = await query.limit(100);
        if (!result.error) {
          for (const row of result.data || []) {
            if (belongsToWorkspace(row, scope, companyField)) rows.set(row.id || row.user_id, row);
          }
          break;
        }
        if (!['42703', 'PGRST204'].includes(result.error.code)) break;
        const missing = String(result.error.message || '').match(/(?:column\s+(?:\w+\.)?|Could not find the ['"])([\w]+)/i)?.[1];
        if (!missing) break;
        unavailable.columns.add(missing);
        if (missing === scopeColumn) continue partitions;
        if (!fields.delete(missing)) break;
      }
    }
  }
  return [...rows.values()];
}

function matchingContact(row, phone, groups) {
  const matches = groups.filter(([, fields]) => fields.some(field => phoneValues(row[field]).includes(phone)));
  if (!matches.length) return null;
  const names = matches.flatMap(([fields]) => fields.map(field => clean(row[field])));
  return { person: names.find(Boolean) || '' };
}

function partyMetadata(row) {
  let metadata = {};
  if (String(row.business_nature || '').startsWith('SWAN_PARTY_META:')) {
    try { metadata = JSON.parse(row.business_nature.slice('SWAN_PARTY_META:'.length)); } catch { /* Invalid metadata cannot supply a name. */ }
  }
  const merged = { ...metadata, ...row };
  for (const key of Object.keys(metadata || {})) if (!clean(row[key])) merged[key] = metadata[key];
  return merged;
}

async function partyMatches(db, phones, scope, leads) {
  if (!scope.tenantId) return [];
  const leadIds = leads.map(lead => lead.id).filter(Boolean);
  const [direct, contacts, linked] = await Promise.all([
    db.from('party_master').select('*').eq('tenant_id', scope.tenantId).or(phoneFilter(phones, ['primary_mobile', 'business_nature'])).limit(100),
    db.from('party_contacts').select('id,party_id,contact_name,primary_mobile,alternate_mobile').or(phoneFilter(phones, ['primary_mobile', 'alternate_mobile'])).limit(100),
    leadIds.length ? db.from('party_master').select('*').eq('tenant_id', scope.tenantId).in('source_lead_id', leadIds).limit(100) : { data: [] }
  ]);
  const contactRows = contacts.error ? [] : contacts.data || [];
  const parentIds = [...new Set(contactRows.map(contact => contact.party_id).filter(Boolean))];
  const parents = parentIds.length ? await db.from('party_master').select('*').eq('tenant_id', scope.tenantId).in('id', parentIds) : { data: [] };
  const rows = new Map();
  for (const result of [direct, linked, parents]) {
    for (const row of result.error ? [] : result.data || []) {
      const party = partyMetadata(row);
      if (belongsToWorkspace(party, scope, 'our_company')) rows.set(party.id, party);
    }
  }
  return [...rows.values()].map(party => ({ party,
    contacts: contactRows.filter(contact => contact.party_id === party.id),
    lead: leads.find(lead => lead.id === party.source_lead_id)
  }));
}

function candidateInWorkspace(position, scope) {
  if (!position) return false;
  if (position.tenant_id || position.company) return belongsToWorkspace(position, scope);
  const match = String(position.jd_text || '').match(/<!--WORKSPACE:(\{.*?\})-->/);
  if (match) {
    try { return belongsToWorkspace(JSON.parse(match[1]), scope); } catch { return false; }
  }
  // Existing untagged recruiter positions belong only to the default workspace.
  return scope.isSwan;
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || !Array.isArray(body.phones) || body.phones.length > 12 || (body.userId && (typeof body.userId !== 'string' || body.userId.length > 128))) {
      return NextResponse.json({ contacts: {} }, { status: 400, headers: HEADERS });
    }
    const phones = [...new Set(body.phones.map(normalizeIndianPhoneNumber).filter(Boolean))];
    const { data: agent, status } = await getSoftphoneAgentProfile(body.userId || null);
    if (status !== 200 || !agent?.user_id || agent.is_active === false) {
      return NextResponse.json({ contacts: {} }, { status: status === 200 ? 403 : status, headers: HEADERS });
    }
    if (!phones.length) return NextResponse.json({ contacts: {} }, { headers: HEADERS });
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const role = await db.from('user_roles').select('*').eq('user_id', agent.user_id).maybeSingle();
    if (role.error || !role.data) throw new Error('Workspace unavailable');
    const scope = await resolveWorkspace(db, role.data);
    const [users, leads, candidateResult] = await Promise.all([
      scopedMatches(db, 'user_roles', phones, USER_PHONES, scope, 'company'),
      scopedMatches(db, 'leads', phones, LEAD_GROUPS.flatMap(([, fields]) => fields), scope, 'our_company'),
      db.from('recruitment_candidates').select('id,name,phone,position_id').or(phoneFilter(phones, ['phone'])).limit(100)
    ]);
    const candidates = candidateResult.error ? [] : candidateResult.data || [];
    const positionIds = [...new Set(candidates.map(candidate => candidate.position_id).filter(Boolean))];
    const [positions, parties] = await Promise.all([
      positionIds.length ? db.from('recruitment_positions').select('*').in('id', positionIds) : { data: [] },
      partyMatches(db, phones, scope, leads)
    ]);
    const allowedPositions = new Set((positions.error ? [] : positions.data || []).filter(position => candidateInWorkspace(position, scope)).map(position => position.id));
    const contacts = Object.fromEntries(phones.map(phone => [phone, UNKNOWN]));
    for (const phone of phones) {
      // Business identity comes first. Only a blank business name falls back
      // to the CP1/CP2/CP3 whose number actually matched.
      const businesses = [];
      const people = [];
      for (const { party, contacts: related, lead } of parties) {
        const child = related.find(contact => phoneValues(contact.primary_mobile).includes(phone) || phoneValues(contact.alternate_mobile).includes(phone));
        const match = matchingContact(party, phone, PARTY_GROUPS);
        const leadMatch = lead && matchingContact(lead, phone, LEAD_GROUPS);
        if (!child && !match && !leadMatch) continue;
        const business = clean(party.firm_name) || clean(party.business_name);
        const person = clean(child?.contact_name) || match?.person || leadMatch?.person || '';
        if (business) businesses.push({ name: business, source: 'party', recordId: party.id });
        if (person) people.push({ name: person, source: 'party', recordId: party.id });
      }
      for (const lead of leads) {
        const match = matchingContact(lead, phone, LEAD_GROUPS);
        if (!match) continue;
        const business = clean(lead.company) || clean(lead.business_name);
        if (business) businesses.push({ name: business, source: 'lead', recordId: lead.id });
        if (match.person) people.push({ name: match.person, source: 'lead', recordId: lead.id });
      }
      if (businesses.length || people.length) { contacts[phone] = businesses[0] || people[0]; continue; }
      const employee = users.find(row => clean(row.emp_name) && USER_PHONES.some(field => phoneValues(fieldValue(row, field)).includes(phone)));
      if (employee) { contacts[phone] = { name: clean(employee.emp_name), source: 'user', recordId: employee.user_id }; continue; }
      const candidate = candidates.find(row => allowedPositions.has(row.position_id) && clean(row.name) && phoneValues(row.phone).includes(phone));
      if (candidate) contacts[phone] = { name: clean(candidate.name), source: 'recruiter', recordId: candidate.id };
    }
    return NextResponse.json({ contacts }, { headers: HEADERS });
  } catch {
    // This optional metadata request must never alter or interrupt a call.
    return NextResponse.json({ contacts: {} }, { status: 503, headers: HEADERS });
  }
}
