'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Activity,
  Workflow,
  Compass,
  Sliders,
  Settings2,
  WifiOff,
  Users
} from 'lucide-react';
import AdminMessageConfig from '../AdminMessageConfig/AdminMessageConfig';
import SystemStatusHealth from '../Settings/SystemStatusHealth';
import AutomationAPI from '../Settings/AutomationAPI';
import PageNavigationConfig from '../Settings/PageNavigationConfig';
import OfflineRuleModule from '../Offline/OfflineRuleModule';
import PublicUserManagement from '../PublicUserManagement';

const CONFIG_TABS = [
  { id: 'messages', label: 'Platform Messaging & OTPs', icon: ShieldCheck, description: 'Central OTP templates, SMTP authentication & global DLT/WABA gateways' },
  { id: 'status', label: 'System Health & Server Logs', icon: Activity, description: 'Database performance, telephony metrics, system uptime & latency logs' },
  { id: 'automation', label: 'Automation & Webhook API', icon: Workflow, description: 'Platform API keys, external CRM webhooks & scheduled triggers' },
  { id: 'navigation', label: 'Page Navigation Rules', icon: Compass, description: 'Table column sizing defaults, page jumps & pagination rules' },
  { id: 'offline_rule', label: 'Offline Rules & Sync Policy', icon: WifiOff, description: 'Network disconnect policies, offline queue retention & local caching rules' },
  { id: 'public_users', label: 'Public User Management', icon: Users, description: 'External candidate applicants, job portal registrations & public user controls' }
];

export default function ConfigMasterPanel({ initialTab = 'messages', activeSubTab = null, onSubTabChange = null, userRole = 'admin' }) {
  const [activeTab, setActiveTab] = useState(() => {
    let raw = activeSubTab || initialTab || 'messages';
    if (raw === 'admin_messages') raw = 'messages';
    if (raw === 'offline-rule') raw = 'offline_rule';
    if (raw === 'public-users') raw = 'public_users';
    if (CONFIG_TABS.some(t => t.id === raw)) return raw;
    return 'messages';
  });

  useEffect(() => {
    if (activeSubTab && activeSubTab !== activeTab) {
      let canonical = activeSubTab === 'admin_messages' ? 'messages' : activeSubTab;
      if (canonical === 'offline-rule') canonical = 'offline_rule';
      if (canonical === 'public-users') canonical = 'public_users';
      if (CONFIG_TABS.some(t => t.id === canonical)) {
        setActiveTab(canonical);
      }
    }
  }, [activeSubTab]);

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    if (onSubTabChange) {
      onSubTabChange(tabId);
    } else if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `/config-master/${tabId}`);
    }
  };

  const currentTabObj = CONFIG_TABS.find(t => t.id === activeTab) || CONFIG_TABS[0];

  return (
    <div style={{ padding: '1.25rem', maxWidth: '1600px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
        borderRadius: '12px',
        padding: '1.25rem 1.75rem',
        marginBottom: '1.5rem',
        color: '#ffffff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        boxShadow: '0 4px 15px rgba(30, 27, 75, 0.25)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Sliders size={24} style={{ color: '#a5b4fc' }} />
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              Config Master Studio
            </h1>
            <span style={{
              fontSize: '0.65rem',
              fontWeight: 800,
              background: '#4f46e5',
              color: '#e0e7ff',
              padding: '2px 8px',
              borderRadius: '999px',
              border: '1px solid #818cf8',
              letterSpacing: '0.05em'
            }}>
              MASTER ADMIN ONLY
            </span>
          </div>
          <p style={{ color: '#c7d2fe', fontSize: '0.85rem', margin: '0.35rem 0 0 0' }}>
            {currentTabObj.description}
          </p>
        </div>
      </div>

      {/* Clean 4-Tab Navigation Bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-light, #e2e8f0)',
        marginBottom: '1.5rem',
        gap: '0.75rem',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        paddingBottom: '2px'
      }}>
        {CONFIG_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              type="button"
              style={{
                padding: '0.75rem 1.25rem',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: '0.92rem',
                fontWeight: isActive ? 700 : 500,
                borderBottom: isActive ? '3px solid #4f46e5' : '3px solid transparent',
                color: isActive ? '#4f46e5' : 'var(--text-secondary, #64748b)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={17} style={{ color: isActive ? '#4f46e5' : 'inherit' }} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div style={{ width: '100%' }}>
        {activeTab === 'messages' && <AdminMessageConfig />}
        {activeTab === 'status' && <SystemStatusHealth />}
        {activeTab === 'automation' && <AutomationAPI />}
        {activeTab === 'navigation' && <PageNavigationConfig />}
        {activeTab === 'offline_rule' && <OfflineRuleModule userRole={userRole} />}
        {activeTab === 'public_users' && <PublicUserManagement />}
      </div>
    </div>
  );
}
