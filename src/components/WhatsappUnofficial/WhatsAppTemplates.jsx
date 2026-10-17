'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  FileText, Image as ImageIcon, Video, File, BarChart2, Calendar, 
  Plus, Search, Send, Copy, Trash2, Check, RefreshCw, Sparkles, 
  Eye, CheckCircle2, AlertCircle, Phone, X, HelpCircle, Layers,
  ChevronRight, ExternalLink, ArrowRight, Download, Play, CheckCheck,
  User, Briefcase, MapPin, Tag, DollarSign, Clock, Sparkle
} from 'lucide-react';
import { 
  getWhatsAppTemplates, 
  saveWhatsAppTemplate, 
  deleteWhatsAppTemplate, 
  sendTestWhatsAppTemplate 
} from '@/app/actions/tenantMessageTemplates';
import { getInstances } from '@/app/actions/whatsappUnofficialDb';

function compileTemplateVariables(rawText, variables = {}) {
  let text = String(rawText || '');
  const istDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }).format(new Date());
  const istTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' }).format(new Date());

  const defaults = {
    // 👤 Contact Person 1 (Primary)
    name: 'Ramesh Patel',
    phone: '+91 98765 43210',
    cp1_name: 'Ramesh Patel',
    cp1_mobile_1: '+91 98765 43210',
    cp1_mobile_2: '+91 98765 43211',
    cp1_alt_1: '+91 98765 43212',
    cp1_alt_2: '',
    email: 'ramesh.patel@example.com',
    cp1_email_1: 'ramesh.patel@example.com',
    cp1_email_2: '',

    // 👥 Contact Person 2
    cp2_name: 'Suresh Patel',
    cp2_mobile_1: '+91 98765 43213',
    cp2_mobile_2: '',
    cp2_alt_1: '',
    cp2_alt_2: '',
    cp2_email_1: 'suresh@example.com',
    cp2_email_2: '',

    // 👥 Contact Person 3
    cp3_name: 'Amit Kumar',
    cp3_mobile_1: '+91 98765 43214',
    cp3_mobile_2: '',
    cp3_alt_1: '',
    cp3_alt_2: '',
    cp3_email_1: '',
    cp3_email_2: '',

    // 🏢 Business Details
    company: 'Patel Agro Traders',
    business_type: 'Dealer',
    business_gst: '07AAAAA1111A1Z1',
    business_contact_1: '+91 98765 00001',
    business_contact_2: '+91 98765 00002',
    business_alt_1: '',
    business_alt_2: '',
    business_email_1: 'contact@patelagro.com',
    business_email_2: 'sales@patelagro.com',
    business_alt_email_1: '',
    business_alt_email_2: '',

    // 📍 Location
    state_name: 'Punjab',
    district_name: 'Ludhiana',
    city_name: 'Ludhiana',
    tehsil_name: 'Ludhiana West',
    block_name: 'Ludhiana',
    pin_code: '141001',
    address: 'GT Road, Near Grain Market, Ludhiana, Punjab',

    // 🎯 Lead Status & Source
    lead_ref_id: '202610170000042',
    lead_date: istDate,
    source: 'IndiaMART',
    source_name: 'Direct Campaign',
    status: '01 - New Stage > New Lead',
    priority: 'LP01: Immediate',
    assigned_to: 'Nitya Verma',
    entry_by: 'Admin Office',
    follow_up_date: istDate,

    // 💰 Commercial & Deal
    requirement: 'Heavy-Duty Rotavator 7 Feet',
    investment: '₹1 Lakh - ₹5 Lakh',
    buying_timeline: 'Immediate (Within 7 Days)',
    deal_value: '₹1,45,000',
    amount: '₹1,45,000',
    quote_no: 'SA-QT-2026',
    invoice_no: 'SA-INV-1092',

    // ⚡ System & Brand
    our_company: 'Swan Agro',
    date: istDate,
    time: istTime,
    link: 'https://newswangroup.com'
  };

  const merged = { ...defaults, ...variables };

  Object.entries(merged).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      const regex = new RegExp(`\\{\\{${k}\\}\\}`, 'gi');
      text = text.replace(regex, String(v));
    }
  });

  return text;
}

const TYPE_CONFIG = {
  TEXT: { label: 'Text Message', icon: FileText, color: '#0284c7', bg: '#e0f2fe' },
  IMAGE: { label: 'Image Attachment', icon: ImageIcon, color: '#16a34a', bg: '#dcfce7' },
  VIDEO: { label: 'Video Demo', icon: Video, color: '#9333ea', bg: '#f3e8ff' },
  DOCUMENT: { label: 'Document / PDF', icon: File, color: '#ea580c', bg: '#ffedd5' },
  POLL: { label: 'Interactive Poll', icon: BarChart2, color: '#2563eb', bg: '#dbeafe' },
  EVENT: { label: 'Event / Invitation', icon: Calendar, color: '#d97706', bg: '#fef3c7' }
};

