'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MoreVertical, Trash2, Edit2, ChevronDown, Filter, Table, LayoutGrid, RotateCcw, Settings } from 'lucide-react';
import ColumnSelectorModal from './TableControls/ColumnSelectorModal';
import MultiColumnFilterModal from './TableControls/MultiColumnFilterModal';
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
import LeadDashboard from './LeadDashboard';
import { createClient } from '@/utils/supabase/client';
import { triggerWhatsappAutomationForStage } from '@/app/actions/whatsapp';
import { logAuditAction } from '@/app/actions/audit';
import { normalizeEmployeeName, normalizeStateName, normalizeDistrictName, normalizeCityName } from '@/utils/dataSanitizer';
import Papa from 'papaparse';

const extractStatusFromNoteText = (noteText) => {
  if (!noteText || typeof noteText !== 'string') return null;
  
  // Pattern 1: "Status changed from [OLD] to [NEW]"
  const fromToMatch = noteText.match(/(?:status|stage)\s+changed\s+from\s+["']?([^"']+)["']?\s+to\s+["']?([^"'\n()]+)/i);
  if (fromToMatch) {
    return { oldStatus: fromToMatch[1].trim(), newStatus: fromToMatch[2].trim() };
  }

  // Pattern 2: "Status changed to: [NEW]" or "Status updated to: [NEW]" or "Stage changed to: [NEW]"
  const prefixes = [
    'status changed to:',
    'status updated to:',
    'stage changed to:',
    'stage updated to:',
    'status changed to',
    'status:'
  ];

  const lower = noteText.toLowerCase();
  for (const prefix of prefixes) {
    const idx = lower.indexOf(prefix);
    if (idx !== -1) {
      let rawVal = noteText.substring(idx + prefix.length).trim();
      rawVal = rawVal.replace(/\s*\([^)]*\).*/, '').trim();
      if (rawVal) {
        return { newStatus: rawVal };
      }
    }
  }

  return null;
};

const getLeadPhoneNumbers = (lead) => {
  if (!lead) return [];
  const nums = [
    lead.phone,
    lead.business_contact_1,
    lead.business_contact_2,
    lead.business_alt_1,
    lead.business_alt_2,
    lead.mobile,
    lead.contact_no_2
  ];
  const unique = [];
  const seen = new Set();
  for (const n of nums) {
    if (n && typeof n === 'string' && n.trim()) {
      const clean = n.trim();
      if (!seen.has(clean)) {
        seen.add(clean);
        unique.push(clean);
      }
    }
  }
  return unique;
};

const processLeads = (rawLeads, teamMembers = []) => {
  return (rawLeads || []).map((lead, i) => {
    const notes = Array.isArray(lead.lead_notes) 
      ? [...lead.lead_notes].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)) 
      : [];
    
    // Collect all status change entries from notes (newest first)
    const statusEntries = [];
    notes.forEach(n => {
      const parsed = extractStatusFromNoteText(n.note_text);
      if (parsed) {
        statusEntries.push({ ...parsed, created_at: n.created_at });
      }
    });

    let lastStatus = 'Pending New';

    if (statusEntries.length > 0) {
      const latestChange = statusEntries[0];
      // 1. If latest note specifies what the previous status was (oldStatus)
      if (latestChange.oldStatus) {
        if (latestChange.oldStatus === 'None' || latestChange.oldStatus.toLowerCase() === 'new' || latestChange.oldStatus === '') {
          lastStatus = 'Pending New';
        } else {
          lastStatus = latestChange.oldStatus;
        }
      } 
      // 2. Otherwise check if there is a 2nd status change event in history
      else if (statusEntries.length >= 2) {
        const prevChange = statusEntries[1];
        lastStatus = prevChange.newStatus || prevChange.oldStatus || 'Pending New';
      } else {
        lastStatus = 'Pending New';
      }
    } else {
      lastStatus = 'Pending New';
    }

    const manualNotes = notes.filter(n => !n.note_text || (!n.note_text.includes('Status changed to:') && !n.note_text.includes('Status updated to:') && !n.note_text.includes('Status changed from ')));
    let latestRemark = '';
    let latestEmpName = '';
    
    const trueRemarks = manualNotes.filter(n => !n.note_text.startsWith('Follow-up scheduled for: ') && !n.note_text.startsWith('Lead assigned to: ') && n.note_text !== 'Client Registration Form Submitted' && n.note_text !== 'Profile updated' && n.note_text !== 'Client Profile was updated.');
    if (trueRemarks.length > 0) {
      latestRemark = trueRemarks[0].note_text;
      latestEmpName = normalizeEmployeeName(trueRemarks[0].created_by || 'Agent', teamMembers);
    } else if (manualNotes.length > 0) {
      latestEmpName = normalizeEmployeeName(manualNotes[0].created_by || 'Agent', teamMembers);
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

    const stateName = normalizeStateName(lead.state_name || lead.state || '');
    const districtName = normalizeDistrictName(lead.district_name || lead.district || '');
    const cityName = normalizeCityName(lead.city_name || lead.city || '');
    const createdBy = normalizeEmployeeName(lead.created_by, teamMembers);
    const entryBy = normalizeEmployeeName(lead.entry_by, teamMembers);

    return { 
      ...lead, 
      sr_no: i + 1,
      last_status: lastStatus,
      latest_remark: latestRemark,
      latest_emp_name: latestEmpName,
      state_name: stateName,
      district_name: districtName,
      city_name: cityName,
      created_by: createdBy,
      entry_by: entryBy,
      completion_count: manualNotes.length,
      last_follow_up_duration: duration,
      last_timestamp: lastTimestamp,
      // Column uses 'next_follow_up_date' but DB stores as 'follow_up_date' — map both
      next_follow_up_date: lead.follow_up_date || lead.next_follow_up_date || null
    };
  });
};

