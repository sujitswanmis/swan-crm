'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { logAuditAction } from '@/app/actions/audit';
import { createPartyMaster } from '@/app/actions/partyMaster';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

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
  'email', 'phone', 'status', 'priority', 'deal_value', 'source',
  'source_name', 'assigned_to', 'created_by', 'entry_by', 'created_at',
  'follow_up_date', 'business_type', 'business_gst', 'business_contact_1',
  'business_contact_2', 'business_alt_1', 'business_alt_2', 'business_email_1',
  'business_email_2', 'business_alt_email_1', 'business_alt_email_2',
  'cp1_name', 'cp1_mobile_2', 'cp1_alt_1', 'cp1_alt_2', 'cp1_email_2',
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
  }
  return clean;
}

/**
 * 1. Save or Update Incomplete Registration as DRAFT
 */
export async function saveClientRegistrationDraft(draftData, userCompany = '', currentUser = '') {
  try {
    const adminClient = getAdminClient();

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
      phone: phone || draftData.phone || null,
      status: 'DRAFT',
      entry_by: currentUser || draftData.entry_by || 'User',
      our_company: userCompany || draftData.our_company || 'New Swan Group',
      updated_at: new Date().toISOString()
    };

    if (draftData.id) {
      // Update existing draft
      const cleanPayload = sanitizeLeadPayload(rawPayload, true);
      let updateError = null;
      let updatedData = null;

      for (let attempt = 0; attempt < 4; attempt++) {
        const { data, error } = await adminClient
          .from('leads')
          .update(cleanPayload)
          .eq('id', draftData.id)
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
      return { success: true, draft: updatedData || { id: draftData.id, ...cleanPayload }, message: 'Draft updated successfully!' };
    } else {
      // Create new draft record
      rawPayload.created_at = new Date().toISOString();
      const cleanPayload = sanitizeLeadPayload(rawPayload, false);
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

/**
 * 2. Get list of all drafts for current tenant/user
 */
export async function getClientRegistrationDrafts(userCompany = '', currentUser = '') {
  try {
    const adminClient = getAdminClient();
    let query = adminClient
      .from('leads')
      .select('id, company, name, phone, email, state_name, district_name, city_name, created_at, updated_at, entry_by, our_company, requirement, business_gst')
      .eq('status', 'DRAFT')
      .order('updated_at', { ascending: false });

    if (userCompany && userCompany !== 'All') {
      query = query.eq('our_company', userCompany);
    }

    const { data, error } = await query.limit(100);
    if (error) throw error;

    return { success: true, drafts: data || [] };
  } catch (err) {
    console.error('getClientRegistrationDrafts error:', err);
    return { success: true, drafts: [] };
  }
}

/**
 * 3. Delete a draft
 */
export async function deleteClientRegistrationDraft(draftId) {
  try {
    const adminClient = getAdminClient();
    const { error } = await adminClient
      .from('leads')
      .delete()
      .eq('id', draftId)
      .eq('status', 'DRAFT');

    if (error) throw error;
    return { success: true, message: 'Draft deleted successfully' };
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
    const adminClient = getAdminClient();

    const companyName = (formData.company || formData.firm_name || '').trim();
    const contactName = (formData.name || '').trim();
    const primaryPhone = normalizePhone(formData.phone || formData.business_contact_1);
    const finalCompany = userCompany || formData.our_company || 'New Swan Group';

    if (!companyName) {
      return { success: false, error: 'Business / Company Name is required.' };
    }

    const rawPayload = {
      ...formData,
      company: companyName,
      name: contactName || 'Contact Person',
      phone: primaryPhone || formData.phone,
      status: '6;01>Converted>Client Registered',
      our_company: finalCompany,
      entry_by: currentUser || formData.entry_by || 'User',
      updated_at: new Date().toISOString()
    };

    let savedLeadId = formData.id || null;
    let leadRefId = formData.lead_ref_id || null;

    // STEP 1: Update existing draft or insert new lead
    if (savedLeadId) {
      const cleanPayload = sanitizeLeadPayload(rawPayload, true);
      const { data, error } = await adminClient
        .from('leads')
        .update(cleanPayload)
        .eq('id', savedLeadId)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (data) leadRefId = data.lead_ref_id;
    } else {
      rawPayload.created_at = new Date().toISOString();
      const cleanPayload = sanitizeLeadPayload(rawPayload, false);
      const { data, error } = await adminClient
        .from('leads')
        .insert([cleanPayload])
        .select()
        .single();

      if (error) throw error;
      savedLeadId = data.id;

      // Assign sequential lead_ref_id if missing
      try {
        const { count } = await adminClient.from('leads').select('*', { count: 'exact', head: true });
        const d = new Date();
        const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
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
        content: `[Client Registration Finalized]: Registered by ${currentUser || 'User'}. Synced to Party Master & Registered Report.`,
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
          created_by: currentUser || 'Sales Executive'
        };

        const newParty = await createPartyMaster(partyPayload, finalCompany);
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
