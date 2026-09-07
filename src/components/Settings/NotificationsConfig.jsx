import React, { useState, useEffect } from 'react';
import { Bell, Mail, MonitorSmartphone, Save, Clock, AlertTriangle, CheckSquare, Sparkles, CheckCircle2, Volume2, VolumeX, Eye, Play } from 'lucide-react';
import { logAuditAction } from '@/app/actions/audit';

export default function NotificationsConfig() {
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [browserPermission, setBrowserPermission] = useState('default');

  const [prefs, setPrefs] = useState({
    email: true,
    browser: true,
    inApp: true,
    confirmStageChange: true,
    dailyReminderTime: '09:00',
    soundDuration: '3',
    soundEnabled: true,
    notifyChecklist: true,
    notifyDelegation: true,
    notifyLeads: true,
    popupStyle: 'corner_toast', // 'corner_toast' | 'center_modal' | 'both' | 'bell_only'
    browserPushEnabled: true
  });

  const [alertSound, setAlertSound] = useState(null);

  useEffect(() => {
    // Check browser notification permission status
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(Notification.permission);
    }

    const saved = localStorage.getItem('crm_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.alertSound) setAlertSound(parsed.alertSound);
        setPrefs(p => ({
          ...p,
          alertSound: parsed.alertSound || null,
          soundDuration: parsed.alertDuration || p.soundDuration,
          soundEnabled: parsed.soundEnabled !== undefined ? parsed.soundEnabled : true,
          confirmStageChange: parsed.confirmStageChange !== undefined ? parsed.confirmStageChange : p.confirmStageChange,
          email: parsed.email !== undefined ? parsed.email : p.email,
          browser: parsed.browser !== undefined ? parsed.browser : p.browser,
          inApp: parsed.inApp !== undefined ? parsed.inApp : p.inApp,
          dailyReminderTime: parsed.dailyReminderTime || p.dailyReminderTime,
          notifyChecklist: parsed.notifyChecklist !== undefined ? parsed.notifyChecklist : true,
          notifyDelegation: parsed.notifyDelegation !== undefined ? parsed.notifyDelegation : true,
          notifyLeads: parsed.notifyLeads !== undefined ? parsed.notifyLeads : true,
          popupStyle: parsed.popupStyle || 'corner_toast',
          browserPushEnabled: parsed.browserPushEnabled !== undefined ? parsed.browserPushEnabled : true
        }));
      } catch (e) {
        console.error('Error loading crm_config:', e);
      }
    }
  }, []);

  const requestBrowserPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('Your browser does not support desktop notifications.');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setBrowserPermission(perm);
      if (perm === 'granted') {
        new Notification('🔔 Notifications Enabled!', {
          body: 'You will now receive desktop alerts for new tasks and checklist slots.',
          icon: '/favicon.ico'
        });
      }
    } catch (e) {
      console.warn('Error requesting notification permission:', e);
    }
  };

  const handleSave = () => {
    setLoading(true);
    setSaveSuccess(false);

    // Save to crm_config for the CRMContainer to read
    const saved = localStorage.getItem('crm_config');
    let config = saved ? JSON.parse(saved) : {};
    config.alertSound = alertSound;
    config.alertDuration = prefs.soundDuration;
    config.soundEnabled = prefs.soundEnabled;
    config.confirmStageChange = prefs.confirmStageChange;
    config.email = prefs.email;
    config.browser = prefs.browser;
    config.inApp = prefs.inApp;
    config.dailyReminderTime = prefs.dailyReminderTime;
    config.notifyChecklist = prefs.notifyChecklist;
    config.notifyDelegation = prefs.notifyDelegation;
    config.notifyLeads = prefs.notifyLeads;
    config.popupStyle = prefs.popupStyle;
    config.browserPushEnabled = prefs.browserPushEnabled;

    localStorage.setItem('crm_config', JSON.stringify(config));

    // Dispatch custom event so CRMContainer immediately reacts without page refresh
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('crm_config_updated', { detail: config }));
    }

    try {
      logAuditAction('Update Notifications', `Updated alert preferences (Popup style: ${prefs.popupStyle}, Checklist: ${prefs.notifyChecklist}, Delegation: ${prefs.notifyDelegation})`);
    } catch(e) {
      console.error('Audit Log failed', e);
    }

    setTimeout(() => {
      setLoading(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    }, 500);
  };

  const triggerTestAlert = () => {
    if (typeof window === 'undefined') return;

    // Trigger test event picked up by CRMContainer
    window.dispatchEvent(new CustomEvent('crm_test_notification', {
      detail: {
        type: 'test',
        title: '🎯 Test Task: Verification Audit Demo',
        message: 'This is a live preview of your chosen notification popup style!',
        delegated_by_name: 'Admin Demo',
        dueTime: '18:00',
        popupStyle: prefs.popupStyle,
        soundEnabled: prefs.soundEnabled
      }
    }));
  };

  const ToggleSwitch = ({ checked, onChange }) => (
    <div 
      onClick={() => onChange(!checked)}
      style={{ 
        width: '46px', height: '24px', borderRadius: '12px', 
        background: checked ? 'var(--accent-color)' : '#cbd5e1', 
        position: 'relative', cursor: 'pointer', transition: 'background 0.3s',
        flexShrink: 0
      }}
    >
      <div style={{ 
        position: 'absolute', top: '2px', left: checked ? '24px' : '2px', 
        width: '20px', height: '20px', borderRadius: '50%', background: 'white', 
        transition: 'left 0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' 
      }} />
    </div>
  );

  return (
    <div style={{ padding: '1.5rem', width: '100%', maxWidth: '1440px', margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.4rem' }}>
            <Bell size={26} color="var(--accent-color)" />
            Notifications & Alerts Management
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Customize how Checklist open times, Delegation task assignments, and Lead alerts pop up on your screen.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={triggerTestAlert}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.55rem 1rem',
              borderRadius: '8px',
              border: '1px solid var(--accent-color)',
              background: 'transparent',
              color: 'var(--accent-color)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Preview how notification will pop up on your screen"
          >
            <Play size={15} />
            Test Screen Alert
          </button>

          <button 
            onClick={handleSave}
            disabled={loading}
            style={{ 
              padding: '0.6rem 1.6rem', background: 'var(--accent-color)', color: 'white', 
              border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', 
              fontWeight: 600, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              boxShadow: '0 4px 10px rgba(0,0,0,0.1)', opacity: loading ? 0.7 : 1
            }}
          >
            <Save size={16} />
            {loading ? 'Saving...' : (saveSuccess ? 'Saved ✓' : 'Save Preferences')}
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div style={{ 
          marginBottom: '1.5rem', padding: '0.75rem 1.2rem', 
          backgroundColor: 'rgba(16, 185, 129, 0.12)', 
          border: '1px solid #10b981', 
          borderRadius: '8px', 
          color: '#047857', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.6rem', 
          fontWeight: 600, 
          fontSize: '0.9rem' 
        }}>
          <CheckCircle2 size={18} color="#10b981" />
          Notification preferences saved successfully! New alert settings are now active.
        </div>
      )}

      <div style={{ display: 'flex', gap: '1.75rem', flexDirection: 'column' }}>
        
        {/* SECTION 1: POPUP DISPLAY STYLE SELECTOR */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={20} color="var(--accent-color)" />
              Screen Popup Alert Style (स्क्रीन पर पॉपअप कैसा दिखे?)
            </h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.85rem' }}>
              Choose how you want to be alerted on screen when a task is delegated to you or a checklist slot opens.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            {/* Style 1: Corner Toast Popup */}
            <div 
              onClick={() => setPrefs(p => ({ ...p, popupStyle: 'corner_toast' }))}
              style={{
                border: prefs.popupStyle === 'corner_toast' ? '2px solid var(--accent-color)' : '1px solid var(--border-light)',
                backgroundColor: prefs.popupStyle === 'corner_toast' ? 'var(--nav-active-bg)' : 'var(--bg-surface)',
                borderRadius: '10px',
                padding: '1.1rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: prefs.popupStyle === 'corner_toast' ? '0 4px 12px rgba(59, 130, 246, 0.15)' : 'none'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: '1.4rem' }}>📱</span>
                  <input 
                    type="radio" 
                    name="popupStyle" 
                    checked={prefs.popupStyle === 'corner_toast'} 
                    onChange={() => setPrefs(p => ({ ...p, popupStyle: 'corner_toast' }))}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent-color)' }}
                  />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Corner Toast Popup
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  Screen ke kone me sleek floating card aayega. Ongoing work ko block nahi karta aur 8s baad auto-dismiss hota hai.
                </div>
              </div>
              <div style={{ marginTop: '0.9rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-color)' }}>
                Recommended for fast workflow ✓
              </div>
            </div>

            {/* Style 2: Center Modal Popup */}
            <div 
              onClick={() => setPrefs(p => ({ ...p, popupStyle: 'center_modal' }))}
              style={{
                border: prefs.popupStyle === 'center_modal' ? '2px solid var(--accent-color)' : '1px solid var(--border-light)',
                backgroundColor: prefs.popupStyle === 'center_modal' ? 'var(--nav-active-bg)' : 'var(--bg-surface)',
                borderRadius: '10px',
                padding: '1.1rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: prefs.popupStyle === 'center_modal' ? '0 4px 12px rgba(59, 130, 246, 0.15)' : 'none'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: '1.4rem' }}>🖥️</span>
                  <input 
                    type="radio" 
                    name="popupStyle" 
                    checked={prefs.popupStyle === 'center_modal'} 
                    onChange={() => setPrefs(p => ({ ...p, popupStyle: 'center_modal' }))}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent-color)' }}
                  />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Center Modal Popup
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  Screen ke center me high-priority alert box khulega jisme &quot;Open Now&quot; aur &quot;Snooze&quot; button honge. Miss hone ka risk zero.
                </div>
              </div>
              <div style={{ marginTop: '0.9rem', fontSize: '0.75rem', fontWeight: 600, color: '#f59e0b' }}>
                High Priority / Attention-grabbing
              </div>
            </div>

            {/* Style 3: Smart Combo (Both) */}
            <div 
              onClick={() => setPrefs(p => ({ ...p, popupStyle: 'both' }))}
              style={{
                border: prefs.popupStyle === 'both' ? '2px solid var(--accent-color)' : '1px solid var(--border-light)',
                backgroundColor: prefs.popupStyle === 'both' ? 'var(--nav-active-bg)' : 'var(--bg-surface)',
                borderRadius: '10px',
                padding: '1.1rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: prefs.popupStyle === 'both' ? '0 4px 12px rgba(59, 130, 246, 0.15)' : 'none'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: '1.4rem' }}>⚡</span>
                  <input 
                    type="radio" 
                    name="popupStyle" 
                    checked={prefs.popupStyle === 'both'} 
                    onChange={() => setPrefs(p => ({ ...p, popupStyle: 'both' }))}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent-color)' }}
                  />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Smart Combo (Both)
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  Delegation task ke liye Corner Toast aayega aur urgent checklist due time par Center Modal aayega.
                </div>
              </div>
              <div style={{ marginTop: '0.9rem', fontSize: '0.75rem', fontWeight: 600, color: '#10b981' }}>
                Balanced Alert Mode
              </div>
            </div>

            {/* Style 4: Header Bell Only */}
            <div 
              onClick={() => setPrefs(p => ({ ...p, popupStyle: 'bell_only' }))}
              style={{
                border: prefs.popupStyle === 'bell_only' ? '2px solid var(--accent-color)' : '1px solid var(--border-light)',
                backgroundColor: prefs.popupStyle === 'bell_only' ? 'var(--nav-active-bg)' : 'var(--bg-surface)',
                borderRadius: '10px',
                padding: '1.1rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: prefs.popupStyle === 'bell_only' ? '0 4px 12px rgba(59, 130, 246, 0.15)' : 'none'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: '1.4rem' }}>🔕</span>
                  <input 
                    type="radio" 
                    name="popupStyle" 
                    checked={prefs.popupStyle === 'bell_only'} 
                    onChange={() => setPrefs(p => ({ ...p, popupStyle: 'bell_only' }))}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent-color)' }}
                  />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Header Bell Icon Only
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  Screen par koi popup nahi khulega. Sirf upar Ghanti (Bell) par red badge count (+1) aur sound aayega.
                </div>
              </div>
              <div style={{ marginTop: '0.9rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Discreet / Minimal
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: MODULE ALERT TRIGGERS */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
            Module Alert Triggers (किन-किन चीजों के अलर्ट चाहिए?)
          </h3>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 1.25rem 0', fontSize: '0.85rem' }}>
            Choose which modules will trigger sound and screen popup alerts for you.
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Checklist trigger */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', background: 'rgba(59, 130, 246, 0.12)', borderRadius: '50%', color: 'var(--accent-color)' }}>
                  <CheckSquare size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                    📋 Smart Checklist Reminders & Open Slot Alerts
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Trigger alert as soon as a checklist slot opens or reaches scheduled time today.
                  </div>
                </div>
              </div>
              <ToggleSwitch checked={prefs.notifyChecklist} onChange={(v) => setPrefs(p => ({ ...p, notifyChecklist: v }))} />
            </div>

            {/* Delegation trigger */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', background: 'rgba(16, 185, 129, 0.12)', borderRadius: '50%', color: '#10b981' }}>
                  <Sparkles size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                    🎯 Task Delegation Alerts (Assigned to Me)
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Trigger instant alert whenever another employee delegates a task to you or reopens a task.
                  </div>
                </div>
              </div>
              <ToggleSwitch checked={prefs.notifyDelegation} onChange={(v) => setPrefs(p => ({ ...p, notifyDelegation: v }))} />
            </div>

            {/* Leads follow-up trigger */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', background: 'rgba(245, 158, 11, 0.12)', borderRadius: '50%', color: '#f59e0b' }}>
                  <Clock size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                    📞 Lead Follow-up Due Reminders
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Remind when a lead reaches its designated follow-up time.
                  </div>
                </div>
              </div>
              <ToggleSwitch checked={prefs.notifyLeads} onChange={(v) => setPrefs(p => ({ ...p, notifyLeads: v }))} />
            </div>
          </div>
        </div>

        {/* SECTION 3: DELIVERY CHANNELS & DESKTOP PUSH */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1.5rem' }}>Delivery Channels</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Desktop Push */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', background: 'var(--th-filtered-bg)', borderRadius: '50%', color: 'var(--accent-color)' }}>
                  <MonitorSmartphone size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Browser Desktop Notifications
                    <span style={{ 
                      fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px',
                      backgroundColor: browserPermission === 'granted' ? '#dcfce7' : (browserPermission === 'denied' ? '#fee2e2' : '#f1f5f9'),
                      color: browserPermission === 'granted' ? '#166534' : (browserPermission === 'denied' ? '#991b1b' : '#475569'),
                      fontWeight: 700
                    }}>
                      {browserPermission === 'granted' ? 'Granted ✓' : (browserPermission === 'denied' ? 'Blocked ✕' : 'Not Enabled')}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Get Windows / Mac popup alerts even when CRM tab is minimized or running in background.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {browserPermission !== 'granted' && (
                  <button
                    type="button"
                    onClick={requestBrowserPermission}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid var(--accent-color)',
                      background: 'var(--nav-active-bg)',
                      color: 'var(--accent-color)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Enable Permission
                  </button>
                )}
                <ToggleSwitch checked={prefs.browserPushEnabled} onChange={(v) => setPrefs(p => ({ ...p, browserPushEnabled: v }))} />
              </div>
            </div>

            {/* In-App Bell Icon */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', background: 'var(--th-filtered-bg)', borderRadius: '50%', color: 'var(--accent-color)' }}><Bell size={20} /></div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>In-App Bell Icon & Counter</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Show red badge and multi-tab dropdown alerts inside the top CRM header.</div>
                </div>
              </div>
              <ToggleSwitch checked={prefs.inApp} onChange={(v) => setPrefs(p => ({ ...p, inApp: v }))} />
            </div>

            {/* Email Notifications */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', background: 'var(--th-filtered-bg)', borderRadius: '50%', color: 'var(--accent-color)' }}><Mail size={20} /></div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Email Notifications & Digest</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Receive daily summaries and urgent task alerts via configured SMTP email.</div>
                </div>
              </div>
              <ToggleSwitch checked={prefs.email} onChange={(v) => setPrefs(p => ({ ...p, email: v }))} />
            </div>

            {/* Confirm stage changes */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', background: 'var(--th-filtered-bg)', borderRadius: '50%', color: 'var(--accent-color)' }}><AlertTriangle size={20} /></div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Confirm Stage Changes</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Show a confirmation popup when changing a lead&apos;s pipeline stage.</div>
                </div>
              </div>
              <ToggleSwitch checked={prefs.confirmStageChange} onChange={(v) => setPrefs(p => ({ ...p, confirmStageChange: v }))} />
            </div>
          </div>
        </div>

        {/* SECTION 4: CUSTOM SOUNDS & AUDIO */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Alert Sounds & Audio (आवाज़)</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>Play a sound when a checklist slot opens or a task is delegated.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: prefs.soundEnabled ? '#10b981' : '#64748b' }}>
                {prefs.soundEnabled ? 'Sound ON' : 'Muted'}
              </span>
              <ToggleSwitch checked={prefs.soundEnabled} onChange={(v) => setPrefs(p => ({ ...p, soundEnabled: v }))} />
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', opacity: prefs.soundEnabled ? 1 : 0.5, pointerEvents: prefs.soundEnabled ? 'auto' : 'none' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Upload Custom Notification Sound (.mp3, .wav)
              </label>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '220px', padding: '0.75rem 1rem', background: 'var(--bg-surface)', border: '1px dashed var(--border-light)', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {alertSound ? <span style={{color: '#10b981', fontWeight: 500}}>Custom Audio Selected ✓</span> : 'No file chosen (Using default CRM beep)'}
                </div>
                
                <label style={{ padding: '0.75rem 1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500 }}>
                  Change Sound
                  <input 
                    type="file" 
                    accept="audio/mp3,audio/wav,audio/*" 
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setAlertSound(reader.result);
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
                
                {alertSound && (
                  <>
                    <button 
                      type="button"
                      onClick={() => {
                        const audio = new Audio(alertSound);
                        const durationMs = parseInt(prefs.soundDuration || 3) * 1000;
                        audio.play().catch(() => {});
                        setTimeout(() => {
                          try { audio.pause(); audio.currentTime = 0; } catch (e) {}
                        }, durationMs);
                      }}
                      style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Play Demo
                    </button>
                    <button 
                      type="button"
                      onClick={() => setAlertSound(null)}
                      style={{ padding: '0.75rem 1.5rem', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Sound Duration (Seconds)</label>
              <input 
                type="number" 
                min="1" max="30"
                value={prefs.soundDuration}
                onChange={(e) => setPrefs(p => ({ ...p, soundDuration: e.target.value }))}
                style={{ maxWidth: '100px', padding: '0.75rem 1rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '1rem' }}>How long the audio plays before auto-muting.</span>
            </div>
          </div>
        </div>

        {/* SECTION 5: DAILY DIGEST TIME */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>Daily Digest & Reminders</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Time for Daily Summary Email</label>
              <div style={{ position: 'relative', maxWidth: '200px' }}>
                <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                  <Clock size={16} />
                </div>
                <input 
                  type="time" 
                  value={prefs.dailyReminderTime}
                  onChange={(e) => setPrefs(p => ({ ...p, dailyReminderTime: e.target.value }))}
                  style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* BOTTOM ACTION BAR */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={triggerTestAlert}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.75rem 1.4rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.92rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Play size={16} color="var(--accent-color)" />
            Test Screen Alert
          </button>

          <button 
            onClick={handleSave}
            disabled={loading}
            style={{ 
              padding: '0.75rem 2.2rem', background: 'var(--accent-color)', color: 'white', 
              border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', 
              fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              boxShadow: '0 4px 10px rgba(0,0,0,0.1)', opacity: loading ? 0.7 : 1
            }}
          >
            <Save size={18} />
            {loading ? 'Saving...' : (saveSuccess ? 'Saved ✓' : 'Save Preferences')}
          </button>
        </div>

      </div>
    </div>
  );
}
