'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ChevronDown, ChevronUp, Save, Briefcase, MapPin, User, FileText, CheckCircle2, Upload, Download, X } from 'lucide-react';
import Papa from 'papaparse';
import { getTeamMembers } from '@/app/actions/team';
import { logAuditAction } from '@/app/actions/audit';
import { getStatesCentral, getDistrictsCentral } from '@/app/actions/centralLocationMaster';
import { INDIAN_STATES, getDistrictsForState } from '@/constants/indianLocations';

const IMPORT_FIELDS = [
  { key: 'lead_date', label: 'Lead Date', standardHeaders: ['Lead Date', 'leaddate', 'date'] },
  { key: 'our_company', label: 'Our Company Name', standardHeaders: ['Our Company Name', 'Our Company', 'companyname'] },
  { key: 'source', label: 'Lead Source', standardHeaders: ['Lead Source', 'source'] },
  { key: 'source_name', label: 'Source Name', standardHeaders: ['Source Name', 'sourcename'] },
  { key: 'entry_by', label: 'Entry By', standardHeaders: ['Entry By', 'entryby'] },
  { key: 'status', label: 'Client Status', standardHeaders: ['Client Status', 'status'] },
  { key: 'priority', label: 'Lead Priority Type', standardHeaders: ['Lead Priority Type', 'priority'] },
  { key: 'company', label: 'Business Name', standardHeaders: ['Business Name', 'BusinessName', 'company'] },
  { key: 'business_type', label: 'Business Type', standardHeaders: ['Business Type', 'businesstype'] },
  { key: 'business_gst', label: 'Business GST', standardHeaders: ['Business GST', 'gst', 'gstin'] },
  { key: 'business_contact_1', label: 'Business Contact 1', standardHeaders: ['Business Contact 1', 'contact1'] },
  { key: 'business_contact_2', label: 'Business Contact 2', standardHeaders: ['Business Contact 2', 'contact2'] },
  { key: 'business_alt_1', label: 'Business Alt 1', standardHeaders: ['Business Alt 1', 'alt1'] },
  { key: 'business_alt_2', label: 'Business Alt 2', standardHeaders: ['Business Alt 2', 'alt2'] },
  { key: 'business_email_1', label: 'Business Email 1', standardHeaders: ['Business Email 1', 'email1'] },
  { key: 'business_email_2', label: 'Business Email 2', standardHeaders: ['Business Email 2', 'email2'] },
  { key: 'business_alt_email_1', label: 'Business Alt Email 1', standardHeaders: ['Business Alt Email 1', 'altemail1'] },
  { key: 'business_alt_email_2', label: 'Business Alt Email 2', standardHeaders: ['Business Alt Email 2', 'altemail2'] },
  { key: 'name', label: 'CP1 Name', standardHeaders: ['CP1 Name', 'Name', 'cpname', 'cp1name'] },
  { key: 'phone', label: 'CP1 Mobile 1', standardHeaders: ['CP1 Mobile 1', 'Phone', 'Mobile', 'cp1mobile1'] },
  { key: 'cp1_mobile_2', label: 'CP1 Mobile 2', standardHeaders: ['CP1 Mobile 2', 'cpmobile2'] },
  { key: 'cp1_alt_1', label: 'CP1 Alt 1', standardHeaders: ['CP1 Alt 1'] },
  { key: 'cp1_alt_2', label: 'CP1 Alt 2', standardHeaders: ['CP1 Alt 2'] },
  { key: 'email', label: 'CP1 Email 1', standardHeaders: ['CP1 Email 1', 'Email', 'cp1email1'] },
  { key: 'cp1_email_2', label: 'CP1 Email 2', standardHeaders: ['CP1 Email 2'] },
  { key: 'cp2_name', label: 'CP2 Name', standardHeaders: ['CP2 Name'] },
  { key: 'cp2_mobile_1', label: 'CP2 Mobile 1', standardHeaders: ['CP2 Mobile 1'] },
  { key: 'cp2_mobile_2', label: 'CP2 Mobile 2', standardHeaders: ['CP2 Mobile 2'] },
  { key: 'cp2_alt_1', label: 'CP2 Alt 1', standardHeaders: ['CP2 Alt 1'] },
  { key: 'cp2_alt_2', label: 'CP2 Alt 2', standardHeaders: ['CP2 Alt 2'] },
  { key: 'cp2_email_1', label: 'CP2 Email 1', standardHeaders: ['CP2 Email 1'] },
  { key: 'cp2_email_2', label: 'CP2 Email 2', standardHeaders: ['CP2 Email 2'] },
  { key: 'cp3_name', label: 'CP3 Name', standardHeaders: ['CP3 Name'] },
  { key: 'cp3_mobile_1', label: 'CP3 Mobile 1', standardHeaders: ['CP3 Mobile 1'] },
  { key: 'cp3_mobile_2', label: 'CP3 Mobile 2', standardHeaders: ['CP3 Mobile 2'] },
  { key: 'cp3_alt_1', label: 'CP3 Alt 1', standardHeaders: ['CP3 Alt 1'] },
  { key: 'cp3_alt_2', label: 'CP3 Alt 2', standardHeaders: ['CP3 Alt 2'] },
  { key: 'cp3_email_1', label: 'CP3 Email 1', standardHeaders: ['CP3 Email 1'] },
  { key: 'cp3_email_2', label: 'CP3 Email 2', standardHeaders: ['CP3 Email 2'] },
  { key: 'state_name', label: 'State', standardHeaders: ['State', 'statename'] },
  { key: 'district_name', label: 'District', standardHeaders: ['District', 'districtname'] },
  { key: 'pin_code', label: 'PIN Code', standardHeaders: ['PIN Code', 'pincode', 'zip', 'zipcode'] },
  { key: 'city_name', label: 'City', standardHeaders: ['City', 'cityname'] },
  { key: 'tehsil_name', label: 'Tehsil', standardHeaders: ['Tehsil', 'tehsilname'] },
  { key: 'block_name', label: 'Block', standardHeaders: ['Block', 'blockname'] },
  { key: 'address', label: 'Full Address', standardHeaders: ['Full Address', 'Address', 'fulladdress'] },
  { key: 'requirement', label: 'Requirement', standardHeaders: ['Requirement'] },
  { key: 'investment', label: 'Investment', standardHeaders: ['Investment'] },
  { key: 'buying_timeline', label: 'Buying Timeline', standardHeaders: ['Buying Timeline', 'buyingtimeline'] }
];

