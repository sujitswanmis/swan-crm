import { NextResponse } from 'next/server';

// The agent waits in the conference until the customer answers. Ringback here
// would imply that the handset is alerting, which a carrier ring event cannot prove.
export async function GET() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Wait length="60" silence="true"/></Response>', {
    headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' }
  });
}

export const POST = GET;
