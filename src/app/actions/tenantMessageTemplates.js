'use server';

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const TEMPLATES_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'tenant_message_templates.json');

const getAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

const DEFAULT_TEMPLATES = {
  welcome: {
    enabled: true,
    title: 'Lead Welcome & Initial Greeting',
    content: 'Namaste {{name}} Ji! Thank you for contacting {{company}}. Our representative will get in touch with you shortly. You can also reply to this message for immediate assistance.'
  },
  followup: {
    enabled: true,
    title: 'Follow-Up Reminder',
    content: 'Hello {{name}} Ji, this is a follow-up reminder from {{company}} regarding our discussion about your requirement. Kindly let us know a suitable time to connect today.'
  },
  quotation: {
    enabled: true,
    title: 'Quotation / Proposal Shared',
    content: 'Dear {{name}}, your quotation #{{quote_no}} from {{company}} has been generated and sent to your email. Please review the proposal and let us know your confirmation.'
  },
  payment: {
    enabled: true,
    title: 'Payment Receipt & Invoice Confirmation',
    content: 'Dear {{name}}, we have received your payment of ₹{{amount}} for Invoice #{{invoice_no}}. Thank you for your business with {{company}}!'
  }
};

async function ensureConfigFile(filePath, defaultData = {}) {
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error(`Error ensuring template config file ${filePath}:`, err);
  }
}

async function readLocalTemplates() {
  try {
    await ensureConfigFile(TEMPLATES_FILE_PATH, {});
    const content = await fs.readFile(TEMPLATES_FILE_PATH, 'utf-8');
    return JSON.parse(content || '{}');
  } catch {
    return {};
  }
}

async function writeLocalTemplates(data) {
  try {
    await ensureConfigFile(TEMPLATES_FILE_PATH, {});
    await fs.writeFile(TEMPLATES_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing local templates file:', err);
  }
}

/**
 * Fetch workspace message templates
 */
export async function getTenantMessageTemplates(companyOrTenantId = 'Default') {
  try {
    const key = String(companyOrTenantId || 'Default').trim();
    const admin = getAdminClient();

    let dbData = null;
    try {
      const { data, error } = await admin
        .from('tenant_message_templates')
        .select('*')
        .or(`company.ilike.${key},tenant_id.eq.${key}`)
        .maybeSingle();

      if (!error && data) {
        dbData = data;
      }
    } catch (_) {}

    const localMap = await readLocalTemplates();
    const localData = localMap[key] || null;

    const finalTemplates = dbData?.templates || localData?.templates || DEFAULT_TEMPLATES;
    const senderPhone = dbData?.sender_phone || localData?.senderPhone || '';
    const senderEmail = dbData?.sender_email || localData?.senderEmail || '';

    return {
      success: true,
      templates: finalTemplates,
      senderPhone,
      senderEmail
    };
  } catch (err) {
    console.error('getTenantMessageTemplates error:', err);
    return {
      success: false,
      error: err.message,
      templates: DEFAULT_TEMPLATES,
      senderPhone: '',
      senderEmail: ''
    };
  }
}

/**
 * Save workspace message templates
 */
export async function saveTenantMessageTemplates({
  company = 'Default',
  tenantId = null,
  templates = DEFAULT_TEMPLATES,
  senderPhone = '',
  senderEmail = ''
}) {
  try {
    const key = String(company || 'Default').trim();
    const nowIso = new Date().toISOString();

    const payload = {
      company: key,
      tenant_id: tenantId,
      templates,
      sender_phone: (senderPhone || '').trim(),
      sender_email: (senderEmail || '').trim().toLowerCase(),
      updated_at: nowIso
    };

    // 1. Try upserting to Supabase
    try {
      const admin = getAdminClient();
      await admin.from('tenant_message_templates').upsert(payload, { onConflict: 'company' });
    } catch (_) {}

    // 2. Save to local fallback file
    const localMap = await readLocalTemplates();
    localMap[key] = {
      company: key,
      tenantId,
      templates,
      senderPhone: (senderPhone || '').trim(),
      senderEmail: (senderEmail || '').trim().toLowerCase(),
      updatedAt: nowIso
    };
    await writeLocalTemplates(localMap);

    // 3. Audit log
    try {
      const { logAuditAction } = await import('@/app/actions/audit');
      await logAuditAction('Update Message Templates', `Updated CRM message templates for ${key}`);
    } catch (_) {}

    return {
      success: true,
      message: 'Workspace message templates saved successfully!'
    };
  } catch (err) {
    console.error('saveTenantMessageTemplates error:', err);
    return { success: false, error: err.message };
  }
}

// =========================================================================
// WhatsApp Rich Templates Management (Text, Image, Video, Docs, Poll, Event)
// =========================================================================

const WA_TEMPLATES_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'whatsapp_templates.json');

