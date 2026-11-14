'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { logAuditAction } from '@/app/actions/audit';
import { createPartyMaster, resolveDbTenantUuid } from '@/app/actions/partyMaster';
import { expandCompanyAliases, getUserBranchAccess, matchesCompanyToken } from '@/utils/branchAccess';
import { createClient } from '@/utils/supabase/server';
import { checkIsAdminRole, checkIsMasterAdmin, getModulePermissions, getSubItemPermissions } from '@/utils/permissionUtils';
import { registrationStatus, isRegistrationRow } from '@/utils/clientRegistrationLifecycle';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

async function registrationContext(view = 'drafts', write = false) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) throw new Error('Please sign in to continue.');
  const db = getAdminClient();
  const { data: member, error } = await db.from('user_roles').select('*').eq('user_id', user.id).maybeSingle();
  if (error || !member) throw new Error('Registration access could not be verified.');
  const access = { ...(member.module_access || {}), _userEmail: user.email };
  const master = checkIsMasterAdmin(access, member.role, user.email);
  const role = master ? 'master_admin' : member.role;
  const admin = master || checkIsAdminRole(role);
  const permissions = getSubItemPermissions(access, role, 'registration', view);
  const parent = getModulePermissions(access, role, 'registration');
  if (!permissions.view || (!admin && member.is_approved === false)) throw new Error('Registration access denied.');
  if (write && (!parent.add || (!admin && (member.can_write === false || access.registration?.write === false)))) {
    throw new Error('Registration write access denied.');
  }
  const branches = getUserBranchAccess({ ...member, module_access: access });
  if (!master && branches.allowedCompanies.length === 0) throw new Error('Company access is not configured.');
  return {
    db, member, master, actor: member.emp_name || user.email?.split('@')[0] || 'User',
    companies: branches.allowedCompanies,
    allDrafts: admin || access.can_view_all_drafts === true,
    names: [...new Set([member.emp_name, user.email?.split('@')[0], user.email, user.id].filter(Boolean))],
  };
}

function assertRegistrationCompany(context, company) {
  if (!context.master && !matchesCompanyToken(company, context.companies)) throw new Error('Company access denied.');
}

function assertRegistrationOwner(context, row) {
  assertRegistrationCompany(context, row.our_company);
  if (!context.allDrafts && !context.names.some(name => [row.entry_by, row.created_by].some(value => String(value || '').toLowerCase() === name.toLowerCase()))) {
    throw new Error('This draft belongs to another employee.');
  }
}

async function registrationRow(context, id) {
  const { data, error } = await context.db.from('leads').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Draft was not found. Please refresh the list.');
  assertRegistrationOwner(context, data);
  return data;
}

function normalizePhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

/**
 * Whitelist of verified Supabase Postgres columns on the 'leads' table.
 * Strips all non-database / virtual / computed fields before Supabase calls.
 */
const VALID_LEAD_COLUMNS = new Set([
  'id', 'lead_ref_id', 'lead_date', 'name', 'company', 'our_company',
  'email', 'phone', 'status', 'client_status', 'priority', 'deal_value', 'source',
  'source_name', 'assigned_to', 'created_by', 'entry_by', 'created_at',
  'follow_up_date', 'business_type', 'business_gst', 'business_contact_1',
  'business_contact_2', 'business_alt_1', 'business_alt_2', 'business_email_1',
  'business_email_2', 'business_alt_email_1', 'business_alt_email_2',
  'cp1_name', 'cp1_mobile_1', 'cp1_mobile_2', 'cp1_alt_1', 'cp1_alt_2', 'cp1_email_2',
  'cp2_name', 'cp2_mobile_1', 'cp2_mobile_2', 'cp2_alt_1', 'cp2_alt_2',
  'cp2_email_1', 'cp2_email_2', 'cp3_name', 'cp3_mobile_1', 'cp3_mobile_2',
  'cp3_alt_1', 'cp3_alt_2', 'cp3_email_1', 'cp3_email_2', 'state_name',
  'district_name', 'city_name', 'tehsil_name', 'block_name', 'pin_code',
  'address', 'requirement', 'investment', 'buying_timeline', 'updated_at'
]);

function sanitizeLeadPayload(input, isUpdate = false) {
  if (!input || typeof input !== 'object') return {};
  const clean = {};
  for (const key of Object.keys(input)) {
    if (VALID_LEAD_COLUMNS.has(key) && input[key] !== undefined) {
      clean[key] = input[key];
    }
  }
  if (isUpdate) {
    delete clean.id;
    delete clean.created_at;
  } else {
    // When inserting a new record, do not enforce empty or blank id
    if (!clean.id) {
      delete clean.id;
    }
  }
  return clean;
}

