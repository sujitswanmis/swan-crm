import React, { useState, useEffect } from 'react';
import { MessageSquare, LayoutDashboard, Settings, Smartphone, Shield, TestTube, FileText } from 'lucide-react';
import { filterVisibleSubTabs, checkIsAdminRole } from '@/utils/permissionUtils';

// Subcomponents (to be implemented)
import Dashboard from './Dashboard';
import InstanceManagement from './InstanceManagement';
import UserAuthorization from './UserAuthorization';
import LiveChat from './LiveChat';
import WhatsAppTemplates from './WhatsAppTemplates';
import TestMessage from './TestMessage';
import MessageLogs from './MessageLogs';
import GatewaySettings from './GatewaySettings';

const MODULE_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'templates', label: 'Message Templates', icon: <FileText size={18} /> },
  { id: 'instances', label: 'Instance Management', icon: <Smartphone size={18} /> },
  { id: 'settings', label: 'API & BSP Setup', icon: <Settings size={18} /> },
  { id: 'auth', label: 'User Authorization', icon: <Shield size={18} /> },
  { id: 'test', label: 'Test Message', icon: <TestTube size={18} /> },
  { id: 'logs', label: 'Message Logs', icon: <MessageSquare size={18} /> },
];

export default function WhatsappUnofficialModule({ 
  userRole, 
  userId, 
  moduleAccess = {}, 
  isAdmin: propIsAdmin,
  isMasterAdmin = false,
  tenantId = null
}) {
  const isAdmin = propIsAdmin !== undefined ? propIsAdmin : (checkIsAdminRole ? checkIsAdminRole(userRole) : false);
  const visibleTabs = filterVisibleSubTabs(moduleAccess, userRole, 'whatsapp_unofficial', MODULE_TABS);

  const [activeTab, setActiveTab] = useState(() => visibleTabs[0]?.id || 'dashboard');

  // Ensure active tab stays valid and sync URL param on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('wa_tab');
      if (param && visibleTabs.some(t => t.id === param)) {
        setActiveTab(param);
        return;
      }
    }
    if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  // Listen for browser back/forward navigation
  React.useEffect(() => {
    const handlePopState = () => {
      const param = new URLSearchParams(window.location.search).get('wa_tab');
      if (param && param !== activeTab && visibleTabs.some(t => t.id === param)) setActiveTab(param);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab, visibleTabs]);

  const handleTabChange = (tabId) => {
    if (!visibleTabs.some(t => t.id === tabId)) return;
    setActiveTab(tabId);
    const params = new URLSearchParams(window.location.search);
    params.set('wa_tab', tabId);
    window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  if (visibleTabs.length === 0) {
    return (
      <div className="card" style={{ padding: '3rem', margin: '2rem auto', maxWidth: '600px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <h3 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Access Denied</h3>
        <p>You do not have permission to view any sub-pages under WhatsApp UnOfficial.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem', padding: '0.75rem 1rem', backgroundColor: 'var(--bg-default)', overflow: 'hidden' }}>
      
      {/* Horizontal Tabs Bar */}
      <div className="card" style={{ 
        padding: '0.4rem 0.6rem', 
        borderRadius: '10px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflowX: 'auto', flex: 1, paddingBottom: '2px' }}>
          {visibleTabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? 'var(--accent-color)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-primary)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.85rem',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--th-filtered-bg)';
                }}
                onMouseOut={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ color: isActive ? '#ffffff' : 'var(--accent-color)', display: 'flex', alignItems: 'center' }}>
                  {tab.icon}
                </div>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Module Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {activeTab === 'dashboard' && <Dashboard userId={userId} isAdmin={isAdmin} />}
        {(activeTab === 'templates' || activeTab === 'live_chat') && (
          <WhatsAppTemplates userId={userId} isAdmin={isAdmin} />
        )}
        {activeTab === 'instances' && (
          <InstanceManagement 
            userId={userId} 
            onNavigateToSettings={() => handleTabChange('settings')} 
          />
        )}
        {activeTab === 'settings' && (
          <GatewaySettings 
            isAdmin={isAdmin} 
            isMasterAdmin={isMasterAdmin}
            tenantId={tenantId}
            onNavigateToInstances={() => handleTabChange('instances')} 
          />
        )}
        {activeTab === 'auth' && <UserAuthorization />}
        {activeTab === 'test' && <TestMessage onNavigateToLiveChat={() => handleTabChange('templates')} />}
        {activeTab === 'logs' && <MessageLogs userId={userId} isAdmin={isAdmin} />}
      </div>

    </div>
  );
}
