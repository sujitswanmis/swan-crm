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

  const [activeTab, setActiveTab] = useState('business');

  // Sync with URL param after mount (prevents SSR hydration mismatch)
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('setting');
      if (param && visibleTabs.some(t => t.id === param)) {
        setActiveTab(param);
        return;
      }
    }
    if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs]);

  // Listen for external setting subtab changes (from main sidebar)
  React.useEffect(() => {
    const handleSubTabEvent = (e) => {
      if (e.detail && visibleTabs.some(t => t.id === e.detail)) {
        setActiveTab(e.detail);
      }
    };
    window.addEventListener('setting_subtab_change', handleSubTabEvent);
    return () => window.removeEventListener('setting_subtab_change', handleSubTabEvent);
  }, [visibleTabs]);

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
    window.dispatchEvent(new CustomEvent('setting_subtab_change', { detail: tabId }));
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
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      {/* Mobile Horizontal Scrollable Sub-Tabs Pill Bar */}
      <div className="mobile-subtabs-scroll">
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`mobile-subtab-pill ${isActive ? 'active' : ''}`}
            >
              <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Settings Content Area (Full Width) */}
      <div className="card" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', width: '100%', borderRadius: 0, border: 'none', boxShadow: 'none' }}>
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
  );
}
