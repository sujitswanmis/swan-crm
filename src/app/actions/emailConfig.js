'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'email_campaign_settings.json');

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

// Default Configuration for Email Campaign / Messaging Gateway
const DEFAULT_CONFIG = {
  smtp: {
    enabled: true,
    provider: 'Custom SMTP',
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    from_name: 'SuPuja Creations Team',
    from_email: '',
    reply_to: '',
    signature: 'Best regards,\nSuPuja Creations Team'
  },
  smtp_accounts: [
    {
      id: 'smtp_primary',
      account_name: 'Primary Company Mail',
      is_default: true,
      enabled: true,
      provider: 'Custom SMTP',
      host: '',
      port: 587,
      secure: false,
      username: '',
      password: '',
      from_name: 'SuPuja Creations Team',
      from_email: '',
      reply_to: '',
      signature: 'Best regards,\nSuPuja Creations Team',
      branch: 'All Branches'
    }
  ],
  templates: [
    {
      id: 'tpl_lead_welcome',
      category: 'Sales Pipeline',
      template_name: 'Lead Welcome & Introduction',
      subject: 'Welcome to SuPuja Creations, {{name}}!',
      message_body: `Dear {{name}},\n\nThank you for reaching out to SuPuja Creations. We have received your inquiry for {{company}}.\n\nOur team is reviewing your requirements and your dedicated account representative {{rep_name}} will be in touch shortly.\n\nYour Reference ID: {{lead_ref_id}}\n\nWarm regards,\nSuPuja Creations Team`,
      target_pipeline: 'sales',
      target_stage: '01 - New Stage',
      created_at: new Date().toISOString()
    },
    {
      id: 'tpl_recruiter_interview',
      category: 'HR & Recruitment',
      template_name: 'Candidate Interview Invitation',
      subject: 'Interview Invitation with SuPuja Creations - {{job_title}}',
      message_body: `Dear {{candidate_name}},\n\nWe are pleased to invite you for an interview round for the position of {{job_title}} at SuPuja Creations.\n\nInterview Details:\n- Role: {{job_title}}\n- Candidate Ref: {{candidate_id}}\n- Recruiter: {{recruiter_name}}\n\nPlease reply to this email to confirm your availability.\n\nBest regards,\nHR Department\nSuPuja Creations`,
      target_pipeline: 'recruiter',
      target_stage: 'S03',
      created_at: new Date().toISOString()
    },
    {
      id: 'tpl_recruiter_loi',
      category: 'HR & Recruitment',
      template_name: 'Letter of Intent (LOI) Release',
      subject: 'Letter of Intent (LOI) - SuPuja Creations',
      message_body: `Dear {{candidate_name}},\n\nCongratulations! We are delighted to extend our Letter of Intent (LOI) for the position of {{job_title}} with SuPuja Creations.\n\nWe look forward to having you onboard.\n\nSincerely,\nHR & Talent Acquisition Team\nSuPuja Creations`,
      target_pipeline: 'recruiter',
      target_stage: 'S08',
      created_at: new Date().toISOString()
    }
  ],
  automations: [
    {
      id: 'auto_welcome_01',
      name: 'Auto-Welcome on Lead Creation',
      pipeline: 'sales',
      stage_id: '01 - New Stage',
      stage_label: '01 - New Stage',
      template_id: 'tpl_lead_welcome',
      is_active: true,
      delay_minutes: 0,
      created_at: new Date().toISOString()
    },
    {
      id: 'auto_recruiter_interview',
      name: 'Auto Interview Invite on S03',
      pipeline: 'recruiter',
      stage_id: 'S03',
      stage_label: 'S03 - Interview Executed',
      template_id: 'tpl_recruiter_interview',
      is_active: true,
      delay_minutes: 0,
      created_at: new Date().toISOString()
    }
  ],
  logs: []
};

