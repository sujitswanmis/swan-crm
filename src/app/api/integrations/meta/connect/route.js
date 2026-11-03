import { requireSessionAccess } from '@/lib/integrations/access';
import { findConnection } from '@/lib/integrations/store';
import { assertEnabled, errorResponse } from '@/lib/integrations/security';
import { beginMetaConnect } from '@/lib/integrations/meta';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request) {
  try {
    assertEnabled();
    const params=new URL(request.url).searchParams;
    const context=await requireSessionAccess({tenantCode:params.get('tenant'),branchCode:params.get('branch') || null},'integrations_meta',true);
    const connection=await findConnection(context.db,context,params.get('connection'),['meta']);
    return Response.redirect(await beginMetaConnect(context,connection),302);
  } catch(error) {return errorResponse(error);}
}
