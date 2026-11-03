import { IntegrationError, errorResponse, readBody, hashSecret } from '@/lib/integrations/security';
import { verifyMetaSignedRequest } from '@/lib/integrations/meta';
import { integrationDb, checked } from '@/lib/integrations/store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request) {
  try {
    const body=await readBody(request,16384),value=new URLSearchParams(body).get('signed_request');
    const verified=verifyMetaSignedRequest(value,process.env.META_APP_SECRET);
    if(!verified) throw new IntegrationError('Invalid Meta signed request.',401);
    const db=integrationDb();
    const rows=checked(await db.from('integration_connections').update({status:'reconnect',credentials:null,updated_at:new Date().toISOString()}).eq('type','meta').eq('provider_subject_hash',hashSecret(String(verified.user_id))).select('code,tenant_id,branch_code')) || [];
    if(rows.length) checked(await db.from('integration_audit_logs').insert(rows.map(row=>({tenant_id:row.tenant_id,branch_code:row.branch_code,actor_code:'Meta',operation:'meta_deauthorized',resource_code:row.code}))));
    return Response.json({success:true},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error);}
}
