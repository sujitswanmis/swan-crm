'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronDown, X, Clock, Check, CalendarRange } from 'lucide-react';

export function computeDateRange(preset, customStart = '', customEnd = '') {
  const fmt = (d) => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    } catch {
      return d.toISOString().split('T')[0];
    }
  };

  const now = new Date();
  const todayStr = fmt(now);

  if (preset === 'today') {
    return { startDate: todayStr, endDate: todayStr, label: 'Today', fullLabel: `Today (${todayStr})` };
  }
  
  if (preset === 'yesterday') {
    const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yestStr = fmt(yest);
    return { startDate: yestStr, endDate: yestStr, label: 'Yesterday', fullLabel: `Yesterday (${yestStr})` };
  }

  if (preset === 'this_week') {
    const d = new Date(now);
    const day = d.getDay(); // 0 is Sun, 1 is Mon
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    const monStr = fmt(monday);
    return { startDate: monStr, endDate: todayStr, label: 'This Week', fullLabel: `This Week (${monStr} → ${todayStr})` };
  }

  if (preset === 'last_week') {
    const d = new Date(now);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day - 7;
    const lastMonday = new Date(d);
    lastMonday.setDate(d.getDate() + diff);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    const lMonStr = fmt(lastMonday);
    const lSunStr = fmt(lastSunday);
    return { startDate: lMonStr, endDate: lSunStr, label: 'Last Week', fullLabel: `Last Week (${lMonStr} → ${lSunStr})` };
  }

  if (preset === 'this_month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const fStr = fmt(firstDay);
    return { startDate: fStr, endDate: todayStr, label: 'This Month', fullLabel: `This Month (${fStr} → ${todayStr})` };
  }

  if (preset === 'last_month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    const fStr = fmt(firstDay);
    const lStr = fmt(lastDay);
    return { startDate: fStr, endDate: lStr, label: 'Last Month', fullLabel: `Last Month (${fStr} → ${lStr})` };
  }

  if (preset === 'all') {
    return { startDate: '', endDate: '', label: 'All Time', fullLabel: 'All Time' };
  }

  if (preset === 'custom') {
    const s = customStart || todayStr;
    const e = customEnd || todayStr;
    const isSingle = s === e;
    return { 
      startDate: s, 
      endDate: e, 
      label: isSingle ? s : `${s} → ${e}`,
      fullLabel: isSingle ? s : `${s} → ${e}`
    };
  }

  return { startDate: todayStr, endDate: todayStr, label: 'Today', fullLabel: `Today (${todayStr})` };
}

