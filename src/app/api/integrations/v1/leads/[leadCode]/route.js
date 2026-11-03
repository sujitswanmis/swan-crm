import { requireApiAccess } from '@/lib/integrations/access';
import { listLeads, writeLead } from '@/lib/integrations/leadAdapter';
import { IntegrationError, errorResponse, hashSecret, parseJson, readBody } from '@/lib/integrations/security';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function leadCode(params) {
  const {leadCode:code}=await params;
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(code || '') || /^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(code)) throw new IntegrationError('Lead not found.',404,'not_found');
  return code;
}
export async function GET(request,{params}) {
  try {
    const context=await requireApiAccess(request,'leads:read');
    const result=await listLeads(context,new URLSearchParams(),await leadCode(params));
    return Response.json({success:true,data:result.data[0]},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error);}
}
export async function PATCH(request,{params}) {
  try {
    const context=await requireApiAccess(request,'leads:update'),code=await leadCode(params);
    const key=request.headers.get('idempotency-key') || '';
    if(!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new IntegrationError('Provide a valid Idempotency-Key header.');
    const result=await writeLead(context,parseJson(await readBody(request)),`${context.key.code}:${context.branchCode || 'all'}:${hashSecret(key)}`,code);
    return Response.json({success:true,...result},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error);}
}
