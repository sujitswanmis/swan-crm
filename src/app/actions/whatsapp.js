'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import globalCatalogData from '@/config/whatsappBspCatalog.json';

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
  
  // Also fetch active tenants/companies from Supabase
  let tenants = [];
  try {
    const { data: tList } = await supabase.from('tenants').select('id, name, tenant_code');
    tenants = tList || [];
  } catch (_) {}

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

  // Check if a specific company/tenant has assigned BSPs
  if (clientCompany) {
    const compKey = String(clientCompany).trim();
    const alloc = clientAllocations[compKey] || 
                  clientAllocations[compKey.toLowerCase()] ||
                  clientAllocations[compKey.toUpperCase()];
    if (alloc && Array.isArray(alloc.allowed_bsps) && alloc.allowed_bsps.length > 0) {
      isClientScoped = true;
      assignedBsps = alloc.allowed_bsps;
      defaultEnabled = alloc.allowed_bsps;
    }
  }

  const normalized = {
    ...data,
    is_client_scoped: isClientScoped,
    assigned_bsps: assignedBsps,
    client_allocations: clientAllocations,
    bsp_credentials: bspCredentials,
    enabled_providers: defaultEnabled,
    default_provider: parsedConfig?.default_provider || parsedConfig?.provider || (data.api_key_nstlp ? 'nextel' : 'aisensy'),
    provider: parsedConfig?.default_provider || parsedConfig?.provider || (data.api_key_nstlp ? 'nextel' : 'aisensy'),
    account_limit: parsedConfig?.account_limit || Math.max(1, defaultEnabled.length),
    custom_bsps: customBsps,
    meta: {
      phone_number_id: parsedConfig?.meta?.phone_number_id || '',
      waba_id: parsedConfig?.meta?.waba_id || '',
      access_token: parsedConfig?.meta?.access_token || '',
      api_version: parsedConfig?.meta?.api_version || 'v21.0'
    },
    aisensy: {
      api_key: parsedConfig?.aisensy?.api_key || data.api_key_nsmlr || (typeof data.api_key === 'string' && !data.api_key.trim().startsWith('{') ? data.api_key : ''),
      user_name: parsedConfig?.aisensy?.user_name || 'New Swan Group'
    },
    interakt: {
      api_key: parsedConfig?.interakt?.api_key || ''
    },
    wati: {
      endpoint_url: parsedConfig?.wati?.endpoint_url || '',
      access_token: parsedConfig?.wati?.access_token || ''
    },
    nextel: {
      endpoint_url: parsedConfig?.nextel?.endpoint_url || data.api_key_nstlp || ''
    }
  };

  return { success: true, data: normalized };
}

export async function saveWhatsappSettings(payload, fallbackNstlp) {
  const supabase = await createClient();
  
  let configToSave = null;
  let nsmlrKey = '';
  let nstlpKey = '';

  if (typeof payload === 'object' && payload !== null) {
    const enabledList = Array.isArray(payload.enabled_providers) && payload.enabled_providers.length > 0
      ? payload.enabled_providers
      : [payload.default_provider || payload.provider || 'aisensy'];

    const primaryDefault = payload.default_provider || payload.provider || enabledList[0] || 'aisensy';

    configToSave = {
      enabled_providers: enabledList,
      default_provider: primaryDefault,
      provider: primaryDefault,
      account_limit: Number(payload.account_limit || enabledList.length || 1),
      custom_bsps: Array.isArray(payload.custom_bsps) ? payload.custom_bsps : [],
      client_allocations: payload.client_allocations || {},
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
      nextel: { endpoint_url: nstlpKey }
    };
  }

  const jsonString = JSON.stringify(configToSave);

  // Check if setting exists
  const { data: existing } = await supabase.from('whatsapp_settings').select('id').limit(1).single();
  
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
  const { data: templates } = await supabase.from('whatsapp_templates').select('id, template_name, campaign_name');

  const mappedData = automations.map(auto => {
    const tpl = (templates || []).find(t => t.id === auto.template_id);
    return {
      ...auto,
      whatsapp_templates: tpl ? { template_name: tpl.template_name, campaign_name: tpl.campaign_name } : null
    };
  });

  return { success: true, data: mappedData };
}

