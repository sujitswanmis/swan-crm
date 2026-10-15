/**
 * Email Template Compiler for Plain Text & Advance Marketing HTML Emails
 * Fully responsive across Gmail, Apple Mail, Outlook, and mobile devices.
 * Supports CTA action buttons, highlight badges, and real-time open/click tracking.
 */

export function compileEmailTemplateHtml({
  template,
  data = {},
  trackingId = null,
  baseUrl = '',
  companyName = 'SuPuja Creations',
  senderName = '',
  signature = ''
}) {
  if (!template) {
    return { subject: '', text: '', html: '' };
  }

  const isMarketing = template.template_type === 'marketing';

  // Dynamic tags substitution
  const replaceTags = (str = '') => {
    let result = String(str || '');
    const sampleDefaults = {
      name: data.name || 'Valued Client',
      candidate_name: data.candidate_name || data.name || 'Candidate',
      candidate_email: data.candidate_email || 'candidate@example.com',
      candidate_phone: data.candidate_phone || '+91 98765 43210',
      candidate_id: data.candidate_id || 'CAN-1042',
      job_title: data.job_title || 'Operations Specialist',
      recruiter_name: data.recruiter_name || senderName || 'HR Team',
      company: data.company || companyName || 'Company',
      phone: data.phone || '+91 98765 43210',
      lead_ref_id: data.lead_ref_id || 'REF-8041',
      stage: data.stage || 'Initial Contact',
      rep_name: data.rep_name || senderName || `${companyName} Representative`
    };

    Object.entries(sampleDefaults).forEach(([k, v]) => {
      const regex = new RegExp(`{{\\s*${k}\\s*}}`, 'gi');
      result = result.replace(regex, v);
    });
    return result;
  };

  const subject = replaceTags(template.subject || 'Notification from ' + companyName);
  const rawBody = replaceTags(template.message_body || '');
  const badgeText = replaceTags(template.badge_text || '');
  const heroHeadline = replaceTags(template.hero_headline || '');
  const heroSubheading = replaceTags(template.hero_subheading || '');
  const ctaText = replaceTags(template.cta_button_text || '');
  const rawCtaUrl = replaceTags(template.cta_button_url || '');
  const buttonColor = template.cta_button_color || '#2563eb';
  const cleanSig = replaceTags(signature || template.signature || `Best regards,\n${companyName} Team`);

  // Wrap CTA URL with click tracking if trackingId is present
  let destinationCtaUrl = rawCtaUrl || '#';
  if (trackingId && rawCtaUrl && rawCtaUrl !== '#') {
    const trackingHost = baseUrl || (typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || ''));
    destinationCtaUrl = `${trackingHost}/api/email/track/click?tid=${encodeURIComponent(trackingId)}&url=${encodeURIComponent(rawCtaUrl)}`;
  }

  // Open tracking pixel tag
  let trackingPixel = '';
  if (trackingId) {
    const trackingHost = baseUrl || (typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || ''));
    trackingPixel = `<img src="${trackingHost}/api/email/track/open?tid=${encodeURIComponent(trackingId)}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;opacity:0;" />`;
  }

  // Convert newlines in body to clean paragraphs
  const formattedBody = rawBody
    .split('\n\n')
    .map(para => `<p style="margin: 0 0 16px 0; line-height: 1.65; color: #334155; font-size: 15px;">${para.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  const formattedSig = cleanSig.replace(/\n/g, '<br/>');

  if (isMarketing) {
    return {
      subject,
      text: `${subject}\n\n${rawBody}\n\n${ctaText ? `${ctaText}: ${rawCtaUrl}\n\n` : ''}${cleanSig}`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9" style="padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          
          <!-- Top Accent Bar / Brand Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${buttonColor} 0%, #1e293b 100%); padding: 28px 32px; text-align: left; color: #ffffff;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    ${badgeText ? `
                    <div style="display: inline-block; background: rgba(255, 255, 255, 0.2); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #ffffff; margin-bottom: 12px;">
                      ${badgeText}
                    </div>` : ''}
                    <h1 style="margin: 0; font-size: 22px; font-weight: 800; line-height: 1.3; color: #ffffff;">
                      ${heroHeadline || companyName}
                    </h1>
                    ${heroSubheading ? `
                    <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9; color: #e2e8f0; line-height: 1.4;">
                      ${heroSubheading}
                    </p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; background-color: #ffffff;">
              ${formattedBody}

              <!-- Interactive Bulletproof CTA Button -->
              ${ctaText ? `
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" bgcolor="${buttonColor}" style="border-radius: 10px; box-shadow: 0 4px 12px ${buttonColor}40;">
                          <a href="${destinationCtaUrl}" target="_blank" style="font-family: inherit; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; display: inline-block; padding: 15px 34px; border-radius: 10px; letter-spacing: 0.2px;">
                            ${ctaText} &nbsp;&rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>` : ''}

              <!-- Clean Signature Block -->
              <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #f1f5f9; color: #64748b; font-size: 14px; line-height: 1.6;">
                ${formattedSig}
              </div>
            </td>
          </tr>

          <!-- Branded Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px; line-height: 1.5;">
              <p style="margin: 0 0 6px 0; font-weight: 600; color: #64748b;">${companyName} CRM • Messaging Communications</p>
              <p style="margin: 0;">You received this email regarding your ongoing inquiry or application with ${companyName}.</p>
            </td>
          </tr>
        </table>
        ${trackingPixel}
      </td>
    </tr>
  </table>
</body>
</html>`
    };
  }

  // Plain Text Layout
  return {
    subject,
    text: `${subject}\n\n${rawBody}\n\n${cleanSig}`,
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; color: #1e293b; line-height: 1.65; margin: 0; padding: 24px; background-color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto;">
    ${formattedBody}
    ${ctaText ? `
    <div style="margin: 24px 0;">
      <a href="${destinationCtaUrl}" target="_blank" style="color: ${buttonColor}; font-weight: 700; font-size: 15px; text-decoration: underline;">
        &rarr; ${ctaText} (${rawCtaUrl})
      </a>
    </div>` : ''}
    <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; color: #475569; font-size: 14px; line-height: 1.6;">
      ${formattedSig}
    </div>
    ${trackingPixel}
  </div>
</body>
</html>`
  };
}