export const VARIABLE_CATEGORIES = [
  {
    id: 'cp1',
    label: '👤 Primary Contact',
    tags: [
      { tag: '{{name}}', label: 'Primary Contact Name' },
      { tag: '{{phone}}', label: 'Primary Mobile 1' },
      { tag: '{{email}}', label: 'Primary Email' },
      { tag: '{{cp1_mobile_2}}', label: 'CP1 Mobile 2' },
      { tag: '{{cp1_alt_1}}', label: 'CP1 Alt Phone 1' },
      { tag: '{{cp1_alt_2}}', label: 'CP1 Alt Phone 2' },
      { tag: '{{cp1_email_2}}', label: 'CP1 Email 2' }
    ]
  },
  {
    id: 'cp2_3',
    label: '👥 CP2 & CP3 Contacts',
    tags: [
      { tag: '{{cp2_name}}', label: 'CP2 Name' },
      { tag: '{{cp2_mobile_1}}', label: 'CP2 Mobile 1' },
      { tag: '{{cp2_mobile_2}}', label: 'CP2 Mobile 2' },
      { tag: '{{cp2_alt_1}}', label: 'CP2 Alt Phone 1' },
      { tag: '{{cp2_alt_2}}', label: 'CP2 Alt Phone 2' },
      { tag: '{{cp2_email_1}}', label: 'CP2 Email 1' },
      { tag: '{{cp2_email_2}}', label: 'CP2 Email 2' },
      { tag: '{{cp3_name}}', label: 'CP3 Name' },
      { tag: '{{cp3_mobile_1}}', label: 'CP3 Mobile 1' },
      { tag: '{{cp3_mobile_2}}', label: 'CP3 Mobile 2' },
      { tag: '{{cp3_alt_1}}', label: 'CP3 Alt Phone 1' },
      { tag: '{{cp3_alt_2}}', label: 'CP3 Alt Phone 2' },
      { tag: '{{cp3_email_1}}', label: 'CP3 Email 1' },
      { tag: '{{cp3_email_2}}', label: 'CP3 Email 2' }
    ]
  },
  {
    id: 'business',
    label: '🏢 Business & Firm',
    tags: [
      { tag: '{{company}}', label: 'Business / Firm Name' },
      { tag: '{{business_type}}', label: 'Business Type' },
      { tag: '{{business_gst}}', label: 'Business GST No' },
      { tag: '{{business_contact_1}}', label: 'Business Phone 1' },
      { tag: '{{business_contact_2}}', label: 'Business Phone 2' },
      { tag: '{{business_alt_1}}', label: 'Business Alt Phone 1' },
      { tag: '{{business_alt_2}}', label: 'Business Alt Phone 2' },
      { tag: '{{business_email_1}}', label: 'Business Email 1' },
      { tag: '{{business_email_2}}', label: 'Business Email 2' },
      { tag: '{{business_alt_email_1}}', label: 'Business Alt Email 1' },
      { tag: '{{business_alt_email_2}}', label: 'Business Alt Email 2' }
    ]
  },
  {
    id: 'location',
    label: '📍 Location Details',
    tags: [
      { tag: '{{state_name}}', label: 'State Name' },
      { tag: '{{district_name}}', label: 'District Name' },
      { tag: '{{city_name}}', label: 'City Name' },
      { tag: '{{tehsil_name}}', label: 'Tehsil Name' },
      { tag: '{{block_name}}', label: 'Block Name' },
      { tag: '{{pin_code}}', label: 'PIN Code' },
      { tag: '{{address}}', label: 'Full Street Address' }
    ]
  },
  {
    id: 'lifecycle',
    label: '🎯 Lead Status & Source',
    tags: [
      { tag: '{{lead_ref_id}}', label: 'Lead Ref ID' },
      { tag: '{{lead_date}}', label: 'Lead Date' },
      { tag: '{{source}}', label: 'Lead Source' },
      { tag: '{{source_name}}', label: 'Source Campaign / Ref' },
      { tag: '{{status}}', label: 'Lead Status (Stage)' },
      { tag: '{{priority}}', label: 'Lead Priority Type' },
      { tag: '{{assigned_to}}', label: 'Assigned Agent' },
      { tag: '{{entry_by}}', label: 'Entry By (User)' },
      { tag: '{{follow_up_date}}', label: 'Follow Up Date' }
    ]
  },
  {
    id: 'commercial',
    label: '💰 Requirement & Deal',
    tags: [
      { tag: '{{requirement}}', label: 'Requirement / Machine' },
      { tag: '{{investment}}', label: 'Investment Budget' },
      { tag: '{{buying_timeline}}', label: 'Buying Timeline' },
      { tag: '{{deal_value}}', label: 'Deal Value (₹)' },
      { tag: '{{amount}}', label: 'Quote / Invoice Amount (₹)' },
      { tag: '{{quote_no}}', label: 'Quotation Ref No' },
      { tag: '{{invoice_no}}', label: 'Invoice Ref No' }
    ]
  },
  {
    id: 'system',
    label: '⚡ Brand & System (IST)',
    tags: [
      { tag: '{{our_company}}', label: 'Our Brand / Company' },
      { tag: '{{date}}', label: 'Current Date (IST)' },
      { tag: '{{time}}', label: 'Current Time (IST)' },
      { tag: '{{link}}', label: 'Catalog / Web URL' }
    ]
  }
];

export const ALL_VARIABLE_TAGS = VARIABLE_CATEGORIES.flatMap(cat => cat.tags);

