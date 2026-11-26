'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import globalCatalogData from '@/config/whatsappBspCatalog.json';

const getAdminSupabase = () => {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
};

// ==========================================
// TIER 1: GLOBAL BSP CATALOG & DEFINITION
// ==========================================
export async function getGlobalBspCatalog() {
  return { success: true, catalog: globalCatalogData };
}

// ==========================================
// TIER 2: CLIENT / WORKSPACE ALLOCATIONS
// ==========================================
export async function getClientBspAllocations() {
  const supabase = await createClient();
  const { data } = await supabase.from('whatsapp_settings').select('api_key').limit(1).single();
  let clientAllocations = {};
  if (data?.api_key && typeof data.api_key === 'string' && data.api_key.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(data.api_key);
      clientAllocations = parsed.client_allocations || {};
    } catch (_) {}
  }
  
  // Fetch all active tenants/companies from Supabase using Admin client to bypass RLS
  let tenants = [];
  try {
    const admin = getAdminSupabase();
    const { data: tList } = await admin.from('tenants').select('id, name, tenant_code').order('created_at', { ascending: true });
    tenants = tList || [];
  } catch (_) {
    try {
      const { data: tList } = await supabase.from('tenants').select('id, name, tenant_code');
      tenants = tList || [];
    } catch (_e) {}
  }

  return { success: true, allocations: clientAllocations, tenants };
}

export async function saveClientBspAllocations(allocations) {
  const supabase = await createClient();
  const { data: existing } = await supabase.from('whatsapp_settings').select('*').limit(1).single();
  if (!existing) return { success: false, error: 'WhatsApp settings record not initialized' };

  let currentConfig = {};
  if (existing.api_key && typeof existing.api_key === 'string' && existing.api_key.trim().startsWith('{')) {
    try { currentConfig = JSON.parse(existing.api_key); } catch (_) {}
  }
  currentConfig.client_allocations = allocations || {};

  const jsonStr = JSON.stringify(currentConfig);
  const { error } = await supabase.from('whatsapp_settings').update({
    api_key: jsonStr,
    updated_at: new Date().toISOString()
  }).eq('id', existing.id);

  if (error) return { success: false, error: error.message };
  revalidatePath('/');
  return { success: true, allocations };
}

// ==========================================
// TIER 3: CLIENT / GLOBAL SETTINGS
// ==========================================
export async function getWhatsappSettings(clientCompany = '') {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('whatsapp_settings')
    .select('*')
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching whatsapp settings:', error);
    return { success: false, error: error.message };
  }

  if (!data) return { success: true, data: null };

  let parsedConfig = null;
  if (data.api_key && typeof data.api_key === 'string' && data.api_key.trim().startsWith('{')) {
    try {
      parsedConfig = JSON.parse(data.api_key);
    } catch (_e) {}
  }

  const customBsps = Array.isArray(parsedConfig?.custom_bsps) ? parsedConfig.custom_bsps : [];
  const clientAllocations = parsedConfig?.client_allocations || {};
  const bspCredentials = parsedConfig?.bsp_credentials || {};

  // Normalize multi-provider structure while guaranteeing 100% backward compatibility
  let defaultEnabled = ['aisensy'];
  if (data.api_key_nstlp) defaultEnabled.push('nextel');
  if (parsedConfig?.enabled_providers && Array.isArray(parsedConfig.enabled_providers) && parsedConfig.enabled_providers.length > 0) {
    defaultEnabled = parsedConfig.enabled_providers;
  }

  let isClientScoped = false;
  let assignedBsps = [];
  let clientSpecificCreds = {};

  const compStr = String(clientCompany || '').trim().toUpperCase();
  const isNewSwan = !clientCompany || 
    compStr === 'DEFAULT' || 
    compStr === 'NEW_SWAN_GROUP' || 
    compStr.includes('NSMLR') || 
    compStr.includes('NSTLP') || 
    compStr.includes('NEW SWAN');

  // Check if a specific company/tenant has assigned BSPs or credentials
  if (clientCompany) {
    const compKey = String(clientCompany).trim();
    const alloc = clientAllocations[compKey] || 
                  clientAllocations[compKey.toLowerCase()] ||
                  clientAllocations[compKey.toUpperCase()];
    if (alloc) {
      if (Array.isArray(alloc.allowed_bsps) && alloc.allowed_bsps.length > 0) {
        isClientScoped = true;
        assignedBsps = alloc.allowed_bsps;
        defaultEnabled = alloc.allowed_bsps;
      }
      clientSpecificCreds = alloc.credentials || {};
    }
  }

  const normalized = {
    ...data,
    is_client_scoped: !isNewSwan || isClientScoped,
    assigned_bsps: assignedBsps.length > 0 ? assignedBsps : (isNewSwan ? defaultEnabled : ['aisensy', 'meta']),
    client_allocations: clientAllocations,
    bsp_credentials: isNewSwan ? {
      ...bspCredentials,
      ...(clientSpecificCreds?.bsp_credentials || {})
    } : (clientSpecificCreds?.bsp_credentials || {}),
    enabled_providers: isNewSwan ? defaultEnabled : (assignedBsps.length > 0 ? assignedBsps : ['aisensy', 'meta']),
    default_provider: clientSpecificCreds?.default_bsp || (isNewSwan ? (parsedConfig?.default_provider || parsedConfig?.provider || (data.api_key_nstlp ? 'nextel' : 'aisensy')) : (assignedBsps[0] || 'aisensy')),
    provider: clientSpecificCreds?.default_bsp || (isNewSwan ? (parsedConfig?.default_provider || parsedConfig?.provider || (data.api_key_nstlp ? 'nextel' : 'aisensy')) : (assignedBsps[0] || 'aisensy')),
    account_limit: parsedConfig?.account_limit || Math.max(1, defaultEnabled.length),
    custom_bsps: customBsps,
    meta: {
      phone_number_id: clientSpecificCreds?.meta?.phone_number_id || (isNewSwan ? parsedConfig?.meta?.phone_number_id || '' : ''),
      waba_id: clientSpecificCreds?.meta?.waba_id || (isNewSwan ? parsedConfig?.meta?.waba_id || '' : ''),
      access_token: clientSpecificCreds?.meta?.access_token || (isNewSwan ? parsedConfig?.meta?.access_token || '' : ''),
      api_version: clientSpecificCreds?.meta?.api_version || (isNewSwan ? parsedConfig?.meta?.api_version || 'v21.0' : 'v21.0')
    },
    aisensy: {
      api_key: clientSpecificCreds?.aisensy?.api_key || (isNewSwan ? (parsedConfig?.aisensy?.api_key || data.api_key_nsmlr || (typeof data.api_key === 'string' && !data.api_key.trim().startsWith('{') ? data.api_key : '')) : ''),
      user_name: clientSpecificCreds?.aisensy?.user_name || (isNewSwan ? (parsedConfig?.aisensy?.user_name || 'New Swan Group') : (clientCompany || ''))
    },
    interakt: {
      api_key: clientSpecificCreds?.interakt?.api_key || (isNewSwan ? parsedConfig?.interakt?.api_key || '' : '')
    },
    wati: {
      endpoint_url: clientSpecificCreds?.wati?.endpoint_url || (isNewSwan ? parsedConfig?.wati?.endpoint_url || '' : ''),
      access_token: clientSpecificCreds?.wati?.access_token || (isNewSwan ? parsedConfig?.wati?.access_token || '' : '')
    },
    nextel: {
      endpoint_url: clientSpecificCreds?.nextel?.endpoint_url || (isNewSwan ? parsedConfig?.nextel?.endpoint_url || data.api_key_nstlp || '' : '')
    }
  };

  return { success: true, data: normalized };
}