/**
 * 1. Save or Update Incomplete Registration as DRAFT
 */
export async function saveClientRegistrationDraft(draftData, userCompany = '', currentUser = '') {
  try {
    const context = await registrationContext(draftData.id && !draftData.offlineCreate ? 'drafts' : 'form', true);
    const adminClient = context.db;
    currentUser = context.actor;
    assertRegistrationCompany(context, draftData.our_company || userCompany);
    const offlineCreate = draftData.offlineCreate === true;
    if (offlineCreate) {
      if (!draftData.id) throw new Error('Offline draft identifier is missing.');
      const { data: existing, error } = await adminClient.from('leads').select('*').eq('id', draftData.id).maybeSingle();
      if (error) throw error;
      if (existing) {
        assertRegistrationOwner(context, existing);
        return { success: true, draft: existing };
      }
    }

    const companyName = (draftData.company || draftData.firm_name || '').trim();
    const contactName = (draftData.name || '').trim();
    const phone = normalizePhone(draftData.phone || draftData.business_contact_1);

    if (!companyName && !contactName && !phone) {
      return { success: false, error: 'Please enter at least a Business Name, Contact Name, or Mobile Number to save as draft.' };
    }

    const rawPayload = {
      ...draftData,
      company: companyName || 'Draft Company',
      name: contactName || 'Draft Contact',
      phone: phone || draftData.phone || draftData.business_contact_1 || null,
      status: 'DRAFT',
      entry_by: currentUser || draftData.entry_by || 'User',
      our_company: draftData.our_company || userCompany || 'NSMLR',
      updated_at: new Date().toISOString()
    };

    if (draftData.id && !offlineCreate) {
      const existing = await registrationRow(context, draftData.id);
      if (existing.status !== 'DRAFT' || existing.registration_deleted_at) throw new Error('This draft was already submitted or archived.');
      // Update existing draft
      const cleanPayload = sanitizeLeadPayload(rawPayload, true);
      let updateError = null;
      let updatedData = null;

      for (let attempt = 0; attempt < 4; attempt++) {
        const { data, error } = await adminClient
          .from('leads')
          .update(cleanPayload)
          .eq('id', draftData.id)
          .eq('status', 'DRAFT')
          .is('registration_deleted_at', null)
          .select()
          .maybeSingle();

        if (!error) {
          updatedData = data;
          updateError = null;
          break;
        }

        const match = error.message && error.message.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && cleanPayload[match[1]] !== undefined) {
          delete cleanPayload[match[1]];
          updateError = error;
        } else {
          updateError = error;
          break;
        }
      }

      if (updateError) throw updateError;
      if (!updatedData) throw new Error('Draft changed in another session. Please refresh.');
      return { success: true, draft: updatedData, message: 'Draft updated successfully!' };
    } else {
      // Create new draft record
      rawPayload.created_at = new Date().toISOString();
      const cleanPayload = sanitizeLeadPayload(rawPayload, false);
      if (!offlineCreate) delete cleanPayload.id; // Offline retries retain their stable request identity.
      let insertError = null;
      let insertedData = null;

      for (let attempt = 0; attempt < 4; attempt++) {
        const { data, error } = await adminClient
          .from('leads')
          .insert([cleanPayload])
          .select()
          .single();

        if (!error) {
          insertedData = data;
          insertError = null;
          break;
        }

        if (error.code === '23505' && offlineCreate) {
          const existing = await registrationRow(context, draftData.id);
          return { success: true, draft: existing };
        }
        // If duplicate pkey (23505), strip id and retry with Postgres gen_random_uuid()
        if (error.code === '23505' && cleanPayload.id) {
          delete cleanPayload.id;
          insertError = error;
          continue;
        }

        const match = error.message && error.message.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && cleanPayload[match[1]] !== undefined) {
          delete cleanPayload[match[1]];
          insertError = error;
        } else {
          insertError = error;
          break;
        }
      }

      if (insertError) throw insertError;
      return { success: true, draft: insertedData, message: 'Draft saved successfully!' };
    }
  } catch (err) {
    console.error('saveClientRegistrationDraft error:', err);
    return { success: false, error: err.message || 'Failed to save draft' };
  }
}

