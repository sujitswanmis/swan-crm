'use client';

import React from 'react';
import { Smartphone, Check, X } from 'lucide-react';
import { PLATFORM_ACCESS_OPTIONS } from '@/utils/permissionUtils';

/**
 * Normalizes an optional platforms map ({ web, windows, android, ios }) into explicit booleans.
 * Missing or undefined flags default to true for backward compatibility.
 */
export function resolveNormalizedPlatforms(platformsMap = null, parentPlatformsMap = null) {
  const result = {};
  for (const opt of PLATFORM_ACCESS_OPTIONS) {
    const parentAllowed = !parentPlatformsMap || parentPlatformsMap[opt.key] !== false;
    const selfAllowed = !platformsMap || platformsMap[opt.key] !== false;
    result[opt.key] = parentAllowed && selfAllowed;
  }
  return result;
}

/**
 * Checks whether any platform has been explicitly disabled.
 */
export function hasPlatformRestrictions(platformsMap = null) {
  if (!platformsMap || typeof platformsMap !== 'object') return false;
  return PLATFORM_ACCESS_OPTIONS.some(opt => platformsMap[opt.key] === false);
}

/**
 * Toggles a single platform key inside an optional platforms map.
 * Returns null if all 4 platforms are enabled (keeps JSON clean & backward compatible).
 */
export function togglePlatformKeyInMap(existingMap = null, platformKey) {
  const normalized = resolveNormalizedPlatforms(existingMap);
  normalized[platformKey] = !normalized[platformKey];
  return hasPlatformRestrictions(normalized) ? normalized : null;
}

/**
 * Cleans an optional platforms map for persistence: returns undefined when all 4 are allowed.
 */
export function cleanPlatformsForSave(existingMap = null) {
  if (!hasPlatformRestrictions(existingMap)) return undefined;
  return resolveNormalizedPlatforms(existingMap);
}

/**
 * Layer 1: User / Role Global Login Device Allowance Bar.
 */
export function AllowedPlatformsBar({ allowedPlatforms = null, onTogglePlatform, onAllowAll }) {
  const normalized = resolveNormalizedPlatforms(allowedPlatforms);
  const restrictedCount = PLATFORM_ACCESS_OPTIONS.filter(opt => !normalized[opt.key]).length;

  return (
    <div
      style={{
        flexShrink: 0,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          padding: '0.7rem 1.25rem',
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Smartphone size={16} style={{ color: '#2563eb' }} />
          Allowed Login Devices / Platforms (Layer 1)
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '0.12rem 0.5rem',
              borderRadius: '999px',
              background: restrictedCount === 0 ? '#dcfce7' : '#fef3c7',
              color: restrictedCount === 0 ? '#166534' : '#92400e',
              border: `1px solid ${restrictedCount === 0 ? '#86efac' : '#fcd34d'}`
            }}
          >
            {restrictedCount === 0 ? 'All 4 Platforms Allowed' : `${4 - restrictedCount}/4 Enabled`}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            Uncheck a device to block CRM login from that platform
          </span>
          {restrictedCount > 0 && typeof onAllowAll === 'function' && (
            <button
              type="button"
              onClick={onAllowAll}
              style={{
                padding: '0.2rem 0.55rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                borderRadius: '5px',
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
                color: '#1d4ed8',
                cursor: 'pointer'
              }}
            >
              Allow All Devices
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          padding: '0.85rem 1rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
          gap: '0.65rem'
        }}
      >
        {PLATFORM_ACCESS_OPTIONS.map(opt => {
          const isChecked = normalized[opt.key];
          return (
            <label
              key={opt.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
                padding: '0.55rem 0.8rem',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: isChecked ? opt.color : '#fecaca',
                background: isChecked ? `${opt.color}10` : '#fff1f2',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                userSelect: 'none'
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onTogglePlatform(opt.key)}
                style={{
                  width: '1.05rem',
                  height: '1.05rem',
                  accentColor: opt.color,
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              />
              <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>{opt.emoji}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isChecked ? 'var(--text-primary)' : '#991b1b' }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: '0.69rem', color: isChecked ? opt.color : '#dc2626', fontWeight: 600 }}>
                  {isChecked ? 'Login Allowed' : 'Blocked on this Device'}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Layer 2: Compact 4-Platform Toggle Pills rendered inside the Matrix table cell.
 */
export function PlatformRowPills({
  platforms = null,
  parentPlatforms = null,
  disabled = false,
  onToggle
}) {
  const effective = resolveNormalizedPlatforms(platforms, parentPlatforms);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        flexWrap: 'nowrap',
        opacity: disabled ? 0.45 : 1
      }}
    >
      {PLATFORM_ACCESS_OPTIONS.map(opt => {
        const parentBlocked = parentPlatforms && parentPlatforms[opt.key] === false;
        const allowed = effective[opt.key];
        const pillDisabled = disabled || parentBlocked;

        return (
          <button
            key={opt.key}
            type="button"
            disabled={pillDisabled}
            onClick={() => !pillDisabled && onToggle(opt.key)}
            title={
              parentBlocked
                ? `${opt.label}: Blocked at parent module level`
                : `${opt.label}: ${allowed ? 'Enabled (click to hide on this platform)' : 'Hidden (click to allow on this platform)'}`
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              padding: '2px 6px',
              borderRadius: '5px',
              fontSize: '0.68rem',
              fontWeight: 700,
              lineHeight: 1.35,
              border: '1px solid',
              borderColor: allowed ? `${opt.color}66` : '#cbd5e1',
              background: allowed ? `${opt.color}14` : '#f1f5f9',
              color: allowed ? opt.color : '#94a3b8',
              textDecoration: allowed ? 'none' : 'line-through',
              cursor: pillDisabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.12s ease',
              whiteSpace: 'nowrap'
            }}
          >
            <span>{opt.shortLabel}</span>
            {allowed ? <Check size={9} strokeWidth={3} /> : <X size={9} strokeWidth={2.5} />}
          </button>
        );
      })}
    </div>
  );
}