export default function DateRangePicker({
  preset = 'today',
  startDate = '',
  endDate = '',
  onChange,
  allowAllTime = false,
  variant = 'default', // 'default' | 'glass' | 'compact'
  title = 'Select Date Range',
  style = {}
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [tempStart, setTempStart] = useState(startDate);
  const [tempEnd, setTempEnd] = useState(endDate);
  
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  // Sync temp dates when modal opens
  useEffect(() => {
    if (showModal) {
      const current = computeDateRange(preset, startDate, endDate);
      setTempStart(current.startDate || computeDateRange('today').startDate);
      setTempEnd(current.endDate || computeDateRange('today').endDate);
    }
  }, [showModal, preset, startDate, endDate]);

  const handleSelectPreset = (pId) => {
    if (pId === 'custom') {
      setShowDropdown(false);
      setShowModal(true);
      return;
    }

    const range = computeDateRange(pId);
    if (onChange) {
      onChange({
        preset: pId,
        startDate: range.startDate,
        endDate: range.endDate,
        label: range.label
      });
    }
    setShowDropdown(false);
  };

  const handleApplyCustom = () => {
    if (!tempStart || !tempEnd) {
      alert('Please select both Start Date and End Date');
      return;
    }
    if (tempStart > tempEnd) {
      alert('Start Date cannot be after End Date');
      return;
    }
    if (onChange) {
      onChange({
        preset: 'custom',
        startDate: tempStart,
        endDate: tempEnd,
        label: tempStart === tempEnd ? tempStart : `${tempStart} → ${tempEnd}`
      });
    }
    setShowModal(false);
  };

  // Button Display Label
  const getButtonLabel = () => {
    if (preset === 'all') return 'All Time';
    if (preset === 'today') return `Today (${startDate || computeDateRange('today').startDate})`;
    if (preset === 'yesterday') return `Yesterday (${startDate || computeDateRange('yesterday').startDate})`;
    if (preset === 'this_week') return `This Week (${startDate} → ${endDate})`;
    if (preset === 'last_week') return `Last Week (${startDate} → ${endDate})`;
    if (preset === 'this_month') return `This Month (${startDate} → ${endDate})`;
    if (preset === 'last_month') return `Last Month (${startDate} → ${endDate})`;
    if (preset === 'custom' || (!preset && startDate && endDate)) {
      return startDate === endDate ? startDate : `${startDate} → ${endDate}`;
    }
    return 'Select Date Range';
  };

  // Styles based on variant
  const isGlass = variant === 'glass';
  const buttonStyle = isGlass ? {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.45rem',
    padding: '0.5rem 0.9rem',
    borderRadius: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    border: '1px solid rgba(255, 255, 255, 0.35)',
    color: '#ffffff',
    fontSize: '0.86rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
    transition: 'all 0.15s ease',
    ...style
  } : {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.45rem',
    padding: '0.45rem 0.8rem',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-surface, #ffffff)',
    border: '1px solid var(--border-light, #cbd5e1)',
    color: 'var(--text-primary, #0f172a)',
    fontSize: '0.84rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    transition: 'all 0.15s ease',
    ...style
  };

  const presetList = [
    ...(allowAllTime ? [{ id: 'all', label: 'All Time', sub: 'Complete history' }] : []),
    { id: 'today', label: 'Today', sub: computeDateRange('today').startDate },
    { id: 'yesterday', label: 'Yesterday', sub: computeDateRange('yesterday').startDate },
    { id: 'this_week', label: 'This Week', sub: `${computeDateRange('this_week').startDate} → Today` },
    { id: 'last_week', label: 'Last Week', sub: `${computeDateRange('last_week').startDate} → ${computeDateRange('last_week').endDate}` },
    { id: 'this_month', label: 'This Month', sub: `${computeDateRange('this_month').startDate} → Today` },
    { id: 'last_month', label: 'Last Month', sub: `${computeDateRange('last_month').startDate} → ${computeDateRange('last_month').endDate}` }
  ];

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setShowDropdown(prev => !prev)}
        style={buttonStyle}
        title="Click to choose a date range"
      >
        <Calendar size={15} style={{ opacity: isGlass ? 0.9 : 0.7 }} />
        <span>{getButtonLabel()}</span>
        <ChevronDown size={14} style={{ opacity: 0.75, transform: showDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {/* 📋 Step 1: Dropdown List of Presets */}
      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          zIndex: 99999,
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e2e8f0',
          width: '260px',
          overflow: 'hidden',
          padding: '0.4rem',
          animation: 'fadeIn 0.15s ease-out'
        }}>
          <div style={{ padding: '0.4rem 0.6rem 0.3rem', fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Quick Date Presets
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {presetList.map(p => {
              const isSelected = preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: isSelected ? '#eef2ff' : 'transparent',
                    color: isSelected ? '#4338ca' : '#1e293b',
                    fontSize: '0.84rem',
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.1s'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {isSelected && <Check size={14} color="#4338ca" strokeWidth={3} />}
                      <span>{p.label}</span>
                    </div>
                    {p.sub && (
                      <div style={{ fontSize: '0.72rem', color: isSelected ? '#6366f1' : '#94a3b8', marginLeft: isSelected ? '1.25rem' : 0 }}>
                        {p.sub}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '0.35rem 0' }} />

          {/* 🗓️ Custom Date Range Option (Triggers Popup Modal) */}
          <button
            type="button"
            onClick={() => handleSelectPreset('custom')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.6rem 0.65rem',
              borderRadius: '8px',
              border: preset === 'custom' ? '1px solid #c7d2fe' : 'none',
              backgroundColor: preset === 'custom' ? '#eef2ff' : 'transparent',
              color: preset === 'custom' ? '#4338ca' : '#334155',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.1s'
            }}
            onMouseEnter={(e) => {
              if (preset !== 'custom') e.currentTarget.style.backgroundColor = '#f1f5f9';
            }}
            onMouseLeave={(e) => {
              if (preset !== 'custom') e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <CalendarRange size={16} color="#4338ca" />
              <span>Custom Date Range...</span>
            </div>
            <span style={{ fontSize: '0.72rem', color: '#64748b', backgroundColor: '#f1f5f9', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
              Popup ↗
            </span>
          </button>
        </div>
      )}

      {/* 🗓️ Step 2: Custom Date Range Popup Modal (Only opens when Custom Range is clicked) */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            width: '100%',
            maxWidth: '440px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            animation: 'scaleIn 0.2s ease-out'
          }}>
            {/* Header */}
            <div style={{
              padding: '1.15rem 1.4rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(135deg, #4338ca 0%, #312e81 100%)',
              color: '#ffffff'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Calendar size={20} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>{title}</h3>
                  <div style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: '0.15rem' }}>
                    Select custom start & end dates
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', opacity: 0.85, padding: '0.2rem' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.4rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              {/* Custom Date Pickers */}
              <div style={{ padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
                  🗓️ Select Date Range
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: '0.3rem' }}>
                      Start Date (From)
                    </span>
                    <input
                      type="date"
                      value={tempStart}
                      onChange={(e) => setTempStart(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.65rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: '0.3rem' }}>
                      End Date (To)
                    </span>
                    <input
                      type="date"
                      value={tempEnd}
                      onChange={(e) => setTempEnd(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.65rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '0.6rem 1.1rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#64748b',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyCustom}
                  style={{
                    padding: '0.6rem 1.5rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#4338ca',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(67, 56, 202, 0.3)'
                  }}
                >
                  Apply Date Range
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