const SWAN_COMPANIES = ['nsmlr', 'nstlp', 'nstl', 'new swan group', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl'];

/**
 * 2. Get list of all drafts for current tenant/user
 * Supports Tarika A (personal drafts) and Tarika B (common pool via canViewAll)
 */
export async function getClientRegistrationDrafts(userCompany = '', currentUser = '', canViewAll = false, allowedCompanies = null, options = {}) {
  try {
    const view = ['drafts', 'submitted', 'deleted'].includes(options.view) ? options.view : 'drafts';
    const context = await registrationContext(view);
    const adminClient = context.db;
    const cursor = new Date().toISOString();
    const since = options.since && !Number.isNaN(Date.parse(options.since)) ? new Date(options.since).toISOString() : null;
    let allDrafts = [];
    let page = 0;
    const pageSize = 1000;
    const explicitAllowed = Array.isArray(allowedCompanies)
      ? Array.from(new Set(allowedCompanies.flatMap(c => expandCompanyAliases(c)).filter(c => c !== '')))
      : [];

    while (true) {
      let query = adminClient
        .from('leads')
        .select('*')
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true });
      if (since) {
        query = query.gt('updated_at', since).lte('updated_at', cursor);
        query = view === 'submitted' ? query.not('registration_submitted_at', 'is', null)
          : view === 'deleted' ? query.not('registration_deleted_at', 'is', null)
            : query.or('status.eq.DRAFT,registration_submitted_at.not.is.null');
      } else if (view === 'drafts') query = query.eq('status', 'DRAFT').is('registration_deleted_at', null);
      else query = query.not(view === 'submitted' ? 'registration_submitted_at' : 'registration_deleted_at', 'is', null);
      if (!context.master) query = query.in('our_company', context.companies);

      if (userCompany && userCompany !== 'All') {
        const compLower = String(userCompany).toLowerCase().trim();
        if (compLower === 'new swan group') {
          query = query.in('our_company', ['NSMLR', 'NSTLP', 'NSTL', 'New Swan Group', 'Swan Agro', 'NSE-1', 'NSE-2', 'NSE-6', 'NSCPL', 'NSACPL', '']);
        } else if (compLower === 'nstl' || compLower === 'nstlp') {
          query = query.in('our_company', ['NSTL', 'NSTLP']);
        } else {
          query = query.eq('our_company', userCompany);
        }
      } else if (explicitAllowed.length > 0) {
        query = explicitAllowed.length === 1
          ? query.eq('our_company', explicitAllowed[0])
          : query.in('our_company', explicitAllowed);
      }

      if (!context.allDrafts || !canViewAll) {
        const names = context.allDrafts && currentUser ? [currentUser] : context.names;
        query = query.or(names.flatMap(name => ['entry_by', 'created_by'].map(key => `${key}.eq.${JSON.stringify(name)}`)).join(','));
      }

      const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;

      allDrafts.push(...data.map(row => isRegistrationRow(row, view) ? row : { id: row.id, _removed: true }));
      if (data.length < pageSize) break;
      page++;
    }

    return { success: true, drafts: allDrafts, cursor };
  } catch (err) {
    console.error('getClientRegistrationDrafts error:', err);
    return { success: false, drafts: [], error: err.message || 'Could not load registration records.' };
  }
}

/**
 * 3. Delete a draft
 */
