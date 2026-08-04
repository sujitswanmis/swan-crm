import { NextResponse } from 'next/server';

// GET /api/plivo/admin/endpoints
// Fetch all Plivo endpoints using offset-based pagination.
export async function GET() {
  try {
    const authId = (process.env.PLIVO_AUTH_ID || '')
      .trim()
      .replace(/['"]/g, '');

    const authToken = (process.env.PLIVO_AUTH_TOKEN || '')
      .trim()
      .replace(/['"]/g, '');

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

    const endpoints = uniqueEndpoints.map((ep) => ({
      endpoint_id: ep.endpoint_id,
      alias: ep.alias,
      username: ep.username,
      sip_uri: ep.sip_uri,
      sip_registered: ep.sip_registered,
      application: ep.application,
    }));

    return NextResponse.json({
      endpoints,
      total: totalCount || endpoints.length,
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
