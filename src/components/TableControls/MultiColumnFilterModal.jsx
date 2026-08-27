'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Filter, ChevronDown, ChevronUp, X, RotateCcw, Search } from 'lucide-react';

// Columns that have predefined/categorical values where a select dropdown is helpful
const CATEGORICAL_COLUMNS = new Set([
  'status', 'priority', 'source', 'source_name', 'our_company',
  'state_name', 'district_name', 'city_name', 'business_type',
  'assigned_to', 'assigned_to_name', 'created_by', 'entry_by'
]);

export default function MultiColumnFilterModal({
  isOpen,
  onClose,
  columns = [], // Array of { key: string, label: string }
  filterRules = {}, // { [key]: { condition: 'contains'|'start_with'|'equal'|'not_equal', value: string } }
  conditionType = 'AND', // 'AND' | 'OR'
  onApply,
  onResetAll,
  getUniqueValues = null
}) {
  const [draftRules, setDraftRules] = useState(filterRules);
  const [draftConditionType, setDraftConditionType] = useState(conditionType);
  const [expandedColumn, setExpandedColumn] = useState(null);
  const [searchFieldTerm, setSearchFieldTerm] = useState('');
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const modalRef = useRef(null);

  // Sync state whenever opened
  useEffect(() => {
    if (isOpen) {
      setDraftRules(filterRules || {});
      setDraftConditionType(conditionType || 'AND');
      setSearchFieldTerm('');
      if (columns.length > 0) {
        setExpandedColumn(columns[0].key);
      }
    }
  }, [isOpen, filterRules, conditionType, columns]);

  // Outside click to close
  useEffect(() => {
    const handleOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleAccordion = (key) => {
    setExpandedColumn(prev => (prev === key ? null : key));
  };

  const handleRuleChange = (key, field, val) => {
    setDraftRules(prev => {
      const current = prev[key] || { condition: 'contains', value: '' };
      const updated = { ...current, [field]: val };
      if (!updated.value && field === 'value') {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }
      return { ...prev, [key]: updated };
    });
  };

  const handleResetSingle = (key) => {
    setDraftRules(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleResetAll = () => {
    setDraftRules({});
    if (onResetAll) {
      onResetAll();
    }
  };

  const handleApply = () => {
    const cleanRules = {};
    Object.keys(draftRules).forEach(key => {
      if (draftRules[key]?.value && String(draftRules[key].value).trim() !== '') {
        cleanRules[key] = {
          condition: draftRules[key].condition || 'contains',
          value: String(draftRules[key].value).trim()
        };
      }
    });

    if (onApply) {
      onApply(cleanRules, draftConditionType);
    }
    onClose();
  };

  const activeRulesCount = Object.keys(draftRules).filter(k => draftRules[k]?.value && String(draftRules[k].value).trim() !== '').length;

  const filteredColumns = columns.filter(col =>
    col.label.toLowerCase().includes(searchFieldTerm.toLowerCase()) ||
    col.key.toLowerCase().includes(searchFieldTerm.toLowerCase())
  );

  return (
    <div
      ref={modalRef}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: '6px',
        width: '320px',
        maxWidth: '90vw',
        maxHeight: 'min(540px, calc(100vh - 130px))',
        backgroundColor: 'var(--bg-surface, #ffffff)',
        border: '1px solid var(--border-light, #e2e8f0)',
        borderRadius: '10px',
        boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.2), 0 8px 16px -4px rgba(0, 0, 0, 0.1)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeInScale 0.15s ease-out'
      }}
    >
      {/* Header matching Image 2 */}
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border-light, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-surface, #ffffff)',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={16} color="#0284c7" />
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary, #1e293b)' }}>
            Filters
          </span>

          {/* OR / AND Toggle Switch */}
          <div
            style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
            onMouseEnter={() => setTooltipVisible(true)}
            onMouseLeave={() => setTooltipVisible(false)}
          >
            <button
              type="button"
              onClick={() => setDraftConditionType(prev => prev === 'AND' ? 'OR' : 'AND')}
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: draftConditionType === 'AND' ? '#0284c7' : '#cbd5e1',
                borderRadius: '20px',
                padding: '2px',
                width: '48px',
                height: '22px',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                position: 'relative'
              }}
              title="Toggle between AND / OR logic for all applied filters"
            >
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  transform: draftConditionType === 'AND' ? 'translateX(26px)' : 'translateX(0px)',
                  transition: 'transform 0.2s ease'
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: draftConditionType === 'AND' ? '#ffffff' : '#334155',
                  left: draftConditionType === 'AND' ? '5px' : '23px'
                }}
              >
                {draftConditionType}
              </span>
            </button>

            {/* Tooltip Box */}
            {tooltipVisible && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: '6px',
                  backgroundColor: '#1e293b',
                  color: '#ffffff',
                  borderRadius: '6px',
                  padding: '0.35rem 0.55rem',
                  fontSize: '0.7rem',
                  whiteSpace: 'normal',
                  width: '190px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  zIndex: 100000,
                  lineHeight: '1.3',
                  textAlign: 'center'
                }}
              >
                Turn on this toggle to apply <strong>OR / AND</strong> condition on applied filters
              </div>
            )}
          </div>
        </div>

        {/* Cancel and Apply Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#0284c7',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              padding: '0.2rem'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            style={{
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.3rem 0.8rem',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
              transition: 'background 0.15s'
            }}
            onMouseOver={e => e.currentTarget.style.backgroundColor = '#0369a1'}
            onMouseOut={e => e.currentTarget.style.backgroundColor = '#0284c7'}
          >
            Apply
          </button>
        </div>
      </div>

      {/* Field Search Bar */}
      <div style={{ padding: '0.4rem 0.75rem', borderBottom: '1px solid var(--border-light, #f1f5f9)', backgroundColor: 'var(--bg-primary, #f8fafc)', flexShrink: 0 }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={13} style={{ position: 'absolute', left: '8px', color: 'var(--text-secondary, #94a3b8)' }} />
          <input
            type="text"
            placeholder="Search filter fields..."
            value={searchFieldTerm}
            onChange={e => setSearchFieldTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.3rem 0.5rem 0.3rem 1.65rem',
              fontSize: '0.78rem',
              borderRadius: '5px',
              border: '1px solid var(--border-light, #cbd5e1)',
              background: 'var(--bg-surface, #ffffff)',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Accordion Columns List (Properly Constrained & Scrolling) */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.15rem 0',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {filteredColumns.map(col => {
          const isOpenCol = expandedColumn === col.key;
          const currentRule = draftRules[col.key] || { condition: 'contains', value: '' };
          const hasActiveFilter = Boolean(currentRule.value && String(currentRule.value).trim() !== '');
          const isCategorical = CATEGORICAL_COLUMNS.has(col.key);
          const isSelectMode = isCategorical && (currentRule.condition === 'equal' || currentRule.condition === 'not_equal');
          const uniqueOptions = isCategorical && getUniqueValues ? getUniqueValues(col.key).filter(Boolean) : [];

          return (
            <div
              key={col.key}
              style={{
                borderBottom: '1px solid var(--border-light, #f1f5f9)'
              }}
            >
              {/* Accordion Header */}
              <div
                onClick={() => toggleAccordion(col.key)}
                style={{
                  padding: '0.65rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  backgroundColor: hasActiveFilter ? '#f0f9ff' : 'transparent',
                  transition: 'background 0.12s'
                }}
                onMouseOver={e => {
                  if (!hasActiveFilter) e.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onMouseOut={e => {
                  if (!hasActiveFilter) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: hasActiveFilter ? 700 : 500,
                      color: hasActiveFilter ? '#0284c7' : '#1e293b'
                    }}
                  >
                    {col.label}
                  </span>
                  {hasActiveFilter && (
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: '#0284c7'
                      }}
                      title="Filter is active for this column"
                    />
                  )}
                </div>
                {isOpenCol ? <ChevronUp size={15} color="#64748b" /> : <ChevronDown size={15} color="#64748b" />}
              </div>

              {/* Accordion Body matching Image 2 */}
              {isOpenCol && (
                <div
                  style={{
                    padding: '0.6rem 1rem 0.85rem 1rem',
                    backgroundColor: '#ffffff',
                    borderTop: '1px solid #f8fafc'
                  }}
                >
                  {/* Condition Radio Buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.65rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`condition_${col.key}`}
                        checked={currentRule.condition === 'contains' || !currentRule.condition}
                        onChange={() => handleRuleChange(col.key, 'condition', 'contains')}
                        style={{ accentColor: '#0284c7', width: '0.95rem', height: '0.95rem' }}
                      />
                      <span>Contains</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`condition_${col.key}`}
                        checked={currentRule.condition === 'start_with'}
                        onChange={() => handleRuleChange(col.key, 'condition', 'start_with')}
                        style={{ accentColor: '#0284c7', width: '0.95rem', height: '0.95rem' }}
                      />
                      <span>Start With</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`condition_${col.key}`}
                        checked={currentRule.condition === 'equal'}
                        onChange={() => handleRuleChange(col.key, 'condition', 'equal')}
                        style={{ accentColor: '#0284c7', width: '0.95rem', height: '0.95rem' }}
                      />
                      <span>Equal</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`condition_${col.key}`}
                        checked={currentRule.condition === 'not_equal'}
                        onChange={() => handleRuleChange(col.key, 'condition', 'not_equal')}
                        style={{ accentColor: '#0284c7', width: '0.95rem', height: '0.95rem' }}
                      />
                      <span>Not Equal</span>
                    </label>
                  </div>

                  {/* Clean Input or Select (NO native datalist popup!) */}
                  <div style={{ position: 'relative', marginBottom: '0.45rem' }}>
                    {isSelectMode && uniqueOptions.length > 0 ? (
                      <select
                        value={currentRule.value || ''}
                        onChange={e => handleRuleChange(col.key, 'value', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.4rem 0.6rem',
                          fontSize: '0.8rem',
                          borderRadius: '5px',
                          border: '1px solid var(--border-light, #cbd5e1)',
                          background: '#ffffff',
                          color: currentRule.value ? '#1e293b' : '#94a3b8',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Please Select</option>
                        {uniqueOptions.map((uVal, idx) => (
                          <option key={idx} value={uVal} style={{ color: '#1e293b' }}>
                            {uVal}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="Search.."
                        value={currentRule.value || ''}
                        onChange={e => handleRuleChange(col.key, 'value', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.4rem 0.6rem',
                          fontSize: '0.8rem',
                          borderRadius: '5px',
                          border: '1px solid var(--border-light, #cbd5e1)',
                          background: '#ffffff',
                          outline: 'none'
                        }}
                      />
                    )}
                  </div>

                  {/* Reset Link for this column */}
                  <div>
                    <button
                      type="button"
                      onClick={() => handleResetSingle(col.key)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0284c7',
                        fontSize: '0.78rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredColumns.length === 0 && (
          <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
            No columns match "{searchFieldTerm}"
          </div>
        )}
      </div>

      {/* Global Reset Footer */}
      <div
        style={{
          padding: '0.5rem 0.85rem',
          borderTop: '1px solid var(--border-light, #e2e8f0)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-primary, #f8fafc)',
          flexShrink: 0
        }}
      >
        <button
          type="button"
          onClick={handleResetAll}
          style={{
            background: 'none',
            border: 'none',
            color: '#dc2626',
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem'
          }}
        >
          <RotateCcw size={12} /> Clear All Filters
        </button>

        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
          {activeRulesCount} active {activeRulesCount === 1 ? 'filter' : 'filters'}
        </span>
      </div>
    </div>
  );
}
