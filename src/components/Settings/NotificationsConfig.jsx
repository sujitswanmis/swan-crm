import React, { useState } from 'react';
import { Bell, Mail, MonitorSmartphone, Save, Clock, AlertTriangle } from 'lucide-react';
import { logAuditAction } from '@/app/actions/audit';

export default function NotificationsConfig() {
  const [loading, setLoading] = useState(false);
  const [prefs, setPrefs] = useState({
    email: true,
    browser: true,
    inApp: true,
    confirmStageChange: true,
    dailyReminderTime: '09:00',
    soundDuration: '3'
  });

  const [alertSound, setAlertSound] = useState(null);
  
  React.useEffect(() => {
    const saved = localStorage.getItem('crm_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.alertSound) setAlertSound(parsed.alertSound);
        if (parsed.alertDuration) setPrefs(p => ({...p, soundDuration: parsed.alertDuration}));
        if (parsed.confirmStageChange !== undefined) setPrefs(p => ({...p, confirmStageChange: parsed.confirmStageChange}));
      } catch (e) { console.error(e); }
    }
  }, []);

  const handleSave = () => {
    setLoading(true);
    
    // Save to crm_config for the CRMContainer to read
    const saved = localStorage.getItem('crm_config');
    let config = saved ? JSON.parse(saved) : {};
    config.alertSound = alertSound;
    config.alertDuration = prefs.soundDuration;
    config.confirmStageChange = prefs.confirmStageChange;
    localStorage.setItem('crm_config', JSON.stringify(config));

    try {
      logAuditAction('Update Notifications', `Updated alert sound and notification preferences`);
    } catch(e) { console.error('Audit Log failed', e); }
    
    setTimeout(() => setLoading(false), 1000);
  };

  const ToggleSwitch = ({ checked, onChange }) => (
    <div 
      onClick={() => onChange(!checked)}
      style={{ 
        width: '44px', height: '24px', borderRadius: '12px', 
        background: checked ? 'var(--accent-color)' : '#cbd5e1', 
        position: 'relative', cursor: 'pointer', transition: 'background 0.3s' 
      }}
    >
      <div style={{ 
        position: 'absolute', top: '2px', left: checked ? '22px' : '2px', 
        width: '20px', height: '20px', borderRadius: '50%', background: 'white', 
        transition: 'left 0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' 
      }} />
    </div>
  );

  return (
    <div style={{ padding: '1.5rem', width: '100%', maxWidth: '1440px', margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Bell size={24} color="var(--accent-color)" />
          Notifications & Alerts
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Configure how and when you receive CRM alerts.</p>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexDirection: 'column' }}>
        
        {/* Delivery Channels */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1.5rem' }}>Delivery Channels</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', background: 'var(--th-filtered-bg)', borderRadius: '50%', color: 'var(--accent-color)' }}><Mail size={20} /></div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Email Notifications</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Receive daily summaries and urgent alerts via email.</div>
                </div>
              </div>
              <ToggleSwitch checked={prefs.email} onChange={(v) => setPrefs({...prefs, email: v})} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', background: 'var(--th-filtered-bg)', borderRadius: '50%', color: 'var(--accent-color)' }}><MonitorSmartphone size={20} /></div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Browser Push Notifications</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Get popup alerts even when CRM is not open.</div>
                </div>
              </div>
              <ToggleSwitch checked={prefs.browser} onChange={(v) => setPrefs({...prefs, browser: v})} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', background: 'var(--th-filtered-bg)', borderRadius: '50%', color: 'var(--accent-color)' }}><Bell size={20} /></div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>In-App Bell Icon</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Show red badge and dropdown alerts inside the CRM.</div>
                </div>
              </div>
              <ToggleSwitch checked={prefs.inApp} onChange={(v) => setPrefs({...prefs, inApp: v})} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', background: 'var(--th-filtered-bg)', borderRadius: '50%', color: 'var(--accent-color)' }}><AlertTriangle size={20} /></div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Confirm Stage Changes</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Show a confirmation popup when changing a lead's pipeline stage.</div>
                </div>
              </div>
              <ToggleSwitch checked={prefs.confirmStageChange} onChange={(v) => setPrefs({...prefs, confirmStageChange: v})} />
            </div>
          </div>
        </div>

        {/* Daily Reminders */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>Daily Digest & Reminders</h3>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Time for Daily Follow-ups Email</label>
              <div style={{ position: 'relative', maxWidth: '200px' }}>
                <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                  <Clock size={16} />
                </div>
                <input 
                  type="time" 
                  value={prefs.dailyReminderTime}
                  onChange={(e) => setPrefs({...prefs, dailyReminderTime: e.target.value})}
                  style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Custom Sounds */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>Alert Sounds</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Customize the sound played when a new lead arrives or a reminder triggers.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Upload Notification Sound (.mp3, .wav)</label>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ flex: 1, padding: '0.75rem 1rem', background: 'var(--bg-surface)', border: '1px dashed var(--border-light)', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {alertSound ? <span style={{color: '#10b981', fontWeight: 500}}>Custom Audio Selected ✓</span> : 'No file chosen (Using default beep)'}
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
                      onClick={() => {
                        const audio = new Audio(alertSound);
                        const durationMs = parseInt(prefs.soundDuration || 3) * 1000;
                        audio.play();
                        setTimeout(() => audio.pause(), durationMs);
                      }}
                      style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Play Demo
                    </button>
                    <button 
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
                onChange={(e) => setPrefs({...prefs, soundDuration: e.target.value})}
                style={{ maxWidth: '100px', padding: '0.75rem 1rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '1rem' }}>How long the alert should loop before auto-muting.</span>
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button 
            onClick={handleSave}
            disabled={loading}
            style={{ 
              padding: '0.75rem 2rem', background: 'var(--accent-color)', color: 'white', 
              border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', 
              fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              boxShadow: '0 4px 10px rgba(0,0,0,0.1)', opacity: loading ? 0.7 : 1
            }}
          >
            <Save size={18} />
            {loading ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>

      </div>
    </div>
  );
}
