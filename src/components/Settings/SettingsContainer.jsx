import React, { useState, useEffect, startTransition } from 'react';
import dynamic from 'next/dynamic';
import { INTEGRATION_PAGE, INTEGRATION_PAGE_IDS } from '@/config/integrationsConfig';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Building2, Settings2, Bell, Database, Target, FileType, Monitor, Package, Truck, AlertTriangle, Calendar } from 'lucide-react';

// Subcomponents
import BusinessProfile from './BusinessProfile';
import CRMConfig from './CRMConfig';
import NotificationsConfig from './NotificationsConfig';
import DataManagement from './DataManagement';
import TargetPerformance from './TargetPerformance';
import FileMedia from './FileMedia';
import ManageDepartments from './ManageDepartments';
import ActiveSessionsConfig from './ActiveSessionsConfig';
import ProductListConfig from './ProductListConfig';
import OrderPipelineConfig from './OrderPipelineConfig';
import ComplaintPipelineConfig from './ComplaintPipelineConfig';
import HolidaysConfig from './HolidaysConfig';
import { filterVisibleSubTabs } from '@/utils/permissionUtils';

const IntegrationsContainer = dynamic(() => import('./Integrations/IntegrationsContainer'), {
  loading: () => <div style={{ padding: '2rem' }}>Loading integrations…</div>,
});

const SETTINGS_TABS = [
  { id: 'business', label: 'Business Profile & Branches', icon: <Building2 size={18} /> },
  { id: 'products', label: 'Product List & Branches', icon: <Package size={18} /> },
  { id: 'order_pipeline', label: 'Order to Delivery Config', icon: <Truck size={18} /> },
  { id: 'complaints_config', label: 'Complaint Management Config', icon: <AlertTriangle size={18} /> },
  { id: 'crm', label: 'CRM & Lead Config', icon: <Settings2 size={18} /> },
  { id: 'notifications', label: 'Notifications & Alerts', icon: <Bell size={18} /> },
  { id: 'departments', label: 'Manage Departments', icon: <Building2 size={18} /> },
  { id: 'targets', label: 'Targets & Performance', icon: <Target size={18} /> },
  { id: 'sessions', label: 'Work & Session Rules', icon: <Monitor size={18} /> },
  { id: 'holidays', label: 'Holidays Calendar Config', icon: <Calendar size={18} /> },
  { id: 'data', label: 'Data Management', icon: <Database size={18} /> },
  { id: 'media', label: 'File & Media Settings', icon: <FileType size={18} /> },
  INTEGRATION_PAGE
];

export default function SettingsContainer({ 
  moduleAccess = {}, 
  userRole = '', 
  userCompany = '',
  isMasterAdmin = false,
  currentSubTab = 'business'
}) {
  const visibleTabs = filterVisibleSubTabs(moduleAccess, userRole, 'settings', SETTINGS_TABS);
  
  const resolveCurrentTab = () => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      const search = new URLSearchParams(window.location.search);
      if (path.startsWith('settings/')) {
        const sub = path.split('/')[1];
        if (INTEGRATION_PAGE_IDS.includes(sub)) return INTEGRATION_PAGE.id;
        if (['products', 'product-list', 'products-list'].includes(sub)) return 'products';
        if (['order-pipeline', 'order_pipeline', 'order-config', 'order_config'].includes(sub)) return 'order_pipeline';
        if (['complaints', 'complaint-config', 'complaint_config', 'complaints_config', 'complaint-pipeline'].includes(sub)) return 'complaints_config';
        if (['crm-config', 'crm_config'].includes(sub)) return 'crm';
        if (['business-profile', 'branches'].includes(sub)) return 'business';
        if (['alerts', 'notification'].includes(sub)) return 'notifications';
        if (['manage-departments', 'dept'].includes(sub)) return 'departments';
        if (['performance', 'target'].includes(sub)) return 'targets';
        if (['sessions', 'active-sessions', 'work-session', 'breaks', 'shift-monitoring'].includes(sub)) return 'sessions';
        if (['holidays', 'holiday-calendar', 'holiday_master', 'holiday'].includes(sub)) return 'holidays';
        if (['data-management'].includes(sub)) return 'data';
        if (['file-media', 'files'].includes(sub)) return 'media';
        if (sub) return sub;
      }
      const param = search.get('setting') || search.get('subtab') || search.get('tab');
      if (param) return INTEGRATION_PAGE_IDS.includes(param) ? INTEGRATION_PAGE.id : param;
    }
    return INTEGRATION_PAGE_IDS.includes(currentSubTab) ? INTEGRATION_PAGE.id : currentSubTab || 'business';
  };

  const [activeTab, setActiveTab] = useState(resolveCurrentTab);

  // Sync when currentSubTab prop changes from parent CRMContainer
  useEffect(() => {
    const target = INTEGRATION_PAGE_IDS.includes(currentSubTab) ? INTEGRATION_PAGE.id : currentSubTab;
    if (target && visibleTabs.some(t => t.id === target)) {
      startTransition(() => setActiveTab(target));
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
      const target = INTEGRATION_PAGE_IDS.includes(e.detail) ? INTEGRATION_PAGE.id : e.detail;
      if (target && visibleTabs.some(t => t.id === target)) {
        setActiveTab(target);
      }
    };
    window.addEventListener('setting_subtab_change', handleSubTabEvent);
    return () => window.removeEventListener('setting_subtab_change', handleSubTabEvent);
  }, [visibleTabs]);

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
        {activeTab === 'products' && <ProductListConfig userCompany={userCompany} />}
        {activeTab === 'order_pipeline' && <OrderPipelineConfig userCompany={userCompany} isMasterAdmin={isMasterAdmin} userRole={userRole} />}
        {activeTab === 'complaints_config' && <ComplaintPipelineConfig userCompany={userCompany} isMasterAdmin={isMasterAdmin} userRole={userRole} />}
        {activeTab === 'crm' && <CRMConfig userCompany={userCompany} />}
        {activeTab === 'notifications' && <NotificationsConfig />}
        {activeTab === 'departments' && <ManageDepartments />}
        {activeTab === 'targets' && <TargetPerformance />}
        {activeTab === 'sessions' && <ActiveSessionsConfig userCompany={userCompany} />}
        {activeTab === 'holidays' && <HolidaysConfig userCompany={userCompany} isMasterAdmin={isMasterAdmin} userRole={userRole} />}
        {activeTab === 'data' && <DataManagement />}
        {activeTab === 'media' && <FileMedia />}
        {activeTab === INTEGRATION_PAGE.id && visibleTabs.some(tab => tab.id === activeTab) && (
          <ErrorBoundary fallback={<div style={{ padding: '2rem' }}>Integrations could not be displayed. Other CRM pages remain available.</div>}>
            <IntegrationsContainer moduleAccess={moduleAccess} userRole={userRole} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
