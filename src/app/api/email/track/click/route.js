import { NextResponse } from 'next/server';
import { recordEmailClick } from '@/app/actions/emailConfig';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const trackingId = searchParams.get('tid') || searchParams.get('id');
    const rawTargetUrl = searchParams.get('url') || searchParams.get('dest');

    let destinationUrl = '/';
    if (rawTargetUrl) {
      try {
        const decoded = decodeURIComponent(rawTargetUrl);
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          destinationUrl = decoded;
        } else if (decoded.startsWith('/')) {
          destinationUrl = new URL(decoded, request.url).toString();
        }
      } catch (e) {
        destinationUrl = '/';
      }
    }

    if (trackingId) {
      const userAgent = request.headers.get('user-agent') || '';
      const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
      // Asynchronously record click event without delaying redirect
      recordEmailClick(trackingId, destinationUrl, { userAgent, ip }).catch(err => {
        console.error('Error recording email click event:', err);
      });
    }

    return NextResponse.redirect(destinationUrl, 302);
  } catch (err) {
    console.error('Track click route error:', err);
    return NextResponse.redirect(new URL('/', request.url).toString(), 302);
  }
}
