'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  registerEmployeeDetails, 
  requestPasswordResetOtp, 
  verifyPasswordResetOtpAndSetPassword,
  requestLoginOtp,
  verifyLoginOtp
} from '@/app/actions/team';
import { Eye, EyeOff, KeyRound, ArrowLeft, CheckCircle2, ShieldCheck, Mail, RefreshCw, Lock, Sparkles, UserCheck } from 'lucide-react';
import { PremiumProgressLoader } from '@/components/PremiumProgressLoader';
import pkg from '../../../package.json';

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
  const [loginMethod, setLoginMethod] = useState('password'); // 'password' | 'otp'
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // New employee fields
  const [empId, setEmpId] = useState('');
  const [empName, setEmpName] = useState('');
  const [empDepartment, setEmpDepartment] = useState('');
  const [empDesignation, setEmpDesignation] = useState('');
  const [empMobile, setEmpMobile] = useState('');

  const [showPassword, setShowPassword] = useState(false);

  // Email OTP Login state
  const [loginOtpStep, setLoginOtpStep] = useState(1); // 1: enter email, 2: enter otp
  const [loginOtp, setLoginOtp] = useState('');
  const [loginOtpLoading, setLoginOtpLoading] = useState(false);
  const [loginOtpSuccessMsg, setLoginOtpSuccessMsg] = useState(null);

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

  // Handle URL reset params and logout reason messages
  useEffect(() => {
    if (!searchParams) return;
    const urlMode = searchParams.get('mode');
    const urlEmail = searchParams.get('email');
    const urlCode = searchParams.get('code');
    const urlReason = searchParams.get('reason');

    if (urlReason === 'inactivity_timeout') {
      setError('⚠️ You were automatically logged out due to inactivity timeout. Please sign in again.');
    } else if (urlReason === 'force_logout') {
      setError('🔒 Your session was terminated by the administrator. Please sign in again.');
    }

    if (urlMode === 'reset' && urlEmail) {
      setMode('forgot');
      setForgotEmail(urlEmail);
      if (urlCode) {
        setForgotOtp(urlCode);
        setForgotStep(2);
        setForgotSuccessMsg('Account activation verified! Please create your new account password below.');
      }
    } else if (urlMode === 'otp' && urlEmail) {
      setMode('login');
      setLoginMethod('otp');
      setEmail(urlEmail);
    }
  }, [searchParams]);

  // Handle Password Login & Registration
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
        await completeLoginFlow(result.data?.user?.id);
      }
    }
  };

  // Complete redirect & session tracking after successful authentication (Instant / Non-blocking)
  const completeLoginFlow = (userId) => {
    // 1. Fire-and-forget background session & audit logging without blocking the redirect
    try {
      import('@/app/actions/audit').then(({ logUserSession, logAuditAction }) => {
        const device = typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Browser';
        logUserSession(device).catch(err => console.warn('Non-blocking session log:', err));
        logAuditAction('User Login', 'User successfully logged in to Web App').catch(err => console.warn('Non-blocking audit log:', err));
      }).catch(err => console.warn('Failed to load audit module:', err));
    } catch (e) { 
      console.warn('Failed to initiate session logging', e); 
    }
    
    // 2. Instant Redirect without blocking for round-trip queries
    const currentSearchParams = new URLSearchParams(window.location.search);
    const nextPath = currentSearchParams.get('next') || '/dashboard';
    window.location.href = nextPath;
  };

  // ==========================================
  // EMAIL OTP LOGIN FLOW
  // ==========================================
  const handleRequestLoginOtp = async () => {
    if (!email || !email.includes('@')) {
      setError("Please enter your registered official email address.");
      return;
    }
    setLoginOtpLoading(true);
    setError(null);
    const res = await requestLoginOtp(email);
    setLoginOtpLoading(false);
    if (res.success) {
      setLoginOtpStep(2);
      setLoginOtpSuccessMsg(res.message);
    } else {
      setError(res.error);
    }
  };

  const handleVerifyLoginOtp = async () => {
    if (!loginOtp || loginOtp.length < 4) {
      setError("Please enter the 6-digit login verification code sent to your email.");
      return;
    }

    setLoginOtpLoading(true);
    setError(null);
    const res = await verifyLoginOtp(email, loginOtp);
    
    if (!res.success) {
      setLoginOtpLoading(false);
      setError(res.error);
      return;
    }

    // Use magiclink token_hash to establish active client session
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: res.tokenHash,
        type: 'magiclink'
      });

      if (verifyError || !data?.user) {
        setLoginOtpLoading(false);
        setError(verifyError?.message || 'Authentication failed. Please try again.');
        return;
      }

      // Success! Proceed to redirect
      await completeLoginFlow(data.user.id);
    } catch (authErr) {
      setLoginOtpLoading(false);
      setError(authErr.message || 'Login failed. Please try again.');
    }
  };

  // ==========================================
  // FORGOT PASSWORD FLOW
  // ==========================================
  const handleRequestForgotOtp = async () => {
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
      setLoginMethod('password');
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
      <div className="card" style={{ padding: '2.25rem 2rem', width: '100%', maxWidth: '460px', borderRadius: '18px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', border: '1px solid var(--border-light)' }}>
        
        {/* Logo / Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.85rem' }}>
            <img 
              src="/supuja-logo.png" 
              alt="SuPuja Creations" 
              style={{ width: '140px', height: 'auto', maxHeight: '76px', objectFit: 'contain' }} 
            />
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: '#0f172a', lineHeight: 1.25 }}>
            {mode === 'login' && (
              <>
                <div>SuPuja Creations</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#4338ca', marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}>
                  <span>Workplace Login</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#4338ca', background: '#eef2ff', padding: '0.12rem 0.5rem', borderRadius: '12px', border: '1px solid #c7d2fe' }}>v{pkg.version || '1.0.228'}</span>
                </div>
              </>
            )}
            {mode === 'register' && 'Create Employee Account'}
            {mode === 'forgot' && (forgotStep === 2 && forgotOtp ? 'Set Your Account Password' : 'Reset Your Password')}
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem', marginBottom: 0, fontSize: '0.88rem' }}>
            {mode === 'login' && (loginMethod === 'password' ? 'Sign in with your email & password' : 'Sign in securely using 6-Digit Email OTP')}
            {mode === 'register' && 'Enter your official details to register'}
            {mode === 'forgot' && (forgotStep === 1 ? 'Enter your official email to receive a secure reset code' : 'Enter OTP and create your new password')}
          </p>
        </div>

        {/* ========================================================================= */}
        {/* LOGIN METHOD SELECTOR TABS (Password vs Email OTP) */}
        {/* ========================================================================= */}
        {mode === 'login' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.35rem',
            background: '#f1f5f9',
            padding: '0.3rem',
            borderRadius: '10px',
            marginBottom: '1.5rem',
            border: '1px solid #e2e8f0'
          }}>
            <button
              type="button"
              onClick={() => {
                setLoginMethod('password');
                setError(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                padding: '0.55rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                transition: 'all 0.2s',
                backgroundColor: loginMethod === 'password' ? '#ffffff' : 'transparent',
                color: loginMethod === 'password' ? '#4338ca' : '#64748b',
                boxShadow: loginMethod === 'password' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <Lock size={15} /> Password
            </button>

            <button
              type="button"
              onClick={() => {
                setLoginMethod('otp');
                setError(null);
                setLoginOtpStep(1);
                setLoginOtpSuccessMsg(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                padding: '0.55rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                transition: 'all 0.2s',
                backgroundColor: loginMethod === 'otp' ? '#ffffff' : 'transparent',
                color: loginMethod === 'otp' ? '#4338ca' : '#64748b',
                boxShadow: loginMethod === 'otp' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <Mail size={15} /> Email OTP
            </button>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem', border: '1px solid #fecaca' }}>
            {error}
          </div>
        )}

        {/* Forgot Success Message */}
        {forgotSuccessMsg && mode === 'forgot' && (
          <div style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={16} />
            <span>{forgotSuccessMsg}</span>
          </div>
        )}

        {/* Login OTP Success Message */}
        {loginOtpSuccessMsg && mode === 'login' && loginMethod === 'otp' && (
          <div style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={16} />
            <span>{loginOtpSuccessMsg}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* OPTION 1: PASSWORD LOGIN / REGISTER */}
        {/* ========================================================================= */}
        {mode === 'login' && loginMethod === 'password' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Official Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    style={{ width: '100%', padding: '0.65rem 1rem 0.65rem 2.4rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                  />
                  <Mail size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Password *</label>
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
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{ width: '100%', padding: '0.65rem 2.5rem 0.65rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword(prev => !prev)}
                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', userSelect: 'none' }}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleAuth}
              disabled={loading || !email || !password}
              className="btn-primary"
              style={{ width: '100%', marginBottom: '0.75rem', padding: '0.75rem', fontSize: '0.95rem', fontWeight: 600, borderRadius: '8px', backgroundColor: '#4338ca' }}
            >
              {loading ? 'Signing in...' : 'Sign In with Password'}
            </button>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('otp');
                  setError(null);
                  setLoginOtpStep(1);
                }}
                style={{ width: '100%', padding: '0.65rem', fontSize: '0.85rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                <Mail size={14} color="#4338ca" /> Sign in with Email OTP instead
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                style={{ width: '100%', padding: '0.65rem', fontSize: '0.85rem', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500, color: 'var(--text-secondary)' }}
              >
                Don't have an account? <span style={{ color: '#4338ca', fontWeight: 600 }}>Register</span>
              </button>
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* OPTION 2: EMAIL OTP LOGIN */}
        {/* ========================================================================= */}
        {mode === 'login' && loginMethod === 'otp' && (
          <div>
            {loginOtpStep === 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Registered Official Email Address *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. employee@company.com"
                      style={{ width: '100%', padding: '0.65rem 1rem 0.65rem 2.4rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                    />
                    <Mail size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.4rem', marginBottom: 0 }}>
                    We'll send a 6-digit login verification code directly to this official mailbox.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRequestLoginOtp}
                  disabled={loginOtpLoading || !email}
                  className="btn-primary"
                  style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', fontWeight: 600, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', backgroundColor: '#4338ca' }}
                >
                  {loginOtpLoading ? <RefreshCw size={16} className="animate-spin" /> : <Mail size={16} />}
                  {loginOtpLoading ? 'Sending Login Code...' : 'Send 6-Digit Login OTP'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Enter 6-Digit Login OTP *</label>
                    <button
                      type="button"
                      onClick={handleRequestLoginOtp}
                      disabled={loginOtpLoading}
                      style={{ background: 'none', border: 'none', color: '#4338ca', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Resend Code
                    </button>
                  </div>
                  <input
                    type="text"
                    maxLength={6}
                    value={loginOtp}
                    onChange={(e) => setLoginOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    autoFocus
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', border: '2px solid #4338ca', fontSize: '1.3rem', textAlign: 'center', letterSpacing: '8px', fontWeight: 800 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Sent to: <b>{email}</b></span>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginOtpStep(1);
                        setLoginOtp('');
                        setError(null);
                      }}
                      style={{ background: 'none', border: 'none', color: '#4338ca', fontSize: '0.76rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                    >
                      Change Email
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleVerifyLoginOtp}
                  disabled={loginOtpLoading || loginOtp.length < 4}
                  className="btn-primary"
                  style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', fontWeight: 600, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', backgroundColor: '#16a34a' }}
                >
                  {loginOtpLoading ? <RefreshCw size={16} className="animate-spin" /> : <UserCheck size={16} />}
                  {loginOtpLoading ? 'Verifying Code...' : 'Verify & Sign In'}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('password');
                  setError(null);
                }}
                style={{ width: '100%', padding: '0.65rem', fontSize: '0.85rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                <Lock size={14} color="#4338ca" /> Sign in with Password instead
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* REGISTRATION FORM */}
        {/* ========================================================================= */}
        {mode === 'register' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
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
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp Official Mail ID *</label>
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
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword(prev => !prev)}
                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', userSelect: 'none' }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleAuth}
              disabled={loading || !empId || !empName || !empDepartment || !empDesignation || !empMobile || !email || !password}
              className="btn-primary"
              style={{ width: '100%', marginBottom: '0.75rem', padding: '0.75rem', fontSize: '0.95rem', fontWeight: 600, borderRadius: '8px' }}
            >
              {loading ? 'Processing...' : 'Register Account'}
            </button>
            
            <button
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              style={{ width: '100%', padding: '0.7rem', fontSize: '0.88rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}
            >
              Back to Login
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
                  onClick={handleRequestForgotOtp}
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
                      onClick={handleRequestForgotOtp}
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
                    onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ''))}
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
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowForgotNewPassword(prev => !prev)}
                      style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', userSelect: 'none' }}
                      title={showForgotNewPassword ? "Hide password" : "Show password"}
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
