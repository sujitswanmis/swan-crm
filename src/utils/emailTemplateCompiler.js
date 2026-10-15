/**
 * Email Template Compiler for Plain Text & Advance Marketing HTML Emails
 * Fully responsive across Gmail, Apple Mail, Outlook, and mobile devices.
 * Supports CTA action buttons, highlight badges, promotional vouchers, 
 * interview schedules, job offer LOIs, and real-time open/click tracking.
 */

export const DESIGN_PRESETS = [
  {
    id: 'drag_drop',
    name: '🧩 Drag & Drop Visual Builder',
    icon: '🧩',
    desc: 'Interactive visual design canvas with resizable images, customizable buttons, 2-column grids & voucher cards.',
    defaultBadge: '⭐ Special Feature',
    defaultHeadline: 'Visual Drag & Drop Campaign',
    defaultSubheading: 'Built with resizable images and rich block components.',
    defaultBody: 'Welcome {{name}},\n\nDiscover the next generation of precision manufacturing tailored for your requirements.',
    defaultCtaText: 'Explore Interactive Catalogue →',
    defaultCtaUrl: 'https://newswangroup.com',
    defaultColor: '#2563eb'
  },
  {
    id: 'marketing',
    name: 'Modern Marketing Hero',
    icon: '🎨',
    desc: 'Gradient hero header, highlight badge, CTA button & branded layout. Best for marketing campaigns.',
    defaultBadge: '⭐ Exclusive Business Update',
    defaultHeadline: 'Accelerate Your Business Growth Today',
    defaultSubheading: 'Proven solutions engineered to scale operations and revenue.',
    defaultBody: 'Hi {{name}},\n\nWe are excited to share exclusive insights tailored to your business needs.\n\nOur team is ready to assist you every step of the way with seamless onboarding and dedicated support.',
    defaultCtaText: 'Schedule Strategy Demo →',
    defaultCtaUrl: 'https://example.com/demo',
    defaultColor: '#2563eb'
  },
  {
    id: 'promo_deal',
    name: 'Promotional Offer & Voucher',
    icon: '🎁',
    desc: 'High-conversion offer with special voucher coupon code card, benefits checklist & urgent CTA button.',
    defaultBadge: '🔥 LIMITED TIME OFFER',
    defaultHeadline: 'Special 30% Privilege Discount For You',
    defaultSubheading: 'Claim this exclusive seasonal offer before registration closes.',
    defaultBody: 'Dear {{name}},\n\nAs a valued partner, we are pleased to unlock an exclusive corporate pricing package just for your team.\n\nUse your dedicated coupon code during checkout or click the button below to activate instant benefits.',
    couponCode: 'SUPUJA-VIP-30',
    defaultCtaText: 'Claim Your 30% Discount →',
    defaultCtaUrl: 'https://example.com/claim-discount',
    defaultColor: '#ea580c'
  },
  {
    id: 'newsletter',
    name: 'Corporate Newsletter & Updates',
    icon: '📰',
    desc: 'Editorial digest header, multi-story highlight blocks & featured articles. Ideal for monthly digests.',
    defaultBadge: '📰 MONTHLY EDITION',
    defaultHeadline: 'Company Insights & Product Highlights',
    defaultSubheading: 'Catch up on latest industry benchmarks, innovations, and milestone achievements.',
    defaultBody: 'Hello {{name}},\n\nWelcome to this month\'s edition of our newsletter.\n\nHere are the top operational milestones and upcoming enhancements designed to help your organization stay ahead.',
    defaultCtaText: 'Read Full Newsletter Digest →',
    defaultCtaUrl: 'https://example.com/newsletter',
    defaultColor: '#0f172a'
  },
  {
    id: 'interview_call',
    name: 'Candidate Interview Call Letter',
    icon: '💼',
    desc: 'Official HR letter with styled Interview Schedule card (Date, Time IST, Google Meet / Venue).',
    defaultBadge: '💼 INTERVIEW INVITATION',
    defaultHeadline: 'Interview Invitation for {{job_title}}',
    defaultSubheading: 'Your application has been shortlisted by our talent acquisition panel.',
    defaultBody: 'Dear {{candidate_name}},\n\nThank you for applying for the {{job_title}} position with us.\n\nWe were impressed by your background and would like to invite you for an official interview round with our technical leadership team.',
    defaultCtaText: 'Confirm & Join Online Interview →',
    defaultCtaUrl: 'https://meet.google.com/abc-defg-hij',
    defaultColor: '#4f46e5'
  },
  {
    id: 'job_offer',
    name: 'Job Offer / LOI Announcement',
    icon: '🏆',
    desc: 'Celebratory Letter of Intent with package summary box & acceptance CTA button.',
    defaultBadge: '🎉 CONGRATULATIONS',
    defaultHeadline: 'Official Offer of Employment: {{job_title}}',
    defaultSubheading: 'We are thrilled to welcome you to the team!',
    defaultBody: 'Dear {{candidate_name}},\n\nFollowing your outstanding performance during our interview assessments, we are pleased to offer you the position of {{job_title}} at {{company}}.\n\nPlease review your formal offer terms and accept via the link below.',
    defaultCtaText: 'Review & Sign Offer Letter →',
    defaultCtaUrl: 'https://example.com/offer-letter',
    defaultColor: '#16a34a'
  },
  {
    id: 'custom_html',
    name: 'Custom Raw HTML Mode',
    icon: '💻',
    desc: 'Full HTML/CSS freedom. Paste any custom responsive email design with automatic tracking injection.',
    defaultBadge: '',
    defaultHeadline: '',
    defaultSubheading: '',
    defaultBody: '<div style="padding: 24px; font-family: sans-serif; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">\n  <h2 style="color: #1e293b; margin-top: 0;">Welcome, {{name}}!</h2>\n  <p style="color: #475569; font-size: 15px; line-height: 1.6;">Thank you for connecting with <strong>{{company}}</strong>. We are delighted to support your growth.</p>\n  <div style="margin: 20px 0;">\n    <a href="https://example.com/start" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Get Started Now &rarr;</a>\n  </div>\n</div>',
    defaultCtaText: 'Get Started Now →',
    defaultCtaUrl: 'https://example.com/start',
    defaultColor: '#2563eb'
  },
  {
    id: 'plain',
    name: 'Clean Plain Business Email',
    icon: '📄',
    desc: 'Direct 1-on-1 text format without heavy styling. Best for personal employee replies.',
    defaultBadge: '',
    defaultHeadline: '',
    defaultSubheading: '',
    defaultBody: 'Dear {{name}},\n\nThank you for reaching out to us.\n\nI wanted to follow up on your recent request regarding our services. Please let me know a suitable time for a quick 5-minute call.',
    defaultCtaText: '',
    defaultCtaUrl: '',
    defaultColor: '#2563eb'
  }
];

