'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, Bell, MonitorSmartphone, Play, Check, ShieldCheck
} from 'lucide-react';

export default function UserNotificationPreferencesModal({ isOpen, onClose }) {
  const [browserPermission, setBrowserPermission] = useState('default');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [popupStyle, setPopupStyle] = useState('corner_toast'); // 'corner_toast' | 'center_modal' | 'both'

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(Notification.permission);
    }

    try {
      const saved = localStorage.getItem('crm_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure regular user cannot have bell_only; default to corner_toast if bell_only or unset
        if (parsed.popupStyle && parsed.popupStyle !== 'bell_only') {
          setPopupStyle(parsed.popupStyle);
        } else {
          setPopupStyle('corner_toast');
        }
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
          savePreferences(popupStyle, true);
        }
      } catch (err) {
        console.error('Error requesting notification permission:', err);
      }
    }
  };

  const savePreferences = (selectedStyle = popupStyle, pushGranted = browserPermission === 'granted') => {
    try {
      const existing = localStorage.getItem('crm_config');
      let merged = {};
      if (existing) {
        merged = JSON.parse(existing);
      }

      // Mandatory settings for operational employees:
      // Alerts and sound are always kept enabled, cannot be disabled by employee
      merged = {
        ...merged,
        popupStyle: selectedStyle === 'bell_only' ? 'corner_toast' : selectedStyle,
        soundEnabled: true,
        browserPushEnabled: pushGranted || merged.browserPushEnabled !== false,
        notifyChecklist: true,
        notifyDelegation: true,
        notifyLeads: true
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
    savePreferences(popupStyle);
    window.dispatchEvent(new CustomEvent('test_user_screen_alert', { 
      detail: { popupStyle } 
    }));
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
        maxWidth: '540px',
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
                Screen Alert Preferences
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                Customize how work alerts pop up on your screen
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
          
          {/* Section 1: Desktop Browser Permission */}
          <div style={{
            padding: '1rem',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            backgroundColor: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <MonitorSmartphone size={20} style={{ color: 'var(--accent-color)' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                    Desktop Browser Notifications
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    Receive popup alerts even when the CRM window is minimized
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.2rem 0.6rem',
                borderRadius: '6px',
                backgroundColor: browserPermission === 'granted' ? 'rgba(16, 185, 129, 0.15)' : (browserPermission === 'denied' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.18)'),
                color: browserPermission === 'granted' ? '#10b981' : (browserPermission === 'denied' ? '#ef4444' : '#d97706'),
                border: `1px solid ${browserPermission === 'granted' ? '#10b981' : (browserPermission === 'denied' ? '#ef4444' : '#d97706')}40`
              }}>
                {browserPermission === 'granted' ? 'Enabled ✓' : (browserPermission === 'denied' ? 'Blocked in Browser ✕' : 'Not Enabled')}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-light)' }}>
              {browserPermission !== 'granted' ? (
                <button
                  type="button"
                  onClick={handleRequestPermission}
                  style={{
                    padding: '0.45rem 0.95rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--accent-color)',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <Bell size={14} /> Enable Desktop Notifications 👉
                </button>
              ) : (
                <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Check size={15} /> Desktop notification permission is active
                </span>
              )}

              {browserPermission === 'denied' && (
                <span style={{ fontSize: '0.74rem', color: '#ef4444', lineHeight: 1.3 }}>
                  Click the 🔒 icon in your browser URL address bar to change to &quot;Allow&quot;.
                </span>
              )}
            </div>
          </div>

          {/* Section 2: Screen Popup Style */}
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              Screen Popup Alert Style
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              Choose how you want urgent alerts to appear on your screen:
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {[
                {
                  id: 'both',
                  title: 'Smart Combo (Recommended)',
                  badge: 'Recommended',
                  desc: 'Corner toast for standard tasks; high-focus center modal dialog for urgent checklist slots.'
                },
                {
                  id: 'corner_toast',
                  title: 'Corner Toast Card',
                  badge: 'Non-Intrusive',
                  desc: 'Card slides into the top-right corner. Automatically stays visible or click to open immediately.'
                },
                {
                  id: 'center_modal',
                  title: 'Center Modal Dialog',
                  badge: 'High Focus',
                  desc: 'Prominent dialog directly in the center of your screen. Direct one-click action to execute tasks.'
                }
              ].map(opt => {
                const isSelected = popupStyle === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setPopupStyle(opt.id)}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: '10px',
                      border: isSelected ? '2px solid var(--accent-color)' : '1px solid var(--border-light)',
                      backgroundColor: isSelected ? 'var(--nav-active-bg)' : 'var(--bg-primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                      transition: 'all 0.15s'
                    }}
                  >
                    <input
                      type="radio"
                      name="popupStyle"
                      checked={isSelected}
                      onChange={() => setPopupStyle(opt.id)}
                      style={{ marginTop: '0.2rem', accentColor: 'var(--accent-color)', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                          {opt.title}
                        </span>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.12rem 0.45rem',
                          borderRadius: '4px',
                          backgroundColor: isSelected ? 'var(--accent-color)' : 'var(--th-bg)',
                          color: isSelected ? '#ffffff' : 'var(--text-secondary)'
                        }}>
                          {opt.badge}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                        {opt.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Mandatory Delivery Protection Notice */}
          <div style={{
            padding: '0.8rem 1rem',
            borderRadius: '10px',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.22)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.65rem'
          }}>
            <ShieldCheck size={18} style={{ color: 'var(--accent-color)', marginTop: '0.15rem', flexShrink: 0 }} />
            <div style={{ fontSize: '0.76rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
              <strong>Mandatory Work Alerts:</strong> Checklist reminders, delegated tasks, and follow-ups are vital for company operations. Screen popups and audio chimes are always active to ensure you never miss a deadline.
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
                savePreferences(popupStyle);
                onClose();
              }}
              style={{
                padding: '0.48rem 1.3rem',
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
