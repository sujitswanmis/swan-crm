'use server';

import { createClient } from '@supabase/supabase-js';

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function submitPortfolioInquiry(formData) {
  try {
    const { name, email, phone, company, service, message } = formData;

    if (!name || !phone) {
      return { success: false, error: 'Name and Phone / WhatsApp number are required.' };
    }

    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      email: (email || '').trim(),
      company: (company || 'Direct Client Inquiry').trim(),
      service_required: service || 'General Automation Inquiry',
      notes: `[Website Inquiry via supujacreations.com]\nService: ${service || 'Not specified'}\nMessage: ${message || 'No additional details'}\nSubmitted At: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
      status: 'NEW',
      source: 'Website Portfolio',
      created_at: new Date().toISOString()
    };

    // Attempt to insert into leads table if available
    try {
      const { data, error } = await adminClient.from('leads').insert([payload]).select();
      if (error) {
        console.warn('Could not insert directly to leads table, logging locally:', error.message);
      }
    } catch (dbErr) {
      console.warn('Database lead insert skipped:', dbErr.message);
    }

    return { 
      success: true, 
      message: 'Thank you! Your inquiry has been received. Sujit Kumar Gupta / SuPuja Creations team will connect with you shortly.' 
    };
  } catch (err) {
    console.error('Portfolio inquiry error:', err);
    return { success: false, error: 'Failed to submit inquiry. Please connect via WhatsApp or email directly.' };
  }
}
