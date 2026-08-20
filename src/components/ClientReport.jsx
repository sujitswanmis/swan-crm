'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Download, Columns, ChevronDown, Loader2, Edit2, FileText, Search, ChevronLeft, ChevronRight, Filter, Trash2, UserPlus } from 'lucide-react';
import LeadProfilePanel from './LeadProfilePanel';
import ClientRegistration from './ClientRegistration';
import { logAuditAction } from '@/app/actions/audit';
import { PremiumProgressLoader } from './PremiumProgressLoader';

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

export default function ClientReport({ initialData = [], teamMembers = [], userName }) {
  const supabase = createClient();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  
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
      return String(v || '');
    });
    return [...new Set(vals)].sort();
  };

  const handleToggleColumnFilter = (colKey, value) => {
    setColumnFilters(prev => {
      const current = prev[colKey] || [];
      const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [colKey]: updated };
    });
    setCurrentPage(1);
  };

  // Default to showing first 13 columns so it's not overwhelmingly wide instantly
  const [visibleColumns, setVisibleColumns] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('clientReportVisibleColumns');
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error('Error reading clientReportVisibleColumns', e);
      }
    }
    return ALL_COLUMNS.slice(0, 13).map(c => c.key);
  });

  const [reportColumns, setReportColumns] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedOrder = localStorage.getItem('clientReportColumnsOrder');
        if (savedOrder) {
          const orderKeys = JSON.parse(savedOrder);
          return [...ALL_COLUMNS].sort((a, b) => {
            const idxA = orderKeys.indexOf(a.key);
            const idxB = orderKeys.indexOf(b.key);
            if (idxA === -1 && idxB === -1) return 0;
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
          });
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
    setLoading(true);
    if (initialData && initialData.length > 0) {
      const processed = initialData.map((lead) => {
         return {
           ...lead,
           lead_formatted_id: lead.lead_ref_id || lead.id,
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
    } else {
      setLeads([]);
    }
    setLoading(false);
    setSelectedRows([]);
  }, [initialData]);

  const handleDeleteSelected = async () => {
    if (selectedRows.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedRows.length} lead(s)? This action cannot be undone.`)) return;

    try {
      setLoading(true);
      for (let i = 0; i < selectedRows.length; i += 500) {
        const chunk = selectedRows.slice(i, i + 500);
        const { error } = await supabase.from('leads').delete().in('id', chunk);
        if (error) throw error;
      }
      
      // Log the deletion action
      try {
        await logAuditAction('Delete Leads', `Deleted ${selectedRows.length} lead(s) via Report Page`);
      } catch(e) { console.error('Audit Log failed', e); }

      setLeads(prev => prev.filter(l => !selectedRows.includes(l.id)));
      setSelectedRows([]); 
    } catch (err) {
      console.error("Error deleting leads:", err);
      alert("Failed to delete leads: " + err.message);
      setLoading(false);
    }
  };

  const handleAssignSelected = async () => {
    if (selectedRows.length === 0 || !selectedAssignee) {
      alert("Please select leads and an employee to assign them to.");
      return;
    }
    
    const assigneeName = teamMembers.find(m => m.user_id === selectedAssignee)?.emp_name || 
                         teamMembers.find(m => m.user_id === selectedAssignee)?.email || 'Agent';
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
      setLeads(prev => prev.map(l => selectedRows.includes(l.id) ? { ...l, assigned_to: selectedAssignee } : l));
      setSelectedRows([]);
      setSelectedAssignee('');
      alert(`Successfully assigned ${selectedRows.length} leads to ${assigneeName}!`);
    } catch (err) {
      console.error("Error assigning leads:", err);
      alert("Failed to assign leads: " + err.message);
      setLoading(false);
    }
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

    // 2. Column Filters
    for (const key of Object.keys(columnFilters)) {
      const activeValues = columnFilters[key];
      if (activeValues && activeValues.length > 0) {
        let cellVal = lead[key];
        if (key === 'created_at' && cellVal) cellVal = new Date(cellVal).toLocaleString();
        
        if (!activeValues.includes(String(cellVal || ''))) {
          return false;
        }
      }
    }
    return true;
  });

  // Apply Pagination
  const numericItemsPerPage = (itemsPerPage === 'All' || itemsPerPage === '100000') ? Math.max(1, filteredLeads.length) : parseInt(itemsPerPage, 10);
  const totalPages = Math.ceil(filteredLeads.length / numericItemsPerPage) || 1;
  const paginatedLeads = filteredLeads.slice((currentPage - 1) * numericItemsPerPage, currentPage * numericItemsPerPage);

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

          <button 
            onClick={() => setShowColumnSelector(!showColumnSelector)}
            style={{ padding: '0.6rem 1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
          >
            <Columns size={16} /> Select Columns <ChevronDown size={14} />
          </button>

          {showColumnSelector && (
            <div style={{ position: 'absolute', top: '100%', right: '120px', marginTop: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 100, width: '300px', maxHeight: '400px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <button onClick={selectAll} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>All</button>
                <button onClick={deselectAll} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>None</button>
                <button onClick={() => {
                  setVisibleColumns(ALL_COLUMNS.slice(0, 13).map(c => c.key));
                  setReportColumns(ALL_COLUMNS);
                  localStorage.removeItem('clientReportVisibleColumns');
                  localStorage.removeItem('clientReportColumnsOrder');
                }} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>Reset</button>
              </div>
              <div style={{ overflowY: 'auto', padding: '0.5rem' }}>
                {reportColumns.map((col, idx) => (
                  <div key={col.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.2rem 0.5rem', borderRadius: '4px', transition: 'background 0.2s', fontSize: '0.85rem' }} onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', flex: 1 }}>
                      <input 
                        type="checkbox" 
                        checked={visibleColumns.includes(col.key)}
                        onChange={() => toggleColumn(col.key)}
                      />
                      {col.label}
                    </label>
                    <div style={{ display: 'flex', gap: '2px' }}>
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveReportColumn(col.key, 'up'); }}
                        disabled={idx === 0}
                        style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.3 : 1, fontSize: '0.75rem', color: 'var(--text-secondary)' }}
                        title="Move Up"
                      >
                        ▲
                      </button>
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveReportColumn(col.key, 'down'); }}
                        disabled={idx === reportColumns.length - 1}
                        style={{ background: 'none', border: 'none', cursor: idx === reportColumns.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === reportColumns.length - 1 ? 0.3 : 1, fontSize: '0.75rem', color: 'var(--text-secondary)' }}
                        title="Move Down"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedRows.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--bg-primary)', padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
              <select 
                value={selectedAssignee}
                onChange={e => setSelectedAssignee(e.target.value)}
                style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.85rem', width: '150px' }}
              >
                <option value="">Select Employee...</option>
                {teamMembers.map(member => (
                  <option key={member.user_id} value={member.user_id}>{member.emp_name || member.email}</option>
                ))}
              </select>
              <button 
                onClick={handleAssignSelected}
                disabled={!selectedAssignee}
                style={{ padding: '0.4rem 0.8rem', background: selectedAssignee ? '#10b981' : '#d1fae5', color: selectedAssignee ? 'white' : '#6ee7b7', border: 'none', borderRadius: '4px', cursor: selectedAssignee ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 500 }}
              >
                <UserPlus size={14} /> Assign ({selectedRows.length})
              </button>
              
              <div style={{ width: '1px', height: '24px', background: 'var(--border-light)', margin: '0 0.25rem' }}></div>

              <button 
                onClick={handleDeleteSelected}
                style={{ padding: '0.4rem 0.8rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 500 }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}

          <button 
            onClick={handleExportCSV}
            style={{ padding: '0.6rem 1rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
          >
            <Download size={16} /> Download CSV
          </button>
        </div>
      </div>

      {/* Table Container - Horizontally Scrollable */}
      <div className="table-responsive-wrapper" style={{ flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${visibleColumns.length * 150}px` }}>
          <thead style={{ backgroundColor: 'var(--th-bg)' }}>
            <tr>
              <th className="table-header-cell" style={{ position: 'sticky', top: 0, zIndex: 10, textAlign: 'center', padding: '0.75rem 0.5rem', borderBottom: '2px solid var(--border-light)', width: '40px' }}>
                <input 
                  type="checkbox" 
                  checked={paginatedLeads.length > 0 && paginatedLeads.every(l => selectedRows.includes(l.id))}
                  onChange={handleSelectAllOnPage}
                  style={{ cursor: 'pointer' }}
                />
              </th>
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
                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedRows.includes(lead.id)}
                    onChange={() => toggleRowSelection(lead.id)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button onClick={() => { setSelectedLead(lead); setProfileMode('edit'); setIsProfileOpen(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-color)' }} title="Edit Lead">
                      <Edit2 size={16} />
                    </button>
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
                <td colSpan={visibleColumns.length + 2} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
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
