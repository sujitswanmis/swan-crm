import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaign_id, contacts } = await req.json();

    console.log("INCOMING CONTACTS:", JSON.stringify(contacts.slice(0, 2)));

    if (!campaign_id || !contacts || !Array.isArray(contacts)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const adminClient = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const validContacts = contacts
      .map(c => {
        // Create lowercased version of keys for robust access, stripping BOM and spaces
        const lowerC = {};
        for (const key in c) {
          const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
          lowerC[cleanKey] = c[key];
        }
        return lowerC;
      })
      .filter(c => {
        const hasMobile = c.mobile && String(c.mobile).replace(/\D/g, '').length >= 10;
        if (!hasMobile) console.log("INVALID CONTACT REJECTED:", c);
        return hasMobile;
      })
      .map(c => ({
        campaign_id,
        name: c.name || null,
        mobile: String(c.mobile || '').replace(/\D/g, ''), // sanitize mobile
        company_name: c.company_name || null,
        state: c.state || null,
        district: c.district || null,
        product_interest: c.product_interest || null,
        custom_1: c.custom_1 || c.status || null,
        custom_2: c.custom_2 || null,
        custom_3: c.custom_3 || null,
        call_status: 'pending'
      }));

    if (validContacts.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: `No valid contacts. We received: ${JSON.stringify(contacts.slice(0,2))}` 
      }, { status: 400 });
    }

    // Insert contacts
    const { error: insertError } = await adminClient
      .from('ai_campaign_contacts')
      .insert(validContacts);

    if (insertError) throw insertError;

    // Update total_contacts in campaign
    const { data: campaign } = await adminClient
      .from('ai_campaigns')
      .select('total_contacts')
      .eq('id', campaign_id)
      .single();

    const newTotal = (campaign?.total_contacts || 0) + validContacts.length;

    await adminClient
      .from('ai_campaigns')
      .update({ total_contacts: newTotal })
      .eq('id', campaign_id);

    return NextResponse.json({ success: true, count: validContacts.length }, { status: 200 });
  } catch (error) {
    console.error('Upload Contacts Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
