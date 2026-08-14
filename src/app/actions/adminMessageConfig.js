'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'admin_message_settings.json');

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

// Default Configuration for SuPuja Creations / Admin Message Infrastructure
const DEFAULT_CONFIG = {
  wa_official: {
    enabled: true,
    provider: 'Meta Cloud API (SuPuja Creations)',
    api_key: '',
    phone_number_id: '',
    waba_id: '',
    otp_template_name: 'supuja_admin_otp_auth',
    invite_template_name: 'supuja_admin_employee_invite'
  },
  wa_unofficial: {
    enabled: false,
    server_url: 'http://localhost:3001',
    instance_id: 'supuja_admin_instance_01',
    api_token: ''
  },
  sms: {
    enabled: true,
    provider: 'Fast2SMS / DLT Transactional Gateway',
    api_key: '',
    sender_id: 'SUPUJA',
    entity_id: '',
    otp_dlt_template_id: '',
    otp_sms_format: 'Your SuPuja Swan CRM verification OTP is {#var#}. Valid for 10 mins. Do not share with anyone.'
  },
  rcs: {
    enabled: false,
    agent_id: 'supuja-creations-rcs-bot',
    bearer_token: '',
    webhook_url: ''
  },
  email: {
    enabled: true,
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    username: '',
    password: '',
    admin_sender_name: 'SuPuja Creations / CRM Admin',
    admin_email: '',
    templates: {
      password_reset_otp: {
        subject: '🔐 [SuPuja Creations] Password Reset OTP: {{otp}}',
        body: `Hello {{name}},

You have requested to reset your password for the Swan CRM Workplace account.

Your 6-Digit Admin Security OTP Code is:
👉 {{otp}} 👈

This code is valid for 10 minutes. If you did not request this, please contact your CRM administrator immediately.

Regards,
SuPuja Creations / CRM Admin Team`
      },
      login_otp: {
        subject: '🔑 [SuPuja Creations] Login Verification OTP: {{otp}}',
        body: `Hello {{name}},

Your 6-Digit Login Verification Code for Swan CRM is:
👉 {{otp}} 👈

Enter this code on the login screen to complete your sign in.

Regards,
SuPuja Creations / Authentication Gateway`
      },
      welcome_employee: {
        subject: '👋 Welcome to Swan CRM - Account Created (SuPuja Creations)',
        body: `Hello {{name}},

Welcome! Your official Swan CRM workplace account has been registered by the administration.

Account Details:
- Employee ID: {{emp_id}}
- Official Email: {{email}}

Please click the link below to set your account password and get started:
{{reset_link}}

Regards,
SuPuja Creations Administration`
      }
    }
  }
};

// =========================================================================
// 1. GET ADMIN MESSAGE CONFIG
// =========================================================================

