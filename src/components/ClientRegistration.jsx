'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ChevronDown, ChevronUp, Save, Briefcase, MapPin, User, FileText, CheckCircle2, Upload, Download, X, AlertTriangle, Search, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import Papa from 'papaparse';
import { getTeamMembers } from '@/app/actions/team';
import { logAuditAction } from '@/app/actions/audit';
import { getStatesCentral, getDistrictsCentral } from '@/app/actions/centralLocationMaster';
import { INDIAN_STATES, getDistrictsForState } from '@/constants/indianLocations';
import { normalizeLeadRecord, normalizeEmployeeName } from '@/utils/dataSanitizer';
import { enqueueOfflineAction } from '@/utils/offlineSync';

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
  const [duplicateImportData, setDuplicateImportData] = useState([]);
  const [allMappedData, setAllMappedData] = useState([]);
  const [previewFilterTab, setPreviewFilterTab] = useState('ready'); // 'ready' | 'duplicates' | 'all'
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(25);
  const [previewSearch, setPreviewSearch] = useState('');

  // Dynamically extract all mapped columns to display in preview table
  const mappedDisplayFields = useMemo(() => {
    const activeKeys = Object.keys(mapping).filter(k => !!mapping[k]);
    if (activeKeys.length > 0) {
      return IMPORT_FIELDS.filter(f => activeKeys.includes(f.key));
    }
    return IMPORT_FIELDS.filter(f => ['name', 'phone', 'company', 'lead_date', 'state_name', 'district_name'].includes(f.key));
  }, [mapping]);

  // Active list based on selected filter tab
  const currentPreviewSourceList = useMemo(() => {
    if (previewFilterTab === 'duplicates') return duplicateImportData;
    if (previewFilterTab === 'all') return allMappedData;
    return filteredImportData; // default 'ready'
  }, [previewFilterTab, duplicateImportData, allMappedData, filteredImportData]);

  // Real-time search across all columns in preview
  const searchedPreviewList = useMemo(() => {
    if (!previewSearch || !previewSearch.trim()) return currentPreviewSourceList;
    const term = previewSearch.toLowerCase().trim();
    return currentPreviewSourceList.filter(row => {
      return Object.values(row).some(val => val && String(val).toLowerCase().includes(term));
    });
  }, [currentPreviewSourceList, previewSearch]);

  const totalPreviewPages = useMemo(() => {
    if (previewPageSize === 0) return 1;
    return Math.max(1, Math.ceil(searchedPreviewList.length / previewPageSize));
  }, [searchedPreviewList.length, previewPageSize]);

  const paginatedPreviewRows = useMemo(() => {
    if (previewPageSize === 0) return searchedPreviewList;
    const start = (previewPage - 1) * previewPageSize;
    return searchedPreviewList.slice(start, start + previewPageSize);
  }, [searchedPreviewList, previewPage, previewPageSize]);
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

  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  const ALL_CONTACT_FIELDS = useMemo(() => [
    { key: 'phone', label: 'CP1 Mobile 1' },
    { key: 'cp1_mobile_2', label: 'CP1 Mobile 2' },
    { key: 'cp1_alt_1', label: 'CP1 Alternate 1' },
    { key: 'cp1_alt_2', label: 'CP1 Alternate 2' },
    { key: 'business_contact_1', label: 'Business Contact 1' },
    { key: 'business_contact_2', label: 'Business Contact 2' },
    { key: 'business_alt_1', label: 'Business Alternate 1' },
    { key: 'business_alt_2', label: 'Business Alternate 2' },
    { key: 'cp2_mobile_1', label: 'CP2 Mobile 1' },
    { key: 'cp2_mobile_2', label: 'CP2 Mobile 2' },
    { key: 'cp2_alt_1', label: 'CP2 Alternate 1' },
    { key: 'cp2_alt_2', label: 'CP2 Alternate 2' },
    { key: 'cp3_mobile_1', label: 'CP3 Mobile 1' },
    { key: 'cp3_mobile_2', label: 'CP3 Mobile 2' },
    { key: 'cp3_alt_1', label: 'CP3 Alternate 1' },
    { key: 'cp3_alt_2', label: 'CP3 Alternate 2' }
  ], []);

  // Comprehensive Real-time duplicate check across ALL 16 contact/mobile numbers & GST
  useEffect(() => {
    if (isEditMode) return; // Do not check against oneself in edit mode

    const enteredNumbers = [];
    ALL_CONTACT_FIELDS.forEach(f => {
      const val = (formData[f.key] || '').trim();
      if (val && val.length >= 8 && !enteredNumbers.some(e => e.val === val)) {
        enteredNumbers.push({ key: f.key, label: f.label, val });
      }
    });

    const gst = (formData.business_gst || '').trim();

    if (enteredNumbers.length === 0 && (!gst || gst.length < 8)) {
      setDuplicateInfo(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsCheckingDuplicate(true);
        const filters = [];

        // Build exhaustive match filters across all 16 database phone/contact columns
        const dbColumns = [
          'phone', 'cp1_mobile_2', 'cp1_alt_1', 'cp1_alt_2',
          'business_contact_1', 'business_contact_2', 'business_alt_1', 'business_alt_2',
          'cp2_mobile_1', 'cp2_mobile_2', 'cp2_alt_1', 'cp2_alt_2',
          'cp3_mobile_1', 'cp3_mobile_2', 'cp3_alt_1', 'cp3_alt_2'
        ];

        enteredNumbers.forEach(({ val }) => {
          dbColumns.forEach(col => {
            filters.push(`${col}.eq.${val}`);
          });
        });

        if (gst && gst.length >= 8) {
          filters.push(`business_gst.ilike.${gst}`);
        }

        if (filters.length === 0) {
          setDuplicateInfo(null);
          setIsCheckingDuplicate(false);
          return;
        }

        const { data, error } = await supabase
          .from('leads')
          .select('id, lead_ref_id, name, company, phone, business_contact_1, business_gst, status, created_at, created_by, entry_by, assigned_to')
          .or(filters.join(','))
          .limit(1);

        if (!error && data && data.length > 0) {
          const match = data[0];
          let matchedOn = 'Contact Number';
          let matchVal = enteredNumbers[0]?.val || '';

          if (gst && match.business_gst && match.business_gst.toLowerCase() === gst.toLowerCase()) {
            matchedOn = 'Business GSTIN';
            matchVal = gst;
          } else {
            // Find which exact number matched
            const matchedEntry = enteredNumbers.find(e => 
              match.phone === e.val || 
              match.business_contact_1 === e.val
            ) || enteredNumbers[0];
            
            if (matchedEntry) {
              matchedOn = matchedEntry.label;
              matchVal = matchedEntry.val;
            }
          }

          // Resolve assigned agent name from teamMembers list
          let assignedName = match.assigned_to || 'Unassigned';
          if (match.assigned_to && teamMembers && teamMembers.length > 0) {
            const member = teamMembers.find(m => m.user_id === match.assigned_to || m.id === match.assigned_to);
            if (member) {
              assignedName = member.emp_name ? `${member.emp_name}${member.emp_department ? ` (${member.emp_department})` : ''}` : (member.email || match.assigned_to);
            }
          }

          setDuplicateInfo({
            matchedOn,
            matchVal,
            id: match.id,
            lead_ref_id: match.lead_ref_id,
            name: match.name,
            company: match.company,
            phone: match.phone || match.business_contact_1 || matchVal,
            status: match.status,
            created_by: match.created_by || 'System',
            entry_by: match.entry_by || 'N/A',
            assigned_to: assignedName
          });
        } else {
          setDuplicateInfo(null);
        }
      } catch (err) {
        console.error("Duplicate check error:", err);
      } finally {
        setIsCheckingDuplicate(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [
    formData.phone, formData.cp1_mobile_2, formData.cp1_alt_1, formData.cp1_alt_2,
    formData.business_contact_1, formData.business_contact_2, formData.business_alt_1, formData.business_alt_2,
    formData.cp2_mobile_1, formData.cp2_mobile_2, formData.cp2_alt_1, formData.cp2_alt_2,
    formData.cp3_mobile_1, formData.cp3_mobile_2, formData.cp3_alt_1, formData.cp3_alt_2,
    formData.business_gst, isEditMode, supabase, ALL_CONTACT_FIELDS
  ]);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Guard against submitting duplicates without confirmation
    if (!isEditMode && duplicateInfo) {
      const proceed = window.confirm(
        `⚠️ Duplicate Client Alert!\n\nA client with matching ${duplicateInfo.matchedOn} (${duplicateInfo.matchVal}) is already registered:\n\n• Company: ${duplicateInfo.company || 'N/A'}\n• Name: ${duplicateInfo.name || 'N/A'}\n• Lead ID: #${duplicateInfo.lead_ref_id || duplicateInfo.id}\n• Status: ${duplicateInfo.status || 'New'}\n• Created By: ${duplicateInfo.created_by}\n• Entry By: ${duplicateInfo.entry_by}\n• Assigned To: ${duplicateInfo.assigned_to}\n\nDo you still want to register this duplicate client?`
      );
      if (!proceed) {
        return;
      }
    }

    setIsSubmitting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const actor = normalizeEmployeeName(user?.email?.split('@')[0] || 'Unknown', teamMembers);
      
      const payload = normalizeLeadRecord({
        ...formData
      }, teamMembers);
      
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
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          alert("🛑 Internet Disconnected!\n\nClient details update karne ke liye active internet connection zaroori hai. Kripya internet connect karein.");
          setIsSubmitting(false);
          return;
        } else {
          try {
            const { error } = await supabase.from('leads').update(payload).eq('id', initialData.id);
            if (error) throw error;

            const statusChanged = payload.status && payload.status !== initialData.status;
            const cleanOldStatus = (!initialData.status || initialData.status === 'None' || initialData.status.toLowerCase() === 'new' || initialData.status.toLowerCase() === 'pending') 
              ? '01 - New Stage' 
              : initialData.status;
            const noteText = statusChanged 
              ? `Status changed from ${cleanOldStatus} to ${payload.status}`
              : 'Client Profile was updated.';

            await supabase.from('lead_notes').insert([{
              lead_id: initialData.id,
              note_text: noteText,
              created_by: actor
            }]);
            
            try {
              await logAuditAction('Update Lead', `Updated Lead ID: ${initialData.id} (${payload.company || payload.name || 'Unknown'})`);
            } catch(e) { console.error('Audit Log failed', e); }
            
            alert('Client Updated Successfully!');
            if (onRegistrationSuccess) onRegistrationSuccess();
            if (onClose) onClose();
          } catch (netErr) {
            console.warn('Network update failed:', netErr);
            alert('Client update failed. Please check your internet connection.');
            setIsSubmitting(false);
          }
        }
      } else {
        // INSERT MODE
        payload.created_by = actor;

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          alert("🛑 Internet Disconnected!\n\nNaya client create karne ke liye active internet connection zaroori hai. Kripya internet connect karein.");
          setIsSubmitting(false);
          return;
        } else {
          try {
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
          } catch (netErr) {
            console.warn('Network insert failed:', netErr);
            alert('Client creation failed. Please check your internet connection.');
            setIsSubmitting(false);
          }
        }
        
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
      const mapped = csvRows.map((row, idx) => {
        const leadObj = { _rowNum: idx + 1 };
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

      let ready = [];
      let duplicatesList = [];

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

        mapped.forEach(row => {
          const cleanPhone = row.phone ? String(row.phone).trim() : '';
          if (cleanPhone && existingPhones.has(cleanPhone)) {
            row._isDuplicate = true;
            duplicatesList.push(row);
          } else {
            row._isDuplicate = false;
            ready.push(row);
          }
        });
      } else {
        ready = mapped.map(r => ({ ...r, _isDuplicate: false }));
      }

      setDuplicatesCount(duplicatesList.length);
      setFilteredImportData(ready);
      setDuplicateImportData(duplicatesList);
      setAllMappedData(mapped);
      setPreviewFilterTab('ready');
      setPreviewPage(1);
      setPreviewSearch('');
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
        // Strip out internal preview metadata before inserting into Supabase
        const cleanChunk = chunk.map(r => {
          const copy = normalizeLeadRecord({ ...r }, teamMembers);
          delete copy._rowNum;
          delete copy._isDuplicate;
          return copy;
        });

        const { data: insertedData, error } = await supabase.from('leads').insert(cleanChunk).select();
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

        {/* Real-Time Duplicate Alert Banner */}
        {duplicateInfo && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1.5px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.85rem'
          }}>
            <AlertTriangle size={22} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>⚠️ Duplicate Client Found in Database!</span>
                {duplicateInfo.lead_ref_id && (
                  <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.45rem', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#991b1b', fontFamily: 'monospace' }}>
                    #{duplicateInfo.lead_ref_id}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', marginTop: '0.35rem', lineHeight: '1.4' }}>
                A client with matching <strong>{duplicateInfo.matchedOn}</strong> (<code>{duplicateInfo.matchVal}</code>) already exists as <strong>{duplicateInfo.company || duplicateInfo.name || 'Unnamed Client'}</strong> {duplicateInfo.name && duplicateInfo.company && `(${duplicateInfo.name})`} with Status: <strong>{duplicateInfo.status || 'New'}</strong>.
              </div>

              {/* Ownership & Assignment Meta Badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.65rem', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                <span style={{ padding: '0.2rem 0.55rem', borderRadius: '6px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  👤 <strong>Created By:</strong> <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{duplicateInfo.created_by}</span>
                </span>
                <span style={{ padding: '0.2rem 0.55rem', borderRadius: '6px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  ✍️ <strong>Entry By:</strong> <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{duplicateInfo.entry_by}</span>
                </span>
                <span style={{ padding: '0.2rem 0.55rem', borderRadius: '6px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  🎯 <strong>Assigned To:</strong> <span style={{ color: 'var(--accent-color)', fontWeight: 600 }}>{duplicateInfo.assigned_to}</span>
                </span>
              </div>
            </div>
          </div>
        )}
        
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
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', width: '96vw', maxWidth: '1400px', height: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Upload size={20} color="var(--accent-color)" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                  CSV / Excel Bulk Importer
                </h3>
                {importFile && (
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    📄 {importFile.name}
                  </span>
                )}
              </div>
              <button onClick={() => setShowImporter(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem', borderRadius: '50%', backgroundColor: 'var(--th-bg)' }}><X size={18} color="var(--text-secondary)" /></button>
            </div>
            
            {/* Progress Bar / Steps */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', padding: '0.75rem', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)', fontSize: '0.85rem' }}>
              <span style={{ fontWeight: importerStep === 'mapping' ? 700 : 500, color: importerStep === 'mapping' ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
                1. Map File Columns
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>➔</span>
              <span style={{ fontWeight: importerStep === 'preview' ? 700 : 500, color: importerStep === 'preview' ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
                2. Full Preview & Verify ({allMappedData.length || csvRows.length} Rows)
              </span>
            </div>

            {/* Modal Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '1rem', minHeight: 0 }}>
                  {/* Summary Stats Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                    <div 
                      onClick={() => { setPreviewFilterTab('all'); setPreviewPage(1); }}
                      style={{ 
                        padding: '0.75rem 1rem', 
                        borderRadius: '10px', 
                        background: previewFilterTab === 'all' ? 'var(--nav-active-bg)' : 'var(--bg-primary)', 
                        border: `1.5px solid ${previewFilterTab === 'all' ? 'var(--accent-color)' : 'var(--border-light)'}`, 
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{allMappedData.length}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Rows Found</div>
                    </div>
                    <div 
                      onClick={() => { setPreviewFilterTab('ready'); setPreviewPage(1); }}
                      style={{ 
                        padding: '0.75rem 1rem', 
                        borderRadius: '10px', 
                        background: previewFilterTab === 'ready' ? '#d1fae5' : '#ecfdf5', 
                        border: `1.5px solid ${previewFilterTab === 'ready' ? '#059669' : '#a7f3d0'}`, 
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#047857' }}>{filteredImportData.length}</div>
                      <div style={{ fontSize: '0.75rem', color: '#065f46', fontWeight: 600 }}>Ready to Import</div>
                    </div>
                    <div 
                      onClick={() => { setPreviewFilterTab('duplicates'); setPreviewPage(1); }}
                      style={{ 
                        padding: '0.75rem 1rem', 
                        borderRadius: '10px', 
                        background: previewFilterTab === 'duplicates' ? '#fed7aa' : '#fffbeb', 
                        border: `1.5px solid ${previewFilterTab === 'duplicates' ? '#ea580c' : '#fef3c7'}`, 
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#b45309' }}>{duplicateImportData.length}</div>
                      <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 600 }}>Duplicates (Safely Skipped)</div>
                    </div>
                  </div>

                  {/* Interactive Toolbar: Filter Tabs, Live Search, Rows Per Page */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    {/* Filter Tabs */}
                    <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--bg-primary)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                      <button
                        type="button"
                        onClick={() => { setPreviewFilterTab('ready'); setPreviewPage(1); }}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          border: 'none',
                          fontSize: '0.78rem',
                          fontWeight: previewFilterTab === 'ready' ? 700 : 500,
                          backgroundColor: previewFilterTab === 'ready' ? 'var(--bg-surface)' : 'transparent',
                          color: previewFilterTab === 'ready' ? '#047857' : 'var(--text-secondary)',
                          boxShadow: previewFilterTab === 'ready' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                          cursor: 'pointer'
                        }}
                      >
                        🟢 Ready to Import ({filteredImportData.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPreviewFilterTab('duplicates'); setPreviewPage(1); }}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          border: 'none',
                          fontSize: '0.78rem',
                          fontWeight: previewFilterTab === 'duplicates' ? 700 : 500,
                          backgroundColor: previewFilterTab === 'duplicates' ? 'var(--bg-surface)' : 'transparent',
                          color: previewFilterTab === 'duplicates' ? '#b45309' : 'var(--text-secondary)',
                          boxShadow: previewFilterTab === 'duplicates' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                          cursor: 'pointer'
                        }}
                      >
                        ⚠️ Duplicates ({duplicateImportData.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPreviewFilterTab('all'); setPreviewPage(1); }}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          border: 'none',
                          fontSize: '0.78rem',
                          fontWeight: previewFilterTab === 'all' ? 700 : 500,
                          backgroundColor: previewFilterTab === 'all' ? 'var(--bg-surface)' : 'transparent',
                          color: previewFilterTab === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
                          boxShadow: previewFilterTab === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                          cursor: 'pointer'
                        }}
                      >
                        📋 All Rows ({allMappedData.length})
                      </button>
                    </div>

                    {/* Search & Rows Per Page */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Search size={14} style={{ position: 'absolute', left: '0.6rem', color: 'var(--text-secondary)' }} />
                        <input
                          type="text"
                          value={previewSearch}
                          onChange={(e) => { setPreviewSearch(e.target.value); setPreviewPage(1); }}
                          placeholder="Search in preview..."
                          style={{
                            padding: '0.35rem 0.6rem 0.35rem 1.9rem',
                            fontSize: '0.8rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            width: '210px'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <span>Rows:</span>
                        <select
                          value={previewPageSize}
                          onChange={(e) => { setPreviewPageSize(Number(e.target.value)); setPreviewPage(1); }}
                          style={{
                            padding: '0.3rem 0.5rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            fontSize: '0.78rem'
                          }}
                        >
                          <option value={20}>20</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                          <option value={500}>500</option>
                          <option value={0}>All Rows</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Full Dynamic Mapped Table */}
                  <div style={{ 
                    flex: 1, 
                    overflow: 'auto', 
                    border: '1px solid var(--border-light)', 
                    borderRadius: '8px', 
                    background: 'var(--bg-surface)',
                    minHeight: '220px',
                    maxHeight: 'calc(92vh - 350px)'
                  }}>
                    {searchedPreviewList.length === 0 ? (
                      <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        No records match your selected filter or search query.
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left', minWidth: `${Math.max(800, mappedDisplayFields.length * 150 + 180)}px` }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg-primary)', borderBottom: '2px solid var(--border-light)' }}>
                          <tr>
                            <th style={{ padding: '0.6rem 0.75rem', fontWeight: 700, width: '50px', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>#</th>
                            <th style={{ padding: '0.6rem 0.75rem', fontWeight: 700, width: '110px', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>Status</th>
                            {mappedDisplayFields.map(field => (
                              <th key={field.key} style={{ padding: '0.6rem 0.75rem', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid var(--border-light)' }}>
                                {field.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedPreviewRows.map((row, idx) => {
                            const isDup = row._isDuplicate;
                            return (
                              <tr 
                                key={idx} 
                                style={{ 
                                  borderBottom: '1px solid var(--border-light)',
                                  backgroundColor: isDup ? 'rgba(239, 68, 68, 0.04)' : (idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary)')
                                }}
                              >
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem', borderRight: '1px solid var(--border-light)', fontFamily: 'monospace' }}>
                                  {row._rowNum || idx + 1}
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', borderRight: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>
                                  {isDup ? (
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}>
                                      ⚠️ Duplicate
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: '4px', backgroundColor: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' }}>
                                      🟢 Ready
                                    </span>
                                  )}
                                </td>
                                {mappedDisplayFields.map(field => (
                                  <td key={field.key} style={{ padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border-light)', whiteSpace: 'nowrap', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {row[field.key] ? String(row[field.key]) : <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>-</span>}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Pagination Controls Bar */}
                  {searchedPreviewList.length > 0 && previewPageSize > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        Showing <strong>{(previewPage - 1) * previewPageSize + 1}</strong> to <strong>{Math.min(previewPage * previewPageSize, searchedPreviewList.length)}</strong> of <strong>{searchedPreviewList.length}</strong> rows
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                          type="button"
                          disabled={previewPage <= 1}
                          onClick={() => setPreviewPage(1)}
                          style={{
                            padding: '0.25rem 0.55rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-surface)',
                            cursor: previewPage <= 1 ? 'not-allowed' : 'pointer',
                            opacity: previewPage <= 1 ? 0.5 : 1
                          }}
                        >
                          « First
                        </button>
                        <button
                          type="button"
                          disabled={previewPage <= 1}
                          onClick={() => setPreviewPage(prev => Math.max(1, prev - 1))}
                          style={{
                            padding: '0.25rem 0.55rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-surface)',
                            cursor: previewPage <= 1 ? 'not-allowed' : 'pointer',
                            opacity: previewPage <= 1 ? 0.5 : 1
                          }}
                        >
                          ‹ Prev
                        </button>
                        <span style={{ fontWeight: 600, padding: '0 0.35rem' }}>
                          Page {previewPage} of {totalPreviewPages}
                        </span>
                        <button
                          type="button"
                          disabled={previewPage >= totalPreviewPages}
                          onClick={() => setPreviewPage(prev => Math.min(totalPreviewPages, prev + 1))}
                          style={{
                            padding: '0.25rem 0.55rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-surface)',
                            cursor: previewPage >= totalPreviewPages ? 'not-allowed' : 'pointer',
                            opacity: previewPage >= totalPreviewPages ? 0.5 : 1
                          }}
                        >
                          Next ›
                        </button>
                        <button
                          type="button"
                          disabled={previewPage >= totalPreviewPages}
                          onClick={() => setPreviewPage(totalPreviewPages)}
                          style={{
                            padding: '0.25rem 0.55rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-surface)',
                            cursor: previewPage >= totalPreviewPages ? 'not-allowed' : 'pointer',
                            opacity: previewPage >= totalPreviewPages ? 0.5 : 1
                          }}
                        >
                          Last »
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '0.85rem 1.5rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-primary)' }}>
              {importerStep === 'mapping' ? (
                <>
                  <button onClick={() => setShowImporter(false)} style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', background: 'var(--bg-surface)', fontWeight: 500 }}>
                    Cancel
                  </button>
                  <button onClick={handleProceedToPreview} disabled={isSubmitting} style={{ padding: '0.5rem 1.25rem', border: 'none', borderRadius: '6px', cursor: 'pointer', background: 'var(--accent-color)', color: 'white', fontWeight: 600 }}>
                    {isSubmitting ? 'Checking duplicates...' : 'Next: Preview & Confirm'}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setImporterStep('mapping')} style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', background: 'var(--bg-surface)', fontWeight: 600 }}>
                    ‹ Back to Mapping
                  </button>
                  <button onClick={handleConfirmImport} disabled={isSubmitting || filteredImportData.length === 0} style={{ padding: '0.5rem 1.5rem', border: 'none', borderRadius: '6px', cursor: (isSubmitting || filteredImportData.length === 0) ? 'not-allowed' : 'pointer', background: filteredImportData.length > 0 ? '#10b981' : '#a7f3d0', color: 'white', fontWeight: 700, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <CheckCircle2 size={18} />
                    {isSubmitting ? 'Importing...' : `Confirm & Import (${filteredImportData.length} New Clients)`}
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
