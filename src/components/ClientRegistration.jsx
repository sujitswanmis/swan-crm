'use client';

import MobileTableView from '@/components/common/MobileTableView';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ChevronDown, ChevronUp, Save, Briefcase, MapPin, User, FileText, CheckCircle2, Upload, Download, X, AlertTriangle, Search, ChevronLeft, ChevronRight, Filter, UserPlus, Edit3, Trash2, Clock } from 'lucide-react';
import Papa from 'papaparse';
import { getTeamMembers } from '@/app/actions/team';
import { logAuditAction } from '@/app/actions/audit';
import { getStatesCentral, getDistrictsCentral, getLocationMasterHierarchyCentral } from '@/app/actions/centralLocationMaster';
import { INDIAN_STATES, INDIAN_DISTRICTS_MAP, getDistrictsForState } from '@/constants/indianLocations';
import { normalizeLeadRecord, normalizeEmployeeName, normalizePhoneTo10, resolveTeamMemberId, calculateLeadSimilarityScore, cleanCorporateName } from '@/utils/dataSanitizer';
import { enqueueOfflineAction, canPerformOfflineAction, sanitizeLeadPayloadForDb, upsertLeadsLocally, showSyncToast } from '@/utils/offlineSync';
import { 
  saveClientRegistrationDraft, 
  getClientRegistrationDrafts, 
  deleteClientRegistrationDraft, 
  submitClientRegistrationAndSync 
} from '@/app/actions/clientRegistrationSync';

const IMPORT_FIELDS = [
  { key: 'lead_date', label: 'Lead Date', standardHeaders: ['Lead Date', 'leaddate', 'date'] },
  { key: 'our_company', label: 'Our Company Name', standardHeaders: ['Our Company Name', 'Our Company', 'companyname'] },
  { key: 'source', label: 'Lead Source', standardHeaders: ['Lead Source', 'source'] },
  { key: 'source_name', label: 'Source Name', standardHeaders: ['Source Name', 'sourcename'] },
  { key: 'entry_by', label: 'Entry By', standardHeaders: ['Entry By', 'entryby', 'Lead Entry By'] },
  { key: 'assigned_to', label: 'Assigned To', standardHeaders: ['Assigned To', 'assignedto', 'assign_to', 'assigned_to', 'agent', 'assigned agent', 'assignee'] },
  { key: 'client_status', label: 'Client Status', standardHeaders: ['Client Status', 'clientstatus', 'client_status'] },
  { key: 'priority', label: 'Lead Priority Type', standardHeaders: ['Lead Priority Type', 'priority'] },
  { key: 'status', label: 'Lead Status', standardHeaders: ['Lead Status', 'leadstatus', 'lead_status', 'stage', 'lead stage', 'stage_name', 'status'] },
  { key: 'company', label: 'Business Name', standardHeaders: ['Business Name', 'BusinessName', 'company'] },
  { key: 'business_type', label: 'Business Type', standardHeaders: ['Business Type', 'businesstype'] },
  { key: 'business_gst', label: 'Business GST', standardHeaders: ['Business GST', 'gst', 'gstin', 'gst_no', 'gstno'] },
  { key: 'business_contact_1', label: 'Business Contact 1', standardHeaders: ['Business Contact 1', 'contact1', 'business_contact_1', 'company contact', 'business contact'] },
  { key: 'business_contact_2', label: 'Business Contact 2', standardHeaders: ['Business Contact 2', 'contact2'] },
  { key: 'business_alt_1', label: 'Business Alt 1', standardHeaders: ['Business Alt 1', 'alt1'] },
  { key: 'business_alt_2', label: 'Business Alt 2', standardHeaders: ['Business Alt 2', 'alt2'] },
  { key: 'business_email_1', label: 'Business Email 1', standardHeaders: ['Business Email 1', 'email1'] },
  { key: 'business_email_2', label: 'Business Email 2', standardHeaders: ['Business Email 2', 'email2'] },
  { key: 'business_alt_email_1', label: 'Business Alt Email 1', standardHeaders: ['Business Alt Email 1', 'altemail1'] },
  { key: 'business_alt_email_2', label: 'Business Alt Email 2', standardHeaders: ['Business Alt Email 2', 'altemail2'] },
  { key: 'name', label: 'CP1 Name', standardHeaders: ['CP1 Name', 'Name', 'cpname', 'cp1name', 'contact person'] },
  { key: 'phone', label: 'CP1 Mobile 1', standardHeaders: ['CP1 Mobile 1', 'Phone', 'Mobile', 'Mobile No', 'Mobile Number', 'Phone Number', 'Phone No', 'Contact', 'Contact No', 'Contact Number', 'cp1mobile1', 'cp1_mobile_1', 'cp1 mobile'] },
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
  { key: 'buying_timeline', label: 'Buying Timeline', standardHeaders: ['Buying Timeline', 'buying_timeline', 'timeline', 'buying timeline'] },
  { key: 'data_status', label: 'Data Status', standardHeaders: ['Data Status', 'datastatus', 'data_status', 'record status', 'record_status', 'type', 'data type', 'Data Status (Saved Drafts / Partial Confirmed / Verified Data)'] },
];

const ALL_CONTACT_FIELDS = [
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
];
const ALL_CONTACT_KEYS = ALL_CONTACT_FIELDS.map(f => f.key);