const PREBUILT_WHATSAPP_TEMPLATES = [
  {
    id: 'tpl_wa_welcome',
    title: 'Lead Welcome & Initial Greeting',
    category: 'Greeting',
    type: 'TEXT',
    content: 'Namaste {{name}} Ji! 🙏\n\nThank you for getting in touch with *{{company}}*.\n\nOur agricultural machinery specialist will connect with you shortly. You can also reply directly to this message for immediate assistance or questions.\n\nWarm regards,\n*Team {{company}}*',
    created_at: '2026-10-17T18:00:00.000Z'
  },
  {
    id: 'tpl_wa_flagship_implements',
    title: 'Swan Agro Flagship Implements Showcase',
    category: 'Marketing',
    type: 'IMAGE',
    media_url: 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?w=900&auto=format&fit=crop&q=80',
    filename: 'swan_agro_implements.jpg',
    content: '🚜 *SWAN AGRO - Engineering Excellence for Maximum Farm Yield*\n\nDear {{name}} Ji,\n\nDiscover our complete range of tractor-mounted implements manufactured with Italian Boron Steel for heavy-duty soil performance:\n\n• *Rotavators* (Multi-speed & Single-speed)\n• *Laser Land Levellers* (High-precision hydraulic transmitter)\n• *Straw Reapers & Mulchers* (Clean field residue management)\n\n🌐 Explore catalog: {{link}}\n📞 Helpline: {{phone}}\n\n*Swan Agro - A Unit of New Swan Group*',
    created_at: '2026-10-17T18:00:00.000Z'
  },
  {
    id: 'tpl_wa_rotavator_demo',
    title: 'Heavy-Duty Rotavator In-Field Demo Video',
    category: 'Demonstration',
    type: 'VIDEO',
    media_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    filename: 'rotavator_field_demo.mp4',
    content: '🎬 *Watch the Swan Agro Heavy-Duty Rotavator in Action!*\n\nHello {{name}} Ji,\n\nWitness deep soil pulverization in harsh field conditions with 20% lower tractor diesel consumption.\n\n✅ Italian Boron Steel Blades\n✅ Heavy-duty cast iron gearbox\n✅ Factory warranty & doorstep support\n\nWould you like a live demo at your nearest dealership? Reply *DEMO* to schedule today!',
    created_at: '2026-10-17T18:00:00.000Z'
  },
  {
    id: 'tpl_wa_catalog_pdf',
    title: 'Comprehensive 2026 Machinery Catalog & Specifications',
    category: 'Documentation',
    type: 'DOCUMENT',
    media_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    filename: 'Swan_Agro_Full_Catalog_2026.pdf',
    content: '📄 *Swan Agro 2026 Full Implement Catalog & Technical Specs*\n\nDear {{name}},\n\nPlease find attached the official 2026 Machinery Catalog for *{{company}}*.\n\nIncludes complete HP compatibility charts, gear ratios, soil depth guidelines, and genuine spare parts breakdown.\n\nFor pricing or quotation, feel free to reply directly!',
    created_at: '2026-10-17T18:00:00.000Z'
  },
  {
    id: 'tpl_wa_tractor_hp_poll',
    title: 'Customer Tractor HP & Equipment Preference Poll',
    category: 'Survey',
    type: 'POLL',
    poll_question: 'Which tractor HP range do you operate, {{name}} Ji?',
    poll_options: [
      '35 HP - 45 HP (Utility / Compact)',
      '50 HP - 65 HP (Medium / Standard)',
      '75 HP - 90 HP (Heavy-Duty Farming)',
      '100+ HP (Commercial / Custom Hiring)'
    ],
    poll_multiple_choice: false,
    content: '📊 *Help us recommend the optimal implement size for your tractor!* Please cast your vote in the poll above.',
    created_at: '2026-10-17T18:00:00.000Z'
  },
  {
    id: 'tpl_wa_annual_expo_event',
    title: 'Annual Farmers & Dealers Machinery Expo 2026',
    category: 'Event & Invitation',
    type: 'EVENT',
    event_title: '🌾 Swan Agro Annual Machinery Expo & Farmers Meet 2026',
    event_description: 'Join us for live field machinery demonstrations, new model launches, exclusive dealer festive discounts, and direct interaction with senior agricultural engineers.',
    event_venue: 'Swan Agro Demonstration Grounds, G.T. Road, Ludhiana, Punjab',
    event_start_time: '2026-10-25 10:00 AM IST',
    event_end_time: '2026-10-25 05:00 PM IST',
    event_rsvp_url: 'https://newswangroup.com/expo-rsvp',
    content: '🎟️ *Official VIP Invitation for {{name}}*\n\nYou are cordially invited to our flagship annual machinery showcase. Click the registration link below to claim your complimentary delegate pass!',
    created_at: '2026-10-17T18:00:00.000Z'
  }
];