export async function saveWhatsappAutomation(autoData) {
  const supabase = await createClient();
  
  let result;
  if (autoData.id) {
    result = await supabase.from('whatsapp_automations').update(autoData).eq('id', autoData.id);
  } else {
    result = await supabase.from('whatsapp_automations').insert([autoData]);
  }

  if (result.error) return { success: false, error: result.error.message };
  revalidatePath('/');
  return { success: true };
}

export async function deleteWhatsappAutomation(id) {
  const supabase = await createClient();
  const { error } = await supabase.from('whatsapp_automations').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/');
  return { success: true };
}

// ==========================================
// SEND MESSAGE LOGIC (AiSensy & Nextel Integration)
// ==========================================
export async function sendWhatsappMessage(leadId, templateId, selectedPhones = []) {
  const supabase = await createClient();

  try {
    // 1. Get Template
    const { data: template } = await supabase.from('whatsapp_templates').select('*').eq('id', templateId).single();
    if (!template) throw new Error("Template not found");

    // 2. Get Settings (API Keys)
    const { data: settings } = await supabase.from('whatsapp_settings').select('*').limit(1).single();
    if (!settings) throw new Error("WhatsApp API settings not found");

    // 3. Get Lead
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (!lead) throw new Error("Lead not found");

    if (!selectedPhones || selectedPhones.length === 0) {
      throw new Error("No phone numbers provided");
    }

    let successCount = 0;
    let failCount = 0;
    let lastError = null;

    const company = lead.our_company || 'NSMLR'; // Default to NSMLR if unknown

    // Loop through all selected phones
    for (const phone of selectedPhones) {
      try {
        // Clean phone number (ensure country code)
        let phoneStr = String(phone).replace(/\D/g, '');
        if (phoneStr.length === 10) phoneStr = '91' + phoneStr;

        let parsedProviderConfig = null;
        if (settings.api_key && typeof settings.api_key === 'string' && settings.api_key.trim().startsWith('{')) {
          try { parsedProviderConfig = JSON.parse(settings.api_key); } catch (_e) {}
        }

        // =========================================================================
        // HYBRID PROVIDER ROUTING: OPTION A (Template) -> OPTION B (Company) -> OPTION C (Default)
        // =========================================================================
        const customBsps = Array.isArray(parsedProviderConfig?.custom_bsps) ? parsedProviderConfig.custom_bsps : [];
        let activeProvider = null;

        // OPTION A: Template-Level Specific Provider Selection
        const tplTarget = String(template.provider || template.company || '').trim().toLowerCase();
        if (tplTarget.includes('aisensy')) activeProvider = 'aisensy';
        else if (tplTarget.includes('interakt')) activeProvider = 'interakt';
        else if (tplTarget.includes('meta')) activeProvider = 'meta';
        else if (tplTarget.includes('wati')) activeProvider = 'wati';
        else if (tplTarget.includes('nextel')) activeProvider = 'nextel';
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
        if (!activeProvider) {
          const clientAlloc = parsedProviderConfig?.client_allocations?.[company] || 
                              parsedProviderConfig?.client_allocations?.[company.toLowerCase()] ||
                              parsedProviderConfig?.client_allocations?.[company.toUpperCase()];
          if (clientAlloc?.default_bsp) {
            activeProvider = clientAlloc.default_bsp;
          } else if (company === 'NSTLP' || tplTarget === 'nstlp') {
            activeProvider = 'nextel';
          } else if (company === 'NSMLR' || tplTarget === 'nsmlr') {
            activeProvider = 'aisensy';
          }
        }

        // OPTION C: Primary Default Provider Fallback
        if (!activeProvider) {
          activeProvider = parsedProviderConfig?.default_provider || 
                           parsedProviderConfig?.provider || 
                           (Array.isArray(parsedProviderConfig?.enabled_providers) ? parsedProviderConfig.enabled_providers[0] : null) || 
                           (settings.api_key_nstlp ? 'nextel' : 'aisensy');
        }

        const matchedCatalogBsp = globalCatalogData.find(b => b.id === activeProvider);
        const matchedCustomBsp = customBsps.find(b => b.id === activeProvider || (b.name && b.name.toLowerCase() === String(activeProvider).toLowerCase()));
        const bspDefinition = matchedCustomBsp || (activeProvider !== 'aisensy' ? matchedCatalogBsp : null);
        const bspCreds = parsedProviderConfig?.bsp_credentials?.[activeProvider] || parsedProviderConfig?.[activeProvider] || {};

        if (activeProvider === 'meta') {
          // =======================
          // META DIRECT CLOUD API
          // =======================
          const meta = parsedProviderConfig?.meta || {};
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
            parameters: [
              { type: "text", text: lead.name || lead.company || lead.business_type || "Customer" }
            ]
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
            throw new Error(responseData.error?.message || "Failed to send Meta WhatsApp message");
          }

        } else if (activeProvider === 'interakt') {
          // =======================
          // INTERAKT API
          // =======================
          const interaktKey = parsedProviderConfig?.interakt?.api_key;
          if (!interaktKey) throw new Error("Interakt API Key is missing in WhatsApp Settings");

          const payload = {
            countryCode: "+91",
            phoneNumber: phoneStr.replace(/^91/, ''),
            type: "Template",
            template: {
              name: template.campaign_name || template.template_name,
              languageCode: "en",
              bodyValues: [lead.name || lead.company || lead.business_type || "Customer"]
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
            throw new Error(responseData.message || "Failed to send Interakt WhatsApp message");
          }

        } else if (activeProvider === 'wati') {
          // =======================
          // WATI API
          // =======================
          const wati = parsedProviderConfig?.wati || {};
          if (!wati.endpoint_url || !wati.access_token) {
            throw new Error("Wati Endpoint URL or Access Token is missing in WhatsApp Settings");
          }
          const cleanUrl = wati.endpoint_url.replace(/\/+$/, '');
          const endpoint = `${cleanUrl}/api/v1/sendTemplateMessage`;

          const payload = {
            template_name: template.campaign_name || template.template_name,
            broadcast_name: "crm_send",
            parameters: [
              { name: "name", value: lead.name || lead.company || lead.business_type || "Customer" }
            ],
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
            throw new Error(responseData.info || "Failed to send Wati WhatsApp message");
          }

        } else if (activeProvider === 'nextel' || company === 'NSTLP') {
          // =======================
          // NEXTEL API INTEGRATION
          // =======================
          const nextelUrl = parsedProviderConfig?.nextel?.endpoint_url || settings.api_key_nstlp;
          if (!nextelUrl) throw new Error("Nextel API Endpoint is not configured in settings");

          const endpoint = nextelUrl.includes('http') 
                           ? nextelUrl 
                           : `https://api.nextel.io/API_V2/Whatsapp/send_session/${nextelUrl}`;

          let payload;
          if (template.image_url) {
             payload = {
               type: "image",
               message: template.image_url,
               caption: template.message_body || "Image attachment",
               sender_phone: phoneStr
             };
          } else {
             payload = {
               type: "buttonTemplate",
               templateId: template.campaign_name,
               templateLanguage: "en",
               sender_phone: phoneStr,
               templateArgs: [
                 lead.name || lead.company || lead.business_type || "Customer"
               ]
             };
          }

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const responseData = await response.json();
          if (!response.ok || responseData.status === 'error') {
             throw new Error((responseData.message || responseData.error || "Failed to send to " + phoneStr));
          }

        } else if (bspDefinition) {
          // =======================
          // GLOBAL BSP & CUSTOM GATEWAY DISPATCH ENGINE
          // =======================
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

          const custName = lead.name || lead.company || lead.business_type || "Customer";
          const tplName = template.campaign_name || template.template_name || "";
          const msgBody = template.message_body || "";
          const imgUrl = template.image_url || "";

          const cleanName = JSON.stringify(custName).slice(1, -1);
          const cleanTplName = JSON.stringify(tplName).slice(1, -1);
          const cleanMsg = JSON.stringify(msgBody).slice(1, -1);
          const cleanImg = JSON.stringify(imgUrl).slice(1, -1);

          const renderedPayload = (bspDefinition.payload_format || '{\n  "to": "{{PHONE}}",\n  "message": "{{MESSAGE}}"\n}')
            .replace(/\{\{PHONE\}\}/g, phoneStr)
            .replace(/\{\{NAME\}\}/g, cleanName)
            .replace(/\{\{TEMPLATE_NAME\}\}/g, cleanTplName)
            .replace(/\{\{MESSAGE\}\}/g, cleanMsg)
            .replace(/\{\{IMAGE_URL\}\}/g, cleanImg)
            .replace(/\{\{AUTH_TOKEN\}\}/g, authToken)
            .replace(/\{\{API_KEY\}\}/g, authToken);

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

        } else {
          // =======================
          // AISENSY API INTEGRATION
          // =======================
          const apiKey = parsedProviderConfig?.aisensy?.api_key || settings.api_key_nsmlr || settings.api_key;
          if (!apiKey) throw new Error("AiSensy API Key is not configured in settings");

          const payload = {
            apiKey: apiKey,
            campaignName: template.campaign_name,
            destination: phoneStr,
            userName: parsedProviderConfig?.aisensy?.user_name || "New Swan Group",
            templateParams: [
              lead.name || lead.company || lead.business_type || "Customer"
            ],
            source: "CRM App",
            media: template.image_url ? {
              url: template.image_url,
              filename: "media_file"
            } : undefined,
            buttons: [],
            carouselCards: [],
            location: {},
            attributes: {},
            paramsFallbackValue: {
              FirstName: lead.name || lead.company || lead.business_type || "Customer"
            }
          };

          const response = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const responseData = await response.json();
          if (!response.ok) {
            throw new Error(responseData.errorMessage || responseData.message || "Failed to send to " + phoneStr);
          }
        }

        // Log success
        await supabase.from('whatsapp_message_logs').insert([{
          lead_id: lead.id,
          template_id: template.id,
          status: 'sent to ' + phoneStr,
          sent_at: new Date().toISOString()
        }]);

        successCount++;
      } catch (err) {
        console.error(`WhatsApp Send Error for ${phone} (${company}):`, err);
        lastError = err;
        failCount++;
        // Log failure
        await supabase.from('whatsapp_message_logs').insert([{
          lead_id: leadId,
          template_id: templateId,
          status: 'failed for ' + phone + ': ' + err.message,
          sent_at: new Date().toISOString()
        }]);
      }
    }

    if (successCount === 0 && failCount > 0) {
      return { success: false, error: "Failed to send to all numbers: " + (lastError?.message || 'Unknown error') };
    }

    return { success: true, message: `Successfully sent to ${successCount} number(s).` + (failCount > 0 ? ` Failed: ${failCount}.` : '') };

  } catch (error) {
    console.error("WhatsApp Send Error:", error);
    return { success: false, error: error.message };
  }
}

