import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  ConsultationError, openConsultation, consultationBaseUrl,
  startConsultation, prepareCallControls, consultationAction, consultationStatus,
} from '@/lib/plivoConsultation';

export const maxDuration = 60;

async function handle(req) {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    const body = req.method === 'GET'
      ? { roomName: new URL(req.url).searchParams.get('room') }
      : await req.json();
    const ctx = await openConsultation(body.roomName, user.id);
    const result = req.method === 'GET'
      ? await consultationStatus(ctx)
      : body.action === 'start'
        ? await startConsultation(ctx, body.participantNumber, consultationBaseUrl(req))
        : body.action === 'prepare-controls'
          ? await prepareCallControls(ctx, body.role, body.control, consultationBaseUrl(req))
          : await consultationAction(ctx, body.action, body);
    return NextResponse.json({ success: true, consultation: result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (!(error instanceof ConsultationError)) console.error('Consultation controls:', error.message);
    return NextResponse.json({ error: error instanceof ConsultationError ? error.message : 'Call controls could not complete. Please check the call status.' },
      { status: error instanceof ConsultationError ? error.status : 502 });
  }
}

export const GET = handle;
export const POST = handle;
