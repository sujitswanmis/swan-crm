import { INTEGRATION_FEATURES } from '../../config/integrationsConfig.js';
import { checked, integrationSetupPending } from './store.js';
import { IntegrationError } from './security.js';

const featureIds=INTEGRATION_FEATURES.map(feature=>feature.id);
const plain=value=>Boolean(value && typeof value==='object' && !Array.isArray(value));
export function resolvePolicyScope(directory,input) {
  const tenant=input.tenantCode?directory.find(item=>item.code===input.tenantCode):directory[0];
  if(!tenant) throw new IntegrationError('Select a verified tenant.',403,'scope_denied');
  const branchCode=input.branchCode || null;
  if(branchCode && !tenant.branches.some(branch=>branch.code===branchCode)) throw new IntegrationError('Select a branch belonging to this tenant.',403,'scope_denied');
  return {tenant,branchCode};
}
export function normalizeTenantPolicy(input,{branch=false}={}) {
  if(!plain(input) || Object.keys(input).some(key=>!['enabled','features',...(branch?['inherit']:[])].includes(key))) throw new IntegrationError('Invalid integration access policy.');
  if(branch && input.inherit===true) return {inherit:true};
  if(typeof input.enabled!=='boolean' || !plain(input.features) || Object.keys(input.features).some(key=>!featureIds.includes(key)) || Object.values(input.features).some(value=>typeof value!=='boolean')) throw new IntegrationError('Select valid integration access options.');
  return {enabled:input.enabled,features:Object.fromEntries(featureIds.map(id=>[id,input.features[id]===true]))};
}
export function effectiveTenantPolicy(row,branchCode=null) {
  const branches=plain(row?.branches)?row.branches:{};
  const override=branchCode && plain(branches[branchCode])?branches[branchCode]:null;
  const enabled=row?.enabled===true && override?.enabled!==false;
  const features=Object.fromEntries(featureIds.map(id=>{
    const restricted=branchCode ? override?.features?.[id]===false : Object.values(branches).some(value=>value?.enabled===false || value?.features?.[id]===false);
    return [id,enabled && row?.features?.[id]===true && !restricted];
  }));
  return {ready:true,enabled,features,companyEnabled:row?.enabled===true,branchOverride:Boolean(override),revision:Number(row?.revision || 0),updatedAt:row?.updated_at || null};
}
export async function loadTenantPolicy(db,tenantId,branchCode=null,{tolerateSetup=false}={}) {
  const result=await db.from('integration_tenant_policies').select('enabled,features,branches,revision,updated_at').eq('tenant_id',tenantId).maybeSingle();
  if(result.error && integrationSetupPending(result.error) && tolerateSetup) return {...effectiveTenantPolicy(null,branchCode),ready:false};
  return {...effectiveTenantPolicy(checked(result),branchCode),configuration:result.data || null};
}
export function assertTenantFeature(policy,feature=null) {
  if(!policy?.ready) throw new IntegrationError('Tenant integration access setup is pending.',503,'setup_required');
  if(!policy.enabled || (feature && policy.features?.[feature]!==true)) throw new IntegrationError('This integration is not enabled by Master Admin for the selected company and branch.',403,'tenant_integration_disabled');
}
export async function requireTenantFeature(context,feature=null) {
  // No cross-request cache: a Master Admin change applies to the next operation.
  const policy=await loadTenantPolicy(context.db,context.tenant.id,context.branchCode);
  assertTenantFeature(policy,feature);
  return policy;
}
export function tenantCanManageIntegrations(role,permissions,master=false) {
  if(master) return true;
  const admin=['admin','superadmin','super_admin'].includes(String(role?.role || '').toLowerCase());
  return Boolean(role?.can_write!==false && permissions.view===true && (permissions.add || permissions.edit) && (admin || role?.module_access?.can_manage_integrations===true));
}
