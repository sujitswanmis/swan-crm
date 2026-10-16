import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getWorkspaceTelephonyConfig, getCompanySlug } from '@/utils/telephonyConfig';

// GET /api/plivo/admin/endpoints
// Fetch Plivo endpoints using offset-based pagination.
export async function GET(req) {
  try {
    const company = req?.nextUrl?.searchParams?.get('company') || '';
    const tenantId = req?.nextUrl?.searchParams?.get('tenant_id') || null;

    const { authId, authToken, isSwan, mode } = await getWorkspaceTelephonyConfig(company, tenantId);

    if (!authId || !authToken) {
      return NextResponse.json(
        { error: 'Plivo credentials are not configured.' },
        { status: 500 }
      );
    }

    const b64 = Buffer.from(`${authId}:${authToken}`).toString('base64');

    const pageSize = 20;
    const maxPages = 100;

    let offset = 0;
    let totalCount = 0;
    let allEndpoints = [];

    for (let page = 0; page < maxPages; page += 1) {
      const url =
        `https://api.plivo.com/v1/Account/${authId}/Endpoint/` +
        `?limit=${pageSize}&offset=${offset}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Basic ${b64}`,
        },
        cache: 'no-store',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error ||
          data?.message ||
          `Plivo API failed with status ${res.status}`
        );
      }

      const currentPageEndpoints = Array.isArray(data.objects)
        ? data.objects
        : [];

      totalCount = Number(
        data?.meta?.total_count || totalCount || currentPageEndpoints.length
      );

      allEndpoints.push(...currentPageEndpoints);

      const hasNextPage =
        Boolean(data?.meta?.next) &&
        currentPageEndpoints.length > 0 &&
        allEndpoints.length < totalCount;

      if (!hasNextPage) {
        break;
      }

      offset += currentPageEndpoints.length;
    }

    const uniqueEndpoints = Array.from(
      new Map(
        allEndpoints.map((endpoint) => [
          endpoint.endpoint_id,
          endpoint,
        ])
      ).values()
    );

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: dbAgents } = await adminClient
      .from('call_agents')
      .select('plivo_username, plivo_endpoint_key, plivo_password')
      .not('plivo_password', 'is', null);

    const passwordMap = {};
    (dbAgents || []).forEach(a => {
      if (a.plivo_password) {
        if (a.plivo_username) passwordMap[a.plivo_username.toLowerCase()] = a.plivo_password;
        if (a.plivo_endpoint_key) passwordMap[String(a.plivo_endpoint_key)] = a.plivo_password;
      }
    });

    let endpoints = uniqueEndpoints.map((ep) => {
      const un = String(ep.username || '').toLowerCase();
      const pwd = passwordMap[un] || (ep.endpoint_id ? passwordMap[String(ep.endpoint_id)] : null) || null;
      return {
        endpoint_id: ep.endpoint_id,
        alias: ep.alias,
        username: ep.username,
        sip_uri: ep.sip_uri,
        sip_registered: ep.sip_registered,
        application: ep.application,
        password: pwd
      };
    });

    // Workspace Scoping & Isolation
    // Non-Swan workspaces in Managed mode must NEVER see NSMLR or other tenant endpoints
    if (!isSwan && mode !== 'byoc') {
      const compLower = String(company || '').toLowerCase().trim();
      const slug = getCompanySlug(company); // e.g. 'supuja_creations' or 'supuja'

      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const [{ data: compUsers }, { data: dbEndpoints }] = await Promise.all([
        compLower ? adminClient.from('user_roles').select('user_id').ilike('company', `%${compLower}%`) : Promise.resolve({ data: [] }),
        adminClient.from('agent_endpoint_registry').select('*')
      ]);

      const compUserIds = new Set((compUsers || []).map(u => u.user_id));
      let compAgentIds = new Set();
      if (compUserIds.size > 0) {
        const { data: compAgents } = await adminClient
          .from('call_agents')
          .select('id')
          .in('user_id', Array.from(compUserIds));
        compAgentIds = new Set((compAgents || []).map(a => a.id));
      }

      // Valid endpoint keys or usernames belonging to this workspace
      const allowedEndpointIds = new Set();
      const allowedUsernames = new Set();

      (dbEndpoints || []).forEach(ep => {
        const aliasOrKey = `${ep.endpoint_key || ''} ${ep.alias || ''}`.toLowerCase();
        // Strict exclusion of NSMLR endpoints
        if (aliasOrKey.includes('nsmlr') || String(ep.username || '').toLowerCase().includes('nsmlr')) {
          return;
        }
        const belongsByText = (compLower && aliasOrKey.includes(compLower)) || (slug && aliasOrKey.includes(slug));
        const belongsByAgent = ep.assigned_agent_id && compAgentIds.has(ep.assigned_agent_id);
        if (belongsByText || belongsByAgent) {
          if (ep.endpoint_id) allowedEndpointIds.add(String(ep.endpoint_id));
          if (ep.username) allowedUsernames.add(String(ep.username).toLowerCase());
        }
      });

      // Filter endpoints from Plivo
      endpoints = endpoints.filter(ep => {
        const epUser = String(ep.username || '').toLowerCase();
        const epAlias = String(ep.alias || '').toLowerCase();

        // 1. Strict Exclusion: Non-Swan workspaces NEVER see NSMLR or Swan endpoints
        if (epUser.includes('nsmlr') || epAlias.includes('nsmlr')) return false;

        // 2. Allow if recorded in DB for this workspace
        if (ep.endpoint_id && allowedEndpointIds.has(String(ep.endpoint_id))) return true;
        if (epUser && allowedUsernames.has(epUser)) return true;

        // 3. Allow if Plivo username or alias matches workspace slug / company
        if (slug && (epUser.includes(slug) || epAlias.includes(slug))) return true;
        const slugShort = slug.split('_')[0]; // e.g. 'supuja'
        if (slugShort && slugShort.length >= 3 && (epUser.includes(slugShort) || epAlias.includes(slugShort))) return true;
        if (compLower && epAlias.includes(compLower)) return true;

        return false;
      });
    }

    return NextResponse.json({
      endpoints,
      total: endpoints.length,
      fetched: endpoints.length,
    });
  } catch (error) {
    console.error('Admin endpoints error:', error);

    return NextResponse.json(
      {
        error: error.message || 'Unable to fetch Plivo endpoints.',
      },
      { status: 500 }
    );
  }
}

