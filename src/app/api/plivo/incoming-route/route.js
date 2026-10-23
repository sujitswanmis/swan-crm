import { NextResponse } from 'next/server';
import { incomingRouteXml, incomingHangupXml } from '@/lib/plivoIncomingRouting';

export async function POST(req) {
  try {
    const event = Object.fromEntries(new URLSearchParams(await req.text()));
    return new NextResponse(await incomingRouteXml(req, event), { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'no-store' } });
  } catch (error) {
    // A transient storage/provider error must be retried, not interpreted as
    // an instruction to hang up a customer during a requested handoff.
    return new NextResponse(error.status === 403 ? incomingHangupXml : 'Incoming routing temporarily unavailable', {
      status: error.status === 403 ? 403 : 503, headers: { 'Content-Type': error.status === 403 ? 'application/xml' : 'text/plain', 'Cache-Control': 'no-store' }
    });
  }
}
