import { IntegrationError, errorResponse, safeEqual } from '@/lib/integrations/security';
import { runWorker } from '@/lib/integrations/queue';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request) {
  try {
    const secret=process.env.INTEGRATIONS_WORKER_SECRET;
    if(!secret || secret.length<32 || !safeEqual(request.headers.get('authorization') || '',`Bearer ${secret}`)) throw new IntegrationError('Worker authorization denied.',401,'unauthorized');
    return Response.json({success:true,...await runWorker()},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error);}
}