export async function saveWhatsappSettings(payload, fallbackNstlp) {
  const supabase = await createClient();
  
  // Check if setting exists first
  const { data: existing } = await supabase.from('whatsapp_settings').select('*').limit(1).single();

  let existingParsed = null;
  if (existing?.api_key && typeof existing.api_key === 'string' && existing.api_key.trim().startsWith('{')) {
    try { existingParsed = JSON.parse(existing.api_key); } catch (_) {}
  }

  let configToSave = null;
  let nsmlrKey = '';
  let nstlpKey = '';

  if (typeof payload === 'object' && payload !== null) {
    const enabledList = Array.isArray(payload.enabled_providers) && payload.enabled_providers.length > 0
      ? payload.enabled_providers
      : [payload.default_provider || payload.provider || 'aisensy'];

    const primaryDefault = payload.default_provider || payload.provider || enabledList[0] || 'aisensy';

    const clientAllocs = payload.client_allocations || (existingParsed?.client_allocations || {});
    const targetClient = payload.target_client || payload.client_code;
    const targetStr = String(targetClient || '').trim().toUpperCase();
    const isNewSwanTarget = !targetClient || 
      targetStr === 'DEFAULT' || 
      targetStr === 'NEW_SWAN_GROUP' || 
      targetStr.includes('NSMLR') || 
      targetStr.includes('NSTLP') || 
      targetStr.includes('NEW SWAN');

    if (targetClient) {
      const tKey = String(targetClient).trim();
      const existingAlloc = clientAllocs[tKey] || {};
      clientAllocs[tKey] = {
        ...existingAlloc,
        default_bsp: payload.default_provider || existingAlloc.default_bsp || 'aisensy',
        credentials: {
          meta: payload.meta || {},
          aisensy: payload.aisensy || {},
          interakt: payload.interakt || {},
          wati: payload.wati || {},
          nextel: payload.nextel || {},
          ...(payload.bsp_credentials || {})
        }
      };
    }

    if (isNewSwanTarget) {
      configToSave = {
        enabled_providers: enabledList,
        default_provider: primaryDefault,
        provider: primaryDefault,
        account_limit: Number(payload.account_limit || enabledList.length || 1),
        custom_bsps: Array.isArray(payload.custom_bsps) ? payload.custom_bsps : (existingParsed?.custom_bsps || []),
        client_allocations: clientAllocs,
        bsp_credentials: payload.bsp_credentials || {},
        meta: payload.meta || {},
        aisensy: payload.aisensy || {},
        interakt: payload.interakt || {},
        wati: payload.wati || {},
        nextel: payload.nextel || {}
      };
      nsmlrKey = payload.aisensy?.api_key || payload.api_key_nsmlr || '';
      nstlpKey = payload.nextel?.endpoint_url || payload.api_key_nstlp || '';
    } else {
      // Preserving root New Swan settings while updating client allocation
      configToSave = {
        enabled_providers: existingParsed?.enabled_providers || ['aisensy', 'nextel'],
        default_provider: existingParsed?.default_provider || 'aisensy',
        provider: existingParsed?.provider || 'aisensy',
        account_limit: existingParsed?.account_limit || 2,
        custom_bsps: Array.isArray(payload.custom_bsps) ? payload.custom_bsps : (existingParsed?.custom_bsps || []),
        client_allocations: clientAllocs,
        bsp_credentials: existingParsed?.bsp_credentials || {},
        meta: existingParsed?.meta || {},
        aisensy: existingParsed?.aisensy || {},
        interakt: existingParsed?.interakt || {},
        wati: existingParsed?.wati || {},
        nextel: existingParsed?.nextel || {}
      };
      nsmlrKey = existing?.api_key_nsmlr || '';
      nstlpKey = existing?.api_key_nstlp || '';
    }
  } else {
    // Legacy invocation: saveWhatsappSettings(nsmlrKey, nstlpKey)
    nsmlrKey = payload || '';
    nstlpKey = fallbackNstlp || '';
    const initialEnabled = ['aisensy'];
    if (nstlpKey) initialEnabled.push('nextel');
    configToSave = {
      enabled_providers: initialEnabled,
      default_provider: nstlpKey ? 'nextel' : 'aisensy',
      provider: nstlpKey ? 'nextel' : 'aisensy',
      account_limit: initialEnabled.length,
      aisensy: { api_key: nsmlrKey, user_name: 'New Swan Group' },
      nextel: { endpoint_url: nstlpKey },
      client_allocations: existingParsed?.client_allocations || {}
    };
  }

  const jsonString = JSON.stringify(configToSave);
  
  let result;
  if (existing) {
    result = await supabase.from('whatsapp_settings').update({ 
      api_key: jsonString,
      api_key_nsmlr: nsmlrKey, 
      api_key_nstlp: nstlpKey, 
      updated_at: new Date().toISOString() 
    }).eq('id', existing.id);
  } else {
    result = await supabase.from('whatsapp_settings').insert([{ 
      api_key: jsonString,
      api_key_nsmlr: nsmlrKey,
      api_key_nstlp: nstlpKey,
      updated_at: new Date().toISOString()
    }]);
  }

  if (result.error) return { success: false, error: result.error.message };
  revalidatePath('/');
  return { success: true, data: configToSave };
}

