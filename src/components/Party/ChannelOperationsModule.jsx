'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Phone, Star, Calendar, AlertTriangle, RefreshCw, Truck, Clock, Settings, Package
} from 'lucide-react';
import { getPartyList } from '@/app/actions/partyMaster';
import {
  getPartyOrderSchedules,
  getDailyOrderFollowupQueue,
  getOrderPipelineList,
  getDeliveredOrdersPendingFeedback
} from '@/app/actions/orderFulfillment';

import DailyFollowupQueueTable from '../Orders/DailyFollowupQueueTable';
import OrderFrequencyMasterTable from '../Orders/OrderFrequencyMasterTable';
import OrderDeliveryPipeline from '../Orders/OrderDeliveryPipeline';
import PostDeliveryFeedbackTable from '../Orders/PostDeliveryFeedbackTable';
import MonthlyHealthCheckModule from '../Orders/MonthlyHealthCheckModule';
import ComplaintManagementModule from '../Orders/ComplaintManagementModule';

const OPERATIONS_TABS = [
  {
    id: 'frequency_rules',
    label: 'Order Frequency Master',
    icon: '⚙️',
    title: 'Order Frequency Master (Party-wise Rules)',
    subtitle: 'Party Master ke har distributor aur dealer ki repeat order frequency set karein (Daily, Weekly, Monthly, etc.)'
  },
  {
    id: 'order_followup',
    label: 'Order Desk Calling',
    icon: '📞',
    title: 'Order Desk Calling (Scheduled Partner Follow-up)',
    subtitle: 'Aaj due hone wale sabhi channel partners ki list — 1-click dial karein aur order punch karein'
  },
  {
    id: 'order_pipeline',
    label: 'Order to Delivery Pipeline',
    icon: '🚚',
    title: 'Order to Delivery Pipeline (End-to-End Tracking)',
    subtitle: 'Order Punch ➔ Confirmed ➔ Allocation ➔ Dispatched (LR & Bilty) ➔ Delivered (POD)'
  },
  {
    id: 'order_feedback',
    label: 'Post-Order Feedback',
    icon: '⭐',
    title: 'Post-Delivery Satisfaction Feedback',
    subtitle: 'Delivery complete hone par partner ka 5-star review aur shortage/damage inspection'
  },
  {
    id: 'monthly_feedback',
    label: 'Monthly Health Checks',
    icon: '📅',
    title: 'Monthly Partner Health Checks',
    subtitle: 'Inactivity tracking (>45 days dormancy alert) aur 5-dimension relationship audit'
  },
  {
    id: 'complaints',
    label: 'Complaint Management',
    icon: '⚠️',
    title: 'Complaint Management & SLA Tracking',
    subtitle: 'Plant QA, Logistics aur Accounts grievances ka resolution & verified closure'
  }
];

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export default function ChannelOperationsModule({
  initialSubTab = 'frequency_rules',
  activeSubTab,
  onSubTabChange,
  userRole,
  moduleAccess,
  userCompany,
  tenantId,
  userName,
  userId
}) {
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  // Active Tab State
  const [activeTab, setActiveTab] = useState(() => {
    const raw = (activeSubTab || initialSubTab || 'frequency_rules').toLowerCase();
    return OPERATIONS_TABS.some(t => t.id === raw) ? raw : 'frequency_rules';
  });

  useEffect(() => {
    if (activeSubTab && OPERATIONS_TABS.some(t => t.id === activeSubTab.toLowerCase())) {
      setActiveTab(activeSubTab.toLowerCase());
    }
  }, [activeSubTab]);

  const switchTab = (tabId) => {
    setActiveTab(tabId);
    if (onSubTabChange) {
      onSubTabChange(tabId);
    }
  };

  // Shared Data States
  const [parties, setParties] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [dailyQueue, setDailyQueue] = useState([]);
  const [pipelineOrders, setPipelineOrders] = useState([]);
  const [deliveredOrders, setDeliveredOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load Operations Data
  const loadOperationsData = useCallback(async () => {
    setLoading(true);
    try {
      const [partiesRes, schedulesRes, queueRes, pipelineRes, deliveredRes] = await Promise.all([
        getPartyList(effectiveTenantId),
        getPartyOrderSchedules(effectiveTenantId),
        getDailyOrderFollowupQueue(effectiveTenantId),
        getOrderPipelineList(effectiveTenantId),
        getDeliveredOrdersPendingFeedback(effectiveTenantId)
      ]);

      if (Array.isArray(partiesRes)) setParties(partiesRes);
      if (Array.isArray(schedulesRes)) setSchedules(schedulesRes);
      if (Array.isArray(queueRes)) setDailyQueue(queueRes);
      if (Array.isArray(pipelineRes)) setPipelineOrders(pipelineRes);
      if (Array.isArray(deliveredRes)) setDeliveredOrders(deliveredRes);
    } catch (err) {
      console.error('Error loading Channel Operations data:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveTenantId]);

  useEffect(() => {
    loadOperationsData();
  }, [loadOperationsData]);

  // Tab Badge Counts
  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

  const queueDueTodayCount = useMemo(() => {
    return dailyQueue.filter(q => q.next_due_date === todayStr).length;
  }, [dailyQueue, todayStr]);

  const activePipelineCount = useMemo(() => {
    return pipelineOrders.filter(o => o.delivery_status !== 'DELIVERED' && o.delivery_status !== 'CANCELLED').length;
  }, [pipelineOrders]);

  const pendingFeedbackCount = useMemo(() => {
    return deliveredOrders.filter(o => !o.isFeedbackRecorded).length;
  }, [deliveredOrders]);

  const currentTabMeta = useMemo(() => {
    return OPERATIONS_TABS.find(t => t.id === activeTab) || OPERATIONS_TABS[0];
  }, [activeTab]);

  return (
    <div style={{ padding: '0.5rem 0.5rem 1.5rem', color: 'var(--text-primary)', background: 'var(--bg-primary)', minHeight: '100%', width: '100%' }}>
      {/* Top Module Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(37,99,235,0.2) 0%, rgba(59,130,246,0.3) 100%)',
              border: '1px solid rgba(59,130,246,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem'
            }}>
              {currentTabMeta.icon}
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                {currentTabMeta.title}
              </h1>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                {currentTabMeta.subtitle}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={loadOperationsData}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.55rem 1rem',
            borderRadius: '8px',
            border: '1px solid var(--border-light)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            fontWeight: 600,
            fontSize: '0.84rem',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh Operations'}
        </button>
      </div>

      {/* Main Subpage Switcher Navigation Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.45rem',
        background: 'var(--bg-surface)',
        borderRadius: '12px',
        border: '1px solid var(--border-light)',
        marginBottom: '1rem',
        overflowX: 'auto',
        scrollbarWidth: 'thin',
        minHeight: '52px',
        boxSizing: 'border-box'
      }}>
        {OPERATIONS_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          let badgeCount = 0;
          if (tab.id === 'order_followup') badgeCount = queueDueTodayCount;
          if (tab.id === 'order_pipeline') badgeCount = activePipelineCount;
          if (tab.id === 'order_feedback') badgeCount = pendingFeedbackCount;

          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1.1rem',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-secondary)',
                fontWeight: isActive ? 700 : 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                height: '38px',
                lineHeight: 1
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {badgeCount > 0 && (
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  padding: '0.1rem 0.45rem',
                  borderRadius: '10px',
                  background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(59,130,246,0.15)',
                  color: isActive ? '#fff' : '#60a5fa'
                }}>
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content Display */}
      {activeTab === 'order_followup' && (
        <DailyFollowupQueueTable
          queue={dailyQueue}
          loading={loading}
          onRefresh={loadOperationsData}
          tenantId={effectiveTenantId}
          userCompany={userCompany}
          userName={userName}
          userId={userId}
        />
      )}

      {activeTab === 'frequency_rules' && (
        <OrderFrequencyMasterTable
          schedules={schedules}
          loading={loading}
          onRefresh={loadOperationsData}
          tenantId={effectiveTenantId}
        />
      )}

      {activeTab === 'order_pipeline' && (
        <OrderDeliveryPipeline
          orders={pipelineOrders}
          loading={loading}
          onRefresh={loadOperationsData}
          tenantId={effectiveTenantId}
        />
      )}

      {activeTab === 'order_feedback' && (
        <PostDeliveryFeedbackTable
          deliveredOrders={deliveredOrders}
          loading={loading}
          onRefresh={loadOperationsData}
          tenantId={effectiveTenantId}
        />
      )}

      {activeTab === 'monthly_feedback' && (
        <MonthlyHealthCheckModule
          tenantId={effectiveTenantId}
        />
      )}

      {activeTab === 'complaints' && (
        <ComplaintManagementModule
          tenantId={effectiveTenantId}
          parties={parties}
        />
      )}
    </div>
  );
}