const SAMPLE_DATA = [
  [
    '2026-06-27', 'Swan Enterprises', 'Google Ads', 'Search Campaign', 'admin', '1;01>New Stage>New Lead', 'LP02: High Priority',
    'Apex Retailers Ltd', 'Retailer', '07AAAAA1111A1Z1', '9876543210', '9876543211',
    '', '', 'info@apexretail.com', '', '', '',
    'Rahul Sharma', '9876543210', '', '', '', 'rahul@apexretail.com', '',
    'Amit Sharma', '9876543212', '', '', '', '', '',
    '', '', '', '', '', '', '',
    'Delhi', 'New Delhi', '110001', 'New Delhi', 'Chanakyapuri', 'Delhi', '12, Connaught Place, New Delhi',
    'Wants to source wholesale goods', '1 Lakh - 5 Lakh', 'Immediate'
  ],
  [
    '2026-06-26', 'Swan Enterprises', 'Organic', 'Google Search', 'admin', '3;01>Qualification Stage>Interested', 'LP03: Medium Priority',
    'Global Distributors', 'Distributor', '09BBBBB2222B2Z2', '8765432109', '',
    '', '', 'purchase@globaldist.com', '', '', '',
    'Sanjay Verma', '8765432109', '', '', '', 'sanjay@globaldist.com', '',
    '', '', '', '', '', '', '',
    '', '', '', '', '', '', '',
    'Uttar Pradesh', 'Noida', '201301', 'Noida', 'Dadri', 'Noida', 'Sector 62, Noida, UP',
    'Requires bulk materials supply', '10 Lakh - 25 Lakh', 'Within 15 Days'
  ],
  [
    '2026-06-25', 'Swan Enterprises', 'WhatsApp', 'Inbound Chat', 'user1', '2;01>Contact Stage>Contacted', 'LP04: Low Priority',
    'Tech Solutions', 'Service Provider', '', '7654321098', '',
    '', '', 'contact@techsol.com', '', '', '',
    'Preeti Sen', '7654321098', '', '', '', 'preeti@techsol.com', '',
    '', '', '', '', '', '', '',
    '', '', '', '', '', '', '',
    'Haryana', 'Gurugram', '122018', 'Gurugram', 'Gurgaon', 'Gurugram', 'Sohna Road, Gurugram, HR',
  ]
];

