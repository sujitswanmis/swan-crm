'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MoreVertical, Trash2, Edit2, ChevronDown, Filter } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import LeadFormModal from './LeadFormModal';
import LeadProfilePanel from './LeadProfilePanel';
import ClientRegistration from './ClientRegistration';
import WhatsappSendModal from './WhatsappSendModal';
import { createClient } from '@/utils/supabase/client';
import { triggerWhatsappAutomationForStage } from '@/app/actions/whatsapp';
import Papa from 'papaparse';

const processLeads = (rawLeads) => {
  return rawLeads.map((lead, i) => {
    const notes = Array.isArray(lead.lead_notes) ? [...lead.lead_notes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : [];
    
    let lastStatus = 'Pending';
    const statusNotes = notes.filter(n => n.note_text.startsWith('Status changed to: '));
    if (statusNotes.length > 0) {
      const diff = statusNotes.find(n => n.note_text.replace('Status changed to: ', '').trim() !== lead.status);
      if (diff) {
        lastStatus = diff.note_text.replace('Status changed to: ', '').trim();
      } else if (statusNotes.length > 1) {
        lastStatus = statusNotes[1].note_text.replace('Status changed to: ', '').trim();
      } else {
        lastStatus = 'Pending';
      }
    }

    const manualNotes = notes.filter(n => !n.note_text.startsWith('Status changed to: '));
    let latestRemark = '';
    let latestEmpName = '';
    
    const trueRemarks = manualNotes.filter(n => !n.note_text.startsWith('Follow-up scheduled for: '));
    if (trueRemarks.length > 0) {
      latestRemark = trueRemarks[0].note_text;
      latestEmpName = trueRemarks[0].created_by || 'Agent';
    } else if (manualNotes.length > 0) {
      latestEmpName = manualNotes[0].created_by || 'Agent';
    }

    let duration = 0;
    if (manualNotes.length > 1) {
      const diffMs = new Date(manualNotes[0].created_at) - new Date(manualNotes[1].created_at);
      duration = Math.round(diffMs / 60000);
    }

    let lastTimestamp = lead.created_at;
    if (notes.length > 0) {
      lastTimestamp = notes[0].created_at;
    }

    return { 
      ...lead, 
      sr_no: i + 1,
      last_status: lastStatus,
      latest_remark: latestRemark,
      latest_emp_name: latestEmpName,
      completion_count: manualNotes.length,
      last_follow_up_duration: duration,
      last_timestamp: lastTimestamp,
      // Column uses 'next_follow_up_date' but DB stores as 'follow_up_date' — map both
      next_follow_up_date: lead.follow_up_date || lead.next_follow_up_date || null
    };
  });
};

const columns = [
  {
    id: 'edit',
    header: 'Lead Profile',
    cell: info => {
      const lead = info.row.original;
      return (
        <button onClick={() => info.table.options.meta?.onOpenProfile(lead, 'edit')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-color)' }} title="Edit Client Registration Form">
          <Edit2 size={16} />
        </button>
      );
    }
  },
  { accessorKey: 'lead_ref_id', header: 'Lead ID', cell: info => <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'monospace' }}>{info.getValue()}</span> },
  {
    accessorKey: 'lead_date',
    header: 'Lead Date',
    cell: info => {
      const val = info.getValue();
      if (!val) return '';
      try {
        const parts = val.split('-');
        if (parts.length === 3) {
          const pad = (n) => String(n).padStart(2, '0');
          return `${parts[0]}-${pad(parts[1])}-${pad(parts[2])}`; // YYYY-MM-DD
        }
      } catch (e) {}
      return val;
    }
  },
  { accessorKey: 'source', header: 'Lead Source' },
  { accessorKey: 'source_name', header: 'Source Name' },
  { accessorKey: 'entry_by', header: 'Lead Entry By' },
  { accessorKey: 'created_by', header: 'Lead Created By' },
  {
    accessorKey: 'assigned_to',
    header: 'Assigned To',
    cell: info => {
      const assignedToId = info.getValue();
      const lead = info.row.original;
      const teamMembers = info.table.options.meta?.teamMembers || [];
      const userRole = info.table.options.meta?.userRole;
      
      const assignedMember = teamMembers.find(m => m.user_id === assignedToId);
      const isManager = userRole === 'admin' || userRole === 'Admin';
      
      const updateAssignee = async (newAssignee) => {
        const supabase = createClient();
        const valToSet = newAssignee === '' ? null : newAssignee;
        const { error: updateError } = await supabase.from('leads').update({ assigned_to: valToSet }).eq('id', lead.id);
        if (updateError) {
          alert("Error updating assignee: " + updateError.message);
          return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        const actor = userName || user?.email?.split('@')[0] || 'System';
        
        const newAssigneeName = newAssignee === '' ? 'Open Lead (Unassigned)' : teamMembers.find(m => m.user_id === newAssignee)?.emp_name || 'Unknown';
        const noteText = `Lead assigned to: ${newAssigneeName}`;
        const { error: noteError } = await supabase.from('lead_notes').insert([{ lead_id: lead.id, note_text: noteText, created_by: actor }]);
        if (noteError) {
          console.error("Error creating assignee note:", noteError.message);
        }

        const newNote = {
          id: Date.now(),
          lead_id: lead.id,
          note_text: noteText,
          created_by: actor,
          created_at: new Date().toISOString()
        };
        const updatedRawLead = {
          ...lead,
          assigned_to: valToSet,
          lead_notes: [...(lead.lead_notes || []), newNote]
        };
        const processed = processLeads([updatedRawLead])[0];
        if (info.table.options.meta?.updateLeadInState) {
          info.table.options.meta.updateLeadInState(processed);
        }
      };

      if (!isManager) {
        if (!assignedToId) {
          return (
            <button 
              onClick={() => updateAssignee(info.table.options.meta?.userId)}
              style={{ padding: '0.25rem 0.5rem', background: '#3b82f6', color: 'white', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
            >
              Claim Lead
            </button>
          );
        }
        return <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{assignedMember ? assignedMember.emp_name : 'Open Lead'}</span>;
      }

      return (
        <select 
          value={assignedToId || ''} 
          onChange={(e) => updateAssignee(e.target.value)}
          style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', border: '1px solid var(--border-light)', outline: 'none', cursor: 'pointer', maxWidth: '150px' }}
        >
          <option value="">Open Lead (Unassigned)</option>
          {teamMembers.filter(m => m.emp_name).map(member => (
            <option key={member.user_id} value={member.user_id}>
              {member.emp_name} {member.emp_department ? `(${member.emp_department})` : ''}
            </option>
          ))}
        </select>
      );
    }
  },
  { accessorKey: 'business_type', header: 'Business Type' },
  { accessorKey: 'company', header: 'Business Name' },
  { 
    id: 'business_contact_aio',
    header: 'Business Contact in AIO',
    accessorFn: row => [row.business_contact_1, row.business_contact_2, row.business_alt_1, row.business_alt_2].filter(Boolean).join(', ')
  },
  { 
    id: 'business_email_aio',
    header: 'Business Mail in AIO',
    accessorFn: row => [row.business_email_1, row.business_email_2, row.business_alt_email_1, row.business_alt_email_2].filter(Boolean).join(', ')
  },
  { 
    id: 'cp_name_aio',
    header: 'CP Name in AIO',
    accessorFn: row => [row.name, row.cp2_name, row.cp3_name].filter(Boolean).join(', ')
  },
  { 
    id: 'cp_mobile_aio',
    header: 'CP Mobile in AIO',
    accessorFn: row => [
      row.phone, row.cp1_mobile_2, row.cp1_alt_1, row.cp1_alt_2,
      row.cp2_mobile_1, row.cp2_mobile_2, row.cp2_alt_1, row.cp2_alt_2,
      row.cp3_mobile_1, row.cp3_mobile_2, row.cp3_alt_1, row.cp3_alt_2
    ].filter(Boolean).join(', ')
  },
  { 
    id: 'cp_email_aio',
    header: 'CP Mail in AIO',
    accessorFn: row => [row.email, row.cp1_email_2, row.cp2_email_1, row.cp2_email_2, row.cp3_email_1, row.cp3_email_2].filter(Boolean).join(', ')
  },
  { accessorKey: 'our_company', header: 'Our Company' },
  { accessorKey: 'state_name', header: 'State Name' },
  { accessorKey: 'district_name', header: 'District Name' },
  { accessorKey: 'priority', header: 'Lead Priority Type' },
  { accessorKey: 'address', header: 'Full Address' },
  { accessorKey: 'requirement', header: 'Requirement' },
  { accessorKey: 'investment', header: 'Investment' },
  { accessorKey: 'buying_timeline', header: 'Buying Timeline' },
  {
    accessorKey: 'status',
    header: 'Lead Status',
    cell: info => {
      const status = info.getValue() || 'New';
      const lead = info.row.original;
      
      const updateStatus = async (newStatus) => {
        const supabase = createClient();
        const userRole = info.table.options.meta?.userRole;
        const moduleAccess = info.table.options.meta?.moduleAccess || {};
        const leadsAccess = moduleAccess?.leads || {};
        const assignedSteps = leadsAccess.assigned_steps || [];
        
        const getStageFromStatus = (st) => {
          if (!st) return '01 - New Stage';
          if (st.startsWith('1;')) return '01 - New Stage';
          if (st.startsWith('2;')) return '02 - Contact Stage';
          if (st.startsWith('3;')) return '03 - Qualification Stage';
          if (st.startsWith('4;')) return '04 - Follow Up Stage';
          if (st.startsWith('5;')) return '05 - Sales Process Stage';
          if (st.startsWith('6;')) return '06 - Conversion Stage';
          if (st.startsWith('7;')) return '07 - Final Stage';
          if (['New', 'Pending'].includes(st)) return '01 - New Stage';
          if (['Converted', 'Order Received', 'Closed'].includes(st)) return '07 - Final Stage';
          return '01 - New Stage';
        };

        let updates = { status: newStatus };
        let noteText = `Status changed to: ${newStatus}`;

        // Auto-Handoff: If agent changes to a stage they don't own, unassign the lead
        if (userRole !== 'admin' && userRole !== 'Admin' && !leadsAccess.is_manager) {
          const newStage = getStageFromStatus(newStatus);
          if (!assignedSteps.includes(newStage)) {
            updates.assigned_to = null;
            noteText += ` (Auto-released to Pool)`;
          }
        }

        const { error: updateError } = await supabase.from('leads').update(updates).eq('id', lead.id);
        if (updateError) {
          alert("Error updating status: " + updateError.message);
          return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        const actor = userName || user?.email?.split('@')[0] || 'System';
        const { error: noteError } = await supabase.from('lead_notes').insert([{ lead_id: lead.id, note_text: noteText, created_by: actor }]);
        if (noteError) {
          console.error("Error creating status note:", noteError.message);
        }
        
        const newNote = {
          id: Date.now(),
          lead_id: lead.id,
          note_text: noteText,
          created_by: actor,
          created_at: new Date().toISOString()
        };
        const updatedRawLead = {
          ...lead,
          ...updates,
          lead_notes: [...(lead.lead_notes || []), newNote]
        };
        const processed = processLeads([updatedRawLead])[0];
        if (info.table.options.meta?.updateLeadInState) {
          info.table.options.meta.updateLeadInState(processed);
        }
        
        // Trigger WhatsApp automation (non-blocking)
        triggerWhatsappAutomationForStage(lead.id, newStatus).then(res => {
          if (!res.success) {
            console.error("WhatsApp Automation Error:", res.error);
            alert("WhatsApp Auto-Send Failed: " + res.error);
          } else if (res.message && res.message.includes('Successfully sent')) {
            alert("✅ " + res.message);
          }
        }).catch(err => console.error("WhatsApp Automation Error:", err));
      };

      const cleanClass = status.toLowerCase().replace(/\s+/g, '');
      const leadStagePrefix = status.includes(';') ? status.split(';')[0] + ';' : '1;';
      const activeFilters = info.table.getColumn('status')?.getFilterValue();
      const isAllLeads = !activeFilters || activeFilters.length === 0;
      const stages = info.table.options.meta?.stages || [];

      return (
        <select 
          value={status} 
          onChange={(e) => {
            const newStatus = e.target.value;
            const savedConfig = localStorage.getItem('crm_config');
            let confirmChange = true;
            if (savedConfig) {
              try {
                const parsed = JSON.parse(savedConfig);
                if (parsed.confirmStageChange !== undefined) {
                  confirmChange = parsed.confirmStageChange;
                }
              } catch (err) {}
            }
            if (confirmChange) {
              const shortName = newStatus.includes('>') ? newStatus.split('>').pop() : newStatus;
              
              if (info.table.options.meta?.setPendingStatusChange) {
                info.table.options.meta.setPendingStatusChange({
                  leadName: lead.business_name || lead.name || 'this lead',
                  shortName,
                  commit: () => {
                    updateStatus(newStatus);
                    info.table.options.meta.setPendingStatusChange(null);
                  },
                  cancel: () => {
                    e.target.value = status; // Revert visually
                    info.table.options.meta.setPendingStatusChange(null);
                  }
                });
                return;
              }
            }
            updateStatus(newStatus);
          }}
          style={{ 
            padding: '0.25rem 1.5rem 0.25rem 0.5rem', 
            borderRadius: '9999px', 
            fontSize: '0.8rem', 
            fontWeight: 600, 
            backgroundColor: `var(--status-${cleanClass}-bg, #e2e8f0)`, 
            color: `var(--status-${cleanClass}-text, #334155)`, 
            border: '1px solid rgba(0,0,0,0.1)', 
            outline: 'none', 
            cursor: 'pointer', 
            textAlign: 'left',
            appearance: 'auto',
            width: '100%',
            minWidth: '220px'
          }}
        >
          {stages.length > 0 ? (
            stages.map((stageObj, i) => {
              const stageNum = i + 1;
              const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
              
              // Only show if it's the current stage, the next stage, or isAllLeads is true
              const isVisible = isAllLeads || parseInt(leadStagePrefix) === stageNum || parseInt(leadStagePrefix) === stageNum - 1;
              
              if (!isVisible) return null;

              return (
                <React.Fragment key={`stage-${i}`}>
                  <option disabled style={{ fontWeight: 'bold', color: '#000' }}>{stageObj.name}</option>
                  {stageObj.substages.map((sub, j) => {
                    const subNum = String(j + 1).padStart(2, '0');
                    const prefix = `${stageNum};${subNum}>${cleanStageName}>`;
                    const val = sub.startsWith(prefix) ? sub : `${prefix}${sub.includes('>') ? sub.split('>').pop() : sub}`;
                    return <option key={val} value={val}>{val}</option>;
                  })}
                </React.Fragment>
              );
            })
          ) : (
            <option value={status}>{status.includes('>') ? status.split('>').pop() : status}</option>
          )}
        </select>
      );
    }
  },
  {
    id: 'whatsapp',
    header: 'Whatsapp',
    enableColumnFilter: false,
    enableGlobalFilter: false,
    cell: info => {
      const lead = info.row.original;
      const phone = lead.phone || lead.business_contact_1;
      return (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {phone && (
            <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" title="Personal WhatsApp" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', backgroundColor: '#25D366', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold', fontSize: '10px' }}>
              WA
            </a>
          )}
          <button 
            onClick={() => info.table.options.meta?.onOpenWhatsapp(lead)}
            title="Send Official Message"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', backgroundColor: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '10px' }}
          >
            API
          </button>
        </div>
      );
    }
  },
  {
    id: 'remarks_reschedule',
    header: 'Remarks and Reschedule',
    enableColumnFilter: false,
    enableGlobalFilter: false,
    cell: info => {
      const lead = info.row.original;
      return (
        <button onClick={() => info.table.options.meta?.onOpenProfile(lead, 'history')} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          Update History
        </button>
      );
    }
  },
  { accessorKey: 'last_status', header: 'Last Status' },
  { accessorKey: 'last_timestamp', header: 'Last Timestamp', cell: info => {
      const val = info.getValue();
      if (!val) return '';
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date(val);
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }},
  { accessorKey: 'next_follow_up_date', header: 'Next Follow-up Date', cell: info => {
      const val = info.getValue();
      if (!val) return '';
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date(val);
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }},
  { accessorKey: 'latest_remark', header: 'Remarks' },
  { accessorKey: 'latest_emp_name', header: 'Emp Name', cell: info => {
      const val = info.getValue();
      if (!val || val === 'Agent' || val === 'System') return val || 'Agent';
      const teamMembers = info.table.options.meta?.teamMembers || [];
      const member = teamMembers.find(m => m.email?.split('@')[0] === val || m.user_id === val);
      return member ? member.emp_name : val;
  }},
  { accessorKey: 'completion_count', header: 'Actual Completion of Count' },
  { accessorKey: 'last_follow_up_duration', header: 'Last Follow-UP Duration in Minute' }
];

export default function LeadTable({ initialData = [], canImportExport, canWrite = true, onLeadsChange, searchQuery, stageFilter, teamMembers = [], userRole, userId, userName, moduleAccess = {}, globalRolePermissions }) {
  // Authenticated Supabase client — used for realtime, CSV import, etc.
  const supabase = useMemo(() => createClient(), []);

  const [data, setData] = useState(() => processLeads(initialData || []));

  const getSignature = (leadsList) => {
    return (leadsList || []).map(d => `${d.id}-${d.status}-${d.assigned_to}-${d.follow_up_date || ''}-${d.our_company || ''}-${d.lead_notes?.length || 0}`).sort().join(',');
  };

  const lastProcessedInitialDataRef = useRef(getSignature(initialData));
  const stagePrefix = stageFilter ? stageFilter.split(' - ')[0].replace(/^0/, '') + ';' : null;
  const showStage = (prefix) => !stagePrefix || stagePrefix === prefix;
  const [pendingStatusChange, setPendingStatusChange] = useState(null);

  const [stages, setStages] = useState([]);
  
  useEffect(() => {
    const loadConfig = () => {
      const saved = localStorage.getItem('crm_config');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.stages && parsed.stages.length > 0 && typeof parsed.stages[0] === 'object' && parsed.stages[0].substages) {
            setStages(parsed.stages);
          }
        } catch (e) { console.error(e); }
      }
    };
    loadConfig();
    window.addEventListener('crm_config_updated', loadConfig);
    return () => window.removeEventListener('crm_config_updated', loadConfig);
  }, []);
  // Phase 1: Filters & Search State
  const [globalFilter, setGlobalFilter] = useState('');
  
  useEffect(() => {
    const newSignature = getSignature(initialData);
    if (newSignature === lastProcessedInitialDataRef.current) return;
    
    lastProcessedInitialDataRef.current = newSignature;
    setData(processLeads(initialData || []));
  }, [initialData]);

  useEffect(() => {
    if (searchQuery !== undefined && searchQuery !== null) {
      setGlobalFilter(searchQuery);
    }
  }, [searchQuery]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [profileMode, setProfileMode] = useState('history');
  const [whatsappModalLead, setWhatsappModalLead] = useState(null);
  const [activeRowId, setActiveRowId] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = React.useRef(null);
  
  const [columnFilters, setColumnFilters] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('leadTableColumnVisibility');
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error('Error reading leadTableColumnVisibility from localStorage', e);
      }
    }
    return {};
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('leadTableColumnVisibility', JSON.stringify(columnVisibility));
    }
  }, [columnVisibility]);

  const [columnOrder, setColumnOrder] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('leadTableColumnOrder');
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error('Error reading leadTableColumnOrder from localStorage', e);
      }
    }
    return columns.map(c => c.accessorKey || c.id);
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('leadTableColumnOrder', JSON.stringify(columnOrder));
    }
  }, [columnOrder]);

  const moveColumn = (columnId, direction) => {
    setColumnOrder(prev => {
      const newOrder = [...prev];
      const index = newOrder.indexOf(columnId);
      if (index === -1) return prev;
      
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newOrder.length) return prev;
      
      // Swap elements
      const temp = newOrder[index];
      newOrder[index] = newOrder[targetIndex];
      newOrder[targetIndex] = temp;
      
      return newOrder;
    });
  };
  
  // Phase 2: Pagination State
  const [pagination, setPagination] = useState(() => {
    let pageSize = 15;
    if (typeof window !== 'undefined') {
      try {
        const settings = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (settings.defaultPageSize) {
          if (settings.defaultPageSize === 'All') pageSize = 100000;
          else pageSize = parseInt(settings.defaultPageSize, 10) || 15;
        }
      } catch (e) {}
    }
    return {
      pageIndex: 0,
      pageSize,
    };
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
  
  // Phase 3: Column Filter UI State
  const [activeFilterColumn, setActiveFilterColumn] = useState(null);
  const [filterSearchText, setFilterSearchText] = useState('');
  
  const getUniqueValues = (columnId) => {
    const pad = (n) => String(n).padStart(2, '0');
    const formatDateTime = (val) => {
      if (!val) return '';
      const d = new Date(val);
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const rows = table.getCoreRowModel().rows;
    const vals = rows.map(row => {
      if (columnId === 'assigned_to') {
        const teamMembers = table.options.meta?.teamMembers || [];
        const val = row.original[columnId];
        const member = teamMembers.find(m => m.user_id === val);
        return member ? member.emp_name : (val ? 'Unknown' : 'Open Lead (Unassigned)');
      }
      if (columnId === 'last_timestamp' || columnId === 'next_follow_up_date') {
        return formatDateTime(row.original[columnId]);
      }
      if (columnId === 'lead_date') {
        const val = row.original[columnId];
        if (!val) return '';
        try {
          const parts = val.split('-');
          if (parts.length === 3) {
            return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`; // YYYY-MM-DD
          }
        } catch (e) {}
        return val;
      }
      
      const val = row.getValue(columnId);
      return val !== null && val !== undefined && val !== '' ? String(val) : '';
    });
    
    return [...new Set(vals.filter(Boolean))].sort();
  };

  const multiSelectFilter = (row, columnId, filterValue) => {
    if (!filterValue || filterValue.length === 0) return true;
    
    let val = String(row.getValue(columnId) || '');
    
    if (columnId === 'assigned_to') {
      const teamMembers = table.options.meta?.teamMembers || [];
      const member = teamMembers.find(m => m.user_id === val);
      val = member ? member.emp_name : (val ? 'Unknown' : 'Open Lead (Unassigned)');
    } else if (columnId === 'last_timestamp' || columnId === 'next_follow_up_date') {
      if (typeof filterValue === 'string' && filterValue.includes('-')) {
        const rawDate = row.original[columnId];
        if (!rawDate) return false;
        const d = new Date(rawDate);
        const pad = (n) => String(n).padStart(2, '0');
        const rowDateStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        return rowDateStr === filterValue;
      }
      if (val) {
        const pad = (n) => String(n).padStart(2, '0');
        const d = new Date(val);
        val = `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    } else if (columnId === 'lead_date') {
      if (typeof filterValue === 'string' && filterValue.includes('-')) {
        const rawDate = row.original[columnId];
        return rawDate === filterValue;
      }
      if (val) {
        try {
          const parts = val.split('-');
          if (parts.length === 3) {
            val = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          }
        } catch (e) {}
      }
    }
    
    const filters = Array.isArray(filterValue) ? filterValue : [filterValue];
    
    if (columnId === 'status') {
      return filters.some(f => {
        if (f === '1;' && (!val || !/^[1-7];/.test(val))) return true;
        return val.startsWith(f) || val === f;
      });
    }
    return filters.some(f => val.includes(f) || val === f);
  };
  
  const finalColumns = useMemo(() => columns.map(c => ({ ...c, filterFn: multiSelectFilter })), []);

  useEffect(() => {
    if (stageFilter) {
      const stagePrefix = stageFilter.split(' - ')[0].replace(/^0/, '') + ';'; // '01' -> '1;'
      setColumnFilters(prev => {
        const others = prev.filter(f => f.id !== 'status');
        return [...others, { id: 'status', value: [stagePrefix] }];
      });
    } else if (stageFilter === null) {
      // Clear status filter if it was set programmatically by a stage filter
      setColumnFilters(prev => {
        const hasStageFilter = prev.some(f => f.id === 'status' && f.value && f.value.length === 1 && f.value[0].endsWith(';'));
        return hasStageFilter ? prev.filter(f => f.id !== 'status') : prev;
      });
    }
  }, [stageFilter]);

  useEffect(() => {
    if (onLeadsChange) {
      onLeadsChange(data);
    }
    lastProcessedInitialDataRef.current = getSignature(data);
  }, [data]);

  useEffect(() => {
    // Advanced Realtime Subscription — leads table + lead_notes table
    const channel = supabase
      .channel('realtime-crm-v2')

      // ── leads INSERT ─────────────────────────────────────────────────────────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
        setData((current) => {
          if (current.some(item => item.id === payload.new.id)) return current;
          return processLeads([{ ...payload.new, lead_notes: [] }, ...current]);
        });
      })

      // ── leads UPDATE ─────────────────────────────────────────────────────────
      // Preserve lead_notes (they live in a separate table, not in payload.new)
      // and re-run processLeads so ALL computed columns stay accurate
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        setData((current) => current.map(item => {
          if (item.id !== payload.new.id) return item;
          const mergedRaw = { ...item, ...payload.new, lead_notes: item.lead_notes || [] };
          return processLeads([mergedRaw])[0];
        }));
      })

      // ── leads DELETE ─────────────────────────────────────────────────────────
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'leads' }, (payload) => {
        setData((current) => current.filter(item => item.id !== payload.old.id));
      })

      // ── lead_notes INSERT ────────────────────────────────────────────────────
      // This is the key fix: whenever ANY note is inserted (status change, manual
      // remark, follow-up date) — update the matching lead's computed columns:
      //   last_timestamp, last_status, latest_remark, latest_emp_name,
      //   completion_count, last_follow_up_duration
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_notes' }, (payload) => {
        const incoming = payload.new;
        setData((current) => current.map(item => {
          if (item.id !== incoming.lead_id) return item;

          const existingNotes = item.lead_notes || [];
          const incomingTime = new Date(incoming.created_at).getTime();

          // Smart dedup: if there's an optimistic (fake) note with same text
          // and author created within 30s, replace it with the real DB record
          const optimisticIdx = existingNotes.findIndex(n =>
            n.note_text === incoming.note_text &&
            n.created_by === incoming.created_by &&
            Math.abs(new Date(n.created_at).getTime() - incomingTime) < 30000
          );

          let updatedNotes;
          if (optimisticIdx >= 0) {
            // Swap optimistic note → real DB note (preserves correct UUID & timestamp)
            updatedNotes = existingNotes.map((n, i) => i === optimisticIdx ? incoming : n);
          } else {
            // Brand-new note (e.g. added from LeadProfilePanel by another user)
            updatedNotes = [...existingNotes, incoming];
          }

          const mergedRaw = { ...item, lead_notes: updatedNotes };
          return processLeads([mergedRaw])[0];
        }));
      })

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);


  const table = useReactTable({
    data,
    columns: finalColumns,
    autoResetPageIndex: false,
    state: {
      globalFilter,
      columnFilters,
      columnVisibility,
      pagination,
      columnOrder,
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    meta: {
      teamMembers,
      stages,
      userRole,
      moduleAccess,
      userId,
      setPendingStatusChange,
      onOpenProfile: (lead, mode) => {
        setProfileMode(mode);
        setSelectedLead(lead);
      },
      onOpenWhatsapp: (lead) => {
        setWhatsappModalLead(lead);
      },
      updateLeadInState: (processedLead) => {
        setData((current) => {
          return current.map(item => item.id === processedLead.id ? { ...item, ...processedLead } : item);
        });
      }
    }
  });

  const exportToCSV = () => {
    // Get the currently filtered rows
    const rows = table.getRowModel().rows;
    if (rows.length === 0) return alert('No data to export');
    
    // Define headers
    const headers = [
      'Lead ID', 'Lead Date', 'Business Type', 'Business Name', 
      'Business Contact in AIO', 'Business Mail in AIO', 
      'CP Name in AIO', 'CP Mobile in AIO', 'CP Mail in AIO', 
      'State', 'District', 'Lead Priority Type', 'Full Address', 
      'Requirement', 'Investment', 'Buying Timeline', 'Status', 'Last Status',
      'Last Timestamp', 'Next Follow-up Date', 'Remarks', 
      'Emp Name', 'Actual Completion of Count', 'Last Follow-UP Duration in Minute'
    ];
    
    // Map data to CSV format
    const csvContent = [
      headers.join(','),
      ...rows.map(row => {
        const d = row.original;
        
        const bContact = [d.business_contact_1, d.business_contact_2, d.business_alt_1, d.business_alt_2].filter(Boolean).join(' | ');
        const bMail = [d.business_email_1, d.business_email_2, d.business_alt_email_1, d.business_alt_email_2].filter(Boolean).join(' | ');
        const cpName = [d.name, d.cp2_name, d.cp3_name].filter(Boolean).join(' | ');
        const cpMobile = [
          d.phone, d.cp1_mobile_2, d.cp1_alt_1, d.cp1_alt_2,
          d.cp2_mobile_1, d.cp2_mobile_2, d.cp2_alt_1, d.cp2_alt_2,
          d.cp3_mobile_1, d.cp3_mobile_2, d.cp3_alt_1, d.cp3_alt_2
        ].filter(Boolean).join(' | ');
        const cpMail = [
          d.email, d.cp1_email_2,
          d.cp2_email_1, d.cp2_email_2,
          d.cp3_email_1, d.cp3_email_2
        ].filter(Boolean).join(' | ');

        // Clean up remark text by removing newlines and quotes to avoid breaking CSV
        const cleanRemark = (d.latest_remark || '').replace(/"/g, '""').replace(/\n/g, ' ');

        return [
          d.lead_ref_id || d.id,
          `"${d.lead_date || ''}"`,
          `"${d.business_type || ''}"`,
          `"${d.company || ''}"`,
          `"${bContact}"`,
          `"${bMail}"`,
          `"${cpName}"`,
          `"${cpMobile}"`,
          `"${cpMail}"`,
          `"${d.state_name || ''}"`,
          `"${d.district_name || ''}"`,
          `"${d.priority || ''}"`,
          `"${(d.address || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
          `"${(d.requirement || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
          `"${d.investment || ''}"`,
          `"${d.buying_timeline || ''}"`,
          `"${d.status || ''}"`,
          `"${d.last_status || ''}"`,
          `"${d.last_timestamp || ''}"`,
          `"${d.next_follow_up_date || ''}"`,
          `"${cleanRemark}"`,
          `"${d.latest_emp_name || ''}"`,
          d.completion_count || 0,
          `"${d.last_follow_up_duration || ''}"`
        ].join(',');
      })
    ].join('\n');

    // Create Blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsImporting(true);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;
        let successCount = 0;
        
        for (const row of rows) {
          // Map CSV columns to db columns (assuming standard headers from Export)
          const newLead = {
            name: row['Name'] || row['name'] || 'Unknown',
            company: row['Company'] || row['company'] || '',
            phone: row['Phone'] || row['phone'] || '',
            email: row['Email'] || row['email'] || '',
            status: row['Status'] || row['status'] || 'New',
            priority: row['Priority'] || row['priority'] || 'Medium',
            deal_value: row['Deal Value'] || row['deal_value'] || 0,
            source: row['Source'] || row['source'] || 'Website',
          };
          
          const { data, error } = await supabase.from('leads').insert([newLead]).select();
          if (!error && data && data.length > 0) {
            successCount++;
            const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true });
            const d = new Date(data[0].created_at || new Date());
            const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
            const seq = String(count).padStart(7, '0');
            const newFormattedId = dateStr + seq;
            await supabase.from('leads').update({ lead_ref_id: newFormattedId }).eq('id', data[0].id);
          }
        }
        
        setIsImporting(false);
        alert(`Successfully imported ${successCount} leads!`);
        // Refresh the file input
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (error) => {
        setIsImporting(false);
        alert('Error parsing CSV: ' + error.message);
      }
    });
  };

  return (
    <div className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      
      {/* Search, Filters, and Export Header */}
      <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--bg-primary)' }}>
        
        <div style={{ display: 'flex', gap: '1rem', flex: 1, minWidth: '300px' }}>
          <input 
            type="text" 
            placeholder="🔍 Search name, email, phone..." 
            value={globalFilter ?? ''}
            onChange={e => setGlobalFilter(e.target.value)}
            style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)', minWidth: '200px' }}
          />
                <select 
            value={table.getColumn('status')?.getFilterValue() ?? ''}
            onChange={e => table.getColumn('status')?.setFilterValue(e.target.value)}
            style={{ padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)', minWidth: '150px' }}
          >
            <option value="">All Statuses</option>
            {stages.map((stageObj, i) => {
              const stageNum = i + 1;
              if (!showStage(`${stageNum};`)) return null;

              const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
              return (
                <React.Fragment key={`filter-stage-${i}`}>
                  <option disabled style={{ fontWeight: 'bold', color: '#000' }}>{stageObj.name}</option>
                  {stageObj.substages.map((sub, j) => {
                    const subNum = String(j + 1).padStart(2, '0');
                    const prefix = `${stageNum};${subNum}>${cleanStageName}>`;
                    const val = sub.startsWith(prefix) ? sub : `${prefix}${sub.includes('>') ? sub.split('>').pop() : sub}`;
                    return <option key={val} value={val}>{val}</option>;
                  })}
                </React.Fragment>
              );
            })}
          </select>


        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setShowColumnMenu(!showColumnMenu)} 
              style={{ padding: '0.6rem 1rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, color: 'var(--text-secondary)' }}
            >
              👁️ Columns <ChevronDown size={16} />
            </button>
            
            {showColumnMenu && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', zIndex: 50, width: '300px', maxHeight: '400px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <button onClick={() => table.toggleAllColumnsVisible(true)} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>All</button>
                  <button onClick={() => table.toggleAllColumnsVisible(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>None</button>
                  <button onClick={() => {
                    table.toggleAllColumnsVisible(true);
                    const defaultOrder = columns.map(c => c.accessorKey || c.id);
                    setColumnOrder(defaultOrder);
                    setColumnVisibility({});
                    localStorage.removeItem('leadTableColumnOrder');
                    localStorage.removeItem('leadTableColumnVisibility');
                  }} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>Reset</button>
                </div>
                <div style={{ overflowY: 'auto', padding: '0.5rem' }}>
                  {table.getAllLeafColumns().map((column, idx, arr) => {
                    const headerText = typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;
                    const isSystemColumn = column.id === 'edit';
                    
                    return (
                      <div key={column.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.2rem 0.5rem', borderRadius: '4px', transition: 'background 0.2s', fontSize: '0.85rem' }} onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', flex: 1 }}>
                          <input
                            type="checkbox"
                            checked={column.getIsVisible()}
                            onChange={column.getToggleVisibilityHandler()}
                            style={{ cursor: 'pointer' }}
                          />
                          {headerText}
                        </label>
                        {!isSystemColumn && (
                          <div style={{ display: 'flex', gap: '2px' }}>
                            <button 
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveColumn(column.id, 'up'); }}
                              disabled={idx <= 1}
                              style={{ background: 'none', border: 'none', cursor: idx <= 1 ? 'not-allowed' : 'pointer', opacity: idx <= 1 ? 0.3 : 1, fontSize: '0.75rem', color: 'var(--text-secondary)' }}
                              title="Move Up"
                            >
                              ▲
                            </button>
                            <button 
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveColumn(column.id, 'down'); }}
                              disabled={idx === arr.length - 1}
                              style={{ background: 'none', border: 'none', cursor: idx === arr.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === arr.length - 1 ? 0.3 : 1, fontSize: '0.75rem', color: 'var(--text-secondary)' }}
                              title="Move Down"
                            >
                              ▼
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {(userRole === 'admin' || userRole === 'Admin' || canImportExport || globalRolePermissions?.export) && (
            <>
              <input 
                type="file" 
                accept=".csv" 
                style={{ display: 'none' }} 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
              />
              <button onClick={() => fileInputRef.current?.click()} disabled={isImporting} style={{ padding: '0.6rem 1rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                {isImporting ? '⏳ Importing...' : '⬆️ Import CSV'}
              </button>
              <button onClick={exportToCSV} style={{ padding: '0.6rem 1rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                📥 Export CSV
              </button>
            </>
          )}
          <button onClick={() => setIsModalOpen(true)} className="btn-primary" style={{ padding: '0.6rem 1.25rem' }}>
            + Add Lead
          </button>
        </div>
      </div>

      {isMobile ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--bg-primary)' }}>
          {table.getRowModel().rows.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No leads found.
            </div>
          ) : (
            table.getRowModel().rows.map((row, idx) => {
              const lead = row.original;
              
              const getCleanStatus = (status) => {
                if (!status) return 'New';
                if (status.includes('>')) return status.split('>').pop();
                return status;
              };

              const getStatusColors = (status) => {
                if (!status) return { bg: 'var(--status-new-bg)', text: 'var(--status-new-text)' };
                if (status.startsWith('7;') || status.includes('Conversion') || status.includes('Converted') || status.includes('Won')) {
                  return { bg: 'var(--status-converted-bg)', text: 'var(--status-converted-text)' };
                }
                if (status.startsWith('2;') || status.startsWith('3;') || status.startsWith('4;') || status.includes('Contact') || status.includes('Follow')) {
                  return { bg: 'var(--status-contacted-bg)', text: 'var(--status-contacted-text)' };
                }
                return { bg: 'var(--status-new-bg)', text: 'var(--status-new-text)' };
              };

              const statusColors = getStatusColors(lead.status);

              return (
                <div 
                  key={row.id} 
                  onClick={() => {
                    setActiveRowId(row.id);
                  }}
                  style={{
                    backgroundColor: activeRowId === row.id ? 'var(--th-filtered-bg)' : 'var(--bg-surface)',
                    border: `1px solid ${activeRowId === row.id ? 'var(--accent-color)' : 'var(--border-light)'}`,
                    borderRadius: '10px',
                    padding: '1.25rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.2s ease'
                  }}
                  className="card-hover-lift"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {lead.name}
                      </h4>
                      {lead.lead_ref_id && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.15rem' }}>
                          ID: {lead.lead_ref_id}
                        </span>
                      )}
                    </div>
                    <span style={{
                      padding: '0.3rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      backgroundColor: statusColors.bg,
                      color: statusColors.text,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                      whiteSpace: 'nowrap'
                    }}>
                      {getCleanStatus(lead.status)}
                    </span>
                  </div>

                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '0.6rem 1rem', 
                    fontSize: '0.8rem', 
                    color: 'var(--text-secondary)',
                    borderTop: '1px solid var(--border-light)',
                    borderBottom: '1px solid var(--border-light)',
                    padding: '0.75rem 0',
                    margin: '0.25rem 0'
                  }}>
                    <div>
                      <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Company:</span>
                      <span style={{ marginLeft: '0.25rem', color: 'var(--text-primary)', fontWeight: 600 }}>{lead.company || 'N/A'}</span>
                    </div>
                    <div>
                      <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Value:</span>
                      <span style={{ marginLeft: '0.25rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {lead.deal_value ? `₹${Number(lead.deal_value).toLocaleString('en-IN')}` : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Assigned To:</span>
                      <span style={{ marginLeft: '0.25rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                        {(() => {
                          if (!lead.assigned_to) return 'Unassigned';
                          const member = (teamMembers || []).find(t => t.user_id === lead.assigned_to);
                          return member ? member.emp_name : lead.assigned_to.substring(0, 8);
                        })()}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Source:</span>
                      <span style={{ marginLeft: '0.25rem', color: 'var(--text-primary)', fontWeight: 500 }}>{lead.source || 'N/A'}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', width: '100%', marginTop: '0.25rem' }}>
                    {lead.phone && (
                      <a 
                        href={`tel:${lead.phone}`}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(37, 99, 235, 0.1)',
                          color: 'var(--accent-color)',
                          textDecoration: 'none',
                          textAlign: 'center',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.25rem',
                          border: '1px solid transparent'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        📞 Call
                      </a>
                    )}
                    {lead.phone && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setWhatsappModalLead(lead);
                        }}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(16, 185, 129, 0.1)',
                          color: '#10b981',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'center',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.25rem'
                        }}
                      >
                        💬 WhatsApp
                      </button>
                    )}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setProfileMode('history');
                        setSelectedLead(lead);
                      }}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-light)',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 600
                      }}
                    >
                      Details
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="table-responsive-wrapper" style={{ flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1500px' }}>
            <thead style={{ backgroundColor: 'var(--th-bg)' }}>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id} className={`table-header-cell ${activeFilterColumn === header.id ? 'active-dropdown' : ''} ${header.column.getIsFiltered() ? 'is-filtered' : ''}`} style={{ position: 'sticky', top: 0, zIndex: activeFilterColumn === header.id ? 100 : 10, padding: '0.75rem 1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border-light)' }}>
                    {header.isPlaceholder ? null : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                        
                        {header.column.getCanFilter() && (
                          <div style={{ position: 'relative' }}>
                            <button 
                              onClick={() => {
                                setActiveFilterColumn(activeFilterColumn === header.id ? null : header.id);
                                setFilterSearchText('');
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: header.column.getIsFiltered() ? 'var(--accent-color)' : 'var(--text-secondary)' }}
                            >
                              <Filter size={14} />
                            </button>
                            
                            {activeFilterColumn === header.id && (
                              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', zIndex: 100, width: '220px', padding: '0.5rem', fontWeight: 'normal', color: 'var(--text-primary)' }}>
                                {(header.id === 'last_timestamp' || header.id === 'next_follow_up_date' || header.id === 'lead_date') ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Select Date:</label>
                                    <input 
                                      type="date"
                                      value={header.column.getFilterValue() || ''}
                                      onChange={e => header.column.setFilterValue(e.target.value ? e.target.value : undefined)}
                                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-light)', borderRadius: '4px', fontSize: '0.8rem' }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem' }}>
                                      <button onClick={() => header.column.setFilterValue(undefined)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem' }}>Clear</button>
                                      <button onClick={() => setActiveFilterColumn(null)} style={{ background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>OK</button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <input 
                                      type="text"
                                      placeholder="Search..."
                                      value={filterSearchText}
                                      onChange={e => setFilterSearchText(e.target.value)}
                                      style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-light)', borderRadius: '4px', fontSize: '0.8rem', marginBottom: '0.5rem', boxSizing: 'border-box' }}
                                    />
                                    <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                      {getUniqueValues(header.id).filter(v => v.toLowerCase().includes(filterSearchText.toLowerCase())).map(val => {
                                        const rawFilterValue = header.column.getFilterValue();
                                        const currentFilterValue = Array.isArray(rawFilterValue) ? rawFilterValue : (rawFilterValue ? [rawFilterValue] : []);
                                        const isChecked = currentFilterValue.includes(val);
                                        return (
                                          <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', padding: '0.2rem' }}>
                                            <input 
                                              type="checkbox"
                                              checked={isChecked}
                                              onChange={() => {
                                                const newValue = isChecked 
                                                  ? currentFilterValue.filter(v => String(v) !== String(val))
                                                  : [...currentFilterValue, val];
                                                header.column.setFilterValue(newValue.length ? newValue : undefined);
                                              }}
                                            />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val || '(Blank)'}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem' }}>
                                      <button onClick={() => header.column.setFilterValue(undefined)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem' }}>Clear</button>
                                      <button onClick={() => setActiveFilterColumn(null)} style={{ background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>OK</button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, idx) => (
              <tr 
                key={row.id} 
                onClick={() => setActiveRowId(row.id)}
                style={{ 
                  borderBottom: '1px solid var(--border-light)', 
                  backgroundColor: activeRowId === row.id ? 'var(--th-filtered-bg)' : (idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary)'),
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease'
                }}
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} style={{ padding: '1rem 1.25rem', fontSize: '0.9rem' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      
      <div style={{ padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
          <span>
            {(() => {
              const pageIndex = table.getState().pagination.pageIndex;
              const pageSize = table.getState().pagination.pageSize;
              const totalRecords = table.getFilteredRowModel().rows.length;
              const startRecord = totalRecords === 0 ? 0 : pageIndex * pageSize + 1;
              const endRecord = Math.min((pageIndex + 1) * pageSize, totalRecords);
              return `Showing ${startRecord} to ${endRecord} of ${totalRecords} records`;
            })()}
          </span>
          <select
            value={table.getState().pagination.pageSize}
            onChange={e => {
              table.setPageSize(Number(e.target.value))
            }}
            style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}
          >
            {(() => {
              const currentSize = table.getState().pagination.pageSize;
              const optionsSet = new Set(availablePageSizes);
              if (currentSize !== 100000 && !isNaN(currentSize)) optionsSet.add(currentSize);
              const optionsList = Array.from(optionsSet).sort((a,b) => a - b);
              optionsList.push(100000);
              
              return optionsList.map(pageSize => (
                <option key={pageSize} value={pageSize}>
                  {pageSize === 100000 ? 'All' : `Show ${pageSize}`}
                </option>
              ));
            })()}
          </select>
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            style={{ padding: '0.25rem 0.75rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', borderRadius: '4px', cursor: table.getCanPreviousPage() ? 'pointer' : 'not-allowed', opacity: table.getCanPreviousPage() ? 1 : 0.5 }}
          >
            Previous
          </button>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', justifyContent: 'center' }}>
            {(() => {
              const totalPages = table.getPageCount();
              const currentPage = table.getState().pagination.pageIndex + 1;
              const pages = [];
              
              let startPage = Math.max(1, currentPage - pageJump);
              let endPage = Math.min(totalPages, currentPage + pageJump);

              if (currentPage <= pageJump + 1) endPage = Math.min((pageJump * 2) + 1, totalPages);
              if (currentPage >= totalPages - pageJump) startPage = Math.max(1, totalPages - (pageJump * 2));

              for (let i = startPage; i <= endPage; i++) {
                pages.push(
                  <button
                    key={i}
                    onClick={() => table.setPageIndex(i - 1)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      border: '1px solid var(--border-light)',
                      borderRadius: '4px',
                      background: currentPage === i ? 'var(--accent-color)' : 'var(--bg-surface)',
                      color: currentPage === i ? 'white' : 'var(--text-primary)',
                      cursor: 'pointer'
                    }}
                  >
                    {i}
                  </button>
                );
              }
              return pages;
            })()}
          </div>

          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            style={{ padding: '0.25rem 0.75rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', borderRadius: '4px', cursor: table.getCanNextPage() ? 'pointer' : 'not-allowed', opacity: table.getCanNextPage() ? 1 : 0.5 }}
          >
            Next
          </button>
        </div>
      </div>

      <LeadFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      
      {/* Client Registration Full Form Edit Modal */}
      {selectedLead && profileMode === 'edit' && (
        <div className="modal-container">
          <ClientRegistration 
            initialData={selectedLead} 
            onRegistrationSuccess={() => { setSelectedLead(null); setIsModalOpen(false); }} 
            isEditMode={true} 
            onClose={() => { setSelectedLead(null); setIsModalOpen(false); }} 
          />
        </div>
      )}

      {whatsappModalLead && (
        <WhatsappSendModal lead={whatsappModalLead} onClose={() => setWhatsappModalLead(null)} />
      )}

      {/* Custom Centered Popup for Status Change Confirmation */}
      {pendingStatusChange && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-primary, #ffffff)',
            color: 'var(--text-primary, #333333)',
            padding: '1.5rem',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            maxWidth: '400px',
            width: '90%',
            textAlign: 'center',
            animation: 'scaleUp 0.2s ease-out forwards'
          }}>
            <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Confirm Status Change</div>
            <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
              Are you sure you want to change the status of <strong>{pendingStatusChange.leadName}</strong> to <strong style={{color: 'var(--accent-color)'}}>{pendingStatusChange.shortName}</strong>?
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                onClick={pendingStatusChange.cancel}
                style={{ flex: 1, padding: '0.6rem 1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
              >
                Cancel
              </button>
              <button 
                onClick={pendingStatusChange.commit}
                style={{ flex: 1, padding: '0.6rem 1rem', background: 'var(--accent-color)', border: 'none', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
              >
                Confirm Change
              </button>
            </div>
          </div>
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes scaleUp {
              from { opacity: 0; transform: scale(0.95); }
              to { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      )}

      {/* History Panel */}
      {selectedLead && profileMode === 'history' && (
        <LeadProfilePanel 
          lead={selectedLead} 
          isOpen={true} 
          onClose={() => setSelectedLead(null)} 
          mode="history"
          userName={userName}
          onLeadUpdate={(updatedRawLead) => {
             // Process just this single lead to get its new formatted fields
             // Since processLeads expects an array of raw leads, we can pass it
             // and merge back into our data state
             const processed = processLeads([updatedRawLead])[0];
             setData((current) => current.map(item => item.id === processed.id ? { ...item, ...processed } : item));
             setSelectedLead(processed);
          }}
        />
      )}
    </div>
  );
}
