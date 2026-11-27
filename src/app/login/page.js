'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  registerEmployeeDetails, 
  requestPasswordResetOtp, 
  verifyPasswordResetOtpAndSetPassword
} from '@/app/actions/team';
import { requestEmailLoginOtp } from '@/app/actions/loginOtp';
import styles from './login.module.css';
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
  const [rememberMe, setRememberMe] = useState(true);

  // Auto-fill saved credentials if previously saved
  useEffect(() => {
    try {
      const savedCreds = localStorage.getItem('spc_saved_credentials');
      if (savedCreds) {
        const parsed = JSON.parse(savedCreds);
        if (parsed.email) setEmail(parsed.email);
        if (parsed.password) setPassword(parsed.password);
        setRememberMe(true);
      } else {
        const savedEmail = localStorage.getItem('spc_saved_email');
        if (savedEmail) setEmail(savedEmail);
      }
    } catch (_err) {}
  }, []);

  // Email OTP Login state
  const [loginOtpStep, setLoginOtpStep] = useState(1); // 1: enter email, 2: enter otp
  const [loginOtp, setLoginOtp] = useState('');
  const [loginOtpLoading, setLoginOtpLoading] = useState(false);
  const [loginOtpSuccessMsg, setLoginOtpSuccessMsg] = useState(null);
  const [loginOtpChallenge, setLoginOtpChallenge] = useState(null);
  const [loginOtpCooldown, setLoginOtpCooldown] = useState(0);
  const loginOtpBusy = useRef(false);
  const loginOtpResendAt = useRef(0);
  const loginOtpLength = loginOtpChallenge?.otpLength || 6;

  useEffect(() => {
    if (loginOtpCooldown <= 0) return;
    const timer = setTimeout(() => {
      setLoginOtpCooldown(Math.max(0, Math.ceil((loginOtpResendAt.current - Date.now()) / 1000)));
    }, 1000);
    return () => clearTimeout(timer);
  }, [loginOtpCooldown]);

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

    const timer = setTimeout(() => {
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
    }, 0);

    return () => clearTimeout(timer);
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
        if (rememberMe) {
          try {
            localStorage.setItem('spc_saved_credentials', JSON.stringify({ email: email.trim(), password }));
          } catch (_err) {}
        } else {
          try {
            localStorage.removeItem('spc_saved_credentials');
          } catch (_err) {}
        }
        await completeLoginFlow(result.data?.user?.id);
      }
    }
  };

  // Complete redirect & session tracking after successful authentication (Instant / Non-blocking)
  const completeLoginFlow = (userId) => {
    // 1. Fire-and-forget background session & audit logging without blocking the redirect
    try {
      Promise.all([
        import('@/app/actions/audit'),
        import('@/utils/platformDetection'),
        import('@/utils/deviceSessionId')
      ]).then(([{ logUserSession, logAuditAction }, { detectClientPlatform }, { getClientDeviceSignature }]) => {
        const device = getClientDeviceSignature();
        const { platform, details: platformDetails } = detectClientPlatform();
        logUserSession(device).catch(err => console.warn('Non-blocking session log:', err));
        logAuditAction('User Login', `User successfully logged in via ${platform}`, {
          platform,
          platformDetails
        }).catch(err => console.warn('Non-blocking audit log:', err));
      }).catch(err => console.warn('Failed to load audit module:', err));
    } catch (e) { 
      console.warn('Failed to initiate session logging', e); 
    }
    
    // 2. Instant Redirect without blocking for round-trip queries
    const currentSearchParams = new URLSearchParams(window.location.search);
    const nextPath = currentSearchParams.get('next') || '/home';
    window.location.href = nextPath;
  };

  // ==========================================
  // EMAIL OTP LOGIN FLOW
  // ==========================================
  const handleRequestLoginOtp = async () => {
    if (loginOtpBusy.current || Date.now() < loginOtpResendAt.current) return;
    const requestedEmail = email.trim().toLowerCase();
    if (!requestedEmail || !requestedEmail.includes('@')) {
      setError("Please enter your registered official email address.");
      return;
    }
    loginOtpBusy.current = true;
    setLoginOtpLoading(true);
    setError(null);
    setLoginOtp('');
    setLoginOtpChallenge(null);
    setLoginOtpSuccessMsg(null);
    loginOtpResendAt.current = Date.now() + 60_000;
    setLoginOtpCooldown(60);
    try {
      const res = await requestEmailLoginOtp(requestedEmail);
      if (res.success) {
        setEmail(requestedEmail);
        setLoginOtpChallenge({ email: requestedEmail, verificationEmail: res.verificationEmail, otpLength: res.otpLength });
        setLoginOtpStep(2);
        setLoginOtpSuccessMsg(res.message);
      } else {
        setLoginOtpStep(1);
        setError(res.error);
      }
    } catch {
      setLoginOtpStep(1);
      setError('Could not send the login code. Please try again shortly or sign in with password.');
    } finally {
      loginOtpBusy.current = false;
      setLoginOtpLoading(false);
    }
  };

  const handleVerifyLoginOtp = async () => {
    if (loginOtpBusy.current) return;
    if (!loginOtpChallenge || loginOtpChallenge.email !== email.trim().toLowerCase()) {
      setError('Please request a login code for this email address.');
      return;
    }
    if (!new RegExp(`^\\d{${loginOtpLength}}$`).test(loginOtp)) {
      setError(`Please enter the ${loginOtpLength}-digit login verification code sent to your email.`);
      return;
    }

    loginOtpBusy.current = true;
    setLoginOtpLoading(true);
    setError(null);

    // Verify the provider-issued OTP directly; no process-local cache or token handoff.
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: loginOtpChallenge.verificationEmail,
        token: loginOtp,
        type: 'email'
      });

      if (verifyError || !data?.user || !data?.session) {
        setError(verifyError?.code === 'otp_expired'
          ? 'This code is invalid or expired. Use the latest email code, or request a new one.'
          : verifyError?.message || 'Authentication failed. Please try again.');
        return;
      }

      // Success! Proceed to redirect
      await completeLoginFlow(data.user.id);
    } catch (authErr) {
      setError(authErr.message || 'Login failed. Please try again.');
    } finally {
      loginOtpBusy.current = false;
      setLoginOtpLoading(false);
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
    <main className={styles.screen}>
      <section className={styles.card}>

        {/* Logo / Header */}
        <header className={styles.brand}>
          <div className={styles.logoPlate}>
            <img
              src="/supuja-logo.png"
              alt="SuPuja Creations"
              className={styles.logo}
            />
          </div>
          <h1 className={styles.title}>
            {mode === 'login' && (
              <>
                <span className={styles.brandName}>SPC Workspace</span>
                <span className={styles.product}>
                  <span
                    suppressHydrationWarning
                    className={styles.version}
                  >
                    v{pkg.version}
                  </span>
                </span>
              </>
            )}
            {mode === 'register' && 'Create Employee Account'}
            {mode === 'forgot' && (forgotStep === 2 && forgotOtp ? 'Set Your Account Password' : 'Reset Your Password')}
          </h1>
          <p className={styles.intro}>
            {mode === 'login' && (loginMethod === 'password' ? 'Sign in with your email & password' : 'Sign in securely using Email OTP')}
            {mode === 'register' && 'Enter your official details to register'}
            {mode === 'forgot' && (forgotStep === 1 ? 'Enter your official email to receive a secure reset code' : 'Enter OTP and create your new password')}
          </p>
        </header>

        {/* ========================================================================= */}
        {/* LOGIN METHOD SELECTOR TABS (Password vs Email OTP) */}
        {/* ========================================================================= */}
        {mode === 'login' && (
          <div className={styles.modeSwitch}>
            <button
              type="button"
              disabled={loginOtpLoading}
              onClick={() => {
                setLoginMethod('password');
                setError(null);
              }}
              className={styles.modeButton}
              aria-pressed={loginMethod === 'password'}
            >
              <Lock size={15} /> Password
            </button>

            <button
              type="button"
              disabled={loginOtpLoading}
              onClick={() => {
                setLoginMethod('otp');
                setError(null);
                setLoginOtpStep(1);
                setLoginOtpSuccessMsg(null);
                setLoginOtpChallenge(null);
                setLoginOtp('');
              }}
              className={styles.modeButton}
              aria-pressed={loginMethod === 'otp'}
            >
              <Mail size={15} /> Email OTP
            </button>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className={`${styles.notice} ${styles.error}`} role="alert">
            {error}
          </div>
        )}

        {/* Forgot Success Message */}
        {forgotSuccessMsg && mode === 'forgot' && (
          <div className={`${styles.notice} ${styles.success}`} role="status">
            <CheckCircle2 size={16} />
            <span>{forgotSuccessMsg}</span>
          </div>
        )}

        {/* Login OTP Success Message */}
        {loginOtpSuccessMsg && mode === 'login' && loginMethod === 'otp' && (
          <div className={`${styles.notice} ${styles.success}`} role="status">
            <CheckCircle2 size={16} />
            <span>{loginOtpSuccessMsg}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* OPTION 1: PASSWORD LOGIN / REGISTER */}
        {/* ========================================================================= */}
        {mode === 'login' && loginMethod === 'password' && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); handleAuth(); }}>
              <div className={styles.formStack}>
                <div>
                  <label htmlFor="login-email" className={styles.label}>
                    Official Email Address
                  </label>
                  <div className={styles.fieldWithIcon}>
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className={styles.field}
                    />
                    <Mail size={16} className={styles.fieldIcon} aria-hidden="true" />
                  </div>
                </div>

                <div>
                  <div className={styles.fieldHeading}>
                    <label htmlFor="login-password" className={styles.label}>Password *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setForgotEmail(email);
                        setError(null);
                        setForgotStep(1);
                      }}
                      className={styles.textButton}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className={styles.passwordField}>
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={styles.field}
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowPassword(prev => !prev)}
                      className={styles.passwordToggle}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Remember ID & Password Checkbox */}
                <div className={styles.rememberRow}>
                   <label className={styles.remember}>
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className={styles.checkbox}
                    />
                     <span>Remember ID &amp; Password (याद रखें)</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email || !password}
                className={styles.primary}
              >
                {loading ? 'Signing in...' : 'Sign In with Password'}
              </button>
          </form>

          <div className={styles.alternate}>
            <button
              type="button"
              onClick={() => {
                setLoginMethod('otp');
                setError(null);
                setLoginOtpStep(1);
                setLoginOtpSuccessMsg(null);
                setLoginOtpChallenge(null);
                setLoginOtp('');
              }}
              className={styles.secondary}
            >
              <Mail size={14} aria-hidden="true" /> Sign in with Email OTP instead
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
              <div className={styles.formStack}>
                <div>
                  <label htmlFor="otp-email" className={styles.label}>
                    Registered Official Email Address *
                  </label>
                  <div className={styles.fieldWithIcon}>
                    <input
                      id="otp-email"
                      type="email"
                      value={email}
                      disabled={loginOtpLoading}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. employee@company.com"
                      className={styles.field}
                    />
                    <Mail size={16} className={styles.fieldIcon} aria-hidden="true" />
                  </div>
                  <p className={styles.hint}>
                    We&apos;ll send a login verification code directly to this official mailbox.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRequestLoginOtp}
                  disabled={loginOtpLoading || loginOtpCooldown > 0 || !email}
                  className={styles.primary}
                >
                  {loginOtpLoading ? <RefreshCw size={16} className="animate-spin" /> : <Mail size={16} />}
                  {loginOtpLoading ? 'Sending Login Code...' : loginOtpCooldown > 0 ? `Send again in ${loginOtpCooldown}s` : 'Send Login OTP'}
                </button>
              </div>
            ) : (
              <div className={styles.formStack}>
                <div>
                  <div className={styles.fieldHeading}>
                    <label htmlFor="login-otp" className={styles.label}>Enter {loginOtpLength}-Digit Login OTP *</label>
                    <button
                      type="button"
                      onClick={handleRequestLoginOtp}
                      disabled={loginOtpLoading || loginOtpCooldown > 0}
                      className={styles.textButton}
                    >
                      {loginOtpCooldown > 0 ? `Resend in ${loginOtpCooldown}s` : 'Resend Code'}
                    </button>
                  </div>
                  <input
                    id="login-otp"
                    type="text"
                    maxLength={loginOtpLength}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    disabled={loginOtpLoading}
                    value={loginOtp}
                    onChange={(e) => setLoginOtp(e.target.value.replace(/\D/g, ''))}
                    onPaste={(e) => {
                      e.preventDefault();
                      setLoginOtp(e.clipboardData.getData('text').replace(/\D/g, '').slice(0, loginOtpLength));
                    }}
                    placeholder={`Enter ${loginOtpLength}-digit OTP`}
                    autoFocus
                    className={`${styles.field} ${styles.codeField}`}
                  />
                  <div className={styles.recipient}>
                    <span>Sent to: <strong>{email}</strong></span>
                    <button
                      type="button"
                      disabled={loginOtpLoading}
                      onClick={() => {
                        setLoginOtpStep(1);
                        setLoginOtp('');
                        setLoginOtpChallenge(null);
                        setLoginOtpSuccessMsg(null);
                        setError(null);
                      }}
                      className={styles.textButton}
                    >
                      Change Email
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleVerifyLoginOtp}
                  disabled={loginOtpLoading || !loginOtpChallenge || loginOtp.length !== loginOtpLength}
                  className={styles.primary}
                >
                  {loginOtpLoading ? <RefreshCw size={16} className="animate-spin" /> : <UserCheck size={16} />}
                  {loginOtpLoading ? 'Verifying Code...' : 'Verify & Sign In'}
                </button>
              </div>
            )}

            <div className={styles.alternate}>
              <button
                type="button"
                disabled={loginOtpLoading}
                onClick={() => {
                  setLoginMethod('password');
                  setError(null);
                }}
                className={styles.secondary}
              >
                <Lock size={14} aria-hidden="true" /> Sign in with Password instead
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* REGISTRATION FORM */}
        {/* ========================================================================= */}
        {mode === 'register' && (
          <>
            <div className={styles.formStack}>
              <div>
                <label htmlFor="register-id" className={styles.label}>Emp ID *</label>
                <input
                  id="register-id"
                  type="text"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  placeholder="E.g. EMP001"
                  className={styles.field}
                />
              </div>
              <div>
                <label htmlFor="register-name" className={styles.label}>Emp Name *</label>
                <input
                  id="register-name"
                  type="text"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  placeholder="Full Name"
                  className={styles.field}
                />
              </div>
              <div>
                <label htmlFor="register-mobile" className={styles.label}>Mobile Number *</label>
                <input
                  id="register-mobile"
                  type="tel"
                  value={empMobile}
                  onChange={(e) => setEmpMobile(e.target.value)}
                  placeholder="10-digit mobile number"
                  className={styles.field}
                />
              </div>
              <div>
                <label htmlFor="register-department" className={styles.label}>Emp Department *</label>
                <select
                  id="register-department"
                  value={empDepartment}
                  onChange={(e) => setEmpDepartment(e.target.value)}
                  className={styles.field}
                >
                  <option value="">Select Department...</option>
                  {DEPARTMENTS.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="register-designation" className={styles.label}>Emp Designation *</label>
                <input
                  id="register-designation"
                  type="text"
                  value={empDesignation}
                  onChange={(e) => setEmpDesignation(e.target.value)}
                  placeholder="E.g. Sales Executive"
                  className={styles.field}
                />
              </div>
              <div>
                <label htmlFor="register-email" className={styles.label}>Emp Official Mail ID *</label>
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className={styles.field}
                />
              </div>
              <div>
                <label htmlFor="register-password" className={styles.label}>Password *</label>
                <div className={styles.passwordField}>
                  <input
                    id="register-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={styles.field}
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword(prev => !prev)}
                    className={styles.passwordToggle}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleAuth}
              disabled={loading || !empId || !empName || !empDepartment || !empDesignation || !empMobile || !email || !password}
              className={styles.primary}
            >
              {loading ? 'Processing...' : 'Register Account'}
            </button>

            <button
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={styles.secondary}
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
              <div className={styles.formStack}>
                <div>
                  <label htmlFor="reset-email" className={styles.label}>
                    Registered Official Email Address *
                  </label>
                  <div className={styles.fieldWithIcon}>
                    <input
                      id="reset-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="e.g. employee@company.com"
                      className={styles.field}
                    />
                    <Mail size={16} className={styles.fieldIcon} aria-hidden="true" />
                  </div>
                  <p className={styles.hint}>
                    We will send a 6-digit verification code to this email via SuPuja Creations Admin Mail.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRequestForgotOtp}
                  disabled={forgotLoading || !forgotEmail}
                  className={styles.primary}
                >
                  {forgotLoading ? <RefreshCw size={16} className="animate-spin" /> : <Mail size={16} />}
                  {forgotLoading ? 'Sending Security Code...' : 'Send Verification OTP'}
                </button>
              </div>
            ) : (
              <div className={styles.formStack}>
                <div>
                  <div className={styles.fieldHeading}>
                    <label htmlFor="reset-otp" className={styles.label}>Enter 6-Digit OTP *</label>
                    <button
                      type="button"
                      onClick={handleRequestForgotOtp}
                      disabled={forgotLoading}
                      className={styles.textButton}
                    >
                      Resend Code
                    </button>
                  </div>
                  <input
                    id="reset-otp"
                    type="text"
                    maxLength={6}
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 6-digit OTP"
                    className={`${styles.field} ${styles.codeField}`}
                  />
                </div>

                <div>
                  <label htmlFor="reset-password" className={styles.label}>
                    New Password *
                  </label>
                  <div className={styles.passwordField}>
                    <input
                      id="reset-password"
                      type={showForgotNewPassword ? "text" : "password"}
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className={styles.field}
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowForgotNewPassword(prev => !prev)}
                      className={styles.passwordToggle}
                      aria-label={showForgotNewPassword ? "Hide password" : "Show password"}
                      aria-pressed={showForgotNewPassword}
                      title={showForgotNewPassword ? "Hide password" : "Show password"}
                    >
                      {showForgotNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="reset-confirm-password" className={styles.label}>
                    Confirm New Password *
                  </label>
                  <input
                    id="reset-confirm-password"
                    type={showForgotNewPassword ? "text" : "password"}
                    value={forgotConfirmPassword}
                    onChange={(e) => setForgotConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className={styles.field}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={forgotLoading || !forgotOtp || !forgotNewPassword || !forgotConfirmPassword}
                  className={styles.primary}
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
              className={styles.back}
            >
              <ArrowLeft size={16} /> Back to Login
            </button>
          </div>
        )}

        {/* Enterprise Security Badge */}
        <footer className={styles.footer}>
          <ShieldCheck size={14} aria-hidden="true" />
          <span>256-Bit SSL Encrypted Enterprise Workspace</span>
        </footer>

      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className={styles.screen}>
        <PremiumProgressLoader message="Loading SuPuja Creations Workplace..." active={true} />
      </main>
    }>
      <LoginFormContent />
    </Suspense>
  );
}
