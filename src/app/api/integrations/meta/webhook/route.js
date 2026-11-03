import { IntegrationError, assertEnabled, errorResponse, parseJson, readBody, safeEqual, verifySignature } from '@/lib/integrations/security';
import { checked, integrationDb, consumeRateLimit } from '@/lib/integrations/store';
import { parseMetaEvents } from '@/lib/integrations/meta';
import { enqueueJobs } from '@/lib/integrations/queue';
import { loadTenantPolicy } from '@/lib/integrations/tenantPolicy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request) {
  try {
    const params=new URL(request.url).searchParams;
    if(params.get('hub.mode')!=='subscribe' || !process.env.META_WEBHOOK_VERIFY_TOKEN || !safeEqual(params.get('hub.verify_token'),process.env.META_WEBHOOK_VERIFY_TOKEN)) throw new IntegrationError('Verification denied.',403);
    const challenge=params.get('hub.challenge') || '';
    if(!/^\d{1,100}$/.test(challenge)) throw new IntegrationError('Invalid verification challenge.');
    return new Response(challenge,{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error);}
}
export async function POST(request) {
  try {
    assertEnabled();
    const raw=await readBody(request);
    if(!verifySignature(process.env.META_APP_SECRET,raw,request.headers.get('x-hub-signature-256'))) throw new IntegrationError('Meta signature verification failed.',401,'unauthorized');
    const events=parseMetaEvents(parseJson(raw)),db=integrationDb();
    const pages=[...new Set(events.map(event=>event.page_id))];
    const connections=pages.length?checked(await db.from('integration_connections').select('*').eq('type','meta').eq('status','enabled').in('config->>page_id',pages)):[];
    const chargedTenants=new Set();
    for(const connection of connections || []) {
      const matching=events.filter(event=>connection.config.page_id===event.page_id&&connection.config.form_ids.includes(event.form_id));
      if(!matching.length)continue;
      const policy=await loadTenantPolicy(db,connection.tenant_id,connection.branch_code);
      if(!policy.enabled || !policy.features.meta) continue;
      if(!chargedTenants.has(connection.tenant_id)){await consumeRateLimit(db,`meta:${connection.tenant_id}`,600);chargedTenants.add(connection.tenant_id);}
      await enqueueJobs({db,tenant:{id:connection.tenant_id},branchCode:connection.branch_code},connection,matching.map(event=>({kind:'meta_lead',dedupe:`meta:${connection.code}:${event.lead_id}`,payload:event})));
    }
    return Response.json({success:true},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error);}
}