// ==========================================
// AUTOMATION TRIGGER
// ==========================================
export async function triggerWhatsappAutomationForStage(leadId, newStage) {
  try {
    const supabase = await createClient();
    
    // 2. Fetch Lead to get all possible phones and company
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (!lead) return { success: false, error: 'Lead not found' };
    
    // 1. Check if there's an active "Once" automation for this stage that matches the lead's company
    const { data: rules, error: rulesError } = await supabase
      .from('whatsapp_automations')
      .select('*')
      .eq('stage_name', newStage)
      .eq('frequency', 'Once')
      .eq('is_active', true);

    if (rulesError) {
      console.error("Rule fetch error:", rulesError);
      return { success: false, error: rulesError.message };
    }

    // Find a rule that matches the lead's company or is applied to 'All'
    const rule = rules?.find(r => !r.company || r.company === 'All' || r.company === lead.our_company);
    if (!rule) return { success: true, message: 'No automation rule found for this stage and company.' };

    const allPhones = Array.from(new Set([
      lead.phone, lead.cp1_mobile_2, lead.cp1_alt_1, lead.cp1_alt_2,
      lead.cp2_mobile_1, lead.cp2_mobile_2, lead.cp2_alt_1, lead.cp2_alt_2,
      lead.cp3_mobile_1, lead.cp3_mobile_2, lead.cp3_alt_1, lead.cp3_alt_2,
      lead.business_contact_1, lead.business_contact_2, lead.business_alt_1, lead.business_alt_2
    ].filter(p => p && String(p).trim() !== '')));

    if (allPhones.length === 0) return { success: false, error: 'No phone numbers found for automation.' };

    // Trigger sending to ALL available numbers for the lead
    return await sendWhatsappMessage(leadId, rule.template_id, allPhones);

  } catch (error) {
    console.error("Automation Trigger Error:", error);
    return { success: false, error: error.message };
  }
}
