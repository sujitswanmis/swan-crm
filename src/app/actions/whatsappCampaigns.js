'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getTenantBranches } from './tenantBranches';

const getAdminClient = () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Normalizes branch codes/tags to match records
 */
function normalizeBranchTag(branch) {
  if (!branch || branch === 'All' || branch.includes('Universal') || branch.includes('All Branches')) {
    return 'ALL';
  }
  const bLower = String(branch).toLowerCase().trim();
  if (bLower.includes('nsmlr') || bLower.includes('raian')) return 'NSMLR';
  if (bLower.includes('nstlp') || bLower.includes('paharuwal')) return 'NSTLP';
  if (bLower.includes('headquarters') || bLower.includes('nsg') || bLower.includes('main')) return 'NSG';
  if (bLower.includes('nse1') || bLower.includes('enterprises - 1')) return 'NSE1';
  if (bLower.includes('nse2') || bLower.includes('enterprises - 2')) return 'NSE2';
  if (bLower.includes('nse3') || bLower.includes('enterprises - 3')) return 'NSE3';
  if (bLower.includes('nse4') || bLower.includes('enterprises - 4')) return 'NSE4';
  if (bLower.includes('autocomp') || bLower.includes('nsacpl')) return 'NSACPL1';
  return branch.trim();
}

/**
 * Get realtime audience counts across all 4 modules filtered by branch
 */
export async function getCampaignAudienceStats({ tenantId = null, branchFilter = 'All' } = {}) {
  const supabase = getAdminClient();
  if (!supabase) return { partyCount: 0, leadCount: 0, customerCount: 0, userCount: 0 };

  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
  const branchTag = normalizeBranchTag(branchFilter);

  try {
    // 1. Party Master Count
    let partyQuery = supabase.from('party_master').select('id, party_universal_code, business_nature', { count: 'exact', head: false });
    if (effectiveTenantId) partyQuery = partyQuery.eq('tenant_id', effectiveTenantId);
    const { data: partyRows, error: pErr } = await partyQuery;
    let partyCount = 0;
    if (!pErr && partyRows) {
      if (branchTag === 'ALL') {
        partyCount = partyRows.length;
      } else {
        partyCount = partyRows.filter(p => {
          const code = (p.party_universal_code || '').toUpperCase();
          const nature = (p.business_nature || '').toUpperCase();
          return code.includes(branchTag) || nature.includes(branchTag);
        }).length;
      }
    }

    // 2. Leads Count
    let leadQuery = supabase.from('leads').select('id, our_company', { count: 'exact', head: false });
    if (effectiveTenantId) leadQuery = leadQuery.eq('tenant_id', effectiveTenantId);
    const { data: leadRows, error: lErr } = await leadQuery;
    let leadCount = 0;
    if (!lErr && leadRows) {
      if (branchTag === 'ALL') {
        leadCount = leadRows.length;
      } else {
        leadCount = leadRows.filter(l => {
          const comp = (l.our_company || '').toUpperCase();
          return comp.includes(branchTag);
        }).length;
      }
    }

    // 3. End Customers Count
    let custQuery = supabase.from('end_customers').select('id, our_company, branch_code', { count: 'exact', head: false });
    if (effectiveTenantId) custQuery = custQuery.eq('tenant_id', effectiveTenantId);
    const { data: custRows, error: cErr } = await custQuery;
    let customerCount = 0;
    if (!cErr && custRows) {
      if (branchTag === 'ALL') {
        customerCount = custRows.length;
      } else {
        customerCount = custRows.filter(c => {
          const comp = (c.our_company || c.branch_code || '').toUpperCase();
          return comp.includes(branchTag);
        }).length;
      }
    }

    // 4. User Manage Count
    let userQuery = supabase.from('user_roles').select('id, company, branch_name, branch_code', { count: 'exact', head: false });
    if (effectiveTenantId) userQuery = userQuery.eq('tenant_id', effectiveTenantId);
    const { data: userRows, error: uErr } = await userQuery;
    let userCount = 0;
    if (!uErr && userRows) {
      if (branchTag === 'ALL') {
        userCount = userRows.length;
      } else {
        userCount = userRows.filter(u => {
          const bInfo = ((u.company || '') + ' ' + (u.branch_name || '') + ' ' + (u.branch_code || '')).toUpperCase();
          return bInfo.includes(branchTag);
        }).length;
      }
    }

    return { partyCount, leadCount, customerCount, userCount };
  } catch (err) {
    console.error('getCampaignAudienceStats error:', err);
    return { partyCount: 0, leadCount: 0, customerCount: 0, userCount: 0 };
  }
}

/**
 * Fetch sample records for Live Preview
 */
