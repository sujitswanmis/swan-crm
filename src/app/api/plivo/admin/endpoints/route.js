import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getWorkspaceTelephonyConfig, getCompanySlug } from '@/utils/telephonyConfig';
import { requireCallCenterAccess, readWorkspaceAdmin, privateHeaders } from '@/lib/callCenterPageData';

// GET /api/plivo/admin/endpoints
// Fetch Plivo endpoints using offset-based pagination.
export async function GET(req) {
  try {
    const assignment = new URL(req.url).searchParams.get('purpose') === 'assignment';
    const context = await requireCallCenterAccess(req, { section: assignment ? 'agents' : 'endpoints' });
    const { company, tenantId } = context;

    const { authId, authToken, isSwan, mode, callingSeatLimit: configuredSeatLimit } = await getWorkspaceTelephonyConfig(company, tenantId);

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
    const signal = AbortSignal.timeout(15000);

    for (let page = 0; page < maxPages; page += 1) {
      const url =
        `https://api.plivo.com/v1/Account/${authId}/Endpoint/` +
        `?limit=${pageSize}&offset=${offset}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Basic ${b64}`,
        },
        cache: 'no-store',
        signal,
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
        currentPageEndpoints.length > 0;

      if (!hasNextPage) {
        break;
      }
      if (page === maxPages - 1) throw new Error('The full SIP endpoint list could not be loaded. Please retry.');

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

    const { data: dbAgents, error: credentialReadError } = await adminClient
      .from('call_agents')
      .select('plivo_username, plivo_endpoint_key, plivo_password')
      .not('plivo_password', 'is', null);
    if (credentialReadError) throw new Error('CRM endpoint credentials could not be loaded. Please retry.');

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

    const callingSeatLimit = isSwan ? 300 : (configuredSeatLimit || 5);

    return NextResponse.json({
      endpoints,
      total: endpoints.length,
      fetched: endpoints.length,
      callingSeatLimit,
      isSwan
    }, { headers: privateHeaders });
  } catch (error) {
    console.error('Admin endpoints error:', error);

    return NextResponse.json(
      {
        error: error.message || 'Unable to fetch Plivo endpoints.',
      },
      { status: error.status || 500, headers: privateHeaders }
    );
  }
}

