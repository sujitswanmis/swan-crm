'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar, Clock, Settings, Search, Filter, CheckCircle2,
  AlertCircle, RefreshCw, Edit3, Sparkles, Building2
} from 'lucide-react';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';
import { calculateNextDueDate } from '@/utils/orderFrequency';
import { upsertPartyOrderSchedule } from '@/app/actions/orderFulfillment';
import MaskedPhoneDisplay from '../common/MaskedPhoneDisplay';

const FREQUENCY_OPTIONS = [
  { id: 'DAILY', label: 'Daily (Every Working Day)', desc: 'Call every single day' },
  { id: 'WEEKLY', label: 'Weekly (Select Days)', desc: 'Call on specific days of week' },
  { id: 'HALF_MONTHLY', label: 'Half Month (Fortnightly)', desc: '1st & 16th of every month' },
  { id: 'MONTHLY', label: 'Monthly (Select Date)', desc: 'Specific date every month' },
  { id: 'QUARTERLY', label: 'Quarterly (Every 3 Months)', desc: 'Quarterly business review' },
  { id: 'HALF_YEARLY', label: 'Half Yearly (Every 6 Months)', desc: 'Bi-annual check' },
  { id: 'YEARLY', label: 'Yearly (Annual Review)', desc: 'Once a year' },
  { id: 'CUSTOM_DAYS', label: 'Custom Days Interval', desc: 'Every N days (e.g. 15, 45)' }
];

const WEEKDAY_OPTIONS = [
  { id: 'MON', label: 'Mon' },
  { id: 'TUE', label: 'Tue' },
  { id: 'WED', label: 'Wed' },
  { id: 'THU', label: 'Thu' },
  { id: 'FRI', label: 'Fri' },
  { id: 'SAT', label: 'Sat' },
  { id: 'SUN', label: 'Sun' }
];

