'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Download, Columns, ChevronDown, Loader2, Edit2, FileText, Search, ChevronLeft, ChevronRight, Filter, Trash2, UserPlus, Check, X, Sliders, Sparkles, Settings, RotateCcw } from 'lucide-react';
import LeadProfilePanel from './LeadProfilePanel';
import ClientRegistration from './ClientRegistration';
import { logAuditAction } from '@/app/actions/audit';
import { PremiumProgressLoader } from './PremiumProgressLoader';
import { normalizeEmployeeName, normalizeStateName, normalizeDistrictName, normalizeCityName } from '@/utils/dataSanitizer';
import ColumnSelectorModal from './TableControls/ColumnSelectorModal';
import MultiColumnFilterModal from './TableControls/MultiColumnFilterModal';

export const EDITABLE_COLUMNS = [
  { key: 'state_name', label: 'State' },
  { key: 'district_name', label: 'District' },
  { key: 'city_name', label: 'City' },
  { key: 'tehsil_name', label: 'Tehsil' },
  { key: 'block_name', label: 'Block' },
  { key: 'pin_code', label: 'PIN Code' },
  { key: 'address', label: 'Full Address' },
  { key: 'status', label: 'Client Status' },
  { key: 'priority', label: 'Lead Priority Type' },
  { key: 'source', label: 'Lead Source' },
  { key: 'source_name', label: 'Source Name' },
  { key: 'our_company', label: 'Our Company Name' },
  { key: 'company', label: 'Business Name' },
  { key: 'business_type', label: 'Business Type' },
  { key: 'business_gst', label: 'Business GST' },
  { key: 'business_contact_1', label: 'Business Contact 1' },
  { key: 'business_contact_2', label: 'Business Contact 2' },
  { key: 'business_email_1', label: 'Business Email 1' },
  { key: 'name', label: 'CP1 Name' },
  { key: 'phone', label: 'CP1 Mobile 1' },
  { key: 'email', label: 'CP1 Email 1' },
  { key: 'requirement', label: 'Requirement' },
  { key: 'investment', label: 'Investment' },
  { key: 'buying_timeline', label: 'Buying Timeline' },
  { key: 'entry_by', label: 'Entry By' }
];

