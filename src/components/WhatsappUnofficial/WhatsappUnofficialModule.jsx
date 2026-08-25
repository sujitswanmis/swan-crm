import React, { useState, useEffect } from 'react';
import { MessageSquare, LayoutDashboard, Settings, Smartphone, Shield, TestTube, FileText } from 'lucide-react';
import { filterVisibleSubTabs } from '@/utils/permissionUtils';

// Subcomponents (to be implemented)
import Dashboard from './Dashboard';
import InstanceManagement from './InstanceManagement';
import UserAuthorization from './UserAuthorization';
import LiveChat from './LiveChat';
import TestMessage from './TestMessage';
import MessageLogs from './MessageLogs';

const MODULE_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'live_chat', label: 'Live Chat Inbox', icon: <MessageSquare size={18} /> },
  { id: 'instances', label: 'Instance Management', icon: <Smartphone size={18} /> },
  { id: 'auth', label: 'User Authorization', icon: <Shield size={18} /> },
  { id: 'test', label: 'Test Message', icon: <TestTube size={18} /> },
  { id: 'logs', label: 'Message Logs', icon: <FileText size={18} /> },
];

export default function WhatsappUnofficialModule({ userRole, userId, moduleAccess = {} }) {
  const visibleTabs = filterVisibleSubTabs(moduleAccess, userRole, 'whatsapp_unofficial', MODULE_TABS);

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('wa_tab');
      if (param && visibleTabs.some(t => t.id === param)) return param;
    }
    return visibleTabs[0]?.id || 'dashboard';
  });

  // Ensure active tab stays valid
  useEffect(() => {
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
    <div style={{ display: 'flex', height: '100%', gap: '1.5rem', padding: '1rem', backgroundColor: 'var(--bg-default)' }}>
      
      {/* Module Sidebar */}
      <div className="card" style={{ width: '250px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-light)', background: 'var(--th-filtered-bg)' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MessageSquare size={18} color="var(--accent-color)" />
            WhatsApp Module
          </h2>
        </div>
        
        <div style={{ padding: '0.75rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 1rem', width: '100%', textAlign: 'left',
                border: 'none', borderRadius: '8px', cursor: 'pointer',
                background: activeTab === tab.id ? 'var(--accent-color)' : 'transparent',
                color: activeTab === tab.id ? 'white' : 'var(--text-primary)',
                fontWeight: activeTab === tab.id ? 600 : 400,
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                if (activeTab !== tab.id) e.currentTarget.style.background = 'var(--th-filtered-bg)';
              }}
              onMouseOut={(e) => {
                if (activeTab !== tab.id) e.currentTarget.style.background = 'transparent';
              }}
            >
              <div style={{ color: activeTab === tab.id ? 'white' : 'var(--accent-color)' }}>
                {tab.icon}
              </div>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Module Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeTab === 'dashboard' && <Dashboard userId={userId} isAdmin={isAdmin} />}
        {activeTab === 'live_chat' && <LiveChat userId={userId} isAdmin={isAdmin} />}
        {activeTab === 'instances' && <InstanceManagement userId={userId} />}
        {activeTab === 'auth' && <UserAuthorization />}
        {activeTab === 'test' && <TestMessage />}
        {activeTab === 'logs' && <MessageLogs userId={userId} isAdmin={isAdmin} />}
      </div>

    </div>
  );
}