// POST /api/plivo/admin/endpoints
// Directly create a new SIP endpoint on Plivo REST API and register in agent_endpoint_registry
export async function POST(req) {
  try {
    const body = await req.json();
    const context = await requireCallCenterAccess(req, { section: 'endpoints', operation: body.action ? 'edit' : 'add', body });
    body.company = context.company;
    body.tenantId = context.tenantId;

    // ── Handle SIP Password Update ───────────────────────────
    if (body.action === 'update_password') {
      const { endpointId, password, company, tenantId } = body;
      const cleanPassword = String(password || '').trim();
      if (!/^\d+$/.test(String(endpointId || '')) || cleanPassword.length < 5) {
        return NextResponse.json({ error: 'A valid Endpoint ID and password of at least 5 characters are required.' }, { status: 400 });
      }

      const tel = await getWorkspaceTelephonyConfig(company, tenantId);
      const { authId, authToken } = tel;
      if (!authId || !authToken) {
        return NextResponse.json({ error: 'Plivo credentials are not configured.' }, { status: 500 });
      }

      const b64 = Buffer.from(`${authId}:${authToken}`).toString('base64');
      const plivoUrl = `https://api.plivo.com/v1/Account/${authId}/Endpoint/${endpointId}/`;
      // Resolve the actual provider username instead of trusting the browser's alias/username.
      const endpointResponse = await fetch(plivoUrl, { headers: { Authorization: `Basic ${b64}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
      const endpoint = await endpointResponse.json();
      if (!endpointResponse.ok || !endpoint.username) throw new Error('The endpoint could not be verified on Plivo.');
      const cleanUser = String(endpoint.username).toLowerCase().trim();
      const workspace = await readWorkspaceAdmin(context);
      const linked = workspace.agents.some(agent => String(agent.plivo_endpoint_key) === String(endpointId) || String(agent.plivo_username || '').toLowerCase() === cleanUser)
        || workspace.endpoints.some(ep => String(ep.endpoint_id) === String(endpointId) || String(ep.username || '').toLowerCase() === cleanUser);
      const slug = getCompanySlug(company);
      const label = `${endpoint.alias || ''} ${cleanUser}`.toLowerCase();
      if (!tel.isSwan && tel.mode !== 'byoc' && !linked && !(slug && label.includes(slug))) {
        return NextResponse.json({ error: 'This endpoint is outside your workspace.' }, { status: 403 });
      }
      const { data: matches, error: readError } = await context.db.from('call_agents').select('id, user_id, plivo_username, plivo_endpoint_key')
        .or(`plivo_username.ilike.${cleanUser},plivo_endpoint_key.eq.${endpointId}`);
      if (readError) throw new Error('Could not verify CRM credential storage. Please retry.');
      const allowedIds = new Set(workspace.agents.map(agent => agent.id));
      if ((matches || []).some(agent => agent.user_id && !allowedIds.has(agent.id))) {
        return NextResponse.json({ error: 'This endpoint is assigned outside your workspace.' }, { status: 403 });
      }
      const plivoRes = await fetch(plivoUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${b64}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: cleanPassword }),
        signal: AbortSignal.timeout(10000)
      });

      if (!plivoRes.ok) {
        const pData = await plivoRes.json().catch(() => ({}));
        throw new Error(pData?.error || pData?.message || 'Failed to update password on Plivo.');
      }

      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      try {
        let saved;
        if (matches?.length) {
          saved = await adminClient.from('call_agents').update({ plivo_password: cleanPassword }).in('id', matches.map(agent => agent.id))
            .or(`plivo_username.ilike.${cleanUser},plivo_endpoint_key.eq.${endpointId}`).select('id');
          if (!saved.data?.length || saved.data.length !== matches.length) throw new Error('No matching CRM record was updated.');
        } else {
          // Existing endpoint credential storage pattern; no employee or endpoint is reassigned.
          saved = await adminClient.from('call_agents').insert({ user_id: null, display_name: `Endpoint ${endpoint.alias || cleanUser}`,
            plivo_username: cleanUser, plivo_endpoint_key: String(endpointId), plivo_sip_uri: endpoint.sip_uri || `sip:${cleanUser}@phone.plivo.com`,
            plivo_password: cleanPassword, is_active: false, status: 'offline' }).select('id');
        }
        if (saved.error || !saved.data?.length) throw new Error('CRM credential write failed.');
        const verified = await adminClient.from('call_agents').select('id, plivo_password').in('id', saved.data.map(agent => agent.id));
        if (verified.error || verified.data?.length !== saved.data.length || verified.data.some(agent => agent.plivo_password !== cleanPassword)) throw new Error('CRM credential verification failed.');
      } catch {
        return NextResponse.json({ success: false, providerUpdated: true, error: 'Plivo password changed, but CRM synchronization could not be verified. Retry saving the same password before reconnecting this endpoint.' }, { status: 503, headers: privateHeaders });
      }
      return NextResponse.json({ success: true, endpointId: String(endpointId), message: 'Password saved and verified on Plivo and CRM.' }, { headers: privateHeaders });
    }

    // ── Handle SIP Alias / Friendly Name Update ──────────────
    if (body.action === 'update_alias') {
      const { endpointId, username, alias, company, tenantId } = body;
      if (!endpointId || !alias) {
        return NextResponse.json({ error: 'Endpoint ID and alias are required.' }, { status: 400 });
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
        body: JSON.stringify({ alias: String(alias).trim() })
      });

      if (!plivoRes.ok) {
        const pData = await plivoRes.json().catch(() => ({}));
        throw new Error(pData?.error || pData?.message || 'Failed to update alias on Plivo.');
      }

      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const cleanUser = String(username || '').toLowerCase().trim();
      const updatedAlias = String(alias).trim();

      if (endpointId) {
        await adminClient
          .from('agent_endpoint_registry')
          .update({ alias: updatedAlias })
          .eq('endpoint_id', endpointId);
      }
      if (cleanUser) {
        await adminClient
          .from('agent_endpoint_registry')
          .update({ alias: updatedAlias })
          .eq('username', cleanUser);
      }

      return NextResponse.json({ success: true, message: 'Alias updated successfully on Plivo and CRM!' });
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

    const telConfig = await getWorkspaceTelephonyConfig(company, tenantId);
    const { authId, authToken, isSwan, callingSeatLimit } = telConfig;

    if (!authId || !authToken) {
      return NextResponse.json(
        { error: 'Plivo credentials are not configured for this workspace.' },
        { status: 500 }
      );
    }

    // Enforce Tenant Calling Seat Quota on SIP Endpoint creation
    if (!isSwan) {
      const seatLimit = Math.max(1, parseInt(callingSeatLimit, 10) || 5);
      const adminCheckClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const slug = getCompanySlug(company || '');
      const compLower = String(company || '').toLowerCase().trim();

      const [{ data: compUsers }, { data: allRegEndpoints }] = await Promise.all([
        compLower ? adminCheckClient.from('user_roles').select('user_id').ilike('company', `%${compLower}%`) : Promise.resolve({ data: [] }),
        adminCheckClient.from('agent_endpoint_registry').select('id, endpoint_key, alias, username, assigned_agent_id')
      ]);

      const compUserIds = new Set((compUsers || []).map(u => u.user_id));
      let compAgentIds = new Set();
      if (compUserIds.size > 0) {
        const { data: compAgents } = await adminCheckClient
          .from('call_agents')
          .select('id')
          .in('user_id', Array.from(compUserIds));
        compAgentIds = new Set((compAgents || []).map(a => a.id));
      }

      const existingEndpointsCount = (allRegEndpoints || []).filter(ep => {
        const aliasOrKey = `${ep.endpoint_key || ''} ${ep.alias || ''}`.toLowerCase();
        if (aliasOrKey.includes('nsmlr') || String(ep.username || '').toLowerCase().includes('nsmlr')) return false;
        const belongsByText = (compLower && aliasOrKey.includes(compLower)) || (slug && aliasOrKey.includes(slug));
        const belongsByAgent = ep.assigned_agent_id && compAgentIds.has(ep.assigned_agent_id);
        return belongsByText || belongsByAgent;
      }).length;

      if (existingEndpointsCount >= seatLimit) {
        return NextResponse.json(
          {
            error: `Calling seat limit reached (${existingEndpointsCount}/${seatLimit}). You cannot create more than ${seatLimit} SIP endpoints. Please upgrade your calling plan or contact Master Admin to increase seats.`
          },
          { status: 403 }
        );
      }
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
      { status: err.status || 500, headers: privateHeaders }
    );
  }
}
