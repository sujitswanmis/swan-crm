import { NextResponse } from 'next/server';
import { recordEmailOpen } from '@/app/actions/emailConfig';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Transparent 1x1 GIF (43 bytes)
const TRANSPARENT_1X1_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const trackingId = searchParams.get('tid') || searchParams.get('id');

    if (trackingId) {
      const userAgent = request.headers.get('user-agent') || '';
      const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
      // Asynchronously record open event without blocking image response
      recordEmailOpen(trackingId, { userAgent, ip }).catch(err => {
        console.error('Error recording email open event:', err);
      });
    }

    return new NextResponse(TRANSPARENT_1X1_GIF, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Content-Length': String(TRANSPARENT_1X1_GIF.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (err) {
    console.error('Track open route error:', err);
    return new NextResponse(TRANSPARENT_1X1_GIF, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      }
    });
  }
}
