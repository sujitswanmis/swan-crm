import { Suspense } from 'react';
import { createClient } from '@/utils/supabase/server';
import CRMContainer from '@/components/CRMContainer';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getTenantEntitlements, getTenantSubscription } from '@/app/actions/saasSubscription';

// Next.js config to ensure this page stays dynamic (always fetches latest data)
export const dynamic = 'force-dynamic';

export default async function SaasStudioPage({ params, searchParams }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const subpage = resolvedParams?.subpage;
  const viewAsUserId = resolvedSearchParams?.view_as || resolvedSearchParams?.impersonate;

  let initialTheme = 'default';
  try {
    const cookieStore = await cookies();
    initialTheme = cookieStore.get('crm-theme')?.value || 'default';
  } catch (_e) {}

  const supabase = await createClient();
  
  // 1. Get logged in user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 2. Get user role and permissions using admin client to bypass any RLS misconfigurations
  const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: roleData } = await adminClient
    .from('user_roles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  const userEmailLower = (user.email || '').toLowerCase().trim();
  const isMasterAdminEmail = userEmailLower === 'supujacreations@gmail.com';
  const callerRole = isMasterAdminEmail ? 'Admin' : (roleData?.role || 'agent');
  const isAdmin = isMasterAdminEmail || callerRole === 'admin' || callerRole === 'Admin';

  if (callerRole === 'customer') {
    redirect('/chat');
  }

  // If not master admin email, redirect to dashboard immediately
  if (!isMasterAdminEmail) {
    redirect('/dashboard');
  }

  let effectiveRoleData = roleData;
  let isImpersonating = false;
  let impersonatorAdmin = null;

  // If Admin requested to view as another user (Tab-Isolated Preview)
  if (viewAsUserId && isAdmin) {
    const { data: targetRoleData } = await adminClient
      .from('user_roles')
      .select('*')
      .eq('user_id', viewAsUserId)
      .maybeSingle();

    if (targetRoleData) {
      effectiveRoleData = targetRoleData;
      isImpersonating = true;
      impersonatorAdmin = roleData?.emp_name || user.email;
    }
  }

  const isMasterAdminUser = isMasterAdminEmail && !isImpersonating;
  if (!isMasterAdminUser) {
    redirect('/dashboard');
  }
  const userRole = isMasterAdminUser ? 'Admin' : (effectiveRoleData?.role || 'agent');
  const canImportExport = isMasterAdminUser || userRole === 'admin' || userRole === 'Admin' || effectiveRoleData?.can_import_export;
  const canRead = isMasterAdminUser || userRole === 'admin' || userRole === 'Admin' || effectiveRoleData?.can_read !== false;
  const canWrite = isMasterAdminUser || userRole === 'admin' || userRole === 'Admin' || effectiveRoleData?.can_write !== false;
  
  let userTenantId = effectiveRoleData?.tenant_id;
  if (!userTenantId && effectiveRoleData?.company) {
    const compLower = String(effectiveRoleData.company).toLowerCase().trim();
    if (compLower === 'supuja creations' || compLower === 'supuja_creations') {
      userTenantId = '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
    } else if (compLower === 'testing new swan group' || compLower === 'testing_new_swan_group') {
      userTenantId = '922d3e72-6588-457f-a562-4f1bdbf10d98';
    } else {
      userTenantId = '00000000-0000-0000-0000-000000000001';
    }
  }
  if (!userTenantId) {
    userTenantId = '00000000-0000-0000-0000-000000000001';
  }

  let tenantEntitlements = null;
  let tenantSubscription = null;
  try {
    const [entRes, subRes] = await Promise.all([
      getTenantEntitlements(userTenantId),
      getTenantSubscription(userTenantId)
    ]);
    tenantEntitlements = entRes?.entitlements || null;
    tenantSubscription = subRes?.subscription || null;
  } catch (_e) {
    tenantEntitlements = null;
    tenantSubscription = null;
  }

  const rawModuleAccess = effectiveRoleData?.module_access || {};
  const moduleAccess = {
    ...rawModuleAccess,
    _tenantEntitlements: tenantEntitlements,
    _tenantId: userTenantId
  };

  const userCompany = effectiveRoleData?.company || '';
  const userName = effectiveRoleData?.emp_name || effectiveRoleData?.email?.split('@')[0] || 'User';
  const effectiveUserId = effectiveRoleData?.user_id || user.id;
  const effectiveUserEmail = effectiveRoleData?.email || effectiveRoleData?.emp_official_mail_id || user.email;
  const userAvatar = user?.user_metadata?.avatar_url || null;

  // Format initial route: e.g. "saas-studio" or "saas-studio/pricing" or "saas-studio/tenants"
  const subpageStr = Array.isArray(subpage) ? subpage.join('/') : (subpage || '');
  const initialRoute = subpageStr ? `saas-studio/${subpageStr}` : 'saas-studio/pricing';

  return (
    <main>
      <Suspense fallback={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 500 }}>Loading SaaS Studio...</span>
          </div>
        </div>
      }>
        <CRMContainer 
          initialLeads={[]} 
          userRole={userRole} 
          canImportExport={canImportExport}
          canRead={canRead}
          canWrite={canWrite}
          moduleAccess={moduleAccess}
          userId={effectiveUserId}
          userEmail={effectiveUserEmail}
          userCompany={userCompany}
          userName={userName}
          initialAvatar={userAvatar}
          isImpersonating={isImpersonating}
          impersonatorAdmin={impersonatorAdmin}
          impersonatedUser={isImpersonating ? effectiveRoleData : null}
          initialRoute={initialRoute}
          initialSearchParams={resolvedSearchParams}
          initialTheme={initialTheme}
          tenantId={userTenantId}
          tenantEntitlements={tenantEntitlements}
          tenantSubscription={tenantSubscription}
        />
      </Suspense>
    </main>
  );
}