// POST /api/plivo/admin/endpoints
// Directly create a new SIP endpoint on Plivo REST API and register in agent_endpoint_registry
export async function POST(req) {
  try {
    const body = await req.json();

    // ── Handle SIP Password Update ───────────────────────────
    if (body.action === 'update_password') {
      const { endpointId, username, password, company, tenantId } = body;
      if (!endpointId || !password) {
        return NextResponse.json({ error: 'Endpoint ID and password are required.' }, { status: 400 });
      }

      const { authId, authToken } = await getWorkspaceTelephonyConfig(company, tenantId);
      if (!authId || !authToken) {
        return NextResponse.json({ error: 'Plivo credentials are not configured.' }, { status: 500 });
      }

      const b64 = Buffer.from(`${authId}:${authToken}`).toString('base64');
      const plivoUrl = `https://api.plivo.com/v1/Account/${authId}/Endpoint/${endpointId}/`;
      const plivoRes = await fetch(plivoUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${b64}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: String(password).trim() })
      });

      if (!plivoRes.ok) {
        const pData = await plivoRes.json().catch(() => ({}));
        throw new Error(pData?.error || pData?.message || 'Failed to update password on Plivo.');
      }

      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const cleanUser = String(username || '').toLowerCase().trim();
      if (cleanUser) {
        await adminClient.from('call_agents').update({ plivo_password: String(password).trim() }).eq('plivo_username', cleanUser);
      }
      await adminClient.from('call_agents').update({ plivo_password: String(password).trim() }).eq('plivo_endpoint_key', endpointId);

      return NextResponse.json({ success: true, message: 'Password updated successfully on Plivo and CRM!' });
    }

    const { alias, username, password, company, tenantId, assignToAgentId } = body;

    if (!alias || !username || !password) {
      return NextResponse.json(
        { error: 'Alias, Username, and Password are required to create a SIP endpoint.' },
        { status: 400 }
      );
    }

    const cleanUsername = String(username).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanUsername.length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 alphanumeric characters.' },
        { status: 400 }
      );
    }

    const { authId, authToken } = await getWorkspaceTelephonyConfig(company, tenantId);

    if (!authId || !authToken) {
      return NextResponse.json(
        { error: 'Plivo credentials are not configured for this workspace.' },
        { status: 500 }
      );
    }

    const b64 = Buffer.from(`${authId}:${authToken}`).toString('base64');
    const plivoUrl = `https://api.plivo.com/v1/Account/${authId}/Endpoint/`;

    const plivoRes = await fetch(plivoUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${b64}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: cleanUsername,
        password: String(password).trim(),
        alias: String(alias).trim()
      })
    });

    const plivoData = await plivoRes.json();

    if (!plivoRes.ok) {
      console.error('Plivo endpoint create failed:', plivoData);
      return NextResponse.json(
        { error: plivoData?.error || plivoData?.message || 'Failed to create endpoint on Plivo cloud.' },
        { status: plivoRes.status || 400 }
      );
    }

    const realUsername = plivoData.username || cleanUsername;
    const sipUri = plivoData.sip_uri || `sip:${realUsername}@phone.plivo.com`;
    const slug = getCompanySlug(company || 'SWAN');
    const endpointKey = `TC_${slug.toUpperCase()}_${Date.now().toString().slice(-5)}`;

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: registryItem, error: regError } = await adminClient
      .from('agent_endpoint_registry')
      .insert({
        endpoint_key: endpointKey,
        alias: company ? `${alias.trim()} [${company}]` : alias.trim(),
        username: realUsername,
        sip_uri: sipUri,
        endpoint_id: plivoData.endpoint_id || null,
        status: 'available'
      })
      .select()
      .single();

    if (regError) {
      console.warn('Endpoint registered in Plivo but failed in local registry:', regError);
    }

    // Always store password in call_agents so it can always be retrieved and assigned
    if (assignToAgentId) {
      await adminClient
        .from('call_agents')
        .update({
          plivo_endpoint_key: plivoData.endpoint_id || endpointKey,
          plivo_username: realUsername,
          plivo_sip_uri: sipUri,
          plivo_password: String(password).trim()
        })
        .eq('id', assignToAgentId);
    } else {
      // Store in shadow record so unassigned endpoint password is safe
      await adminClient
        .from('call_agents')
        .insert({
          display_name: `Endpoint ${alias.trim()}`,
          plivo_username: realUsername,
          plivo_endpoint_key: plivoData.endpoint_id || endpointKey,
          plivo_sip_uri: sipUri,
          plivo_password: String(password).trim(),
          status: 'offline'
        })
        .select()
        .maybeSingle();
    }

    return NextResponse.json({
      success: true,
      message: `SIP Endpoint ${realUsername} created successfully on Plivo!`,
      endpoint: {
        endpoint_id: plivoData.endpoint_id,
        username: realUsername,
        sip_uri: sipUri,
        alias: alias.trim(),
        endpoint_key: endpointKey,
        password: String(password).trim()
      }
    });

  } catch (err) {
    console.error('Error creating Plivo endpoint:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error creating Plivo endpoint.' },
      { status: 500 }
    );
  }
}