// Helpers: Resolve Tenant Storage Key & File Path
function getTenantConfigStorageKey(companyOrTenantId = '') {
  const norm = String(companyOrTenantId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (!norm || norm === 'default' || norm === 'supuja_creations' || norm === 'e7d483b2-3fcb-4eb2-9d39-e932b7bb5ff4') {
    return 'messaging_email_config';
  }
  return `messaging_email_config_${norm}`;
}

function getTenantConfigFilePath(companyOrTenantId = '') {
  const norm = String(companyOrTenantId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (!norm || norm === 'default' || norm === 'supuja_creations' || norm === 'e7d483b2-3fcb-4eb2-9d39-e932b7bb5ff4') {
    return CONFIG_FILE_PATH;
  }
  return path.join(process.cwd(), 'src', 'config', `email_campaign_settings_${norm}.json`);
}

// Helper: Ensure config file exists
async function ensureConfigFile(targetPath = CONFIG_FILE_PATH) {
  try {
    const dir = path.dirname(targetPath);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(targetPath);
    } catch {
      await fs.writeFile(targetPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('ensureConfigFile error:', e);
  }
}

// Helper: Normalize multiple SMTP accounts with backward compatibility
function normalizeSmtpAccounts(rawObj = {}) {
  const legacySmtp = rawObj.smtp || DEFAULT_CONFIG.smtp;
  let accounts = Array.isArray(rawObj.smtp_accounts) && rawObj.smtp_accounts.length > 0
    ? [...rawObj.smtp_accounts]
    : [];

  if (accounts.length === 0) {
    accounts = [
      {
        id: 'smtp_primary',
        account_name: legacySmtp.provider ? `${legacySmtp.provider} (Primary)` : 'Primary Company Mail',
        is_default: true,
        enabled: legacySmtp.enabled ?? true,
        provider: legacySmtp.provider || 'Custom SMTP',
        host: legacySmtp.host || '',
        port: Number(legacySmtp.port) || 587,
        secure: legacySmtp.secure || false,
        username: legacySmtp.username || '',
        password: legacySmtp.password || '',
        from_name: legacySmtp.from_name || 'SuPuja Creations Team',
        from_email: legacySmtp.from_email || '',
        reply_to: legacySmtp.reply_to || '',
        signature: legacySmtp.signature || '',
        branch: 'All Branches'
      }
    ];
  }

  // Ensure exactly one is default
  const defaultIdx = accounts.findIndex(a => a.is_default);
  if (defaultIdx === -1 && accounts.length > 0) {
    accounts[0].is_default = true;
  }

  const defaultAccount = accounts.find(a => a.is_default) || accounts[0];
  const primarySmtp = {
    ...legacySmtp,
    ...defaultAccount
  };

  return { accounts, defaultAccount, primarySmtp };
}

// Helper: Check Tenant SMTP Account Quota from SaaS Settings
export async function getTenantSmtpQuota(companyOrTenantId = '', isMasterAdmin = false) {
  if (isMasterAdmin) {
    return { limit: 999, is_unlimited: true };
  }
  try {
    const supabase = getAdminClient();
    const { data: limitsData } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'tenant_smtp_limits')
      .maybeSingle();

    const limitsMap = limitsData?.value || {};
    const normalizedKey = String(companyOrTenantId || '').trim();

    // Check direct match in limits map
    if (normalizedKey && limitsMap[normalizedKey] !== undefined) {
      return { limit: Math.max(1, Number(limitsMap[normalizedKey])), is_unlimited: false };
    }

    // Try finding tenant in tenants table by id, code, or name
    if (normalizedKey) {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name, tenant_code');

      const found = (tenants || []).find(t => 
        t.id === normalizedKey ||
        (t.tenant_code && t.tenant_code.toLowerCase() === normalizedKey.toLowerCase()) ||
        (t.name && t.name.toLowerCase() === normalizedKey.toLowerCase())
      );

      if (found) {
        // Master/HQ tenant is unlimited
        if (found.id === 'e7d483b2-3fcb-4eb2-9d39-e932b7bb5ff4') {
          return { limit: 999, is_unlimited: true };
        }
        const lim = limitsMap[found.id] ?? limitsMap[found.tenant_code] ?? limitsMap[found.name];
        if (lim !== undefined) {
          return { limit: Math.max(1, Number(lim)), is_unlimited: false };
        }
      }
    }

    // Default 1 SMTP account for any standard tenant
    return { limit: 1, is_unlimited: false };
  } catch (err) {
    console.error('getTenantSmtpQuota error:', err);
    return { limit: 1, is_unlimited: false };
  }
}

// Get Email Campaign & SMTP Configuration
export async function getEmailConfig(companyOrTenantId = '', isMasterAdmin = false) {
  try {
    const targetFilePath = getTenantConfigFilePath(companyOrTenantId);
    await ensureConfigFile(targetFilePath);
    
    // Fetch quota for tenant
    const quota = await getTenantSmtpQuota(companyOrTenantId, isMasterAdmin);
    const storageKey = getTenantConfigStorageKey(companyOrTenantId);

    // First try Supabase system_settings
    const supabase = getAdminClient();
    const { data: dbData, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', storageKey)
      .maybeSingle();

    if (!error && dbData && dbData.value) {
      const { accounts, primarySmtp } = normalizeSmtpAccounts(dbData.value);
      return {
        success: true,
        data: {
          smtp: primarySmtp,
          smtp_accounts: accounts,
          smtp_limit: quota.limit,
          is_unlimited: quota.is_unlimited,
          templates: dbData.value.templates || DEFAULT_CONFIG.templates,
          automations: dbData.value.automations || DEFAULT_CONFIG.automations,
          logs: (dbData.value.logs || []).slice(0, 50)
        }
      };
    }

    // Fallback to JSON file
    try {
      const fileContent = await fs.readFile(targetFilePath, 'utf8');
      const parsed = JSON.parse(fileContent);
      const { accounts, primarySmtp } = normalizeSmtpAccounts(parsed);
      return {
        success: true,
        data: {
          smtp: primarySmtp,
          smtp_accounts: accounts,
          smtp_limit: quota.limit,
          is_unlimited: quota.is_unlimited,
          templates: parsed.templates || DEFAULT_CONFIG.templates,
          automations: parsed.automations || DEFAULT_CONFIG.automations,
          logs: (parsed.logs || []).slice(0, 50)
        }
      };
    } catch {
      const { accounts, primarySmtp } = normalizeSmtpAccounts(DEFAULT_CONFIG);
      return {
        success: true,
        data: {
          ...DEFAULT_CONFIG,
          smtp: primarySmtp,
          smtp_accounts: accounts,
          smtp_limit: quota.limit,
          is_unlimited: quota.is_unlimited
        }
      };
    }
  } catch (error) {
    console.error('getEmailConfig error:', error);
    const { accounts, primarySmtp } = normalizeSmtpAccounts(DEFAULT_CONFIG);
    return { 
      success: true, 
      data: {
        ...DEFAULT_CONFIG,
        smtp: primarySmtp,
        smtp_accounts: accounts,
        smtp_limit: 1,
        is_unlimited: false
      }
    };
  }
}

// Save Full Email Configuration (SMTP, Templates, Automations)
export async function saveEmailConfig(newConfig, companyOrTenantId = '') {
  try {
    const targetFilePath = getTenantConfigFilePath(companyOrTenantId);
    await ensureConfigFile(targetFilePath);
    const supabase = getAdminClient();
    const storageKey = getTenantConfigStorageKey(companyOrTenantId);

    const { accounts, primarySmtp } = normalizeSmtpAccounts(newConfig);

    const configToSave = {
      smtp: primarySmtp,
      smtp_accounts: accounts,
      templates: newConfig.templates || DEFAULT_CONFIG.templates,
      automations: newConfig.automations || DEFAULT_CONFIG.automations,
      logs: (newConfig.logs || []).slice(0, 50),
      updated_at: new Date().toISOString()
    };

    // Save to local JSON file
    try {
      await fs.writeFile(targetFilePath, JSON.stringify(configToSave, null, 2), 'utf8');
    } catch (fsErr) {
      console.warn('saveEmailConfig local file write error:', fsErr.message);
    }

    // Save to Supabase system_settings
    try {
      await supabase
        .from('system_settings')
        .upsert({
          key: storageKey,
          value: configToSave,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
    } catch (dbErr) {
      console.warn('Could not sync email config to supabase system_settings:', dbErr.message);
    }

    return { success: true, message: 'Email configuration saved successfully!' };
  } catch (error) {
    console.error('saveEmailConfig error:', error);
    return { success: false, error: error.message };
  }
}

// Save or Update an SMTP Server Account with Addon Quota Enforcement
export async function saveSmtpAccount(account, companyOrTenantId = '', isMasterAdmin = false) {
  try {
    const res = await getEmailConfig(companyOrTenantId, isMasterAdmin);
    const currentConfig = res.data;
    let accounts = currentConfig.smtp_accounts || [];

    const existingIndex = accounts.findIndex(a => a.id === account.id);
    const isNew = existingIndex < 0;
    const isDefault = account.is_default || accounts.length === 0;

    // Quota Enforcement: block adding new account if quota is reached
    const quota = await getTenantSmtpQuota(companyOrTenantId, isMasterAdmin);
    if (isNew && !quota.is_unlimited && accounts.length >= quota.limit) {
      return {
        success: false,
        error: `SMTP server limit reached! This tenant allows up to ${quota.limit} SMTP server account(s). Please purchase an SMTP Server Addon or increase quota in SaaS Studio.`
      };
    }

    if (isDefault) {
      accounts = accounts.map(a => ({ ...a, is_default: false }));
    }

    if (!isNew) {
      accounts[existingIndex] = {
        ...accounts[existingIndex],
        ...account,
        is_default: isDefault,
        updated_at: new Date().toISOString()
      };
    } else {
      accounts.push({
        ...account,
        id: account.id || `smtp_${Date.now()}`,
        is_default: isDefault,
        created_at: new Date().toISOString()
      });
    }

    if (!accounts.some(a => a.is_default) && accounts.length > 0) {
      accounts[0].is_default = true;
    }

    currentConfig.smtp_accounts = accounts;
    return await saveEmailConfig(currentConfig, companyOrTenantId);
  } catch (error) {
    console.error('saveSmtpAccount error:', error);
    return { success: false, error: error.message };
  }
}

// Delete an SMTP Server Account
export async function deleteSmtpAccount(accountId, companyOrTenantId = '') {
  try {
    const res = await getEmailConfig(companyOrTenantId);
    const currentConfig = res.data;
    let accounts = currentConfig.smtp_accounts || [];

    if (accounts.length <= 1) {
      return { success: false, error: 'Cannot delete the only configured SMTP server. Add another server first.' };
    }

    const wasDefault = accounts.find(a => a.id === accountId)?.is_default;
    accounts = accounts.filter(a => a.id !== accountId);

    if (wasDefault && accounts.length > 0) {
      accounts[0].is_default = true;
    }

    currentConfig.smtp_accounts = accounts;
    return await saveEmailConfig(currentConfig, companyOrTenantId);
  } catch (error) {
    console.error('deleteSmtpAccount error:', error);
    return { success: false, error: error.message };
  }
}

// Set Default Primary SMTP Server
export async function setDefaultSmtpAccount(accountId, companyOrTenantId = '') {
  try {
    const res = await getEmailConfig(companyOrTenantId);
    const currentConfig = res.data;
    let accounts = currentConfig.smtp_accounts || [];

    accounts = accounts.map(a => ({
      ...a,
      is_default: a.id === accountId
    }));

    currentConfig.smtp_accounts = accounts;
    return await saveEmailConfig(currentConfig, companyOrTenantId);
  } catch (error) {
    console.error('setDefaultSmtpAccount error:', error);
    return { success: false, error: error.message };
  }
}

// Save or Update an Email Template
export async function saveEmailTemplate(template) {
  try {
    const res = await getEmailConfig();
    const currentConfig = res.data;
    const templates = currentConfig.templates || [];

    const existingIndex = templates.findIndex(t => t.id === template.id);
    if (existingIndex >= 0) {
      templates[existingIndex] = { ...template, updated_at: new Date().toISOString() };
    } else {
      templates.unshift({
        ...template,
        id: template.id || `tpl_${Date.now()}`,
        created_at: new Date().toISOString()
      });
    }

    currentConfig.templates = templates;
    return await saveEmailConfig(currentConfig);
  } catch (error) {
    console.error('saveEmailTemplate error:', error);
    return { success: false, error: error.message };
  }
}

// Delete an Email Template
export async function deleteEmailTemplate(templateId) {
  try {
    const res = await getEmailConfig();
    const currentConfig = res.data;
    currentConfig.templates = (currentConfig.templates || []).filter(t => t.id !== templateId);
    return await saveEmailConfig(currentConfig);
  } catch (error) {
    console.error('deleteEmailTemplate error:', error);
    return { success: false, error: error.message };
  }
}

// Bulk Delete Email Templates
export async function deleteBulkEmailTemplates(templateIds = []) {
  try {
    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      return { success: true, count: 0 };
    }
    const idSet = new Set(templateIds);
    const res = await getEmailConfig();
    const currentConfig = res.data;
    const initialLen = (currentConfig.templates || []).length;
    currentConfig.templates = (currentConfig.templates || []).filter(t => !idSet.has(t.id));
    const deletedCount = initialLen - currentConfig.templates.length;
    const saveRes = await saveEmailConfig(currentConfig);
    if (!saveRes.success) return saveRes;
    return { success: true, count: deletedCount };
  } catch (error) {
    console.error('deleteBulkEmailTemplates error:', error);
    return { success: false, error: error.message };
  }
}

// Save or Update an Email Automation Rule
export async function saveEmailAutomation(automation) {
  try {
    const res = await getEmailConfig();
    const currentConfig = res.data;
    const automations = currentConfig.automations || [];

    const existingIndex = automations.findIndex(a => a.id === automation.id);
    if (existingIndex >= 0) {
      automations[existingIndex] = { ...automation, updated_at: new Date().toISOString() };
    } else {
      automations.unshift({
        ...automation,
        id: automation.id || `auto_${Date.now()}`,
        created_at: new Date().toISOString()
      });
    }

    currentConfig.automations = automations;
    return await saveEmailConfig(currentConfig);
  } catch (error) {
    console.error('saveEmailAutomation error:', error);
    return { success: false, error: error.message };
  }
}

// Delete an Email Automation Rule
export async function deleteEmailAutomation(automationId) {
  try {
    const res = await getEmailConfig();
    const currentConfig = res.data;
    currentConfig.automations = (currentConfig.automations || []).filter(a => a.id !== automationId);
    return await saveEmailConfig(currentConfig);
  } catch (error) {
    console.error('deleteEmailAutomation error:', error);
    return { success: false, error: error.message };
  }
}

// Send Real-Time Live Test Email
export async function sendTestEmail(recipientEmail, customSmtp = null, smtpAccountId = null) {
  try {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      return { success: false, error: 'Please provide a valid recipient email address.' };
    }

    let smtp = customSmtp;
    if (!smtp) {
      const res = await getEmailConfig();
      if (smtpAccountId && Array.isArray(res.data?.smtp_accounts)) {
        smtp = res.data.smtp_accounts.find(a => a.id === smtpAccountId);
      }
      if (!smtp) {
        smtp = res.data?.smtp;
      }
    }

    if (!smtp || !smtp.host || !smtp.username || !smtp.password) {
      return { success: false, error: 'SMTP Host, Username, and Password are required to send emails.' };
    }

    const cleanUser = (smtp.username || '').trim();
    const cleanPass = (smtp.password || '').replace(/\s+/g, '');
    const isGmail = (smtp.host || '').includes('gmail.com');
    const port = Number(smtp.port) || 587;
    const isSecure = port === 465 || smtp.secure === true;

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: port,
      secure: isSecure,
      auth: {
        user: cleanUser,
        pass: cleanPass,
      },
      tls: {
        rejectUnauthorized: false
      },
      ...(isGmail && { service: 'gmail' })
    });

    const senderEmail = smtp.from_email || smtp.username;
    const senderName = smtp.from_name || 'SuPuja Creations Messaging';

    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: recipientEmail,
      replyTo: smtp.reply_to || senderEmail,
      subject: `✅ SMTP Verification Test - SuPuja Creations`,
      text: `Hello,\n\nThis is a test email sent from SuPuja Creations Email Configuration Gateway.\n\nSender: ${senderEmail}\nHost: ${smtp.host}:${port}\nSecurity: ${isSecure ? 'SSL (465)' : 'STARTTLS (587)'}\nTimestamp: ${new Date().toLocaleString()}\n\nYour SMTP email gateway is active and functioning properly!`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #4338ca 0%, #3b82f6 100%); padding: 1.5rem; text-align: center; color: white;">
            <h2 style="margin: 0; font-size: 1.35rem; font-weight: 700;">SuPuja Creations</h2>
            <p style="margin: 0.25rem 0 0 0; opacity: 0.9; font-size: 0.85rem;">Email Gateway Live Verification</p>
          </div>
          <div style="padding: 1.75rem;">
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 0.85rem 1rem; border-radius: 8px; font-weight: 600; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>✅ SMTP Gateway connection verified successfully!</span>
            </div>
            <p style="color: #334155; line-height: 1.6; font-size: 0.92rem; margin: 0 0 1rem 0;">
              Your CRM email messaging gateway is properly authenticated and ready to dispatch lead and candidate emails.
            </p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; font-size: 0.82rem; color: #475569;">
              <div style="margin-bottom: 0.35rem;"><strong>From:</strong> ${senderName} &lt;${senderEmail}&gt;</div>
              <div style="margin-bottom: 0.35rem;"><strong>SMTP Host:</strong> ${smtp.host}:${port}</div>
              <div style="margin-bottom: 0.35rem;"><strong>Authentication:</strong> ${cleanUser}</div>
              <div><strong>Dispatched At:</strong> ${new Date().toLocaleString()}</div>
            </div>
          </div>
          <div style="background: #f8fafc; padding: 0.85rem; text-align: center; font-size: 0.75rem; color: #94a3b8; border-top: 1px solid #e2e8f0;">
            SuPuja Creations CRM • Messaging Hub
          </div>
        </div>
      `
    });

    // Save sent log
    try {
      const res = await getEmailConfig();
      const currentConfig = res.data;
      const logs = currentConfig.logs || [];
      logs.unshift({
        id: `log_${Date.now()}`,
        recipient: recipientEmail,
        subject: 'SMTP Verification Test',
        message_id: info.messageId,
        status: 'Delivered',
        timestamp: new Date().toISOString()
      });
      currentConfig.logs = logs.slice(0, 50);
      await saveEmailConfig(currentConfig);
    } catch (logErr) {
      console.warn('Failed to append log:', logErr);
    }

    return {
      success: true,
      message: `Test email sent successfully to ${recipientEmail}! (Message ID: ${info.messageId})`
    };
  } catch (error) {
    console.error('sendTestEmail error:', error);
    return {
      success: false,
      error: error.message || 'Failed to dispatch test email. Please check your SMTP host, port, and credentials.'
    };
  }
}
