import React, { useState } from 'react';

export const DEFAULT_DEPARTMENTS = [
  "Accounts & Finance", "Administration", "Audit", "Dispatch", "Director",
  "Corporate Strategy and Planning", "Electrical & Maintenance", "Human Resource",
  "Human Resource & Administration", "Information Technology", "Logistics",
  "Manufacturing Engineering", "Marketing", "Operations", "Production",
  "Purchase", "Quality Assurance", "Research & Development", "Sales",
  "Sales & Marketing", "Service", "Store", "Tool Room", "Training and Development",
  "Transport", "Security", "Production Planning and Control", "Vendor Development"
];

export const LEAD_STAGES = [
  'lead_dashboard', 'hourly_work', '01 - New Stage', '02 - Contact Stage', '03 - Qualification Stage', 
  '04 - Follow Up Stage', '05 - Sales Process Stage', '06 - Conversion Stage', '07 - Final Stage', '08 - Transfer to Party'
];

export const DESIGNATIONS = [
  'Recruiter', 'Senior Recruiter', 'HR Manager', 'HR Executive',
  'Sales Manager', 'Sales Executive', 'Sales Officer',
  'Purchase Manager', 'Purchase Executive',
  'Operations Manager', 'Team Lead', 'Supervisor',
  'Director', 'General Manager', 'Assistant Manager',
  'IT Manager', 'System Administrator', 'Data Analyst',
  'Accountant', 'Finance Manager', 'Other'
];

export const WORK_LOCATION_TYPES = [
  'Primary',
  'Secondary',
  'Regional',
  'Territorial',
  'Field-Based',
  'Headquarters',
  'Hybrid',
  'Temporary',
  'Group-Level',
  'National',
  'Global',
  'National/Global'
];

export const EMP_STATUS_OPTIONS = [
  'Active',
  'InActive',
  'Hold',
  'Resigned',
  'Terminated',
  'Draft',
  'Trash'
];

export const isMasterAdmin = (u) => {
  if (!u) return false;
  const email = (u.email || '').toLowerCase().trim();
  return (
    email === 'supujacreations@gmail.com' ||
    u.emp_id === 'MasterAdmin' ||
    u.emp_designation === 'Master Admin' ||
    u.module_access?.is_master_admin === true
  );
};

export function formatISTDate(dateInput) {
  if (!dateInput) return '-';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(d);
  } catch {
    return '-';
  }
}

export function formatISTDateTime(dateInput) {
  if (!dateInput) return '-';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d);
  } catch {
    return '-';
  }
}

export function getStatusBadgeStyle(status) {
  const s = (status || 'Active').toLowerCase();
  switch (s) {
    case 'active':
      return {
        bg: '#ecfdf5',
        color: '#059669',
        border: '#a7f3d0',
        label: 'Active',
        dot: '#10b981'
      };
    case 'inactive':
      return {
        bg: '#fef2f2',
        color: '#dc2626',
        border: '#fecaca',
        label: 'InActive',
        dot: '#ef4444'
      };
    case 'hold':
      return {
        bg: '#fffbeb',
        color: '#d97706',
        border: '#fde68a',
        label: 'On Hold',
        dot: '#f59e0b'
      };
    case 'resigned':
      return {
        bg: '#f5f3ff',
        color: '#7c3aed',
        border: '#ddd6fe',
        label: 'Resigned',
        dot: '#8b5cf6'
      };
    case 'terminated':
      return {
        bg: '#450a0a',
        color: '#f87171',
        border: '#7f1d1d',
        label: 'Terminated',
        dot: '#ef4444'
      };
    case 'draft':
      return {
        bg: '#f8fafc',
        color: '#64748b',
        border: '#cbd5e1',
        label: 'Draft',
        dot: '#94a3b8'
      };
    case 'trash':
      return {
        bg: '#334155',
        color: '#f1f5f9',
        border: '#475569',
        label: 'Trash',
        dot: '#cbd5e1'
      };
    default:
      return {
        bg: '#f1f5f9',
        color: '#475569',
        border: '#e2e8f0',
        label: status || 'Unknown',
        dot: '#64748b'
      };
  }
}

export function HoverIconButton({ icon: Icon, label, bg, color, borderColor, hoverBg, onClick, disabled = false, size = 16 }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          backgroundColor: disabled ? '#f1f5f9' : hovered ? (hoverBg || bg) : (bg || 'var(--bg-surface)'),
          color: disabled ? '#94a3b8' : (color || 'var(--text-primary)'),
          border: `1px solid ${disabled ? '#e2e8f0' : (borderColor || 'var(--border-light)')}`,
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
          boxShadow: !disabled && hovered ? '0 3px 10px rgba(0, 0, 0, 0.12)' : 'none',
          padding: 0
        }}
      >
        <Icon size={size} />
      </button>

      {hovered && !disabled && label && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '6px',
          padding: '0.35rem 0.6rem',
          backgroundColor: '#0f172a',
          color: '#ffffff',
          fontSize: '0.72rem',
          fontWeight: 600,
          borderRadius: '6px',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.2)',
          zIndex: 100,
          pointerEvents: 'none'
        }}>
          {label}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            borderWidth: '4px',
            borderStyle: 'solid',
            borderColor: '#0f172a transparent transparent transparent'
          }} />
        </div>
      )}
    </div>
  );
}
