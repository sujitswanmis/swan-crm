'use server';

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const TEMPLATES_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'tenant_message_templates.json');

const getAdminClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