export default function WhatsAppTemplates({ userId, isAdmin }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [activeFilterType, setActiveFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Editing / Creating State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Dynamic Variable Toolbar States
  const [selectedVariableCategory, setSelectedVariableCategory] = useState('all');
  const [variableSearch, setVariableSearch] = useState('');
  const textareaRef = useRef(null);

  // Test Dispatch State
  const [testNumber, setTestNumber] = useState('916283362279');
  const [instances, setInstances] = useState([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    loadData();
    loadConnectedInstances();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const res = await getWhatsAppTemplates();
    if (res.success && res.templates) {
      setTemplates(res.templates);
      if (res.templates.length > 0 && !selectedTemplate) {
        setSelectedTemplate(res.templates[0]);
      }
    }
    setLoading(false);
  };

  const loadConnectedInstances = async () => {
    const res = await getInstances();
    if (res.success && res.data) {
      setInstances(res.data);
      const connected = res.data.find(i => i.status === 'CONNECTED');
      if (connected) {
        setSelectedInstanceId(connected.instance_key || connected.id);
      } else if (res.data[0]) {
        setSelectedInstanceId(res.data[0].instance_key || res.data[0].id);
      }
    }
  };

  const filteredVariableTags = useMemo(() => {
    let list = selectedVariableCategory === 'all'
      ? ALL_VARIABLE_TAGS
      : (VARIABLE_CATEGORIES.find(c => c.id === selectedVariableCategory)?.tags || ALL_VARIABLE_TAGS);
    
    if (variableSearch.trim()) {
      const q = variableSearch.toLowerCase();
      list = ALL_VARIABLE_TAGS.filter(v => 
        v.tag.toLowerCase().includes(q) || v.label.toLowerCase().includes(q)
      );
    }
    return list;
  }, [selectedVariableCategory, variableSearch]);

  const filteredTemplates = templates.filter(t => {
    const matchesType = activeFilterType === 'ALL' || t.type === activeFilterType;
    if (!matchesType) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.content && t.content.toLowerCase().includes(q)) ||
      (t.category && t.category.toLowerCase().includes(q))
    );
  });

  const handleStartCreate = () => {
    const newTpl = {
      id: '',
      title: 'New WhatsApp Template',
      category: 'Marketing',
      type: 'TEXT',
      content: 'Hello {{name}} Ji,\n\nGreetings from {{company}}!',
      media_url: '',
      filename: 'document.pdf',
      poll_question: 'Which product are you interested in?',
      poll_options: ['Rotavator', 'Laser Land Leveller', 'Straw Reaper'],
      poll_multiple_choice: false,
      event_title: 'Swan Agro Special Machinery Event',
      event_description: 'Live field demonstrations and expert consultation.',
      event_venue: 'Main Grounds, Ludhiana, Punjab',
      event_start_time: '2026-10-25 10:00 AM IST',
      event_rsvp_url: 'https://newswangroup.com'
    };
    setEditForm(newTpl);
    setSelectedTemplate(newTpl);
    setIsEditing(true);
    setTestResult(null);
  };

  const handleStartEdit = (tpl) => {
    setEditForm({
      id: tpl?.id || '',
      supabase_id: tpl?.supabase_id || undefined,
      title: tpl?.title || '',
      category: tpl?.category || 'General',
      type: tpl?.type || 'TEXT',
      content: tpl?.content || '',
      media_url: tpl?.media_url || '',
      filename: tpl?.filename || 'document.pdf',
      poll_question: tpl?.poll_question || '',
      poll_options: Array.isArray(tpl?.poll_options) ? [...tpl.poll_options] : ['Option 1', 'Option 2'],
      poll_multiple_choice: !!tpl?.poll_multiple_choice,
      event_title: tpl?.event_title || '',
      event_description: tpl?.event_description || '',
      event_venue: tpl?.event_venue || '',
      event_start_time: tpl?.event_start_time || '',
      event_rsvp_url: tpl?.event_rsvp_url || ''
    });
    setSelectedTemplate(tpl);
    setIsEditing(true);
    setTestResult(null);
  };

  const handleInsertTag = (tag) => {
    if (!editForm) return;
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart ?? (editForm.content || '').length;
      const end = el.selectionEnd ?? (editForm.content || '').length;
      const current = editForm.content || '';
      const before = current.substring(0, start);
      const after = current.substring(end);
      const insert = (before.endsWith(' ') || before.endsWith('\n') || before === '' ? '' : ' ') + tag + ' ';
      const newText = before + insert + after;
      setEditForm({ ...editForm, content: newText });
      setTimeout(() => {
        el.focus();
        const nextPos = start + insert.length;
        el.setSelectionRange(nextPos, nextPos);
      }, 0);
    } else {
      const current = editForm.content || '';
      setEditForm({
        ...editForm,
        content: current + (current.endsWith(' ') || current.endsWith('\n') ? '' : ' ') + tag + ' '
      });
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!editForm || !editForm.title?.trim()) {
      alert('Please enter a template title.');
      return;
    }
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await saveWhatsAppTemplate({ template: editForm });
      setSaving(false);

      if (res && res.success) {
        setSaveSuccess(true);
        await loadData();
        if (res.template) {
          setSelectedTemplate(res.template);
          setEditForm(res.template);
        }
        setIsEditing(false);
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        alert(res?.error || 'Failed to save template.');
      }
    } catch (err) {
      setSaving(false);
      console.error('handleSave error:', err);
      alert('Error saving template: ' + (err.message || 'Unknown network error'));
    }
  };

  const handleDelete = async (tplId) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    const res = await deleteWhatsAppTemplate({ templateId: tplId });
    if (res.success) {
      await loadData();
      if (selectedTemplate?.id === tplId) {
        setSelectedTemplate(templates.find(t => t.id !== tplId) || null);
      }
    } else {
      alert(res.error || 'Failed to delete template.');
    }
  };

  const handleCopyText = (tpl) => {
    const text = compileTemplateVariables(tpl.content || '');
    navigator.clipboard.writeText(text);
    setCopiedId(tpl.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSendTest = async () => {
    if (!testNumber.trim()) {
      alert('Please enter a recipient phone number.');
      return;
    }
    const tplToDispatch = isEditing ? editForm : selectedTemplate;
    if (!tplToDispatch) return;

    setSendingTest(true);
    setTestResult(null);

    const res = await sendTestWhatsAppTemplate({
      template: tplToDispatch,
      toNumber: testNumber,
      instanceId: selectedInstanceId,
      sampleData: {
        name: 'Sujit Kumar',
        company: 'Swan Agro',
        phone: testNumber,
        quote_no: 'SA-QT-2026',
        amount: '45,000'
      }
    });

    setSendingTest(false);
    setTestResult(res);
  };

  // Helper to add / remove poll option
  const handleAddPollOption = () => {
    if (!editForm) return;
    const cur = Array.isArray(editForm.poll_options) ? [...editForm.poll_options] : [];
    if (cur.length >= 10) {
      alert('Maximum 10 options allowed in a WhatsApp poll.');
      return;
    }
    cur.push(`Option ${cur.length + 1}`);
    setEditForm({ ...editForm, poll_options: cur });
  };

  const handleRemovePollOption = (idx) => {
    if (!editForm) return;
    const cur = Array.isArray(editForm.poll_options) ? [...editForm.poll_options] : [];
    if (cur.length <= 2) {
      alert('A WhatsApp poll requires at least 2 options.');
      return;
    }
    cur.splice(idx, 1);
    setEditForm({ ...editForm, poll_options: cur });
  };

  const handlePollOptionChange = (idx, val) => {
    if (!editForm) return;
    const cur = Array.isArray(editForm.poll_options) ? [...editForm.poll_options] : [];
    cur[idx] = val;
    setEditForm({ ...editForm, poll_options: cur });
  };

  const activeTemplate = isEditing ? editForm : selectedTemplate;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f8fafc' }}>
      
      {/* Top Action Bar */}
      <div style={{ 
        padding: '0.85rem 1.25rem', 
        background: '#fff', 
        borderBottom: '1px solid var(--border-light)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={20} color="#0284c7" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              WhatsApp Rich Message Templates
            </h3>
            <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Create &amp; dispatch rich media templates: <strong>Text, Image, Video, Docs (PDF), Polls &amp; Event Invitations</strong>.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={loadData}
            title="Refresh templates list"
            style={{ 
              background: '#f1f5f9', 
              border: '1px solid #cbd5e1', 
              borderRadius: '6px', 
              padding: '0.45rem 0.65rem', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <RefreshCw size={15} color="#475569" className={loading ? 'animate-spin' : ''} />
          </button>
          
          <button
            type="button"
            onClick={handleStartCreate}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: '#00a884',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.45rem 0.95rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <Plus size={16} /> Create Template
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* Left Column: Template Cards List & Filters */}
        <div style={{ 
          width: '360px', 
          borderRight: '1px solid var(--border-light)', 
          background: '#fff', 
          display: 'flex', 
          flexDirection: 'column',
          flexShrink: 0
        }}>
          {/* Type Filter Pills */}
          <div style={{ padding: '0.75rem 0.85rem', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflowX: 'auto', paddingBottom: '3px' }}>
              <button
                type="button"
                onClick={() => setActiveFilterType('ALL')}
                style={{
                  padding: '0.3rem 0.6rem',
                  borderRadius: '14px',
                  border: activeFilterType === 'ALL' ? '1px solid #00a884' : '1px solid #e2e8f0',
                  background: activeFilterType === 'ALL' ? '#f0fdf4' : '#fff',
                  color: activeFilterType === 'ALL' ? '#15803d' : '#64748b',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                All ({templates.length})
              </button>
              {Object.entries(TYPE_CONFIG).map(([tKey, tConf]) => {
                const count = templates.filter(t => t.type === tKey).length;
                const isActive = activeFilterType === tKey;
                return (
                  <button
                    key={tKey}
                    type="button"
                    onClick={() => setActiveFilterType(tKey)}
                    style={{
                      padding: '0.3rem 0.6rem',
                      borderRadius: '14px',
                      border: isActive ? `1px solid ${tConf.color}` : '1px solid #e2e8f0',
                      background: isActive ? tConf.bg : '#fff',
                      color: isActive ? tConf.color : '#64748b',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    <tConf.icon size={12} /> {tConf.label.split(' ')[0]} ({count})
                  </button>
                );
              })}
            </div>

            {/* Search Box */}
            <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '0.35rem 0.65rem' }}>
              <Search size={14} color="#94a3b8" />
              <input 
                type="text" 
                placeholder="Search templates by title or content..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', background: 'transparent', marginLeft: '0.45rem', width: '100%', fontSize: '0.8rem' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <X size={13} color="#94a3b8" />
                </button>
              )}
            </div>
          </div>

          {/* List of Templates */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
            {filteredTemplates.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                No templates found matching your filter.
              </div>
            ) : (
              filteredTemplates.map(tpl => {
                const isSelected = selectedTemplate?.id === tpl.id;
                const tConf = TYPE_CONFIG[tpl.type || 'TEXT'] || TYPE_CONFIG.TEXT;
                const TIcon = tConf.icon;

                return (
                  <div
                    key={tpl.id}
                    onClick={() => {
                      setSelectedTemplate(tpl);
                      if (isEditing) setEditForm({ ...tpl });
                      setTestResult(null);
                    }}
                    style={{
                      padding: '0.75rem 0.85rem',
                      borderRadius: '8px',
                      border: isSelected ? '1px solid #00a884' : '1px solid #f1f5f9',
                      background: isSelected ? '#f0fdf4' : '#fff',
                      marginBottom: '0.45rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.4rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#1e293b', lineHeight: 1.3 }}>
                        {tpl.title}
                      </span>
                      <span style={{ 
                        fontSize: '0.68rem', 
                        fontWeight: 700, 
                        color: tConf.color, 
                        background: tConf.bg, 
                        padding: '2px 6px', 
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.2rem',
                        flexShrink: 0
                      }}>
                        <TIcon size={11} /> {tpl.type || 'TEXT'}
                      </span>
                    </div>

                    <p style={{ 
                      margin: '0.2rem 0 0.45rem 0', 
                      fontSize: '0.76rem', 
                      color: '#64748b', 
                      display: '-webkit-box', 
                      WebkitLineClamp: 2, 
                      WebkitBoxOrient: 'vertical', 
                      overflow: 'hidden',
                      lineHeight: 1.35
                    }}>
                      {tpl.type === 'POLL' ? `Poll: ${tpl.poll_question}` : tpl.type === 'EVENT' ? `Event: ${tpl.event_title}` : tpl.content}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8' }}>
                      <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', color: '#475569', fontWeight: 600 }}>
                        {tpl.category || 'General'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleCopyText(tpl); }}
                          title="Copy message content"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: copiedId === tpl.id ? '#16a34a' : '#64748b' }}
                        >
                          {copiedId === tpl.id ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id); }}
                          title="Delete template"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#ef4444' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Center / Right: Template Editor & Live Phone Simulator */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          
          {/* Middle: Template Edit / View Form */}
          <div style={{ 
            flex: '1 1 55%', 
            padding: '1.25rem 1.5rem', 
            overflowY: 'auto', 
            borderRight: '1px solid var(--border-light)',
            background: '#fff'
          }}>
            {activeTemplate ? (
              <div>
                {/* Header Controls */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                      {isEditing ? (editForm.id ? 'Edit Template' : 'Create New Template') : activeTemplate.title}
                    </h4>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      Category: <strong>{activeTemplate.category || 'Marketing'}</strong> &bull; Type: <strong>{activeTemplate.type}</strong>
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setIsEditing(false)}
                          style={{ padding: '0.45rem 0.85rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={saving}
                          style={{ 
                            padding: '0.45rem 1rem', 
                            borderRadius: '6px', 
                            border: 'none', 
                            background: '#00a884', 
                            color: '#fff', 
                            fontSize: '0.8rem', 
                            fontWeight: 700, 
                            cursor: saving ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                          Save Template
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(activeTemplate)}
                        style={{ padding: '0.45rem 1rem', borderRadius: '6px', border: '1px solid #00a884', background: '#f0fdf4', color: '#15803d', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Edit This Template
                      </button>
                    )}
                  </div>
                </div>

                {saveSuccess && (
                  <div style={{ marginBottom: '1rem', padding: '0.65rem 0.85rem', borderRadius: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                    <CheckCircle2 size={16} /> Template updated successfully!
                  </div>
                )}

                {/* Form Fields */}
                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  
                  {/* Title & Category Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '0.85rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', color: '#1e293b' }}>
                        Template Title *
                      </label>
                      <input
                        type="text"
                        disabled={!isEditing}
                        value={(isEditing ? editForm?.title : activeTemplate?.title) || ''}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        placeholder="e.g. Lead Welcome & Greeting"
                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', color: '#1e293b' }}>
                        Category
                      </label>
                      <input
                        type="text"
                        disabled={!isEditing}
                        value={(isEditing ? editForm?.category : activeTemplate?.category) || ''}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        placeholder="e.g. Marketing, Greeting"
                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>

                  {/* Type Selector (Pill Buttons) */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.4rem', color: '#1e293b' }}>
                      Message Format &amp; Type *
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                      {Object.entries(TYPE_CONFIG).map(([tKey, tConf]) => {
                        const isCurrent = (isEditing ? editForm.type : activeTemplate.type) === tKey;
                        const Icon = tConf.icon;
                        return (
                          <button
                            key={tKey}
                            type="button"
                            disabled={!isEditing}
                            onClick={() => setEditForm({ ...editForm, type: tKey })}
                            style={{
                              padding: '0.55rem 0.65rem',
                              borderRadius: '8px',
                              border: isCurrent ? `2px solid ${tConf.color}` : '1px solid #cbd5e1',
                              background: isCurrent ? tConf.bg : '#f8fafc',
                              color: isCurrent ? tConf.color : '#475569',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: isEditing ? 'pointer' : 'default',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.35rem'
                            }}
                          >
                            <Icon size={15} /> {tConf.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dynamic Lead Registration Variable Toolbar with Quick Filter & Category Tabs */}
                  {isEditing && (
                    <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Sparkles size={15} color="#00a884" /> Lead Registration Variables ({filteredVariableTags.length}):
                        </span>
                        
                        {/* Quick Search */}
                        <div style={{ position: 'relative', width: '220px' }}>
                          <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                          <input
                            type="text"
                            value={variableSearch}
                            onChange={(e) => setVariableSearch(e.target.value)}
                            placeholder="Search variable (gst, phone, etc)..."
                            style={{ width: '100%', padding: '0.3rem 0.6rem 0.3rem 1.6rem', fontSize: '0.75rem', borderRadius: '5px', border: '1px solid #cbd5e1', outline: 'none', background: '#fff' }}
                          />
                          {variableSearch && (
                            <button 
                              type="button" 
                              onClick={() => setVariableSearch('')}
                              style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', color: '#94a3b8' }}
                            >
                              &times;
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Category Tabs */}
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.65rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedVariableCategory('all')}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '5px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            border: selectedVariableCategory === 'all' ? '1px solid #00a884' : '1px solid #e2e8f0',
                            background: selectedVariableCategory === 'all' ? '#dcfce7' : '#fff',
                            color: selectedVariableCategory === 'all' ? '#15803d' : '#64748b',
                            cursor: 'pointer'
                          }}
                        >
                          All ({ALL_VARIABLE_TAGS.length})
                        </button>
                        {VARIABLE_CATEGORIES.map(cat => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setSelectedVariableCategory(cat.id)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '5px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              border: selectedVariableCategory === cat.id ? '1px solid #00a884' : '1px solid #e2e8f0',
                              background: selectedVariableCategory === cat.id ? '#dcfce7' : '#fff',
                              color: selectedVariableCategory === cat.id ? '#15803d' : '#64748b',
                              cursor: 'pointer'
                            }}
                          >
                            {cat.label} ({cat.tags.length})
                          </button>
                        ))}
                      </div>

                      {/* Variable Chips List */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', maxHeight: '150px', overflowY: 'auto', paddingRight: '4px' }}>
                        {filteredVariableTags.map(v => (
                          <button
                            key={v.tag}
                            type="button"
                            onClick={() => handleInsertTag(v.tag)}
                            title={`Click to insert ${v.label} into message text`}
                            style={{
                              padding: '3px 7px',
                              borderRadius: '5px',
                              background: '#fff',
                              border: '1px solid #cbd5e1',
                              fontSize: '0.72rem',
                              color: '#1d4ed8',
                              cursor: 'pointer',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.background = '#eff6ff'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#fff'; }}
                          >
                            <span>{v.tag}</span>
                            <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 500 }}>({v.label})</span>
                          </button>
                        ))}
                        {filteredVariableTags.length === 0 && (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '0.2rem' }}>No variable matches "{variableSearch}"</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TYPE SPECIFIC FORM CONTROLS */}

                  {/* 1. IMAGE CONTROLS */}
                  {activeTemplate.type === 'IMAGE' && (
                    <div style={{ padding: '0.85rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, fontSize: '0.82rem', color: '#16a34a' }}>
                        <ImageIcon size={15} /> Image Configuration
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Image Direct URL (PNG/JPEG/WebP) *
                        </label>
                        <input
                          type="text"
                          disabled={!isEditing}
                          value={(isEditing ? editForm?.media_url : activeTemplate?.media_url) || ''}
                          onChange={(e) => setEditForm({ ...editForm, media_url: e.target.value })}
                          placeholder="https://example.com/images/crop_implement.jpg"
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.82rem' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 2. VIDEO CONTROLS */}
                  {activeTemplate.type === 'VIDEO' && (
                    <div style={{ padding: '0.85rem', background: '#faf5ff', borderRadius: '8px', border: '1px solid #e9d5ff', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, fontSize: '0.82rem', color: '#9333ea' }}>
                        <Video size={15} /> Video Configuration
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Video Direct URL (MP4 / H.264) *
                        </label>
                        <input
                          type="text"
                          disabled={!isEditing}
                          value={(isEditing ? editForm?.media_url : activeTemplate?.media_url) || ''}
                          onChange={(e) => setEditForm({ ...editForm, media_url: e.target.value })}
                          placeholder="https://example.com/videos/rotavator_demo.mp4"
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d8b4fe', fontSize: '0.82rem' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 3. DOCUMENT CONTROLS */}
                  {activeTemplate.type === 'DOCUMENT' && (
                    <div style={{ padding: '0.85rem', background: '#fff7ed', borderRadius: '8px', border: '1px solid #fed7aa', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, fontSize: '0.82rem', color: '#ea580c' }}>
                        <File size={15} /> Document Attachment Configuration
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.6rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                            PDF / Document URL *
                          </label>
                          <input
                            type="text"
                            disabled={!isEditing}
                            value={(isEditing ? editForm?.media_url : activeTemplate?.media_url) || ''}
                            onChange={(e) => setEditForm({ ...editForm, media_url: e.target.value })}
                            placeholder="https://example.com/catalog.pdf"
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #fdba74', fontSize: '0.82rem' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                            Display Filename *
                          </label>
                          <input
                            type="text"
                            disabled={!isEditing}
                            value={(isEditing ? editForm?.filename : activeTemplate?.filename) || ''}
                            onChange={(e) => setEditForm({ ...editForm, filename: e.target.value })}
                            placeholder="e.g. Catalog_2026.pdf"
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #fdba74', fontSize: '0.82rem' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 4. POLL CONTROLS */}
                  {activeTemplate.type === 'POLL' && (
                    <div style={{ padding: '0.85rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, fontSize: '0.82rem', color: '#2563eb' }}>
                        <BarChart2 size={15} /> WhatsApp Poll Setup
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Poll Question *
                        </label>
                        <input
                          type="text"
                          disabled={!isEditing}
                          value={(isEditing ? editForm?.poll_question : activeTemplate?.poll_question) || ''}
                          onChange={(e) => setEditForm({ ...editForm, poll_question: e.target.value })}
                          placeholder="e.g. Which tractor HP do you operate?"
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '0.82rem' }}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                            Poll Voting Options (Min 2, Max 10)
                          </label>
                          {isEditing && (
                            <button
                              type="button"
                              onClick={handleAddPollOption}
                              style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                            >
                              <Plus size={12} /> Add Option
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {((isEditing ? editForm?.poll_options : activeTemplate?.poll_options) || []).map((opt, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ fontSize: '0.75rem', color: '#64748b', width: '20px' }}>{i + 1}.</span>
                              <input
                                type="text"
                                disabled={!isEditing}
                                value={opt || ''}
                                onChange={(e) => handlePollOptionChange(i, e.target.value)}
                                style={{ flex: 1, padding: '0.45rem', borderRadius: '4px', border: '1px solid #93c5fd', fontSize: '0.8rem' }}
                              />
                              {isEditing && (
                                <button
                                  type="button"
                                  onClick={() => handleRemovePollOption(i)}
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 5. EVENT CONTROLS */}
                  {activeTemplate.type === 'EVENT' && (
                    <div style={{ padding: '0.85rem', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, fontSize: '0.82rem', color: '#d97706' }}>
                        <Calendar size={15} /> WhatsApp Event &amp; Invitation Setup
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '0.6rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                            Event Title *
                          </label>
                          <input
                            type="text"
                            disabled={!isEditing}
                            value={(isEditing ? editForm?.event_title : activeTemplate?.event_title) || ''}
                            onChange={(e) => setEditForm({ ...editForm, event_title: e.target.value })}
                            placeholder="e.g. Swan Agro Annual Farmers Meet"
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #fcd34d', fontSize: '0.82rem' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                            Start Date &amp; Time (IST) *
                          </label>
                          <input
                            type="text"
                            disabled={!isEditing}
                            value={(isEditing ? editForm?.event_start_time : activeTemplate?.event_start_time) || ''}
                            onChange={(e) => setEditForm({ ...editForm, event_start_time: e.target.value })}
                            placeholder="e.g. 2026-10-25 10:00 AM IST"
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #fcd34d', fontSize: '0.82rem' }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.6rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                            Venue / Address
                          </label>
                          <input
                            type="text"
                            disabled={!isEditing}
                            value={(isEditing ? editForm?.event_venue : activeTemplate?.event_venue) || ''}
                            onChange={(e) => setEditForm({ ...editForm, event_venue: e.target.value })}
                            placeholder="e.g. Swan Agro Grounds, Ludhiana"
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #fcd34d', fontSize: '0.82rem' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                            RSVP / Registration Link
                          </label>
                          <input
                            type="text"
                            disabled={!isEditing}
                            value={(isEditing ? editForm?.event_rsvp_url : activeTemplate?.event_rsvp_url) || ''}
                            onChange={(e) => setEditForm({ ...editForm, event_rsvp_url: e.target.value })}
                            placeholder="https://newswangroup.com/rsvp"
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #fcd34d', fontSize: '0.82rem' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Message Content / Caption */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', color: '#1e293b' }}>
                      {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(activeTemplate.type) ? 'Media Caption (WhatsApp Text)' : 'Message Body Content *'}
                    </label>
                    <textarea
                      ref={textareaRef}
                      rows={6}
                      disabled={!isEditing}
                      value={(isEditing ? editForm?.content : activeTemplate?.content) || ''}
                      onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                      placeholder="Type your WhatsApp message content with {{variables}} and emojis..."
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.85rem',
                        lineHeight: 1.5,
                        outline: 'none',
                        resize: 'vertical'
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b', marginTop: '0.25rem' }}>
                      <span>Supports standard WhatsApp formatting: *bold*, _italic_, ~strike~</span>
                      <span>{(isEditing ? editForm.content : activeTemplate.content)?.length || 0} characters</span>
                    </div>
                  </div>

                  {/* Bottom Save Action Controls */}
                  {isEditing && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.5rem', paddingTop: '0.85rem', borderTop: '1px solid #e2e8f0' }}>
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        style={{
                          padding: '0.5rem 1.35rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#00a884',
                          color: '#fff',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: saving ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          boxShadow: '0 1px 3px rgba(0,168,132,0.3)'
                        }}
                      >
                        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                        Save Template
                      </button>
                    </div>
                  )}

                </form>
              </div>
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                Select a template from the list or click "+ Create Template" to get started.
              </div>
            )}
          </div>

          {/* Right Sub-Column: Live Realistic WhatsApp Phone Mockup & Test Dispatch */}
          <div style={{ 
            flex: '1 1 45%', 
            background: '#f1f5f9', 
            padding: '1.25rem', 
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start'
          }}>
            
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Eye size={15} color="#00a884" /> Live WhatsApp Mobile Screen Mockup
            </div>

            {/* Smartphone Mockup */}
            <div style={{
              width: '320px',
              background: '#efeae2',
              borderRadius: '28px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              overflow: 'hidden',
              border: '8px solid #1e293b',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column'
            }}>
              
              {/* Phone Header */}
              <div style={{ background: '#00a884', color: '#fff', padding: '0.65rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00a884', fontWeight: 800, fontSize: '0.85rem' }}>
                  SA
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Swan Agro &bull; Official
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#dcfce7' }}>
                    Verified Business Account
                  </div>
                </div>
              </div>

              {/* Chat Viewport */}
              <div style={{ padding: '0.85rem', minHeight: '340px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: '0.5rem' }}>
                
                {/* Date Divider */}
                <div style={{ textAlign: 'center', margin: '0.25rem 0' }}>
                  <span style={{ background: '#ffffffcc', padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', color: '#54656f', fontWeight: 600 }}>
                    TODAY
                  </span>
                </div>

                {/* WhatsApp Message Bubble */}
                {activeTemplate && (
                  <div style={{
                    background: '#d9fdd3',
                    borderRadius: '8px',
                    padding: '0.5rem',
                    boxShadow: '0 1px 0.5px rgba(11,20,26,0.13)',
                    maxWidth: '100%',
                    position: 'relative'
                  }}>
                    
                    {/* 1. IMAGE TEMPLATE PREVIEW */}
                    {activeTemplate.type === 'IMAGE' && (
                      <div style={{ marginBottom: '0.4rem', borderRadius: '6px', overflow: 'hidden', background: '#000' }}>
                        <img 
                          src={activeTemplate.media_url || 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?w=600&auto=format&fit=crop&q=80'} 
                          alt="preview" 
                          style={{ width: '100%', maxHeight: '160px', objectFit: 'cover', display: 'block' }} 
                        />
                      </div>
                    )}

                    {/* 2. VIDEO TEMPLATE PREVIEW */}
                    {activeTemplate.type === 'VIDEO' && (
                      <div style={{ 
                        marginBottom: '0.4rem', 
                        borderRadius: '6px', 
                        overflow: 'hidden', 
                        background: '#0f172a', 
                        height: '140px', 
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Play size={20} color="#00a884" style={{ marginLeft: '3px' }} />
                        </div>
                        <span style={{ position: 'absolute', bottom: '6px', right: '8px', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px' }}>
                          0:45
                        </span>
                      </div>
                    )}

                    {/* 3. DOCUMENT TEMPLATE PREVIEW */}
                    {activeTemplate.type === 'DOCUMENT' && (
                      <div style={{ 
                        marginBottom: '0.45rem', 
                        borderRadius: '6px', 
                        background: '#e9edef', 
                        padding: '0.5rem 0.65rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <div style={{ width: '32px', height: '36px', borderRadius: '4px', background: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '0.65rem' }}>
                          PDF
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#111b21', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {activeTemplate.filename || 'Catalog_2026.pdf'}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#667781' }}>
                            1.8 MB &bull; PDF Document
                          </div>
                        </div>
                        <Download size={16} color="#00a884" />
                      </div>
                    )}

                    {/* 4. POLL TEMPLATE PREVIEW */}
                    {activeTemplate.type === 'POLL' && (
                      <div style={{ marginBottom: '0.45rem', padding: '0.45rem', background: '#fff', borderRadius: '6px', border: '1px solid #d1fae5' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#111b21', marginBottom: '0.45rem' }}>
                          📊 {compileTemplateVariables(activeTemplate.poll_question || 'Survey Question', { name: 'Sujit Kumar', company: 'Swan Agro' })}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {((activeTemplate.poll_options) || ['Option 1', 'Option 2']).map((opt, i) => (
                            <div key={i} style={{ 
                              padding: '0.35rem 0.5rem', 
                              borderRadius: '6px', 
                              border: '1px solid #e2e8f0', 
                              background: '#f8fafc',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '0.74rem'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '1.5px solid #94a3b8' }} />
                                <span style={{ color: '#1e293b' }}>{compileTemplateVariables(opt, { name: 'Sujit Kumar' })}</span>
                              </div>
                              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>0</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: '0.4rem', textAlign: 'center', fontSize: '0.65rem', color: '#00a884', fontWeight: 700 }}>
                          VIEW VOTES
                        </div>
                      </div>
                    )}

                    {/* 5. EVENT TEMPLATE PREVIEW */}
                    {activeTemplate.type === 'EVENT' && (
                      <div style={{ marginBottom: '0.45rem', padding: '0.55rem', background: '#fff', borderRadius: '6px', border: '1px solid #fef08a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                          <div style={{ width: '38px', height: '40px', borderRadius: '6px', background: '#fef3c7', border: '1px solid #fde68a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '0.55rem', fontWeight: 800, color: '#b45309' }}>OCT</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 900, color: '#1e293b', lineHeight: 1 }}>25</span>
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#111b21', lineHeight: 1.2 }}>
                              {compileTemplateVariables(activeTemplate.event_title || 'Event Invitation', { name: 'Sujit Kumar' })}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#667781' }}>
                              ⏰ {activeTemplate.event_start_time || '10:00 AM IST'}
                            </div>
                          </div>
                        </div>

                        {activeTemplate.event_venue && (
                          <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            📍 {compileTemplateVariables(activeTemplate.event_venue, { company: 'Swan Agro' })}
                          </div>
                        )}

                        <div style={{ 
                          textAlign: 'center', 
                          background: '#00a884', 
                          color: '#fff', 
                          borderRadius: '4px', 
                          padding: '0.3rem', 
                          fontSize: '0.72rem', 
                          fontWeight: 700, 
                          marginTop: '0.3rem' 
                        }}>
                          RSVP &bull; Confirm Attendance
                        </div>
                      </div>
                    )}

                    {/* Compiled Text Content / Caption */}
                    <div style={{ 
                      fontSize: '0.8rem', 
                      color: '#111b21', 
                      lineHeight: 1.45, 
                      whiteSpace: 'pre-line',
                      wordBreak: 'break-word'
                    }}>
                      {compileTemplateVariables(activeTemplate.content || '', {
                        name: 'Sujit Kumar',
                        company: 'Swan Agro',
                        phone: '+91 98765 43210',
                        quote_no: 'SA-QT-2026',
                        amount: '45,000',
                        link: 'https://newswangroup.com'
                      })}
                    </div>

                    {/* Timestamp & Double Blue Ticks */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.2rem', marginTop: '0.2rem' }}>
                      <span style={{ fontSize: '0.6rem', color: '#667781' }}>
                        10:45 AM
                      </span>
                      <CheckCheck size={14} color="#53bdeb" />
                    </div>

                  </div>
                )}

              </div>
            </div>

            {/* Test Dispatch Card below phone */}
            <div style={{ 
              width: '320px', 
              marginTop: '1.25rem', 
              background: '#fff', 
              padding: '0.85rem 1rem', 
              borderRadius: '12px', 
              border: '1px solid var(--border-light)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Send size={14} color="#00a884" /> Test Send This Template Now
              </div>

              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', marginBottom: '0.2rem' }}>
                  Target Phone Number (with Country Code)
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Phone size={13} color="#94a3b8" style={{ position: 'absolute', left: '8px' }} />
                  <input
                    type="text"
                    value={testNumber || ''}
                    onChange={(e) => setTestNumber(e.target.value)}
                    placeholder="916283362279"
                    style={{ width: '100%', padding: '0.4rem 0.4rem 0.4rem 1.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleSendTest}
                disabled={sendingTest || !testNumber.trim() || !activeTemplate}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  background: '#00a884',
                  color: '#fff',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: (sendingTest || !testNumber.trim()) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  opacity: (sendingTest || !testNumber.trim()) ? 0.6 : 1
                }}
              >
                {sendingTest ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                {sendingTest ? 'Dispatching to WhatsApp...' : 'Dispatch Test Template'}
              </button>

              {testResult && (
                <div style={{ 
                  marginTop: '0.65rem', 
                  padding: '0.5rem 0.65rem', 
                  borderRadius: '6px', 
                  fontSize: '0.74rem',
                  background: testResult.success ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${testResult.success ? '#bbf7d0' : '#fecaca'}`,
                  color: testResult.success ? '#15803d' : '#b91c1c'
                }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {testResult.success ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                    {testResult.success ? 'Delivered to WhatsApp!' : 'Dispatch Error'}
                  </div>
                  <div style={{ marginTop: '0.15rem' }}>
                    {testResult.message || testResult.error}
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
