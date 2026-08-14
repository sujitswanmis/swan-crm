'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  registerEmployeeDetails, 
  requestPasswordResetOtp, 
  verifyPasswordResetOtpAndSetPassword 
} from '@/app/actions/team';
import { Eye, EyeOff, KeyRound, ArrowLeft, CheckCircle2, ShieldCheck, Mail, RefreshCw } from 'lucide-react';
import { PremiumProgressLoader } from '@/components/PremiumProgressLoader';

const DEPARTMENTS = [
  "Accounts & Finance", "Administration", "Audit", "Dispatch", "Director",
  "Corporate Strategy and Planning", "Electrical & Maintenance", "Human Resource",
  "Human Resource & Administration", "Information Technology", "Logistics",
  "Manufacturing Engineering", "Marketing", "Operations", "Production",
  "Purchase", "Quality Assurance", "Research & Development", "Sales",
  "Sales & Marketing", "Service", "Store", "Tool Room", "Training and Development",
  "Transport", "Security", "Production Planning and Control", "Vendor Development"
];

function LoginFormContent() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot'
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // New employee fields
  const [empId, setEmpId] = useState('');
  const [empName, setEmpName] = useState('');
  const [empDepartment, setEmpDepartment] = useState('');
  const [empDesignation, setEmpDesignation] = useState('');
  const [empMobile, setEmpMobile] = useState('');

  const [showPassword, setShowPassword] = useState(false);

  // Forgot Password state
  const [forgotStep, setForgotStep] = useState(1); // 1: enter email, 2: enter otp & new password
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccessMsg, setForgotSuccessMsg] = useState(null);

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Handle URL reset params from email link
  useEffect(() => {
    if (!searchParams) return;
    const urlMode = searchParams.get('mode');
    const urlEmail = searchParams.get('email');
    const urlCode = searchParams.get('code');

    if (urlMode === 'reset' && urlEmail) {
      setMode('forgot');
      setForgotEmail(urlEmail);
      if (urlCode) {
        setForgotOtp(urlCode);
        setForgotStep(2);
        setForgotSuccessMsg('Account activation verified! Please create your new account password below.');
      }
    }
  }, [searchParams]);

  const handleAuth = async () => {
    setLoading(true);
    setError(null);
    let result;

    if (mode === 'register') {
      if (!empId || !empName || !empDepartment || !empDesignation || !empMobile || !email || !password) {
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
        const details = {
          emp_id: empId,
          emp_name: empName,
          emp_department: empDepartment,
          emp_designation: empDesignation,
          emp_mobile: empMobile,
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
      if (mode === 'register' && !result.data?.session) {
        setError('Signup successful! Please check your email inbox to verify your account before logging in.');
        setLoading(false);
      } else {
        // Log Session
        try {
          const { logUserSession } = await import('@/app/actions/audit');
          const device = navigator.userAgent;
          await logUserSession(device);
        } catch (e) { console.error('Failed to log session', e); }
        
        let targetPath = '/dashboard';
        try {
          const userId = result.data?.user?.id;
          if (userId) {
            const { data: roleData } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', userId)
              .single();
            if (roleData?.role === 'customer') {
              targetPath = '/chat';
            }
          }
        } catch (err) {
          console.error("Failed to check user role:", err);
        }

        const currentSearchParams = new URLSearchParams(window.location.search);
        const nextPath = currentSearchParams.get('next') || targetPath;
        window.location.href = nextPath;
      }
    }
  };

  // Forgot Password: Step 1 Send OTP
  const handleRequestOtp = async () => {
    if (!forgotEmail || !forgotEmail.includes('@')) {
      setError("Please enter your registered official email address.");
      return;
    }
    setForgotLoading(true);
    setError(null);
    const res = await requestPasswordResetOtp(forgotEmail);
    setForgotLoading(false);
    if (res.success) {
      setForgotStep(2);
      setForgotSuccessMsg(res.message);
    } else {
      setError(res.error);
    }
  };

  // Forgot Password: Step 2 Verify OTP & Set Password
  const handleResetPassword = async () => {
    if (!forgotOtp || forgotOtp.length < 4) {
      setError("Please enter the 6-digit verification code sent to your email.");
      return;
    }
    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setForgotLoading(true);
    setError(null);
    const res = await verifyPasswordResetOtpAndSetPassword(forgotEmail, forgotOtp, forgotNewPassword);
    setForgotLoading(false);
    if (res.success) {
      alert("✅ " + res.message);
      setEmail(forgotEmail);
      setPassword('');
      setMode('login');
      setForgotStep(1);
      setForgotOtp('');
      setForgotNewPassword('');
      setForgotConfirmPassword('');
      setForgotSuccessMsg(null);
    } else {
      setError(res.error);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', padding: '2rem' }}>
      <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '450px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
        
        {/* Logo / Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.85rem' }}>
            <img 
              src="/supuja-logo.png" 
              alt="SuPuja Creations" 
              style={{ width: '76px', height: '76px', borderRadius: '16px', objectFit: 'contain', background: '#fff', padding: '4px', boxShadow: '0 10px 20px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0' }} 
            />
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: '#0f172a', lineHeight: 1.25 }}>
            {mode === 'login' && (
              <>
                <div>SuPuja Creations</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#4338ca', marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}>
                  <span>Workplace Login</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#4338ca', background: '#eef2ff', padding: '0.12rem 0.5rem', borderRadius: '12px', border: '1px solid #c7d2fe' }}>v1.0.220</span>
                </div>
              </>
            )}
            {mode === 'register' && 'Create Employee Account'}
            {mode === 'forgot' && (forgotStep === 2 && forgotOtp ? 'Set Your Account Password' : 'Reset Your Password')}
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem', marginBottom: 0, fontSize: '0.88rem' }}>
            {mode === 'login' && 'Secure access to your sales & workplace pipeline'}
            {mode === 'register' && 'Enter your official details to register'}
            {mode === 'forgot' && (forgotStep === 1 ? 'Enter your official email to receive a secure OTP' : 'Enter OTP and create your new password')}
          </p>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem', border: '1px solid #fecaca' }}>
            {error}
          </div>
        )}

        {forgotSuccessMsg && mode === 'forgot' && (
          <div style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={16} />
            <span>{forgotSuccessMsg}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* LOGIN & REGISTRATION FORMS */}
        {/* ========================================================================= */}
        {mode !== 'forgot' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              {mode === 'register' && (
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
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Mobile Number *</label>
                    <input
                      type="tel"
                      value={empMobile}
                      onChange={(e) => setEmpMobile(e.target.value)}
                      placeholder="10-digit mobile number"
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
                  {mode === 'login' ? 'Email Address' : 'Emp Official Mail ID *'}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Password *</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setForgotEmail(email);
                        setError(null);
                        setForgotStep(1);
                      }}
                      style={{ background: 'none', border: 'none', color: '#4338ca', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{ width: '100%', padding: '0.6rem 2.5rem 0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleAuth}
              disabled={loading || !email || !password || (mode === 'register' && (!empId || !empName || !empDepartment || !empDesignation || !empMobile))}
              className="btn-primary"
              style={{ width: '100%', marginBottom: '0.75rem', padding: '0.75rem', fontSize: '0.95rem', fontWeight: 600, borderRadius: '8px' }}
            >
              {loading ? 'Processing...' : (mode === 'login' ? 'Sign In' : 'Register Account')}
            </button>
            
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
              style={{ width: '100%', padding: '0.7rem', fontSize: '0.88rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}
            >
              {mode === 'login' ? 'Create New Account' : 'Back to Login'}
            </button>
          </>
        )}

        {/* ========================================================================= */}
        {/* FORGOT PASSWORD VIA OTP FLOW */}
        {/* ========================================================================= */}
        {mode === 'forgot' && (
          <div>
            {forgotStep === 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Registered Official Email Address *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="e.g. employee@company.com"
                      style={{ width: '100%', padding: '0.65rem 1rem 0.65rem 2.4rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                    />
                    <Mail size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.4rem', marginBottom: 0 }}>
                    We will send a 6-digit verification code to this email via SuPuja Creations Admin Mail.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={forgotLoading || !forgotEmail}
                  className="btn-primary"
                  style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', fontWeight: 600, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', backgroundColor: '#4338ca' }}
                >
                  {forgotLoading ? <RefreshCw size={16} className="animate-spin" /> : <Mail size={16} />}
                  {forgotLoading ? 'Sending Security Code...' : 'Send Verification OTP'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Enter 6-Digit OTP *</label>
                    <button
                      type="button"
                      onClick={handleRequestOtp}
                      disabled={forgotLoading}
                      style={{ background: 'none', border: 'none', color: '#4338ca', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Resend Code
                    </button>
                  </div>
                  <input
                    type="text"
                    maxLength={6}
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value)}
                    placeholder="Enter 6-digit OTP"
                    style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: '2px solid #4338ca', fontSize: '1.2rem', textAlign: 'center', letterSpacing: '6px', fontWeight: 800 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    New Password *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showForgotNewPassword ? "text" : "password"}
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      style={{ width: '100%', padding: '0.6rem 2.5rem 0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotNewPassword(!showForgotNewPassword)}
                      style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                      {showForgotNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Confirm New Password *
                  </label>
                  <input
                    type={showForgotNewPassword ? "text" : "password"}
                    value={forgotConfirmPassword}
                    onChange={(e) => setForgotConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={forgotLoading || !forgotOtp || !forgotNewPassword || !forgotConfirmPassword}
                  className="btn-primary"
                  style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', fontSize: '0.95rem', fontWeight: 600, borderRadius: '8px', backgroundColor: '#16a34a' }}
                >
                  {forgotLoading ? 'Updating Password...' : 'Save Password & Sign In'}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setForgotSuccessMsg(null);
              }}
              style={{
                width: '100%',
                marginTop: '1rem',
                padding: '0.65rem',
                fontSize: '0.85rem',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                fontWeight: 600
              }}
            >
              <ArrowLeft size={16} /> Back to Login
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <PremiumProgressLoader message="Loading SuPuja Creations Workplace..." active={true} />
      </div>
    }>
      <LoginFormContent />
    </Suspense>
  );
}
