import { integrationDb, checked, consumeRateLimit } from '@/lib/integrations/store';
import { tenantDirectory } from '@/lib/integrations/access';
import { IntegrationError, assertEnabled, decryptSecret, encryptSecret, errorResponse, hashSecret, parseJson, readBody, safeEqual, verifySignature } from '@/lib/integrations/security';
import { applyDefaults, mapRecord } from '@/lib/integrations/connectors';
import { normalizeLead, validatePayloadScope } from '@/lib/integrations/leadAdapter';
import { enqueueJobs } from '@/lib/integrations/queue';
import { requireTenantFeature } from '@/lib/integrations/tenantPolicy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request,{params}) {
  try {
    assertEnabled();
    const {connectionCode}=await params;
    if(!/^CON_[A-Za-z0-9_-]{40,60}$/.test(connectionCode || '')) throw new IntegrationError('Webhook not found.',404);
    const db=integrationDb();
    const connection=checked(await db.from('integration_connections').select('*').eq('code',connectionCode).eq('type','incoming').eq('status','enabled').maybeSingle());
    if(!connection) throw new IntegrationError('Webhook not found.',404);
    const raw=await readBody(request),secret=decryptSecret(connection.credentials).webhook_secret;
    const authorized=connection.config.auth_mode==='bearer'
      ?safeEqual(request.headers.get('authorization') || '',`Bearer ${secret}`)
      :verifySignature(secret,raw,request.headers.get('x-integration-signature'),request.headers.get('x-integration-timestamp'));
    if(!authorized) throw new IntegrationError('Invalid webhook authentication or timestamp.',401,'unauthorized');
    await consumeRateLimit(db,`incoming:${connection.code}`,120);
    await consumeRateLimit(db,`tenant:${connection.tenant_id}`,600);
    const tenant=(await tenantDirectory(db,{tenantId:connection.tenant_id})).find(item=>item.id===connection.tenant_id);
    if(!tenant || ['SUSPENDED','ARCHIVED','DRAFT'].includes(String(tenant.status).toUpperCase())) throw new IntegrationError('Tenant is unavailable.',403);
    const context={db,tenant,branchCode:connection.branch_code,actorCode:connection.code};
    await requireTenantFeature(context,'incoming');
    const body=parseJson(raw),record=applyDefaults(Object.keys(connection.config.mapping || {}).length?mapRecord(body,connection.config.mapping):body,connection.config);
    validatePayloadScope(record,context);normalizeLead(record);
    const identity=record.external_id?String(record.external_id):raw;
    await enqueueJobs(context,connection,[{kind:'incoming',dedupe:`incoming:${connection.code}:${hashSecret(identity)}`,payload:{record:encryptSecret(record)}}]);
    return Response.json({success:true,status:'accepted'},{status:202,headers:{'Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error);}
}