// Searchable Dropdown for Lead Entry By (Allows Top Manual Entry + Filtered Selection)
function SearchableEntryByDropdown({ value, onChange, teamMembers }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value || '');
  const dropdownRef = useRef(null);

  useEffect(() => {
    setSearch(value || '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredMembers = useMemo(() => {
    let list = teamMembers;
    if (search.trim()) {
      const term = search.toLowerCase();
      list = teamMembers.filter(m => 
        (m.emp_name && m.emp_name.toLowerCase().includes(term)) ||
        (m.email && m.email.toLowerCase().includes(term)) ||
        (m.emp_department && m.emp_department.toLowerCase().includes(term))
      );
    }
    return [...list].sort((a, b) => {
      const nameA = (a.emp_name || a.email || '').toLowerCase();
      const nameB = (b.emp_name || b.email || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [search, teamMembers]);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          autoComplete="off"
          value={search}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          placeholder="Search or type entry by name..."
          style={{
            width: '100%',
            padding: '0.6rem 2.2rem 0.6rem 0.8rem',
            borderRadius: '6px',
            border: '1px solid var(--border-light)',
            fontSize: '0.9rem',
            outline: 'none',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)'
          }}
        />
        <ChevronDown 
          size={16} 
          onClick={() => setIsOpen(!isOpen)}
          style={{ 
            position: 'absolute', 
            right: '0.75rem', 
            color: 'var(--text-secondary)', 
            pointerEvents: 'auto',
            cursor: 'pointer' 
          }} 
        />
      </div>
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '105%',
          left: 0,
          minWidth: 'max(100%, 280px)',
          maxWidth: '360px',
          maxHeight: '230px',
          overflowY: 'auto',
          overflowX: 'hidden',
          background: 'var(--bg-surface, #ffffff)',
          border: '1px solid var(--border-light, #e2e8f0)',
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.18)',
          zIndex: 9999
        }}>
          {search.trim() && (
            <div
              onClick={() => {
                onChange(search.trim());
                setIsOpen(false);
              }}
              style={{
                padding: '0.65rem 0.8rem',
                cursor: 'pointer',
                fontWeight: 600,
                color: '#2563eb',
                borderBottom: '1px solid var(--border-light, #e2e8f0)',
                background: '#eff6ff',
                fontSize: '0.88rem',
                wordBreak: 'break-word'
              }}
            >
              ➕ Manual Entry: "{search.trim()}"
            </div>
          )}

          {filteredMembers.length > 0 ? (
            filteredMembers.map((m) => (
              <div
                key={m.user_id || m.id || m.email}
                onClick={() => {
                  const val = m.emp_name || m.email;
                  setSearch(val);
                  onChange(val);
                  setIsOpen(false);
                }}
                style={{
                  padding: '0.6rem 0.88rem',
                  cursor: 'pointer',
                  fontSize: '0.88rem',
                  borderBottom: '1px solid rgba(0,0,0,0.04)',
                  color: 'var(--text-primary)',
                  wordBreak: 'break-word',
                  whiteSpace: 'normal'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-primary, #f8fafc)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{m.emp_name || m.email}</div>
                {m.emp_department && (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{m.emp_department}</div>
                )}
              </div>
            ))
          ) : (
            !search.trim() && (
              <div style={{ padding: '0.65rem 0.8rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                No team members found
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// Searchable Dropdown for Assign To (Strict Registered Active Team Selection ONLY)
function SearchableAssignToDropdown({ value, onChange, teamMembers }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const activeMembers = useMemo(() => {
    const list = teamMembers.filter(m => m.emp_name && (m.emp_status === 'Active' || (!m.emp_status && m.role !== 'customer')));
    return [...list].sort((a, b) => {
      const nameA = (a.emp_name || a.email || '').toLowerCase();
      const nameB = (b.emp_name || b.email || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [teamMembers]);

  const selectedMemberName = useMemo(() => {
    if (!value) return '';
    const found = activeMembers.find(m => (m.user_id === value || m.id === value));
    return found ? (found.emp_name + (found.emp_department ? ` (${found.emp_department})` : '')) : value;
  }, [value, activeMembers]);

  const [search, setSearch] = useState(selectedMemberName);

  useEffect(() => {
    setSearch(selectedMemberName);
  }, [selectedMemberName]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch(selectedMemberName);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedMemberName]);

  const filteredMembers = useMemo(() => {
    if (!search || search === selectedMemberName) return activeMembers;
    const term = search.toLowerCase();
    return activeMembers.filter(m =>
      (m.emp_name && m.emp_name.toLowerCase().includes(term)) ||
      (m.email && m.email.toLowerCase().includes(term)) ||
      (m.emp_department && m.emp_department.toLowerCase().includes(term))
    );
  }, [search, selectedMemberName, activeMembers]);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          autoComplete="off"
          value={search}
          onFocus={() => {
            setIsOpen(true);
            setSearch('');
          }}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          placeholder="Search agent to assign..."
          style={{
            width: '100%',
            padding: '0.6rem 2.2rem 0.6rem 0.8rem',
            borderRadius: '6px',
            border: '1px solid var(--border-light)',
            fontSize: '0.9rem',
            outline: 'none',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)'
          }}
        />
        <ChevronDown 
          size={16} 
          onClick={() => setIsOpen(!isOpen)}
          style={{ 
            position: 'absolute', 
            right: '0.75rem', 
            color: 'var(--text-secondary)', 
            pointerEvents: 'auto',
            cursor: 'pointer' 
          }} 
        />
      </div>
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '105%',
          left: 0,
          minWidth: 'max(100%, 280px)',
          maxWidth: '360px',
          maxHeight: '230px',
          overflowY: 'auto',
          overflowX: 'hidden',
          background: 'var(--bg-surface, #ffffff)',
          border: '1px solid var(--border-light, #e2e8f0)',
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.18)',
          zIndex: 9999
        }}>
          {/* Unassigned Option */}
          <div
            onClick={() => {
              onChange('');
              setSearch('');
              setIsOpen(false);
            }}
            style={{
              padding: '0.65rem 0.8rem',
              cursor: 'pointer',
              fontWeight: 500,
              color: '#64748b',
              borderBottom: '1px solid var(--border-light, #e2e8f0)',
              background: !value ? '#f1f5f9' : 'transparent',
              fontSize: '0.88rem'
            }}
          >
            ⚪ Open Lead (Unassigned)
          </div>

          {filteredMembers.length > 0 ? (
            filteredMembers.map((m) => {
              const memberId = m.user_id || m.id;
              const isSelected = value === memberId;
              return (
                <div
                  key={memberId}
                  onClick={() => {
                    onChange(memberId);
                    setIsOpen(false);
                  }}
                  style={{
                    padding: '0.6rem 0.88rem',
                    cursor: 'pointer',
                    fontSize: '0.88rem',
                    background: isSelected ? '#eef2ff' : 'transparent',
                    color: isSelected ? '#4338ca' : 'var(--text-primary)',
                    borderBottom: '1px solid rgba(0,0,0,0.04)',
                    wordBreak: 'break-word',
                    whiteSpace: 'normal'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--bg-primary, #f8fafc)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: isSelected ? '#4338ca' : 'var(--text-primary)' }}>
                    {m.emp_name} {m.emp_department ? `(${m.emp_department})` : ''}
                  </div>
                  {m.email && <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{m.email}</div>}
                </div>
              );
            })
          ) : (
            <div style={{ padding: '0.65rem 0.8rem', fontSize: '0.85rem', color: '#ef4444' }}>
              No registered active team member found
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ClientRegistration({ onRegistrationSuccess, initialData = null, isEditMode = false, onClose = null }) {
  const supabase = createClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bulk Importer States
  const [importFile, setImportFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [showImporter, setShowImporter] = useState(false);
  const [importerStep, setImporterStep] = useState('mapping'); // 'mapping' | 'preview'
  const [previewRows, setPreviewRows] = useState([]);
  const [duplicatesCount, setDuplicatesCount] = useState(0);
  const [filteredImportData, setFilteredImportData] = useState([]);
  const [expandedSections, setExpandedSections] = useState({
    leadInfo: true,
    businessInfo: true,
    cp1: true,
    cp2: false,
    cp3: false,
    location: true,
    requirements: true
  });
  
  const [teamMembers, setTeamMembers] = useState([]);
  const [dbExtraStates, setDbExtraStates] = useState([]);

  useEffect(() => {
    async function loadStates() {
      try {
        const res = await getStatesCentral();
        if (res && Array.isArray(res) && res.length > 0) {
          const existing = new Set(INDIAN_STATES.map(s => s.toLowerCase()));
          const extra = res.filter(s => s.state_name && !existing.has(s.state_name.toLowerCase()));
          setDbExtraStates(extra);
        }
      } catch (err) {
        console.error("Failed to load states from DB:", err);
      }
    }
    loadStates();
  }, []);

  useEffect(() => {
    async function loadTeam() {
      try {
        const response = await getTeamMembers();
        if (response && Array.isArray(response) && response.length > 0) {
          setTeamMembers(response);
          return;
        } else if (response?.data && Array.isArray(response.data) && response.data.length > 0) {
          setTeamMembers(response.data);
          return;
        }
      } catch (error) {
        console.warn("Server action getTeamMembers failed, using Supabase client fallback:", error);
      }

      // Fallback query directly via Supabase client to prevent page crash on Server Action desync
      try {
        const { data: dbMembers } = await supabase
          .from('user_roles')
          .select('*')
          .order('created_at', { ascending: true });
        if (dbMembers && Array.isArray(dbMembers)) {
          setTeamMembers(dbMembers.map(u => ({
            ...u,
            emp_status: u.emp_status || (u.module_access && u.module_access.emp_status) || 'Active'
          })));
        }
      } catch (fallbackErr) {
        console.error("Direct fallback load team failed:", fallbackErr);
      }
    }
    loadTeam();
  }, [supabase]);

  const [sources, setSources] = useState(['Website', 'Facebook', 'Google Ads', 'IndiaMART', 'TradeIndia', 'WhatsApp', 'Phone Call', 'Field Visit', 'Dealer Reference', 'Customer Reference', 'Exhibition', 'Other']);
  const [clientStatuses, setClientStatuses] = useState(['None', 'Hot', 'Warm', 'Cold', 'Active', 'InActive', 'Hold', 'In-Progress']);
  const [priorities, setPriorities] = useState([
    'LP00: None', 'LP01: Immediate', 'LP02: High', 'LP03: Medium', 
    'LP04: Low', 'LP05: Cold', 'LP06: Disqualified', 'LP07: Irrelevant', 
    'LP08: Invalid', 'LP09: Spam', 'LP10: Archive', 'LP11: Competitor Dealer', 'LP12: Competitor Distributor'
  ]);

  useEffect(() => {
    const loadConfig = () => {
      const saved = localStorage.getItem('crm_config');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.sources) setSources(parsed.sources);
          if (parsed.clientStatuses) setClientStatuses(parsed.clientStatuses);
          if (parsed.priorities) setPriorities(parsed.priorities);
        } catch (e) { console.error(e); }
      }
    };
    
    loadConfig();
    window.addEventListener('crm_config_updated', loadConfig);
    return () => window.removeEventListener('crm_config_updated', loadConfig);
  }, []);

  const [formData, setFormData] = useState({
    // Lead Info
    assigned_to: '',
    our_company: '',
    lead_date: new Date().toISOString().split('T')[0],
    source: '',
    source_name: '',
    entry_by: '',
    status: 'None',
    priority: '',
    
    // Business Info
    business_type: '',
    business_gst: '',
    company: '', // Using existing column for Business_Name
    business_contact_1: '',
    business_contact_2: '',
    business_alt_1: '',
    business_alt_2: '',
    business_email_1: '',
    business_email_2: '',
    business_alt_email_1: '',
    business_alt_email_2: '',
    
    // Contact Person 1 (Map primary name, phone, email to existing columns)
    name: '', // CP1 Name
    phone: '', // CP1 Mobile 1
    cp1_mobile_2: '',
    cp1_alt_1: '',
    cp1_alt_2: '',
    email: '', // CP1 Mail 1
    cp1_email_2: '',
    
    // Contact Person 2
    cp2_name: '',
    cp2_mobile_1: '',
    cp2_mobile_2: '',
    cp2_alt_1: '',
    cp2_alt_2: '',
    cp2_email_1: '',
    cp2_email_2: '',
    
    // Contact Person 3
    cp3_name: '',
    cp3_mobile_1: '',
    cp3_mobile_2: '',
    cp3_alt_1: '',
    cp3_alt_2: '',
    cp3_email_1: '',
    cp3_email_2: '',
    
    // Location
    state_name: '',
    district_name: '',
    pin_code: '',
    city_name: '',
    tehsil_name: '',
    block_name: '',
    address: '',
    
    // Requirements & Deal
    requirement: '',
    investment: '',
    buying_timeline: ''
  });

  // 100% synchronous, instant, infallible state list (never empty, never cleared)
  const statesList = useMemo(() => {
    return [
      ...INDIAN_STATES.map(name => ({ state_name: name })),
      ...dbExtraStates
    ].sort((a, b) => a.state_name.localeCompare(b.state_name));
  }, [dbExtraStates]);

  // 100% synchronous, instant district list matching selected state
  const districtsList = useMemo(() => {
    if (!formData.state_name) return [];
    const dists = getDistrictsForState(formData.state_name) || [];
    return dists.map(name => ({ district_name: name }));
  }, [formData.state_name]);


  useEffect(() => {
    if (isEditMode && initialData) {
      // Convert any null values from database to empty strings to prevent React warnings
      const safeData = { ...initialData };
      for (let key in safeData) {
        if (safeData[key] === null) {
          safeData[key] = '';
        }
      }
      
      setFormData(prev => ({
        ...prev,
        ...safeData
      }));
    }
  }, [initialData, isEditMode]);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const actor = user?.email?.split('@')[0] || 'Unknown';
      
      const payload = {
        ...formData
      };
      
      // Convert empty strings back to null ONLY for date/uuid fields to avoid breaking NOT NULL text constraints
      for (const key in payload) {
        if (payload[key] === '' && (key.endsWith('_date') || key.endsWith('_at') || key.endsWith('timestamp') || key === 'assigned_to')) {
          payload[key] = null;
        }
      }

      // Remove fields that shouldn't be saved to DB
      delete payload.lead_formatted_id;
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.sr_no;
      delete payload.last_status;
      delete payload.latest_remark;
      delete payload.latest_emp_name;
      delete payload.completion_count;
      delete payload.last_follow_up_duration;
      delete payload.last_timestamp;
      delete payload.next_follow_up_date;
      delete payload.lead_notes;
      // Remove virtual AIO fields
      delete payload.business_contact_aio;
      delete payload.business_email_aio;
      delete payload.cp_name_aio;
      delete payload.cp_mobile_aio;
      delete payload.cp_email_aio;

      if (isEditMode && initialData) {
        // UPDATE MODE
        const { error } = await supabase.from('leads').update(payload).eq('id', initialData.id);
        if (error) throw error;

        await supabase.from('lead_notes').insert([{
          lead_id: initialData.id,
          note_text: 'Client Profile was updated.',
          created_by: actor
        }]);
        
        try {
          await logAuditAction('Update Lead', `Updated Lead ID: ${initialData.id} (${payload.company || payload.name || 'Unknown'})`);
        } catch(e) { console.error('Audit Log failed', e); }
        
        alert('Client Updated Successfully!');
        if (onRegistrationSuccess) onRegistrationSuccess();
        if (onClose) onClose();
      } else {
        // INSERT MODE
        payload.created_by = actor;
        const { data, error } = await supabase.from('leads').insert([payload]).select();
        
        if (error) throw error;
        
        // Log initial history
        if (data && data.length > 0) {
          const newLead = data[0];
          // Get the total count of leads to calculate the stable 15-digit Lead ID
          const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true });
          const d = new Date(newLead.created_at || new Date());
          const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
          const seq = String(count).padStart(7, '0');
          const newFormattedId = dateStr + seq;
          
          // Save the persistent ID back to the database
          await supabase.from('leads').update({ lead_ref_id: newFormattedId }).eq('id', newLead.id);
          
          await supabase.from('lead_notes').insert([{
            lead_id: newLead.id,
            note_text: 'Client Registration Form Submitted',
            created_by: actor
          }]);
          
          try {
            await logAuditAction('Create Lead', `Created New Lead: ${payload.company || payload.name || 'Unknown'}`);
          } catch(e) { console.error('Audit Log failed', e); }
        }
        
        alert('Client Registered Successfully!');
        if (onRegistrationSuccess) onRegistrationSuccess();
        
        // Reset form (keeping defaults)
        setFormData(prev => ({
          ...prev,
          source_name: '', entry_by: '', business_type: '', business_gst: '', company: '', priority: '', our_company: '',
          business_contact_1: '', business_contact_2: '', business_alt_1: '', business_alt_2: '',
          business_email_1: '', business_email_2: '', business_alt_email_1: '', business_alt_email_2: '',
          name: '', phone: '', cp1_mobile_2: '', cp1_alt_1: '', cp1_alt_2: '', email: '', cp1_email_2: '',
          cp2_name: '', cp2_mobile_1: '', cp2_mobile_2: '', cp2_alt_1: '', cp2_alt_2: '', cp2_email_1: '', cp2_email_2: '',
          cp3_name: '', cp3_mobile_1: '', cp3_mobile_2: '', cp3_alt_1: '', cp3_alt_2: '', cp3_email_1: '', cp3_email_2: '',
          state_name: '', district_name: '', pin_code: '', city_name: '', tehsil_name: '', block_name: '', address: '',
          requirement: '', investment: '', buying_timeline: ''
        }));
        window.scrollTo(0, 0);
      }

    } catch (err) {
      console.error(err);
      alert('Error saving client: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const { saveAs } = await import('file-saver');

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Client Registration');

      const headers = IMPORT_FIELDS.map(f => f.label);

      sheet.addRow(headers);
      
      // Style headers
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      
      // Set column widths
      sheet.columns.forEach(column => { column.width = 20; });

      // Add Sample Data Rows
      SAMPLE_DATA.forEach(row => {
        sheet.addRow(row);
      });

      // Add Data Validation Dropdowns for first 100 rows
      for (let i = 2; i <= 100; i++) {
        // Our Company Name (Column 2)
        sheet.getCell(i, 2).dataValidation = {
          type: 'list', allowBlank: true,
          formulae: ['"NSMLR,NSTLP"']
        };
        // Lead Source (Column 3)
        sheet.getCell(i, 3).dataValidation = {
          type: 'list', allowBlank: true,
          formulae: [`"${sources.join(',')}"`]
        };
        // Client Status (Column 6)
        sheet.getCell(i, 6).dataValidation = {
          type: 'list', allowBlank: true,
          formulae: [`"${clientStatuses.join(',')}"`]
        };
        // Lead Priority Type (Column 7)
        sheet.getCell(i, 7).dataValidation = {
          type: 'list', allowBlank: true,
          formulae: [`"${priorities.join(',')}"`]
        };
        // Business Type (Column 9)
        sheet.getCell(i, 9).dataValidation = {
          type: 'list', allowBlank: true,
          formulae: ['"Dealer,Distributor,Retailer,Farmer,Trader,Manufacturer,Service Provider,Other"']
        };
        // Investment (Column 48)
        sheet.getCell(i, 48).dataValidation = {
          type: 'list', allowBlank: true,
          formulae: ['"Below 1 Lakh,1 Lakh - 5 Lakh,5 Lakh - 10 Lakh,10 Lakh - 25 Lakh,25 Lakh - 50 Lakh,Above 50 Lakh"']
        };
        // Buying Timeline (Column 49)
        sheet.getCell(i, 49).dataValidation = {
          type: 'list', allowBlank: true,
          formulae: ['"Immediate,Within 7 Days,Within 15 Days,Within 30 Days,Within 60 Days,After 60 Days,Not Decided"']
        };
      }

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), 'Client_Registration_Template.xlsx');
    } catch (err) {
      console.error("Error generating Excel template:", err);
      alert("Could not generate Excel template.");
    }
  };

  const handleDownloadCsvTemplate = async () => {
    try {
      const { saveAs } = await import('file-saver');
      const headers = IMPORT_FIELDS.map(f => f.label);
      
      const csvRowsList = [
        headers.join(','),
        ...SAMPLE_DATA.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ];
      const csvContent = csvRowsList.join('\n') + '\n';
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, 'Client_Registration_Template.csv');
    } catch (err) {
      console.error("Error generating CSV template:", err);
      alert("Could not generate CSV template.");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      let headers = [];
      let rows = [];

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        const arrayBuffer = await file.arrayBuffer();
        await workbook.xlsx.load(arrayBuffer);
        const worksheet = workbook.worksheets[0];
        
        const worksheetHeaders = [];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
          worksheetHeaders[colNumber] = cell.value ? String(cell.value).trim() : '';
        });
        headers = worksheetHeaders.filter(Boolean);

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // skip header
          const rowData = {};
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = worksheetHeaders[colNumber];
            if (header) {
              let val = cell.value;
              if (val instanceof Date) {
                val = val.toISOString().split('T')[0];
              } else if (val && typeof val === 'object' && val.text) {
                val = val.text;
              }
              rowData[header] = val ? String(val).trim() : '';
            }
          });
          if (Object.values(rowData).some(v => v !== '')) {
            rows.push(rowData);
          }
        });
      } else {
        const csvText = await file.text();
        const Papa = (await import('papaparse')).default;
        const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
        headers = result.meta.fields || Object.keys(result.data[0] || {});
        rows = result.data;
      }

      if (rows.length === 0) {
        alert("The selected file is empty!");
        return;
      }

      setImportFile(file);
      setCsvHeaders(headers);
      setCsvRows(rows);
      
      // Auto detect mapping
      const newMapping = {};
      IMPORT_FIELDS.forEach(field => {
        const match = headers.find(h => {
          const cleanHeader = String(h).trim().toLowerCase().replace(/[\s_-]/g, '');
          const cleanLabel = field.label.toLowerCase().replace(/[\s_-]/g, '');
          const cleanKey = field.key.toLowerCase().replace(/[\s_-]/g, '');
          const cleanStandards = field.standardHeaders.map(s => s.toLowerCase().replace(/[\s_-]/g, ''));
          
          return cleanHeader === cleanLabel || cleanHeader === cleanKey || cleanStandards.includes(cleanHeader);
        });
        newMapping[field.key] = match || '';
      });
      setMapping(newMapping);
      
      setImporterStep('mapping');
      setShowImporter(true);
    } catch (err) {
      console.error(err);
      alert('Error parsing file: ' + err.message);
    } finally {
      e.target.value = null; // Clear file input
    }
  };

  const handleProceedToPreview = async () => {
    // Check if CP1 Mobile 1 field is mapped (critical for duplicates checking)
    const phoneMappedHeader = mapping['phone'];
    if (!phoneMappedHeader) {
      if (!confirm("Warning: You have not mapped 'CP1 Mobile 1'. Duplicates checking will be skipped and all rows will be imported. Do you want to proceed?")) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const actor = user?.email?.split('@')[0] || 'Unknown';

      const formatCsvDate = (dateStr) => {
        if (!dateStr) return new Date().toISOString().split('T')[0];
        const cleanStr = String(dateStr).trim();
        const parts = cleanStr.split('-');
        if (parts.length === 3 && parts[0].length <= 2 && parts[2].length === 4) {
          return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        const slashParts = cleanStr.split('/');
        if (slashParts.length === 3 && slashParts[0].length <= 2 && slashParts[2].length === 4) {
          return `${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
        }
        return cleanStr;
      };

      // Map rows based on current mapping configuration
      const mapped = csvRows.map(row => {
        const leadObj = {};
        IMPORT_FIELDS.forEach(field => {
          const csvHeader = mapping[field.key];
          leadObj[field.key] = csvHeader ? (row[csvHeader] || '') : '';
        });
        
        // Special formatting
        leadObj.lead_date = formatCsvDate(leadObj.lead_date);
        if (!leadObj.status) leadObj.status = 'None';
        leadObj.created_by = actor;
        
        return leadObj;
      });

      let filtered = mapped;
      let duplicates = 0;

      if (phoneMappedHeader) {
        // Query database for duplicates by phone
        let existingLeads = [];
        let fetchPage = 0;
        while (true) {
          const { data: pageData, error: fetchErr } = await supabase
            .from('leads')
            .select('phone')
            .range(fetchPage * 1000, (fetchPage + 1) * 1000 - 1);
          
          if (fetchErr) throw fetchErr;
          if (pageData && pageData.length > 0) {
            existingLeads = [...existingLeads, ...pageData];
          }
          if (!pageData || pageData.length < 1000) break;
          fetchPage++;
        }
        
        const existingPhones = new Set(existingLeads.map(l => String(l.phone).trim()).filter(Boolean));

        // Filter out duplicates
        filtered = mapped.filter(row => {
          if (!row.phone) return true;
          return !existingPhones.has(String(row.phone).trim());
        });
        duplicates = mapped.length - filtered.length;
      }

      setDuplicatesCount(duplicates);
      setFilteredImportData(filtered);
      setPreviewRows(mapped.slice(0, 5));
      setImporterStep('preview');
    } catch (err) {
      console.error(err);
      alert("Error checking duplicates: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmImport = async () => {
    setIsSubmitting(true);
    try {
      const chunkSize = 500;
      for (let i = 0; i < filteredImportData.length; i += chunkSize) {
        const chunk = filteredImportData.slice(i, i + chunkSize);
        const { data: insertedData, error } = await supabase.from('leads').insert(chunk).select();
        if (error) {
          console.error(`Error inserting chunk ${i} to ${i + chunkSize}:`, error);
          throw new Error(`Failed to upload chunk starting at row ${i + 1}. Error: ${error.message}`);
        }
        
        // Update lead_ref_id for the inserted chunk
        if (insertedData && insertedData.length > 0) {
          const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true });
          const startCount = count - insertedData.length;
          
          // Sort insertedData by created_at to assign sequence numbers in correct order
          const sortedInserted = [...insertedData].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
          
          await Promise.all(sortedInserted.map(async (lead, idx) => {
            const d = new Date(lead.created_at || new Date());
            const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
            const seq = String(startCount + idx + 1).padStart(7, '0');
            const newFormattedId = dateStr + seq;
            await supabase.from('leads').update({ lead_ref_id: newFormattedId }).eq('id', lead.id);
          }));
        }
      }

      alert(`Successfully uploaded ${filteredImportData.length} new clients!\n${duplicatesCount > 0 ? `(${duplicatesCount} duplicates were safely skipped)` : ''}`);
      setShowImporter(false);
      if (onRegistrationSuccess) onRegistrationSuccess();
    } catch (err) {
      console.error(err);
      alert('Error uploading file: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderInput = (label, name, type = 'text', required = false) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
        {label} {required && <span style={{color: 'red'}}>*</span>}
      </label>
      <input 
        type={type} 
        name={name} 
        value={formData[name]} 
        onChange={handleChange} 
        required={required}
        style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
      />
    </div>
  );

  return (
    <div style={{ width: '100%', flex: 1, overflowY: 'auto', paddingRight: '0.5rem', paddingBottom: '2rem' }}>
      <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
        
        {/* Header with Upload Tools */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-primary)' }}>
            <CheckCircle2 size={24} color="var(--accent-color)" />
            {isEditMode ? 'Edit Client Profile' : 'New Client Registration'}
          </h2>
          
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {!isEditMode && (
              <>
                <div style={{ display: 'flex', gap: '0.25rem', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '2px', background: 'var(--bg-surface)' }}>
                  <button 
                    type="button"
                    onClick={handleDownloadTemplate}
                    style={{ padding: '0.4rem 0.8rem', background: 'none', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}
                    title="Download Excel Template"
                  >
                    <Download size={14} /> Template (.xlsx)
                  </button>
                  <button 
                    type="button"
                    onClick={handleDownloadCsvTemplate}
                    style={{ padding: '0.4rem 0.8rem', background: 'none', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}
                    title="Download CSV Template"
                  >
                    <Download size={14} /> Template (.csv)
                  </button>
                </div>
                <label style={{ padding: '0.5rem 1rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                  <Upload size={16} /> Bulk Upload CSV
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </>
            )}
            {isEditMode && onClose && (
              <button onClick={onClose} type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--th-bg)' }}><X size={20} color="var(--text-secondary)" /></button>
            )}
          </div>
        </div>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* GROUP 1: Lead Info */}
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'visible', position: 'relative', zIndex: 10 }}>
            <button type="button" onClick={() => toggleSection('leadInfo')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--bg-primary)', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><FileText size={18} /> 01 - Lead Information</div>
              {expandedSections.leadInfo ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {expandedSections.leadInfo && (
              <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: 'var(--bg-surface)' }}>
                {renderInput('Lead Date', 'lead_date', 'date', true)}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Our Company Name <span style={{color: 'red'}}>*</span></label>
                  <select name="our_company" value={formData.our_company} onChange={handleChange} required style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}>
                    <option value="">Select Company</option>
                    <option value="NSMLR">NSMLR</option>
                    <option value="NSTLP">NSTLP</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Lead Source</label>
                  <select name="source" value={formData.source} onChange={handleChange} style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}>
                    <option value="">Select Lead Source</option>
                    {sources.map(src => (
                      <option key={src} value={src}>{src}</option>
                    ))}
                  </select>
                </div>
                {renderInput('Source Name', 'source_name', 'text')}
                {/* Lead Entry By - Custom Search & Dropdown (Top Manual Entry Allowed) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Lead Entry By</label>
                  <SearchableEntryByDropdown
                    value={formData.entry_by || ''}
                    onChange={(val) => setFormData(prev => ({ ...prev, entry_by: val }))}
                    teamMembers={teamMembers}
                  />
                </div>

                {/* Assigned To Row - Strict Custom Search & Dropdown ONLY (No Manual Option) */}
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Assign To (Agent)</label>
                  <SearchableAssignToDropdown
                    value={formData.assigned_to || ''}
                    onChange={(val) => setFormData(prev => ({ ...prev, assigned_to: val }))}
                    teamMembers={teamMembers}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Client Status</label>
                  <select name="status" value={formData.status} onChange={handleChange} style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}>
                    {clientStatuses.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Lead Priority Type</label>
                  <select name="priority" value={formData.priority} onChange={handleChange} style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}>
                    <option value="">Select Priority</option>
                    {priorities.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* GROUP 2: Business Info */}
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
            <button type="button" onClick={() => toggleSection('businessInfo')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--bg-primary)', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Briefcase size={18} /> 02 - Business Details</div>
              {expandedSections.businessInfo ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {expandedSections.businessInfo && (
              <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: 'var(--bg-surface)' }}>
                {renderInput('Business Name', 'company', 'text', true)}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Business Type</label>
                  <select name="business_type" value={formData.business_type} onChange={handleChange} style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}>
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
                {renderInput('Business GST', 'business_gst')}
                {renderInput('Contact Number 1', 'business_contact_1')}
                {renderInput('Contact Number 2', 'business_contact_2')}
                {renderInput('Alternate Number 1', 'business_alt_1')}
                {renderInput('Alternate Number 2', 'business_alt_2')}
                {renderInput('Mail ID 1', 'business_email_1', 'email')}
                {renderInput('Mail ID 2', 'business_email_2', 'email')}
                {renderInput('Alternate Mail ID 1', 'business_alt_email_1', 'email')}
                {renderInput('Alternate Mail ID 2', 'business_alt_email_2', 'email')}
              </div>
            )}
          </div>

          {/* GROUP 3: Contact Person 1 */}
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
            <button type="button" onClick={() => toggleSection('cp1')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--bg-primary)', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><User size={18} /> 03 - Contact Person 1 (Primary)</div>
              {expandedSections.cp1 ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {expandedSections.cp1 && (
              <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: 'var(--bg-surface)' }}>
                {renderInput('Name', 'name', 'text', true)}
                {renderInput('Mobile Number 1', 'phone', 'text', true)}
                {renderInput('Mobile Number 2', 'cp1_mobile_2')}
                {renderInput('Alternate Number 1', 'cp1_alt_1')}
                {renderInput('Alternate Number 2', 'cp1_alt_2')}
                {renderInput('Mail ID 1', 'email', 'email')}
                {renderInput('Alternate Mail ID 1', 'cp1_email_2', 'email')}
              </div>
            )}
          </div>

          {/* GROUP 4: Contact Person 2 */}
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
            <button type="button" onClick={() => toggleSection('cp2')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--bg-primary)', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><User size={18} /> 04 - Contact Person 2</div>
              {expandedSections.cp2 ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {expandedSections.cp2 && (
              <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: 'var(--bg-surface)' }}>
                {renderInput('Name', 'cp2_name')}
                {renderInput('Mobile Number 1', 'cp2_mobile_1')}
                {renderInput('Mobile Number 2', 'cp2_mobile_2')}
                {renderInput('Alternate Number 1', 'cp2_alt_1')}
                {renderInput('Alternate Number 2', 'cp2_alt_2')}
                {renderInput('Mail ID 1', 'cp2_email_1', 'email')}
                {renderInput('Alternate Mail ID 1', 'cp2_email_2', 'email')}
              </div>
            )}
          </div>

          {/* GROUP 5: Contact Person 3 */}
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
            <button type="button" onClick={() => toggleSection('cp3')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--bg-primary)', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><User size={18} /> 05 - Contact Person 3</div>
              {expandedSections.cp3 ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {expandedSections.cp3 && (
              <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: 'var(--bg-surface)' }}>
                {renderInput('Name', 'cp3_name')}
                {renderInput('Mobile Number 1', 'cp3_mobile_1')}
                {renderInput('Mobile Number 2', 'cp3_mobile_2')}
                {renderInput('Alternate Number 1', 'cp3_alt_1')}
                {renderInput('Alternate Number 2', 'cp3_alt_2')}
                {renderInput('Mail ID 1', 'cp3_email_1', 'email')}
                {renderInput('Alternate Mail ID 1', 'cp3_email_2', 'email')}
              </div>
            )}
          </div>

          {/* GROUP 6: Location */}
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
            <button type="button" onClick={() => toggleSection('location')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--bg-primary)', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><MapPin size={18} /> 06 - Location Details</div>
              {expandedSections.location ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {expandedSections.location && (
              <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: 'var(--bg-surface)' }}>
                {/* State Dropdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>State Name</label>
                  <select
                    name="state_name"
                    value={formData.state_name || ''}
                    onChange={(e) => {
                      const newSt = e.target.value;
                      setFormData(prev => ({ ...prev, state_name: newSt, district_name: '' }));
                    }}
                    style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
                  >
                    <option value="">Select State / UT ({statesList.length})</option>
                    {statesList.map((st) => (
                      <option key={st.id || st.state_name} value={st.state_name}>
                        {st.state_name}
                      </option>
                    ))}
                    {formData.state_name && !statesList.some(s => s.state_name?.toLowerCase() === formData.state_name?.toLowerCase()) && (
                      <option value={formData.state_name}>{formData.state_name}</option>
                    )}
                  </select>
                </div>

                {/* District Dropdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>District Name</label>
                  <select
                    name="district_name"
                    value={formData.district_name || ''}
                    onChange={handleChange}
                    disabled={!formData.state_name}
                    style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: !formData.state_name ? 'var(--bg-secondary)' : 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
                  >
                    <option value="">
                      {formData.state_name 
                        ? (districtsList.length > 0 ? `Select District (${districtsList.length})` : 'Select District...') 
                        : 'Select State First'}
                    </option>
                    {districtsList.map((dt) => (
                      <option key={dt.id || dt.district_name} value={dt.district_name}>
                        {dt.district_name}
                      </option>
                    ))}
                    {formData.district_name && !districtsList.some(d => d.district_name?.toLowerCase() === formData.district_name?.toLowerCase()) && (
                      <option value={formData.district_name}>{formData.district_name}</option>
                    )}
                  </select>
                </div>

                {renderInput('PIN Code', 'pin_code')}
                {renderInput('City Name', 'city_name')}
                {renderInput('Tehsil Name', 'tehsil_name')}
                {renderInput('Block Name', 'block_name')}
                <div style={{ gridColumn: '1 / -1' }}>
                  {renderInput('Full Address', 'address')}
                </div>
              </div>
            )}
          </div>

          {/* GROUP 7: Requirements */}
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
            <button type="button" onClick={() => toggleSection('requirements')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--bg-primary)', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><FileText size={18} /> 07 - Requirement & Timeline</div>
              {expandedSections.requirements ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {expandedSections.requirements && (
              <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: 'var(--bg-surface)' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  {renderInput('Detailed Requirement', 'requirement')}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Investment Size</label>
                  <select name="investment" value={formData.investment} onChange={handleChange} style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}>
                    <option value="">Select Investment</option>
                    <option value="Below 1 Lakh">Below 1 Lakh</option>
                    <option value="1 Lakh - 5 Lakh">1 Lakh - 5 Lakh</option>
                    <option value="5 Lakh - 10 Lakh">5 Lakh - 10 Lakh</option>
                    <option value="10 Lakh - 25 Lakh">10 Lakh - 25 Lakh</option>
                    <option value="25 Lakh - 50 Lakh">25 Lakh - 50 Lakh</option>
                    <option value="Above 50 Lakh">Above 50 Lakh</option>
                  </select>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Buying Timeline</label>
                  <select name="buying_timeline" value={formData.buying_timeline} onChange={handleChange} style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}>
                    <option value="">Select Buying Timeline</option>
                    <option value="Immediate">Immediate</option>
                    <option value="Within 7 Days">Within 7 Days</option>
                    <option value="Within 15 Days">Within 15 Days</option>
                    <option value="Within 30 Days">Within 30 Days</option>
                    <option value="Within 60 Days">Within 60 Days</option>
                    <option value="After 60 Days">After 60 Days</option>
                    <option value="Not Decided">Not Decided</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              type="submit" 
              disabled={isSubmitting}
              style={{ 
                padding: '0.75rem 2rem', 
                backgroundColor: 'var(--accent-color)', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                fontSize: '1rem', 
                fontWeight: 600, 
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Save size={20} />
              {isSubmitting ? (isEditMode ? 'Updating...' : 'Registering...') : (isEditMode ? 'Update Client' : 'Register Client')}
            </button>
          </div>

        </form>
      </div>

      {/* Bulk Importer Modal */}
      {showImporter && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Upload size={20} color="var(--accent-color)" /> CSV Bulk Importer
              </h3>
              <button onClick={() => setShowImporter(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem', borderRadius: '50%', backgroundColor: 'var(--th-bg)' }}><X size={18} color="var(--text-secondary)" /></button>
            </div>
            
            {/* Progress Bar / Steps */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', padding: '1rem', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', fontSize: '0.85rem' }}>
              <span style={{ fontWeight: importerStep === 'mapping' ? 'bold' : 'normal', color: importerStep === 'mapping' ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
                1. Map CSV Columns
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>➔</span>
              <span style={{ fontWeight: importerStep === 'preview' ? 'bold' : 'normal', color: importerStep === 'preview' ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
                2. Preview & Import
              </span>
            </div>

            {/* Modal Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
              {importerStep === 'mapping' ? (
                <div>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Select which column from your CSV/Excel file corresponds to each client registration field. If a field matches automatically, we've preselected it for you.
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '0.5rem', fontWeight: 600, borderBottom: '2px solid var(--border-light)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <span>System Field Name</span>
                      <span>Your File Column Header</span>
                    </div>
                    {IMPORT_FIELDS.map(field => (
                      <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', padding: '0.4rem 0.5rem', borderRadius: '6px', borderBottom: '1px solid var(--border-light)', fontSize: '0.9rem' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {field.label} {field.key === 'phone' && <span style={{ color: 'red' }}>*</span>}
                        </span>
                        <select 
                          value={mapping[field.key] || ''} 
                          onChange={(e) => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                          style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-light)', outline: 'none', background: 'var(--bg-surface)', fontSize: '0.85rem' }}
                        >
                          <option value="">-- Don't Map --</option>
                          {csvHeaders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  {/* Summary Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ padding: '1rem', borderRadius: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{csvRows.length}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Rows Found</div>
                    </div>
                    <div style={{ padding: '1rem', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #a7f3d0', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#047857' }}>{filteredImportData.length}</div>
                      <div style={{ fontSize: '0.75rem', color: '#065f46' }}>Ready to Import</div>
                    </div>
                    <div style={{ padding: '1rem', borderRadius: '10px', background: '#fffbeb', border: '1px solid #fef3c7', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#b45309' }}>{duplicatesCount}</div>
                      <div style={{ fontSize: '0.75rem', color: '#92400e' }}>Duplicates (Skipped)</div>
                    </div>
                  </div>

                  {filteredImportData.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#991b1b', fontSize: '0.9rem' }}>
                      All rows in this file are duplicates of existing phone numbers in your database! There are no new clients to import.
                    </div>
                  ) : (
                    <div>
                      <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        Data Preview (First 5 Rows):
                      </p>
                      <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                          <thead style={{ background: 'var(--bg-primary)' }}>
                            <tr>
                              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>CP1 Name</th>
                              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>CP1 Mobile 1</th>
                              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>Business Name</th>
                              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>Lead Date</th>
                              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>State</th>
                              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>District</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.map((row, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                <td style={{ padding: '0.5rem 0.75rem' }}>{row.name || '-'}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>{row.phone || '-'}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>{row.company || '-'}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>{row.lead_date || '-'}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>{row.state_name || '-'}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>{row.district_name || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', background: 'var(--bg-primary)' }}>
              {importerStep === 'mapping' ? (
                <>
                  <button onClick={() => setShowImporter(false)} style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', background: 'var(--bg-surface)', fontWeight: 500 }}>
                    Cancel
                  </button>
                  <button onClick={handleProceedToPreview} disabled={isSubmitting} style={{ padding: '0.5rem 1.25rem', border: 'none', borderRadius: '6px', cursor: 'pointer', background: 'var(--accent-color)', color: 'white', fontWeight: 500 }}>
                    {isSubmitting ? 'Checking duplicates...' : 'Next: Preview & Confirm'}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setImporterStep('mapping')} style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', background: 'var(--bg-surface)', fontWeight: 500 }}>
                    Back to Mapping
                  </button>
                  <button onClick={handleConfirmImport} disabled={isSubmitting || filteredImportData.length === 0} style={{ padding: '0.5rem 1.25rem', border: 'none', borderRadius: '6px', cursor: (isSubmitting || filteredImportData.length === 0) ? 'not-allowed' : 'pointer', background: filteredImportData.length > 0 ? '#10b981' : '#a7f3d0', color: 'white', fontWeight: 500 }}>
                    {isSubmitting ? 'Importing...' : `Confirm & Import (${filteredImportData.length})`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