export async function getCampaignAudiencePreview({ tenantId = null, audienceType = 'party', branchFilter = 'All' } = {}) {
  const supabase = getAdminClient();
  if (!supabase) return [];

  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
  const branchTag = normalizeBranchTag(branchFilter);

  try {
    if (audienceType === 'party') {
      let q = supabase.from('party_master')
        .select('id, firm_name, legal_name, biz_contact_no_1, primary_mobile, contact_person_name_1, contact_mobile_1_1, party_universal_code, business_nature')
        .order('created_at', { ascending: false })
        .limit(100);
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      const { data } = await q;
      let list = data || [];
      if (branchTag !== 'ALL') {
        list = list.filter(p => {
          const code = (p.party_universal_code || '').toUpperCase();
          const nature = (p.business_nature || '').toUpperCase();
          return code.includes(branchTag) || nature.includes(branchTag);
        });
      }
      return list.slice(0, 5).map(p => ({
        id: p.id,
        name: p.firm_name || p.legal_name || 'Party Partner',
        subName: p.contact_person_name_1 || 'Primary Contact',
        phone: p.biz_contact_no_1 || p.primary_mobile || p.contact_mobile_1_1 || 'N/A',
        altPhone: p.contact_mobile_1_1 || '',
        tag: p.party_universal_code || 'Party'
      }));
    }

    if (audienceType === 'leads') {
      let q = supabase.from('leads')
        .select('id, company, name, phone, business_contact_1, cp2_name, cp2_mobile_1, our_company')
        .order('created_at', { ascending: false })
        .limit(100);
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      const { data } = await q;
      let list = data || [];
      if (branchTag !== 'ALL') {
        list = list.filter(l => (l.our_company || '').toUpperCase().includes(branchTag));
      }
      return list.slice(0, 5).map(l => ({
        id: l.id,
        name: l.company || l.name || 'Lead Client',
        subName: l.name || 'CP1',
        phone: l.business_contact_1 || l.phone || 'N/A',
        altPhone: l.phone || '',
        tag: l.our_company || 'Lead'
      }));
    }

    if (audienceType === 'end_customers') {
      let q = supabase.from('end_customers')
        .select('id, full_name, mobile_1, mobile_2, linked_party_name, product_name, our_company')
        .order('created_at', { ascending: false })
        .limit(100);
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      const { data } = await q;
      let list = data || [];
      if (branchTag !== 'ALL') {
        list = list.filter(c => (c.our_company || '').toUpperCase().includes(branchTag));
      }
      return list.slice(0, 5).map(c => ({
        id: c.id,
        name: c.full_name || 'End Customer',
        subName: c.linked_party_name ? `Via ${c.linked_party_name}` : (c.product_name || 'Equipment'),
        phone: c.mobile_1 || 'N/A',
        altPhone: c.mobile_2 || '',
        tag: c.product_name || 'Customer'
      }));
    }

    if (audienceType === 'users') {
      let q = supabase.from('user_roles')
        .select('id, emp_name, name, emp_mobile, emp_alt_mobile, role, emp_designation, company, branch_name')
        .order('created_at', { ascending: false })
        .limit(100);
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      const { data } = await q;
      let list = data || [];
      if (branchTag !== 'ALL') {
        list = list.filter(u => ((u.company || '') + ' ' + (u.branch_name || '')).toUpperCase().includes(branchTag));
      }
      return list.slice(0, 5).map(u => ({
        id: u.id,
        name: u.emp_name || u.name || 'Employee',
        subName: u.emp_designation || u.role || 'Staff',
        phone: u.emp_mobile || 'N/A',
        altPhone: u.emp_alt_mobile || '',
        tag: u.branch_name || u.company || 'User'
      }));
    }

    return [];
  } catch (err) {
    console.error('getCampaignAudiencePreview error:', err);
    return [];
  }
}

/**
 * Dispatch single message through active WhatsApp BSP Gateway
 */