const DEFAULT_CRM_STAGES = [
  { name: '01 - New Stage', enabled: true, is_closing: false, substages: ['New Lead', 'Assigned', 'Contact Pending'] },
  { name: '02 - Contact Stage', enabled: true, is_closing: false, substages: ['Contacted', 'Wrong Number', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '03 - Qualification Stage', enabled: true, is_closing: false, substages: ['Interested', 'Qualified', 'Unqualified', 'Need Identified', 'Budget Confirmed', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '04 - Follow Up Stage', enabled: true, is_closing: false, substages: ['Catalog Shared', 'Follow Up Required', 'Next Follow Up Set', 'Follow Up Done', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '05 - Sales Process Stage', enabled: true, is_closing: false, substages: ['Visit Require Sales Person', 'Before Visit Conference Call Pending', 'Before Visit Conference Call Done', 'Visit Confirmation Date', 'Task Assigned in TrackWick', 'Meeting Pending', 'Meeting Done', 'Negotiation Pending', 'Negotiation Done', 'Client Documentation Pending', 'Client Documentation Done', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '06 - Conversion Stage', enabled: true, is_closing: false, substages: ['Token Amount Pending', 'Token Amount Deposited', 'Client Details Pending', 'Client Details Received', 'Billing 1st Quotation Pending', 'Billing 1st Quotation Sent', 'Quotation Revision Required', 'Quotation Approved by Client', 'Billing 1st Advance Payment Pending', 'Billing 1st Advance Paid', 'Payment Verification Pending', 'Payment Verified', 'Order Confirmed', 'Stock Availability Check', 'Stock Not Available', 'Production Planning Required', 'Delivery Date Confirmed', 'Final Billing 1st Pending', 'Final Billing 1st Done', 'Ready for Dispatch', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '07 - Final Stage', enabled: true, is_closing: true, substages: ['Converted - Out for Delivery', 'Converted - Order Received', 'Converted - Final Feedback From Client', 'Won', 'Lost After Quotation', 'Lost Due to Price Issue', 'Lost Due to Payment Issue', 'Lost Due to Stock Issue', 'Hold - Client Side', 'Hold - Company Side', 'Duplicate Lead', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '08 - Transfer to Party', enabled: true, is_closing: false, substages: ['Pending Confirmation', 'Transferred to Party Master', 'Won - Transferred'] }
];

const SAMPLE_DATA = [
  [
    '2026-06-27', 'SuPuja Creations', 'Google Ads', 'Search Campaign', 'admin', 'Nitya Verma', 'Hot', 'LP02: High Priority', '1;01>New Stage>New Lead',
    'Apex Retailers Ltd', 'Retailer', '07AAAAA1111A1Z1', '9876543210', '9876543211',
    '', '', 'info@apexretail.com', '', '', '',
    'Rahul Sharma', '9876543210', '', '', '', 'rahul@apexretail.com', '',
    'Amit Sharma', '9876543212', '', '', '', '', '',
    '', '', '', '', '', '', '',
    'Delhi', 'New Delhi', '110001', 'New Delhi', 'Chanakyapuri', 'Delhi', '12, Connaught Place, New Delhi',
    'Wants to source wholesale goods', '1 Lakh - 5 Lakh', 'Immediate', 'Saved Drafts'
  ],
  [
    '2026-06-26', 'SuPuja Creations', 'Organic', 'Google Search', 'admin', 'Sujit Kumar', 'Warm', 'LP03: Medium Priority', '3;01>Qualification Stage>Interested',
    'Global Distributors', 'Distributor', '09BBBBB2222B2Z2', '8765432109', '',
    '', '', 'purchase@globaldist.com', '', '', '',
    'Sanjay Verma', '8765432109', '', '', '', 'sanjay@globaldist.com', '',
    '', '', '', '', '', '', '',
    '', '', '', '', '', '', '',
    'Uttar Pradesh', 'Noida', '201301', 'Noida', 'Dadri', 'Noida', 'Sector 62, Noida, UP',
    'Requires bulk materials supply', '10 Lakh - 25 Lakh', 'Within 15 Days', 'Partial Confirmed'
  ],
  [
    '2026-06-25', 'SuPuja Creations', 'WhatsApp', 'Inbound Chat', 'user1', '', 'Active', 'LP04: Low Priority', '2;01>Contact Stage>Contacted',
    'Tech Solutions', 'Service Provider', '', '7654321098', '',
    '', '', 'contact@techsol.com', '', '', '',
    'Preeti Sen', '7654321098', '', '', '', 'preeti@techsol.com', '',
    '', '', '', '', '', '', '',
    '', '', '', '', '', '', '',
    'Haryana', 'Gurugram', '122018', 'Gurugram', 'Gurgaon', 'Gurugram', 'Sohna Road, Gurugram, HR',
    'Wants IT solutions', 'Below 1 Lakh', 'Immediate', 'Verified Data'
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

  const activeTeamMembers = useMemo(() => {
    return (teamMembers || []).filter(m => {
      if (!m.emp_name) return false;
      const status = String(m.emp_status || m.status || 'Active').toLowerCase().trim();
      if (['inactive', 'terminated', 'resigned', 'trash', 'draft'].includes(status)) return false;
      if (m.is_approved === false) return false;
      if (m.role === 'customer') return false;
      return true;
    });
  }, [teamMembers]);

  const filteredMembers = useMemo(() => {
    let list = activeTeamMembers;
    if (search.trim()) {
      const term = search.toLowerCase();
      list = activeTeamMembers.filter(m => 
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
  }, [search, activeTeamMembers]);

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

export default function ClientRegistration({ 
  onRegistrationSuccess, 
  initialData = null, 
  isEditMode = false, 
  onClose = null, 
  teamMembers: propTeamMembers = null, 
  userCompany = '',
  moduleAccess = null,
  userRole = '',
  userName = ''
}) {
  const supabase = createClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canViewAllDrafts = useMemo(() => {
    if (userRole === 'admin' || userRole === 'master_admin') return true;
    if (moduleAccess?.can_view_all_drafts === true) return true;
    return false;
  }, [userRole, moduleAccess]);

  const [currentActor, setCurrentActor] = useState(userName || '');

  const SWAN_COMPANIES = ['nsmlr', 'nstlp', 'nstl', 'new swan group', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl'];
  const isSwanWorkspace = !userCompany || SWAN_COMPANIES.includes(String(userCompany).toLowerCase().trim());
  const defaultWorkspaceCompany = (!isSwanWorkspace && userCompany) ? userCompany : '';

  const [tenantStages, setTenantStages] = useState(DEFAULT_CRM_STAGES);

  const tenantLeadStatuses = useMemo(() => {
    const stages = Array.isArray(tenantStages) && tenantStages.length > 0 ? tenantStages : DEFAULT_CRM_STAGES;
    const list = [];
    stages.forEach((stageObj, i) => {
      if (stageObj && stageObj.enabled !== false && Array.isArray(stageObj.substages)) {
        const match = String(stageObj.name || '').match(/^(\d+)/);
        const stageNum = match ? parseInt(match[1], 10) : (i + 1);
        const cleanStageName = String(stageObj.name || '').replace(/^\d+\s*-\s*/, '').trim();
        stageObj.substages.forEach((sub, j) => {
          const subNum = String(j + 1).padStart(2, '0');
          const cleanSub = sub.includes('>') ? sub.split('>').pop().trim() : String(sub).trim();
          const prefix = `${stageNum};${subNum}>${cleanStageName}>`;
          const val = sub.startsWith(prefix) ? sub : `${prefix}${cleanSub}`;
          list.push(val);
        });
      }
    });
    return list.length > 0 ? list : [
      '1;01>New Stage>New Lead',
      '1;02>New Stage>Assigned',
      '2;01>Contact Stage>Contacted',
      '3;01>Qualification Stage>Interested'
    ];
  }, [tenantStages]);

  const getDynamicSampleData = () => {
    let comp1, comp2, comp3;
    if (isSwanWorkspace) {
      comp1 = (userCompany && userCompany.toUpperCase() === 'NSTLP') ? 'NSTLP' : 'NSMLR';
      comp2 = (userCompany && userCompany.toUpperCase() === 'NSMLR') ? 'NSMLR' : 'NSTLP';
      comp3 = comp1;
    } else {
      const activeTenantComp = userCompany || 'SuPuja Creations';
      comp1 = activeTenantComp;
      comp2 = activeTenantComp;
      comp3 = activeTenantComp;
    }

    const st1 = tenantLeadStatuses[0] || '1;01>New Stage>New Lead';
    const st2 = tenantLeadStatuses.find(s => s.toLowerCase().includes('interested')) || tenantLeadStatuses[1] || '3;01>Qualification Stage>Interested';
    const st3 = tenantLeadStatuses.find(s => s.toLowerCase().includes('contacted')) || tenantLeadStatuses[2] || '2;01>Contact Stage>Contacted';

    return [
      [
        '2026-06-27', comp1, 'Google Ads', 'Search Campaign', 'admin', 'Nitya Verma', 'Hot', 'LP02: High Priority', st1,
        'Apex Retailers Ltd', 'Retailer', '07AAAAA1111A1Z1', '9876543210', '9876543211',
        '', '', 'info@apexretail.com', '', '', '',
        'Rahul Sharma', '9876543210', '', '', '', 'rahul@apexretail.com', '',
        'Amit Sharma', '9876543212', '', '', '', '', '',
        '', '', '', '', '', '', '',
        'Delhi', 'New Delhi', '110001', 'New Delhi', 'Chanakyapuri', 'Delhi', '12, Connaught Place, New Delhi',
        'Wants to source wholesale goods', '1 Lakh - 5 Lakh', 'Immediate', 'Saved Drafts'
      ],
      [
        '2026-06-26', comp2, 'Organic', 'Google Search', 'admin', 'Sujit Kumar', 'Warm', 'LP03: Medium Priority', st2,
        'Global Distributors', 'Distributor', '09BBBBB2222B2Z2', '8765432109', '',
        '', '', 'purchase@globaldist.com', '', '', '',
        'Sanjay Verma', '8765432109', '', '', '', 'sanjay@globaldist.com', '',
        '', '', '', '', '', '', '',
        '', '', '', '', '', '', '',
        'Uttar Pradesh', 'Noida', '201301', 'Noida', 'Dadri', 'Noida', 'Sector 62, Noida, UP',
        'Requires bulk materials supply', '10 Lakh - 25 Lakh', 'Within 15 Days', 'Partial Confirmed'
      ],
      [
        '2026-06-25', comp3, 'WhatsApp', 'Inbound Chat', 'user1', '', 'Active', 'LP04: Low Priority', st3,
        'Tech Solutions', 'Service Provider', '', '7654321098', '',
        '', '', 'contact@techsol.com', '', '', '',
        'Preeti Sen', '7654321098', '', '', '', 'preeti@techsol.com', '',
        '', '', '', '', '', '', '',
        '', '', '', '', '', '', '',
        'Haryana', 'Gurugram', '122018', 'Gurugram', 'Gurgaon', 'Gurugram', 'Sohna Road, Gurugram, HR',
        'Wants IT solutions', 'Below 1 Lakh', 'Immediate', 'Verified Data'
      ]
    ];
  };

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
  const [alreadyInReportImportData, setAlreadyInReportImportData] = useState([]);
  const [potentialMatchesImportData, setPotentialMatchesImportData] = useState([]);
  const [defaultDataStatus, setDefaultDataStatus] = useState('Verified Data');
  const [allMappedData, setAllMappedData] = useState([]);
  const [previewFilterTab, setPreviewFilterTab] = useState('all'); // 'all' | 'clean' | 'potentialMatches' | 'blocked'
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(25);
  const [previewSearch, setPreviewSearch] = useState('');

  // 100% Clean leads (0% similarity match score, completely fresh)
  const cleanImportData = useMemo(() => {
    return (filteredImportData || []).filter(r => !r._matchScore || r._matchScore < 50);
  }, [filteredImportData]);

  // Combined Blocked Duplicates (100% in Report + Other Duplicates)
  const blockedDuplicatesImportData = useMemo(() => {
    return [...(alreadyInReportImportData || []), ...(duplicateImportData || [])];
  }, [alreadyInReportImportData, duplicateImportData]);

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
    if (previewFilterTab === 'clean') return cleanImportData;
    if (previewFilterTab === 'potentialMatches') return potentialMatchesImportData;
    if (previewFilterTab === 'blocked') return blockedDuplicatesImportData;
    return allMappedData; // default 'all'
  }, [previewFilterTab, cleanImportData, potentialMatchesImportData, blockedDuplicatesImportData, allMappedData]);

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
  
  const [teamMembers, setTeamMembers] = useState(propTeamMembers || []);
  const [dbExtraStates, setDbExtraStates] = useState([]);

  useEffect(() => {
    if (propTeamMembers && Array.isArray(propTeamMembers) && propTeamMembers.length > 0) {
      setTeamMembers(propTeamMembers);
    }
  }, [propTeamMembers]);

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
        const response = await getTeamMembers(userCompany);
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

  const DEFAULT_BUSINESS_TYPES = [
    'Dealer', 'Distributor', 'Retailer', 'Farmer', 'Trader', 
    'Manufacturer', 'Service Provider', 'Wholesaler', 'Broker', 'Other'
  ];

  const [sources, setSources] = useState(['Website', 'Facebook', 'Google Ads', 'IndiaMART', 'TradeIndia', 'WhatsApp', 'Phone Call', 'Field Visit', 'Dealer Reference', 'Customer Reference', 'Exhibition', 'Other']);
  const [clientStatuses, setClientStatuses] = useState(['None', 'Hot', 'Warm', 'Cold', 'Active', 'InActive', 'Hold', 'In-Progress']);
  const [priorities, setPriorities] = useState([
    'LP00: None', 'LP01: Immediate', 'LP02: High', 'LP03: Medium', 
    'LP04: Low', 'LP05: Cold', 'LP06: Disqualified', 'LP07: Irrelevant', 
    'LP08: Invalid', 'LP09: Spam', 'LP10: Archive', 'LP11: Competitor Dealer', 'LP12: Competitor Distributor'
  ]);
  const [businessTypes, setBusinessTypes] = useState(DEFAULT_BUSINESS_TYPES);

  const [activeView, setActiveView] = useState('form'); // 'form' | 'drafts'
  const [draftsList, setDraftsList] = useState([]);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [clientFormFields, setClientFormFields] = useState({});

  // Drafts View Filter & Pagination States
  const [draftSearch, setDraftSearch] = useState('');
  const [draftViewFilter, setDraftViewFilter] = useState('all'); // 'all' | 'my'
  const [draftUserFilter, setDraftUserFilter] = useState('all');
  const [draftPage, setDraftPage] = useState(1);
  const [draftPageSize, setDraftPageSize] = useState(25);

  useEffect(() => {
    async function resolveActor() {
      if (userName) {
        setCurrentActor(userName);
        return;
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          const actor = normalizeEmployeeName(user.email.split('@')[0], teamMembers);
          setCurrentActor(actor);
        }
      } catch {}
    }
    resolveActor();
  }, [userName, teamMembers, supabase]);

  const loadDrafts = async () => {
    setIsLoadingDrafts(true);
    try {
      const res = await getClientRegistrationDrafts(userCompany, currentActor, canViewAllDrafts);
      if (res && res.success) {
        setDraftsList(res.drafts || []);
      }
    } catch (err) {
      console.warn('Draft load notice:', err);
    } finally {
      setIsLoadingDrafts(false);
    }
  };

  useEffect(() => {
    loadDrafts();
  }, [userCompany, currentActor, canViewAllDrafts]);

  // Filtered drafts based on search and user filter
  const filteredDraftsList = useMemo(() => {
    let list = draftsList || [];
    if (draftViewFilter === 'my' && currentActor) {
      const cleanActor = currentActor.toLowerCase().trim();
      list = list.filter(d => {
        const entry = String(d.entry_by || '').toLowerCase();
        const created = String(d.created_by || '').toLowerCase();
        return entry.includes(cleanActor) || created.includes(cleanActor);
      });
    }
    if (draftUserFilter !== 'all') {
      const cleanUser = draftUserFilter.toLowerCase().trim();
      list = list.filter(d => {
        const entry = String(d.entry_by || '').toLowerCase();
        const created = String(d.created_by || '').toLowerCase();
        return entry.includes(cleanUser) || created.includes(cleanUser);
      });
    }
    if (draftSearch && draftSearch.trim() !== '') {
      const term = draftSearch.toLowerCase().trim();
      list = list.filter(d => {
        return [
          d.company, d.name, d.phone, d.email, d.city_name, d.state_name, d.business_gst, d.entry_by
        ].some(v => v && String(v).toLowerCase().includes(term));
      });
    }
    return list;
  }, [draftsList, draftViewFilter, draftUserFilter, draftSearch, currentActor]);

  const totalDraftPages = useMemo(() => {
    if (draftPageSize === 0) return 1;
    return Math.max(1, Math.ceil(filteredDraftsList.length / draftPageSize));
  }, [filteredDraftsList.length, draftPageSize]);

  const paginatedDrafts = useMemo(() => {
    if (draftPageSize === 0) return filteredDraftsList;
    const start = (draftPage - 1) * draftPageSize;
    return filteredDraftsList.slice(start, start + draftPageSize);
  }, [filteredDraftsList, draftPage, draftPageSize]);

  useEffect(() => {
    const loadConfig = () => {
      const saved = localStorage.getItem('crm_config');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.sources && Array.isArray(parsed.sources)) setSources(parsed.sources);
          if (parsed.clientStatuses && Array.isArray(parsed.clientStatuses)) setClientStatuses(parsed.clientStatuses);
          if (parsed.stages && Array.isArray(parsed.stages) && parsed.stages.length > 0) setTenantStages(parsed.stages);
          if (parsed.priorities && Array.isArray(parsed.priorities)) setPriorities(parsed.priorities);
          if (parsed.businessTypes && Array.isArray(parsed.businessTypes) && parsed.businessTypes.length > 0) {
            setBusinessTypes(parsed.businessTypes);
          }
          if (parsed.client_form_fields) setClientFormFields(parsed.client_form_fields);
        } catch (e) { console.error(e); }
      }
    };
    
    loadConfig();
    window.addEventListener('crm_config_updated', loadConfig);

    // Also fetch latest tenant-configured CRM config from API in background
    const url = `/api/settings/crm-config${userCompany ? `?company=${encodeURIComponent(userCompany)}` : ''}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (!data?.config) return;
        const cfg = data.config;
        if (cfg.sources && Array.isArray(cfg.sources)) setSources(cfg.sources);
        if (cfg.clientStatuses && Array.isArray(cfg.clientStatuses)) setClientStatuses(cfg.clientStatuses);
        if (cfg.stages && Array.isArray(cfg.stages) && cfg.stages.length > 0) setTenantStages(cfg.stages);
        if (cfg.priorities && Array.isArray(cfg.priorities)) setPriorities(cfg.priorities);
        if (cfg.businessTypes && Array.isArray(cfg.businessTypes) && cfg.businessTypes.length > 0) {
          setBusinessTypes(cfg.businessTypes);
        }
        if (cfg.client_form_fields) setClientFormFields(cfg.client_form_fields);
      })
      .catch(err => {
        console.warn('Notice: Background CRM config fetch in ClientRegistration:', err);
      });

    return () => window.removeEventListener('crm_config_updated', loadConfig);
  }, [userCompany]);

  const handleSaveDraft = async () => {
    if (!formData.company && !formData.name && !formData.phone) {
      alert('Kripya kam se kam Business Name, Contact Name ya Mobile Number bharein taaki draft save kiya ja sake.');
      return;
    }
    setIsSavingDraft(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const actor = normalizeEmployeeName(user?.email?.split('@')[0] || 'User', teamMembers);
      const draftPayload = {
        ...formData,
        id: currentDraftId || initialData?.id || undefined
      };
      const res = await saveClientRegistrationDraft(draftPayload, userCompany, actor);
      if (res && res.success) {
        if (res.draft?.id) setCurrentDraftId(res.draft.id);
        alert('✅ Draft safely saved! Aap is adhoore form ko kabhi bhi "Saved Drafts" tab se resume kar sakte hain.');
        loadDrafts();
      } else {
        alert('Failed to save draft: ' + (res?.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Error saving draft: ' + e.message);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleResumeDraft = (draft) => {
    setCurrentDraftId(draft.id);
    setFormData(prev => ({
      ...prev,
      ...draft,
      id: draft.id
    }));
    setActiveView('form');
  };

  const handleDeleteDraft = async (draftId) => {
    if (!window.confirm('Kya aap is draft ko delete karna chahte hain?')) return;
    try {
      await deleteClientRegistrationDraft(draftId);
      setDraftsList(prev => prev.filter(d => d.id !== draftId));
      if (currentDraftId === draftId) setCurrentDraftId(null);
    } catch (e) {
      alert('Error deleting draft: ' + e.message);
    }
  };

  const [formData, setFormData] = useState({
    // Lead Info
    assigned_to: '',
    our_company: defaultWorkspaceCompany,
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

  // Comprehensive Real-time duplicate check across ALL 16 contact/mobile numbers (CP1, CP2, CP3, Business 1 & 2) & GST
  useEffect(() => {
    if (isEditMode) return; // Do not check against oneself in edit mode

    const enteredNumbers = [];
    ALL_CONTACT_FIELDS.forEach(f => {
      const val = (formData[f.key] || '').trim();
      const normVal = normalizePhoneTo10(val);
      if (normVal && normVal.length >= 7 && !enteredNumbers.some(e => e.normVal === normVal)) {
        enteredNumbers.push({ key: f.key, label: f.label, val, normVal });
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

        // Build match filters across all 16 database phone/contact columns using normalized 10 digits
        enteredNumbers.forEach(({ val, normVal }) => {
          ALL_CONTACT_KEYS.forEach(col => {
            filters.push(`${col}.eq.${normVal}`);
            if (val && val !== normVal) {
              filters.push(`${col}.eq.${val}`);
            }
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

        const selectQuery = [
          'id', 'lead_ref_id', 'name', 'company', 'business_gst', 'status', 'created_at', 'created_by', 'entry_by', 'assigned_to',
          ...ALL_CONTACT_KEYS
        ].join(', ');

        const { data, error } = await supabase
          .from('leads')
          .select(selectQuery)
          .or(filters.join(','))
          .limit(1);

        if (!error && data && data.length > 0) {
          const match = data[0];
          // If match is the current editing draft itself, skip duplicate alert
          if ((currentDraftId && match.id === currentDraftId) || (formData.id && match.id === formData.id)) {
            setDuplicateInfo(null);
            setIsCheckingDuplicate(false);
            return;
          }

          let matchedOn = 'Contact Number';
          let matchVal = enteredNumbers[0]?.val || '';

          if (gst && match.business_gst && match.business_gst.toLowerCase() === gst.toLowerCase()) {
            matchedOn = 'Business GSTIN';
            matchVal = gst;
          } else {
            // Find which exact number and column matched
            let foundMatch = null;
            for (const e of enteredNumbers) {
              for (const col of ALL_CONTACT_KEYS) {
                const dbNorm = normalizePhoneTo10(match[col]);
                if (dbNorm && dbNorm === e.normVal) {
                  const dbFieldLabel = ALL_CONTACT_FIELDS.find(f => f.key === col)?.label || col;
                  foundMatch = {
                    label: `${e.label} (matches ${dbFieldLabel} in DB)`,
                    val: e.val
                  };
                  break;
                }
              }
              if (foundMatch) break;
            }

            if (foundMatch) {
              matchedOn = foundMatch.label;
              matchVal = foundMatch.val;
            } else {
              matchedOn = enteredNumbers[0]?.label || 'Contact Number';
              matchVal = enteredNumbers[0]?.val || '';
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

          // Pick first available phone number from matched record
          let matchedPhoneDisplay = matchVal;
          for (const col of ALL_CONTACT_KEYS) {
            if (match[col]) {
              matchedPhoneDisplay = match[col];
              break;
            }
          }

          setDuplicateInfo({
            matchedOn,
            matchVal,
            id: match.id,
            lead_ref_id: match.lead_ref_id,
            name: match.name,
            company: match.company,
            phone: matchedPhoneDisplay,
            status: match.status,
            isRegisteredReport: match.status !== 'DRAFT',
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
    formData.business_gst, isEditMode, supabase, teamMembers
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
      
      const rawNormalized = normalizeLeadRecord({
        ...formData
      }, teamMembers);

      if (isEditMode && initialData) {
        // UPDATE MODE: Strictly sanitize against valid database columns
        const cleanPayload = sanitizeLeadPayloadForDb(rawNormalized, true);

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const check = canPerformOfflineAction('clientRegistration');
          if (!check.allowed) {
            alert(check.reason);
            setIsSubmitting(false);
            return;
          }
          const updatedLeadObj = { ...initialData, ...cleanPayload };
          await enqueueOfflineAction('update', 'lead', { ...cleanPayload, id: initialData.id });
          alert('⚡ Offline Mode: Device is offline. Client updates saved to device storage! They will sync to cloud when connected.');
          if (onRegistrationSuccess) onRegistrationSuccess(updatedLeadObj);
          if (onClose) onClose();
        } else {
          try {
            // Dynamic column healing loop (strips non-existent columns if schema cache differs)
            let updateError = null;
            for (let attempt = 0; attempt < 4; attempt++) {
              if (Object.keys(cleanPayload).length === 0) break;
              const { error } = await supabase.from('leads').update(cleanPayload).eq('id', initialData.id);
              if (!error) {
                updateError = null;
                break;
              }
              const match = error.message && error.message.match(/Could not find the '([^']+)' column/i);
              if (match && match[1] && cleanPayload[match[1]] !== undefined) {
                console.warn(`Removing invalid column '${match[1]}' and retrying update...`);
                delete cleanPayload[match[1]];
                updateError = error;
              } else {
                updateError = error;
                break;
              }
            }
            if (updateError) throw updateError;

            const updatedLeadObj = { ...initialData, ...cleanPayload };
            const statusChanged = cleanPayload.status && cleanPayload.status !== initialData.status;
            const cleanOldStatus = (!initialData.status || initialData.status === 'None' || initialData.status.toLowerCase() === 'new' || initialData.status.toLowerCase() === 'pending') 
              ? '01 - New Stage' 
              : initialData.status;
            const noteText = statusChanged 
              ? `Status changed from ${cleanOldStatus} to ${cleanPayload.status}`
              : 'Client Profile was updated.';

            await supabase.from('lead_notes').insert([{
              lead_id: initialData.id,
              note_text: noteText,
              created_by: actor
            }]);
            
            try {
              await logAuditAction('Update Lead', `Updated Lead ID: ${initialData.id} (${cleanPayload.company || cleanPayload.name || 'Unknown'})`);
            } catch(e) { console.error('Audit Log failed', e); }
            
            showSyncToast('✅ Saved to Supabase: Client updated successfully!', 'success', 3500);
            alert('Client Updated Successfully!');
            if (onRegistrationSuccess) onRegistrationSuccess(updatedLeadObj);
            if (onClose) onClose();
          } catch (netErr) {
            console.error('Lead update error:', netErr);
            const isRealOffline = (typeof navigator !== 'undefined' && !navigator.onLine) ||
              (netErr && (
                netErr.name === 'TypeError' ||
                /failed to fetch|network\s*error|load\s*failed/i.test(netErr.message || '')
              ));

            if (isRealOffline) {
              const check = canPerformOfflineAction('clientRegistration');
              if (!check.allowed) {
                showSyncToast(check.reason, 'error', 6000);
                alert(check.reason);
                setIsSubmitting(false);
                return;
              }
              const updatedLeadObj = { ...initialData, ...cleanPayload };
              await enqueueOfflineAction('update', 'lead', { ...cleanPayload, id: initialData.id });
              showSyncToast('⚡ Offline: Client update saved in Sync Center & auto-syncing!', 'info', 5000);
              alert('⚡ Offline Mode: Device is offline. Client updates saved to device storage! They will sync to cloud when connected.');
              if (onRegistrationSuccess) onRegistrationSuccess(updatedLeadObj);
              if (onClose) onClose();
            } else {
              showSyncToast(`❌ Failed to update client: ${netErr.message || 'Database error'}`, 'error', 6000);
              alert(`Failed to update client: ${netErr.message || 'Database error occurred'}`);
              setIsSubmitting(false);
              return;
            }
          }
        }
      } else {
        // INSERT MODE
        rawNormalized.created_by = actor;
        const cleanPayload = sanitizeLeadPayloadForDb(rawNormalized, false);

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const check = canPerformOfflineAction('clientRegistration');
          if (!check.allowed) {
            alert(check.reason);
            setIsSubmitting(false);
            return;
          }
          // Device is offline - queue directly to IndexedDB
          await enqueueOfflineAction('create', 'lead', cleanPayload);
          alert('⚡ Offline Mode: Client saved safely to device disk! It will automatically sync to cloud once internet is connected.');
          if (onRegistrationSuccess) onRegistrationSuccess();
        } else {
          try {
            let insertedData = null;
            let insertError = null;
            for (let attempt = 0; attempt < 4; attempt++) {
              const { data, error } = await supabase.from('leads').insert([cleanPayload]).select();
              if (!error) {
                insertedData = data;
                insertError = null;
                break;
              }
              const match = error.message && error.message.match(/Could not find the '([^']+)' column/i);
              if (match && match[1] && cleanPayload[match[1]] !== undefined) {
                console.warn(`Removing invalid column '${match[1]}' and retrying insert...`);
                delete cleanPayload[match[1]];
                insertError = error;
              } else {
                insertError = error;
                break;
              }
            }
            if (insertError) throw insertError;
            
            let finalNewLeadObj = null;
            if (insertedData && insertedData.length > 0) {
              const newLead = insertedData[0];
              // Get the total count of leads to calculate the stable 15-digit Lead ID
              const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true });
              const d = new Date(newLead.created_at || new Date());
              const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
              const seq = String(count).padStart(7, '0');
              const newFormattedId = dateStr + seq;
              
              // Save the persistent ID back to the database
              await supabase.from('leads').update({ lead_ref_id: newFormattedId }).eq('id', newLead.id);
              
              const regNote = {
                lead_id: newLead.id,
                note_text: 'Client Registration Form Submitted',
                created_by: actor,
                created_at: new Date().toISOString()
              };
              await supabase.from('lead_notes').insert([regNote]);
              
              try {
                await logAuditAction('Create Lead', `Created New Lead: ${cleanPayload.company || cleanPayload.name || 'Unknown'}`);
              } catch(e) { console.error('Audit Log failed', e); }

              finalNewLeadObj = {
                ...newLead,
                lead_ref_id: newFormattedId,
                lead_notes: [regNote]
              };
              await upsertLeadsLocally([finalNewLeadObj]);
            }
            
            if (finalNewLeadObj) {
              try {
                await submitClientRegistrationAndSync(finalNewLeadObj, actor, finalNewLeadObj.our_company || cleanPayload.our_company);
              } catch (syncErr) {
                console.warn('4-way auto-sync notice:', syncErr);
              }
            }

            if (currentDraftId) {
              try {
                await deleteClientRegistrationDraft(currentDraftId);
                setCurrentDraftId(null);
                loadDrafts();
              } catch (draftErr) {
                console.warn('Draft cleanup notice:', draftErr);
              }
            }
            
            showSyncToast('✅ Saved to Supabase: Client registered successfully!', 'success', 3500);
            alert('Client Registered Successfully! (Synced with Client Report, Lead Data & Party Master)');
            if (onRegistrationSuccess) onRegistrationSuccess(finalNewLeadObj);
            if (finalNewLeadObj) {
              window.dispatchEvent(new CustomEvent('crm_leads_imported', { detail: [finalNewLeadObj] }));
            }
          } catch (netErr) {
            console.error('Lead insert error:', netErr);
            const isRealOffline = (typeof navigator !== 'undefined' && !navigator.onLine) ||
              (netErr && (
                netErr.name === 'TypeError' ||
                /failed to fetch|network\s*error|load\s*failed/i.test(netErr.message || '')
              ));

            if (isRealOffline) {
              const check = canPerformOfflineAction('clientRegistration');
              if (!check.allowed) {
                showSyncToast(check.reason, 'error', 6000);
                alert(check.reason);
                setIsSubmitting(false);
                return;
              }
              await enqueueOfflineAction('create', 'lead', cleanPayload);
              showSyncToast('⚡ Offline: Client saved safely in Sync Center & auto-syncing!', 'info', 5000);
              alert('⚡ Offline Mode: Device is offline. Client saved safely to device storage! It will sync to cloud when connected.');
              if (onRegistrationSuccess) onRegistrationSuccess();
            } else {
              showSyncToast(`❌ Failed to register client: ${netErr.message || 'Database error'}`, 'error', 6000);
              alert(`Failed to register client: ${netErr.message || 'Database error occurred'}`);
              setIsSubmitting(false);
              return;
            }
          }
        }
        
        // Reset form (keeping defaults)
        setFormData(prev => ({
          ...prev,
          source_name: '', entry_by: '', business_type: '', business_gst: '', company: '', priority: '', our_company: defaultWorkspaceCompany,
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

      // Ensure teamMembers is loaded even if clicked immediately on page load
      let currentMembers = teamMembers;
      if (!currentMembers || currentMembers.length === 0) {
        if (propTeamMembers && propTeamMembers.length > 0) {
          currentMembers = propTeamMembers;
        } else {
          try {
            const fetched = await getTeamMembers();
            if (fetched && Array.isArray(fetched) && fetched.length > 0) {
              currentMembers = fetched;
              setTeamMembers(fetched);
            }
          } catch (e) {
            console.warn("Could not pre-fetch team members for template:", e);
          }
        }
      }

      const activeMemberNames = (currentMembers || [])
        .filter(m => m.emp_name && (m.emp_status === 'Active' || (!m.emp_status && m.role !== 'customer')))
        .map(m => String(m.emp_name).replace(/,/g, '').trim())
        .filter(Boolean);

      const currentBusinessTypes = (businessTypes && businessTypes.length > 0) ? businessTypes : DEFAULT_BUSINESS_TYPES;
      const investmentRanges = ['Below 1 Lakh', '1 Lakh - 5 Lakh', '5 Lakh - 10 Lakh', '10 Lakh - 25 Lakh', '25 Lakh - 50 Lakh', 'Above 50 Lakh'];
      const timelines = ['Immediate', 'Within 7 Days', 'Within 15 Days', 'Within 30 Days', 'Within 60 Days', 'After 60 Days', 'Not Decided'];

      // Fetch fresh Location Master States & Districts from DB
      let locStates = INDIAN_STATES;
      let locDistMap = INDIAN_DISTRICTS_MAP;
      try {
        const locRes = await getLocationMasterHierarchyCentral();
        if (locRes && locRes.states && locRes.states.length > 0) {
          locStates = locRes.states;
          locDistMap = locRes.stateDistrictMap;
        }
      } catch (locErr) {
        console.warn("Location master fetch notice, falling back to static locations:", locErr);
      }

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Client Registration');

      // Create a hidden lookup sheet to store full lists.
      // This eliminates Excel's 255-character inline formula limit so all 190+ employees appear in dropdowns without errors.
      const listSheet = workbook.addWorksheet('Lists');
      listSheet.state = 'hidden';

      // Column A: Assigned To (Employees)
      listSheet.getCell('A1').value = 'Assigned To';
      activeMemberNames.forEach((name, idx) => {
        listSheet.getCell(`A${idx + 2}`).value = name;
      });

      // Column B: Client Statuses
      listSheet.getCell('B1').value = 'Client Status';
      clientStatuses.forEach((st, idx) => {
        listSheet.getCell(`B${idx + 2}`).value = st;
      });

      // Column C: Lead Sources
      listSheet.getCell('C1').value = 'Lead Source';
      sources.forEach((src, idx) => {
        listSheet.getCell(`C${idx + 2}`).value = src;
      });

      // Column D: Priorities
      listSheet.getCell('D1').value = 'Lead Priority';
      priorities.forEach((p, idx) => {
        listSheet.getCell(`D${idx + 2}`).value = p;
      });

      // Column E: Business Types
      listSheet.getCell('E1').value = 'Business Type';
      currentBusinessTypes.forEach((b, idx) => {
        listSheet.getCell(`E${idx + 2}`).value = b;
      });

      // Column F: Investments
      listSheet.getCell('F1').value = 'Investment';
      investmentRanges.forEach((inv, idx) => {
        listSheet.getCell(`F${idx + 2}`).value = inv;
      });

      // Column G: Timelines
      listSheet.getCell('G1').value = 'Timeline';
      timelines.forEach((t, idx) => {
        listSheet.getCell(`G${idx + 2}`).value = t;
      });

      // Column H: Data Statuses
      const dataStatuses = ['Saved Drafts', 'Partial Confirmed', 'Verified Data'];
      listSheet.getCell('H1').value = 'Data Status';
      dataStatuses.forEach((ds, idx) => {
        listSheet.getCell(`H${idx + 2}`).value = ds;
      });

      // Column I: Lead Statuses (Dynamic Tenant Pipeline Stages)
      listSheet.getCell('I1').value = 'Lead Status';
      tenantLeadStatuses.forEach((ls, idx) => {
        listSheet.getCell(`I${idx + 2}`).value = ls;
      });

      // Column J: States (Location Master)
      listSheet.getCell('J1').value = 'State';
      locStates.forEach((st, idx) => {
        listSheet.getCell(`J${idx + 2}`).value = st;
      });

      const headers = IMPORT_FIELDS.map(f => f.label);
      sheet.addRow(headers);
      
      // Style headers
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      
      // Set column widths
      sheet.columns.forEach(column => { column.width = 22; });

      // Add Sample Data Rows
      const dynamicSampleRows = getDynamicSampleData();
      dynamicSampleRows.forEach(row => {
        sheet.addRow(row);
      });

      // Create Defined Names for workbook to ensure 100% universal dropdown compatibility in Excel, Google Sheets, & LibreOffice
      if (activeMemberNames.length > 0) {
        workbook.definedNames.add(`Lists!$A$2:$A$${activeMemberNames.length + 1}`, 'AssignedToEmployees');
      }
      if (clientStatuses.length > 0) {
        workbook.definedNames.add(`Lists!$B$2:$B$${clientStatuses.length + 1}`, 'ClientStatuses');
      }
      if (sources.length > 0) {
        workbook.definedNames.add(`Lists!$C$2:$C$${sources.length + 1}`, 'LeadSources');
      }
      if (priorities.length > 0) {
        workbook.definedNames.add(`Lists!$D$2:$D$${priorities.length + 1}`, 'LeadPriorities');
      }
      if (businessTypes.length > 0) {
        workbook.definedNames.add(`Lists!$E$2:$E$${businessTypes.length + 1}`, 'BusinessTypes');
      }
      if (investmentRanges.length > 0) {
        workbook.definedNames.add(`Lists!$F$2:$F$${investmentRanges.length + 1}`, 'InvestmentRanges');
      }
      if (timelines.length > 0) {
        workbook.definedNames.add(`Lists!$G$2:$G$${timelines.length + 1}`, 'TimelineRanges');
      }
      workbook.definedNames.add(`Lists!$H$2:$H$${dataStatuses.length + 1}`, 'DataStatuses');
      if (tenantLeadStatuses.length > 0) {
        workbook.definedNames.add(`Lists!$I$2:$I$${tenantLeadStatuses.length + 1}`, 'LeadStatuses');
      }
      if (locStates.length > 0) {
        workbook.definedNames.add(`Lists!$J$2:$J$${locStates.length + 1}`, 'IndianStates');
      }

      // Hidden Worksheet: DistrictLists for Dependent District Dropdowns based on Selected State
      const distSheet = workbook.addWorksheet('DistrictLists');
      distSheet.state = 'hidden';

      const getExcelColLetter = (col) => {
        let letter = '';
        while (col > 0) {
          const mod = (col - 1) % 26;
          letter = String.fromCharCode(65 + mod) + letter;
          col = Math.floor((col - mod) / 26);
        }
        return letter;
      };

      let distColIdx = 1;
      locStates.forEach(state => {
        const safeName = String(state).trim().replace(/\s+/g, '_');
        const districts = locDistMap[state] || [];
        const colLetter = getExcelColLetter(distColIdx);
        distSheet.getCell(`${colLetter}1`).value = safeName;
        districts.forEach((d, dIdx) => {
          distSheet.getCell(`${colLetter}${dIdx + 2}`).value = d;
        });
        if (districts.length > 0) {
          workbook.definedNames.add(`DistrictLists!$${colLetter}$2:$${colLetter}$${districts.length + 1}`, safeName);
        }
        distColIdx++;
      });

      // Add Data Validation Dropdowns for rows 2 to 500 across all dropdown columns
      // Our Company Name (Column 2 -> B)
      const allowedCompanies = isSwanWorkspace 
        ? ['NSMLR', 'NSTLP']
        : [userCompany || 'SuPuja Creations'];
      sheet.dataValidations.add('B2:B500', {
        type: 'list',
        allowBlank: true,
        formulae: [`"${allowedCompanies.join(',')}"`]
      });

      // Lead Source (Column 3 -> C)
      if (sources.length > 0) {
        sheet.dataValidations.add('C2:C500', {
          type: 'list',
          allowBlank: true,
          formulae: ['=LeadSources']
        });
      }

      // Entry By (Column 5 -> E)
      if (activeMemberNames.length > 0) {
        sheet.dataValidations.add('E2:E500', {
          type: 'list',
          allowBlank: true,
          formulae: ['=AssignedToEmployees']
        });
      }

      // Assigned To (Column 6 -> F)
      if (activeMemberNames.length > 0) {
        sheet.dataValidations.add('F2:F500', {
          type: 'list',
          allowBlank: true,
          formulae: ['=AssignedToEmployees']
        });
      }

      // Client Status (Column 7 -> G)
      if (clientStatuses.length > 0) {
        sheet.dataValidations.add('G2:G500', {
          type: 'list',
          allowBlank: true,
          formulae: ['=ClientStatuses']
        });
      }

      // Lead Priority Type (Column 8 -> H)
      if (priorities.length > 0) {
        sheet.dataValidations.add('H2:H500', {
          type: 'list',
          allowBlank: true,
          formulae: ['=LeadPriorities']
        });
      }

      // Lead Status (Column 9 -> I)
      if (tenantLeadStatuses.length > 0) {
        sheet.dataValidations.add('I2:I500', {
          type: 'list',
          allowBlank: true,
          formulae: ['=LeadStatuses']
        });
      }

      // Business Type (Column 11 -> K)
      if (businessTypes.length > 0) {
        sheet.dataValidations.add('K2:K500', {
          type: 'list',
          allowBlank: true,
          formulae: ['=BusinessTypes']
        });
      }

      // State (Column 42 -> AP)
      if (locStates.length > 0) {
        sheet.dataValidations.add('AP2:AP500', {
          type: 'list',
          allowBlank: true,
          formulae: ['=IndianStates']
        });
      }

      // District (Column 43 -> AQ, Dependent Dropdown dynamically resolved by State in AP)
      sheet.dataValidations.add('AQ2:AQ500', {
        type: 'list',
        allowBlank: true,
        formulae: ['=INDIRECT(SUBSTITUTE(AP2," ","_"))']
      });

      // Investment (Column 50 -> AX)
      if (investmentRanges.length > 0) {
        sheet.dataValidations.add('AX2:AX500', {
          type: 'list',
          allowBlank: true,
          formulae: ['=InvestmentRanges']
        });
      }

      // Buying Timeline (Column 51 -> AY)
      if (timelines.length > 0) {
        sheet.dataValidations.add('AY2:AY500', {
          type: 'list',
          allowBlank: true,
          formulae: ['=TimelineRanges']
        });
      }

      // Data Status (Column 52 -> AZ)
      sheet.dataValidations.add('AZ2:AZ500', {
        type: 'list',
        allowBlank: true,
        formulae: ['=DataStatuses']
      });

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), 'Lead_Registration_Template.xlsx');
    } catch (err) {
      console.error("Error generating Excel template:", err);
      alert("Could not generate Excel template: " + err.message);
    }
  };

  const handleDownloadCsvTemplate = async () => {
    try {
      const { saveAs } = await import('file-saver');
      const headers = IMPORT_FIELDS.map(f => f.label);
      const dynamicSampleRows = getDynamicSampleData();
      
      const csvRowsList = [
        headers.join(','),
        ...dynamicSampleRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ];
      const csvContent = csvRowsList.join('\n') + '\n';
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, 'Lead_Registration_Template.csv');
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
    // Check if at least one contact field or GST is mapped
    const hasContactMapped = ALL_CONTACT_KEYS.some(k => mapping[k]) || mapping['business_gst'];
    if (!hasContactMapped) {
      if (!confirm("Warning: You have not mapped any Contact/Mobile Number or Business GST. Duplicate checking will be skipped and all rows will be marked ready. Do you want to proceed?")) {
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
        
        // Resolve assigned_to to team member ID (UUID)
        if (leadObj.assigned_to) {
          leadObj.assigned_to = resolveTeamMemberId(leadObj.assigned_to, teamMembers);
        } else {
          leadObj.assigned_to = null;
        }
        
        return leadObj;
      });

      let ready = [];
      let duplicatesList = [];
      let alreadyInReportList = [];
      let potentialMatchesList = [];

      if (hasContactMapped) {
        // Query database for duplicates across all 16 contact columns & business_gst
        const selectFields = [
          'id',
          'lead_ref_id',
          'name',
          'company',
          'business_gst',
          'status',
          'entry_by',
          'created_by',
          'created_at',
          'state_name',
          'district_name',
          'city_name',
          ...ALL_CONTACT_KEYS
        ].join(', ');

        let existingLeads = [];
        let fetchPage = 0;
        while (true) {
          const { data: pageData, error: fetchErr } = await supabase
            .from('leads')
            .select(selectFields)
            .range(fetchPage * 1000, (fetchPage + 1) * 1000 - 1);
          
          if (fetchErr) throw fetchErr;
          if (pageData && pageData.length > 0) {
            existingLeads = [...existingLeads, ...pageData];
          }
          if (!pageData || pageData.length < 1000) break;
          fetchPage++;
        }
        
        // Build normalized lookup maps from database
        const existingPhonesMap = new Map(); // normalized 10-digit -> { lead_ref_id, company, status, entry_by, isRegisteredReport, field }
        const existingGSTMap = new Map();    // uppercase GSTIN -> { lead_ref_id, company, status, entry_by, isRegisteredReport }
        const locationCandidatesMap = new Map(); // "state_district" -> array of lead objects
        const companyPrefixMap = new Map();     // "first3Letters" -> array of lead objects

        existingLeads.forEach(l => {
          const isRegistered = l.status !== 'DRAFT';
          ALL_CONTACT_KEYS.forEach(col => {
            const p10 = normalizePhoneTo10(l[col]);
            if (p10 && p10.length >= 7 && !existingPhonesMap.has(p10)) {
              existingPhonesMap.set(p10, {
                lead_ref_id: l.lead_ref_id || l.id,
                company: l.company || l.name || 'Existing Lead',
                status: l.status || 'Active',
                entry_by: l.entry_by || l.created_by || 'Staff',
                isRegisteredReport: isRegistered,
                field: col
              });
            }
          });
          if (l.business_gst && String(l.business_gst).trim().length >= 8) {
            const cleanGST = String(l.business_gst).trim().toUpperCase();
            if (!existingGSTMap.has(cleanGST)) {
              existingGSTMap.set(cleanGST, {
                lead_ref_id: l.lead_ref_id || l.id,
                company: l.company || l.name || 'Existing Lead',
                status: l.status || 'Active',
                entry_by: l.entry_by || l.created_by || 'Staff',
                isRegisteredReport: isRegistered
              });
            }
          }

          const s = String(l.state_name || '').toLowerCase().trim();
          const d = String(l.district_name || '').toLowerCase().trim();
          if (s || d) {
            const locKey = `${s}_${d}`;
            if (!locationCandidatesMap.has(locKey)) locationCandidatesMap.set(locKey, []);
            locationCandidatesMap.get(locKey).push(l);
          }

          const cleanComp = cleanCorporateName(l.company);
          if (cleanComp && cleanComp.length >= 2) {
            const pfx = cleanComp.substring(0, Math.min(3, cleanComp.length));
            if (!companyPrefixMap.has(pfx)) companyPrefixMap.set(pfx, []);
            companyPrefixMap.get(pfx).push(l);
          }
        });

        // Intra-file tracking maps to detect duplicate rows within the uploaded file itself
        const seenInFilePhones = new Map(); // normalized 10-digit -> rowNum
        const seenInFileGSTs = new Map();   // uppercase GSTIN -> rowNum

        mapped.forEach(row => {
          // Resolve data_status for each row
          const rawDataStatus = (row.data_status || defaultDataStatus || 'Verified Data').trim();
          if (/draft/i.test(rawDataStatus)) {
            row.data_status = 'Saved Drafts';
          } else if (/partial/i.test(rawDataStatus)) {
            row.data_status = 'Partial Confirmed';
          } else {
            row.data_status = 'Verified Data';
          }

          // PRESERVE user's real Lead Status from Excel if provided; only default if empty/None/DRAFT
          if (!row.status || row.status === 'None' || row.status === 'DRAFT' || row.status === 'Partial Confirmed' || row.status === 'Verified Data') {
            row.status = tenantLeadStatuses[0] || '1;01>New Stage>New Lead';
          }

          const rowNumbers = [];
          ALL_CONTACT_KEYS.forEach(col => {
            const val = normalizePhoneTo10(row[col]);
            if (val && val.length >= 7) {
              const fieldLabel = ALL_CONTACT_FIELDS.find(f => f.key === col)?.label || col;
              rowNumbers.push({ col, val, fieldLabel, raw: row[col] });
            }
          });

          const rowGST = row.business_gst ? String(row.business_gst).trim().toUpperCase() : '';

          let dbMatch = null;
          let fileMatch = null;

          for (const item of rowNumbers) {
            if (existingPhonesMap.has(item.val)) {
              dbMatch = {
                type: item.fieldLabel,
                val: item.val,
                details: existingPhonesMap.get(item.val)
              };
              break;
            }
            if (seenInFilePhones.has(item.val)) {
              fileMatch = {
                type: item.fieldLabel,
                val: item.val,
                rowNum: seenInFilePhones.get(item.val)
              };
              break;
            }
          }

          if (!dbMatch && rowGST && rowGST.length >= 8) {
            if (existingGSTMap.has(rowGST)) {
              dbMatch = { type: 'Business GSTIN', val: rowGST, details: existingGSTMap.get(rowGST) };
            } else if (seenInFileGSTs.has(rowGST)) {
              fileMatch = { type: 'Business GSTIN', val: rowGST, rowNum: seenInFileGSTs.get(rowGST) };
            }
          }

          if (dbMatch) {
            row._isDuplicate = true;
            row._matchScore = 100;
            if (dbMatch.details.isRegisteredReport) {
              row._isAlreadyInReport = true;
              row._dupReason = `⚠️ Already in Lead Registered Report! Matches #${dbMatch.details.lead_ref_id} (${dbMatch.details.company}) - Registered by ${dbMatch.details.entry_by}`;
              alreadyInReportList.push(row);
            } else {
              row._dupReason = `Duplicate with existing Draft #${dbMatch.details.lead_ref_id} (${dbMatch.details.company})`;
              duplicatesList.push(row);
            }
          } else if (fileMatch) {
            row._isDuplicate = true;
            row._matchScore = 100;
            row._dupReason = `Duplicate ${fileMatch.type} (${fileMatch.val}) matches Row #${fileMatch.rowNum} in this file`;
            duplicatesList.push(row);
          } else {
            row._isDuplicate = false;

            // Fuzzy Similarity Search against candidate leads
            let bestSim = { score: 0, reason: '' };
            let bestCandidate = null;

            const rowState = String(row.state_name || row.state || '').toLowerCase().trim();
            const rowDist = String(row.district_name || row.district || '').toLowerCase().trim();
            const locKey = `${rowState}_${rowDist}`;
            const cleanRowComp = cleanCorporateName(row.company);
            const pfx = cleanRowComp && cleanRowComp.length >= 2 ? cleanRowComp.substring(0, Math.min(3, cleanRowComp.length)) : '';

            const candidateSet = new Set();
            if (locationCandidatesMap.has(locKey)) {
              locationCandidatesMap.get(locKey).forEach(c => candidateSet.add(c));
            }
            if (pfx && companyPrefixMap.has(pfx)) {
              companyPrefixMap.get(pfx).forEach(c => candidateSet.add(c));
            }

            for (const cand of candidateSet) {
              const sim = calculateLeadSimilarityScore(row, cand);
              if (sim.score > bestSim.score) {
                bestSim = sim;
                bestCandidate = cand;
                if (sim.score >= 95) break;
              }
            }

            row._matchScore = bestSim.score;
            if (bestSim.score >= 50 && bestCandidate) {
              row._isPotentialMatch = true;
              row._matchedRecord = bestCandidate;
              row._matchReason = `${bestSim.score}% Similarity: ${bestSim.reason} with #${bestCandidate.lead_ref_id || bestCandidate.id} (${bestCandidate.company || bestCandidate.name})`;
              potentialMatchesList.push(row);
            } else {
              row._isPotentialMatch = false;
              row._matchScore = 0;
            }

            ready.push(row);
            rowNumbers.forEach(item => seenInFilePhones.set(item.val, row._rowNum));
            if (rowGST && rowGST.length >= 8) seenInFileGSTs.set(rowGST, row._rowNum);
          }
        });
      } else {
        ready = mapped.map(r => {
          const rawDataStatus = (r.data_status || defaultDataStatus || 'Verified Data').trim();
          if (/draft/i.test(rawDataStatus)) {
            r.data_status = 'Saved Drafts';
          } else if (/partial/i.test(rawDataStatus)) {
            r.data_status = 'Partial Confirmed';
          } else {
            r.data_status = 'Verified Data';
          }
          if (!r.status || r.status === 'None' || r.status === 'DRAFT' || r.status === 'Partial Confirmed' || r.status === 'Verified Data') {
            r.status = tenantLeadStatuses[0] || '1;01>New Stage>New Lead';
          }
          r._matchScore = 0;
          return { ...r, _isDuplicate: false };
        });
      }

      setDuplicatesCount(duplicatesList.length);
      setAlreadyInReportImportData(alreadyInReportList);
      setPotentialMatchesImportData(potentialMatchesList);
      setFilteredImportData(ready);
      setDuplicateImportData(duplicatesList);
      setAllMappedData(mapped);
      setPreviewFilterTab('all');
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
    if (filteredImportData.length === 0) {
      alert("No valid new client rows to import.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const actor = normalizeEmployeeName(user?.email?.split('@')[0] || 'Admin', teamMembers);

      const draftsToInsert = [];
      const registeredToInsert = [];

      filteredImportData.forEach(r => {
        if (r.data_status === 'Saved Drafts' || r.status === 'DRAFT') {
          draftsToInsert.push(r);
        } else {
          registeredToInsert.push(r);
        }
      });

      // 1. Fetch current lead count once to generate incremental lead_ref_ids cleanly beforehand
      const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true });
      let currentSeq = count || 0;

      const allInsertedLeads = [];
      const chunkSize = 200;
      for (let i = 0; i < filteredImportData.length; i += chunkSize) {
        const chunk = filteredImportData.slice(i, i + chunkSize);
        
        // Strip out internal preview metadata and assign lead_ref_id before inserting
        const cleanChunk = chunk.map((r) => {
          const copy = normalizeLeadRecord({ ...r }, teamMembers);
          delete copy._rowNum;
          delete copy._isDuplicate;
          delete copy._dupReason;
          delete copy._isAlreadyInReport;
          delete copy._matchScore;
          delete copy._isPotentialMatch;
          delete copy._matchedRecord;
          delete copy._matchReason;

          currentSeq++;
          const d = new Date();
          const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
          const seq = String(currentSeq).padStart(7, '0');
          copy.lead_ref_id = dateStr + seq;

          // Resolve assigned_to to valid UUID or null
          if (copy.assigned_to) {
            copy.assigned_to = resolveTeamMemberId(copy.assigned_to, teamMembers);
          } else {
            copy.assigned_to = null;
          }

          if (!copy.entry_by) copy.entry_by = actor;
          if (!copy.created_by) copy.created_by = actor;

          if (r.data_status === 'Saved Drafts') {
            copy.status = 'DRAFT';
          } else {
            // Preserve user's real Lead Status from Excel; only default if empty/None/DRAFT
            if (!copy.status || copy.status === 'None' || copy.status === 'DRAFT' || copy.status === 'Verified Data' || copy.status === 'Partial Confirmed') {
              copy.status = tenantLeadStatuses[0] || '1;01>New Stage>New Lead';
            }
          }

          // Convert empty string for dates, timestamps, or UUIDs to null to prevent Postgres syntax errors
          Object.keys(copy).forEach(k => {
            if (copy[k] === '' && (k.endsWith('_date') || k.endsWith('_at') || k.endsWith('timestamp') || k === 'assigned_to')) {
              copy[k] = null;
            }
          });

          return sanitizeLeadPayloadForDb(copy, false);
        });

        const { data: insertedRows, error } = await supabase.from('leads').insert(cleanChunk).select();
        if (error) {
          console.error(`Error inserting chunk ${i} to ${i + chunkSize}:`, error);
          throw new Error(`Failed to upload chunk starting at row ${i + 1}. Error: ${error.message}`);
        }
        if (Array.isArray(insertedRows) && insertedRows.length > 0) {
          allInsertedLeads.push(...insertedRows);
        }

        // Brief yield to avoid blocking the main thread
        await new Promise(resolve => setTimeout(resolve, 30));
      }

      // 2. Immediately upsert all inserted leads to local IndexedDB
      if (allInsertedLeads.length > 0) {
        await upsertLeadsLocally(allInsertedLeads);

        // Batch insert registration notes in background for audit & delta sync tracking
        try {
          const notes = allInsertedLeads.map(l => ({
            lead_id: l.id,
            note_text: (l.status === 'DRAFT' ? 'Client Draft Saved via Bulk Upload' : 'Client Registered via Bulk Import') + (l.assigned_to ? ` (Assigned to ${normalizeEmployeeName(l.assigned_to, teamMembers)})` : ''),
            created_by: actor
          }));
          for (let j = 0; j < notes.length; j += 200) {
            await supabase.from('lead_notes').insert(notes.slice(j, j + 200));
          }
        } catch (noteErr) {
          console.warn("Failed to create bulk import notes:", noteErr);
        }
      }

      setShowImporter(false);

      if (registeredToInsert.length > 0 && onRegistrationSuccess) {
        onRegistrationSuccess(allInsertedLeads);
        alert(`✅ Bulk Upload Complete!\n• ${registeredToInsert.length} clients registered in Lead Registered Report\n• ${draftsToInsert.length} saved as Drafts in New Lead Registration`);
      } else {
        // Only drafts uploaded -> stay in New Lead Registration -> Saved Drafts
        setActiveView('drafts');
        loadDrafts();
        alert(`✅ Successfully uploaded ${draftsToInsert.length} incomplete records as Drafts!\nThey are now ready in "Saved Drafts" tab for data entry completion.`);
      }

      if (allInsertedLeads.length > 0) {
        window.dispatchEvent(new CustomEvent('crm_leads_imported', { detail: allInsertedLeads }));
      }
    } catch (err) {
      console.error(err);
      alert('Error uploading file: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderInput = (label, name, type = 'text', required = false) => {
    const fieldConfig = clientFormFields?.[name];
    if (fieldConfig && fieldConfig.enabled === false) return null;
    const isReq = fieldConfig?.required !== undefined ? fieldConfig.required : required;
    const displayLabel = fieldConfig?.label || label;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
          {displayLabel} {isReq && <span style={{color: 'red'}}>*</span>}
        </label>
        <input 
          type={type} 
          name={name} 
          value={formData[name] ?? ''} 
          onChange={handleChange} 
          required={isReq}
          style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
        />
      </div>
    );
  };

  return (
    <div style={{ width: '100%', flex: 1, overflowY: 'auto', paddingRight: '0.5rem', paddingBottom: '2rem' }}>
      <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
        
        {/* Header with Upload Tools */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-primary)' }}>
            <CheckCircle2 size={24} color="var(--accent-color)" />
            {isEditMode ? 'Edit Lead Profile' : 'New Lead Registration'}
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

        {/* Navigation Tabs: Form vs Saved Drafts */}
        {!isEditMode && (
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setActiveView('form')}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '8px',
                border: activeView === 'form' ? '1px solid var(--accent-color)' : '1px solid var(--border-light)',
                background: activeView === 'form' ? 'var(--accent-color)' : 'var(--bg-primary)',
                color: activeView === 'form' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease'
              }}
            >
              <UserPlus size={16} /> New Lead Registration
            </button>
            <button
              type="button"
              onClick={() => { setActiveView('drafts'); loadDrafts(); }}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '8px',
                border: activeView === 'drafts' ? '1px solid var(--accent-color)' : '1px solid var(--border-light)',
                background: activeView === 'drafts' ? 'var(--accent-color)' : 'var(--bg-primary)',
                color: activeView === 'drafts' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease'
              }}
            >
              <FileText size={16} /> Saved Drafts
              {draftsList.length > 0 && (
                <span style={{
                  backgroundColor: activeView === 'drafts' ? '#ffffff' : 'var(--accent-color)',
                  color: activeView === 'drafts' ? 'var(--accent-color)' : '#ffffff',
                  fontSize: '0.75rem',
                  padding: '0.1rem 0.5rem',
                  borderRadius: '10px',
                  fontWeight: 700
                }}>
                  {draftsList.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Drafts View */}
        {activeView === 'drafts' && !isEditMode ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={20} color="var(--accent-color)" /> Saved Registration Drafts
                </h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Incomplete/adhoore client forms saved for data entry completion. Resume any draft to verify and register to report.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                {/* Search Bar */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={14} style={{ position: 'absolute', left: '0.6rem', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    value={draftSearch}
                    onChange={(e) => { setDraftSearch(e.target.value); setDraftPage(1); }}
                    placeholder="Search drafts by Name, Phone, City, GST..."
                    style={{
                      padding: '0.45rem 0.6rem 0.45rem 1.9rem',
                      fontSize: '0.85rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      width: '240px'
                    }}
                  />
                </div>

                {/* Tarika A vs Tarika B Scope Toggle (for authorized users with can_view_all_drafts power) */}
                {canViewAllDrafts && (
                  <div style={{ display: 'flex', gap: '0.2rem', background: 'var(--bg-primary)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                    <button
                      type="button"
                      onClick={() => { setDraftViewFilter('all'); setDraftPage(1); }}
                      style={{
                        padding: '0.35rem 0.7rem',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '0.8rem',
                        fontWeight: draftViewFilter === 'all' ? 700 : 500,
                        backgroundColor: draftViewFilter === 'all' ? 'var(--bg-surface)' : 'transparent',
                        color: draftViewFilter === 'all' ? 'var(--accent-color)' : 'var(--text-secondary)',
                        boxShadow: draftViewFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        cursor: 'pointer'
                      }}
                    >
                      📋 All Drafts ({draftsList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDraftViewFilter('my'); setDraftPage(1); }}
                      style={{
                        padding: '0.35rem 0.7rem',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '0.8rem',
                        fontWeight: draftViewFilter === 'my' ? 700 : 500,
                        backgroundColor: draftViewFilter === 'my' ? 'var(--bg-surface)' : 'transparent',
                        color: draftViewFilter === 'my' ? 'var(--accent-color)' : 'var(--text-secondary)',
                        boxShadow: draftViewFilter === 'my' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        cursor: 'pointer'
                      }}
                    >
                      👤 My Drafts ({draftsList.filter(d => (d.entry_by || d.created_by || '').toLowerCase().includes((currentActor || '').toLowerCase())).length})
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setCurrentDraftId(null);
                    setActiveView('form');
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--accent-color)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <UserPlus size={15} /> Start New Client Form
                </button>
              </div>
            </div>

            {isLoadingDrafts ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading saved drafts...
              </div>
            ) : filteredDraftsList.length === 0 ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px dashed var(--border-light)' }}>
                <Clock size={36} color="var(--text-secondary)" style={{ margin: '0 auto 0.75rem auto', opacity: 0.6 }} />
                <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem' }}>No Matching Saved Drafts</h4>
                <p style={{ margin: '0.5rem 0 1.25rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {draftSearch ? 'Aapki search query se koi draft match nahi hua.' : 'Aapka koi saved draft nahi hai. Jab aap form bharte waqt "Save as Draft" ya CSV se adhoora data upload karenge, tab wo yahan aayega.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentDraftId(null);
                    setDraftSearch('');
                    setActiveView('form');
                  }}
                  style={{
                    padding: '0.5rem 1.2rem',
                    background: 'var(--accent-color)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Fill Client Registration Form
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Business / Client Name</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Contact Person &amp; Phone</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>City / State</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Missing Information</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Last Saved</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Saved By</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedDrafts.map(draft => {
                        const missing = [];
                        if (!draft.business_gst) missing.push('GST');
                        if (!draft.phone) missing.push('Phone');
                        if (!draft.city_name && !draft.state_name) missing.push('Address');
                        if (!draft.email) missing.push('Email');

                        return (
                          <tr key={draft.id} style={{ borderBottom: '1px solid var(--border-light)', background: 'var(--bg-surface)' }}>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span>{draft.company || draft.name || 'Unnamed Client'}</span>
                                {draft.lead_ref_id && (
                                  <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', borderRadius: '3px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                    #{draft.lead_ref_id}
                                  </span>
                                )}
                              </div>
                              {draft.business_gst && (
                                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400, marginTop: '2px' }}>
                                  GST: {draft.business_gst}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)' }}>
                              <div>{draft.name || '-'}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{draft.phone || '-'}</div>
                            </td>
                            <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                              {[draft.city_name, draft.state_name].filter(Boolean).join(', ') || '-'}
                            </td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              {missing.length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                  {missing.map(m => (
                                    <span key={m} style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: '#fef3c7', color: '#92400e', fontWeight: 600, border: '1px solid #fde68a' }}>
                                      {m}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>All Core Info Filled</span>
                              )}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                              {draft.updated_at || draft.created_at ? (
                                new Date(draft.updated_at || draft.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })
                              ) : '-'}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                              {draft.entry_by || draft.created_by || '-'}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleResumeDraft(draft)}
                                  style={{
                                    padding: '0.35rem 0.75rem',
                                    background: 'var(--accent-color)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '5px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.3rem'
                                  }}
                                  title="Resume & Complete Registration"
                                >
                                  <Edit3 size={13} /> Complete &amp; Register
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDraft(draft.id)}
                                  style={{
                                    padding: '0.35rem 0.65rem',
                                    background: '#fee2e2',
                                    color: '#b91c1c',
                                    border: '1px solid #fca5a5',
                                    borderRadius: '5px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.3rem'
                                  }}
                                  title="Delete Draft"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Standard Unified Pagination Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.5rem', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <div>
                    Showing <strong>{filteredDraftsList.length === 0 ? 0 : (draftPage - 1) * draftPageSize + 1}</strong> to <strong>{Math.min(draftPage * draftPageSize, filteredDraftsList.length)}</strong> of <strong>{filteredDraftsList.length}</strong> drafts
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>Rows:</span>
                      <select
                        value={draftPageSize}
                        onChange={(e) => { setDraftPageSize(Number(e.target.value)); setDraftPage(1); }}
                        style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', fontSize: '0.82rem' }}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <button
                        type="button"
                        disabled={draftPage <= 1}
                        onClick={() => setDraftPage(1)}
                        style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: draftPage <= 1 ? 'not-allowed' : 'pointer', opacity: draftPage <= 1 ? 0.4 : 1 }}
                      >
                        «
                      </button>
                      <button
                        type="button"
                        disabled={draftPage <= 1}
                        onClick={() => setDraftPage(p => Math.max(1, p - 1))}
                        style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: draftPage <= 1 ? 'not-allowed' : 'pointer', opacity: draftPage <= 1 ? 0.4 : 1 }}
                      >
                        ‹
                      </button>
                      <span style={{ fontWeight: 600, padding: '0 0.35rem' }}>
                        Page {draftPage} of {totalDraftPages}
                      </span>
                      <button
                        type="button"
                        disabled={draftPage >= totalDraftPages}
                        onClick={() => setDraftPage(p => Math.min(totalDraftPages, p + 1))}
                        style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: draftPage >= totalDraftPages ? 'not-allowed' : 'pointer', opacity: draftPage >= totalDraftPages ? 0.4 : 1 }}
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        disabled={draftPage >= totalDraftPages}
                        onClick={() => setDraftPage(totalDraftPages)}
                        style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: draftPage >= totalDraftPages ? 'not-allowed' : 'pointer', opacity: draftPage >= totalDraftPages ? 0.4 : 1 }}
                      >
                        »
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Active Draft Banner */}
            {currentDraftId && (
              <div style={{
                background: '#e0f2fe',
                border: '1px solid #7dd3fc',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}>
                <div style={{ fontSize: '0.88rem', color: '#0369a1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>📝 Resuming Saved Draft (ID: #{currentDraftId})</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentDraftId(null);
                    setFormData(prev => ({
                      ...prev,
                      source_name: '', entry_by: '', business_type: '', business_gst: '', company: '', priority: '', our_company: defaultWorkspaceCompany,
                      business_contact_1: '', business_contact_2: '', business_alt_1: '', business_alt_2: '',
                      business_email_1: '', business_email_2: '', business_alt_email_1: '', business_alt_email_2: '',
                      name: '', phone: '', cp1_mobile_2: '', cp1_alt_1: '', cp1_alt_2: '', email: '', cp1_email_2: '',
                      cp2_name: '', cp2_mobile_1: '', cp2_mobile_2: '', cp2_alt_1: '', cp2_alt_2: '', cp2_email_1: '', cp2_email_2: '',
                      cp3_name: '', cp3_mobile_1: '', cp3_mobile_2: '', cp3_alt_1: '', cp3_alt_2: '', cp3_email_1: '', cp3_email_2: '',
                      state_name: '', district_name: '', pin_code: '', city_name: '', tehsil_name: '', block_name: '', address: '',
                      requirement: '', investment: '', buying_timeline: ''
                    }));
                  }}
                  style={{
                    padding: '0.3rem 0.65rem',
                    background: '#ffffff',
                    border: '1px solid #7dd3fc',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    color: '#0369a1',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Cancel Draft &amp; Start Fresh
                </button>
              </div>
            )}

            {/* Real-Time Duplicate Alert Banner */}
        {duplicateInfo && (
          <div style={{
            backgroundColor: duplicateInfo.isRegisteredReport ? '#fff1f2' : 'rgba(239, 68, 68, 0.08)',
            border: `1.5px solid ${duplicateInfo.isRegisteredReport ? '#fecdd3' : 'rgba(239, 68, 68, 0.35)'}`,
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.85rem'
          }}>
            <AlertTriangle size={22} color={duplicateInfo.isRegisteredReport ? '#be123c' : '#ef4444'} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '0.94rem', color: duplicateInfo.isRegisteredReport ? '#9f1239' : '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>{duplicateInfo.isRegisteredReport ? '🚨 ALREADY REGISTERED IN LEAD REGISTERED REPORT!' : '⚠️ Duplicate Client Found in Database!'}</span>
                {duplicateInfo.lead_ref_id && (
                  <span style={{ fontSize: '0.78rem', padding: '0.12rem 0.5rem', borderRadius: '4px', backgroundColor: duplicateInfo.isRegisteredReport ? '#fee2e2' : '#fee2e2', color: duplicateInfo.isRegisteredReport ? '#9f1239' : '#991b1b', fontFamily: 'monospace', fontWeight: 700 }}>
                    #{duplicateInfo.lead_ref_id}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.86rem', color: 'var(--text-primary)', marginTop: '0.35rem', lineHeight: '1.4' }}>
                A client with matching <strong>{duplicateInfo.matchedOn}</strong> (<code>{duplicateInfo.matchVal}</code>) {duplicateInfo.isRegisteredReport ? 'is ALREADY actively registered in Lead Registered Report as' : 'already exists as'} <strong>{duplicateInfo.company || duplicateInfo.name || 'Unnamed Client'}</strong> {duplicateInfo.name && duplicateInfo.company && `(${duplicateInfo.name})`} with Status: <strong style={{ color: duplicateInfo.isRegisteredReport ? '#be123c' : 'inherit' }}>{duplicateInfo.status || 'Active'}</strong>.
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

                {(!clientFormFields?.our_company || clientFormFields.our_company.enabled !== false) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {clientFormFields?.our_company?.label || 'Our Company Name'} <span style={{color: 'red'}}>*</span>
                    </label>
                    <select name="our_company" value={formData.our_company === 'NSTL' ? 'NSTLP' : formData.our_company} onChange={handleChange} required style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}>
                      {isSwanWorkspace ? (
                        <>
                          <option value="">Select Company</option>
                          <option value="NSMLR">NSMLR</option>
                          <option value="NSTLP">NSTLP</option>
                        </>
                      ) : (
                        <option value={userCompany || 'Client Workspace'}>{userCompany || 'Client Workspace'}</option>
                      )}
                    </select>
                  </div>
                )}

                {(!clientFormFields?.source || clientFormFields.source.enabled !== false) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {clientFormFields?.source?.label || 'Lead Source'} {Boolean(clientFormFields?.source?.required) && <span style={{color: 'red'}}>*</span>}
                    </label>
                    <select 
                      name="source" 
                      value={formData.source} 
                      onChange={handleChange} 
                      required={Boolean(clientFormFields?.source?.required)}
                      style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                    >
                      <option value="">Select Lead Source</option>
                      {sources.map(src => (
                        <option key={src} value={src}>{src}</option>
                      ))}
                    </select>
                  </div>
                )}

                {renderInput('Source Name', 'source_name', 'text')}

                {/* Lead Entry By - Custom Search & Dropdown (Top Manual Entry Allowed) */}
                {(!clientFormFields?.entry_by || clientFormFields.entry_by.enabled !== false) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {clientFormFields?.entry_by?.label || 'Lead Entry By'} {Boolean(clientFormFields?.entry_by?.required) && <span style={{color: 'red'}}>*</span>}
                    </label>
                    <SearchableEntryByDropdown
                      value={formData.entry_by || ''}
                      onChange={(val) => setFormData(prev => ({ ...prev, entry_by: val }))}
                      teamMembers={teamMembers}
                    />
                  </div>
                )}

                {/* Assigned To Row - Strict Custom Search & Dropdown ONLY (No Manual Option) */}
                {(!clientFormFields?.assigned_to || clientFormFields.assigned_to.enabled !== false) && (
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {clientFormFields?.assigned_to?.label || 'Assign To (Agent)'} {Boolean(clientFormFields?.assigned_to?.required) && <span style={{color: 'red'}}>*</span>}
                    </label>
                    <SearchableAssignToDropdown
                      value={formData.assigned_to || ''}
                      onChange={(val) => setFormData(prev => ({ ...prev, assigned_to: val }))}
                      teamMembers={teamMembers}
                    />
                  </div>
                )}

                {(!clientFormFields?.status || clientFormFields.status.enabled !== false) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {clientFormFields?.status?.label || 'Client Status'} {Boolean(clientFormFields?.status?.required) && <span style={{color: 'red'}}>*</span>}
                    </label>
                    <select 
                      name="status" 
                      value={formData.status} 
                      onChange={handleChange} 
                      required={Boolean(clientFormFields?.status?.required)}
                      style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                    >
                      {clientStatuses.map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(!clientFormFields?.priority || clientFormFields.priority.enabled !== false) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {clientFormFields?.priority?.label || 'Lead Priority Type'} {Boolean(clientFormFields?.priority?.required) && <span style={{color: 'red'}}>*</span>}
                    </label>
                    <select 
                      name="priority" 
                      value={formData.priority} 
                      onChange={handleChange} 
                      required={Boolean(clientFormFields?.priority?.required)}
                      style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                    >
                      <option value="">Select Priority</option>
                      {priorities.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                )}
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
                {(!clientFormFields?.business_type || clientFormFields.business_type.enabled !== false) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {clientFormFields?.business_type?.label || 'Business Type'} {Boolean(clientFormFields?.business_type?.required) && <span style={{color: 'red'}}>*</span>}
                    </label>
                    <select 
                      name="business_type" 
                      value={formData.business_type} 
                      onChange={handleChange} 
                      required={Boolean(clientFormFields?.business_type?.required)}
                      style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                    >
                      <option value="">Select Business Type</option>
                      {businessTypes.map(bt => (
                        <option key={bt} value={bt}>{bt}</option>
                      ))}
                      {formData.business_type && !businessTypes.includes(formData.business_type) && (
                        <option value={formData.business_type}>{formData.business_type}</option>
                      )}
                    </select>
                  </div>
                )}
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
                {(!clientFormFields?.state_name || clientFormFields.state_name.enabled !== false) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {clientFormFields?.state_name?.label || 'State Name'} {Boolean(clientFormFields?.state_name?.required) && <span style={{color: 'red'}}>*</span>}
                    </label>
                    <select
                      name="state_name"
                      value={formData.state_name || ''}
                      required={Boolean(clientFormFields?.state_name?.required)}
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
                )}

                {/* District Dropdown */}
                {(!clientFormFields?.district_name || clientFormFields.district_name.enabled !== false) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {clientFormFields?.district_name?.label || 'District Name'} {Boolean(clientFormFields?.district_name?.required) && <span style={{color: 'red'}}>*</span>}
                    </label>
                    <select
                      name="district_name"
                      value={formData.district_name || ''}
                      onChange={handleChange}
                      disabled={!formData.state_name}
                      required={Boolean(clientFormFields?.district_name?.required)}
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
                )}

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
                
                {(!clientFormFields?.investment || clientFormFields.investment.enabled !== false) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {clientFormFields?.investment?.label || 'Investment Size'} {Boolean(clientFormFields?.investment?.required) && <span style={{color: 'red'}}>*</span>}
                    </label>
                    <select 
                      name="investment" 
                      value={formData.investment} 
                      onChange={handleChange} 
                      required={Boolean(clientFormFields?.investment?.required)}
                      style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                    >
                      <option value="">Select Investment</option>
                      <option value="Below 1 Lakh">Below 1 Lakh</option>
                      <option value="1 Lakh - 5 Lakh">1 Lakh - 5 Lakh</option>
                      <option value="5 Lakh - 10 Lakh">5 Lakh - 10 Lakh</option>
                      <option value="10 Lakh - 25 Lakh">10 Lakh - 25 Lakh</option>
                      <option value="25 Lakh - 50 Lakh">25 Lakh - 50 Lakh</option>
                      <option value="Above 50 Lakh">Above 50 Lakh</option>
                    </select>
                  </div>
                )}
                
                {(!clientFormFields?.buying_timeline || clientFormFields.buying_timeline.enabled !== false) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {clientFormFields?.buying_timeline?.label || 'Buying Timeline'} {Boolean(clientFormFields?.buying_timeline?.required) && <span style={{color: 'red'}}>*</span>}
                    </label>
                    <select 
                      name="buying_timeline" 
                      value={formData.buying_timeline} 
                      onChange={handleChange} 
                      required={Boolean(clientFormFields?.buying_timeline?.required)}
                      style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                    >
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
                )}
              </div>
            )}
          </div>

          {/* Action Buttons: Save Draft vs Final Submit */}
          <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
            {!isEditMode && (
              <button 
                type="button" 
                onClick={handleSaveDraft}
                disabled={isSavingDraft || isSubmitting}
                style={{ 
                  padding: '0.75rem 1.5rem', 
                  backgroundColor: 'var(--bg-primary)', 
                  color: 'var(--text-primary)', 
                  border: '1px solid var(--border-light)', 
                  borderRadius: '8px', 
                  fontSize: '0.95rem', 
                  fontWeight: 600, 
                  cursor: isSavingDraft ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                <Save size={18} />
                {isSavingDraft ? 'Saving Draft...' : 'Save as Draft (Adhoora Form)'}
              </button>
            )}

            <button 
              type="submit" 
              disabled={isSubmitting || isSavingDraft}
              style={{ 
                padding: '0.75rem 2rem', 
                backgroundColor: 'var(--accent-color)', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                fontSize: '1rem', 
                fontWeight: 600, 
                cursor: (isSubmitting || isSavingDraft) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <CheckCircle2 size={20} />
              {isSubmitting ? (isEditMode ? 'Updating...' : 'Registering & Syncing...') : (isEditMode ? 'Update Client' : 'Final Submit & Register Client')}
            </button>
          </div>

        </form>
        </>
        )}
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
                  {/* Default Data Status Selector (for files without Data Status column) */}
                  <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-primary)', border: '1.5px solid var(--border-light)', borderRadius: '10px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        🎯 Default Data Status <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>(When &quot;Data Status&quot; column is not in CSV)</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                        Decides where records will go: <strong>Saved Drafts</strong> (New Lead Registration queue) or <strong>Report</strong> (Registered)
                      </div>
                    </div>
                    <select
                      value={defaultDataStatus}
                      onChange={(e) => setDefaultDataStatus(e.target.value)}
                      style={{ padding: '0.5rem 0.85rem', borderRadius: '6px', border: '1.5px solid var(--accent-color)', fontWeight: 600, fontSize: '0.85rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer' }}
                    >
                      <option value="Verified Data">✅ Verified Data (Lead Registered Report)</option>
                      <option value="Partial Confirmed">⏳ Partial Confirmed (Lead Registered Report)</option>
                      <option value="Saved Drafts">📁 Saved Drafts (New Lead Registration Queue)</option>
                    </select>
                  </div>

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
                  {/* Summary Stats Cards: Clean 4-Card System (Non-Repeating Interactive Filters) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    {/* Card 1: Total Rows in File */}
                    <div 
                      onClick={() => { setPreviewFilterTab('all'); setPreviewPage(1); }}
                      style={{ 
                        padding: '0.75rem 1rem', 
                        borderRadius: '10px', 
                        background: previewFilterTab === 'all' ? 'var(--nav-active-bg, #eff6ff)' : 'var(--bg-primary)', 
                        border: `2px solid ${previewFilterTab === 'all' ? 'var(--accent-color, #2563eb)' : 'var(--border-light)'}`, 
                        boxShadow: previewFilterTab === 'all' ? '0 2px 8px rgba(37,99,235,0.18)' : 'none',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{allMappedData.length}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>📋 Total Rows in File</div>
                    </div>

                    {/* Card 2: 100% Clean Leads */}
                    <div 
                      onClick={() => { setPreviewFilterTab('clean'); setPreviewPage(1); }}
                      style={{ 
                        padding: '0.75rem 1rem', 
                        borderRadius: '10px', 
                        background: previewFilterTab === 'clean' ? '#d1fae5' : '#ecfdf5', 
                        border: `2px solid ${previewFilterTab === 'clean' ? '#059669' : '#a7f3d0'}`, 
                        boxShadow: previewFilterTab === 'clean' ? '0 2px 8px rgba(5,150,105,0.18)' : 'none',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#047857' }}>{cleanImportData.length}</div>
                      <div style={{ fontSize: '0.78rem', color: '#065f46', fontWeight: 600 }}>🟢 100% Clean Leads</div>
                    </div>

                    {/* Card 3: Potential Matches */}
                    <div 
                      onClick={() => { setPreviewFilterTab('potentialMatches'); setPreviewPage(1); }}
                      style={{ 
                        padding: '0.75rem 1rem', 
                        borderRadius: '10px', 
                        background: previewFilterTab === 'potentialMatches' ? '#ffedd5' : '#fff7ed', 
                        border: `2px solid ${previewFilterTab === 'potentialMatches' ? '#ea580c' : '#fed7aa'}`, 
                        boxShadow: previewFilterTab === 'potentialMatches' ? '0 2px 8px rgba(234,88,12,0.18)' : 'none',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#c2410c' }}>{potentialMatchesImportData.length}</div>
                      <div style={{ fontSize: '0.78rem', color: '#9a3412', fontWeight: 600 }}>🔍 Potential Matches (50–99%)</div>
                    </div>

                    {/* Card 4: Blocked Duplicates */}
                    <div 
                      onClick={() => { setPreviewFilterTab('blocked'); setPreviewPage(1); }}
                      style={{ 
                        padding: '0.75rem 1rem', 
                        borderRadius: '10px', 
                        background: previewFilterTab === 'blocked' ? '#fee2e2' : '#fff1f2', 
                        border: `2px solid ${previewFilterTab === 'blocked' ? '#e11d48' : '#fecdd3'}`, 
                        boxShadow: previewFilterTab === 'blocked' ? '0 2px 8px rgba(225,29,72,0.18)' : 'none',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#be123c' }}>{blockedDuplicatesImportData.length}</div>
                      <div style={{ fontSize: '0.78rem', color: '#9f1239', fontWeight: 600 }}>🚨 Blocked Duplicates</div>
                    </div>
                  </div>

                  {/* Informational Alert Banners (Clean, Non-Repeating) */}
                  {blockedDuplicatesImportData.length > 0 && (
                    <div style={{ padding: '0.6rem 1rem', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '8px', color: '#9f1239', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <AlertTriangle size={16} color="#e11d48" style={{ flexShrink: 0 }} />
                      <span><strong>Notice:</strong> {blockedDuplicatesImportData.length} client(s) are 100% duplicate or already exist in Lead Registered Report and are safely excluded from import.</span>
                    </div>
                  )}

                  {potentialMatchesImportData.length > 0 && (
                    <div style={{ padding: '0.6rem 1rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', color: '#9a3412', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Search size={16} color="#ea580c" style={{ flexShrink: 0 }} />
                      <span><strong>Similarity Notice:</strong> {potentialMatchesImportData.length} row(s) match 50%–99% with existing leads. Click the <strong>Potential Matches</strong> card above to review them before importing.</span>
                    </div>
                  )}

                  {/* Compact Toolbar: Live Search & Rows Per Page */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
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
                          width: '240px'
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
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                        <option value={0}>All Rows</option>
                      </select>
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
                      <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.8rem', textAlign: 'left' }}>
                        <thead style={{ background: 'var(--bg-primary)' }}>
                          <tr>
                            <th 
                              className="bulk-preview-sticky-col-1"
                              style={{ 
                                padding: '0.6rem 0.3rem', 
                                fontWeight: 700, 
                                textAlign: 'center', 
                                borderBottom: '2px solid var(--border-light)', 
                                borderRight: '1px solid var(--border-light)' 
                              }}>#</th>
                            <th 
                              className="bulk-preview-sticky-col-2"
                              style={{ 
                                padding: '0.6rem 0.5rem', 
                                fontWeight: 700, 
                                textAlign: 'center', 
                                borderBottom: '2px solid var(--border-light)', 
                                borderRight: '2px solid var(--border-light)' 
                              }}>Status</th>
                            {mappedDisplayFields.map(field => (
                              <th key={field.key} style={{ 
                                position: 'sticky',
                                top: 0,
                                zIndex: 10,
                                padding: '0.6rem 0.75rem', 
                                fontWeight: 700, 
                                whiteSpace: 'nowrap', 
                                borderBottom: '2px solid var(--border-light)', 
                                borderRight: '1px solid var(--border-light)',
                                background: 'var(--bg-primary)'
                              }}>
                                {field.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedPreviewRows.map((row, idx) => {
                            const isDup = row._isDuplicate;
                            const rowBg = isDup ? '#fff1f2' : (row._matchScore >= 75 ? '#fff7ed' : (idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary)'));
                            return (
                              <tr 
                                key={idx} 
                                style={{ 
                                  backgroundColor: rowBg
                                }}
                              >
                                <td 
                                  className="bulk-preview-sticky-col-1"
                                  style={{ 
                                    padding: '0.5rem 0.3rem', 
                                    textAlign: 'center', 
                                    color: 'var(--text-secondary)', 
                                    fontSize: '0.75rem', 
                                    fontFamily: 'monospace', 
                                    backgroundColor: rowBg, 
                                    borderBottom: '1px solid var(--border-light)', 
                                    borderRight: '1px solid var(--border-light)' 
                                  }}>
                                  {row._rowNum || idx + 1}
                                </td>
                                <td 
                                  className="bulk-preview-sticky-col-2"
                                  style={{ 
                                    padding: '0.5rem 0.5rem', 
                                    textAlign: 'center', 
                                    backgroundColor: rowBg, 
                                    borderBottom: '1px solid var(--border-light)', 
                                    borderRight: '2px solid var(--border-light)' 
                                  }}>
                                  {row._isAlreadyInReport ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                                      <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#be123c', border: '1px solid #fecdd3', whiteSpace: 'nowrap' }}>
                                        🚨 100% In Report
                                      </span>
                                      {row._dupReason && (
                                        <span style={{ fontSize: '0.65rem', color: '#9f1239', fontWeight: 600, maxWidth: '240px', lineHeight: 1.2 }}>
                                          {row._dupReason}
                                        </span>
                                      )}
                                    </div>
                                  ) : isDup ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', whiteSpace: 'nowrap' }}>
                                        ⚠️ 100% Duplicate
                                      </span>
                                      {row._dupReason && (
                                        <span style={{ fontSize: '0.65rem', color: '#b45309', fontWeight: 500, maxWidth: '240px', lineHeight: 1.2 }}>
                                          {row._dupReason}
                                        </span>
                                      )}
                                    </div>
                                  ) : (row._matchScore && row._matchScore >= 50) ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                                      <span style={{ 
                                        fontSize: '0.7rem', 
                                        fontWeight: 800, 
                                        padding: '0.15rem 0.5rem', 
                                        borderRadius: '4px', 
                                        backgroundColor: row._matchScore >= 75 ? '#ffedd5' : '#fef9c3', 
                                        color: row._matchScore >= 75 ? '#c2410c' : '#854d0e', 
                                        border: `1px solid ${row._matchScore >= 75 ? '#fed7aa' : '#fef08a'}`,
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {row._matchScore >= 75 ? '🟠' : '🟡'} {row._matchScore}% Match
                                      </span>
                                      {row._matchReason && (
                                        <span style={{ fontSize: '0.65rem', color: row._matchScore >= 75 ? '#9a3412' : '#713f12', fontWeight: 500, maxWidth: '240px', lineHeight: 1.2 }}>
                                          {row._matchReason}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0', whiteSpace: 'nowrap' }}>
                                        🟢 0% Clean
                                      </span>
                                      <span style={{ fontSize: '0.65rem', fontWeight: 600, color: row.data_status === 'Saved Drafts' ? 'var(--text-secondary)' : '#059669' }}>
                                        {row.data_status || 'Saved Drafts'}
                                      </span>
                                    </div>
                                  )}
                                </td>
                                {mappedDisplayFields.map(field => {
                                  let cellVal = row[field.key];
                                  if (field.key === 'assigned_to' && cellVal) {
                                    const member = teamMembers.find(m => (m.user_id === cellVal || m.id === cellVal));
                                    if (member) cellVal = member.emp_name || member.email;
                                  }
                                  return (
                                    <td key={field.key} style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)', borderRight: '1px solid var(--border-light)', whiteSpace: 'nowrap', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {cellVal ? String(cellVal) : <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>-</span>}
                                    </td>
                                  );
                                })}
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
