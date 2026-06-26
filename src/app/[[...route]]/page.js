import { createClient } from '@/utils/supabase/server';
import CRMContainer from '@/components/CRMContainer';

// Next.js config to ensure this page stays dynamic (always fetches latest data)
export const dynamic = 'force-dynamic';

export default async function Home({ params }) {
  const resolvedParams = await params;
  const route = resolvedParams?.route;
  const isRoot = !route || route.length === 0;

  const supabase = await createClient();
  
  // 1. Get logged in user
  const { data: { user } } = await supabase.auth.getUser();

  if (isRoot) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'radial-gradient(circle at 50% 50%, #0f172a 0%, #020617 100%)',
        color: '#f8fafc',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        padding: '2rem',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <style dangerouslySetInnerHTML={{ __html: `
          .portal-card {
            text-decoration: none;
            color: inherit;
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 2.5rem 2rem;
            backdrop-filter: blur(12px);
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
          }
          .portal-card:hover {
            transform: translateY(-5px);
          }
          .portal-card-assistant:hover {
            border-color: rgba(56, 189, 248, 0.5);
            box-shadow: 0 15px 35px rgba(56, 189, 248, 0.15);
          }
          .portal-card-crm:hover {
            border-color: rgba(129, 140, 248, 0.5);
            box-shadow: 0 15px 35px rgba(129, 140, 248, 0.15);
          }
          @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }
          .float-logo {
            animation: float 4s ease-in-out infinite;
          }
        `}} />

        {/* Decorative Blur Orbs */}
        <div style={{
          position: 'absolute',
          top: '10%',
          left: '20%',
          width: '300px',
          height: '300px',
          background: 'rgba(56, 189, 248, 0.12)',
          filter: 'blur(100px)',
          borderRadius: '50%',
          zIndex: 0,
          pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute',
          bottom: '10%',
          right: '20%',
          width: '350px',
          height: '350px',
          background: 'rgba(99, 102, 241, 0.12)',
          filter: 'blur(120px)',
          borderRadius: '50%',
          zIndex: 0,
          pointerEvents: 'none'
        }} />

        <div style={{
          zIndex: 1,
          textAlign: 'center',
          marginBottom: '3rem',
          maxWidth: '600px'
        }}>
          <div className="float-logo" style={{
            fontSize: '3.5rem',
            marginBottom: '1rem'
          }}>
             Swan Agro Logo Placeholder 🦢
          </div>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            background: 'linear-gradient(to right, #38bdf8, #818cf8)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.75rem',
            letterSpacing: '-0.03em'
          }}>
            Swan Agro Portal
          </h1>
          <p style={{
            color: '#94a3b8',
            fontSize: '1.1rem',
            fontWeight: 400
          }}>
            Select a workspace to get started with Swan Agro services
          </p>
        </div>

        <div style={{
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '2rem',
          width: '100%',
          maxWidth: '750px',
          padding: '0 1rem',
          boxSizing: 'border-box'
        }}>
          {/* Tile 1: Swan Agro Assistant */}
          <a href="/chat" className="portal-card portal-card-assistant">
            <div style={{
              fontSize: '3rem',
              marginBottom: '1.5rem',
              background: 'rgba(56, 189, 248, 0.1)',
              width: '80px',
              height: '80px',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(56, 189, 248, 0.2)'
            }}>
              🤖
            </div>
            <h2 style={{
              fontSize: '1.4rem',
              fontWeight: 600,
              marginBottom: '0.75rem',
              color: '#f1f5f9'
            }}>
              Swan Agro Assistant
            </h2>
            <p style={{
              fontSize: '0.9rem',
              color: '#94a3b8',
              lineHeight: '1.6',
              flexGrow: 1,
              marginBottom: '1.5rem'
            }}>
              Access public enquiries, product catalogues, and smart AI chat support workspace.
            </p>
            <span style={{
              fontSize: '0.9rem',
              fontWeight: 600,
              color: '#38bdf8',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              Open Assistant &rarr;
            </span>
          </a>

          {/* Tile 2: CRM Enterprises / Team Workplace */}
          <a href="/dashboard" className="portal-card portal-card-crm">
            <div style={{
              fontSize: '3rem',
              marginBottom: '1.5rem',
              background: 'rgba(129, 140, 248, 0.1)',
              width: '80px',
              height: '80px',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(129, 140, 248, 0.2)'
            }}>
              💼
            </div>
            <h2 style={{
              fontSize: '1.4rem',
              fontWeight: 600,
              marginBottom: '0.75rem',
              color: '#f1f5f9'
            }}>
              Team Workplace
            </h2>
            <p style={{
              fontSize: '0.9rem',
              color: '#94a3b8',
              lineHeight: '1.6',
              flexGrow: 1,
              marginBottom: '1.5rem'
            }}>
              Manage leads, track team activities, configure services, and manage business workflows.
            </p>
            <span style={{
              fontSize: '0.9rem',
              fontWeight: 600,
              color: '#818cf8',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              {user ? 'Go to Workplace' : 'Login to CRM'} &rarr;
            </span>
          </a>
        </div>

        <div style={{
          marginTop: '4rem',
          fontSize: '0.8rem',
          color: '#475569'
        }}>
          &copy; {new Date().getFullYear()} Swan Agro. All rights reserved.
        </div>
      </div>
    );
  }

  if (!user) {
    const { redirect } = require('next/navigation');
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

  const userRole = roleData?.role || 'agent';

  if (userRole === 'customer') {
    const { redirect } = require('next/navigation');
    redirect('/chat');
  }

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
