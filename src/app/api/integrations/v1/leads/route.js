import { requireApiAccess } from '@/lib/integrations/access';
import { listLeads, writeLead } from '@/lib/integrations/leadAdapter';
import { IntegrationError, errorResponse, hashSecret, parseJson, readBody } from '@/lib/integrations/security';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request) {
  try {
    const context=await requireApiAccess(request,'leads:read');
    return Response.json({success:true,...await listLeads(context,new URL(request.url).searchParams)},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error);}
}
export async function POST(request) {
  try {
    const context=await requireApiAccess(request,'leads:create');
    const key=request.headers.get('idempotency-key') || '';
    if(!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new IntegrationError('Provide an Idempotency-Key header with 8–128 letters, numbers or . _ : - characters.');
    const result=await writeLead(context,parseJson(await readBody(request)),`${context.key.code}:${context.branchCode || 'all'}:${hashSecret(key)}`);
    return Response.json({success:true,...result},{status:result.status==='created'?201:200,headers:{'Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error);}
}