// Column Data Manager & Bulk Editor Modal Component
function ColumnDataManagerModal({
  isOpen,
  onClose,
  initialTab = 'bulk',
  leads = [],
  filteredLeads = [],
  selectedRows = [],
  teamMembers = [],
  supabase,
  onUpdateCompleted
}) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'bulk' | 'find_replace'
  const [selectedColumn, setSelectedColumn] = useState('state_name');
  
  // Bulk update state
  const [bulkScope, setBulkScope] = useState(selectedRows.length > 0 ? 'selected' : 'filtered');
  const [bulkNewValue, setBulkNewValue] = useState('');
  
  // Find & Replace state
  const [frScope, setFrScope] = useState('all');
  const [frFindText, setFrFindText] = useState('');
  const [frReplaceText, setFrReplaceText] = useState('');
  const [frExactMatch, setFrExactMatch] = useState(false);
  const [frMatchCase, setFrMatchCase] = useState(false);

  const [isExecuting, setIsExecuting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  useEffect(() => {
    setActiveTab(initialTab);
    if (selectedRows.length > 0) {
      setBulkScope('selected');
    } else {
      setBulkScope('filtered');
    }
  }, [initialTab, isOpen, selectedRows.length]);

  // Target leads based on scope for bulk update
  const getBulkTargetLeads = () => {
    if (bulkScope === 'selected') {
      return leads.filter(l => selectedRows.includes(l.id));
    }
    if (bulkScope === 'filtered') {
      return filteredLeads;
    }
    return leads;
  };

  // Target leads based on scope for find & replace
  const getFrTargetLeads = () => {
    if (frScope === 'selected') {
      return leads.filter(l => selectedRows.includes(l.id));
    }
    if (frScope === 'filtered') {
      return filteredLeads;
    }
    return leads;
  };

  // Live matching leads for Find & Replace
  const matchingFrLeads = useMemo(() => {
    const term = frFindText.trim();
    if (!term) return [];
    const pool = getFrTargetLeads();
    return pool.filter(lead => {
      const cellVal = String(lead[selectedColumn] || '');
      if (frExactMatch) {
        return frMatchCase ? cellVal === term : cellVal.toLowerCase() === term.toLowerCase();
      } else {
        return frMatchCase ? cellVal.includes(term) : cellVal.toLowerCase().includes(term.toLowerCase());
      }
    });
  }, [frFindText, selectedColumn, frScope, frExactMatch, frMatchCase, leads, filteredLeads, selectedRows]);

  const selectedColObj = EDITABLE_COLUMNS.find(c => c.key === selectedColumn) || EDITABLE_COLUMNS[0];

  // Handler for Bulk Column Update
  const handleExecuteBulkUpdate = async () => {
    const targets = getBulkTargetLeads();
    if (targets.length === 0) {
      alert('No leads found in selected scope to update.');
      return;
    }

    let cleanVal = bulkNewValue.trim();
    if (selectedColumn === 'state_name') cleanVal = normalizeStateName(cleanVal);
    if (selectedColumn === 'district_name') cleanVal = normalizeDistrictName(cleanVal);
    if (['city_name', 'tehsil_name', 'block_name'].includes(selectedColumn)) cleanVal = normalizeCityName(cleanVal);
    if (['entry_by', 'created_by'].includes(selectedColumn)) cleanVal = normalizeEmployeeName(cleanVal, teamMembers);

    if (!confirm(`Are you sure you want to update "${selectedColObj.label}" to "${cleanVal || '(Blank)'}" for ${targets.length} lead(s)?`)) {
      return;
    }

    try {
      setIsExecuting(true);
      setProgressMsg(`Updating ${targets.length} leads...`);
      const targetIds = targets.map(l => l.id);

      // Batch update in chunks of 500
      for (let i = 0; i < targetIds.length; i += 500) {
        const chunk = targetIds.slice(i, i + 500);
        const { error } = await supabase
          .from('leads')
          .update({ [selectedColumn]: cleanVal })
          .in('id', chunk);
        if (error) throw error;
      }

      await logAuditAction(
        'Bulk Column Update',
        `Bulk updated column "${selectedColObj.label}" to "${cleanVal}" on ${targets.length} lead(s)`
      );

      onUpdateCompleted(targetIds, selectedColumn, cleanVal);
      alert(`Successfully updated "${selectedColObj.label}" on ${targets.length} lead(s)!`);
      onClose();
    } catch (err) {
      console.error('Error executing bulk update:', err);
      alert('Failed to update: ' + err.message);
    } finally {
      setIsExecuting(false);
      setProgressMsg('');
    }
  };

  // Handler for Find & Replace
  const handleExecuteFindReplace = async () => {
    if (!frFindText.trim()) {
      alert('Please enter text to find.');
      return;
    }
    if (matchingFrLeads.length === 0) {
      alert('No matching leads found with current find criteria.');
      return;
    }

    if (!confirm(`Are you sure you want to replace "${frFindText}" with "${frReplaceText}" in column "${selectedColObj.label}" for ${matchingFrLeads.length} lead(s)?`)) {
      return;
    }

    try {
      setIsExecuting(true);
      setProgressMsg(`Replacing across ${matchingFrLeads.length} leads...`);

      // Prepare updates for each lead
      const updatesMap = {};
      matchingFrLeads.forEach(lead => {
        const oldVal = String(lead[selectedColumn] || '');
        let newVal = '';
        if (frExactMatch) {
          newVal = frReplaceText;
        } else {
          const regex = new RegExp(frFindText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), frMatchCase ? 'g' : 'gi');
          newVal = oldVal.replace(regex, frReplaceText);
        }

        if (selectedColumn === 'state_name') newVal = normalizeStateName(newVal);
        if (selectedColumn === 'district_name') newVal = normalizeDistrictName(newVal);
        if (['city_name', 'tehsil_name', 'block_name'].includes(selectedColumn)) newVal = normalizeCityName(newVal);
        if (['entry_by', 'created_by'].includes(selectedColumn)) newVal = normalizeEmployeeName(newVal, teamMembers);

        updatesMap[lead.id] = newVal;
      });

      // Execute updates
      const matchIds = Object.keys(updatesMap);
      for (const id of matchIds) {
        const newVal = updatesMap[id];
        const { error } = await supabase
          .from('leads')
          .update({ [selectedColumn]: newVal })
          .eq('id', id);
        if (error) throw error;
      }

      await logAuditAction(
        'Find and Replace',
        `Replaced "${frFindText}" with "${frReplaceText}" in column "${selectedColObj.label}" on ${matchIds.length} lead(s)`
      );

      onUpdateCompleted(matchIds, selectedColumn, null, updatesMap);
      alert(`Successfully replaced text in ${matchIds.length} lead(s)!`);
      onClose();
    } catch (err) {
      console.error('Error executing find & replace:', err);
      alert('Failed to execute find & replace: ' + err.message);
    } finally {
      setIsExecuting(false);
      setProgressMsg('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-container" style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(3px)', padding: '1rem' }}>
      <div style={{ backgroundColor: 'var(--bg-surface)', width: '100%', maxWidth: '620px', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 20px 40px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-primary)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sliders size={20} color="var(--accent-color)" /> Column Data Manager & Bulk Editor
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Bulk update or find-and-replace values across any column in this report.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-surface)' }}>
          <button
            onClick={() => setActiveTab('bulk')}
            style={{
              flex: 1,
              padding: '0.8rem',
              background: activeTab === 'bulk' ? 'var(--bg-surface)' : 'var(--bg-primary)',
              border: 'none',
              borderBottom: activeTab === 'bulk' ? '3px solid var(--accent-color)' : 'none',
              fontWeight: activeTab === 'bulk' ? 700 : 500,
              color: activeTab === 'bulk' ? 'var(--accent-color)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem'
            }}
          >
            <Edit2 size={16} /> Bulk Column Update
          </button>
          <button
            onClick={() => setActiveTab('find_replace')}
            style={{
              flex: 1,
              padding: '0.8rem',
              background: activeTab === 'find_replace' ? 'var(--bg-surface)' : 'var(--bg-primary)',
              border: 'none',
              borderBottom: activeTab === 'find_replace' ? '3px solid var(--accent-color)' : 'none',
              fontWeight: activeTab === 'find_replace' ? 700 : 500,
              color: activeTab === 'find_replace' ? 'var(--accent-color)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem'
            }}
          >
            <Search size={16} /> Find & Replace in Column
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', maxHeight: '65vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Target Column Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              1. Select Column to Modify:
            </label>
            <select
              value={selectedColumn}
              onChange={e => setSelectedColumn(e.target.value)}
              style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
            >
              {EDITABLE_COLUMNS.map(col => (
                <option key={col.key} value={col.key}>{col.label} ({col.key})</option>
              ))}
            </select>
          </div>

          {/* TAB 1: BULK UPDATE */}
          {activeTab === 'bulk' && (
            <>
              {/* Target Scope */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                  2. Apply Changes To:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                  {selectedRows.length > 0 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                      <input type="radio" name="bulkScope" value="selected" checked={bulkScope === 'selected'} onChange={() => setBulkScope('selected')} />
                      <span><strong>Selected Leads Only</strong> ({selectedRows.length} leads checked)</span>
                    </label>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input type="radio" name="bulkScope" value="filtered" checked={bulkScope === 'filtered'} onChange={() => setBulkScope('filtered')} />
                    <span><strong>Currently Filtered Leads</strong> ({filteredLeads.length} leads matching current filters)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input type="radio" name="bulkScope" value="all" checked={bulkScope === 'all'} onChange={() => setBulkScope('all')} />
                    <span><strong>All Leads in Report</strong> ({leads.length} total leads)</span>
                  </label>
                </div>
              </div>

              {/* New Value Input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                  3. Enter New Value for <em>{selectedColObj.label}</em>:
                </label>
                <input
                  type="text"
                  placeholder={`Enter new ${selectedColObj.label}...`}
                  value={bulkNewValue}
                  onChange={e => setBulkNewValue(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                />
              </div>

              {/* Summary Box */}
              <div style={{ padding: '0.75rem 1rem', background: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe', fontSize: '0.82rem', color: '#1e40af' }}>
                💡 <strong>Action Summary:</strong> Will update <strong>{getBulkTargetLeads().length}</strong> lead(s). Column <strong>{selectedColObj.label}</strong> will be set to <code>"{bulkNewValue || '(Blank)'}"</code>.
              </div>
            </>
          )}

          {/* TAB 2: FIND & REPLACE */}
          {activeTab === 'find_replace' && (
            <>
              {/* Target Scope */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                  2. Search Scope:
                </label>
                <div style={{ display: 'flex', gap: '1rem', background: 'var(--bg-primary)', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input type="radio" name="frScope" value="all" checked={frScope === 'all'} onChange={() => setFrScope('all')} />
                    <span>All Leads ({leads.length})</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input type="radio" name="frScope" value="filtered" checked={frScope === 'filtered'} onChange={() => setFrScope('filtered')} />
                    <span>Filtered ({filteredLeads.length})</span>
                  </label>
                  {selectedRows.length > 0 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                      <input type="radio" name="frScope" value="selected" checked={frScope === 'selected'} onChange={() => setFrScope('selected')} />
                      <span>Selected ({selectedRows.length})</span>
                    </label>
                  )}
                </div>
              </div>

              {/* Find Text */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                  3. Find Text in <em>{selectedColObj.label}</em>:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Jammu & Kashmir or old text..."
                  value={frFindText}
                  onChange={e => setFrFindText(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                />
              </div>

              {/* Replace With Text */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                  4. Replace With:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Jammu and Kashmir or new text..."
                  value={frReplaceText}
                  onChange={e => setFrReplaceText(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                />
              </div>

              {/* Matching Options */}
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={frExactMatch} onChange={e => setFrExactMatch(e.target.checked)} />
                  <span>Exact match only (entire cell)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={frMatchCase} onChange={e => setFrMatchCase(e.target.checked)} />
                  <span>Match case (case-sensitive)</span>
                </label>
              </div>

              {/* Live Preview Box */}
              <div style={{ padding: '0.75rem 1rem', background: matchingFrLeads.length > 0 ? '#f0fdf4' : '#fffbeb', borderRadius: '6px', border: matchingFrLeads.length > 0 ? '1px solid #bbf7d0' : '1px solid #fef3c7', fontSize: '0.85rem', color: matchingFrLeads.length > 0 ? '#15803d' : '#b45309' }}>
                {frFindText.trim() ? (
                  <span>
                    🔎 <strong>Preview:</strong> Found <strong>{matchingFrLeads.length}</strong> matching lead(s) containing <code>"{frFindText}"</code> in <strong>{selectedColObj.label}</strong>.
                  </span>
                ) : (
                  <span>Type text in "Find Text" above to see live matching results.</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', backgroundColor: 'var(--bg-primary)' }}>
          <button
            onClick={onClose}
            disabled={isExecuting}
            style={{ padding: '0.55rem 1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
          >
            Cancel
          </button>
          
          {activeTab === 'bulk' ? (
            <button
              onClick={handleExecuteBulkUpdate}
              disabled={isExecuting || getBulkTargetLeads().length === 0}
              style={{
                padding: '0.55rem 1.25rem',
                background: isExecuting || getBulkTargetLeads().length === 0 ? '#93c5fd' : 'var(--accent-color)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isExecuting || getBulkTargetLeads().length === 0 ? 'not-allowed' : 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {isExecuting ? <Loader2 size={16} className="animate-spin" /> : <Edit2 size={16} />}
              {progressMsg || `Apply Update (${getBulkTargetLeads().length} Leads)`}
            </button>
          ) : (
            <button
              onClick={handleExecuteFindReplace}
              disabled={isExecuting || matchingFrLeads.length === 0}
              style={{
                padding: '0.55rem 1.25rem',
                background: isExecuting || matchingFrLeads.length === 0 ? '#93c5fd' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isExecuting || matchingFrLeads.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {isExecuting ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {progressMsg || `Replace All (${matchingFrLeads.length} Matches)`}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// Searchable Employee Select Dropdown Component
function SearchableEmployeeSelect({ teamMembers = [], value, onChange, placeholder = "Select Employee..." }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const selectedMember = teamMembers.find(m => m.user_id === value || m.id === value);

  const filteredList = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return teamMembers;
    return teamMembers.filter(m => {
      const name = (m.emp_name || '').toLowerCase();
      const email = (m.email || '').toLowerCase();
      const dept = (m.emp_department || m.department || '').toLowerCase();
      const code = (m.emp_id || m.emp_code || '').toLowerCase();
      return name.includes(term) || email.includes(term) || dept.includes(term) || code.includes(term);
    });
  }, [teamMembers, searchTerm]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => {
          setIsOpen(prev => !prev);
          setSearchTerm('');
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.4rem 0.6rem',
          borderRadius: '4px',
          border: '1px solid var(--border-light)',
          background: 'var(--bg-surface)',
          color: value ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontSize: '0.85rem',
          fontWeight: value ? 600 : 400,
          cursor: 'pointer',
          minWidth: '160px',
          maxWidth: '220px',
          justifyContent: 'space-between',
          outline: 'none',
          boxShadow: isOpen ? '0 0 0 2px var(--accent-color)' : 'none'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedMember ? (selectedMember.emp_name || selectedMember.email) : placeholder}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 99999,
            width: '260px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.18)',
            padding: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem'
          }}
        >
          {/* Search Input */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: '8px', color: 'var(--text-secondary)' }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search employee..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.35rem 0.5rem 0.35rem 1.7rem',
                borderRadius: '4px',
                border: '1px solid var(--border-light)',
                fontSize: '0.8rem',
                outline: 'none',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          {/* Members List */}
          <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {filteredList.length === 0 ? (
              <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                No employee found
              </div>
            ) : (
              filteredList.map(member => {
                const memberId = member.user_id || member.id;
                const isSelected = memberId === value;
                return (
                  <div
                    key={memberId}
                    onClick={() => {
                      onChange(memberId);
                      setIsOpen(false);
                    }}
                    style={{
                      padding: '0.35rem 0.5rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: isSelected ? 'var(--accent-color)' : 'transparent',
                      color: isSelected ? '#fff' : 'var(--text-primary)',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--th-filtered-hover-bg)';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span style={{ fontWeight: isSelected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {member.emp_name || member.email}
                      </span>
                      {(member.emp_department || member.emp_id) && (
                        <span style={{ fontSize: '0.7rem', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[member.emp_id, member.emp_department].filter(Boolean).join(' • ')}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check size={14} style={{ marginLeft: '4px' }} />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const ALL_COLUMNS = [
  { key: 'lead_formatted_id', label: 'Lead ID' },
  { key: 'id', label: 'Lead DBID' },
  { key: 'created_at', label: 'Created At' },
  { key: 'lead_date', label: 'Lead Date' },
  { key: 'our_company', label: 'Our Company Name' },
  { key: 'source', label: 'Lead Source' },
  { key: 'source_name', label: 'Source Name' },
  { key: 'created_by', label: 'Created By' },
  { key: 'entry_by', label: 'Entry By' },
  { key: 'assigned_to_name', label: 'Assigned To' },
  { key: 'status', label: 'Client Status' },
  { key: 'priority', label: 'Lead Priority Type' },
  
  { key: 'company', label: 'Business Name' },
  { key: 'business_type', label: 'Business Type' },
  { key: 'business_gst', label: 'Business GST' },
  { key: 'business_contact_aio', label: 'Business Contact in AIO' },
  { key: 'business_email_aio', label: 'Business Mail in AIO' },
  { key: 'cp_name_aio', label: 'CP Name in AIO' },
  { key: 'cp_mobile_aio', label: 'CP Mobile in AIO' },
  { key: 'cp_email_aio', label: 'CP Mail in AIO' },
  { key: 'business_contact_1', label: 'Business Contact 1' },
  { key: 'business_contact_2', label: 'Business Contact 2' },
  { key: 'business_alt_1', label: 'Business Alt 1' },
  { key: 'business_alt_2', label: 'Business Alt 2' },
  { key: 'business_email_1', label: 'Business Email 1' },
  { key: 'business_email_2', label: 'Business Email 2' },
  { key: 'business_alt_email_1', label: 'Business Alt Email 1' },
  { key: 'business_alt_email_2', label: 'Business Alt Email 2' },
  
  { key: 'name', label: 'CP1 Name' },
  { key: 'phone', label: 'CP1 Mobile 1' },
  { key: 'cp1_mobile_2', label: 'CP1 Mobile 2' },
  { key: 'cp1_alt_1', label: 'CP1 Alt 1' },
  { key: 'cp1_alt_2', label: 'CP1 Alt 2' },
  { key: 'email', label: 'CP1 Email 1' },
  { key: 'cp1_email_2', label: 'CP1 Email 2' },

  { key: 'cp2_name', label: 'CP2 Name' },
  { key: 'cp2_mobile_1', label: 'CP2 Mobile 1' },
  { key: 'cp2_mobile_2', label: 'CP2 Mobile 2' },
  { key: 'cp2_alt_1', label: 'CP2 Alt 1' },
  { key: 'cp2_alt_2', label: 'CP2 Alt 2' },
  { key: 'cp2_email_1', label: 'CP2 Email 1' },
  { key: 'cp2_email_2', label: 'CP2 Email 2' },

  { key: 'cp3_name', label: 'CP3 Name' },
  { key: 'cp3_mobile_1', label: 'CP3 Mobile 1' },
  { key: 'cp3_mobile_2', label: 'CP3 Mobile 2' },
  { key: 'cp3_alt_1', label: 'CP3 Alt 1' },
  { key: 'cp3_alt_2', label: 'CP3 Alt 2' },
  { key: 'cp3_email_1', label: 'CP3 Email 1' },
  { key: 'cp3_email_2', label: 'CP3 Email 2' },

  { key: 'state_name', label: 'State' },
  { key: 'district_name', label: 'District' },
  { key: 'pin_code', label: 'PIN Code' },
  { key: 'city_name', label: 'City' },
  { key: 'tehsil_name', label: 'Tehsil' },
  { key: 'block_name', label: 'Block' },
  { key: 'address', label: 'Full Address' },

  { key: 'requirement', label: 'Requirement' },
  { key: 'investment', label: 'Investment' },
  { key: 'buying_timeline', label: 'Buying Timeline' }
];

export default function ClientReport({ 
  initialData = [], 
  teamMembers = [], 
  userName,
  userRole = '',
  moduleAccess = {},
  canImportExport = false,
  onLeadsChange 
}) {
  const supabase = createClient();
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
  const reportAccess = moduleAccess?.['report'] || {};
  const leadsAccess = moduleAccess?.['leads'] || {};

  // Delete permission: only admin or users with explicit delete = true or can_delete_leads power
  const canDelete = isAdmin || moduleAccess?.can_delete_leads === true || reportAccess?.delete === true || leadsAccess?.delete === true;

  // Assign permission: admin, managers, or users with explicit manager access or can_assign_leads power
  const canAssign = isAdmin || moduleAccess?.can_assign_leads === true || reportAccess?.is_manager === true || leadsAccess?.is_manager === true;

  // Export permission: admin or users with can_export_data power, canImportExport power, or report.export permission
  const canExport = isAdmin || moduleAccess?.can_export_data === true || canImportExport === true || moduleAccess?.can_import_export === true || reportAccess?.export === true;

  // Edit permission:
  const canEdit = isAdmin || reportAccess?.edit !== false;

  // Manage Column Data / Bulk Update / Find-Replace permission: ONLY Admin or users with explicit can_manage_column_data power
  const canManageData = isAdmin || moduleAccess?.can_manage_column_data === true;

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterRules, setFilterRules] = useState({});
  const [filterConditionType, setFilterConditionType] = useState('AND');
  
  // Data Manager Modal State
  const [isDataManagerOpen, setIsDataManagerOpen] = useState(false);
  const [dataManagerTab, setDataManagerTab] = useState('bulk');
  
  // Profile Panel State
  const [selectedLead, setSelectedLead] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileMode, setProfileMode] = useState('history');
  const [activeRowId, setActiveRowId] = useState(null);
  
  // Selection State for Deletion & Assignment
  const [selectedRows, setSelectedRows] = useState([]);
  const [selectedAssignee, setSelectedAssignee] = useState('');

  // Search, Filter & Pagination State
  const [globalSearch, setGlobalSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState({});
  const [activeFilterColumn, setActiveFilterColumn] = useState(null);
  const [filterSearchText, setFilterSearchText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    let size = '15';
    if (typeof window !== 'undefined') {
      try {
        const settings = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (settings.defaultPageSize) size = String(settings.defaultPageSize);
      } catch (e) {}
    }
    return size;
  });
  
  const [pageJump, setPageJump] = useState(() => {
    let jump = 7;
    if (typeof window !== 'undefined') {
      try {
        const settings = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (settings.pageNumberingJump) jump = settings.pageNumberingJump;
      } catch (e) {}
    }
    return jump;
  });
  
  const [availablePageSizes, setAvailablePageSizes] = useState(() => {
    let sizes = [3, 5, 10, 15, 20, 50, 100];
    if (typeof window !== 'undefined') {
      try {
        const settings = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (settings.availablePageSizes) {
          sizes = settings.availablePageSizes.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        }
      } catch (e) {}
    }
    return sizes;
  });

  useEffect(() => {
    const applyNavSettings = (settings) => {
      if (!settings) return;
      if (settings.defaultPageSize !== undefined) {
        setItemsPerPage(String(settings.defaultPageSize));
      }
      if (settings.pageNumberingJump) {
        setPageJump(settings.pageNumberingJump);
      }
      if (settings.availablePageSizes) {
        const sizes = settings.availablePageSizes.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        if (sizes.length > 0) setAvailablePageSizes(sizes);
      }
    };

    const handleNavUpdate = () => {
      try {
        const cached = localStorage.getItem('crmPageNavSettings');
        if (cached) {
          applyNavSettings(JSON.parse(cached));
        }
      } catch (e) {}
    };

    window.addEventListener('crm_page_nav_updated', handleNavUpdate);
    window.addEventListener('crm_config_updated', handleNavUpdate);
    return () => {
      window.removeEventListener('crm_page_nav_updated', handleNavUpdate);
      window.removeEventListener('crm_config_updated', handleNavUpdate);
    };
  }, []);

  const getUniqueValues = (key) => {
    const vals = leads.map(l => {
      let v = l[key];
      if (key === 'created_at' && v) v = new Date(v).toLocaleString();
      return String(v !== undefined && v !== null ? v : '').trim();
    });
    return [...new Set(vals)].sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  };

  const handleToggleColumnFilter = (colKey, value) => {
    setColumnFilters(prev => {
      const current = prev[colKey] || [];
      const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [colKey]: updated };
    });
    setCurrentPage(1);
  };

  // Default to showing first 14 columns so Assigned To is visible by default
  const [visibleColumns, setVisibleColumns] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('clientReportVisibleColumns');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Auto include assigned_to_name if created_by is visible and assigned_to_name isn't in it yet
            if (!parsed.includes('assigned_to_name') && parsed.includes('created_by')) {
              const idx = parsed.indexOf('created_by');
              parsed.splice(idx + 2, 0, 'assigned_to_name');
            }
            return parsed;
          }
        }
      } catch (e) {
        console.error('Error reading clientReportVisibleColumns', e);
      }
    }
    return ALL_COLUMNS.slice(0, 14).map(c => c.key);
  });

  const [reportColumns, setReportColumns] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedOrder = localStorage.getItem('clientReportColumnsOrder');
        if (savedOrder) {
          const orderKeys = JSON.parse(savedOrder);
          if (Array.isArray(orderKeys) && orderKeys.length > 0) {
            const existing = ALL_COLUMNS.filter(c => orderKeys.includes(c.key))
              .sort((a, b) => orderKeys.indexOf(a.key) - orderKeys.indexOf(b.key));
            const newCols = ALL_COLUMNS.filter(c => !orderKeys.includes(c.key));
            return [...existing, ...newCols];
          }
        }
      } catch (e) {
        console.error('Error reading clientReportColumnsOrder', e);
      }
    }
    return ALL_COLUMNS;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('clientReportVisibleColumns', JSON.stringify(visibleColumns));
    }
  }, [visibleColumns]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('clientReportColumnsOrder', JSON.stringify(reportColumns.map(c => c.key)));
    }
  }, [reportColumns]);

  const moveReportColumn = (key, direction) => {
    setReportColumns(prev => {
      const newOrder = [...prev];
      const index = newOrder.findIndex(c => c.key === key);
      if (index === -1) return prev;
      
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newOrder.length) return prev;
      
      const temp = newOrder[index];
      newOrder[index] = newOrder[targetIndex];
      newOrder[targetIndex] = temp;
      
      return newOrder;
    });
  };

  useEffect(() => {
    if (initialData && initialData.length > 0) {
      const processed = initialData.map((lead) => {
        const assignedName = lead.assigned_to 
          ? normalizeEmployeeName(lead.assigned_to, teamMembers) 
          : (lead.assigned_to_name ? normalizeEmployeeName(lead.assigned_to_name, teamMembers) : 'Unassigned');
        
        const createdByName = lead.created_by ? normalizeEmployeeName(lead.created_by, teamMembers) : '';
        const entryByName = lead.entry_by ? normalizeEmployeeName(lead.entry_by, teamMembers) : '';
        const stateName = normalizeStateName(lead.state_name || lead.state || lead.business_state || '');
        const districtName = normalizeDistrictName(lead.district_name || lead.district || lead.business_district || '');
        const cityName = normalizeCityName(lead.city_name || lead.city || lead.business_city || '');
        const tehsilName = normalizeCityName(lead.tehsil_name || lead.tehsil || '');
        const blockName = normalizeCityName(lead.block_name || lead.block || '');

        return {
          ...lead,
          lead_formatted_id: lead.lead_ref_id || lead.id,
          created_by: createdByName || lead.created_by,
          entry_by: entryByName || lead.entry_by,
          assigned_to_name: assignedName,
          state_name: stateName || lead.state_name || '',
          district_name: districtName || lead.district_name || '',
          city_name: cityName || lead.city_name || '',
          tehsil_name: tehsilName || lead.tehsil_name || '',
          block_name: blockName || lead.block_name || '',
          business_contact_aio: [lead.business_contact_1, lead.business_contact_2, lead.business_alt_1, lead.business_alt_2].filter(Boolean).join(', '),
          business_email_aio: [lead.business_email_1, lead.business_email_2, lead.business_alt_email_1, lead.business_alt_email_2].filter(Boolean).join(', '),
          cp_name_aio: [lead.name, lead.cp2_name, lead.cp3_name].filter(Boolean).join(', '),
          cp_mobile_aio: [
            lead.phone, lead.cp1_mobile_2, lead.cp1_alt_1, lead.cp1_alt_2,
            lead.cp2_mobile_1, lead.cp2_mobile_2, lead.cp2_alt_1, lead.cp2_alt_2,
            lead.cp3_mobile_1, lead.cp3_mobile_2, lead.cp3_alt_1, lead.cp3_alt_2
          ].filter(Boolean).join(', '),
          cp_email_aio: [lead.email, lead.cp1_email_2, lead.cp2_email_1, lead.cp2_email_2, lead.cp3_email_1, lead.cp3_email_2].filter(Boolean).join(', ')
        };
      });
      // Sort descending for UI
      processed.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
      setLeads(processed);
      // Retain previously selected rows that still exist in the updated data
      setSelectedRows(prev => prev.filter(id => processed.some(l => l.id === id)));
    } else {
      setLeads([]);
      setSelectedRows([]);
    }
    setLoading(false);
  }, [initialData, teamMembers]);

  const handleDeleteSelected = async () => {
    if (!canDelete) {
      alert("Permission Denied: You do not have permission to delete leads.");
      return;
    }
    if (selectedRows.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedRows.length} lead(s)? This action cannot be undone.`)) return;

    // Capture the exact names and details of the leads BEFORE deleting them
    const targetsToDelete = leads.filter(l => selectedRows.includes(l.id));
    let auditTargetSummary = '';

    if (targetsToDelete.length === 1) {
      const l = targetsToDelete[0];
      const leadName = l.company || l.name || l.contact_person || 'Unnamed Lead';
      const refId = l.lead_ref_id ? `Ref: ${l.lead_ref_id}` : `ID: ${l.id.slice(0, 8)}`;
      const contact = l.mobile || l.phone || l.email || '';
      auditTargetSummary = `Deleted Lead: "${leadName}" (${refId}${contact ? `, Contact: ${contact}` : ''})`;
    } else {
      const summaries = targetsToDelete.slice(0, 10).map((l, i) => {
        const leadName = l.company || l.name || l.contact_person || 'Unnamed Lead';
        const refId = l.lead_ref_id ? `Ref: ${l.lead_ref_id}` : `ID: ${l.id.slice(0, 8)}`;
        return `${i + 1}) "${leadName}" (${refId})`;
      });
      const extraCount = targetsToDelete.length - 10;
      auditTargetSummary = `Deleted ${targetsToDelete.length} lead(s): ${summaries.join('; ')}${extraCount > 0 ? ` and ${extraCount} more` : ''}`;
    }

    try {
      setLoading(true);
      for (let i = 0; i < selectedRows.length; i += 500) {
        const chunk = selectedRows.slice(i, i + 500);
        const { error } = await supabase.from('leads').delete().in('id', chunk);
        if (error) throw error;
      }
      
      // Log the deletion action with detailed target summary
      try {
        await logAuditAction(
          targetsToDelete.length === 1 ? 'Delete Lead' : 'Delete Leads',
          auditTargetSummary
        );
      } catch(e) { console.error('Audit Log failed', e); }

      setLeads(prev => prev.filter(l => !selectedRows.includes(l.id)));
      setSelectedRows([]); 
    } catch (err) {
      console.error("Error deleting leads:", err);
      alert("Failed to delete leads: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignSelected = async () => {
    if (!canAssign) {
      alert("Permission Denied: You do not have permission to assign leads.");
      return;
    }
    if (selectedRows.length === 0 || !selectedAssignee) {
      alert("Please select leads and an employee to assign them to.");
      return;
    }
    
    const assigneeObj = teamMembers.find(m => (m.user_id || m.id) === selectedAssignee);
    const assigneeName = assigneeObj?.emp_name || assigneeObj?.email || 'Agent';
    if (!confirm(`Are you sure you want to assign ${selectedRows.length} lead(s) to ${assigneeName}?`)) return;

    try {
      setLoading(true);
      for (let i = 0; i < selectedRows.length; i += 500) {
        const chunk = selectedRows.slice(i, i + 500);
        const { error } = await supabase
          .from('leads')
          .update({ assigned_to: selectedAssignee })
          .in('id', chunk);
        if (error) throw error;
      }
      
      try {
        await logAuditAction('Bulk Assign Leads', `Assigned ${selectedRows.length} lead(s) to ${assigneeName} via Report Page`);
      } catch(e) { console.error('Audit Log failed', e); }

      setLeads(prev => prev.map(l => selectedRows.includes(l.id) ? { 
        ...l, 
        assigned_to: selectedAssignee,
        assigned_to_name: assigneeName
      } : l));
      
      if (onLeadsChange) {
        onLeadsChange();
      }

      setSelectedRows([]);
      setSelectedAssignee('');
      alert(`Successfully assigned ${selectedRows.length} leads to ${assigneeName}!`);
    } catch (err) {
      console.error("Error assigning leads:", err);
      alert("Failed to assign leads: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpdateCompleted = (affectedIds, colKey, directVal, updatesMap) => {
    setLeads(prev => prev.map(l => {
      if (!affectedIds.includes(l.id)) return l;
      if (updatesMap && updatesMap[l.id] !== undefined) {
        return { ...l, [colKey]: updatesMap[l.id] };
      }
      return { ...l, [colKey]: directVal };
    }));
    if (onLeadsChange) onLeadsChange();
  };

  const toggleRowSelection = (id) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]);
  };

  const handleSelectAllOnPage = (e) => {
    if (e.target.checked) {
      const pageIds = paginatedLeads.map(l => l.id);
      const newSelections = new Set([...selectedRows, ...pageIds]);
      setSelectedRows(Array.from(newSelections));
    } else {
      const pageIds = new Set(paginatedLeads.map(l => l.id));
      setSelectedRows(selectedRows.filter(id => !pageIds.has(id)));
    }
  };

  const toggleColumn = (key) => {
    setVisibleColumns(prev => 
      prev.includes(key) 
        ? prev.filter(c => c !== key) 
        : [...prev, key]
    );
  };

  const selectAll = () => setVisibleColumns(reportColumns.map(c => c.key));
  const deselectAll = () => setVisibleColumns([]);

  const handleExportCSV = () => {
    if (!canExport) {
      alert("Permission Denied: You do not have permission to export leads data.");
      return;
    }
    if (leads.length === 0) return;

    // Filter headers based on visibility
    const activeHeaders = reportColumns.filter(c => visibleColumns.includes(c.key));
    const headerRow = activeHeaders.map(h => `"${h.label}"`).join(',');

    const rows = leads.map(lead => {
      return activeHeaders.map(h => {
        let val = lead[h.key] || '';
        if (h.key === 'created_at' && val) val = new Date(val).toLocaleString();
        // Escape quotes and wrap in quotes to handle commas inside text
        const safeVal = String(val).replace(/"/g, '""');
        return `"${safeVal}"`;
      }).join(',');
    });

    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Client_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    try {
      logAuditAction('Export Leads', `Exported ${leads.length} lead(s) to CSV via Report Page`);
    } catch(e) { console.error('Audit Log failed', e); }
  };

  if (loading) {
    return <PremiumProgressLoader message="Loading Client Report" active={loading} />;
  }

  // Apply Search & Filters
  const filteredLeads = leads.filter(lead => {
    // 1. Global Search
    if (globalSearch) {
      const searchLower = globalSearch.toLowerCase();
      const matchGlobal = Object.values(lead).some(val => 
        String(val || '').toLowerCase().includes(searchLower)
      );
      if (!matchGlobal) return false;
    }

    // 2. Legacy Column Header Filters
    for (const key of Object.keys(columnFilters)) {
      const activeValues = columnFilters[key];
      if (activeValues && activeValues.length > 0) {
        let cellVal = lead[key];
        if (key === 'created_at' && cellVal) cellVal = new Date(cellVal).toLocaleString();
        const strVal = String(cellVal !== undefined && cellVal !== null ? cellVal : '').trim();
        if (!activeValues.includes(strVal)) {
          return false;
        }
      }
    }

    // 3. Advanced Multi-Column Rules (with AND / OR Logic matching Image 2)
    const ruleKeys = Object.keys(filterRules).filter(k => filterRules[k]?.value && filterRules[k].value.trim() !== '');
    if (ruleKeys.length > 0) {
      const ruleMatches = ruleKeys.map(key => {
        const rule = filterRules[key];
        let cellVal = String(lead[key] !== undefined && lead[key] !== null ? lead[key] : '').toLowerCase().trim();
        if (key === 'created_at' && lead[key]) {
          cellVal = String(new Date(lead[key]).toLocaleString()).toLowerCase().trim();
        }
        const targetVal = String(rule.value || '').toLowerCase().trim();
        
        switch (rule.condition) {
          case 'start_with':
            return cellVal.startsWith(targetVal);
          case 'equal':
            return cellVal === targetVal;
          case 'not_equal':
            return cellVal !== targetVal;
          case 'contains':
          default:
            return cellVal.includes(targetVal);
        }
      });

      if (filterConditionType === 'OR') {
        const passOr = ruleMatches.some(Boolean);
        if (!passOr) return false;
      } else {
        const passAnd = ruleMatches.every(Boolean);
        if (!passAnd) return false;
      }
    }

    return true;
  });

  // Apply Pagination
  const numericItemsPerPage = (itemsPerPage === 'All' || itemsPerPage === '100000') ? Math.max(1, filteredLeads.length) : parseInt(itemsPerPage, 10);
  const totalPages = Math.ceil(filteredLeads.length / numericItemsPerPage) || 1;
  const paginatedLeads = filteredLeads.slice((currentPage - 1) * numericItemsPerPage, currentPage * numericItemsPerPage);

  const isAllPageSelected = paginatedLeads.length > 0 && paginatedLeads.every(l => selectedRows.includes(l.id));
  const isSomePageSelected = paginatedLeads.some(l => selectedRows.includes(l.id)) && !isAllPageSelected;
  const isAllFilteredSelected = filteredLeads.length > 0 && filteredLeads.every(l => selectedRows.includes(l.id));

  const renderPageNumbers = () => {
    const pages = [];
    let startPage = Math.max(1, currentPage - pageJump);
    let endPage = Math.min(totalPages, currentPage + pageJump);

    if (currentPage <= pageJump + 1) endPage = Math.min((pageJump * 2) + 1, totalPages);
    if (currentPage >= totalPages - pageJump) startPage = Math.max(1, totalPages - (pageJump * 2));

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => setCurrentPage(i)}
          style={{
            padding: '0.25rem 0.75rem',
            border: '1px solid var(--border-light)',
            background: currentPage === i ? 'var(--accent-color)' : 'var(--bg-surface)',
            color: currentPage === i ? 'white' : 'var(--text-primary)',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: currentPage === i ? 'bold' : 'normal',
          }}
        >
          {i}
        </button>
      );
    }
    return pages;
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      
      {/* Header & Controls */}
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-primary)' }}>Client Registered Report</h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Total Records: {leads.length}</p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', position: 'relative' }}>
          
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              placeholder="Search all data..." 
              value={globalSearch}
              onChange={(e) => { setGlobalSearch(e.target.value); setCurrentPage(1); }}
              style={{ padding: '0.6rem 1rem 0.6rem 2rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem', width: '250px' }}
            />
          </div>

          {canManageData && (
            <button 
              onClick={() => { setDataManagerTab('bulk'); setIsDataManagerOpen(true); }}
              style={{ padding: '0.6rem 1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}
              title="Open Column Data Manager & Bulk Editor"
            >
              <Sliders size={16} color="var(--accent-color)" /> Data Manager
            </button>
          )}

          {/* Settings ⚙️ Icon button with ColumnSelectorModal (Image 1) */}
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => { setShowColumnModal(!showColumnModal); setShowFilterModal(false); }}
              style={{ 
                padding: '0.6rem 0.75rem', 
                background: showColumnModal ? '#0284c7' : 'var(--bg-surface)', 
                color: showColumnModal ? '#ffffff' : 'var(--text-primary)',
                border: '1px solid var(--border-light)', 
                borderRadius: '6px', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.4rem', 
                fontWeight: 500,
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
              title="Column Settings (Show/Hide & Push/Keep Reordering)"
            >
              <Settings size={18} />
            </button>

            <ColumnSelectorModal
              isOpen={showColumnModal}
              onClose={() => setShowColumnModal(false)}
              columns={reportColumns}
              visibleColumns={visibleColumns}
              onApply={(newVis, newCols) => {
                setVisibleColumns(newVis);
                setReportColumns(newCols);
                try {
                  localStorage.setItem('clientReportVisibleColumns', JSON.stringify(newVis));
                  localStorage.setItem('clientReportColumnsOrder', JSON.stringify(newCols.map(c => c.key)));
                } catch (e) {}
              }}
              onReset={() => {
                setVisibleColumns(ALL_COLUMNS.slice(0, 14).map(c => c.key));
                setReportColumns(ALL_COLUMNS);
                try {
                  localStorage.removeItem('clientReportVisibleColumns');
                  localStorage.removeItem('clientReportColumnsOrder');
                } catch (e) {}
              }}
            />
          </div>

          {/* Filter 🌪️ Icon button with MultiColumnFilterModal (Image 2) */}
          <div style={{ position: 'relative' }}>
            {(() => {
              const activeRuleCount = Object.keys(filterRules).filter(k => filterRules[k]?.value && filterRules[k].value.trim() !== '').length;
              return (
                <>
                  <button 
                    onClick={() => { setShowFilterModal(!showFilterModal); setShowColumnModal(false); }}
                    style={{ 
                      padding: '0.6rem 0.75rem', 
                      background: showFilterModal ? '#0284c7' : (activeRuleCount > 0 ? '#eff6ff' : 'var(--bg-surface)'), 
                      color: showFilterModal ? '#ffffff' : (activeRuleCount > 0 ? '#0284c7' : 'var(--text-primary)'),
                      border: activeRuleCount > 0 ? '1px solid #0284c7' : '1px solid var(--border-light)', 
                      borderRadius: '6px', 
                      cursor: 'pointer', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.4rem', 
                      fontWeight: 500,
                      position: 'relative',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                    title="Advanced Multi-Column Filter (AND / OR conditions)"
                  >
                    <Filter size={18} />
                    {activeRuleCount > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '-6px',
                          right: '-6px',
                          backgroundColor: '#0284c7',
                          color: '#ffffff',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                        }}
                      >
                        {activeRuleCount}
                      </span>
                    )}
                  </button>

                  <MultiColumnFilterModal
                    isOpen={showFilterModal}
                    onClose={() => setShowFilterModal(false)}
                    columns={reportColumns}
                    filterRules={filterRules}
                    conditionType={filterConditionType}
                    onApply={(newRules, newCond) => {
                      setFilterRules(newRules);
                      setFilterConditionType(newCond);
                      setCurrentPage(1);
                    }}
                    onResetAll={() => {
                      setFilterRules({});
                      setCurrentPage(1);
                    }}
                    getUniqueValues={getUniqueValues}
                  />
                </>
              );
            })()}
          </div>

          {Object.keys(filterRules).some(k => filterRules[k]?.value && filterRules[k].value.trim() !== '') && (
            <button
              onClick={() => { setFilterRules({}); setCurrentPage(1); }}
              title="Reset all active filters"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#dc2626',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={13} /> Reset Filter
            </button>
          )}

          {selectedRows.length > 0 && (canAssign || canDelete || canManageData) && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--bg-primary)', padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
              {canAssign && (
                <>
                  <SearchableEmployeeSelect 
                    teamMembers={teamMembers}
                    value={selectedAssignee}
                    onChange={setSelectedAssignee}
                    placeholder="Select Employee..."
                  />
                  <button 
                    onClick={handleAssignSelected}
                    disabled={!selectedAssignee}
                    style={{ padding: '0.4rem 0.8rem', background: selectedAssignee ? '#10b981' : '#d1fae5', color: selectedAssignee ? 'white' : '#6ee7b7', border: 'none', borderRadius: '4px', cursor: selectedAssignee ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 500 }}
                  >
                    <UserPlus size={14} /> Assign ({selectedRows.length})
                  </button>
                </>
              )}

              {canManageData && (
                <>
                  {canAssign && (
                    <div style={{ width: '1px', height: '24px', background: 'var(--border-light)', margin: '0 0.25rem' }}></div>
                  )}
                  <button 
                    onClick={() => { setDataManagerTab('bulk'); setIsDataManagerOpen(true); }}
                    style={{ padding: '0.4rem 0.8rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 500 }}
                    title="Bulk update column on selected leads"
                  >
                    <Edit2 size={14} /> Edit Column ({selectedRows.length})
                  </button>
                </>
              )}
              
              {(canAssign || canManageData) && canDelete && (
                <div style={{ width: '1px', height: '24px', background: 'var(--border-light)', margin: '0 0.25rem' }}></div>
              )}

              {canDelete && (
                <button 
                  onClick={handleDeleteSelected}
                  style={{ padding: '0.4rem 0.8rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 500 }}
                >
                  <Trash2 size={14} /> Delete ({selectedRows.length})
                </button>
              )}
            </div>
          )}

          {canExport && (
            <button 
              onClick={handleExportCSV}
              style={{ padding: '0.6rem 1rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
            >
              <Download size={16} /> Download CSV
            </button>
          )}
        </div>
      </div>

      {/* Filter Selection Banner (Select All across entire filtered list) */}
      {isAllPageSelected && filteredLeads.length > paginatedLeads.length && (
        <div style={{ padding: '0.5rem 1rem', background: 'var(--th-filtered-bg)', borderBottom: '1px solid var(--border-light)', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem' }}>
          {isAllFilteredSelected ? (
            <span>
              All <strong>{filteredLeads.length}</strong> leads matching current filter are selected.{' '}
              <button 
                onClick={() => setSelectedRows([])} 
                style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Clear selection
              </button>
            </span>
          ) : (
            <span>
              All <strong>{paginatedLeads.length}</strong> leads on this page are selected.{' '}
              <button 
                onClick={() => setSelectedRows(filteredLeads.map(l => l.id))} 
                style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Select all {filteredLeads.length} leads matching current filter
              </button>
            </span>
          )}
        </div>
      )}

      {/* Table Container - Horizontally Scrollable */}
      <div className="table-responsive-wrapper" style={{ flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${visibleColumns.length * 150}px` }}>
          <thead style={{ backgroundColor: 'var(--th-bg)' }}>
            <tr>
              {(canDelete || canAssign) && (
                <th className="table-header-cell" style={{ position: 'sticky', top: 0, zIndex: 10, textAlign: 'center', padding: '0.75rem 0.5rem', borderBottom: '2px solid var(--border-light)', width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={isAllPageSelected || isAllFilteredSelected}
                    ref={el => {
                      if (el) {
                        el.indeterminate = isSomePageSelected;
                      }
                    }}
                    onChange={handleSelectAllOnPage}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
              )}
              <th className="table-header-cell" style={{ position: 'sticky', top: 0, zIndex: 10, textAlign: 'center', padding: '0.75rem 1rem', borderBottom: '2px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', width: '60px' }}>
                Actions
              </th>
              {reportColumns.filter(c => visibleColumns.includes(c.key)).map(col => (
                <th key={col.key} className={`table-header-cell ${activeFilterColumn === col.key ? 'active-dropdown' : ''}`} style={{ position: 'sticky', top: 0, zIndex: activeFilterColumn === col.key ? 99999 : 10, textAlign: 'left', padding: '0.75rem 1rem', borderBottom: '2px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span>{col.label}</span>
                    <button 
                      onClick={() => {
                        setActiveFilterColumn(activeFilterColumn === col.key ? null : col.key);
                        setFilterSearchText('');
                      }} 
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: (columnFilters[col.key] && columnFilters[col.key].length > 0) ? 'var(--accent-color)' : 'var(--text-secondary)' }}
                    >
                      <Filter size={14} />
                    </button>
                  </div>

                  {activeFilterColumn === col.key && (
                    <div className="column-filter-popup" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '6px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.22)', zIndex: 99999, minWidth: '320px', maxWidth: '480px', width: 'max-content', padding: '0.65rem', fontWeight: 'normal', color: 'var(--text-primary)' }}>
                      <input 
                        type="text"
                        placeholder="Search..."
                        value={filterSearchText}
                        onChange={e => setFilterSearchText(e.target.value)}
                        style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-light)', borderRadius: '4px', fontSize: '0.8rem', marginBottom: '0.5rem', boxSizing: 'border-box' }}
                      />
                      <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {getUniqueValues(col.key).filter(v => v.toLowerCase().includes(filterSearchText.toLowerCase())).map(val => (
                          <label key={val} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', padding: '0.25rem 0.35rem', borderRadius: '4px', lineHeight: '1.35' }}>
                            <input 
                              type="checkbox"
                              checked={(columnFilters[col.key] || []).includes(val)}
                              style={{ marginTop: '0.15rem', flexShrink: 0 }}
                              onChange={() => handleToggleColumnFilter(col.key, val)}
                            />
                            <span title={val} style={{ wordBreak: 'break-word', whiteSpace: 'normal', flex: 1 }}>{val || '(Blank)'}</span>
                          </label>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem' }}>
                        <button onClick={() => setColumnFilters(prev => ({...prev, [col.key]: []}))} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem' }}>Clear</button>
                        <button onClick={() => setActiveFilterColumn(null)} style={{ background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>OK</button>
                      </div>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedLeads.map((lead, idx) => (
              <tr 
                key={lead.id} 
                onClick={() => setActiveRowId(lead.id)}
                style={{ 
                  borderBottom: '1px solid var(--border-light)', 
                  backgroundColor: activeRowId === lead.id 
                    ? 'var(--th-filtered-hover-bg)' 
                    : (selectedRows.includes(lead.id) 
                      ? 'var(--th-filtered-bg)' 
                      : (idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary)')),
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease'
                }}
              >
                {(canDelete || canAssign) && (
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedRows.includes(lead.id)}
                      onChange={() => toggleRowSelection(lead.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                )}
                <td style={{ padding: '0.75rem 1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    {canEdit && (
                      <button onClick={() => { setSelectedLead(lead); setProfileMode('edit'); setIsProfileOpen(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-color)' }} title="Edit Lead">
                        <Edit2 size={16} />
                      </button>
                    )}
                    <button onClick={() => { setSelectedLead(lead); setProfileMode('history'); setIsProfileOpen(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} title="View History">
                      <FileText size={16} />
                    </button>
                  </div>
                </td>
                {reportColumns.filter(c => visibleColumns.includes(c.key)).map(col => {
                  let val = lead[col.key];
                  if (col.key === 'created_at' && val) val = new Date(val).toLocaleString();
                  return (
                    <td key={col.key} style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {val || '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
            {paginatedLeads.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + ((canDelete || canAssign) ? 2 : 1)} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                  No clients registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-primary)', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Rows per page:</span>
            <select 
              value={itemsPerPage} 
              onChange={e => { setItemsPerPage(e.target.value); setCurrentPage(1); }}
              style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
            >
              {(() => {
                const currentSize = itemsPerPage;
                const optionsSet = new Set(availablePageSizes);
                if (currentSize !== 'All') optionsSet.add(parseInt(currentSize, 10) || 15);
                const optionsList = Array.from(optionsSet).sort((a,b) => a - b);
                
                return [...optionsList, 'All'].map(size => (
                  <option key={size} value={size}>
                    {size === 'All' ? 'All' : `Show ${size}`}
                  </option>
                ));
              })()}
            </select>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Showing {filteredLeads.length === 0 ? 0 : ((currentPage - 1) * numericItemsPerPage) + 1} to {Math.min(currentPage * numericItemsPerPage, filteredLeads.length)} of {filteredLeads.length} entries
          </div>
        </div>
        
        {itemsPerPage !== 'All' && totalPages > 1 && (
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
              disabled={currentPage === 1}
              style={{ padding: '0.4rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', borderRadius: '4px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', color: currentPage === 1 ? '#ccc' : 'var(--text-primary)', display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft size={16} />
            </button>
            
            {renderPageNumbers()}

            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
              disabled={currentPage === totalPages}
              style={{ padding: '0.4rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', borderRadius: '4px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', color: currentPage === totalPages ? '#ccc' : 'var(--text-primary)', display: 'flex', alignItems: 'center' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Column Data Manager Modal */}
      {canManageData && isDataManagerOpen && (
        <ColumnDataManagerModal 
          isOpen={isDataManagerOpen}
          onClose={() => setIsDataManagerOpen(false)}
          initialTab={dataManagerTab}
          leads={leads}
          filteredLeads={filteredLeads}
          selectedRows={selectedRows}
          teamMembers={teamMembers}
          supabase={supabase}
          onUpdateCompleted={handleBulkUpdateCompleted}
        />
      )}

      {/* Profile / Edit Modal */}
      {isProfileOpen && profileMode === 'edit' && (
        <div className="modal-container">
          <ClientRegistration 
            initialData={selectedLead} 
            isEditMode={true} 
            onClose={() => { setIsProfileOpen(false); window.location.reload(); }}
            onRegistrationSuccess={() => { setIsProfileOpen(false); window.location.reload(); }}
          />
        </div>
      )}

      {isProfileOpen && profileMode === 'history' && (
        <LeadProfilePanel 
          lead={selectedLead} 
          isOpen={true} 
          onClose={() => { setIsProfileOpen(false); window.location.reload(); }} 
          mode="history"
          userName={userName}
        />
      )}
    </div>
  );
}
