import React, { useState, useEffect } from 'react';
import { Building2, Settings2, FormInput, Bell, Database, Target, FileType, MessageSquare, Monitor } from 'lucide-react';

// Subcomponents
import BusinessProfile from './BusinessProfile';
import CRMConfig from './CRMConfig';
import CustomFields from './CustomFields';
import WorkspaceMessageTemplates from './WorkspaceMessageTemplates';
import NotificationsConfig from './NotificationsConfig';
import DataManagement from './DataManagement';
import TargetPerformance from './TargetPerformance';
import FileMedia from './FileMedia';
import ManageDepartments from './ManageDepartments';
import ActiveSessionsConfig from './ActiveSessionsConfig';
import { filterVisibleSubTabs } from '@/utils/permissionUtils';

const SETTINGS_TABS = [
  { id: 'business', label: 'Business Profile & Branches', icon: <Building2 size={18} /> },
  { id: 'crm', label: 'CRM & Lead Config', icon: <Settings2 size={18} /> },
  { id: 'fields', label: 'Custom Fields', icon: <FormInput size={18} /> },
  { id: 'templates', label: 'Message & WhatsApp Templates', icon: <MessageSquare size={18} /> },
  { id: 'notifications', label: 'Notifications & Alerts', icon: <Bell size={18} /> },
  { id: 'departments', label: 'Manage Departments', icon: <Building2 size={18} /> },
  { id: 'targets', label: 'Targets & Performance', icon: <Target size={18} /> },
  { id: 'sessions', label: 'Work & Session Rules', icon: <Monitor size={18} /> },
  { id: 'data', label: 'Data Management', icon: <Database size={18} /> },
  { id: 'media', label: 'File & Media Settings', icon: <FileType size={18} /> }
];

export default function SettingsContainer({ 
  moduleAccess = {}, 
  userRole = '', 
  userCompany = '',
  isMasterAdmin = false,
  currentSubTab = 'business',
  onSubTabChange = null
}) {
  const visibleTabs = filterVisibleSubTabs(moduleAccess, userRole, 'settings', SETTINGS_TABS);
  
  const resolveCurrentTab = () => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      const search = new URLSearchParams(window.location.search);
      if (path.startsWith('settings/')) {
        const sub = path.split('/')[1];
        if (['crm-config', 'crm_config'].includes(sub)) return 'crm';
        if (['custom-fields', 'custom_fields'].includes(sub)) return 'fields';
        if (['business-profile', 'branches'].includes(sub)) return 'business';
        if (['message-templates', 'whatsapp-templates'].includes(sub)) return 'templates';
        if (['alerts', 'notification'].includes(sub)) return 'notifications';
        if (['manage-departments', 'dept'].includes(sub)) return 'departments';
        if (['performance', 'target'].includes(sub)) return 'targets';
        if (['sessions', 'active-sessions', 'work-session', 'breaks', 'shift-monitoring'].includes(sub)) return 'sessions';
        if (['data-management'].includes(sub)) return 'data';
        if (['file-media', 'files'].includes(sub)) return 'media';
        if (sub) return sub;
      }
      const param = search.get('setting') || search.get('subtab') || search.get('tab');
      if (param) return param;
    }
    return currentSubTab || 'business';
  };

  const [activeTab, setActiveTab] = useState(resolveCurrentTab);

  // Sync when currentSubTab prop changes from parent CRMContainer
  useEffect(() => {
    if (currentSubTab && visibleTabs.some(t => t.id === currentSubTab)) {
      setActiveTab(currentSubTab);
    }
  }, [currentSubTab, visibleTabs]);

  // Sync with URL route after mount and on popstate (browser back/forward)
  useEffect(() => {
    const syncFromUrl = () => {
      const target = resolveCurrentTab();
      if (target && visibleTabs.some(t => t.id === target)) {
        setActiveTab(target);
      } else if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
        setActiveTab(visibleTabs[0].id);
      }
    };

    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [visibleTabs]);

  // Listen for external setting subtab changes (e.g. from main sidebar or custom events)
  useEffect(() => {
    const handleSubTabEvent = (e) => {
      if (e.detail && visibleTabs.some(t => t.id === e.detail)) {
        setActiveTab(e.detail);
      }
    };
    window.addEventListener('setting_subtab_change', handleSubTabEvent);
    return () => window.removeEventListener('setting_subtab_change', handleSubTabEvent);
  }, [visibleTabs]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (onSubTabChange) {
      onSubTabChange(tabId);
    } else {
      window.history.pushState(null, '', `/settings/${tabId}`);
      window.dispatchEvent(new CustomEvent('setting_subtab_change', { detail: tabId }));
    }
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
      {/* Settings Content Area (Full Clean Width) */}
      <div className="card" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', width: '100%', borderRadius: 0, border: 'none', boxShadow: 'none' }}>
        {activeTab === 'business' && <BusinessProfile userCompany={userCompany} />}
        {activeTab === 'crm' && <CRMConfig userCompany={userCompany} />}
        {activeTab === 'fields' && <CustomFields />}
        {activeTab === 'templates' && <WorkspaceMessageTemplates userCompany={userCompany} />}
        {activeTab === 'notifications' && <NotificationsConfig />}
        {activeTab === 'departments' && <ManageDepartments />}
        {activeTab === 'targets' && <TargetPerformance />}
        {activeTab === 'sessions' && <ActiveSessionsConfig userCompany={userCompany} />}
        {activeTab === 'data' && <DataManagement />}
        {activeTab === 'media' && <FileMedia />}
      </div>
    </div>
  );
}
