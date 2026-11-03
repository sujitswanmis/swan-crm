import { requireApiAccess } from '@/lib/integrations/access';
import { leadLookups } from '@/lib/integrations/leadAdapter';
import { errorResponse, IntegrationError, readBody, parseJson, consoleOriginAllowed } from '@/lib/integrations/security';
import { integrationAction } from '@/app/actions/integrations';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request) {
  try {
    const context=await requireApiAccess(request,'lookups:read');
    const lookups=await leadLookups(context);
    return Response.json({success:true,tenant:{code:context.tenant.code,name:context.tenant.name},branches:context.tenant.branches.filter(branch=>!context.branchCode || branch.code===context.branchCode).map(branch=>({code:branch.code,name:branch.name})),...lookups},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error);}
}

// Workspace-console commands use session authorization in integrationAction. API keys never authorize this POST.
// A separate HTTP transport keeps slow provider setup out of Next's serialized client Action dispatcher.
export async function POST(request) {
  try {
    if(request.headers.get('x-integration-console')!=='1' || !consoleOriginAllowed(request)) throw new IntegrationError('Console origin verification failed.',403,'origin_denied');
    const result=await integrationAction(parseJson(await readBody(request,65536)));
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error);}
}