export async function deleteClientRegistrationDraft(draftId, reason = '') {
  try {
    const cleanReason = String(reason || '').trim();
    if (cleanReason.length < 3 || cleanReason.length > 1000) throw new Error('Please enter a deletion reason (3–1000 characters).');
    const context = await registrationContext('drafts', true);
    const existing = await registrationRow(context, draftId);
    if (existing.registration_deleted_at) return { success: true, draft: existing };
    if (existing.status !== 'DRAFT') throw new Error('A submitted lead cannot be deleted from Saved Drafts.');
    const { data, error } = await context.db
      .from('leads')
      .update({ registration_deleted_at: new Date().toISOString(), registration_deleted_by: context.actor, registration_delete_reason: cleanReason, updated_at: new Date().toISOString() })
      .eq('id', draftId)
      .eq('status', 'DRAFT')
      .is('registration_deleted_at', null)
      .select().maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Draft changed in another session. Please refresh.');
    return { success: true, draft: data, message: 'Draft archived with deletion reason.' };
  } catch (err) {
    console.error('deleteClientRegistrationDraft error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 4. Final Submit and 4-Way Seamless Sync:
 *    - Updates/Inserts Client in `leads` (Lead Data)
 *    - Makes available in `Client Registered Report` (ClientReport)
 *    - Creates / Updates `party_master` (Party Master ERP record)
 */
export async function submitClientRegistrationAndSync(formData, userCompany = '', currentUser = '') {
  try {
    const context = await registrationContext(formData.fromSavedDraft ? 'drafts' : 'form', true);
    const adminClient = context.db;
    currentUser = context.actor;
    const existingLead = formData.id ? await registrationRow(context, formData.id) : null;
    if (existingLead?.registration_deleted_at) throw new Error('This draft was archived and cannot be submitted.');
    const fromDraft = existingLead?.status === 'DRAFT';
    if (formData.fromSavedDraft && !existingLead) throw new Error('Saved draft is missing.');
    // A repeated draft submission must return the committed record, never overwrite it.
    if (formData.fromSavedDraft && existingLead?.registration_submitted_at) {
      return { success: true, lead: existingLead, leadId: existingLead.id, leadRefId: existingLead.lead_ref_id };
    }
    if (formData.fromSavedDraft && !fromDraft) throw new Error('This lead was already registered. Please refresh.');

    const companyName = (formData.company || formData.firm_name || '').trim();
    const contactName = (formData.name || '').trim();
    const primaryPhone = normalizePhone(formData.phone || formData.business_contact_1);
    const finalCompany = formData.our_company || userCompany || existingLead?.our_company || 'New Swan Group';
    assertRegistrationCompany(context, finalCompany);

    if (!companyName) {
      return { success: false, error: 'Business / Company Name is required.' };
    }

    // Dynamic status from form (never hardcoded to fixed converted string)
    const targetStatus = registrationStatus(formData.status);

    const rawPayload = {
      ...formData,
      company: companyName,
      name: contactName || 'Contact Person',
      phone: primaryPhone || formData.phone,
      status: targetStatus,
      our_company: finalCompany,
      entry_by: currentUser || formData.entry_by || 'User',
      updated_at: new Date().toISOString()
    };

    let savedLeadId = formData.id || null;
    let leadRefId = formData.lead_ref_id || null;
    let savedLead = null;

    // STEP 1: Update existing draft or insert new lead
    if (savedLeadId) {
      const cleanPayload = sanitizeLeadPayload(rawPayload, true);
      if (fromDraft) {
        cleanPayload.registration_submitted_at = new Date().toISOString();
        cleanPayload.registration_submitted_by = context.actor;
        cleanPayload.created_by = existingLead.created_by;
        cleanPayload.entry_by = existingLead.entry_by || context.actor;
      }
      let update = adminClient
        .from('leads')
        .update(cleanPayload)
        .eq('id', savedLeadId);
      if (fromDraft) update = update.eq('status', 'DRAFT').is('registration_deleted_at', null);
      const { data, error } = await update.select().maybeSingle();

      if (error) throw error;
      if (!data) {
        const committed = await registrationRow(context, savedLeadId);
        if (fromDraft && committed.registration_submitted_at && !committed.registration_deleted_at) return { success: true, lead: committed, leadId: committed.id, leadRefId: committed.lead_ref_id };
        throw new Error('Lead changed in another session. Please refresh.');
      }
      savedLead = data;
      leadRefId = data.lead_ref_id;
    } else {
      rawPayload.created_at = new Date().toISOString();
      const cleanPayload = sanitizeLeadPayload(rawPayload, false);
      delete cleanPayload.id; // Ensure clean UUID generation with zero pkey collision
      let { data, error } = await adminClient
        .from('leads')
        .insert([cleanPayload])
        .select()
        .single();

      if (error && error.code === '23505' && cleanPayload.id) {
        delete cleanPayload.id;
        const retry = await adminClient
          .from('leads')
          .insert([cleanPayload])
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      savedLeadId = data.id;
      savedLead = data;

      // Assign sequential lead_ref_id if missing
      try {
        const { count } = await adminClient.from('leads').select('*', { count: 'exact', head: true });
        const d = new Date();
        const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d).replace(/-/g, '');
        const seq = String(count || 1).padStart(7, '0');
        leadRefId = `${dateStr}${seq}`;
        await adminClient.from('leads').update({ lead_ref_id: leadRefId }).eq('id', savedLeadId);
      } catch (refErr) {
        // Non-blocking fallback
      }
    }

    // STEP 2: Log Audit and Lead Note
    try {
      await adminClient.from('lead_notes').insert([{
        lead_id: savedLeadId,
        note_text: `[Client Registration Finalized]: Registered by ${currentUser || 'User'}. Synced to Party Master & Registered Report.`,
        created_by: currentUser || 'System'
      }]);
    } catch {}

    // STEP 3: Auto-Sync to Party Master
    let partyMasterResult = null;
    try {
      const gstNo = (formData.business_gst || '').trim().toUpperCase();
      let existingParty = null;

      // Check if party already exists by GSTIN or Phone
      if (gstNo && gstNo.length >= 10) {
        const { data: foundByGst } = await adminClient
          .from('party_master')
          .select('id, party_universal_code, firm_name')
          .eq('gstin', gstNo)
          .maybeSingle();
        existingParty = foundByGst;
      }

      if (!existingParty && primaryPhone && primaryPhone.length === 10) {
        const { data: foundByPhone } = await adminClient
          .from('party_master')
          .select('id, party_universal_code, firm_name')
          .eq('primary_mobile', primaryPhone)
          .maybeSingle();
        existingParty = foundByPhone;
      }

      if (existingParty) {
        // Update existing party link
        await adminClient
          .from('party_master')
          .update({
            source_lead_id: savedLeadId,
            party_status: 'Active',
            official_email: formData.email || formData.business_email_1 || undefined,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingParty.id);

        partyMasterResult = {
          id: existingParty.id,
          party_universal_code: existingParty.party_universal_code,
          isExisting: true
        };
      } else {
        // Create new Party Master record
        const partyPayload = {
          firm_name: companyName,
          legal_name: companyName,
          trade_name: companyName,
          business_nature: formData.business_type || 'Client',
          constitution_type: 'PROPRIETORSHIP',
          gstin: gstNo || null,
          pan: formData.business_pan || (gstNo ? gstNo.slice(2, 12) : null),
          official_email: formData.email || formData.business_email_1 || null,
          primary_mobile: primaryPhone || '0000000000',
          party_status: 'Active',
          onboarding_stage: 'S01_Approved',
          acquisition_source: 'CRM_REGISTRATION',
          source_lead_id: savedLeadId,
          our_company: finalCompany,
          created_by: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(formData?.created_by_user_id || '').trim())
            ? String(formData.created_by_user_id).trim()
            : null
        };

        const tenantUuid = await resolveDbTenantUuid(finalCompany);
        const newParty = await createPartyMaster(partyPayload, tenantUuid, currentUser || 'Sales Executive');
        if (newParty && newParty.id) {
          partyMasterResult = newParty;

          // Also insert primary address
          if (formData.address || formData.city_name || formData.state_name) {
            try {
              await adminClient.from('party_addresses').insert([{
                party_id: newParty.id,
                address_type: 'BILLING',
                address_line1: formData.address || `${formData.city_name || ''}, ${formData.state_name || ''}`,
                city: formData.city_name || null,
                state: formData.state_name || null,
                pincode: formData.pin_code || null,
                is_primary: true
              }]);
            } catch (addrErr) {
              console.warn('Address sync warning:', addrErr.message);
            }
          }

          // Also insert primary contact person
          if (formData.name || primaryPhone) {
            try {
              await adminClient.from('party_contacts').insert([{
                party_id: newParty.id,
                contact_name: formData.name || 'Primary Contact',
                mobile_no: primaryPhone || null,
                email: formData.email || formData.business_email_1 || null,
                is_primary: true
              }]);
            } catch (contactErr) {
              console.warn('Contact sync warning:', contactErr.message);
            }
          }
        }
      }
    } catch (partyErr) {
      console.error('Party Master Sync Non-fatal Warning:', partyErr);
      // Registration still succeeds even if party master has a minor field difference
    }

    // STEP 4: Audit Log
    try {
      await logAuditAction(
        'Client Registered & Synced',
        `Registered client ${companyName} (${leadRefId || savedLeadId}) synced to Lead Data, Client Report, and Party Master.`
      );
    } catch {}

    return {
      success: true,
      lead: { ...savedLead, lead_ref_id: leadRefId || savedLead?.lead_ref_id },
      leadId: savedLeadId,
      leadRefId,
      partyMaster: partyMasterResult,
      message: 'Client successfully registered and synced across Lead Data, Reports, and Party Master!'
    };

  } catch (err) {
    console.error('submitClientRegistrationAndSync error:', err);
    return { success: false, error: err.message || 'Failed to register client' };
  }
}