async function readLocalWaTemplates() {
  try {
    await ensureConfigFile(WA_TEMPLATES_FILE_PATH, { templates: PREBUILT_WHATSAPP_TEMPLATES });
    const content = await fs.readFile(WA_TEMPLATES_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(content || '{}');
    return Array.isArray(parsed?.templates) ? parsed.templates : PREBUILT_WHATSAPP_TEMPLATES;
  } catch {
    return PREBUILT_WHATSAPP_TEMPLATES;
  }
}

async function writeLocalWaTemplates(templates) {
  try {
    await ensureConfigFile(WA_TEMPLATES_FILE_PATH, { templates });
    await fs.writeFile(WA_TEMPLATES_FILE_PATH, JSON.stringify({ templates, updated_at: new Date().toISOString() }, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing local WhatsApp templates:', err);
  }
}

const UNOFFICIAL_CAMPAIGN_TAG = 'UNOFFICIAL_WA_TEMPLATE';

export async function getWhatsAppTemplates(companyOrTenantId = 'Default') {
  try {
    const admin = getAdminClient();
    let dbTemplates = null;

    // 1. Fetch from Supabase whatsapp_templates table where campaign_name is 'UNOFFICIAL_WA_TEMPLATE'
    try {
      if (admin) {
        const { data, error } = await admin
          .from('whatsapp_templates')
          .select('*')
          .eq('campaign_name', UNOFFICIAL_CAMPAIGN_TAG)
          .order('created_at', { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        dbTemplates = data.map(row => {
          let parsedBody = {};
          if (row.message_body && row.message_body.startsWith('{')) {
            try { parsedBody = JSON.parse(row.message_body); } catch (_) {}
          }
          return {
            id: row.id,
            supabase_id: row.id,
            title: row.template_name || parsedBody.title || 'Untitled Template',
            category: parsedBody.category || 'General',
            type: parsedBody.type || (row.image_url ? 'IMAGE' : 'TEXT'),
            content: parsedBody.content !== undefined ? parsedBody.content : (row.message_body || ''),
            media_url: row.image_url || parsedBody.media_url || '',
            filename: parsedBody.filename || 'document.pdf',
            poll_question: parsedBody.poll_question || '',
            poll_options: Array.isArray(parsedBody.poll_options) ? parsedBody.poll_options : ['Option 1', 'Option 2'],
            poll_multiple_choice: !!parsedBody.poll_multiple_choice,
            event_title: parsedBody.event_title || '',
            event_description: parsedBody.event_description || '',
            event_venue: parsedBody.event_venue || '',
            event_start_time: parsedBody.event_start_time || '',
            event_rsvp_url: parsedBody.event_rsvp_url || '',
            created_at: row.created_at,
            updated_at: parsedBody.updated_at || row.created_at
          };
        });
      }
      }
    } catch (dbErr) {
      console.warn('Notice: Background Supabase fetch for whatsapp templates:', dbErr.message);
    }

    // 2. Read local templates file
    const localTemplates = await readLocalWaTemplates();

    if (dbTemplates && dbTemplates.length > 0) {
      // Complement with any prebuilt templates not yet customized in DB
      const existingTitles = new Set(dbTemplates.map(t => (t.title || '').trim().toLowerCase()));
      const remainingPrebuilt = PREBUILT_WHATSAPP_TEMPLATES.filter(p => !existingTitles.has((p.title || '').trim().toLowerCase()));
      const combined = [...dbTemplates, ...remainingPrebuilt];

      // Sync local cache file in background
      writeLocalWaTemplates(combined).catch(() => {});
      return {
        success: true,
        source: 'supabase',
        templates: combined
      };
    }

    // 3. Fallback to local cache file / prebuilt
    const fallbackList = localTemplates && localTemplates.length > 0 ? localTemplates : PREBUILT_WHATSAPP_TEMPLATES;
    return {
      success: true,
      source: 'local',
      templates: fallbackList
    };
  } catch (err) {
    console.error('getWhatsAppTemplates error:', err);
    return { success: false, error: err.message, templates: PREBUILT_WHATSAPP_TEMPLATES };
  }
}

export async function saveWhatsAppTemplate({ company = 'Default', template }) {
  try {
    if (!template || !template.title?.trim()) {
      return { success: false, error: 'Template title is required.' };
    }

    const nowIso = new Date().toISOString();
    const admin = getAdminClient();

    // Check if ID is a valid Supabase UUID
    const isUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let supabaseId = template.supabase_id || (isUuid(template.id) ? template.id : null);

    // Prepare full JSON payload for rich properties
    const fullJson = JSON.stringify({
      title: template.title,
      category: template.category || 'General',
      type: template.type || 'TEXT',
      content: template.content || '',
      media_url: template.media_url || '',
      filename: template.filename || 'document.pdf',
      poll_question: template.poll_question || '',
      poll_options: Array.isArray(template.poll_options) ? template.poll_options : ['Option 1', 'Option 2'],
      poll_multiple_choice: !!template.poll_multiple_choice,
      event_title: template.event_title || '',
      event_description: template.event_description || '',
      event_venue: template.event_venue || '',
      event_start_time: template.event_start_time || '',
      event_rsvp_url: template.event_rsvp_url || '',
      updated_at: nowIso
    });

    const dbPayload = {
      template_name: template.title,
      campaign_name: UNOFFICIAL_CAMPAIGN_TAG,
      company: company || 'Swan Agro',
      image_url: template.media_url || null,
      message_body: fullJson
    };

    // 1. Try Upsert / Insert to Supabase
    try {
      if (admin) {
        if (supabaseId) {
          const { data, error } = await admin
            .from('whatsapp_templates')
            .update(dbPayload)
            .eq('id', supabaseId)
            .select();
          if (!error && data && data[0]) {
            supabaseId = data[0].id;
          }
        } else {
          const { data, error } = await admin
            .from('whatsapp_templates')
            .insert([dbPayload])
            .select();
          if (!error && data && data[0]) {
            supabaseId = data[0].id;
          }
        }
      }
    } catch (sbErr) {
      console.warn('Notice: Supabase write notice (local backup active):', sbErr.message);
    }

    // 2. Local File Save & Cache Sync
    const localTemplates = await readLocalWaTemplates();
    const assignedId = supabaseId || template.id || `tpl_wa_${Date.now()}`;
    const existingIdx = localTemplates.findIndex(t => t.id === template.id || (supabaseId && t.id === supabaseId));

    const templateData = {
      ...template,
      id: assignedId,
      supabase_id: supabaseId || undefined,
      updated_at: nowIso
    };

    if (existingIdx >= 0) {
      localTemplates[existingIdx] = templateData;
    } else {
      templateData.created_at = nowIso;
      localTemplates.unshift(templateData);
    }

    await writeLocalWaTemplates(localTemplates);

    return {
      success: true,
      message: supabaseId ? 'WhatsApp template safely synced to Supabase Cloud!' : 'WhatsApp template saved locally!',
      template: templateData,
      supabase_id: supabaseId
    };
  } catch (err) {
    console.error('saveWhatsAppTemplate error:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteWhatsAppTemplate({ company = 'Default', templateId }) {
  try {
    if (!templateId) return { success: false, error: 'Template ID required' };

    // 1. Try deleting from Supabase
    try {
      const admin = getAdminClient();
      if (admin) {
        await admin.from('whatsapp_templates').delete().eq('id', templateId);
      }
    } catch (_) {}

    // 2. Delete from Local Cache File
    const localTemplates = await readLocalWaTemplates();
    const filtered = localTemplates.filter(t => t.id !== templateId && t.supabase_id !== templateId);
    await writeLocalWaTemplates(filtered);

    return {
      success: true,
      message: 'Template deleted from Supabase & local storage.'
    };
  } catch (err) {
    console.error('deleteWhatsAppTemplate error:', err);
    return { success: false, error: err.message };
  }
}

// -------------------------------------------------------------
// Universal Variable Compiler (Internal)
// -------------------------------------------------------------
function compileTemplateVariables(rawText, variables = {}) {
  let text = String(rawText || '');
  const istDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }).format(new Date());
  const istTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' }).format(new Date());

  const defaults = {
    // 👤 Contact Person 1 (Primary)
    name: 'Ramesh Patel',
    phone: '+91 98765 43210',
    cp1_name: 'Ramesh Patel',
    cp1_mobile_1: '+91 98765 43210',
    cp1_mobile_2: '+91 98765 43211',
    cp1_alt_1: '+91 98765 43212',
    cp1_alt_2: '',
    email: 'ramesh.patel@example.com',
    cp1_email_1: 'ramesh.patel@example.com',
    cp1_email_2: '',

    // 👥 Contact Person 2
    cp2_name: 'Suresh Patel',
    cp2_mobile_1: '+91 98765 43213',
    cp2_mobile_2: '',
    cp2_alt_1: '',
    cp2_alt_2: '',
    cp2_email_1: 'suresh@example.com',
    cp2_email_2: '',

    // 👥 Contact Person 3
    cp3_name: 'Amit Kumar',
    cp3_mobile_1: '+91 98765 43214',
    cp3_mobile_2: '',
    cp3_alt_1: '',
    cp3_alt_2: '',
    cp3_email_1: '',
    cp3_email_2: '',

    // 🏢 Business Details
    company: 'Patel Agro Traders',
    business_type: 'Dealer',
    business_gst: '07AAAAA1111A1Z1',
    business_contact_1: '+91 98765 00001',
    business_contact_2: '+91 98765 00002',
    business_alt_1: '',
    business_alt_2: '',
    business_email_1: 'contact@patelagro.com',
    business_email_2: 'sales@patelagro.com',
    business_alt_email_1: '',
    business_alt_email_2: '',

    // 📍 Location
    state_name: 'Punjab',
    district_name: 'Ludhiana',
    city_name: 'Ludhiana',
    tehsil_name: 'Ludhiana West',
    block_name: 'Ludhiana',
    pin_code: '141001',
    address: 'GT Road, Near Grain Market, Ludhiana, Punjab',

    // 🎯 Lead Status & Source
    lead_ref_id: '202610170000042',
    lead_date: istDate,
    source: 'IndiaMART',
    source_name: 'Direct Campaign',
    status: '01 - New Stage > New Lead',
    priority: 'LP01: Immediate',
    assigned_to: 'Nitya Verma',
    entry_by: 'Admin Office',
    follow_up_date: istDate,

    // 💰 Commercial & Deal
    requirement: 'Heavy-Duty Rotavator 7 Feet',
    investment: '₹1 Lakh - ₹5 Lakh',
    buying_timeline: 'Immediate (Within 7 Days)',
    deal_value: '₹1,45,000',
    amount: '₹1,45,000',
    quote_no: 'SA-QT-2026',
    invoice_no: 'SA-INV-1092',

    // ⚡ System & Brand
    our_company: 'Swan Agro',
    date: istDate,
    time: istTime,
    link: 'https://newswangroup.com'
  };

  const merged = { ...defaults, ...variables };

  Object.entries(merged).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      const regex = new RegExp(`\\{\\{${k}\\}\\}`, 'gi');
      text = text.replace(regex, String(v));
    }
  });

  return text;
}

// -------------------------------------------------------------
// SEND TEST WHATSAPP TEMPLATE (Text, Image, Video, Docs, Poll, Event)
// -------------------------------------------------------------
export async function sendTestWhatsAppTemplate({ template, toNumber, instanceId, sampleData = {} }) {
  try {
    const adapter = await import('./whatsappUnofficialAdapter');
    const cleanNumber = await adapter.formatWhatsAppNumber(toNumber);
    if (!cleanNumber || cleanNumber.length < 10) {
      return { success: false, error: 'Please enter a valid 10-digit mobile number with country code.' };
    }

    const instKey = instanceId || process.env.WHATSAPP_UNOFFICIAL_DEFAULT_INSTANCE || '6AD37BDFCEDF5';
    const tType = String(template.type || 'TEXT').toUpperCase();

    // 1. Text Template
    if (tType === 'TEXT') {
      const compiled = compileTemplateVariables(template.content, sampleData);
      return adapter.sendText(instKey, cleanNumber, compiled);
    }

    // 2. Image Template
    if (tType === 'IMAGE') {
      if (!template.media_url) return { success: false, error: 'Image URL is missing.' };
      const compiled = compileTemplateVariables(template.content, sampleData);
      return adapter.sendMedia(instKey, cleanNumber, template.media_url, 'image', compiled, template.filename || 'image.jpg');
    }

    // 3. Video Template
    if (tType === 'VIDEO') {
      if (!template.media_url) return { success: false, error: 'Video URL is missing.' };
      const compiled = compileTemplateVariables(template.content, sampleData);
      return adapter.sendMedia(instKey, cleanNumber, template.media_url, 'video', compiled, template.filename || 'video.mp4');
    }

    // 4. Document / PDF Template
    if (tType === 'DOCUMENT') {
      if (!template.media_url) return { success: false, error: 'Document URL is missing.' };
      const compiled = compileTemplateVariables(template.content, sampleData);
      return adapter.sendMedia(instKey, cleanNumber, template.media_url, 'document', compiled, template.filename || 'document.pdf');
    }

    // 5. Poll Template
    if (tType === 'POLL') {
      const q = compileTemplateVariables(template.poll_question || 'Survey Question', sampleData);
      const opts = Array.isArray(template.poll_options) ? template.poll_options : ['Option 1', 'Option 2'];

      // Construct formatted WhatsApp interactive poll representation
      const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const pollText = [
        `📊 *POLL: ${q}*`,
        '',
        ...opts.map((opt, i) => `${numberEmojis[i] || `${i + 1}.`} ${compileTemplateVariables(opt, sampleData)}`),
        '',
        template.content ? compileTemplateVariables(template.content, sampleData) : '👉 _Reply with the option number or text to vote._'
      ].join('\n');

      return adapter.sendText(instKey, cleanNumber, pollText);
    }

    // 6. Event / Invitation Template
    if (tType === 'EVENT') {
      const evTitle = compileTemplateVariables(template.event_title || 'Event Invitation', sampleData);
      const evDesc = compileTemplateVariables(template.event_description || '', sampleData);
      const evVenue = compileTemplateVariables(template.event_venue || '', sampleData);
      const evTime = compileTemplateVariables(template.event_start_time || '', sampleData);
      const evLink = compileTemplateVariables(template.event_rsvp_url || '', sampleData);

      const eventText = [
        `🎟️ *INVITATION: ${evTitle}*`,
        '',
        evDesc ? `📝 *About Event:*\n${evDesc}\n` : '',
        evVenue ? `📍 *Venue:*\n${evVenue}` : '',
        evTime ? `⏰ *Date & Time:*\n${evTime}` : '',
        evLink ? `🔗 *RSVP / Details:*\n${evLink}` : '',
        '',
        template.content ? compileTemplateVariables(template.content, sampleData) : 'We look forward to welcoming you!'
      ].filter(Boolean).join('\n');

      return adapter.sendText(instKey, cleanNumber, eventText);
    }

    // Fallback
    const fallbackText = compileTemplateVariables(template.content || '', sampleData);
    return adapter.sendText(instKey, cleanNumber, fallbackText);
  } catch (err) {
    console.error('sendTestWhatsAppTemplate error:', err);
    return { success: false, error: err.message };
  }
}