export function compileBlocksToHtml(blocks = [], {
  replaceTags = (s) => s,
  trackingId = null,
  baseUrl = '',
  companyName = 'New Swan Group',
  branchLabel = 'All Branches'
} = {}) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return '';
  }

  const wrapClick = (url) => {
    if (!url || url === '#') return '#';
    if (trackingId) {
      const trackingHost = baseUrl || (typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || ''));
      return `${trackingHost}/api/email/track/click?tid=${encodeURIComponent(trackingId)}&url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  return blocks.map(block => {
    switch (block.type) {
      case 'header': {
        const logo = block.logoUrl ? `<img src="${block.logoUrl}" width="${block.logoWidth || 140}" style="width: ${block.logoWidth || 140}px; max-width: 100%; height: auto; margin-bottom: 12px; display: inline-block;" alt="Logo" />` : '';
        return `
        <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${block.bgColor || '#1e293b'}" style="background-color: ${block.bgColor || '#1e293b'}; padding: 28px 24px;">
          <tr>
            <td align="${block.align || 'center'}">
              ${logo}
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: ${block.textColor || '#ffffff'}; line-height: 1.3;">
                ${replaceTags(block.title || companyName)}
              </h1>
              ${block.subtitle ? `
              <p style="margin: 6px 0 0 0; font-size: 13px; color: ${block.textColor || '#ffffff'}; opacity: 0.9; line-height: 1.4;">
                ${replaceTags(block.subtitle)}
              </p>` : ''}
            </td>
          </tr>
        </table>`;
      }

      case 'image': {
        const imgWidth = block.width || 100;
        const maxW = block.maxWidth || 600;
        const bRad = block.borderRadius || 0;
        const align = block.align || 'center';
        const imgMarkup = `<img src="${block.url}" alt="${block.alt || ''}" style="width: 100%; max-width: 100%; height: auto; border-radius: ${bRad}px; display: block;" />`;
        const wrappedImg = block.linkUrl ? `<a href="${wrapClick(block.linkUrl)}" target="_blank" style="text-decoration: none; display: block;">${imgMarkup}</a>` : imgMarkup;

        return `
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 16px 0;">
          <tr>
            <td align="${align}" style="padding: 0 24px;">
              <div style="display: inline-block; width: ${imgWidth}%; max-width: ${maxW}px;">
                ${wrappedImg}
              </div>
              ${block.caption ? `
              <div style="font-size: 12px; color: #64748b; margin-top: 6px; text-align: ${align}; line-height: 1.4;">
                ${replaceTags(block.caption)}
              </div>` : ''}
            </td>
          </tr>
        </table>`;
      }

      case 'text': {
        const headingTag = block.headingLevel || 'h2';
        const align = block.align || 'left';
        const fSize = block.fontSize || 15;
        const color = block.color || '#334155';
        const bodyLines = (block.body || '')
          .split('\n\n')
          .map(p => `<p style="margin: 0 0 12px 0; line-height: 1.65;">${replaceTags(p).replace(/\n/g, '<br/>')}</p>`)
          .join('');

        return `
        <div style="padding: 12px 24px; text-align: ${align};">
          ${block.heading ? `
          <${headingTag} style="margin: 0 0 10px 0; color: #1e293b; font-weight: 700; line-height: 1.35;">
            ${replaceTags(block.heading)}
          </${headingTag}>` : ''}
          <div style="color: ${color}; font-size: ${fSize}px;">
            ${bodyLines}
          </div>
        </div>`;
      }

      case 'button': {
        const align = block.align || 'center';
        const bgColor = block.bgColor || '#2563eb';
        const textColor = block.textColor || '#ffffff';
        const bRad = block.borderRadius || 8;
        const isFull = !!block.fullWidth;

        return `
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
          <tr>
            <td align="${align}" style="padding: 0 24px;">
              <table border="0" cellpadding="0" cellspacing="0" style="${isFull ? 'width: 100%;' : ''}">
                <tr>
                  <td align="center" bgcolor="${bgColor}" style="border-radius: ${bRad}px; background-color: ${bgColor};">
                    <a href="${wrapClick(block.url || '#')}" target="_blank" style="font-family: inherit; font-size: 15px; font-weight: 700; color: ${textColor}; text-decoration: none; display: inline-block; padding: 13px 30px; border-radius: ${bRad}px; letter-spacing: 0.3px; ${isFull ? 'display: block; width: 100%; box-sizing: border-box;' : ''}">
                      ${replaceTags(block.text || 'Take Action →')}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>`;
      }

      case 'coupon': {
        return `
        <div style="padding: 0 24px; margin: 20px 0;">
          <div style="padding: 20px; border: 2px dashed #f59e0b; border-radius: 12px; background-color: #fffbeb; text-align: center;">
            <div style="font-size: 12px; font-weight: 800; color: #b45309; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
              ${replaceTags(block.title || 'SPECIAL PRIVILEGE OFFER')}
            </div>
            <div style="display: inline-block; font-size: 22px; font-weight: 900; font-family: 'Courier New', Courier, monospace; letter-spacing: 2px; color: #b45309; background: #fef3c7; border: 1.5px solid #f59e0b; padding: 8px 20px; border-radius: 8px; margin: 8px 0;">
              ${replaceTags(block.code || 'SWAN-SAVE25')}
            </div>
            ${block.description ? `
            <div style="font-size: 13px; color: #78350f; margin-top: 8px; line-height: 1.45;">
              ${replaceTags(block.description)}
            </div>` : ''}
            ${block.expiry ? `
            <div style="font-size: 11px; color: #92400e; margin-top: 6px; font-weight: 600;">
              ⏰ ${replaceTags(block.expiry)}
            </div>` : ''}
          </div>
        </div>`;
      }

      case 'columns': {
        return `
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
          <tr>
            <td style="padding: 0 24px;">
              <!-- 2-Column Responsive Layout -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="48%" valign="top" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
                    ${block.col1Img ? `<img src="${block.col1Img}" style="width: 100%; height: auto; display: block; max-height: 150px; object-fit: cover;" alt="" />` : ''}
                    <div style="padding: 14px;">
                      <h4 style="margin: 0 0 6px 0; color: #1e293b; font-size: 15px; font-weight: 700;">${replaceTags(block.col1Title || '')}</h4>
                      <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.45;">${replaceTags(block.col1Desc || '')}</p>
                    </div>
                  </td>
                  <td width="4%">&nbsp;</td>
                  <td width="48%" valign="top" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
                    ${block.col2Img ? `<img src="${block.col2Img}" style="width: 100%; height: auto; display: block; max-height: 150px; object-fit: cover;" alt="" />` : ''}
                    <div style="padding: 14px;">
                      <h4 style="margin: 0 0 6px 0; color: #1e293b; font-size: 15px; font-weight: 700;">${replaceTags(block.col2Title || '')}</h4>
                      <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.45;">${replaceTags(block.col2Desc || '')}</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>`;
      }

      case 'interview_card': {
        return `
        <div style="padding: 0 24px; margin: 20px 0;">
          <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 12px; overflow: hidden;">
            <tr>
              <td style="padding: 20px;">
                <div style="font-size: 12px; font-weight: 700; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
                  📅 Scheduled Discussion Details
                </div>
                <div style="font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 12px;">
                  ${replaceTags(block.title || 'Technical & Commercial Assessment')}
                </div>
                <table width="100%" border="0" cellpadding="5" cellspacing="0" style="font-size: 13px; color: #334155;">
                  <tr><td width="100" style="font-weight: 600; color: #64748b;">Date:</td><td>${replaceTags(block.date || 'Upcoming Monday')}</td></tr>
                  <tr><td style="font-weight: 600; color: #64748b;">Time (IST):</td><td>${replaceTags(block.time || '11:30 AM IST')}</td></tr>
                  <tr><td style="font-weight: 600; color: #64748b;">Venue / Mode:</td><td>${replaceTags(block.venue || 'Google Meet (Online)')}</td></tr>
                  ${block.panel ? `<tr><td style="font-weight: 600; color: #64748b;">Panel / Host:</td><td>${replaceTags(block.panel)}</td></tr>` : ''}
                </table>
                ${block.meetUrl ? `
                <div style="margin-top: 16px;">
                  <a href="${wrapClick(block.meetUrl)}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 700;">
                    Join Video Conference &rarr;
                  </a>
                </div>` : ''}
              </td>
            </tr>
          </table>
        </div>`;
      }

      case 'divider': {
        const gap = Math.round((block.gap || 20) / 2);
        return `
        <div style="padding: ${gap}px 24px;">
          <hr style="border: 0; border-top: ${block.thickness || 1}px ${block.style || 'solid'} ${block.color || '#e2e8f0'}; margin: 0;" />
        </div>`;
      }

      case 'social': {
        const align = block.align || 'center';
        return `
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 16px 0;">
          <tr>
            <td align="${align}" style="padding: 0 24px;">
              ${block.website ? `<a href="${wrapClick(block.website)}" target="_blank" style="margin: 0 10px; color: #2563eb; text-decoration: none; font-size: 13px; font-weight: 600;">🌐 Official Website</a>` : ''}
              ${block.linkedin ? `<a href="${wrapClick(block.linkedin)}" target="_blank" style="margin: 0 10px; color: #0a66c2; text-decoration: none; font-size: 13px; font-weight: 600;">💼 LinkedIn</a>` : ''}
              ${block.twitter ? `<a href="${wrapClick(block.twitter)}" target="_blank" style="margin: 0 10px; color: #1da1f2; text-decoration: none; font-size: 13px; font-weight: 600;">🐦 Twitter</a>` : ''}
            </td>
          </tr>
        </table>`;
      }

      case 'footer': {
        return `
        <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f8fafc" style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px; margin-top: 24px; text-align: center;">
          <tr>
            <td>
              <div style="font-weight: 700; color: #475569; font-size: 13px; margin-bottom: 4px;">
                ${replaceTags(block.company || companyName)} ${block.branch ? `• ${replaceTags(block.branch)}` : ''}
              </div>
              ${block.address ? `<div style="font-size: 12px; color: #94a3b8; margin-bottom: 6px;">${replaceTags(block.address)}</div>` : ''}
              ${block.copyright ? `<div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px;">${replaceTags(block.copyright)}</div>` : ''}
              ${block.unsubscribeText ? `<div style="font-size: 11px; color: #cbd5e1; line-height: 1.4;">${replaceTags(block.unsubscribeText)}</div>` : ''}
            </td>
          </tr>
        </table>`;
      }

      default:
        return '';
    }
  }).join('');
}

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

  const presetType = template.design_preset || template.template_type || 'marketing';

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
      branch: data.branch || template.branch || 'All Branches',
      phone: data.phone || '+91 98765 43210',
      lead_ref_id: data.lead_ref_id || 'REF-8041',
      stage: data.stage || 'Initial Contact',
      rep_name: data.rep_name || senderName || `${companyName} Representative`,
      coupon_code: template.coupon_code || 'VIP-SAVE30',
      interview_date: data.interview_date || 'Upcoming Monday',
      interview_time: data.interview_time || '11:30 AM IST',
      interview_venue: data.interview_venue || 'Google Meet (Online Video Conference)'
    };

    Object.entries(sampleDefaults).forEach(([k, v]) => {
      const regex = new RegExp(`{{\\s*${k}\\s*}}`, 'gi');
      result = result.replace(regex, v);
    });
    return result;
  };

  const subject = replaceTags(template.subject || 'Notification from ' + companyName);
  const rawBody = replaceTags(template.message_body || template.html_content || '');
  const badgeText = replaceTags(template.badge_text || '');
  const heroHeadline = replaceTags(template.hero_headline || '');
  const heroSubheading = replaceTags(template.hero_subheading || '');
  const ctaText = replaceTags(template.cta_button_text || '');
  const rawCtaUrl = replaceTags(template.cta_button_url || '');
  const buttonColor = template.cta_button_color || '#2563eb';
  const cleanSig = replaceTags(signature || template.signature || `Best regards,\n${companyName} Team`);
  const branchLabel = template.branch && template.branch !== 'All Branches' ? template.branch : `${companyName} HQ`;

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

  // =========================================================================
  // 0. VISUAL DRAG & DROP BUILDER MODE
  // =========================================================================
  const hasBlocks = (Array.isArray(template.blocks) && template.blocks.length > 0) || (typeof template.blocks_json === 'string' && template.blocks_json.length > 2);
  if (presetType === 'drag_drop' || (hasBlocks && !rawBody.includes('<html'))) {
    let parsedBlocks = template.blocks;
    if (!Array.isArray(parsedBlocks) && typeof template.blocks_json === 'string') {
      try { parsedBlocks = JSON.parse(template.blocks_json); } catch (e) { parsedBlocks = []; }
    }
    if (Array.isArray(parsedBlocks) && parsedBlocks.length > 0) {
      const blocksHtml = compileBlocksToHtml(parsedBlocks, {
        replaceTags,
        trackingId,
        baseUrl,
        companyName,
        branchLabel
      });

      return {
        subject,
        text: `${subject}\n\n${rawBody || 'Email from ' + companyName}\n\n${cleanSig}`,
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9" style="padding: 24px 12px; min-height: 100vh;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 0; background-color: #ffffff;">
              ${blocksHtml}
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
  }

  // =========================================================================
  // 1. CUSTOM RAW HTML MODE
  // =========================================================================
  if (presetType === 'custom_html') {
    let customHtml = rawBody;
    if (!customHtml.includes('<html') && !customHtml.includes('<body')) {
      customHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    ${customHtml}
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">
      ${formattedSig}
    </div>
  </div>
  ${trackingPixel}
</body>
</html>`;
    } else {
      if (trackingPixel) {
        if (customHtml.includes('</body>')) {
          customHtml = customHtml.replace('</body>', `${trackingPixel}</body>`);
        } else {
          customHtml += trackingPixel;
        }
      }
    }

    return {
      subject,
      text: `${subject}\n\n${rawBody.replace(/<[^>]*>?/gm, '')}\n\n${cleanSig}`,
      html: customHtml
    };
  }

  // =========================================================================
  // 2. PROMOTIONAL OFFER & VOUCHER DESIGN
  // =========================================================================
  if (presetType === 'promo_deal') {
    const couponCode = template.coupon_code || 'SPECIAL-SAVE30';

    return {
      subject,
      text: `${subject}\n\n${rawBody}\n\nVoucher Code: ${couponCode}\n\n${ctaText ? `${ctaText}: ${rawCtaUrl}\n\n` : ''}${cleanSig}`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f8fafc" style="padding: 24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 6px 20px rgba(0,0,0,0.07); border: 1px solid #e2e8f0;">
          
          <!-- Banner Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${buttonColor} 0%, #b45309 100%); padding: 32px 32px 24px 32px; text-align: center; color: #ffffff;">
              <span style="display: inline-block; background: rgba(0, 0, 0, 0.25); padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: #fef3c7; margin-bottom: 12px;">
                ${badgeText || '🔥 SPECIAL PROMOTIONAL OFFER'}
              </span>
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; line-height: 1.3; color: #ffffff;">
                ${heroHeadline || 'Unlock Your Exclusive Corporate Discount'}
              </h1>
              ${heroSubheading ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #fed7aa;">${heroSubheading}</p>` : ''}
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 28px 32px; background-color: #ffffff;">
              ${formattedBody}

              <!-- Voucher Card Box -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0; background: #fffbeb; border: 2px dashed #f59e0b; border-radius: 12px; padding: 18px 24px; text-align: center;">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 700; color: #b45309; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">
                      Your Privilege Voucher Code
                    </div>
                    <div style="font-size: 22px; font-family: monospace; font-weight: 800; color: #1e293b; background: #ffffff; display: inline-block; padding: 8px 24px; border-radius: 8px; border: 1px solid #fde68a; letter-spacing: 2px;">
                      ${couponCode}
                    </div>
                    <div style="font-size: 11px; color: #78350f; margin-top: 6px;">
                      Valid for ${companyName} (${branchLabel})
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Benefits List -->
              <div style="background: #f8fafc; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
                <div style="font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 8px;">What You Receive:</div>
                <div style="font-size: 13px; color: #475569; line-height: 1.8;">
                  <div>✔ Direct access to senior enterprise consultants</div>
                  <div>✔ Accelerated onboarding & SLA priority delivery</div>
                  <div>✔ Dedicated account management support</div>
                </div>
              </div>

              <!-- CTA Button -->
              ${ctaText ? `
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" bgcolor="${buttonColor}" style="border-radius: 10px; box-shadow: 0 4px 14px ${buttonColor}40;">
                          <a href="${destinationCtaUrl}" target="_blank" style="font-family: inherit; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; display: inline-block; padding: 15px 36px; border-radius: 10px;">
                            ${ctaText} &nbsp;&rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>` : ''}

              <!-- Signature -->
              <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #f1f5f9; color: #64748b; font-size: 14px; line-height: 1.6;">
                ${formattedSig}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 18px 32px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #64748b;">${companyName} • ${branchLabel}</p>
              <p style="margin: 0;">Limited time promotional communication. Terms and conditions apply.</p>
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

  // =========================================================================
  // 3. CANDIDATE INTERVIEW CALL LETTER DESIGN
  // =========================================================================
  if (presetType === 'interview_call') {
    const interviewDate = data.interview_date || 'Upcoming Monday';
    const interviewTime = data.interview_time || '11:00 AM IST';
    const interviewVenue = data.interview_venue || 'Online Google Meet Conference';
    const jobTitle = data.job_title || template.target_stage || 'Position Applied';

    return {
      subject,
      text: `${subject}\n\n${rawBody}\n\nDate: ${interviewDate}\nTime: ${interviewTime}\nVenue: ${interviewVenue}\n\n${ctaText ? `${ctaText}: ${rawCtaUrl}\n\n` : ''}${cleanSig}`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9" style="padding: 24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3730a3 0%, #1e1b4b 100%); padding: 28px 32px; color: #ffffff;">
              <span style="display: inline-block; background: rgba(255, 255, 255, 0.18); padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #c7d2fe; margin-bottom: 10px;">
                ${badgeText || '💼 RECRUITMENT INTERVIEW DESK'}
              </span>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff;">
                ${heroHeadline || `Interview Call Letter: ${jobTitle}`}
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #e0e7ff;">
                ${companyName} • Talent Acquisition Division (${branchLabel})
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 30px 32px; background-color: #ffffff;">
              ${formattedBody}

              <!-- Interview Schedule Details Box -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #f8fafc; border: 1.5px solid #c7d2fe; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="background: #eef2ff; padding: 10px 18px; border-bottom: 1px solid #c7d2fe; font-size: 13px; font-weight: 700; color: #3730a3;">
                    📋 Confirmed Interview Schedule Details
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 18px; font-size: 14px; color: #334155; line-height: 1.8;">
                    <div>📅 <strong>Date:</strong> ${interviewDate}</div>
                    <div>⏰ <strong>Time:</strong> ${interviewTime} (Indian Standard Time)</div>
                    <div>📍 <strong>Mode / Location:</strong> ${interviewVenue}</div>
                    <div>🏢 <strong>Assigned Branch:</strong> ${branchLabel}</div>
                    <div>👤 <strong>Panel:</strong> Senior HR & Technical Evaluation Desk</div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              ${ctaText ? `
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" bgcolor="${buttonColor}" style="border-radius: 10px; box-shadow: 0 4px 12px ${buttonColor}40;">
                          <a href="${destinationCtaUrl}" target="_blank" style="font-family: inherit; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; display: inline-block; padding: 14px 32px; border-radius: 10px;">
                            ${ctaText} &nbsp;&rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>` : ''}

              <!-- Signature -->
              <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #f1f5f9; color: #64748b; font-size: 14px; line-height: 1.6;">
                ${formattedSig}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;">
              <p style="margin: 0;">${companyName} Recruitment • This is an official interview communication.</p>
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

  // =========================================================================
  // 4. OFFICIAL JOB OFFER / LOI ANNOUNCEMENT
  // =========================================================================
  if (presetType === 'job_offer') {
    const candidateName = data.candidate_name || data.name || 'Candidate';
    const jobTitle = data.job_title || 'Software Specialist';

    return {
      subject,
      text: `${subject}\n\n${rawBody}\n\nRole: ${jobTitle}\n\n${ctaText ? `${ctaText}: ${rawCtaUrl}\n\n` : ''}${cleanSig}`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9" style="padding: 24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
          
          <!-- Celebratory Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #15803d 0%, #064e3b 100%); padding: 32px 32px 24px 32px; text-align: center; color: #ffffff;">
              <span style="display: inline-block; background: rgba(255, 255, 255, 0.2); padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #ffffff; margin-bottom: 12px;">
                🎉 CONGRATULATIONS ${candidateName.toUpperCase()}!
              </span>
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff;">
                ${heroHeadline || `Letter of Intent: ${jobTitle}`}
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #bbf7d0;">
                Welcome to the ${companyName} Family (${branchLabel})
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 30px 32px; background-color: #ffffff;">
              ${formattedBody}

              <!-- Role & Offer Highlights Box -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0; background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 12px; padding: 18px 22px;">
                <tr>
                  <td>
                    <div style="font-size: 13px; font-weight: 700; color: #166534; margin-bottom: 8px;">
                      🏆 Offer Overview Summary:
                    </div>
                    <div style="font-size: 14px; color: #1e293b; line-height: 1.8;">
                      <div>🎯 <strong>Designation:</strong> ${jobTitle}</div>
                      <div>🏢 <strong>Deploying Company:</strong> ${companyName}</div>
                      <div>📍 <strong>Location / Branch:</strong> ${branchLabel}</div>
                      <div>📄 <strong>Status:</strong> Formal Offer of Intent (LOI) Released</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              ${ctaText ? `
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" bgcolor="${buttonColor}" style="border-radius: 10px; box-shadow: 0 4px 12px ${buttonColor}40;">
                          <a href="${destinationCtaUrl}" target="_blank" style="font-family: inherit; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; display: inline-block; padding: 15px 36px; border-radius: 10px;">
                            ${ctaText} &nbsp;&rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>` : ''}

              <!-- Signature -->
              <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #f1f5f9; color: #64748b; font-size: 14px; line-height: 1.6;">
                ${formattedSig}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 18px 32px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;">
              <p style="margin: 0;">${companyName} HR Desk • Confidential Employment Communication</p>
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

  // =========================================================================
  // 5. CORPORATE NEWSLETTER / DIGEST DESIGN
  // =========================================================================
  if (presetType === 'newsletter') {
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
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9" style="padding: 24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          
          <!-- Masthead Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 24px 32px; color: #ffffff; border-bottom: 3px solid ${buttonColor};">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8;">
                      ${companyName.toUpperCase()} BULLETIN • ${branchLabel.toUpperCase()}
                    </div>
                    <h1 style="margin: 6px 0 0 0; font-size: 22px; font-weight: 800; color: #ffffff;">
                      ${heroHeadline || 'Monthly Operational Insights & Highlights'}
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 28px 32px; background-color: #ffffff;">
              ${formattedBody}

              <!-- Highlights Row -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
                <tr>
                  <td width="50%" style="padding: 16px; background-color: #f8fafc; border-right: 1px solid #e2e8f0; vertical-align: top;">
                    <div style="font-size: 12px; font-weight: 700; color: #0284c7; margin-bottom: 4px;">🚀 INNOVATION</div>
                    <div style="font-size: 13px; color: #334155; line-height: 1.4;">Smart process automation upgrades driving productivity across all units.</div>
                  </td>
                  <td width="50%" style="padding: 16px; background-color: #f8fafc; vertical-align: top;">
                    <div style="font-size: 12px; font-weight: 700; color: #16a34a; margin-bottom: 4px;">📈 GROWTH</div>
                    <div style="font-size: 13px; color: #334155; line-height: 1.4;">Seamless client deliverables and branch expansions throughout this quarter.</div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              ${ctaText ? `
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" bgcolor="${buttonColor}" style="border-radius: 10px;">
                          <a href="${destinationCtaUrl}" target="_blank" style="font-family: inherit; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; display: inline-block; padding: 14px 32px; border-radius: 10px;">
                            ${ctaText} &nbsp;&rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>` : ''}

              <!-- Signature -->
              <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #f1f5f9; color: #64748b; font-size: 14px; line-height: 1.6;">
                ${formattedSig}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 18px 32px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #64748b;">${companyName} CRM Digest</p>
              <p style="margin: 0;">Sent from ${branchLabel}. All rights reserved.</p>
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

  // =========================================================================
  // 6. DEFAULT ADVANCE MARKETING HERO DESIGN
  // =========================================================================
  if (presetType === 'marketing') {
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
              <p style="margin: 0 0 6px 0; font-weight: 600; color: #64748b;">${companyName} • ${branchLabel}</p>
              <p style="margin: 0;">You received this communication regarding your inquiry or profile with ${companyName}.</p>
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

  // =========================================================================
  // 7. PLAIN TEXT BUSINESS LAYOUT
  // =========================================================================
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
    <div style="margin-top: 16px; font-size: 12px; color: #94a3b8;">
      ${companyName} • ${branchLabel}
    </div>
    ${trackingPixel}
  </div>
</body>
</html>`
  };
}
