import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getWorkspaceTelephonyConfig } from '@/utils/telephonyConfig';

// GET /api/plivo/admin/numbers - Fetch rented numbers and wallet credits for a workspace
export async function GET(req) {
  try {
    const company = req.nextUrl?.searchParams?.get('company') || '';
    const tenantId = req.nextUrl?.searchParams?.get('tenant_id') || null;

    const { authId, authToken, isSwan } = await getWorkspaceTelephonyConfig(company, tenantId);

    if (!authId || !authToken) {
      return NextResponse.json({
        success: false,
        error: 'Plivo credentials are not configured for this workspace.',
        numbers: [],
        wallet: null
      }, { status: 400 });
    }

    const b64 = Buffer.from(`${authId}:${authToken}`).toString('base64');

    // Fetch Phone Numbers & Account Details (Wallet Balance) in parallel
    const [numbersRes, accountRes] = await Promise.all([
      fetch(`https://api.plivo.com/v1/Account/${authId}/Number/?limit=50`, {
        headers: { 'Authorization': `Basic ${b64}` },
        cache: 'no-store'
      }),
      fetch(`https://api.plivo.com/v1/Account/${authId}/`, {
        headers: { 'Authorization': `Basic ${b64}` },
        cache: 'no-store'
      })
    ]);

    const numbersData = await numbersRes.json().catch(() => ({ objects: [] }));
    const accountData = await accountRes.json().catch(() => ({}));

    const rawNumbers = Array.isArray(numbersData.objects) ? numbersData.objects : [];
    const formattedNumbers = rawNumbers.map(n => {
      let numStr = String(n.number || '').trim();
      if (!numStr.startsWith('+')) numStr = `+${numStr}`;
      return {
        number: numStr,
        raw_number: n.number,
        alias: n.alias || 'Plivo DID',
        type: n.number_type || n.type || 'local',
        city: n.city || '',
        region: n.region || '',
        country: n.country || 'India',
        voice_enabled: Boolean(n.voice_enabled),
        sms_enabled: Boolean(n.sms_enabled),
        active: Boolean(n.active),
        added_on: n.added_on || null
      };
    });

    const creditsUSD = parseFloat(accountData.cash_credits) || 0;
    const creditsINR = Math.round(creditsUSD * 80 * 100) / 100;
    const formattedINR = "₹" + creditsINR.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedUSD = "$" + creditsUSD.toFixed(2);
    const wallet = {
      cash_credits: creditsUSD,
      inr_credits: creditsINR,
      formatted_credits: `${formattedINR} (${formattedUSD})`,
      formatted_inr: formattedINR,
      formatted_usd: formattedUSD,
      currency: 'INR / USD',
      account_name: accountData.name || authId,
      account_type: accountData.account_type || 'standard'
    };

    // Cache numbers in tenant_entitlements if tenantId is available
    if (tenantId) {
      try {
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const { data: ent } = await adminClient
          .from('tenant_entitlements')
          .select('config_json')
          .eq('tenant_id', tenantId)
          .eq('module_key', 'TELEPHONY_CONFIG')
          .maybeSingle();

        if (ent?.config_json) {
          const updatedJson = {
            ...ent.config_json,
            phone_numbers: formattedNumbers,
            last_wallet_credits: credits,
            wallet_synced_at: new Date().toISOString()
          };
          await adminClient
            .from('tenant_entitlements')
            .update({ config_json: updatedJson })
            .eq('tenant_id', tenantId)
            .eq('module_key', 'TELEPHONY_CONFIG');
        }
      } catch (cacheErr) {
        console.warn('Failed to cache phone numbers in tenant_entitlements:', cacheErr);
      }
    }

    return NextResponse.json({
      success: true,
      numbers: formattedNumbers,
      total: formattedNumbers.length,
      wallet,
      isSwan
    });
  } catch (error) {
    console.error('Fetch Plivo numbers error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch Plivo numbers.',
      numbers: [],
      wallet: null
    }, { status: 500 });
  }
}
