'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

// ==========================================
// SETTINGS
// ==========================================
export async function getWhatsappSettings() {
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
  return { success: true, data: data || null };
}

export async function saveWhatsappSettings(nsmlrKey, nstlpKey) {
  const supabase = await createClient();
  
  // Check if setting exists
  const { data: existing } = await supabase.from('whatsapp_settings').select('id').limit(1).single();
  
  let result;
  if (existing) {
    result = await supabase.from('whatsapp_settings').update({ 
      api_key_nsmlr: nsmlrKey, 
      api_key_nstlp: nstlpKey, 
      updated_at: new Date().toISOString() 
    }).eq('id', existing.id);
  } else {
    result = await supabase.from('whatsapp_settings').insert([{ 
      api_key_nsmlr: nsmlrKey,
      api_key_nstlp: nstlpKey
    }]);
  }

  if (result.error) return { success: false, error: result.error.message };
  revalidatePath('/');
  return { success: true };
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

        if (company === 'NSTLP') {
          // =======================
          // NEXTEL API INTEGRATION
          // =======================
          if (!settings.api_key_nstlp) throw new Error("Nextel API Key is not configured in settings for NSTLP");

          // The user provided the full Endpoint URL as the API key. 
          // If they just provide the token, we can build the URL, but let's assume it's the full endpoint.
          const endpoint = settings.api_key_nstlp.includes('http') 
                           ? settings.api_key_nstlp 
                           : `https://api.nextel.io/API_V2/Whatsapp/send_session/${settings.api_key_nstlp}`;

          // If there's an image attachment, Nextel requires a different payload type
          let payload;
          if (template.image_url) {
             payload = {
               type: "image", // or document/audio/video based on extension, assuming image
               message: template.image_url,
               caption: template.message_body || "Image attachment",
               sender_phone: phoneStr
             };
          } else {
             payload = {
               type: "buttonTemplate",
               templateId: template.campaign_name, // Nextel template ID
               templateLanguage: "en",
               sender_phone: phoneStr,
               templateArgs: [
                 lead.name || lead.company || lead.business_type || "Customer" // Dynamic variables matching AiSensy style for simplicity
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

        } else {
          // =======================
          // AISENSY API INTEGRATION
          // =======================
          if (!settings.api_key_nsmlr && !settings.api_key) throw new Error("AiSensy API Key is not configured for NSMLR");
          const apiKey = settings.api_key_nsmlr || settings.api_key;

          const payload = {
            apiKey: apiKey,
            campaignName: template.campaign_name,
            destination: phoneStr,
            userName: "New Swan MultiTech Limited-Swan Agro",
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
          status: 'sent to ' + phoneStr
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
          status: 'failed for ' + phone + ': ' + err.message
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