const LeadAssigneeCell = React.memo(({ info }) => {
  const assignedToId = info.getValue();
  const lead = info.row.original;
  const teamMembers = info.table.options.meta?.teamMembers || [];
  const userRole = info.table.options.meta?.userRole;
  const [isInteracting, setIsInteracting] = useState(false);
  
  const assignedMember = teamMembers.find(m => m.user_id === assignedToId);
  const moduleAccess = info.table.options.meta?.moduleAccess || {};
  const isManager = userRole === 'admin' || userRole === 'Admin' || moduleAccess?.['leads']?.is_manager === true || moduleAccess?.can_assign_leads === true;
  
  const updateAssignee = async (newAssignee) => {
    const supabase = createClient();
    const valToSet = newAssignee === '' ? null : newAssignee;
    const { error: updateError } = await supabase.from('leads').update({ assigned_to: valToSet }).eq('id', lead.id);
    if (updateError) {
      alert("Error updating assignee: " + updateError.message);
      return;
    }
    
    const { data: { user } } = await supabase.auth.getUser();
    const actor = info.table.options.meta?.userName || user?.email?.split('@')[0] || 'System';
    
    const newAssigneeName = newAssignee === '' ? 'Open Lead (Unassigned)' : teamMembers.find(m => m.user_id === newAssignee)?.emp_name || 'Unknown';
    const noteText = `Lead assigned to: ${newAssigneeName}`;
    const { error: noteError } = await supabase.from('lead_notes').insert([{ lead_id: lead.id, note_text: noteText, created_by: actor }]);
    if (noteError) {
      console.error("Error creating assignee note:", noteError.message);
    }

    try {
      await logAuditAction('Assign Lead', `Assigned lead "${lead.company || lead.name || lead.lead_ref_id || lead.id}" to ${newAssigneeName}`);
    } catch (e) {
      console.error('Audit Log failed', e);
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
    const processed = processLeads([updatedRawLead], teamMembers)[0];
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
      onFocus={() => setIsInteracting(true)}
      onMouseEnter={() => setIsInteracting(true)}
      onChange={(e) => updateAssignee(e.target.value)}
      style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', border: '1px solid var(--border-light)', outline: 'none', cursor: 'pointer', maxWidth: '150px' }}
    >
      {!isInteracting ? (
        <option value={assignedToId || ''}>
          {assignedMember ? `${assignedMember.emp_name} ${assignedMember.emp_department ? `(${assignedMember.emp_department})` : ''}` : 'Open Lead (Unassigned)'}
        </option>
      ) : (
        <>
          <option value="">Open Lead (Unassigned)</option>
          {teamMembers.filter(m => m.emp_name).map(member => (
            <option key={member.user_id} value={member.user_id}>
              {member.emp_name} {member.emp_department ? `(${member.emp_department})` : ''}
            </option>
          ))}
        </>
      )}
    </select>
  );
});

const LeadStatusCell = React.memo(({ info }) => {
  const status = info.getValue() || 'New';
  const lead = info.row.original;
  const [isInteracting, setIsInteracting] = useState(false);
  
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

    const oldStatus = status;
    let updates = { status: newStatus };
    let noteText = `Status changed from ${oldStatus} to ${newStatus}`;

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
    const actor = info.table.options.meta?.userName || user?.email?.split('@')[0] || 'System';
    const { data: insertedNote, error: noteError } = await supabase.from('lead_notes').insert([{ lead_id: lead.id, note_text: noteText, created_by: actor }]).select().single();
    if (noteError) {
      console.error("Error creating status note:", noteError.message);
    }

    try {
      await logAuditAction('Stage Changed', `Changed status/stage of lead "${lead.company || lead.name || lead.lead_ref_id || lead.id}" to "${newStatus}"`);
    } catch (e) {
      console.error('Audit Log failed', e);
    }
    
    const newNote = insertedNote || {
      id: Date.now(),
      lead_id: lead.id,
      note_text: noteText,
      created_by: actor,
      created_at: new Date().toISOString()
    };
    const updatedRawLead = {
      ...lead,
      ...updates,
      lead_notes: [newNote, ...(lead.lead_notes || [])]
    };
    const processed = processLeads([updatedRawLead], teamMembers)[0];
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
      onFocus={() => setIsInteracting(true)}
      onMouseEnter={() => setIsInteracting(true)}
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
      {!isInteracting ? (
        <option value={status}>{status.includes('>') ? status.split('>').pop() : status}</option>
      ) : (
        stages.length > 0 ? (
          stages.map((stageObj, i) => {
            const stageNum = i + 1;
            const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
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
        )
      )}
    </select>
  );
});

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
    cell: info => <LeadAssigneeCell info={info} />
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
  { accessorKey: 'pin_code', header: 'PIN Code' },
  { accessorKey: 'city_name', header: 'City Name' },
  { accessorKey: 'tehsil_name', header: 'Tehsil Name' },
  { accessorKey: 'block_name', header: 'Block Name' },
  { accessorKey: 'priority', header: 'Lead Priority Type' },
  { accessorKey: 'address', header: 'Full Address' },
  { accessorKey: 'requirement', header: 'Requirement' },
  { accessorKey: 'investment', header: 'Investment' },
  { accessorKey: 'buying_timeline', header: 'Buying Timeline' },
  {
    accessorKey: 'status',
    header: 'Lead Status',
    cell: info => <LeadStatusCell info={info} />
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
  { 
    accessorKey: 'last_status', 
    header: 'Last Status',
    cell: info => {
      const val = info.getValue();
      if (!val || val === 'Pending New') {
        return (
          <span 
            style={{ 
              fontSize: '0.78rem', 
              fontWeight: 600, 
              padding: '0.2rem 0.6rem', 
              borderRadius: '9999px', 
              backgroundColor: '#fef3c7', 
              color: '#b45309', 
              border: '1px solid #fde68a', 
              display: 'inline-block',
              whiteSpace: 'nowrap'
            }}
          >
            Pending New
          </span>
        );
      }
      
      const cleanClass = val.toLowerCase().replace(/\s+/g, '');

      return (
        <span 
          style={{ 
            fontSize: '0.8rem', 
            fontWeight: 600, 
            padding: '0.25rem 0.65rem', 
            borderRadius: '9999px', 
            backgroundColor: `var(--status-${cleanClass}-bg, #e2e8f0)`, 
            color: `var(--status-${cleanClass}-text, #334155)`, 
            border: '1px solid rgba(0,0,0,0.1)', 
            display: 'inline-block',
            whiteSpace: 'nowrap'
          }}
          title={val}
        >
          {val}
        </span>
      );
    }
  },
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

const LeadTableRow = ({ row, activeRowId, idx, onRowClick }) => {
  return (
    <tr 
      onClick={() => onRowClick(row.id)}
      style={{ 
        borderBottom: '1px solid var(--border-light)', 
        backgroundColor: activeRowId === row.id ? 'var(--th-filtered-bg)' : (idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary)'),
        cursor: 'pointer',
        transition: 'background-color 0.15s ease'
      }}
    >
      {row.getVisibleCells().map(cell => (
        <td key={cell.id} style={{ padding: '0.85rem 1.25rem', fontSize: '0.88rem' }}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
};

export default function LeadTable({ initialData = [], canImportExport, canWrite = true, onLeadsChange, searchQuery, stageFilter, onStageChange, teamMembers = [], userRole, userId, userName, moduleAccess = {}, globalRolePermissions }) {
  // Authenticated Supabase client — used for realtime, CSV import, etc.
  const supabase = useMemo(() => createClient(), []);

  const [data, setData] = useState(() => processLeads(initialData || [], teamMembers));

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
    setData(processLeads(initialData || [], teamMembers));
  }, [initialData, teamMembers]);

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
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('crm_lead_view_mode') || 'table';
    }
    return 'table';
  });
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
    const defaultOrder = columns.map(c => c.id || c.accessorKey).filter(Boolean);
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('leadTableColumnOrder');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Keep saved order, and append any new columns that didn't exist before
            const existingSet = new Set(parsed);
            const missing = defaultOrder.filter(id => !existingSet.has(id));
            return [...parsed, ...missing];
          }
        }
      } catch (e) {
        console.error('Error reading leadTableColumnOrder from localStorage', e);
      }
    }
    return defaultOrder;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('leadTableColumnOrder', JSON.stringify(columnOrder));
    }
  }, [columnOrder]);

  const moveColumn = (columnId, direction) => {
    setColumnOrder(prev => {
      const allColIds = columns.map(c => c.id || c.accessorKey).filter(Boolean);
      const currentOrder = (prev && prev.length > 0) ? [...prev] : [...allColIds];

      // Append any missing columns to currentOrder
      allColIds.forEach(id => {
        if (!currentOrder.includes(id)) currentOrder.push(id);
      });

      const index = currentOrder.indexOf(columnId);
      if (index === -1) return currentOrder;
      
      const delta = (direction === 'up' || direction === -1) ? -1 : 1;
      const targetIndex = index + delta;
      if (targetIndex < 0 || targetIndex >= currentOrder.length) return currentOrder;
      
      // Swap elements
      const newOrder = [...currentOrder];
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

  useEffect(() => {
    const applyNavSettings = (settings) => {
      if (!settings) return;
      if (settings.defaultPageSize !== undefined) {
        let size = 15;
        if (settings.defaultPageSize === 'All') size = 100000;
        else size = parseInt(settings.defaultPageSize, 10) || 15;
        setPagination(prev => ({ ...prev, pageSize: size }));
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
  
  // Phase 3: Column Filter UI State
  const [activeFilterColumn, setActiveFilterColumn] = useState(null);
  const [filterSearchText, setFilterSearchText] = useState('');
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterRules, setFilterRules] = useState({});
  const [filterConditionType, setFilterConditionType] = useState('AND');

  const activeFilterCount = (columnFilters?.length || 0) + (globalFilter ? 1 : 0) + Object.keys(filterRules).filter(k => filterRules[k]?.value && filterRules[k].value.trim() !== '').length;

  const handleClearAllFilters = () => {
    setColumnFilters([]);
    setGlobalFilter('');
    setFilterRules({});
    setActiveFilterColumn(null);
    setFilterSearchText('');
    table.resetColumnFilters();
    table.resetGlobalFilter();
  };
  
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
      if (columnId === 'state_name') {
        const val = row.getValue(columnId) || row.original.state_name || row.original.state || row.original.business_state;
        return normalizeStateName(val);
      }
      if (columnId === 'district_name') {
        const val = row.getValue(columnId) || row.original.district_name || row.original.district || row.original.business_district;
        return normalizeDistrictName(val);
      }
      if (columnId === 'city_name') {
        const val = row.getValue(columnId) || row.original.city_name || row.original.city || row.original.business_city;
        return normalizeCityName(val);
      }
      if (columnId === 'latest_emp_name' || columnId === 'entry_by' || columnId === 'created_by') {
        const teamMembers = table.options.meta?.teamMembers || [];
        const val = row.getValue(columnId) || row.original[columnId];
        return normalizeEmployeeName(val, teamMembers);
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
    
    return [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  };

  const multiSelectFilter = (row, columnId, filterValue) => {
    if (!filterValue || filterValue.length === 0) return true;
    
    let val = String(row.getValue(columnId) || '');
    
    if (columnId === 'assigned_to') {
      const teamMembers = table.options.meta?.teamMembers || [];
      const member = teamMembers.find(m => m.user_id === val);
      val = member ? member.emp_name : (val ? 'Unknown' : 'Open Lead (Unassigned)');
    } else if (columnId === 'state_name') {
      val = normalizeStateName(val || row.original.state_name || row.original.state || row.original.business_state);
      const normalizedFilters = (Array.isArray(filterValue) ? filterValue : [filterValue]).map(f => normalizeStateName(f));
      return normalizedFilters.includes(val);
    } else if (columnId === 'district_name') {
      val = normalizeDistrictName(val || row.original.district_name || row.original.district || row.original.business_district);
      const normalizedFilters = (Array.isArray(filterValue) ? filterValue : [filterValue]).map(f => normalizeDistrictName(f));
      return normalizedFilters.includes(val);
    } else if (columnId === 'city_name') {
      val = normalizeCityName(val || row.original.city_name || row.original.city || row.original.business_city);
      const normalizedFilters = (Array.isArray(filterValue) ? filterValue : [filterValue]).map(f => normalizeCityName(f));
      return normalizedFilters.includes(val);
    } else if (columnId === 'latest_emp_name' || columnId === 'entry_by' || columnId === 'created_by') {
      const teamMembers = table.options.meta?.teamMembers || [];
      val = normalizeEmployeeName(val || row.original[columnId], teamMembers);
      const normalizedFilters = (Array.isArray(filterValue) ? filterValue : [filterValue]).map(f => normalizeEmployeeName(f, teamMembers));
      return normalizedFilters.includes(val);
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
    return filters.includes(val);
  };
  
  const finalColumns = useMemo(() => columns.map(c => ({ ...c, filterFn: multiSelectFilter })), []);

  // Filter raw data by stageFilter and Multi-Column Filter Rules (AND / OR)
  const stageFilteredData = useMemo(() => {
    let result = data;
    if (stageFilter && stageFilter !== 'all' && stageFilter !== 'lead_dashboard' && stageFilter !== 'dashboard' && stageFilter !== 'hourly_work') {
      const prefix = stageFilter.split(' - ')[0].replace(/^0/, '') + ';'; // '01' -> '1;', '03' -> '3;'
      result = result.filter(lead => {
        const st = lead.status || '';
        if (prefix === '1;' && (!st || !/^[1-7];/.test(st))) return true;
        return st.startsWith(prefix) || st === stageFilter;
      });
    }

    // Apply Advanced Multi-Column Rules (with AND / OR Logic matching Image 2)
    const ruleKeys = Object.keys(filterRules).filter(k => filterRules[k]?.value && filterRules[k].value.trim() !== '');
    if (ruleKeys.length > 0) {
      result = result.filter(lead => {
        const ruleMatches = ruleKeys.map(key => {
          const rule = filterRules[key];
          let cellVal = String(lead[key] !== undefined && lead[key] !== null ? lead[key] : '').toLowerCase().trim();
          if (key === 'created_at' && lead[key]) {
            cellVal = String(new Date(lead[key]).toLocaleString()).toLowerCase().trim();
          }
          if (key === 'assigned_to') {
            const member = teamMembers.find(m => m.user_id === lead.assigned_to);
            cellVal = member ? member.emp_name.toLowerCase().trim() : (lead.assigned_to ? 'unknown' : 'open lead (unassigned)');
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
          return ruleMatches.some(Boolean);
        } else {
          return ruleMatches.every(Boolean);
        }
      });
    }

    return result;
  }, [data, stageFilter, filterRules, filterConditionType, teamMembers]);

  // Cleanly reset any active column filters when navigating between stage tabs
  useEffect(() => {
    setColumnFilters([]);
  }, [stageFilter]);

  const table = useReactTable({
    data: stageFilteredData,
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
      userName,
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
        if (onLeadsChange) {
          onLeadsChange(processedLead);
        }
      }
    }
  });

  const exportToCSV = () => {
    const canExport = (userRole === 'admin' || userRole === 'Admin' || moduleAccess?.can_export_data === true || canImportExport || moduleAccess?.can_import_export === true || globalRolePermissions?.export);
    if (!canExport) {
      alert('Permission Denied: You do not have permission to export leads data.');
      return;
    }
    // Get the currently filtered rows
    const rows = table.getRowModel().rows;
    if (rows.length === 0) return alert('No data to export');
    
    // Define headers
    const headers = [
      'Lead ID', 'Lead Date', 'Business Type', 'Business Name', 
      'Business Contact in AIO', 'Business Mail in AIO', 
      'CP Name in AIO', 'CP Mobile in AIO', 'CP Mail in AIO', 
      'State', 'District', 'PIN Code', 'City Name', 'Tehsil Name', 'Block Name', 'Lead Priority Type', 'Full Address', 
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
          `"${d.pin_code || ''}"`,
          `"${d.city_name || ''}"`,
          `"${d.tehsil_name || ''}"`,
          `"${d.block_name || ''}"`,
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
    const canImport = (userRole === 'admin' || userRole === 'Admin' || moduleAccess?.can_import_data === true || canImportExport || moduleAccess?.can_import_export === true || globalRolePermissions?.import);
    if (!canImport) {
      alert('Permission Denied: You do not have permission to import leads data.');
      return;
    }
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
        try {
          await logAuditAction('Import Leads', `Imported ${successCount} leads via CSV file`);
        } catch (e) {
          console.error('Audit Log failed', e);
        }
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

  const handleDirectStatusChange = async (lead, newStatus) => {
    const supabase = createClient();
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

    const oldStatus = lead.status || 'New';
    let updates = { status: newStatus };
    let noteText = `Status changed from ${oldStatus} to ${newStatus}`;

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
    const { data: insertedNote, error: noteError } = await supabase.from('lead_notes').insert([{ lead_id: lead.id, note_text: noteText, created_by: actor }]).select().single();
    if (noteError) {
      console.error("Error creating status note:", noteError.message);
    }

    try {
      await logAuditAction('Stage Changed', `Changed status/stage of lead "${lead.company || lead.name || lead.lead_ref_id || lead.id}" to "${newStatus}"`);
    } catch (e) {
      console.error('Audit Log failed', e);
    }
    
    const newNote = insertedNote || {
      id: Date.now(),
      lead_id: lead.id,
      note_text: noteText,
      created_by: actor,
      created_at: new Date().toISOString()
    };
    const updatedRawLead = {
      ...lead,
      ...updates,
      lead_notes: [newNote, ...(lead.lead_notes || [])]
    };
    const processed = processLeads([updatedRawLead], teamMembers)[0];
    setData((current) => current.map(item => item.id === processed.id ? { ...item, ...processed } : item));
    if (onLeadsChange) {
      onLeadsChange(processed);
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

  if (stageFilter === 'lead_dashboard' || stageFilter === 'dashboard' || stageFilter === 'hourly_work') {
    return (
      <div className="card" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
        <LeadDashboard
          leads={initialData}
          teamMembers={teamMembers}
          userRole={userRole}
          userId={userId}
          userName={userName}
          moduleAccess={moduleAccess}
          defaultTab={stageFilter === 'hourly_work' ? 'hourly' : undefined}
          onNavigateStage={(stg) => {
            if (onStageChange) onStageChange(stg);
          }}
          onOpenProfile={(lead, mode) => {
            setProfileMode(mode);
            setSelectedLead(lead);
          }}
        />

        {selectedLead && (
          <LeadProfilePanel
            lead={selectedLead}
            mode={profileMode}
            onClose={() => setSelectedLead(null)}
            teamMembers={teamMembers}
            userRole={userRole}
            userId={userId}
            userName={userName}
            onUpdateLead={(updatedLead) => {
              setData(curr => curr.map(item => item.id === updatedLead.id ? { ...item, ...updatedLead } : item));
              if (onLeadsChange) onLeadsChange(updatedLead);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      
      {/* Search, Filters, and Export Header */}
      <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '0.75rem 1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--bg-primary)' }}>
        
        {/* Left Side: Search, Status Filter & Clear Filters (Stays unified) */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', flex: '1 1 auto', minWidth: 'fit-content' }}>
          <input 
            type="text" 
            placeholder="🔍 Search name, email, phone..." 
            value={globalFilter ?? ''}
            onChange={e => setGlobalFilter(e.target.value)}
            style={{ padding: '0.55rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-light)', minWidth: '180px', width: '220px', fontSize: '0.85rem', background: 'var(--bg-surface)' }}
          />
          {(() => {
            const rawStatusFilter = table.getColumn('status')?.getFilterValue();
            const scalarStatusFilter = Array.isArray(rawStatusFilter)
              ? (rawStatusFilter.length === 1 ? rawStatusFilter[0] : (rawStatusFilter.length > 1 ? '__multiple__' : ''))
              : (rawStatusFilter ?? '');
            
            return (
              <select 
                value={scalarStatusFilter}
                onChange={e => table.getColumn('status')?.setFilterValue(e.target.value || undefined)}
                style={{ padding: '0.55rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-light)', minWidth: '140px', maxWidth: '200px', fontSize: '0.85rem', background: 'var(--bg-surface)' }}
              >
                {scalarStatusFilter === '__multiple__' && (
                  <option value="__multiple__" disabled>{`${rawStatusFilter.length} Statuses Selected`}</option>
                )}
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
            );
          })()}

          {activeFilterCount > 0 && (
            <button
              onClick={handleClearAllFilters}
              title="Reset all active column filters and search queries in one click"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid #fca5a5',
                background: '#fef2f2',
                color: '#dc2626',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              <RotateCcw size={14} />
              <span>Clear All Filters ({activeFilterCount})</span>
            </button>
          )}

        </div>

        {/* Right Side: Columns, Import/Export, Table/Tiles & Add Lead */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
          
          {/* Settings ⚙️ Icon Button with ColumnSelectorModal (Image 1) */}
          <div style={{ position: 'relative' }}>
            {(() => {
              const filterableCols = table.getAllLeafColumns().filter(c => c.id !== 'actions' && c.id !== 'select');
              const leadTableColumns = filterableCols.map(c => ({
                key: c.id,
                label: typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id
              }));
              const leadTableVisibleKeys = filterableCols.filter(c => c.getIsVisible()).map(c => c.id);

              return (
                <>
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
                    columns={leadTableColumns}
                    visibleColumns={leadTableVisibleKeys}
                    onApply={(newVisKeys, newOrderedCols) => {
                      const newVis = {};
                      table.getAllLeafColumns().forEach(col => {
                        newVis[col.id] = newVisKeys.includes(col.id) || col.id === 'actions' || col.id === 'select';
                      });
                      setColumnVisibility(newVis);
                      
                      const newOrderIds = ['select', ...newOrderedCols.map(c => c.key), 'actions'];
                      setColumnOrder(newOrderIds);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('leadTableColumnVisibility', JSON.stringify(newVis));
                        localStorage.setItem('leadTableColumnOrder', JSON.stringify(newOrderIds));
                      }
                    }}
                    onReset={() => {
                      const allColIds = columns.map(c => c.id || c.accessorKey).filter(Boolean);
                      setColumnOrder(allColIds);
                      const allVisible = {};
                      table.getAllLeafColumns().forEach(col => { allVisible[col.id] = true; });
                      setColumnVisibility(allVisible);
                      if (typeof window !== 'undefined') {
                        localStorage.removeItem('leadTableColumnVisibility');
                        localStorage.removeItem('leadTableColumnOrder');
                      }
                    }}
                  />
                </>
              );
            })()}
          </div>

          {/* Filter 🌪️ Icon Button with MultiColumnFilterModal (Image 2) */}
          <div style={{ position: 'relative' }}>
            {(() => {
              const filterableCols = table.getAllLeafColumns().filter(c => c.id !== 'actions' && c.id !== 'select');
              const leadTableColumns = filterableCols.map(c => ({
                key: c.id,
                label: typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id
              }));
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
                    columns={leadTableColumns}
                    filterRules={filterRules}
                    conditionType={filterConditionType}
                    onApply={(newRules, newCond) => {
                      setFilterRules(newRules);
                      setFilterConditionType(newCond);
                    }}
                    onResetAll={() => {
                      setFilterRules({});
                    }}
                    getUniqueValues={getUniqueValues}
                  />
                </>
              );
            })()}
          </div>

          {/* Independent Import & Export Buttons */}
          {(userRole === 'admin' || userRole === 'Admin' || moduleAccess?.can_import_data === true || canImportExport || moduleAccess?.can_import_export === true || globalRolePermissions?.import) && (
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
            </>
          )}

          {(userRole === 'admin' || userRole === 'Admin' || moduleAccess?.can_export_data === true || canImportExport || moduleAccess?.can_import_export === true || globalRolePermissions?.export) && (
            <button onClick={exportToCSV} style={{ padding: '0.6rem 1rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
              📥 Export CSV
            </button>
          )}

          {/* View Mode Toggle: Table vs Tiles */}
          <div 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              background: 'var(--bg-surface)', 
              border: '1px solid var(--border-light)', 
              borderRadius: '8px', 
              padding: '3px',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
              userSelect: 'none'
            }}
          >
            <button
              type="button"
              onClick={() => { setViewMode('table'); localStorage.setItem('crm_lead_view_mode', 'table'); }}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.2s ease',
                background: viewMode === 'table' ? 'var(--accent-color, #3b82f6)' : 'transparent',
                color: viewMode === 'table' ? '#ffffff' : 'var(--text-secondary)'
              }}
              title="Table View"
            >
              <Table size={15} />
              <span>Table</span>
            </button>

            <button
              type="button"
              onClick={() => { setViewMode('tiles'); localStorage.setItem('crm_lead_view_mode', 'tiles'); }}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.2s ease',
                background: viewMode === 'tiles' ? 'var(--accent-color, #3b82f6)' : 'transparent',
                color: viewMode === 'tiles' ? '#ffffff' : 'var(--text-secondary)'
              }}
              title="Tiles View"
            >
              <LayoutGrid size={15} />
              <span>Tiles</span>
            </button>
          </div>

          <button onClick={() => setIsModalOpen(true)} className="btn-primary" style={{ padding: '0.6rem 1.25rem' }}>
            + Add Lead
          </button>
        </div>
      </div>

      {viewMode === 'tiles' || isMobile ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem', alignContent: 'start', backgroundColor: 'var(--bg-primary)' }}>
          {table.getRowModel().rows.length === 0 ? (
            <div className="card" style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No leads found.
            </div>
          ) : (
            table.getRowModel().rows.map((row, idx) => {
              const lead = row.original;
              const cleanClass = (lead.status || '').toLowerCase().replace(/\s+/g, '');
              const cleanLastClass = (lead.last_status || '').toLowerCase().replace(/\s+/g, '');
              const phoneNumbers = getLeadPhoneNumbers(lead);

              return (
                <div 
                  key={row.id} 
                  onClick={() => setActiveRowId(row.id)}
                  style={{
                    backgroundColor: activeRowId === row.id ? 'var(--th-filtered-bg)' : 'var(--bg-surface)',
                    border: `1px solid ${activeRowId === row.id ? 'var(--accent-color)' : 'var(--border-light)'}`,
                    borderRadius: '10px',
                    padding: '1.15rem',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.2s ease'
                  }}
                  className="card-hover-lift"
                >
                  {/* Top Header: Business Name & Client Edit Button */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'nowrap' }}>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProfileMode('edit');
                          setSelectedLead(lead);
                        }}
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '5px',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--accent-color, #2563eb)',
                          border: '1px solid var(--border-light)',
                          cursor: 'pointer',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          flexShrink: 0
                        }}
                        title="Edit Client Registration"
                      >
                        ✏️ Edit
                      </button>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={lead.company || lead.name}>
                        {lead.company || lead.name || 'Unnamed Business'}
                      </h4>
                    </div>

                    {/* CP Name underneath Business Name (if available) */}
                    {lead.name && (
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem', paddingLeft: '0.1rem' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.78rem' }}>👤 CP Name:</span>
                        <span>{lead.name}</span>
                      </div>
                    )}

                    {/* Meta Row: ID -> Date -> Business Type -> Priority */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                      {lead.lead_ref_id && (
                        <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                          ID: {lead.lead_ref_id}
                        </span>
                      )}
                      {lead.lead_date && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                          📅 {lead.lead_date}
                        </span>
                      )}
                      {lead.business_type && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                          🏷️ {lead.business_type}
                        </span>
                      )}
                      {lead.priority && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: (String(lead.priority).toLowerCase().includes('high')) ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-primary)', color: (String(lead.priority).toLowerCase().includes('high')) ? '#dc2626' : 'var(--text-secondary)', border: `1px solid ${(String(lead.priority).toLowerCase().includes('high')) ? '#fca5a5' : 'var(--border-light)'}` }}>
                          ⚡ Priority: {lead.priority}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Multiple Phone Numbers / Contacts Section */}
                  {phoneNumbers.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }} onClick={e => e.stopPropagation()}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 600 }}>
                        📱 Mobile / Contacts ({phoneNumbers.length})
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {phoneNumbers.map((num, nIdx) => (
                          <div 
                            key={num + nIdx} 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '0.35rem', 
                              backgroundColor: 'var(--bg-primary)', 
                              padding: '0.25rem 0.5rem', 
                              borderRadius: '6px', 
                              border: '1px solid var(--border-light)',
                              fontSize: '0.78rem'
                            }}
                          >
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{num}</span>
                            <a 
                              href={`tel:${num}`} 
                              style={{ color: 'var(--accent-color)', textDecoration: 'none', padding: '0 0.15rem', display: 'flex', alignItems: 'center' }} 
                              title={`Call ${num}`}
                            >
                              📞
                            </a>
                            <button 
                              type="button"
                              onClick={() => setWhatsappModalLead({ ...lead, phone: num })} 
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.15rem', display: 'flex', alignItems: 'center' }} 
                              title={`WhatsApp ${num}`}
                            >
                              💬
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Grid details: Assigned To / Last Status, Lead Source / Source Name, Investment Size / Buying Timeline */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '0.55rem 0.75rem', 
                    fontSize: '0.8rem', 
                    color: 'var(--text-secondary)',
                    borderTop: '1px solid var(--border-light)',
                    borderBottom: '1px solid var(--border-light)',
                    padding: '0.65rem 0',
                    margin: '0.15rem 0'
                  }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Assigned To</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                        {(() => {
                          if (!lead.assigned_to) return <span style={{ color: '#94a3b8' }}>Unassigned</span>;
                          const member = (teamMembers || []).find(t => t.user_id === lead.assigned_to);
                          return member ? member.emp_name : lead.assigned_to.substring(0, 8);
                        })()}
                      </span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Last Status</span>
                      {lead.last_status === 'Pending New' ? (
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.45rem', borderRadius: '9999px', backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', display: 'inline-block' }}>
                          Pending New
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.45rem', borderRadius: '9999px', backgroundColor: `var(--status-${cleanLastClass}-bg, #e2e8f0)`, color: `var(--status-${cleanLastClass}-text, #334155)`, border: '1px solid rgba(0,0,0,0.1)', display: 'inline-block', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.last_status}>
                          {lead.last_status?.includes('>') ? lead.last_status.split('>').pop() : (lead.last_status || '—')}
                        </span>
                      )}
                    </div>

                    {/* Lead Source & Source Name */}
                    <div>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Lead Source</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{lead.source || '—'}</span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Source Name</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{lead.source_name || '—'}</span>
                    </div>

                    {/* Investment Size & Buying Timeline */}
                    <div>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Investment Size</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{lead.investment || '—'}</span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Buying Timeline</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{lead.buying_timeline || '—'}</span>
                    </div>
                  </div>

                  {/* Lead Status Dropdown (Positioned directly above Notes / Remark) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }} onClick={e => e.stopPropagation()}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 600 }}>
                      Lead Status
                    </span>
                    <select
                      value={lead.status || 'New'}
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
                          setPendingStatusChange({
                            leadName: lead.company || lead.name || 'this lead',
                            shortName,
                            commit: () => {
                              handleDirectStatusChange(lead, newStatus);
                              setPendingStatusChange(null);
                            },
                            cancel: () => {
                              e.target.value = lead.status || 'New';
                              setPendingStatusChange(null);
                            }
                          });
                          return;
                        }
                        handleDirectStatusChange(lead, newStatus);
                      }}
                      style={{
                        width: '100%',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        backgroundColor: `var(--status-${cleanClass}-bg, #e2e8f0)`,
                        color: `var(--status-${cleanClass}-text, #334155)`,
                        border: '1px solid rgba(0,0,0,0.15)',
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                      title="Change Lead Status"
                    >
                      {(() => {
                        const leadStagePrefix = (lead.status && lead.status.includes(';')) ? lead.status.split(';')[0] + ';' : '1;';
                        const activeFilters = table.getColumn('status')?.getFilterValue();
                        const isAllLeads = (!activeFilters || activeFilters.length === 0) && (!stageFilter || stageFilter === 'all' || stageFilter === 'lead_dashboard');

                        return stages.map((stageObj, i) => {
                          const stageNum = i + 1;
                          const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
                          const isVisible = isAllLeads || parseInt(leadStagePrefix) === stageNum || parseInt(leadStagePrefix) === stageNum - 1;
                          if (!isVisible) return null;

                          return (
                            <optgroup key={`tile-stage-${i}`} label={stageObj.name}>
                              {stageObj.substages.map((sub, j) => {
                                const subNum = String(j + 1).padStart(2, '0');
                                const prefix = `${stageNum};${subNum}>${cleanStageName}>`;
                                const val = sub.startsWith(prefix) ? sub : `${prefix}${sub.includes('>') ? sub.split('>').pop() : sub}`;
                                return (
                                  <option key={val} value={val} style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>
                                    {val}
                                  </option>
                                );
                              })}
                            </optgroup>
                          );
                        });
                      })()}
                    </select>
                  </div>

                  {/* Latest Remark / Note */}
                  {lead.latest_remark && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)', padding: '0.4rem 0.6rem', borderRadius: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.latest_remark}>
                      💬 <strong style={{ color: 'var(--text-primary)' }}>{lead.latest_emp_name || 'Agent'}:</strong> {lead.latest_remark}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '0.4rem', width: '100%', marginTop: '0.2rem' }}>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setWhatsappModalLead(lead);
                      }}
                      style={{
                        flex: 1,
                        padding: '0.45rem',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        color: '#10b981',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'center',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      💬 WhatsApp
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setProfileMode('history');
                        setSelectedLead(lead);
                      }}
                      style={{
                        flex: 1,
                        padding: '0.45rem',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-light)',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.25rem'
                      }}
                      title="Update History & Remarks"
                    >
                      📜 History
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
                  <th key={header.id} className={`table-header-cell ${activeFilterColumn === header.id ? 'active-dropdown' : ''} ${header.column.getIsFiltered() ? 'is-filtered' : ''}`} style={{ position: 'sticky', top: 0, zIndex: activeFilterColumn === header.id ? 99999 : 10, padding: '0.75rem 1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border-light)' }}>
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
                              <div className="column-filter-popup" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '6px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.22)', zIndex: 99999, minWidth: '320px', maxWidth: '480px', width: 'max-content', padding: '0.65rem', fontWeight: 'normal', color: 'var(--text-primary)' }}>
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
                                    <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                      {getUniqueValues(header.id).filter(v => v.toLowerCase().includes(filterSearchText.toLowerCase())).map(val => {
                                        const rawFilterValue = header.column.getFilterValue();
                                        const currentFilterValue = Array.isArray(rawFilterValue) ? rawFilterValue : (rawFilterValue ? [rawFilterValue] : []);
                                        const isChecked = currentFilterValue.includes(val);
                                        return (
                                          <label key={val} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', padding: '0.25rem 0.35rem', borderRadius: '4px', lineHeight: '1.35' }}>
                                            <input 
                                              type="checkbox"
                                              checked={isChecked}
                                              style={{ marginTop: '0.15rem', flexShrink: 0 }}
                                              onChange={() => {
                                                const newValue = isChecked 
                                                  ? currentFilterValue.filter(v => String(v) !== String(val))
                                                  : [...currentFilterValue, val];
                                                header.column.setFilterValue(newValue.length ? newValue : undefined);
                                              }}
                                            />
                                            <span title={val} style={{ wordBreak: 'break-word', whiteSpace: 'normal', flex: 1 }}>{val || '(Blank)'}</span>
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
              <LeadTableRow 
                key={row.id} 
                row={row} 
                idx={idx} 
                activeRowId={activeRowId} 
                onRowClick={setActiveRowId} 
              />
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
              const newSize = Number(e.target.value);
              React.startTransition(() => {
                table.setPageSize(newSize);
              });
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
             const processed = processLeads([updatedRawLead], teamMembers)[0];
             setData((current) => current.map(item => item.id === processed.id ? { ...item, ...processed } : item));
             setSelectedLead(processed);
          }}
        />
      )}
    </div>
  );
}
