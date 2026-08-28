import { createClient } from '@/utils/supabase/server';
import CRMContainer from '@/components/CRMContainer';
import { redirect } from 'next/navigation';

// Next.js config to ensure this page stays dynamic (always fetches latest data)
export const dynamic = 'force-dynamic';

export default async function Home({ params, searchParams }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const route = resolvedParams?.route;
  const viewAsUserId = resolvedSearchParams?.view_as || resolvedSearchParams?.impersonate;

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

  const { data: roleData, error: roleError } = await adminClient
    .from('user_roles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  const callerRole = roleData?.role || 'agent';
  const isAdmin = callerRole === 'admin' || callerRole === 'Admin';

  if (callerRole === 'customer') {
    redirect('/chat');
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

  const userRole = effectiveRoleData?.role || 'agent';
  const canImportExport = userRole === 'admin' || userRole === 'Admin' || effectiveRoleData?.can_import_export;
  const canRead = userRole === 'admin' || userRole === 'Admin' || effectiveRoleData?.can_read !== false;
  const canWrite = userRole === 'admin' || userRole === 'Admin' || effectiveRoleData?.can_write !== false;
  const moduleAccess = effectiveRoleData?.module_access || {};
  const isApproved = effectiveRoleData?.is_approved;
  const userCompany = effectiveRoleData?.company || '';
  const userName = effectiveRoleData?.emp_name || effectiveRoleData?.email?.split('@')[0] || 'User';
  const effectiveUserId = effectiveRoleData?.user_id || user.id;
  const effectiveUserEmail = effectiveRoleData?.email || effectiveRoleData?.emp_official_mail_id || user.email;

  // 2.5. Check Approval Status
  if (!isApproved && userRole !== 'admin' && userRole !== 'Admin') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <div className="card" style={{ padding: '3rem', width: '100%', maxWidth: '500px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem', color: '#b45309' }}>⏳ Account Pending Approval</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: '1.5' }}>
            Your account has been created successfully, but it requires Admin approval before you can access the CRM. Please contact your administrator.
          </p>
          <form action="/auth/logout" method="POST" style={{ display: 'inline' }}>
            <button className="btn-primary" style={{ padding: '0.75rem 2rem', background: '#3b82f6' }}>Go Back</button>
          </form>
        </div>
      </div>
    );
  }

  // 3. Leads are now fetched on the client side for instant page load
  let allLeads = [];
  const userAvatar = user?.user_metadata?.avatar_url || null;

  return (
    <main>
      <CRMContainer 
        initialLeads={allLeads || []} 
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
      />
    </main>
  );
}
