'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, Bell, Volume2, VolumeX, MonitorSmartphone, CheckCircle2, 
  Sparkles, CheckSquare, Phone, Play, ShieldAlert, Check
} from 'lucide-react';

export default function UserNotificationPreferencesModal({ isOpen, onClose }) {
  const [browserPermission, setBrowserPermission] = useState('default');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [prefs, setPrefs] = useState({
    popupStyle: 'corner_toast', // 'corner_toast' | 'center_modal' | 'both' | 'bell_only'
    soundEnabled: true,
    browserPushEnabled: true,
    notifyChecklist: true,
    notifyDelegation: true,
    notifyLeads: true
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(Notification.permission);
    }

    try {
      const saved = localStorage.getItem('crm_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        setPrefs(p => ({
          ...p,
          popupStyle: parsed.popupStyle || 'corner_toast',
          soundEnabled: parsed.soundEnabled !== undefined ? parsed.soundEnabled : true,
          browserPushEnabled: parsed.browserPushEnabled !== undefined ? parsed.browserPushEnabled : true,
          notifyChecklist: parsed.notifyChecklist !== undefined ? parsed.notifyChecklist : true,
          notifyDelegation: parsed.notifyDelegation !== undefined ? parsed.notifyDelegation : true,
          notifyLeads: parsed.notifyLeads !== undefined ? parsed.notifyLeads : true
        }));
      }
    } catch (e) {
      console.warn('Error reading crm_config:', e);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRequestPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const result = await Notification.requestPermission();
        setBrowserPermission(result);
        if (result === 'granted') {
          setPrefs(p => ({ ...p, browserPushEnabled: true }));
          savePreferences({ ...prefs, browserPushEnabled: true });
        }
      } catch (err) {
        console.error('Error requesting notification permission:', err);
      }
    }
  };

  const savePreferences = (customPrefs = prefs) => {
    try {
      const existing = localStorage.getItem('crm_config');
      let merged = {};
      if (existing) {
        merged = JSON.parse(existing);
      }
      merged = {
        ...merged,
        popupStyle: customPrefs.popupStyle,
        soundEnabled: customPrefs.soundEnabled,
        browserPushEnabled: customPrefs.browserPushEnabled,
        notifyChecklist: customPrefs.notifyChecklist,
        notifyDelegation: customPrefs.notifyDelegation,
        notifyLeads: customPrefs.notifyLeads
      };
      localStorage.setItem('crm_config', JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent('crm_config_updated', { detail: merged }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2200);
    } catch (e) {
      console.error('Error saving crm_config:', e);
    }
  };

  const handleTestAlert = () => {
    // Save current selection first so test reflects active choices
    savePreferences(prefs);
    window.dispatchEvent(new CustomEvent('test_user_screen_alert', { detail: prefs }));
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(5px)',
      zIndex: 100000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '16px',
        border: '1px solid var(--border-light)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeIn 0.15s ease-out'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '1.1rem 1.4rem',
          borderBottom: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Bell size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>
                Notification & Alert Preferences
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                Personalize how alerts appear on your screen and sound
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.3rem', borderRadius: '6px' }}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.25rem 1.4rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Section 1: Desktop Push Permission */}
          <div style={{
            padding: '0.9rem 1rem',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            backgroundColor: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <MonitorSmartphone size={20} style={{ color: 'var(--accent-color)' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                    Browser Desktop Notifications
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    Get Windows / Mac alerts even when CRM is minimized
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.18rem 0.55rem',
                borderRadius: '6px',
                backgroundColor: browserPermission === 'granted' ? 'rgba(16, 185, 129, 0.15)' : (browserPermission === 'denied' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.18)'),
                color: browserPermission === 'granted' ? '#10b981' : (browserPermission === 'denied' ? '#ef4444' : '#d97706'),
                border: `1px solid ${browserPermission === 'granted' ? '#10b981' : (browserPermission === 'denied' ? '#ef4444' : '#d97706')}40`
              }}>
                {browserPermission === 'granted' ? 'Granted ✓' : (browserPermission === 'denied' ? 'Blocked ✕' : 'Not Enabled')}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.4rem', borderTop: '1px dashed var(--border-light)' }}>
              {browserPermission !== 'granted' ? (
                <button
                  type="button"
                  onClick={handleRequestPermission}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--accent-color)',
                    color: '#ffffff',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Enable Browser Permission 👉
                </button>
              ) : (
                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                  ✓ Browser permission is active on this device
                </span>
              )}

              {browserPermission === 'denied' && (
                <span style={{ fontSize: '0.72rem', color: '#ef4444', marginLeft: '0.5rem' }}>
                  Click the lock (🔒) in URL bar to Allow.
                </span>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={prefs.browserPushEnabled}
                  onChange={(e) => setPrefs(p => ({ ...p, browserPushEnabled: e.target.checked }))}
                />
                Push Alerts Active
              </label>
            </div>
          </div>

          {/* Section 2: Screen Popup Style */}
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
              Screen Popup Alert Style
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              Choose how priority alerts appear on your screen when you are working
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem' }}>
              {[
                {
                  id: 'corner_toast',
                  title: 'Corner Toast Card',
                  badge: 'Recommended',
                  desc: 'Sleek card slides into top-right corner. Auto-dismisses in 9s or click to open.'
                },
                {
                  id: 'center_modal',
                  title: 'Center Modal Dialog',
                  badge: 'High Focus',
                  desc: 'Prominent dialog in center of screen. Requires action or Snooze click.'
                },
                {
                  id: 'both',
                  title: 'Smart Combo',
                  badge: 'Dynamic',
                  desc: 'Corner toast for normal tasks, high-priority modal for urgent checklists.'
                },
                {
                  id: 'bell_only',
                  title: 'Bell Icon Only',
                  badge: 'Quiet',
                  desc: 'No on-screen popups. Only increments the red badge count on header bell.'
                }
              ].map(opt => {
                const isSelected = prefs.popupStyle === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setPrefs(p => ({ ...p, popupStyle: opt.id }))}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '10px',
                      border: isSelected ? '2px solid var(--accent-color)' : '1px solid var(--border-light)',
                      backgroundColor: isSelected ? 'var(--nav-active-bg)' : 'var(--bg-primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                        {opt.title}
                      </span>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '0.1rem 0.4rem',
                        borderRadius: '4px',
                        backgroundColor: isSelected ? 'var(--accent-color)' : 'var(--th-bg)',
                        color: isSelected ? '#ffffff' : 'var(--text-secondary)'
                      }}>
                        {opt.badge}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      {opt.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Audio & Sound */}
          <div style={{
            padding: '0.85rem 1rem',
            borderRadius: '10px',
            border: '1px solid var(--border-light)',
            backgroundColor: 'var(--bg-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {prefs.soundEnabled ? <Volume2 size={18} style={{ color: '#10b981' }} /> : <VolumeX size={18} style={{ color: '#ef4444' }} />}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                  Audio Sound Alert
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  Play a chime when a new task is assigned or checklist unlocks
                </div>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={prefs.soundEnabled}
                onChange={(e) => setPrefs(p => ({ ...p, soundEnabled: e.target.checked }))}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-color)' }}
              />
            </label>
          </div>

          {/* Section 4: Module Toggles */}
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Alert Triggers (Notify Me For)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {[
                { key: 'notifyChecklist', label: 'Smart Checklist Due & Unlock Alerts', icon: '📋' },
                { key: 'notifyDelegation', label: 'Delegation Tasks Assigned to Me', icon: '🎯' },
                { key: 'notifyLeads', label: 'Lead Follow-up Reminders', icon: '📞' }
              ].map(item => (
                <label
                  key={item.key}
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {item.icon} {item.label}
                  </span>
                  <input
                    type="checkbox"
                    checked={prefs[item.key]}
                    onChange={(e) => setPrefs(p => ({ ...p, [item.key]: e.target.checked }))}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-color)' }}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '0.9rem 1.4rem',
          borderTop: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <button
            type="button"
            onClick={handleTestAlert}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <Play size={14} style={{ color: 'var(--accent-color)' }} /> Test Screen Alert
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {saveSuccess && (
              <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Check size={14} /> Saved!
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                savePreferences(prefs);
                onClose();
              }}
              style={{
                padding: '0.48rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--accent-color)',
                color: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
              }}
            >
              Save Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
