'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList
} from 'recharts';
import { getDashboardMetrics } from '@/app/actions/analytics';
import { Activity, Loader2 } from 'lucide-react';
import DateRangePicker, { computeDateRange } from '@/components/common/DateRangePicker';

const COLORS = [
  'var(--chart-1, #3b82f6)',
  'var(--chart-2, #10b981)',
  'var(--chart-3, #f59e0b)',
  'var(--chart-4, #8b5cf6)',
  'var(--chart-5, #ec4899)',
  'var(--chart-6, #06b6d4)',
  'var(--chart-7, #f97316)'
];

export default function AnalyticsDashboard({ leads, teamMembers = [] }) {
  const [datePreset, setDatePreset] = useState('today');
  const [startDate, setStartDate] = useState(() => computeDateRange('today').startDate);
  const [endDate, setEndDate] = useState(() => computeDateRange('today').endDate);
  const [selectedEmployee, setSelectedEmployee] = useState('All');
  const [metrics, setMetrics] = useState({ employeeActivity: [], whatsappStats: { period: 0, total: 0 } });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMetrics() {
      setLoading(true);
      const filteredLeads = selectedEmployee === 'All' 
        ? leads 
        : leads.filter(l => l.assigned_to === selectedEmployee);
        
      const leadIds = filteredLeads.map(l => l.id);
      if (leadIds.length > 0) {
        // Calculate employee activity LOCALLY with start & end timestamp bounds
        let startTimestamp = null;
        let endTimestamp = null;
        if (startDate) startTimestamp = new Date(`${startDate}T00:00:00.000Z`).getTime();
        if (endDate) endTimestamp = new Date(`${endDate}T23:59:59.999Z`).getTime();

        const employeeActivityMap = {};
        filteredLeads.forEach(lead => {
          (lead.lead_notes || []).forEach(note => {
            const noteTime = new Date(note.created_at).getTime();
            const afterStart = !startTimestamp || noteTime >= startTimestamp;
            const beforeEnd = !endTimestamp || noteTime <= endTimestamp;
            if (afterStart && beforeEnd) {
              let empIdOrEmail = note.created_by || 'System/Unknown';
              // If created by System or Agent, try to credit the assignee
              if (empIdOrEmail === 'System' || empIdOrEmail === 'Agent' || empIdOrEmail === 'System/Unknown') {
                 empIdOrEmail = lead.assigned_to || empIdOrEmail;
              }
              let empName = empIdOrEmail;
              
              if (teamMembers && teamMembers.length > 0) {
                 const tm = teamMembers.find(t => 
                   t.user_id === empIdOrEmail || 
                   t.email === empIdOrEmail || 
                   (t.email && t.email.split('@')[0] === empIdOrEmail) ||
                   t.emp_name === empIdOrEmail
                 );
                 if (tm && tm.emp_name) empName = tm.emp_name;
              }

              if (!employeeActivityMap[empName]) {
                 employeeActivityMap[empName] = { updates: 0, uniqueLeads: new Set() };
              }
              employeeActivityMap[empName].updates += 1;
              employeeActivityMap[empName].uniqueLeads.add(lead.id);
            }
          });
        });

        const localEmployeeActivity = Object.keys(employeeActivityMap).map(emp => ({
          employee: emp,
          actions: employeeActivityMap[emp].updates,
          uniqueLeads: employeeActivityMap[emp].uniqueLeads.size
        })).sort((a, b) => b.uniqueLeads - a.uniqueLeads); // Sort by unique leads

        const res = await getDashboardMetrics(leadIds, datePreset === 'today' ? 'Today' : (datePreset === 'this_week' || datePreset === 'last_week') ? 'Last 7 Days' : (datePreset === 'this_month' || datePreset === 'last_month') ? 'This Month' : 'All Time');
        if (res.success) {
          setMetrics({
            employeeActivity: localEmployeeActivity,
            whatsappStats: res.data.whatsappStats
          });
        }
      } else {
        setMetrics({ employeeActivity: [], whatsappStats: { period: 0, total: 0 } });
      }
      setLoading(false);
    }
    loadMetrics();
  }, [leads, startDate, endDate, datePreset, selectedEmployee, teamMembers]);

  // STAGES logic
  // Helper to map DB status to Team Management Stage format
  const getStageFromStatus = (status) => {
    if (!status) return '01 - New Stage';
    if (status.startsWith('1;')) return '01 - New Stage';
    if (status.startsWith('2;')) return '02 - Contact Stage';
    if (status.startsWith('3;')) return '03 - Qualification Stage';
    if (status.startsWith('4;')) return '04 - Follow Up Stage';
    if (status.startsWith('5;')) return '05 - Sales Process Stage';
    if (status.startsWith('6;')) return '06 - Conversion Stage';
    if (status.startsWith('7;')) return '07 - Final Stage';
    if (['New', 'Pending'].includes(status)) return '01 - New Stage';
    if (['Converted', 'Order Received', 'Closed', 'Won'].includes(status)) return '07 - Final Stage';
    return '01 - New Stage';
  };

  const filteredLeadsSync = selectedEmployee === 'All' ? leads : leads.filter(l => l.assigned_to === selectedEmployee);

  const stageCounts = filteredLeadsSync.reduce((acc, lead) => {
    const stage = getStageFromStatus(lead.status);
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});

  const stageData = Object.keys(stageCounts).sort().map(stage => ({
    name: stage.split('- ')[1] || stage,
    count: stageCounts[stage]
  }));

  // Aggregate Expected Revenue by Source
  const revenueBySource = filteredLeadsSync.reduce((acc, lead) => {
    if (lead.status !== 'Lost' && lead.deal_value) {
      acc[lead.source] = (acc[lead.source] || 0) + Number(lead.deal_value);
    }
    return acc;
  }, {});

  const revenueData = Object.keys(revenueBySource).map(source => ({
    name: source,
    value: revenueBySource[source]
  }));

  // Key Metrics
  const totalLeads = filteredLeadsSync.length;
  const wonLeads = filteredLeadsSync.filter(l => getStageFromStatus(l.status) === '07 - Final Stage' && (l.status.includes('Won') || l.status.includes('Converted') || l.status.includes('Closed'))).length;
  const rescheduledCount = filteredLeadsSync.filter(l => l.status && l.status.includes('ReSchedule')).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Header and Filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Performance & Activity</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <select 
            value={selectedEmployee} 
            onChange={(e) => setSelectedEmployee(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem', outline: 'none', cursor: 'pointer', maxWidth: '180px' }}
          >
            <option value="All">All Employees</option>
            {teamMembers.filter(m => m.emp_name).map(m => (
              <option key={m.user_id} value={m.user_id}>{m.emp_name}</option>
            ))}
          </select>
          <DateRangePicker
            preset={datePreset}
            startDate={startDate}
            endDate={endDate}
            allowAllTime={true}
            title="Select Performance Period"
            onChange={({ preset, startDate, endDate }) => {
              setDatePreset(preset);
              setStartDate(startDate);
              setEndDate(endDate);
            }}
          />
        </div>
      </div>

      {/* Top Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1.5rem' }}>
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--chart-1, #3b82f6)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Leads</h3>
          <p style={{ fontSize: '2rem', fontWeight: 700, margin: '0.5rem 0' }}>{totalLeads}</p>
        </div>
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--chart-2, #10b981)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Deals Won</h3>
          <p style={{ fontSize: '2rem', fontWeight: 700, margin: '0.5rem 0' }}>{wonLeads}</p>
        </div>
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--chart-3, #f59e0b)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Rescheduled Tasks</h3>
          <p style={{ fontSize: '2rem', fontWeight: 700, margin: '0.5rem 0' }}>{rescheduledCount}</p>
        </div>
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--chart-4, #8b5cf6)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>WhatsApp Sent ({dateFilter})</h3>
          <div style={{ fontSize: '2rem', fontWeight: 700, margin: '0.5rem 0', display: 'flex', alignItems: 'center' }}>
            {loading ? <Loader2 size={24} className="animate-spin" /> : metrics.whatsappStats.period}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Pipeline Funnel */}
        <div className="card" style={{ padding: '1.5rem', minHeight: '350px', gridColumn: '1 / -1' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.5rem' }}>Leads by Stage</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stageData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)' }} />
              <RechartsTooltip cursor={{fill: 'var(--bg-primary)'}} contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Bar dataKey="count" fill="var(--accent-color)" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="count" position="top" style={{ fill: 'var(--text-primary)', fontSize: 12, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Employee Activity Column */}
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', backgroundColor: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={18} style={{ color: 'var(--accent-color)' }} /> Employee Activity
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{dateFilter}</span>
          </div>
          <div style={{ padding: '1rem', minHeight: '300px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: 'var(--text-secondary)' }}>
                <Loader2 size={32} className="animate-spin" />
              </div>
            ) : metrics.employeeActivity.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                No activity recorded for {dateFilter.toLowerCase()}.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead style={{ backgroundColor: 'var(--th-bg)' }}>
                  <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
                    <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>Employee</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>Unique Leads</th>
                    <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>Updates</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.employeeActivity.map((act, i) => (
                    <tr key={act.employee} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: COLORS[i % COLORS.length], color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
                            {act.employee.substring(0, 2).toUpperCase()}
                          </div>
                          {act.employee}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {act.uniqueLeads}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 600, color: 'var(--accent-color)' }}>
                        {act.actions}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Revenue by Source */}
        <div className="card" style={{ padding: '1.5rem', minHeight: '350px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.5rem' }}>Potential Revenue by Source</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={revenueData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {revenueData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip formatter={(value) => `₹${value.toLocaleString('en-IN')}`} contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}