export default function OrderFrequencyMasterTable({
  schedules = [],
  loading = false,
  onRefresh,
  tenantId
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('ALL');
  const [tierFilter, setTierFilter] = useState('ALL');
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Form State for editing frequency
  const [formState, setFormState] = useState({
    frequency_type: 'MONTHLY',
    weekly_days: ['MON'],
    monthly_date: 1,
    half_monthly_dates: [1, 16],
    custom_interval_days: 15,
    preferred_time_slot: 'ANYTIME',
    notes: ''
  });

  // Table Column Resizing
  const defaultCols = {
    code_tier: 170,
    firm_contact: 260,
    location: 170,
    frequency: 210,
    next_due: 170,
    actions: 140
  };
  const { columnWidths, startResize, resetWidths } = useTableColumnResize('order_frequency_table_widths', defaultCols);

  const openEditModal = (schedule) => {
    setEditingSchedule(schedule);
    setSaveSuccessMsg('');
    let rawWeekly = schedule.weekly_days;
    if (typeof rawWeekly === 'string') {
      try { rawWeekly = JSON.parse(rawWeekly); } catch (_) { rawWeekly = ['MON']; }
    }
    if (!Array.isArray(rawWeekly) || rawWeekly.length === 0) rawWeekly = ['MON'];

    setFormState({
      frequency_type: schedule.frequency_type || 'MONTHLY',
      weekly_days: rawWeekly,
      monthly_date: Number(schedule.monthly_date) || 1,
      half_monthly_dates: schedule.half_monthly_dates || [1, 16],
      custom_interval_days: Number(schedule.custom_interval_days) || 15,
      preferred_time_slot: schedule.preferred_time_slot || 'ANYTIME',
      notes: schedule.notes || ''
    });
  };

  // Live preview of next calculated due date
  const calculatedNextDuePreview = useMemo(() => {
    try {
      return calculateNextDueDate(formState);
    } catch (_) {
      return 'N/A';
    }
  }, [formState]);

  const toggleWeekday = (dayId) => {
    setFormState(prev => {
      const exists = prev.weekly_days.includes(dayId);
      const nextDays = exists
        ? prev.weekly_days.filter(d => d !== dayId)
        : [...prev.weekly_days, dayId];
      return { ...prev, weekly_days: nextDays.length > 0 ? nextDays : ['MON'] };
    });
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    if (!editingSchedule) return;
    setSaving(true);
    try {
      const res = await upsertPartyOrderSchedule({
        party_id: editingSchedule.party_id,
        ...formState,
        next_due_date: calculatedNextDuePreview
      }, tenantId);

      if (res.success) {
        setSaveSuccessMsg('Frequency rule updated successfully!');
        if (onRefresh) onRefresh();
        setTimeout(() => {
          setEditingSchedule(null);
          setSaveSuccessMsg('');
        }, 800);
      } else {
        alert('Failed to save rule: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error updating schedule: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Filtered schedules
  const filteredSchedules = useMemo(() => {
    return schedules.filter(item => {
      const p = item.party;
      if (!p) return false;

      if (frequencyFilter !== 'ALL' && item.frequency_type !== frequencyFilter) return false;
      if (tierFilter !== 'ALL' && p.party_type !== tierFilter) return false;

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase().trim();
      const code = (p.distributor_code || p.dealer_code || p.party_universal_code || '').toLowerCase();
      const firm = (p.firm_name || '').toLowerCase();
      const person = (p.owner_name || p.contact_person_name_1 || '').toLowerCase();
      const city = (p.district_name || '').toLowerCase();
      const state = (p.state_name || '').toLowerCase();

      return code.includes(term) || firm.includes(term) || person.includes(term) || city.includes(term) || state.includes(term);
    });
  }, [schedules, frequencyFilter, tierFilter, searchTerm]);

  return (
    <div>
      {/* Top Filter and Search Bar */}
      <div style={{
        background: 'var(--bg-surface)',
        padding: '0.85rem 1rem',
        borderRadius: '10px',
        marginBottom: '1rem',
        border: '1px solid var(--border-light)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: '1 1 300px', maxWidth: '420px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search Partner Code, Firm Name, Location..."
              style={{
                width: '100%',
                padding: '0.5rem 0.65rem 0.5rem 2.2rem',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.84rem'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <select
            value={frequencyFilter}
            onChange={e => setFrequencyFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.82rem'
            }}
          >
            <option value="ALL">All Frequencies</option>
            {FREQUENCY_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>

          <select
            value={tierFilter}
            onChange={e => setTierFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.82rem'
            }}
          >
            <option value="ALL">All Partner Tiers</option>
            <option value="Distributor">👑 Distributor</option>
            <option value="Dealer">🏬 Dealer</option>
            <option value="Sub-Dealer">🤝 Sub-Dealer</option>
          </select>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            style={{
              padding: '0.5rem 0.85rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.82rem'
            }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Frequency Master Table with Column Resizers */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: '12px',
        border: '1px solid var(--border-light)',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                <th style={{ width: `${columnWidths.code_tier}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Code &amp; Tier
                  <ColumnResizer onMouseDown={e => startResize('code_tier', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.firm_contact}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Firm &amp; Contact
                  <ColumnResizer onMouseDown={e => startResize('firm_contact', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.location}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Location
                  <ColumnResizer onMouseDown={e => startResize('location', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.frequency}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Calling Frequency Rule
                  <ColumnResizer onMouseDown={e => startResize('frequency', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.next_due}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Next Due (IST)
                  <ColumnResizer onMouseDown={e => startResize('next_due', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.actions}px`, padding: '0.85rem 1rem', textAlign: 'center', position: 'relative' }}>
                  Action
                  <ColumnResizer onMouseDown={e => startResize('actions', e)} onDoubleClick={() => resetWidths()} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedules.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No channel partners found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                filteredSchedules.map(item => {
                  const p = item.party;
                  const isDist = p.party_type === 'Distributor';
                  const isDealer = p.party_type === 'Dealer';
                  const phone = p.contact_mobile_1_1 || p.primary_mobile;

                  const freqLabel = FREQUENCY_OPTIONS.find(f => f.id === item.frequency_type)?.label || item.frequency_type;

                  let freqDetails = '';
                  if (item.frequency_type === 'WEEKLY') {
                    const days = Array.isArray(item.weekly_days) ? item.weekly_days.join(', ') : item.weekly_days;
                    freqDetails = `Days: ${days}`;
                  } else if (item.frequency_type === 'MONTHLY') {
                    freqDetails = `Date: ${item.monthly_date}th of month`;
                  } else if (item.frequency_type === 'HALF_MONTHLY') {
                    freqDetails = '1st & 16th of month';
                  } else if (item.frequency_type === 'CUSTOM_DAYS') {
                    freqDetails = `Every ${item.custom_interval_days} days`;
                  }

                  return (
                    <tr key={item.party_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 800, color: isDist ? '#38bdf8' : isDealer ? '#34d399' : '#fbbf24', fontSize: '0.9rem' }}>
                          {p.distributor_code || p.dealer_code || p.party_universal_code}
                        </div>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.12rem 0.45rem',
                          borderRadius: '4px',
                          marginTop: '0.2rem',
                          background: isDist ? 'rgba(56,189,248,0.2)' : isDealer ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                          color: isDist ? '#38bdf8' : isDealer ? '#34d399' : '#fbbf24'
                        }}>
                          {p.party_type}
                        </span>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                          {p.firm_name}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span>{p.owner_name || p.contact_person_name_1 || 'Principal'}</span>
                          <span>•</span>
                          <MaskedPhoneDisplay phone={phone} size="sm" />
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                        <div style={{ fontWeight: 600 }}>{p.district_name || 'District'}</div>
                        <div style={{ color: 'var(--text-secondary)' }}>{p.state_name || 'State'}</div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.6rem',
                            borderRadius: '6px',
                            background: 'rgba(59,130,246,0.15)',
                            color: '#60a5fa'
                          }}>
                            {freqLabel.split('(')[0].trim()}
                          </span>
                        </div>
                        {freqDetails && (
                          <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                            {freqDetails}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          <Calendar size={14} color="#38bdf8" />
                          <span>{item.next_due_date || 'Not Set'}</span>
                        </div>
                        {item.last_followup_at && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                            Last Call: {item.last_followup_at.slice(0, 10)}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          style={{
                            padding: '0.4rem 0.8rem',
                            background: 'rgba(59,130,246,0.15)',
                            border: '1px solid rgba(59,130,246,0.3)',
                            color: '#60a5fa',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <Edit3 size={13} />
                          Set Rule
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Frequency Configuration Modal */}
      {editingSchedule && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '540px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1.2rem 1.5rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'linear-gradient(135deg, rgba(37,99,235,0.1) 0%, transparent 100%)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Set Order Calling Frequency
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSchedule(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} style={{ padding: '1.5rem' }}>
              {/* Partner Quick Summary */}
              <div style={{
                background: 'var(--bg-primary)',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                marginBottom: '1.25rem'
              }}>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                  {editingSchedule.party?.firm_name}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  {editingSchedule.party?.party_universal_code} • {editingSchedule.party?.district_name}, {editingSchedule.party?.state_name}
                </div>
              </div>

              {/* Frequency Selector */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  Recurrence Frequency *
                </label>
                <select
                  value={formState.frequency_type}
                  onChange={e => setFormState({ ...formState, frequency_type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '0.88rem',
                    fontWeight: 600
                  }}
                >
                  {FREQUENCY_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Weekly Day Selector */}
              {formState.frequency_type === 'WEEKLY' && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                    Select Calling Days of the Week:
                  </label>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    {WEEKDAY_OPTIONS.map(day => {
                      const isSelected = formState.weekly_days.includes(day.id);
                      return (
                        <button
                          key={day.id}
                          type="button"
                          onClick={() => toggleWeekday(day.id)}
                          style={{
                            padding: '0.45rem 0.85rem',
                            borderRadius: '8px',
                            border: isSelected ? '1px solid #3b82f6' : '1px solid var(--border-light)',
                            background: isSelected ? '#2563eb' : 'var(--bg-primary)',
                            color: isSelected ? '#fff' : 'var(--text-secondary)',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                          }}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Monthly Date Selector */}
              {formState.frequency_type === 'MONTHLY' && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                    Monthly Calling Date (Day of Month: 1 to 31):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={formState.monthly_date}
                    onChange={e => setFormState({ ...formState, monthly_date: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '0.88rem'
                    }}
                  />
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                    Every month on the {formState.monthly_date}th date, a follow-up will be scheduled.
                  </div>
                </div>
              )}

              {/* Half-Month Info */}
              {formState.frequency_type === 'HALF_MONTHLY' && (
                <div style={{
                  padding: '0.75rem 1rem',
                  background: 'rgba(59,130,246,0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(59,130,246,0.25)',
                  marginBottom: '1.25rem',
                  fontSize: '0.8rem',
                  color: '#93c5fd'
                }}>
                  📅 Fortnightly schedule: Calls will automatically trigger on the <strong>1st</strong> and <strong>16th</strong> of every month.
                </div>
              )}

              {/* Custom Interval Days */}
              {formState.frequency_type === 'CUSTOM_DAYS' && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                    Call Interval in Days (e.g. 10, 20, 45):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={formState.custom_interval_days}
                    onChange={e => setFormState({ ...formState, custom_interval_days: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '0.88rem'
                    }}
                  />
                </div>
              )}

              {/* Live Preview Box */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(5,150,105,0.05) 100%)',
                padding: '0.85rem 1rem',
                borderRadius: '10px',
                border: '1px solid rgba(16,185,129,0.3)',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase' }}>
                    Calculated Next Due Date (IST)
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#34d399', marginTop: '0.15rem' }}>
                    {calculatedNextDuePreview}
                  </div>
                </div>
                <div style={{ fontSize: '1.5rem' }}>🔁</div>
              </div>

              {saveSuccessMsg && (
                <div style={{ padding: '0.6rem 1rem', background: 'rgba(16,185,129,0.2)', border: '1px solid #10b981', color: '#34d399', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.84rem' }}>
                  ✓ {saveSuccessMsg}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setEditingSchedule(null)}
                  style={{
                    padding: '0.6rem 1.2rem',
                    background: 'transparent',
                    border: '1px solid var(--border-light)',
                    color: 'var(--text-secondary)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.84rem'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '0.6rem 1.4rem',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontSize: '0.84rem'
                  }}
                >
                  {saving ? 'Saving Rule...' : 'Save Recurrence Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