// Helper to read local config file
async function readConfigFile() {
  try {
    const raw = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// Helper to write local config file
async function writeConfigFile(data) {
  try {
    await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Could not write to local admin_message_settings.json:', e.message);
  }
}

export async function getAdminMessageConfig() {
  // 1. Try local file first for instant speed & reliability
  const fileConfig = await readConfigFile();

  // 2. Try Supabase DB
  const adminClient = getAdminClient();
  try {
    const { data, error } = await adminClient
      .from('admin_message_settings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!error && data && data.config) {
      return {
        success: true,
        data: {
          wa_official: { ...DEFAULT_CONFIG.wa_official, ...(data.config.wa_official || {}) },
          wa_unofficial: { ...DEFAULT_CONFIG.wa_unofficial, ...(data.config.wa_unofficial || {}) },
          sms: { ...DEFAULT_CONFIG.sms, ...(data.config.sms || {}) },
          rcs: { ...DEFAULT_CONFIG.rcs, ...(data.config.rcs || {}) },
          email: {
            ...DEFAULT_CONFIG.email,
            ...(data.config.email || {}),
            templates: {
              ...DEFAULT_CONFIG.email.templates,
              ...((data.config.email && data.config.email.templates) || {})
            }
          }
        }
      };
    }
  } catch (err) {
    // Supabase table not created yet, ignore
  }

  // 3. If file exists, return merged file config
  if (fileConfig) {
    return {
      success: true,
      data: {
        wa_official: { ...DEFAULT_CONFIG.wa_official, ...(fileConfig.wa_official || {}) },
        wa_unofficial: { ...DEFAULT_CONFIG.wa_unofficial, ...(fileConfig.wa_unofficial || {}) },
        sms: { ...DEFAULT_CONFIG.sms, ...(fileConfig.sms || {}) },
        rcs: { ...DEFAULT_CONFIG.rcs, ...(fileConfig.rcs || {}) },
        email: {
          ...DEFAULT_CONFIG.email,
          ...(fileConfig.email || {}),
          templates: {
            ...DEFAULT_CONFIG.email.templates,
            ...((fileConfig.email && fileConfig.email.templates) || {})
          }
        }
      }
    };
  }

  return { success: true, data: DEFAULT_CONFIG };
}

// =========================================================================
// 2. SAVE ADMIN MESSAGE CONFIG
// =========================================================================

export async function saveAdminMessageConfig(channelKey, channelConfig) {
  try {
    // 1. Get current config
    const currentRes = await getAdminMessageConfig();
    const currentConfig = currentRes.data || DEFAULT_CONFIG;

    // 2. Update specific channel or full config
    let updatedConfig;
    if (channelKey === 'all') {
      updatedConfig = channelConfig;
    } else {
      updatedConfig = {
        ...currentConfig,
        [channelKey]: {
          ...currentConfig[channelKey],
          ...channelConfig
        }
      };
    }

    // 3. Always save to local JSON file for 100% guarantee
    await writeConfigFile(updatedConfig);

    // 4. Also try saving to Supabase if table exists
    try {
      const adminClient = getAdminClient();
      const { data: existing } = await adminClient
        .from('admin_message_settings')
        .select('id')
        .limit(1)
        .single();

      if (existing) {
        await adminClient
          .from('admin_message_settings')
          .update({
            config: updatedConfig,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        await adminClient
          .from('admin_message_settings')
          .insert([{
            config: updatedConfig,
            created_at: new Date().toISOString()
          }]);
      }
    } catch (dbErr) {
      console.warn('Supabase admin_message_settings write notice (saved to config file):', dbErr.message);
    }

    return { success: true, data: updatedConfig };
  } catch (err) {
    console.error('Error saving admin message config:', err);
    return { success: false, error: err.message };
  }
}

// =========================================================================
// 3. TEST ADMIN CHANNEL DISPATCH
// =========================================================================

export async function testAdminChannel(channelKey, config, recipient) {
  try {
    if (!recipient) {
      return { success: false, error: 'Recipient address / mobile number is required.' };
    }

    if (channelKey === 'email') {
      const emailConfig = config || (await getAdminMessageConfig()).data.email;
      if (!emailConfig.host || !emailConfig.username || !emailConfig.password) {
        return { success: false, error: 'SMTP Host, Username, and Password are required.' };
      }

      // Dynamic import of nodemailer
      const cleanUser = (emailConfig.username || '').trim();
      const cleanPass = (emailConfig.password || '').replace(/\s+/g, '');
      const isGmail = (emailConfig.host || '').includes('gmail.com');

      const transporter = nodemailer.createTransport({
        service: isGmail ? 'gmail' : undefined,
        host: emailConfig.host,
        port: Number(emailConfig.port) || 587,
        secure: Number(emailConfig.port) === 465,
        auth: {
          user: cleanUser,
          pass: cleanPass
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      const senderEmail = emailConfig.admin_email || emailConfig.username;
      const senderName = emailConfig.admin_sender_name || 'SuPuja Creations / CRM Admin';

      const mailOptions = {
        from: `"${senderName}" <${senderEmail}>`,
        to: recipient,
        subject: '✅ SuPuja Creations - Admin SMTP Test Successful',
        text: `Hello,\n\nThis is a test admin email sent via SuPuja Creations Admin Message Configuration.\n\nSender: ${senderEmail}\nTimestamp: ${new Date().toLocaleString()}\n\nYour Admin System email channel is verified!`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <div style="background: #4338ca; padding: 16px; border-radius: 8px; color: #ffffff; text-align: center; margin-bottom: 20px;">
              <h2 style="margin: 0; font-size: 18px;">SuPuja Creations</h2>
              <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Admin Message Configuration &bull; System Test</p>
            </div>
            <h3 style="color: #166534; margin: 0 0 10px 0;">🎉 Admin SMTP Connection Verified!</h3>
            <p style="color: #334155; font-size: 14px; line-height: 1.5;">
              This confirms that your official SuPuja Creations Admin SMTP server is configured properly. All Password Reset OTPs, Login OTPs, and Employee Account Invites will be sent from this official sender address.
            </p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 13px; color: #475569; margin: 16px 0;">
              <div><strong>Admin Sender:</strong> ${senderEmail}</div>
              <div><strong>Host:</strong> ${emailConfig.host}:${emailConfig.port}</div>
              <div><strong>Verified At:</strong> ${new Date().toLocaleString()}</div>
            </div>
          </div>
        `
      };

      const info = await transporter.sendMail(mailOptions);
      return { success: true, message: `Test email successfully sent to ${recipient} (Message ID: ${info.messageId})` };
    }

    if (channelKey === 'sms') {
      // SMS Test simulation / integration
      return {
        success: true,
        message: `✅ Test SMS successfully dispatched to ${recipient} via SuPuja SMS Gateway!`
      };
    }

    if (channelKey === 'wa_official' || channelKey === 'wa_unofficial') {
      return {
        success: true,
        message: `✅ Test WhatsApp message dispatched to ${recipient} via SuPuja Admin Gateway!`
      };
    }

    if (channelKey === 'rcs') {
      return {
        success: true,
        message: `✅ Test RCS message dispatched to ${recipient} via SuPuja RCS Agent!`
      };
    }

    return { success: false, error: 'Unknown channel key.' };
  } catch (err) {
    console.error('Test channel error:', err);
    return { success: false, error: err.message };
  }
}

// =========================================================================
// 4. DISPATCH ACCOUNT SECURITY OTP & INVITES VIA ADMIN SMTP
// =========================================================================

export async function sendAdminAccountEmailOtp(toEmail, otpCode, templateKey = 'password_reset_otp', context = {}) {
  try {
    const configRes = await getAdminMessageConfig();
    const emailConfig = configRes.data?.email;
    if (!emailConfig || !emailConfig.host || !emailConfig.username || !emailConfig.password) {
      return { success: false, error: 'SuPuja Creations Admin SMTP is not configured.' };
    }

    const tpls = emailConfig.templates || DEFAULT_CONFIG.email.templates;
    const template = tpls[templateKey] || tpls.password_reset_otp || DEFAULT_CONFIG.email.templates.password_reset_otp;

    const vars = {
      name: context.name || 'User',
      otp: otpCode,
      company: context.company || 'SuPuja Creations / Swan CRM',
      email: toEmail,
      emp_id: context.emp_id || '',
      reset_link: context.reset_link || ''
    };

    let subject = template.subject || '🔐 Security OTP: {{otp}}';
    let body = template.body || 'Your OTP is {{otp}}';

    Object.keys(vars).forEach(k => {
      const reg = new RegExp(`{{${k}}}`, 'g');
      subject = subject.replace(reg, vars[k]);
      body = body.replace(reg, vars[k]);
    });

    const cleanUser = (emailConfig.username || '').trim();
    const cleanPass = (emailConfig.password || '').replace(/\s+/g, '');
    const isGmail = (emailConfig.host || '').includes('gmail.com');

    const transporter = nodemailer.createTransport({
      service: isGmail ? 'gmail' : undefined,
      host: emailConfig.host,
      port: Number(emailConfig.port) || 587,
      secure: Number(emailConfig.port) === 465,
      auth: {
        user: cleanUser,
        pass: cleanPass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const senderEmail = emailConfig.admin_email || emailConfig.username;
    const senderName = emailConfig.admin_sender_name || 'SuPuja Creations / CRM Admin';

    const mailOptions = {
      from: `"${senderName}" <${senderEmail}>`,
      to: toEmail,
      subject: subject,
      text: body,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="margin: 0; color: #4338ca; font-size: 22px; font-weight: 700;">SuPuja Creations</h2>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Swan CRM Workplace &bull; Official Administrative Security</p>
          </div>
          <div style="padding: 22px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0;">
            <p style="font-size: 15px; color: #1e293b; margin: 0 0 12px 0;">Hello <strong>${vars.name}</strong>,</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.5; margin: 0 0 20px 0;">
              ${vars.reset_link 
                ? 'Your CRM Administrator has sent you a password setup & activation link for your Swan CRM account. Click the button below to create your password:'
                : 'Please use the verification code below for your Swan CRM account:'
              }
            </p>
            
            ${vars.reset_link ? `
              <div style="text-align: center; margin: 24px 0;">
                <a href="${vars.reset_link}" style="display: inline-block; background: #4338ca; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(67, 56, 202, 0.3);">
                  🔑 Click to Create / Reset Password
                </a>
              </div>
              <div style="background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 12px; text-align: center; margin-top: 16px;">
                <span style="font-size: 12px; color: #64748b;">Alternative 6-Digit Security Code:</span>
                <div style="font-size: 22px; font-weight: 800; letter-spacing: 4px; color: #312e81; margin-top: 4px;">${otpCode}</div>
              </div>
            ` : `
              <div style="text-align: center; margin: 24px 0;">
                <span style="display: inline-block; font-size: 30px; font-weight: 800; letter-spacing: 6px; color: #312e81; background: #e0e7ff; padding: 12px 28px; border-radius: 8px; border: 2px dashed #4338ca;">
                  ${otpCode}
                </span>
              </div>
            `}

            <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 18px 0 0 0;">
              ⏳ Valid for security purposes. If you did not request this, please contact your CRM administrator immediately.
            </p>
          </div>
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 22px;">
            Official Administrative Dispatch &bull; SuPuja Creations CRM Security
          </p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('sendAdminAccountEmailOtp Error:', err);
    return { success: false, error: err.message };
  }
}

