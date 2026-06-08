'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { registerEmployeeDetails } from '@/app/actions/team';

const DEPARTMENTS = [
  "Accounts & Finance", "Administration", "Audit", "Dispatch", "Director",
  "Corporate Strategy and Planning", "Electrical & Maintenance", "Human Resource",
  "Human Resource & Administration", "Information Technology", "Logistics",
  "Manufacturing Engineering", "Marketing", "Operations", "Production",
  "Purchase", "Quality Assurance", "Research & Development", "Sales",
  "Sales & Marketing", "Service", "Store", "Tool Room", "Training and Development",
  "Transport", "Security", "Production Planning and Control", "Vendor Development"
];

export default function LoginPage() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // New employee fields
  const [empId, setEmpId] = useState('');
  const [empName, setEmpName] = useState('');
  const [empDepartment, setEmpDepartment] = useState('');
  const [empDesignation, setEmpDesignation] = useState('');

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleAuth = async () => {
    setLoading(true);
    setError(null);
    let result;

    if (!isLoginMode) {
      if (!empId || !empName || !empDepartment || !empDesignation || !email || !password) {
        setError("All fields are mandatory for registration.");
        setLoading(false);
        return;
      }

      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      
      if (result.data?.user?.identities?.length === 0) {
        result.error = { message: 'User already exists, please sign in instead.' };
      }

      if (!result.error && result.data?.user) {
        // Automatically save the employee details in the backend table via server action
        const details = {
          emp_id: empId,
          emp_name: empName,
          emp_department: empDepartment,
          emp_designation: empDesignation,
          emp_official_mail_id: email
        };
        const regResult = await registerEmployeeDetails(result.data.user.id, email, details);
        if (!regResult.success) {
          console.error("Failed to save employee details to database:", regResult.error);
        }
      }

    } else {
      result = await supabase.auth.signInWithPassword({
        email,
        password,
      });
    }

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
    } else {
      if (!isLoginMode && !result.data?.session) {
        setError('Signup successful! Please check your email inbox to verify your account before logging in.');
        setLoading(false);
      } else {
        // Log Session
        try {
          const { logUserSession } = await import('@/app/actions/audit');
          const device = navigator.userAgent;
          await logUserSession(device);
        } catch (e) { console.error('Failed to log session', e); }
        
        router.push('/');
        router.refresh();
      }
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', padding: '2rem' }}>
      <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '450px' }}>
        <h1 style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          {isLoginMode ? 'Swan CRM Login' : 'Create Employee Account'}
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}>
          {isLoginMode ? 'Secure access to your sales pipeline' : 'Enter your official details to register'}
        </p>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
          {!isLoginMode && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp ID *</label>
                <input
                  type="text"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  placeholder="E.g. EMP001"
                  style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp Name *</label>
                <input
                  type="text"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  placeholder="Full Name"
                  style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp Department *</label>
                <select
                  value={empDepartment}
                  onChange={(e) => setEmpDepartment(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                >
                  <option value="">Select Department...</option>
                  {DEPARTMENTS.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp Designation *</label>
                <input
                  type="text"
                  value={empDesignation}
                  onChange={(e) => setEmpDesignation(e.target.value)}
                  placeholder="E.g. Sales Executive"
                  style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                />
              </div>
            </>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              {isLoginMode ? 'Email Address' : 'Emp Official Mail ID *'}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Password *</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
            />
          </div>
        </div>

        <button
          onClick={handleAuth}
          disabled={loading || !email || !password || (!isLoginMode && (!empId || !empName || !empDepartment || !empDesignation))}
          className="btn-primary"
          style={{ width: '100%', marginBottom: '0.5rem', padding: '0.75rem', fontSize: '1rem' }}
        >
          {loading ? 'Processing...' : (isLoginMode ? 'Sign In' : 'Register Account')}
        </button>
        
        <button
          onClick={() => {
            setIsLoginMode(!isLoginMode);
            setError(null);
          }}
          style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
        >
          {isLoginMode ? 'Create New Account' : 'Back to Login'}
        </button>
        
        {isLoginMode && (
          <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            The first account created will automatically become the Admin.
          </p>
        )}
      </div>
    </div>
  );
}
