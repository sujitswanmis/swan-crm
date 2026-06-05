import { createClient } from '@/utils/supabase/server';
import CRMContainer from '@/components/CRMContainer';

// Next.js config to ensure this page stays dynamic (always fetches latest data)
export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createClient();
  
  // 1. Get logged in user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Middleware should have caught this, but just in case
    return null;
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

  const userRole = roleData?.role || 'agent';
  const canImportExport = userRole === 'admin' || userRole === 'Admin' || roleData?.can_import_export;
  const canRead = userRole === 'admin' || userRole === 'Admin' || roleData?.can_read !== false;
  const canWrite = userRole === 'admin' || userRole === 'Admin' || roleData?.can_write !== false;
  const moduleAccess = roleData?.module_access || {};
  const isApproved = roleData?.is_approved;
  const userCompany = roleData?.company || '';
  const userName = roleData?.emp_name || user.email?.split('@')[0] || 'User';

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

  return (
    <main>
      <CRMContainer 
        initialLeads={allLeads || []} 
        userRole={userRole} 
        canImportExport={canImportExport}
        canRead={canRead}
        canWrite={canWrite}
        moduleAccess={moduleAccess}
        userId={user.id}
        userCompany={userCompany}
        userName={userName}
      />
    </main>
  );
}
