import React, { useState } from 'react';
import { Building2, Settings2, FormInput, Bell, Shield, Workflow, Lock, Database, Target, FileType, Monitor, Clock } from 'lucide-react';

// Subcomponents (to be implemented)
import BusinessProfile from './BusinessProfile';
import CRMConfig from './CRMConfig';
import CustomFields from './CustomFields';
import NotificationsConfig from './NotificationsConfig';
import RolesPermissions from './RolesPermissions';
import AutomationAPI from './AutomationAPI';
import ActiveSessionsConfig from './ActiveSessionsConfig';
import AuditLogsConfig from './AuditLogsConfig';
import DataManagement from './DataManagement';
import TargetPerformance from './TargetPerformance';
import FileMedia from './FileMedia';
import PageNavigationConfig from './PageNavigationConfig';
import ManageDepartments from './ManageDepartments';
import { filterVisibleSubTabs } from '@/utils/permissionUtils';

const SETTINGS_TABS = [
  { id: 'business', label: 'Business Profile', icon: <Building2 size={18} /> },
  { id: 'crm', label: 'CRM & Lead Config', icon: <Settings2 size={18} /> },
  { id: 'fields', label: 'Custom Fields', icon: <FormInput size={18} /> },
  { id: 'notifications', label: 'Notifications & Alerts', icon: <Bell size={18} /> },
  { id: 'roles', label: 'Roles & Permissions', icon: <Shield size={18} /> },
  { id: 'automation', label: 'Automation & API', icon: <Workflow size={18} /> },
  { id: 'sessions', label: 'Monitor Sessions', icon: <Monitor size={18} /> },
  { id: 'audit', label: 'Activity Audit Logs', icon: <Clock size={18} /> },
  { id: 'data', label: 'Data Management', icon: <Database size={18} /> },
  { id: 'targets', label: 'Targets & Performance', icon: <Target size={18} /> },
  { id: 'media', label: 'File & Media Settings', icon: <FileType size={18} /> },
  { id: 'navigation', label: 'Page Navigation', icon: <Database size={18} /> },
  { id: 'departments', label: 'Manage Departments', icon: <Building2 size={18} /> }
];

export default function SettingsContainer({ moduleAccess = {}, userRole = '' }) {
  const visibleTabs = filterVisibleSubTabs(moduleAccess, userRole, 'settings', SETTINGS_TABS);

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('setting');
      if (param && visibleTabs.some(t => t.id === param)) return param;
    }
    return visibleTabs[0]?.id || 'business';
  });

  // Ensure active tab stays valid if permissions change
  React.useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  // Listen for browser back/forward navigation
  React.useEffect(() => {
    const handlePopState = () => {
      const param = new URLSearchParams(window.location.search).get('setting');
      if (param && param !== activeTab && visibleTabs.some(t => t.id === param)) setActiveTab(param);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab, visibleTabs]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    const params = new URLSearchParams(window.location.search);
    params.set('setting', tabId);
    window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  if (visibleTabs.length === 0) {
    return (
      <div className="card" style={{ padding: '3rem', margin: '2rem auto', maxWidth: '600px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <h3 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Access Denied</h3>
        <p>You do not have permission to view any settings pages.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: '1.5rem', padding: '1rem' }}>
      
      {/* Settings Sidebar */}
      <div className="card" style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-light)', background: 'var(--th-filtered-bg)' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Settings Menu</h2>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Manage your enterprise configuration</p>
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

      {/* Settings Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="card" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'business' && <BusinessProfile />}
          {activeTab === 'crm' && <CRMConfig />}
          {activeTab === 'fields' && <CustomFields />}
          {activeTab === 'notifications' && <NotificationsConfig />}
          {activeTab === 'roles' && <RolesPermissions />}
          {activeTab === 'automation' && <AutomationAPI />}
          {activeTab === 'sessions' && <ActiveSessionsConfig />}
          {activeTab === 'audit' && <AuditLogsConfig />}
          {activeTab === 'data' && <DataManagement />}
          {activeTab === 'targets' && <TargetPerformance />}
          {activeTab === 'media' && <FileMedia />}
          {activeTab === 'navigation' && <PageNavigationConfig />}
          {activeTab === 'departments' && <ManageDepartments />}
        </div>
      </div>

    </div>
  );
}
