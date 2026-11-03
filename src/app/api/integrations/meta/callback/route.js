import { requireSessionAccess, tenantDirectory } from '@/lib/integrations/access';
import { checked, findConnection, integrationDb, audit } from '@/lib/integrations/store';
import { IntegrationError, assertEnabled, errorResponse, hashSecret } from '@/lib/integrations/security';
import { completeMetaConnect } from '@/lib/integrations/meta';
import { integrationTabHref } from '@/config/integrationsConfig';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request) {
  try {
    assertEnabled();
    const params=new URL(request.url).searchParams,state=params.get('state') || '';
    if(!/^oauth_[A-Za-z0-9_-]{40,60}$/.test(state)) throw new IntegrationError('Invalid Meta authorization state.',400);
    const db=integrationDb(),hash=hashSecret(state);
    const row=checked(await db.from('integration_oauth_states').select('*').eq('state_hash',hash).is('used_at',null).gt('expires_at',new Date().toISOString()).maybeSingle());
    if(!row) throw new IntegrationError('Meta authorization expired or was already used. Start Connect Meta again.',400);
    const tenant=(await tenantDirectory(db)).find(item=>item.id===row.tenant_id);
    if(!tenant) throw new IntegrationError('Tenant is unavailable.',403);
    const context=await requireSessionAccess({tenantCode:tenant.code,branchCode:row.branch_code},'integrations_meta',true);
    if(context.user.id!==row.user_id) throw new IntegrationError('Meta authorization belongs to another session.',403);
    const consumed=checked(await db.rpc('integration_consume_oauth_state',{p_hash:hash,p_user:context.user.id}));
    if(!consumed?.length) throw new IntegrationError('Meta authorization was already used.',400);
    const connection=await findConnection(db,context,row.connection_code,['meta']);
    const origin=new URL(process.env.INTEGRATIONS_PUBLIC_ORIGIN);
    if(origin.protocol!=='https:') throw new IntegrationError('Public HTTPS origin is required.',503);
    const destination=new URL(integrationTabHref('integrations_meta'),origin);
    destination.searchParams.set('integration_result',params.has('error')?'cancelled':'connected');
    if(!params.has('error')) {
      const code=params.get('code');
      if(!code || code.length>4096) throw new IntegrationError('Meta authorization code is missing.');
      await completeMetaConnect(context,connection,code);
      await audit(db,context,'meta_connected',connection.code);
    }
    return Response.redirect(destination,302);
  } catch(error) {return errorResponse(error);}
}