async function dispatchSingleWhatsapp({ phone, text, template, settings, targetCompany = 'NSMLR' }) {
  let phoneStr = String(phone).replace(/\D/g, '');
  if (phoneStr.length === 10) phoneStr = '91' + phoneStr;

  let parsedProviderConfig = null;
  if (settings.api_key && typeof settings.api_key === 'string' && settings.api_key.trim().startsWith('{')) {
    try { parsedProviderConfig = JSON.parse(settings.api_key); } catch (_) {}
  }

  const customBsps = Array.isArray(parsedProviderConfig?.custom_bsps) ? parsedProviderConfig.custom_bsps : [];
  let activeProvider = null;

  const tplTarget = String(template.provider || template.company || '').trim().toLowerCase();
  if (tplTarget.includes('aisensy')) activeProvider = 'aisensy';
  else if (tplTarget.includes('interakt')) activeProvider = 'interakt';
  else if (tplTarget.includes('meta')) activeProvider = 'meta';
  else if (tplTarget.includes('wati')) activeProvider = 'wati';
  else if (tplTarget.includes('nextel')) activeProvider = 'nextel';
  else {
    const matchedCustom = customBsps.find(b => 
      tplTarget.includes(b.id?.toLowerCase()) || 
      (b.name && tplTarget.includes(b.name.toLowerCase()))
    );
    if (matchedCustom) activeProvider = matchedCustom.id;
  }

  if (!activeProvider) {
    const clientAlloc = parsedProviderConfig?.client_allocations?.[targetCompany] || 
                        parsedProviderConfig?.client_allocations?.[targetCompany.toLowerCase()] ||
                        parsedProviderConfig?.client_allocations?.[targetCompany.toUpperCase()];
    if (clientAlloc?.default_bsp) {
      activeProvider = clientAlloc.default_bsp;
    } else if (targetCompany === 'NSTLP' || tplTarget === 'nstlp') {
      activeProvider = 'nextel';
    } else {
      activeProvider = 'aisensy';
    }
  }

  const clientCreds = parsedProviderConfig?.client_allocations?.[targetCompany]?.credentials || {};

  // 1. Meta Direct Cloud API
  if (activeProvider === 'meta') {
    const meta = clientCreds?.meta || parsedProviderConfig?.meta || {};
    if (!meta.phone_number_id || !meta.access_token) {
      throw new Error("Meta Cloud API Phone ID or Access Token is missing in WhatsApp Settings");
    }
    const version = meta.api_version || 'v21.0';
    const endpoint = `https://graph.facebook.com/${version}/${meta.phone_number_id}/messages`;

    const components = [];
    if (template.image_url) {
      components.push({
        type: "header",
        parameters: [{ type: "image", image: { link: template.image_url } }]
      });
    }
    components.push({
      type: "body",
      parameters: [{ type: "text", text }]
    });

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneStr,
      type: "template",
      template: {
        name: template.campaign_name || template.template_name,
        language: { code: "en" },
        components
      }
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${meta.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const resData = await res.json();
    if (!res.ok || resData.error) {
      throw new Error(resData.error?.message || "Failed to send Meta WhatsApp message");
    }
    return { success: true, provider: 'meta' };
  }

  // 2. AiSensy / Default Gateway
  const endpointUrl = parsedProviderConfig?.aisensy?.endpoint_url || 'https://backend.aisensy.com/campaign/t1/api/v2';
  const apiKey = parsedProviderConfig?.aisensy?.api_key || settings.api_key;

  const payload = {
    apiKey: apiKey || '',
    campaignName: template.campaign_name || template.template_name,
    destination: phoneStr,
    userName: text || 'Partner',
    templateParams: [text || 'Partner'],
    media: template.image_url ? { url: template.image_url, filename: 'image.jpg' } : undefined
  };

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const resText = await response.text();
  let resJson = null;
  try { resJson = JSON.parse(resText); } catch (_) {}

  if (!response.ok || (resJson && resJson.success === false)) {
    throw new Error(resJson?.message || resJson?.error || `HTTP ${response.status}: Failed to send WhatsApp message`);
  }

  return { success: true, provider: activeProvider };
}

/**
 * Launch WhatsApp Broadcast Campaign
 */
export async function launchWhatsappBroadcastCampaign({
  tenantId = null,
  audienceType = 'party',
  branchFilter = 'All',
  templateId,
  recipientPriority = 'default',
  testPhone = null
}) {
  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Database connection failed' };

  try {
    // 1. Get Template
    const { data: template, error: tplErr } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (tplErr || !template) return { success: false, error: 'WhatsApp Template not found' };

    // 2. Get Settings
    const { data: settings, error: setErr } = await supabase
      .from('whatsapp_settings')
      .select('*')
      .limit(1)
      .single();

    if (setErr || !settings) return { success: false, error: 'WhatsApp Settings / API Keys not configured' };

    // TEST SEND MODE
    if (testPhone && String(testPhone).trim()) {
      const cleanTest = String(testPhone).replace(/\D/g, '');
      if (cleanTest.length < 10) return { success: false, error: 'Invalid 10-digit test phone number' };
      
      const testName = 'Test Partner (Shiva Auto Parts)';
      await dispatchSingleWhatsapp({
        phone: cleanTest,
        text: testName,
        template,
        settings,
        targetCompany: 'NSMLR'
      });

      return {
        success: true,
        isTest: true,
        sentCount: 1,
        message: `Test WhatsApp message sent successfully to +91 ${cleanTest}!`
      };
    }

    // BROADCAST SEND MODE
    const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
    const branchTag = normalizeBranchTag(branchFilter);

    let audienceRecords = [];

    if (audienceType === 'party') {
      let q = supabase.from('party_master')
        .select('*')
        .order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      const { data } = await q;
      let list = data || [];
      if (branchTag !== 'ALL') {
        list = list.filter(p => {
          const code = (p.party_universal_code || '').toUpperCase();
          const nature = (p.business_nature || '').toUpperCase();
          return code.includes(branchTag) || nature.includes(branchTag);
        });
      }
      audienceRecords = list.map(p => {
        let phones = [];
        if (recipientPriority === 'party_all') {
          phones = [p.biz_contact_no_1, p.primary_mobile, p.contact_mobile_1_1, p.contact_mobile_2_1].filter(Boolean);
        } else if (recipientPriority === 'party_cp1') {
          phones = [p.contact_mobile_1_1 || p.biz_contact_no_1 || p.primary_mobile].filter(Boolean);
        } else {
          // 1st Priority Business Contact with Fallback to CP1
          phones = [p.biz_contact_no_1 || p.primary_mobile || p.contact_mobile_1_1].filter(Boolean);
        }
        return {
          id: p.id,
          name: p.firm_name || p.legal_name || 'Channel Partner',
          phones: Array.from(new Set(phones)),
          company: branchTag !== 'ALL' ? branchTag : 'NSMLR'
        };
      });
    } else if (audienceType === 'leads') {
      let q = supabase.from('leads').select('*').order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      const { data } = await q;
      let list = data || [];
      if (branchTag !== 'ALL') {
        list = list.filter(l => (l.our_company || '').toUpperCase().includes(branchTag));
      }
      audienceRecords = list.map(l => {
        let phones = [];
        if (recipientPriority === 'lead_all') {
          phones = [l.business_contact_1, l.phone, l.cp2_mobile_1].filter(Boolean);
        } else if (recipientPriority === 'lead_cp1') {
          phones = [l.phone || l.business_contact_1].filter(Boolean);
        } else {
          phones = [l.business_contact_1 || l.phone].filter(Boolean);
        }
        return {
          id: l.id,
          name: l.company || l.name || 'Lead Client',
          phones: Array.from(new Set(phones)),
          company: l.our_company || 'NSMLR'
        };
      });
    } else if (audienceType === 'end_customers') {
      let q = supabase.from('end_customers').select('*').order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      const { data } = await q;
      let list = data || [];
      if (branchTag !== 'ALL') {
        list = list.filter(c => (c.our_company || c.branch_code || '').toUpperCase().includes(branchTag));
      }
      audienceRecords = list.map(c => ({
        id: c.id,
        name: c.full_name || 'Customer',
        phones: [c.mobile_1, c.mobile_2].filter(Boolean),
        company: c.our_company || 'NSMLR'
      }));
    } else if (audienceType === 'users') {
      let q = supabase.from('user_roles').select('*').order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      const { data } = await q;
      let list = data || [];
      if (branchTag !== 'ALL') {
        list = list.filter(u => ((u.company || '') + ' ' + (u.branch_name || '')).toUpperCase().includes(branchTag));
      }
      audienceRecords = list.map(u => ({
        id: u.id,
        name: u.emp_name || u.name || 'Employee',
        phones: [u.emp_mobile, u.emp_alt_mobile].filter(Boolean),
        company: u.company || 'NSMLR'
      }));
    }

    if (audienceRecords.length === 0) {
      return { success: false, error: 'No recipients found for the selected branch and audience.' };
    }

    let sentCount = 0;
    let failedCount = 0;
    const failures = [];

    // Dispatch in sequential throttled batches to prevent API rate limits
    for (const rec of audienceRecords) {
      for (const phone of rec.phones) {
        try {
          await dispatchSingleWhatsapp({
            phone,
            text: rec.name,
            template,
            settings,
            targetCompany: rec.company
          });

          sentCount++;

          // Insert into logs
          await supabase.from('whatsapp_message_logs').insert({
            lead_id: rec.id,
            template_id: template.id,
            sent_at: new Date().toISOString(),
            status: `sent to ${phone} (${rec.name})`
          });
        } catch (dispatchErr) {
          failedCount++;
          failures.push({ name: rec.name, phone, error: dispatchErr.message });
          console.error(`Failed to dispatch to ${phone}:`, dispatchErr.message);
        }
      }
    }

    return {
      success: true,
      totalTargeted: audienceRecords.length,
      sentCount,
      failedCount,
      failures: failures.slice(0, 10),
      message: `Broadcast finished! Successfully sent ${sentCount} messages (${failedCount} failed).`
    };

  } catch (err) {
    console.error('launchWhatsappBroadcastCampaign error:', err);
    return { success: false, error: err.message || 'Failed to execute campaign broadcast' };
  }
}