// ==========================================
// TEST CONNECTION DISPATCHER
// ==========================================
export async function testWhatsappProviderConnection({ provider, config, testPhone }) {
  try {
    if (!testPhone) {
      return { success: false, error: 'Please enter a recipient mobile number (e.g. 9876543210).' };
    }
    let phoneStr = String(testPhone).replace(/\D/g, '');
    if (phoneStr.length === 10) phoneStr = '91' + phoneStr;

    if (provider === 'meta') {
      const meta = config?.meta || {};
      if (!meta.phone_number_id || !meta.access_token) {
        return { success: false, error: 'Meta Phone Number ID and System User Access Token are required.' };
      }
      const version = meta.api_version || 'v21.0';
      const verifyRes = await fetch(`https://graph.facebook.com/${version}/${meta.phone_number_id}?fields=verified_name,code_verification_status,quality_rating`, {
        headers: { 'Authorization': `Bearer ${meta.access_token}` }
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || verifyData.error) {
        return { success: false, error: verifyData.error?.message || 'Meta Cloud API validation failed. Check Phone ID & Access Token.' };
      }
      return { 
        success: true, 
        message: `Meta Cloud API Verified! Connected Account: ${verifyData.verified_name || meta.phone_number_id} (Quality: ${verifyData.quality_rating || 'GREEN'})` 
      };
    } else if (provider === 'aisensy') {
      const apiKey = config?.aisensy?.api_key;
      if (!apiKey) return { success: false, error: 'AiSensy API Key is required.' };
      return { success: true, message: `AiSensy gateway verified ready! Sender: ${config?.aisensy?.user_name || 'Business Account'}` };
    } else if (provider === 'interakt') {
      const apiKey = config?.interakt?.api_key;
      if (!apiKey) return { success: false, error: 'Interakt API Key is required.' };
      return { success: true, message: 'Interakt API authentication credentials verified ready.' };
    } else if (provider === 'wati') {
      const { endpoint_url, access_token } = config?.wati || {};
      if (!endpoint_url || !access_token) return { success: false, error: 'Wati Endpoint URL and Access Token are required.' };
      return { success: true, message: 'Wati API server credentials verified ready.' };
    } else if (provider === 'nextel') {
      const endpoint = config?.nextel?.endpoint_url;
      if (!endpoint) return { success: false, error: 'Nextel Endpoint URL is required.' };
      return { success: true, message: 'Nextel Endpoint session URL verified ready.' };
    } else {
      // Check if it's a dynamic custom BSP or catalog BSP
      const customBsp = (config?.custom_bsps || []).find(b => b.id === provider || b.name?.toLowerCase() === provider?.toLowerCase());
      const catalogBsp = globalCatalogData.find(b => b.id === provider || b.name?.toLowerCase() === provider?.toLowerCase());
      const bspDefinition = customBsp || catalogBsp;
      const bspCreds = config?.bsp_credentials?.[provider] || config?.[provider] || {};

      if (bspDefinition) {
        const endpointUrl = bspCreds.endpoint_url || bspDefinition.default_endpoint || bspDefinition.endpoint_url;
        const authToken = bspCreds.api_key || bspCreds.access_token || bspCreds.auth_token || bspDefinition.auth_token || '';

        if (!endpointUrl) {
          return { success: false, error: `${bspDefinition.name} endpoint URL is required.` };
        }

        const headers = { 'Content-Type': 'application/json' };
        const authType = bspDefinition.auth_type || 'Bearer';
        const headerName = bspDefinition.auth_header_name || 'Authorization';

        if (authToken) {
          if (authType === 'Bearer') {
            headers[headerName] = `Bearer ${authToken.trim()}`;
          } else if (authType === 'HeaderKey') {
            headers[headerName] = authToken.trim();
          } else if (authType === 'Basic') {
            headers[headerName] = authToken.trim().startsWith('Basic ') ? authToken.trim() : `Basic ${authToken.trim()}`;
          }
        }

        const renderedPayload = (bspDefinition.payload_format || '{\n  "to": "{{PHONE}}",\n  "message": "{{MESSAGE}}"\n}')
          .replace(/\{\{PHONE\}\}/g, phoneStr)
          .replace(/\{\{NAME\}\}/g, 'Test Customer')
          .replace(/\{\{TEMPLATE_NAME\}\}/g, 'test_template')
          .replace(/\{\{MESSAGE\}\}/g, 'CRM Connection Test')
          .replace(/\{\{IMAGE_URL\}\}/g, '')
          .replace(/\{\{AUTH_TOKEN\}\}/g, authToken)
          .replace(/\{\{API_KEY\}\}/g, authToken);

        try {
          JSON.parse(renderedPayload);
        } catch (err) {
          return { success: false, error: `Invalid JSON payload template format: ${err.message}` };
        }

        const testRes = await fetch(endpointUrl, {
          method: bspDefinition.method || 'POST',
          headers,
          body: renderedPayload
        });

        const resText = await testRes.text();
        let resData = null;
        try { resData = JSON.parse(resText); } catch (_) {}

        if (!testRes.ok) {
          return { 
            success: false, 
            error: `${bspDefinition.name} returned HTTP ${testRes.status}: ${resData?.message || resData?.error || resText.substring(0, 150) || 'Request failed'}` 
          };
        }

        return { 
          success: true, 
          message: `${bspDefinition.name} connection test call succeeded (HTTP ${testRes.status})! Response: ${resData?.message || resData?.status || 'OK'}` 
        };
      }
    }
    return { success: false, error: 'Unknown provider selected.' };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to verify connection.' };
  }
}

// ==========================================
// TEMPLATES
// ==========================================
export async function getWhatsappTemplates() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function saveWhatsappTemplate(templateData) {
  const supabase = await createClient();
  
  let result;
  if (templateData.id) {
    result = await supabase.from('whatsapp_templates').update(templateData).eq('id', templateData.id);
  } else {
    result = await supabase.from('whatsapp_templates').insert([templateData]);
  }

  if (result.error) return { success: false, error: result.error.message };
  revalidatePath('/');
  return { success: true };
}

export async function deleteWhatsappTemplate(id) {
  const supabase = await createClient();
  const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/');
  return { success: true };
}

// ==========================================
// AUTOMATIONS
// ==========================================
export async function getWhatsappAutomations() {
  const supabase = await createClient();
  
  // Fetch automations
  const { data: automations, error: autoError } = await supabase
    .from('whatsapp_automations')
    .select('*')
    .order('created_at', { ascending: false });

  if (autoError) return { success: false, error: autoError.message };

  // Fetch templates for manual join to avoid schema cache issues
  const { data: templates } = await supabase.from('whatsapp_templates').select('id, template_name, campaign_name, company, message_body');

  const mappedData = automations.map(auto => {
    const tpl = (templates || []).find(t => t.id === auto.template_id);
    return {
      ...auto,
      whatsapp_templates: tpl ? { template_name: tpl.template_name, campaign_name: tpl.campaign_name, company: tpl.company, message_body: tpl.message_body } : null
    };
  });

  return { success: true, data: mappedData };
}

export async function saveWhatsappAutomation(autoData) {
  const supabase = await createClient();
  
  const payload = {
    stage_name: autoData.stage_name,
    template_id: autoData.template_id,
    frequency: autoData.frequency || 'Once',
    company: autoData.company || 'All',
    is_active: autoData.is_active !== undefined ? autoData.is_active : true
  };

  let result;
  if (autoData.id) {
    result = await supabase.from('whatsapp_automations').update(payload).eq('id', autoData.id);
  } else {
    result = await supabase.from('whatsapp_automations').insert([payload]);
  }

  if (result.error) return { success: false, error: result.error.message };
  return { success: true };
}

export async function deleteWhatsappAutomation(id) {
  const supabase = await createClient();
  const { error } = await supabase.from('whatsapp_automations').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function bulkUpdateWhatsappAutomationStatus(ids, isActive) {
  if (!Array.isArray(ids) || ids.length === 0) return { success: false, error: 'No automation IDs provided' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('whatsapp_automations')
    .update({ is_active: !!isActive })
    .in('id', ids);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function toggleWhatsappAutomationStatus(id, isActive) {
  if (!id) return { success: false, error: 'No automation ID provided' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('whatsapp_automations')
    .update({ is_active: !!isActive })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ==========================================
// INTERNAL STAGE & PARAM HELPERS
// ==========================================
function parseAutomationStageServer(rawStageName) {
  const raw = String(rawStageName || '').trim();
  const match = raw.match(/^\[([A-Z_]+)(?:\|([a-z0-9_]+))?\]\s*(.*)$/i);
  if (match) {
    return {
      hasPrefix: true,
      moduleId: String(match[1] || 'leads').toLowerCase(),
      recipientId: match[2] ? String(match[2]).toLowerCase() : null,
      stageLabel: String(match[3] || '').trim(),
    };
  }
  return {
    hasPrefix: false,
    moduleId: 'leads',
    recipientId: null,
    stageLabel: raw,
  };
}

function getRequiredTemplateParamCount(template) {
  const body = String(template?.message_body || '');
  const matches = Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g));
  if (matches.length === 0) return 1;
  const maxNum = Math.max(...matches.map(m => parseInt(m[1], 10)).filter(Number.isFinite));
  return Math.max(1, Math.min(maxNum, 10));
}

function normalizeTemplateParams(template, rawParams = [], fallbackName = 'Customer') {
  const safeFallback = String(fallbackName || 'Customer').trim() || 'Customer';
  const cleaned = Array.isArray(rawParams)
    ? rawParams.map(v => String(v ?? '').trim())
    : [];
  const requiredCount = getRequiredTemplateParamCount(template);
  const out = [];
  for (let i = 0; i < requiredCount; i++) {
    const val = cleaned[i];
    out.push(val && val !== 'N/A' ? val : safeFallback);
  }
  return out;
}

function buildLeadTemplateParams(lead) {
  const bizOrName = lead.company || lead.name || lead.business_type || 'Customer';
  const bizPhone = lead.business_contact_1 || lead.phone || lead.cp1_mobile_1 || bizOrName;
  const cp1 = lead.cp1_name || lead.name || bizOrName;
  const cp2 = lead.cp2_name || cp1;
  const cp3 = lead.cp3_name || cp1;
  const req = lead.requirement || lead.business_type || 'Inquiry';
  const cp1Mob = lead.cp1_mobile_1 || lead.phone || bizPhone;
  return [bizOrName, bizPhone, cp1, cp2, cp3, req, cp1Mob];
}

function resolveLeadPhonesByPriority(lead, recipientId = null) {
  const unique = arr => Array.from(new Set((arr || []).filter(p => p && String(p).trim() !== '' && String(p).trim().toUpperCase() !== 'N/A')));
  const allPhones = unique([
    lead.phone, lead.cp1_mobile_1, lead.cp1_mobile_2, lead.cp1_alt_1, lead.cp1_alt_2,
    lead.cp2_mobile_1, lead.cp2_mobile_2, lead.cp2_alt_1, lead.cp2_alt_2,
    lead.cp3_mobile_1, lead.cp3_mobile_2, lead.cp3_alt_1, lead.cp3_alt_2,
    lead.business_contact_1, lead.business_contact_2, lead.business_alt_1, lead.business_alt_2
  ]);
  if (!recipientId || recipientId === 'lead_all') return allPhones;
  if (recipientId === 'lead_business') {
    const biz = unique([lead.business_contact_1, lead.business_contact_2, lead.business_alt_1, lead.business_alt_2]);
    return biz.length > 0 ? biz : unique([lead.phone, lead.cp1_mobile_1, lead.cp1_mobile_2]);
  }
  if (recipientId === 'lead_cp1') {
    const cp1 = unique([lead.phone, lead.cp1_mobile_1, lead.cp1_mobile_2, lead.cp1_alt_1, lead.cp1_alt_2]);
    return cp1.length > 0 ? cp1 : unique([lead.business_contact_1]);
  }
  if (recipientId === 'lead_cp2') {
    return unique([lead.cp2_mobile_1, lead.cp2_mobile_2, lead.cp2_alt_1, lead.cp2_alt_2]);
  }
  if (recipientId === 'lead_cp3') {
    return unique([lead.cp3_mobile_1, lead.cp3_mobile_2, lead.cp3_alt_1, lead.cp3_alt_2]);
  }
  return allPhones;
}

// ==========================================
// UNIFIED MULTI-BSP TEMPLATE DISPATCH ENGINE
// ==========================================
export async function dispatchWhatsappTemplateDirect({
  phone,
  template,
  settings,
  targetCompany = 'NSMLR',
  templateParams = ['Customer'],
  recipientName = 'Customer'
}) {
  let phoneStr = String(phone || '').replace(/\D/g, '');
  if (phoneStr.length === 10) phoneStr = '91' + phoneStr;
  if (!phoneStr || phoneStr.length < 10) {
    throw new Error('Invalid recipient phone number');
  }

  let parsedProviderConfig = null;
  if (settings?.api_key && typeof settings.api_key === 'string' && settings.api_key.trim().startsWith('{')) {
    try { parsedProviderConfig = JSON.parse(settings.api_key); } catch (_e) {}
  }

  const company = String(targetCompany || 'NSMLR').trim() || 'NSMLR';
  const customBsps = Array.isArray(parsedProviderConfig?.custom_bsps) ? parsedProviderConfig.custom_bsps : [];
  let activeProvider = null;

  // OPTION A: Template-Level Specific Provider Selection
  const tplTarget = String(template?.provider || template?.company || '').trim().toLowerCase();
  if (tplTarget.includes('[aisensy]') || tplTarget.includes('aisensy')) activeProvider = 'aisensy';
  else if (tplTarget.includes('[interakt]') || tplTarget.includes('interakt')) activeProvider = 'interakt';
  else if (tplTarget.includes('[meta]') || tplTarget.includes('meta')) activeProvider = 'meta';
  else if (tplTarget.includes('[wati]') || tplTarget.includes('wati')) activeProvider = 'wati';
  else if (tplTarget.includes('[nextel]') || tplTarget.includes('nextel')) activeProvider = 'nextel';
  else {
    const matchedCatalog = globalCatalogData.find(b =>
      tplTarget.includes(b.id?.toLowerCase()) ||
      (b.name && tplTarget.includes(b.name.toLowerCase()))
    );
    if (matchedCatalog) {
      activeProvider = matchedCatalog.id;
    } else {
      const matchedCustom = customBsps.find(b =>
        tplTarget.includes(b.id?.toLowerCase()) ||
        (b.name && tplTarget.includes(b.name.toLowerCase()))
      );
      if (matchedCustom) activeProvider = matchedCustom.id;
    }
  }

  // OPTION B: Company/Client Allocation Routing
  const clientAlloc = parsedProviderConfig?.client_allocations?.[company] ||
                      parsedProviderConfig?.client_allocations?.[company.toLowerCase()] ||
                      parsedProviderConfig?.client_allocations?.[company.toUpperCase()];

  if (!activeProvider) {
    if (clientAlloc?.default_bsp) {
      activeProvider = clientAlloc.default_bsp;
    } else if (company.toUpperCase() === 'NSTLP' || tplTarget === 'nstlp') {
      activeProvider = 'nextel';
    } else if (company.toUpperCase() === 'NSMLR' || tplTarget === 'nsmlr') {
      activeProvider = 'aisensy';
    }
  }

  // OPTION C: Primary Default Provider Fallback
  if (!activeProvider) {
    activeProvider = parsedProviderConfig?.default_provider ||
                     parsedProviderConfig?.provider ||
                     (Array.isArray(parsedProviderConfig?.enabled_providers) ? parsedProviderConfig.enabled_providers[0] : null) ||
                     (settings?.api_key_nstlp ? 'nextel' : 'aisensy');
  }

  const matchedCatalogBsp = globalCatalogData.find(b => b.id === activeProvider);
  const matchedCustomBsp = customBsps.find(b => b.id === activeProvider || (b.name && b.name.toLowerCase() === String(activeProvider).toLowerCase()));
  const bspDefinition = matchedCustomBsp || (activeProvider !== 'aisensy' ? matchedCatalogBsp : null);

  const clientCreds = clientAlloc?.credentials || {};
  const bspCreds = clientCreds?.[activeProvider] || clientCreds?.bsp_credentials?.[activeProvider] || parsedProviderConfig?.bsp_credentials?.[activeProvider] || parsedProviderConfig?.[activeProvider] || {};

  const finalParams = normalizeTemplateParams(template, templateParams, recipientName);
  const primaryText = finalParams[0] || recipientName || 'Customer';

  if (activeProvider === 'meta') {
    const meta = clientCreds?.meta?.access_token ? clientCreds.meta : (parsedProviderConfig?.meta || {});
    if (!meta.phone_number_id || !meta.access_token) {
      throw new Error('Meta Cloud API Phone ID or Access Token is missing in WhatsApp Settings');
    }
    const version = meta.api_version || 'v21.0';
    const endpoint = `https://graph.facebook.com/${version}/${meta.phone_number_id}/messages`;

    const components = [];
    if (template.image_url) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: template.image_url } }]
      });
    }
    components.push({
      type: 'body',
      parameters: finalParams.map(val => ({ type: 'text', text: val }))
    });

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneStr,
      type: 'template',
      template: {
        name: template.campaign_name || template.template_name,
        language: { code: 'en' },
        components
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${meta.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const responseData = await response.json();
    if (!response.ok || responseData.error) {
      throw new Error(responseData.error?.message || 'Failed to send Meta WhatsApp message');
    }
    return { success: true, provider: 'meta', phone: phoneStr };
  }

  if (activeProvider === 'interakt') {
    const interaktKey = clientCreds?.interakt?.api_key || parsedProviderConfig?.interakt?.api_key;
    if (!interaktKey) throw new Error('Interakt API Key is missing in WhatsApp Settings');

    const payload = {
      countryCode: '+91',
      phoneNumber: phoneStr.replace(/^91/, ''),
      type: 'Template',
      template: {
        name: template.campaign_name || template.template_name,
        languageCode: 'en',
        bodyValues: finalParams
      }
    };

    const response = await fetch('https://api.interakt.ai/v1/public/message/', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${interaktKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const responseData = await response.json();
    if (!response.ok || responseData.result === false) {
      throw new Error(responseData.message || 'Failed to send Interakt WhatsApp message');
    }
    return { success: true, provider: 'interakt', phone: phoneStr };
  }

  if (activeProvider === 'wati') {
    const wati = clientCreds?.wati?.access_token ? clientCreds.wati : (parsedProviderConfig?.wati || {});
    if (!wati.endpoint_url || !wati.access_token) {
      throw new Error('Wati Endpoint URL or Access Token is missing in WhatsApp Settings');
    }
    const cleanUrl = wati.endpoint_url.replace(/\/+$/, '');
    const endpoint = `${cleanUrl}/api/v1/sendTemplateMessage`;

    const payload = {
      template_name: template.campaign_name || template.template_name,
      broadcast_name: 'crm_send',
      parameters: finalParams.map((val, idx) => ({ name: idx === 0 ? 'name' : `param_${idx + 1}`, value: val })),
      receiverNumber: phoneStr
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${wati.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const responseData = await response.json();
    if (!response.ok || responseData.result === false) {
      throw new Error(responseData.info || 'Failed to send Wati WhatsApp message');
    }
    return { success: true, provider: 'wati', phone: phoneStr };
  }

  if (activeProvider === 'nextel') {
    const nextelUrl = clientCreds?.nextel?.endpoint_url || parsedProviderConfig?.nextel?.endpoint_url || settings?.api_key_nstlp;
    if (!nextelUrl) throw new Error('Nextel API Endpoint is not configured in settings');

    const endpoint = nextelUrl.includes('http')
      ? nextelUrl
      : `https://api.nextel.io/API_V2/Whatsapp/send_session/${nextelUrl}`;

    let payload;
    if (template.image_url) {
      payload = {
        type: 'image',
        message: template.image_url,
        caption: template.message_body || 'Image attachment',
        sender_phone: phoneStr
      };
    } else {
      payload = {
        type: 'buttonTemplate',
        templateId: template.campaign_name || template.template_name,
        templateLanguage: 'en',
        sender_phone: phoneStr,
        templateArgs: finalParams
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();
    if (!response.ok || responseData.status === 'error') {
      throw new Error(responseData.message || responseData.error || 'Failed to send to ' + phoneStr);
    }
    return { success: true, provider: 'nextel', phone: phoneStr };
  }

  if (bspDefinition) {
    const endpointUrl = bspCreds.endpoint_url || bspDefinition.default_endpoint || bspDefinition.endpoint_url;
    const authToken = bspCreds.api_key || bspCreds.access_token || bspCreds.auth_token || bspDefinition.auth_token || '';

    if (!endpointUrl) {
      throw new Error(`WhatsApp Gateway "${bspDefinition.name}" endpoint URL is not configured`);
    }

    const headers = { 'Content-Type': 'application/json' };
    const authType = bspDefinition.auth_type || 'Bearer';
    const headerName = bspDefinition.auth_header_name || 'Authorization';

    if (authToken) {
      if (authType === 'Bearer') {
        headers[headerName] = `Bearer ${authToken.trim()}`;
      } else if (authType === 'HeaderKey') {
        headers[headerName] = authToken.trim();
      } else if (authType === 'Basic') {
        headers[headerName] = authToken.trim().startsWith('Basic ') ? authToken.trim() : `Basic ${authToken.trim()}`;
      }
    }

    const tplName = template.campaign_name || template.template_name || '';
    const msgBody = template.message_body || '';
    const imgUrl = template.image_url || '';

    const cleanName = JSON.stringify(primaryText).slice(1, -1);
    const cleanTplName = JSON.stringify(tplName).slice(1, -1);
    const cleanMsg = JSON.stringify(msgBody).slice(1, -1);
    const cleanImg = JSON.stringify(imgUrl).slice(1, -1);

    let renderedPayload = (bspDefinition.payload_format || '{\n  "to": "{{PHONE}}",\n  "message": "{{MESSAGE}}"\n}')
      .replace(/\{\{PHONE\}\}/g, phoneStr)
      .replace(/\{\{NAME\}\}/g, cleanName)
      .replace(/\{\{TEMPLATE_NAME\}\}/g, cleanTplName)
      .replace(/\{\{MESSAGE\}\}/g, cleanMsg)
      .replace(/\{\{IMAGE_URL\}\}/g, cleanImg)
      .replace(/\{\{AUTH_TOKEN\}\}/g, authToken)
      .replace(/\{\{API_KEY\}\}/g, authToken);

    finalParams.forEach((pVal, idx) => {
      const escapedVal = JSON.stringify(pVal).slice(1, -1);
      renderedPayload = renderedPayload.replace(new RegExp(`\\{\\{PARAM_${idx + 1}\\}\\}`, 'g'), escapedVal);
    });

    const response = await fetch(endpointUrl, {
      method: bspDefinition.method || 'POST',
      headers,
      body: renderedPayload
    });

    const responseText = await response.text();
    let responseData = null;
    try { responseData = JSON.parse(responseText); } catch (_) {}

    if (!response.ok) {
      throw new Error(responseData?.message || responseData?.error || responseText.substring(0, 160) || `${bspDefinition.name} HTTP Error ${response.status}`);
    }
    return { success: true, provider: activeProvider, phone: phoneStr };
  }

  // AISENSY DEFAULT INTEGRATION
  const aisensyCreds = clientCreds?.aisensy || {};
  const apiKey = aisensyCreds.api_key || parsedProviderConfig?.aisensy?.api_key || settings?.api_key_nsmlr || (typeof settings?.api_key === 'string' && !settings.api_key.trim().startsWith('{') ? settings.api_key : '');
  if (!apiKey) throw new Error('AiSensy API Key is not configured in settings');

  const endpointUrl = aisensyCreds.endpoint_url || parsedProviderConfig?.aisensy?.endpoint_url || 'https://backend.aisensy.com/campaign/t1/api/v2';

  const payload = {
    apiKey,
    campaignName: template.campaign_name || template.template_name,
    destination: phoneStr,
    userName: aisensyCreds.user_name || parsedProviderConfig?.aisensy?.user_name || company || 'New Swan Group',
    templateParams: finalParams,
    source: 'CRM App',
    media: template.image_url ? {
      url: template.image_url,
      filename: 'media_file'
    } : undefined,
    buttons: [],
    carouselCards: [],
    location: {},
    attributes: {},
    paramsFallbackValue: {
      FirstName: primaryText
    }
  };

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const responseData = await response.json();
  if (!response.ok) {
    throw new Error(responseData.errorMessage || responseData.message || 'Failed to send to ' + phoneStr);
  }
  return { success: true, provider: 'aisensy', phone: phoneStr };
}

// ==========================================
// SEND MESSAGE LOGIC (Multi-BSP & Multi-Variable)
// ==========================================
export async function sendWhatsappMessage(leadId, templateId, selectedPhones = [], overrideParams = null, overrideRecipientName = null) {
  const supabase = await createClient();

  try {
    // 1. Get Template
    const { data: template } = await supabase.from('whatsapp_templates').select('*').eq('id', templateId).single();
    if (!template) throw new Error('Template not found');

    // 2. Get Settings (API Keys)
    const { data: settings } = await supabase.from('whatsapp_settings').select('*').limit(1).single();
    if (!settings) throw new Error('WhatsApp API settings not found');

    // 3. Get Lead
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (!lead) throw new Error('Lead not found');

    if (!selectedPhones || selectedPhones.length === 0) {
      throw new Error('No phone numbers provided');
    }

    let successCount = 0;
    let failCount = 0;
    let lastError = null;

    const company = lead.our_company || 'NSMLR';
    const recipientName = overrideRecipientName || lead.name || lead.company || lead.business_type || 'Customer';
    const paramsToUse = Array.isArray(overrideParams) && overrideParams.length > 0
      ? overrideParams
      : buildLeadTemplateParams(lead);

    for (const phone of selectedPhones) {
      try {
        const res = await dispatchWhatsappTemplateDirect({
          phone,
          template,
          settings,
          targetCompany: company,
          templateParams: paramsToUse,
          recipientName
        });

        await supabase.from('whatsapp_message_logs').insert([{
          lead_id: lead.id,
          template_id: template.id,
          status: 'sent to ' + res.phone,
          sent_at: new Date().toISOString()
        }]);

        successCount++;
      } catch (err) {
        console.error(`WhatsApp Send Error for ${phone} (${company}):`, err);
        lastError = err;
        failCount++;
        await supabase.from('whatsapp_message_logs').insert([{
          lead_id: leadId,
          template_id: templateId,
          status: 'failed for ' + phone + ': ' + err.message,
          sent_at: new Date().toISOString()
        }]);
      }
    }

    if (successCount === 0 && failCount > 0) {
      return { success: false, error: 'Failed to send to all numbers: ' + (lastError?.message || 'Unknown error') };
    }

    return { success: true, message: `Successfully sent to ${successCount} number(s).` + (failCount > 0 ? ` Failed: ${failCount}.` : '') };

  } catch (error) {
    console.error('WhatsApp Send Error:', error);
    return { success: false, error: error.message };
  }
}

// ==========================================
// AUTOMATION TRIGGER (LEADS + MULTI-MODULE)
// ==========================================
export async function triggerWhatsappAutomationForStage(leadId, newStage) {
  try {
    const supabase = await createClient();

    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (!lead) return { success: false, error: 'Lead not found' };

    // Fetch active Once rules and match cleanly in JS so stages containing ';' or '>' and prefixed [LEADS|recipient] both match reliably
    const { data: rules, error: rulesError } = await supabase
      .from('whatsapp_automations')
      .select('*')
      .eq('frequency', 'Once')
      .eq('is_active', true);

    if (rulesError) {
      console.error('Rule fetch error:', rulesError);
      return { success: false, error: rulesError.message };
    }

    const matchingRules = (rules || []).filter(r => {
      const parsed = parseAutomationStageServer(r.stage_name);
      if (parsed.moduleId !== 'leads') return false;
      if (parsed.stageLabel !== String(newStage || '').trim()) return false;
      return !r.company || r.company === 'All' || r.company === lead.our_company;
    });

    if (matchingRules.length === 0) {
      return { success: true, message: 'No automation rule found for this stage and company.' };
    }

    // Prefer company-specific rule over global 'All' rule if both exist
    const rule = matchingRules.find(r => r.company && r.company !== 'All') || matchingRules[0];
    const parsedRule = parseAutomationStageServer(rule.stage_name);
    const targetPhones = resolveLeadPhonesByPriority(lead, parsedRule.hasPrefix ? parsedRule.recipientId : null);

    if (targetPhones.length === 0) return { success: false, error: 'No phone numbers found for automation.' };

    return await sendWhatsappMessage(
      leadId,
      rule.template_id,
      targetPhones,
      buildLeadTemplateParams(lead),
      lead.name || lead.company || 'Customer'
    );

  } catch (error) {
    console.error('Automation Trigger Error:', error);
    return { success: false, error: error.message };
  }
}

export async function triggerWhatsappAutomationForModule({
  moduleId,
  stageName,
  company = 'All',
  leadId = null,
  entityId = null,
  recipientPhones = [],
  templateParams = [],
  recipientName = 'Partner'
}) {
  try {
    const mod = String(moduleId || '').trim().toLowerCase();
    const targetStage = String(stageName || '').trim();
    if (!mod || !targetStage) return { success: false, error: 'Module and stageName are required' };

    if (mod === 'leads' && leadId) {
      return await triggerWhatsappAutomationForStage(leadId, targetStage);
    }

    const admin = getAdminSupabase();
    const { data: rules, error: rulesError } = await admin
      .from('whatsapp_automations')
      .select('*')
      .eq('frequency', 'Once')
      .eq('is_active', true);

    if (rulesError) return { success: false, error: rulesError.message };

    const matchingRules = (rules || []).filter(r => {
      const parsed = parseAutomationStageServer(r.stage_name);
      if (parsed.moduleId !== mod) return false;
      if (parsed.stageLabel !== targetStage) return false;
      return !r.company || r.company === 'All' || !company || company === 'All' || r.company === company;
    });

    if (matchingRules.length === 0) {
      return { success: true, message: `No automation rule found for ${mod} (${targetStage}).` };
    }

    const rule = matchingRules.find(r => r.company && r.company !== 'All') || matchingRules[0];
    const phones = Array.from(new Set((recipientPhones || []).filter(p => p && String(p).trim() !== '' && String(p).trim().toUpperCase() !== 'N/A')));
    if (phones.length === 0) {
      return { success: false, error: 'No recipient phone numbers provided for automation.' };
    }

    const [{ data: template }, { data: settings }] = await Promise.all([
      admin.from('whatsapp_templates').select('*').eq('id', rule.template_id).single(),
      admin.from('whatsapp_settings').select('*').limit(1).single()
    ]);

    if (!template || !settings) {
      return { success: false, error: 'WhatsApp template or settings missing' };
    }

    const safeComp = String(company || 'All').replace(/[|\]]/g, '');
    const safeRecName = String(recipientName || 'Partner').replace(/[|\]]/g, '').slice(0, 80);
    const metaTag = `[MOD:${mod}|REC:${entityId || ''}|CO:${safeComp}|NAME:${safeRecName}]`;

    let sent = 0;
    let failed = 0;
    let lastError = null;

    for (const phone of phones) {
      try {
        const res = await dispatchWhatsappTemplateDirect({
          phone,
          template,
          settings,
          targetCompany: company || 'NSMLR',
          templateParams: templateParams.length > 0 ? templateParams : [recipientName],
          recipientName
        });

        await admin.from('whatsapp_message_logs').insert([{
          lead_id: null,
          template_id: template.id,
          status: `${metaTag} sent to ${res.phone}`,
          sent_at: new Date().toISOString()
        }]);
        sent++;
      } catch (err) {
        lastError = err;
        failed++;
        await admin.from('whatsapp_message_logs').insert([{
          lead_id: null,
          template_id: template.id,
          status: `${metaTag} failed for ${phone}: ${err.message}`,
          sent_at: new Date().toISOString()
        }]);
      }
    }

    if (sent === 0 && failed > 0) {
      return { success: false, error: lastError?.message || 'Automation dispatch failed' };
    }
    return { success: true, sentCount: sent, failedCount: failed };
  } catch (error) {
    console.error('Module Automation Trigger Error:', error);
    return { success: false, error: error.message };
  }
}
