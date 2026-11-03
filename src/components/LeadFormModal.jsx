'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { INDIAN_STATES, getDistrictsForState } from '@/constants/indianLocations';

// 🔍 Searchable & Selectable Assignee Dropdown
function SearchableAssignToDropdown({ value, onChange, teamMembers, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  const activeMembers = useMemo(() => {
    const list = (teamMembers || []).filter(m => {
      if (!m.emp_name) return false;
      if (value && (m.user_id === value || m.id === value)) return true;
      const status = String(m.emp_status || m.status || 'Active').toLowerCase().trim();
      if (['inactive', 'terminated', 'resigned', 'trash', 'draft'].includes(status)) return false;
      if (m.is_approved === false) return false;
      if (m.role === 'customer') return false;
      return true;
    });
    return [...list].sort((a, b) => {
      const nameA = (a.emp_name || a.email || '').toLowerCase();
      const nameB = (b.emp_name || b.email || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [teamMembers, value]);

  const selectedMember = useMemo(() => {
    if (!value) return null;
    return activeMembers.find(m => (m.user_id === value || m.id === value));
  }, [value, activeMembers]);

  const selectedDisplayLabel = useMemo(() => {
    if (!value) return 'Unassigned (Open Lead Pool)';
    if (selectedMember) {
      return `${selectedMember.emp_name}${selectedMember.emp_department ? ` (${selectedMember.emp_department})` : ''}`;
    }
    return value;
  }, [value, selectedMember]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return activeMembers;
    const term = search.toLowerCase().trim();
    return activeMembers.filter(m =>
      (m.emp_name && m.emp_name.toLowerCase().includes(term)) ||
      (m.email && m.email.toLowerCase().includes(term)) ||
      (m.emp_department && m.emp_department.toLowerCase().includes(term))
    );
  }, [search, activeMembers]);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      <div 
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.55rem 0.85rem',
          borderRadius: '7px',
          border: '1.5px solid var(--border-light, #e2e8f0)',
          backgroundColor: disabled ? 'var(--bg-secondary, #f8fafc)' : 'var(--bg-surface, #ffffff)',
          color: value ? 'var(--text-primary, #1e293b)' : 'var(--text-secondary, #64748b)',
          fontSize: '0.85rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxSizing: 'border-box',
          minHeight: '38px',
          transition: 'border-color 0.15s ease'
        }}
      >
        <span style={{ 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          whiteSpace: 'nowrap',
          fontWeight: value ? 600 : 400
        }}>
          {selectedDisplayLabel}
        </span>
        <span style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </div>

      {isOpen && (
        <div 
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            backgroundColor: 'var(--bg-surface, #ffffff)',
            borderRadius: '8px',
            border: '1.5px solid var(--border-light, #e2e8f0)',
            boxShadow: '0 12px 28px -4px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)',
            zIndex: 9999,
            maxHeight: '260px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'modalSlideIn 0.12s ease-out'
          }}
        >
          {/* Search Input inside Dropdown */}
          <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-light, #e2e8f0)', backgroundColor: 'var(--bg-secondary, #f8fafc)' }}>
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Search agent by name or dept..."
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                padding: '0.45rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light, #cbd5e1)',
                backgroundColor: 'var(--bg-surface, #ffffff)',
                color: 'var(--text-primary, #0f172a)',
                fontSize: '0.82rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ overflowY: 'auto', flex: 1, maxHeight: '200px' }}>
            {/* Unassigned / Open Pool Option */}
            <div
              onClick={() => {
                onChange('');
                setIsOpen(false);
                setSearch('');
              }}
              style={{
                padding: '0.55rem 0.85rem',
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: !value ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                color: !value ? 'var(--accent-color, #2563eb)' : 'var(--text-secondary, #64748b)',
                fontWeight: !value ? 600 : 400,
                borderBottom: '1px solid var(--border-light, #f1f5f9)'
              }}
            >
              <span>⚪ Unassigned (Open Lead Pool)</span>
              {!value && <span>✓</span>}
            </div>

            {/* Filtered Members List */}
            {filteredMembers.length === 0 ? (
              <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                No matching team members found
              </div>
            ) : (
              filteredMembers.map(m => {
                const id = m.user_id || m.id;
                const isSelected = value === id;
                return (
                  <div
                    key={id}
                    onClick={() => {
                      onChange(id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    style={{
                      padding: '0.55rem 0.85rem',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                      color: isSelected ? 'var(--accent-color, #2563eb)' : 'var(--text-primary, #0f172a)',
                      fontWeight: isSelected ? 600 : 400,
                      transition: 'background-color 0.1s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-secondary, #f8fafc)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{m.emp_name || m.email}</span>
                      {m.emp_department && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)' }}>
                          {m.emp_department}
                        </span>
                      )}
                    </div>
                    {isSelected && <span style={{ color: 'var(--accent-color, #2563eb)' }}>✓</span>}
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

export default function LeadFormModal({ 
  isOpen, 
  onClose,
  userName = '',
  userId = '',
  userCompany = '',
  teamMembers = [],
  onLeadAdded = null
}) {
  const supabase = useMemo(() => createClient(), []);

  // Determine current active workspace company
  const activeCompany = useMemo(() => {
    if (userCompany && userCompany.trim() !== '' && userCompany.toLowerCase() !== 'all') {
      return userCompany;
    }
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('crm_user_company');
        if (stored && stored.toLowerCase() !== 'all') return stored;
      } catch (e) {}
    }
    return 'NSMLR';
  }, [userCompany]);

  const activeUserName = useMemo(() => {
    if (userName && userName.trim() !== '') return userName;
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('crm_user_name');
        if (stored) return stored;
      } catch (e) {}
    }
    return 'Staff';
  }, [userName]);

  // Determine default assignee ID for logged-in user
  const defaultAssigneeId = useMemo(() => {
    if (!teamMembers || teamMembers.length === 0) return '';
    // 1. Match by userId
    if (userId) {
      const match = teamMembers.find(m => (m.user_id === userId || m.id === userId));
      if (match) return match.user_id || match.id;
    }
    // 2. Match by userName
    if (activeUserName && activeUserName.trim() !== '') {
      const match = teamMembers.find(m => 
        (m.emp_name && m.emp_name.toLowerCase().trim() === activeUserName.toLowerCase().trim()) ||
        (m.email && m.email.toLowerCase().trim() === activeUserName.toLowerCase().trim())
      );
      if (match) return match.user_id || match.id;
    }
    // 3. Match from localStorage
    if (typeof window !== 'undefined') {
      try {
        const storedUid = localStorage.getItem('crm_user_id');
        const storedName = localStorage.getItem('crm_user_name');
        if (storedUid) {
          const match = teamMembers.find(m => (m.user_id === storedUid || m.id === storedUid));
          if (match) return match.user_id || match.id;
        }
        if (storedName) {
          const match = teamMembers.find(m => 
            (m.emp_name && m.emp_name.toLowerCase().trim() === storedName.toLowerCase().trim())
          );
          if (match) return match.user_id || match.id;
        }
      } catch (e) {}
    }
    return '';
  }, [teamMembers, userId, activeUserName]);

  const [sources, setSources] = useState([
    'Website', 'Facebook', 'Google Ads', 'IndiaMART', 'TradeIndia', 
    'WhatsApp', 'Phone Call', 'Field Visit', 'Dealer Reference', 
    'Customer Reference', 'Exhibition', 'Other'
  ]);
  const [priorities, setPriorities] = useState([
    'LP00: None', 'LP01: Immediate', 'LP02: High', 'LP03: Medium', 
    'LP04: Low', 'LP05: Cold', 'LP06: Disqualified', 'LP07: Irrelevant', 
    'LP08: Invalid', 'LP09: Spam', 'LP10: Archive', 'LP11: Competitor Dealer', 'LP12: Competitor Distributor'
  ]);
  const [stages, setStages] = useState([
    { name: '01 - New Stage', substages: ['New Lead', 'Assigned', 'Contact Pending'] },
    { name: '02 - Contact Stage', substages: ['Contacted', 'Wrong Number', 'Call not connected', 'No Response', 'ReSchedule'] }
  ]);

  useEffect(() => {
    const loadConfig = () => {
      const saved = localStorage.getItem('crm_config');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.sources) setSources(parsed.sources);
          if (parsed.priorities) setPriorities(parsed.priorities);
          if (parsed.stages && parsed.stages.length > 0 && typeof parsed.stages[0] === 'object' && parsed.stages[0].substages) {
            setStages(parsed.stages);
          }
        } catch (e) { console.error(e); }
      }
    };
    
    if (isOpen) {
      loadConfig();
    }
    
    window.addEventListener('crm_config_updated', loadConfig);
    return () => window.removeEventListener('crm_config_updated', loadConfig);
  }, [isOpen]);

  const [formData, setFormData] = useState({
    // Organization & Scope
    our_company: 'NSMLR',
    assigned_to: '',
    
    // Lead Source & Priority
    source: '',
    source_name: '',
    priority: 'LP03: Medium',
    status: '1;01>New Stage>New Lead',
    
    // Business Details
    company: '',
    business_type: '',
    business_contact_1: '',
    business_email_1: '',
    
    // Contact Person Details
    name: '',
    phone: '',
    email: '',
    
    // Location Details
    state_name: '',
    district_name: '',
    city_name: '',
    pin_code: '',
    
    // Metadata
    entry_by: '',
    created_by: '',
    lead_date: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successLead, setSuccessLead] = useState(null); // When set, renders the success popup with Lead ID!
  const [copied, setCopied] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  // Sync initial state when modal opens
  useEffect(() => {
    if (isOpen) {
      const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      setFormData(prev => ({
        ...prev,
        our_company: activeCompany || 'NSMLR',
        assigned_to: defaultAssigneeId || '',
        entry_by: activeUserName,
        created_by: activeUserName,
        lead_date: todayIST
      }));
      setSuccessLead(null);
      setCopied(false);
      setDuplicateInfo(null);
      setIsCheckingDuplicate(false);
    }
  }, [isOpen, activeCompany, activeUserName, defaultAssigneeId]);

  // Real-time phone duplication check across Contact & Business phone numbers
  useEffect(() => {
    if (!isOpen) return;

    const phone1 = (formData.phone || '').trim();
    const phone2 = (formData.business_contact_1 || '').trim();

    const normalizePhone = (num) => {
      if (!num) return '';
      const digits = String(num).replace(/\D/g, '');
      return digits.length >= 10 ? digits.slice(-10) : digits;
    };

    const norm1 = normalizePhone(phone1);
    const norm2 = normalizePhone(phone2);

    const enteredNumbers = [];
    if (norm1 && norm1.length >= 10) enteredNumbers.push({ label: 'Contact Mobile Number', val: phone1, normVal: norm1 });
    if (norm2 && norm2.length >= 10 && norm2 !== norm1) enteredNumbers.push({ label: 'Business Contact Number', val: phone2, normVal: norm2 });

    if (enteredNumbers.length === 0) {
      setDuplicateInfo(null);
      setIsCheckingDuplicate(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsCheckingDuplicate(true);
        const filters = [];
        const contactColumns = ['phone', 'business_contact_1', 'business_contact_2', 'cp1_mobile_2', 'cp2_mobile_1'];

        enteredNumbers.forEach(({ val, normVal }) => {
          contactColumns.forEach(col => {
            filters.push(`${col}.eq.${normVal}`);
            if (val && val !== normVal) {
              filters.push(`${col}.eq.${val}`);
            }
          });
        });

        const { data, error } = await supabase
          .from('leads')
          .select('id, lead_ref_id, name, company, phone, business_contact_1, status, created_at, created_by, entry_by, assigned_to')
          .or(filters.join(','))
          .limit(1);

        if (!error && data && data.length > 0) {
          const match = data[0];
          setDuplicateInfo({
            id: match.id,
            lead_ref_id: match.lead_ref_id || match.id,
            name: match.name,
            company: match.company,
            status: match.status,
            created_by: match.created_by || match.entry_by || 'Staff',
            entry_by: match.entry_by || 'Staff',
            assigned_to: match.assigned_to,
            matchedNumber: enteredNumbers[0]?.val || ''
          });
        } else {
          setDuplicateInfo(null);
        }
        setIsCheckingDuplicate(false);
      } catch (err) {
        console.warn('Duplicate check note:', err);
        setIsCheckingDuplicate(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [isOpen, formData.phone, formData.business_contact_1, supabase]);

  const districtsList = useMemo(() => {
    if (!formData.state_name) return [];
    return getDistrictsForState(formData.state_name) || [];
  }, [formData.state_name]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleResetForm = () => {
    const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    setFormData({
      our_company: activeCompany || 'NSMLR',
      assigned_to: defaultAssigneeId || '',
      source: '',
      source_name: '',
      priority: 'LP03: Medium',
      status: '1;01>New Stage>New Lead',
      company: '',
      business_type: '',
      business_contact_1: '',
      business_email_1: '',
      name: '',
      phone: '',
      email: '',
      state_name: '',
      district_name: '',
      city_name: '',
      pin_code: '',
      entry_by: activeUserName,
      created_by: activeUserName,
      lead_date: todayIST
    });
    setSuccessLead(null);
    setCopied(false);
    setDuplicateInfo(null);
    setIsCheckingDuplicate(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name?.trim() && !formData.company?.trim()) {
      alert('Please enter at least Contact Person Name or Business Name.');
      return;
    }

    // Duplicate Lead Warning Confirmation Guard
    if (duplicateInfo) {
      const proceed = window.confirm(
        `⚠️ Duplicate Lead Alert!\n\nA lead with matching phone number (${duplicateInfo.matchedNumber}) is already registered in CRM:\n\n` +
        `  • Lead ID: #${duplicateInfo.lead_ref_id}\n` +
        `  • Business Name: ${duplicateInfo.company || 'N/A'}\n` +
        `  • Contact Person: ${duplicateInfo.name || 'N/A'}\n` +
        `  • Current Status: ${duplicateInfo.status || 'Active'}\n` +
        `  • Assigned Agent: ${getAssigneeLabel(duplicateInfo.assigned_to)}\n` +
        `  • Created By: ${duplicateInfo.created_by}\n\n` +
        `Do you still want to register this duplicate lead?`
      );
      if (!proceed) {
        return;
      }
    }

    setIsSubmitting(true);
    
    try {
      const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const nowIso = new Date().toISOString();
      
      const payload = {
        ...formData,
        name: formData.name?.trim() || formData.company?.trim() || 'New Lead',
        company: formData.company?.trim() || '',
        phone: formData.phone?.trim() || '',
        email: formData.email?.trim() || '',
        our_company: formData.our_company || activeCompany || 'NSMLR',
        entry_by: activeUserName,
        created_by: activeUserName,
        assigned_to: formData.assigned_to ? formData.assigned_to : null,
        lead_date: formData.lead_date || todayIST,
        created_at: nowIso,
        updated_at: nowIso
      };

      const { data, error } = await supabase
        .from('leads')
        .insert([payload])
        .select();
        
      if (error) {
        throw error;
      }
      
      let savedLead = data && data[0] ? data[0] : null;
      
      if (savedLead) {
        // Generate stable formatted lead_ref_id
        if (!savedLead.lead_ref_id) {
          try {
            const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true });
            const dateStr = todayIST.replace(/-/g, '');
            const seq = String(count || 1).padStart(7, '0');
            const newFormattedId = dateStr + seq;
            const { data: updatedData } = await supabase
              .from('leads')
              .update({ lead_ref_id: newFormattedId })
              .eq('id', savedLead.id)
              .select();
            if (updatedData && updatedData[0]) {
              savedLead = updatedData[0];
            } else {
              savedLead.lead_ref_id = newFormattedId;
            }
          } catch (refErr) {
            console.warn('Ref ID generation note:', refErr);
          }
        }
        
        // Log initial registration note
        try {
          await supabase.from('lead_notes').insert([{
            lead_id: savedLead.id,
            note_text: `Lead registered via Instant Lead Registration by ${activeUserName}` + (savedLead.assigned_to ? ` (Assigned to ${savedLead.assigned_to})` : ''),
            created_by: activeUserName
          }]);
        } catch (noteErr) {
          console.warn('Could not insert initial lead note:', noteErr);
        }

        // Inform parent table so user sees lead immediately at the top
        if (onLeadAdded) {
          onLeadAdded(savedLead);
        }

        // 🌟 Show Success Popup with Lead ID!
        setSuccessLead(savedLead);
      }

      setIsSubmitting(false);
    } catch (err) {
      setIsSubmitting(false);
      alert('Error registering lead: ' + (err.message || 'Unknown error'));
    }
  };

  const getAssigneeLabel = (assignedId) => {
    if (!assignedId) return 'Unassigned (Open Lead Pool)';
    const m = (teamMembers || []).find(tm => tm.user_id === assignedId || tm.id === assignedId);
    return m ? `${m.emp_name}${m.emp_department ? ` (${m.emp_department})` : ''}` : assignedId;
  };

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
    padding: '0.625rem 0.85rem',
    borderRadius: '7px',
    border: '1.5px solid var(--border-light, #e2e8f0)',
    backgroundColor: 'var(--bg-surface, #ffffff)',
    color: 'var(--text-primary, #1e293b)',
    fontSize: '0.85rem',
    outline: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
  };

  const labelStyle = {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--text-secondary, #64748b)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    marginBottom: '0.3rem'
  };

  const sectionHeadingStyle = {
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--accent-color, #2563eb)',
    paddingBottom: '0.4rem',
    borderBottom: '1px solid var(--border-light, #e2e8f0)',
    marginTop: '0.5rem',
    marginBottom: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem'
  };

  return (
    <div 
      style={{ 
        position: 'fixed', 
        inset: 0, 
        backgroundColor: 'rgba(15, 23, 42, 0.65)', 
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        zIndex: 1050,
        padding: '1rem',
        boxSizing: 'border-box'
      }}
    >
      <div 
        className="card" 
        style={{ 
          width: '100%', 
          maxWidth: successLead ? '520px' : '740px', 
          maxHeight: '90vh',
          backgroundColor: 'var(--bg-surface, #ffffff)',
          borderRadius: '14px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px var(--border-light, #e2e8f0)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'modalSlideIn 0.18s ease-out',
          transition: 'max-width 0.2s ease'
        }}
      >
        {/* ================= SUCCESS VIEW POPUP (Lead ID Display) ================= */}
        {successLead ? (
          <div style={{ padding: '2rem 1.75rem', textAlign: 'center' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#dcfce7',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              margin: '0 auto 1rem auto',
              boxShadow: '0 8px 16px -4px rgba(22, 163, 74, 0.2)'
            }}>
              ✓
            </div>

            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-primary, #0f172a)' }}>
              Lead Registered Successfully!
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', margin: '0 0 1.25rem 0' }}>
              The lead has been recorded and placed at the top of your CRM pipeline.
            </p>

            {/* Generated Lead ID Card with 1-Click Copy */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(59, 130, 246, 0.03))',
              border: '1.5px solid rgba(37, 99, 235, 0.25)',
              borderRadius: '10px',
              padding: '0.9rem 1.1rem',
              margin: '0 auto 1.25rem auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              textAlign: 'left'
            }}>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent-color, #2563eb)' }}>
                  Generated Lead ID
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-primary, #0f172a)', letterSpacing: '0.04em' }}>
                  #{successLead.lead_ref_id || successLead.id}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(String(successLead.lead_ref_id || successLead.id));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                style={{
                  padding: '0.45rem 0.8rem',
                  borderRadius: '7px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  backgroundColor: copied ? '#dcfce7' : 'var(--bg-surface, #ffffff)',
                  color: copied ? '#16a34a' : 'var(--text-primary, #0f172a)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s ease'
                }}
                title="Copy Lead ID to clipboard"
              >
                {copied ? '✓ Copied' : '📋 Copy ID'}
              </button>
            </div>

            {/* Summary Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.65rem',
              padding: '0.9rem',
              backgroundColor: 'var(--bg-secondary, #f8fafc)',
              borderRadius: '8px',
              border: '1px solid var(--border-light, #e2e8f0)',
              textAlign: 'left',
              fontSize: '0.82rem',
              marginBottom: '1.5rem'
            }}>
              <div>
                <span style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.72rem', display: 'block' }}>Contact Person</span>
                <strong style={{ color: 'var(--text-primary, #0f172a)' }}>{successLead.name || '—'}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.72rem', display: 'block' }}>Business Name</span>
                <strong style={{ color: 'var(--text-primary, #0f172a)' }}>{successLead.company || '—'}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.72rem', display: 'block' }}>Assigned Agent</span>
                <strong style={{ color: 'var(--accent-color, #2563eb)' }}>
                  {getAssigneeLabel(successLead.assigned_to)}
                </strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.72rem', display: 'block' }}>Lead Status</span>
                <strong style={{ color: 'var(--text-primary, #0f172a)' }}>
                  {successLead.status?.includes('>') ? successLead.status.split('>').pop() : successLead.status}
                </strong>
              </div>
            </div>

            {/* Success Actions */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={handleResetForm}
                style={{
                  padding: '0.625rem 1.25rem',
                  borderRadius: '8px',
                  border: '1.5px solid var(--border-light, #e2e8f0)',
                  backgroundColor: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-primary, #0f172a)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                + Add Another Lead
              </button>

              <button
                type="button"
                className="btn-primary"
                onClick={onClose}
                style={{
                  padding: '0.625rem 1.6rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Done / View Table
              </button>
            </div>
          </div>
        ) : (
          /* ================= MAIN REGISTRATION FORM ================= */
          <>
            {/* Header */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '1.1rem 1.6rem',
              borderBottom: '1px solid var(--border-light, #e2e8f0)',
              backgroundColor: 'var(--bg-surface, #ffffff)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '9px',
                  backgroundColor: 'rgba(37, 99, 235, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-color, #2563eb)',
                  fontSize: '1.15rem'
                }}>
                  ⚡
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
                    Instant Lead Registration
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)', margin: '0.15rem 0 0 0' }}>
                    Capture and register a new lead directly into your CRM workspace
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={onClose} 
                disabled={isSubmitting}
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  fontSize: '1.4rem', 
                  cursor: isSubmitting ? 'not-allowed' : 'pointer', 
                  color: 'var(--text-secondary, #64748b)',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '6px',
                  transition: 'background-color 0.15s ease'
                }}
                title="Close"
              >
                &times;
              </button>
            </div>
            
            {/* Scrollable Form Body */}
            <form 
              onSubmit={handleSubmit} 
              style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                flex: 1, 
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '1.25rem 1.6rem',
                gap: '1rem',
                boxSizing: 'border-box'
              }}
            >
              {/* ⚠️ Real-time Duplicate Lead Warning Alert Banner */}
              {duplicateInfo && (
                <div style={{
                  padding: '0.85rem 1.1rem',
                  borderRadius: '10px',
                  backgroundColor: '#fff1f2',
                  border: '1.5px solid #fecdd3',
                  display: 'flex',
                  gap: '0.85rem',
                  alignItems: 'flex-start',
                  animation: 'modalSlideIn 0.2s ease-out'
                }}>
                  <div style={{ fontSize: '1.35rem', lineHeight: 1 }}>⚠️</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#9f1239', fontSize: '0.88rem' }}>
                        Duplicate Lead Alert!
                      </span>
                      <span style={{ 
                        fontSize: '0.78rem', 
                        padding: '0.15rem 0.55rem', 
                        borderRadius: '5px', 
                        backgroundColor: '#fee2e2', 
                        color: '#991b1b', 
                        fontFamily: 'monospace', 
                        fontWeight: 700 
                      }}>
                        #{duplicateInfo.lead_ref_id}
                      </span>
                    </div>
                    <p style={{ margin: '0.35rem 0 0.5rem 0', fontSize: '0.82rem', color: '#881337', lineHeight: 1.4 }}>
                      A lead with mobile number <code>{duplicateInfo.matchedNumber}</code> is already registered as <strong>{duplicateInfo.company || duplicateInfo.name || 'Unnamed Lead'}</strong> with Status: <strong>{duplicateInfo.status?.split('>')?.pop() || duplicateInfo.status || 'Active'}</strong>.
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.76rem' }}>
                      <span style={{ padding: '0.2rem 0.5rem', borderRadius: '5px', backgroundColor: '#ffffff', border: '1px solid #fecdd3', color: '#9f1239' }}>
                        👤 <strong>Created By:</strong> {duplicateInfo.created_by}
                      </span>
                      <span style={{ padding: '0.2rem 0.5rem', borderRadius: '5px', backgroundColor: '#ffffff', border: '1px solid #fecdd3', color: '#9f1239' }}>
                        🎯 <strong>Assigned To:</strong> {getAssigneeLabel(duplicateInfo.assigned_to)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {isCheckingDuplicate && !duplicateInfo && (
                <div style={{ fontSize: '0.78rem', color: 'var(--accent-color, #2563eb)', display: 'flex', alignItems: 'center', gap: '0.4rem', paddingLeft: '0.2rem' }}>
                  <span style={{ display: 'inline-block', width: '10px', height: '10px', border: '2px solid var(--accent-color, #2563eb)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}></span>
                  Checking for duplicate mobile numbers in database...
                </div>
              )}

              {/* Section 1: Scope & Assignment */}
              <div>
                <div style={sectionHeadingStyle}>
                  🏢 <span>Scope & Assignment</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Our Company / Branch</label>
                    <select 
                      name="our_company" 
                      value={formData.our_company} 
                      onChange={handleChange} 
                      style={inputStyle}
                    >
                      <option value="NSMLR">NSMLR</option>
                      <option value="NSTLP">NSTLP</option>
                      {activeCompany && !['NSMLR', 'NSTLP'].includes(activeCompany) && (
                        <option value={activeCompany}>{activeCompany}</option>
                      )}
                    </select>
                  </div>

                  {/* 🔍 Searchable Assign To Dropdown with Logged-in User Default */}
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>
                      Assign To (Agent)
                      {defaultAssigneeId && formData.assigned_to === defaultAssigneeId && (
                        <span style={{ 
                          fontSize: '0.7rem', 
                          padding: '0.1rem 0.4rem', 
                          borderRadius: '4px', 
                          backgroundColor: 'rgba(37, 99, 235, 0.1)', 
                          color: 'var(--accent-color, #2563eb)',
                          marginLeft: 'auto',
                          fontWeight: 600
                        }}>
                          Default: You
                        </span>
                      )}
                    </label>
                    <SearchableAssignToDropdown
                      value={formData.assigned_to}
                      onChange={(newVal) => setFormData(prev => ({ ...prev, assigned_to: newVal }))}
                      teamMembers={teamMembers}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Lead Source & Pipeline Status */}
              <div>
                <div style={sectionHeadingStyle}>
                  📌 <span>Lead Source & Status</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Lead Source</label>
                    <select name="source" value={formData.source} onChange={handleChange} style={inputStyle}>
                      <option value="">Select Lead Source</option>
                      {sources.map(src => (
                        <option key={src} value={src}>{src}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Source Name</label>
                    <input 
                      type="text" 
                      name="source_name" 
                      value={formData.source_name} 
                      onChange={handleChange} 
                      placeholder="e.g. Website, Campaign, Referral" 
                      style={inputStyle} 
                    />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Lead Status</label>
                    <select name="status" value={formData.status} onChange={handleChange} style={inputStyle}>
                      {stages.map((stageObj, i) => {
                        const stageNum = i + 1;
                        const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
                        return (
                          <React.Fragment key={`stage-${i}`}>
                            <option disabled style={{ fontWeight: 'bold', color: '#64748b', background: 'var(--bg-secondary, #f1f5f9)' }}>
                              {stageObj.name}
                            </option>
                            {stageObj.substages.map((sub, j) => {
                              const subNum = String(j + 1).padStart(2, '0');
                              const prefix = `${stageNum};${subNum}>${cleanStageName}>`;
                              const val = sub.startsWith(prefix) ? sub : `${prefix}${sub.includes('>') ? sub.split('>').pop() : sub}`;
                              return <option key={val} value={val}>&nbsp;&nbsp;{sub.includes('>') ? sub.split('>').pop() : sub}</option>;
                            })}
                          </React.Fragment>
                        );
                      })}
                    </select>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Lead Priority Type</label>
                    <select name="priority" value={formData.priority} onChange={handleChange} style={inputStyle}>
                      <option value="">Select Priority</option>
                      {priorities.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3: Contact Person Details */}
              <div>
                <div style={sectionHeadingStyle}>
                  👤 <span>Contact Person Information</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>
                      Contact Person Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input 
                      type="text" 
                      name="name" 
                      value={formData.name} 
                      onChange={handleChange} 
                      placeholder="Full name of contact person" 
                      required 
                      style={inputStyle} 
                    />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>
                      <span>Contact Mobile Number</span>
                      {duplicateInfo && (
                        <span style={{ color: '#e11d48', fontSize: '0.72rem', marginLeft: 'auto', fontWeight: 600 }}>
                          ⚠️ Duplicate Found
                        </span>
                      )}
                    </label>
                    <input 
                      type="tel" 
                      name="phone" 
                      value={formData.phone} 
                      onChange={handleChange} 
                      placeholder="10-digit mobile number" 
                      style={{
                        ...inputStyle,
                        borderColor: duplicateInfo ? '#f43f5e' : 'var(--border-light, #e2e8f0)',
                        backgroundColor: duplicateInfo ? '#fff1f2' : 'var(--bg-surface, #ffffff)'
                      }} 
                    />
                  </div>

                  <div style={{ minWidth: 0, gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Contact Email Address</label>
                    <input 
                      type="email" 
                      name="email" 
                      value={formData.email} 
                      onChange={handleChange} 
                      placeholder="contact@company.com" 
                      style={inputStyle} 
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Business / Client Organization */}
              <div>
                <div style={sectionHeadingStyle}>
                  💼 <span>Business / Organization Details</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Business Name</label>
                    <input 
                      type="text" 
                      name="company" 
                      value={formData.company} 
                      onChange={handleChange} 
                      placeholder="Company / Firm / Trading name" 
                      style={inputStyle} 
                    />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Business Type</label>
                    <select name="business_type" value={formData.business_type} onChange={handleChange} style={inputStyle}>
                      <option value="">Select Business Type</option>
                      <option value="Dealer">Dealer</option>
                      <option value="Distributor">Distributor</option>
                      <option value="Retailer">Retailer</option>
                      <option value="Farmer">Farmer</option>
                      <option value="Trader">Trader</option>
                      <option value="Manufacturer">Manufacturer</option>
                      <option value="Service Provider">Service Provider</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>
                      <span>Business Contact Number</span>
                      {duplicateInfo && (
                        <span style={{ color: '#e11d48', fontSize: '0.72rem', marginLeft: 'auto', fontWeight: 600 }}>
                          ⚠️ Duplicate Found
                        </span>
                      )}
                    </label>
                    <input 
                      type="tel" 
                      name="business_contact_1" 
                      value={formData.business_contact_1} 
                      onChange={handleChange} 
                      placeholder="Office / landline / business phone" 
                      style={{
                        ...inputStyle,
                        borderColor: duplicateInfo ? '#f43f5e' : 'var(--border-light, #e2e8f0)',
                        backgroundColor: duplicateInfo ? '#fff1f2' : 'var(--bg-surface, #ffffff)'
                      }} 
                    />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Business Email ID</label>
                    <input 
                      type="email" 
                      name="business_email_1" 
                      value={formData.business_email_1} 
                      onChange={handleChange} 
                      placeholder="business@domain.com" 
                      style={inputStyle} 
                    />
                  </div>
                </div>
              </div>

              {/* Section 5: Location Details */}
              <div>
                <div style={sectionHeadingStyle}>
                  📍 <span>Location Details</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>State / UT</label>
                    <select 
                      name="state_name" 
                      value={formData.state_name || ''} 
                      onChange={(e) => {
                        const newSt = e.target.value;
                        setFormData(prev => ({ ...prev, state_name: newSt, district_name: '' }));
                      }}
                      style={inputStyle}
                    >
                      <option value="">Select State / UT ({INDIAN_STATES.length})</option>
                      {INDIAN_STATES.map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>District Name</label>
                    <select 
                      name="district_name" 
                      value={formData.district_name || ''} 
                      onChange={handleChange} 
                      disabled={!formData.state_name}
                      style={{
                        ...inputStyle,
                        backgroundColor: !formData.state_name ? 'var(--bg-secondary, #f8fafc)' : 'var(--bg-surface, #ffffff)',
                        cursor: !formData.state_name ? 'not-allowed' : 'default'
                      }}
                    >
                      <option value="">
                        {formData.state_name 
                          ? (districtsList.length > 0 ? `Select District (${districtsList.length})` : 'Select District...') 
                          : 'Select State First'}
                      </option>
                      {districtsList.map(dt => (
                        <option key={dt} value={dt}>{dt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Footer inside form */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-end', 
                alignItems: 'center', 
                gap: '0.85rem', 
                marginTop: '0.75rem', 
                paddingTop: '1rem',
                borderTop: '1px solid var(--border-light, #e2e8f0)'
              }}>
                <button 
                  type="button" 
                  onClick={onClose} 
                  disabled={isSubmitting}
                  style={{ 
                    padding: '0.625rem 1.25rem', 
                    border: '1.5px solid var(--border-light, #e2e8f0)', 
                    borderRadius: '8px', 
                    background: 'var(--bg-surface, #ffffff)', 
                    color: 'var(--text-secondary, #475569)',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer', 
                    fontWeight: 600,
                    fontSize: '0.85rem'
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={isSubmitting} 
                  style={{ 
                    padding: '0.625rem 1.5rem',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}></span>
                      Registering Lead...
                    </>
                  ) : (
                    'Register Lead'
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

