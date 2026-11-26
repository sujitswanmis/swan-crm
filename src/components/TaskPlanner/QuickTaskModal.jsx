'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Calendar, Clock, AlertCircle, Sparkles, Tag, CheckSquare, FileText, Check, Search, User, Users, Mic, MicOff } from 'lucide-react';
import { getEmployeesMaster } from '@/app/actions/employee';
import { transliterateToHinglish } from './hinglishUtils';

const PRIORITY_OPTIONS = [
  { id: 'URGENT_IMPORTANT', label: '🔥 Urgent & Important (Do First)', color: 'var(--task-danger)', bg: 'var(--task-danger-bg)' },
  { id: 'IMPORTANT_NOT_URGENT', label: '⭐ Important, Not Urgent (Schedule)', color: 'var(--task-info)', bg: 'var(--task-info-bg)' },
  { id: 'URGENT_NOT_IMPORTANT', label: '⚡ Urgent, Not Important (Delegate)', color: 'var(--task-warning)', bg: 'var(--task-warning-bg)' },
  { id: 'LOW', label: '☕ Low Priority (Eliminate / Leisure)', color: 'var(--text-secondary)', bg: 'var(--bg-subtle)' }
];

const REQUEST_CHANNELS = [
  { id: 'VERBAL', label: '🗣️ Verbal (मौखिक)', desc: 'Face-to-face' },
  { id: 'PHONE', label: '📞 Phone Call', desc: 'Over phone' },
  { id: 'WHATSAPP', label: '💬 WhatsApp', desc: 'Message / Chat' },
  { id: 'MEETING', label: '🤝 Meeting', desc: 'In discussion' },
  { id: 'EMAIL', label: '📧 Email', desc: 'Over email' }
];

const TIME_SLOT_OPTIONS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00'
];

function formatDurationHuman(mins) {
  const m = parseInt(mins, 10) || 0;
  if (m <= 0) return '0 min';
  if (m < 60) return `${m} mins`;
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${hrs} hr ${rem} mins` : `${hrs} hr${hrs > 1 ? 's' : ''}`;
}

export default function QuickTaskModal({
  isOpen,
  onClose,
  onSave,
  taskToEdit = null,
  initialDate = '',
  initialSlot = '',
  employeeName = '',
  employeeEmail = '',
  tenantId = '00000000-0000-0000-0000-000000000001',
  userCompany = ''
}) {
  // Task Mode: 'SELF' (मेरा अपना काम) vs 'INWARD' (किसी ने काम बताया)
  const [taskMode, setTaskMode] = useState(taskToEdit?.requested_by_name ? 'INWARD' : 'SELF');
  const [employeesList, setEmployeesList] = useState([]);
  const [requesterSearch, setRequesterSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Voice Typing State (Speech-to-Text)
  const [listeningField, setListeningField] = useState(null); // 'title' | 'description' | null
  const recognitionRef = useRef(null);
  const voiceBaseTextRef = useRef('');
  const [voiceLang, setVoiceLang] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('task_planner_voice_lang') || 'en-IN';
    }
    return 'en-IN';
  });

  const handleVoiceLangChange = (lang) => {
    setVoiceLang(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('task_planner_voice_lang', lang);
    }
  };

  // Custom Duration State
  const [isCustomDuration, setIsCustomDuration] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    planned_date: '',
    time_slot_start: '',
    time_slot_end: '',
    estimated_minutes: 30,
    priority: 'IMPORTANT_NOT_URGENT',
    status: 'PLANNED',
    requested_by_name: '',
    requested_by_channel: 'VERBAL',
    notes: ''
  });

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Voice typing handler (Web Speech API)
  const startVoiceTyping = (fieldName) => {
    const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRecognition) {
      setErrorMsg('Voice typing is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    if (listeningField === fieldName && recognitionRef.current) {
      recognitionRef.current.stop();
      setListeningField(null);
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      // Snapshot existing text so speech appends cleanly without repetition
      voiceBaseTextRef.current = formData[fieldName] || '';

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = voiceLang || 'en-IN'; // en-IN for English/Hinglish (A-Z), hi-IN for Hindi (अ-क)

      recognition.onstart = () => {
        setListeningField(fieldName);
      };

      recognition.onresult = (event) => {
        let sessionTranscript = '';
        if (event.results) {
          for (let i = 0; i < event.results.length; ++i) {
            if (event.results[i]?.[0]?.transcript) {
              sessionTranscript += event.results[i][0].transcript;
            }
          }
        }
        if (sessionTranscript) {
          const base = (voiceBaseTextRef.current || '').trim();
          let cleanSpeech = sessionTranscript.trim();

          // In Hinglish / English mode, automatically convert any Devanagari Hindi words into clean Roman Hinglish (A-Z)
          if (voiceLang === 'en-IN' || voiceLang === 'en-US') {
            cleanSpeech = transliterateToHinglish(cleanSpeech);
          }

          const fullText = base ? `${base} ${cleanSpeech}` : cleanSpeech;
          setFormData(prev => ({ ...prev, [fieldName]: fullText }));
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        setListeningField(null);
      };

      recognition.onend = () => {
        setListeningField(null);
      };

      recognition.start();
    } catch (err) {
      console.error('Speech recognition start failed:', err);
      setListeningField(null);
    }
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Load Company Employees Master
  useEffect(() => {
    let isCancelled = false;
    async function loadEmps() {
      try {
        const emps = await getEmployeesMaster(tenantId, userCompany);
        if (!isCancelled && Array.isArray(emps)) {
          setEmployeesList(emps.filter(e => e.is_approved !== false));
        }
      } catch (err) {
        console.warn('Could not load employees in QuickTaskModal:', err);
      }
    }
    if (isOpen) {
      loadEmps();
    }
    return () => { isCancelled = true; };
  }, [isOpen, tenantId, userCompany]);

  // Filtered employees for combobox
  const filteredEmployees = useMemo(() => {
    const q = (requesterSearch || '').trim().toLowerCase();
    if (!q) return employeesList.slice(0, 25);
    return employeesList.filter(e => {
      const name = (e.name || e.emp_name || '').toLowerCase();
      const email = (e.email || '').toLowerCase();
      const dept = (e.department || '').toLowerCase();
      return name.includes(q) || email.includes(q) || dept.includes(q);
    }).slice(0, 25);
  }, [employeesList, requesterSearch]);

  const handleModeChange = (mode) => {
    setTaskMode(mode);
    if (mode === 'SELF') {
      setFormData(prev => ({ ...prev, requested_by_name: '', requested_by_channel: 'VERBAL' }));
      setRequesterSearch('');
      setIsDropdownOpen(false);
    }
  };

  useEffect(() => {
    if (taskToEdit) {
      const hasRequester = Boolean(taskToEdit.requested_by_name?.trim());
      setTaskMode(hasRequester ? 'INWARD' : 'SELF');
      const dur = taskToEdit.estimated_minutes || 30;
      setIsCustomDuration(![15, 30, 45, 60, 90, 120].includes(dur));
      setFormData({
        title: taskToEdit.title || '',
        description: taskToEdit.description || '',
        planned_date: taskToEdit.planned_date || initialDate || '',
        time_slot_start: taskToEdit.time_slot_start || '',
        time_slot_end: taskToEdit.time_slot_end || '',
        estimated_minutes: dur,
        priority: taskToEdit.priority || 'IMPORTANT_NOT_URGENT',
        status: taskToEdit.status || 'PLANNED',
        requested_by_name: taskToEdit.requested_by_name || '',
        requested_by_channel: taskToEdit.requested_by_channel || 'VERBAL',
        notes: taskToEdit.notes || ''
      });
      setRequesterSearch(taskToEdit.requested_by_name || '');
    } else {
      setTaskMode('SELF');
      setIsCustomDuration(false);
      setFormData({
        title: '',
        description: '',
        planned_date: initialDate || new Date().toISOString().slice(0, 10),
        time_slot_start: initialSlot || '',
        time_slot_end: initialSlot ? getNextSlot(initialSlot) : '',
        estimated_minutes: 30,
        priority: 'IMPORTANT_NOT_URGENT',
        status: 'PLANNED',
        requested_by_name: '',
        requested_by_channel: 'VERBAL',
        notes: ''
      });
      setRequesterSearch('');
    }
    setErrorMsg('');
  }, [taskToEdit, initialDate, initialSlot, isOpen]);

  function getNextSlot(slot) {
    const idx = TIME_SLOT_OPTIONS.indexOf(slot);
    if (idx >= 0 && idx < TIME_SLOT_OPTIONS.length - 1) {
      return TIME_SLOT_OPTIONS[idx + 1];
    }
    return '';
  }

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setErrorMsg('Please enter a task title.');
      return;
    }
    if (!formData.planned_date) {
      setErrorMsg('Please select a planned date (IST).');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    try {
      const parsedMin = parseInt(formData.estimated_minutes, 10);
      const safeDuration = isNaN(parsedMin) || parsedMin <= 0 ? 30 : parsedMin;

      const payload = {
        ...formData,
        estimated_minutes: safeDuration,
        requested_by_name: taskMode === 'INWARD' ? (formData.requested_by_name || '').trim() : null,
        requested_by_channel: taskMode === 'INWARD' ? (formData.requested_by_channel || 'VERBAL') : 'VERBAL',
        employee_name: employeeName,
        employee_email: employeeEmail
      };
      await onSave(payload, taskToEdit ? taskToEdit.id : null);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--bg-surface, #ffffff)',
        color: 'var(--text-primary, #1e293b)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid var(--border-light, #e2e8f0)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-light, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--task-accent-bg)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'var(--task-action)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Sparkles size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>
                {taskToEdit ? 'Edit Planned Task' : 'Schedule New Daily Task'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>
                Time-blocked planning in Indian Standard Time (IST)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary, #64748b)',
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {errorMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: 'var(--task-danger-bg)',
              color: 'var(--task-danger)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Top Segmented Mode Selector: Self vs Inward */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-subtle, #f1f5f9)',
            padding: '4px',
            borderRadius: '10px',
            gap: '4px'
          }}>
            <button
              type="button"
              onClick={() => handleModeChange('SELF')}
              style={{
                flex: 1,
                padding: '0.55rem 0.75rem',
                borderRadius: '8px',
                border: 'none',
                background: taskMode === 'SELF' ? 'var(--bg-surface, #ffffff)' : 'transparent',
                color: taskMode === 'SELF' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: taskMode === 'SELF' ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                boxShadow: taskMode === 'SELF' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <span>🙋</span>
              <span>मेरा अपना काम (Self Task)</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('INWARD')}
              style={{
                flex: 1,
                padding: '0.55rem 0.75rem',
                borderRadius: '8px',
                border: 'none',
                background: taskMode === 'INWARD' ? 'var(--task-action)' : 'transparent',
                color: taskMode === 'INWARD' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: taskMode === 'INWARD' ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                boxShadow: taskMode === 'INWARD' ? '0 2px 6px rgba(99, 102, 241, 0.3)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <span>📥</span>
              <span>किसी ने काम बताया (Inward)</span>
            </button>
          </div>

          {/* Inward Requester & Channel Block (Shown only when 'किसी ने काम बताया' selected) */}
          {taskMode === 'INWARD' && (
            <div style={{
              background: 'var(--bg-page)',
              border: '1.5px solid var(--task-accent-border)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              {/* Combobox Search Input */}
              <div ref={dropdownRef} style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    👤 काम किसने बताया? (Search user or type custom) <span style={{ color: 'var(--task-danger)' }}>*</span>
                  </label>
                  {requesterSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setRequesterSearch('');
                        setFormData(prev => ({ ...prev, requested_by_name: '' }));
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--task-accent)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={requesterSearch}
                    onChange={(e) => {
                      setRequesterSearch(e.target.value);
                      setFormData(prev => ({ ...prev, requested_by_name: e.target.value }));
                      setIsDropdownOpen(true);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    placeholder="Search employee by name/dept, or type custom..."
                    style={{
                      width: '100%',
                      padding: '0.58rem 2.2rem 0.58rem 0.85rem',
                      borderRadius: '8px',
                      border: '1.5px solid var(--task-accent-border)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      outline: 'none'
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: 'var(--text-secondary)'
                  }}>
                    <Search size={15} />
                  </div>
                </div>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    zIndex: 100,
                    padding: '4px'
                  }}>
                    {/* Top Item: Use Custom Typed Name */}
                    {requesterSearch.trim() && (
                      <div
                        onClick={() => {
                          setFormData(prev => ({ ...prev, requested_by_name: requesterSearch.trim() }));
                          setIsDropdownOpen(false);
                        }}
                        style={{
                          padding: '0.55rem 0.75rem',
                          borderRadius: '6px',
                          background: 'var(--task-accent-bg)',
                          color: 'var(--task-accent)',
                          fontSize: '0.825rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          marginBottom: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem'
                        }}
                      >
                        <span>✍️</span>
                        <span>Use custom: <strong>"{requesterSearch.trim()}"</strong></span>
                      </div>
                    )}

                    {/* Filtered Employees List */}
                    {filteredEmployees.length > 0 ? (
                      filteredEmployees.map(emp => {
                        const displayName = emp.name || emp.emp_name || emp.email;
                        const dept = emp.department || emp.role || 'Staff';
                        return (
                          <div
                            key={emp.id || emp.email}
                            onClick={() => {
                              const fullName = dept ? `${displayName} (${dept})` : displayName;
                              setRequesterSearch(fullName);
                              setFormData(prev => ({ ...prev, requested_by_name: fullName }));
                              setIsDropdownOpen(false);
                            }}
                            style={{
                              padding: '0.5rem 0.75rem',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '0.825rem',
                              transition: 'background 0.1s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-subtle)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                background: 'var(--task-accent-bg)',
                                color: 'var(--task-accent)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: 700
                              }}>
                                {displayName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{displayName}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{emp.email}</div>
                              </div>
                            </div>
                            <span style={{
                              fontSize: '0.7rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'var(--bg-subtle)',
                              color: 'var(--text-secondary)',
                              fontWeight: 500
                            }}>
                              {dept}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      !requesterSearch.trim() && (
                        <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          Start typing to search users...
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* Permanently Visible Request Channel Pills */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  माध्यम (Request Channel):
                </label>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  {REQUEST_CHANNELS.map(ch => {
                    const isSelected = formData.requested_by_channel === ch.id;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, requested_by_channel: ch.id }))}
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          border: isSelected ? '1.5px solid var(--task-accent-border)' : '1px solid var(--border-light)',
                          background: isSelected ? 'var(--task-info-bg)' : 'var(--bg-surface)',
                          color: isSelected ? 'var(--task-accent)' : 'var(--text-secondary)',
                          fontSize: '0.75rem',
                          fontWeight: isSelected ? 600 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{ch.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Voice Typing Language Quick Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-subtle, #f8fafc)',
            border: '1px solid var(--border-light, #e2e8f0)',
            borderRadius: '8px',
            padding: '0.4rem 0.75rem',
            gap: '0.5rem',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>
              <span>🎙️ Voice Language:</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleVoiceLangChange('en-IN')}
                style={{
                  padding: '0.22rem 0.6rem',
                  borderRadius: '6px',
                  border: voiceLang === 'en-IN' ? '1.5px solid var(--task-accent, #6366f1)' : '1px solid var(--border-light, #cbd5e1)',
                  background: voiceLang === 'en-IN' ? 'var(--task-accent-bg, #eff6ff)' : 'var(--bg-surface, #ffffff)',
                  color: voiceLang === 'en-IN' ? 'var(--task-accent, #4f46e5)' : 'var(--text-secondary, #64748b)',
                  fontWeight: voiceLang === 'en-IN' ? 700 : 500,
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Speak English or Hinglish -> Writes in clean English Alphabet (A-Z)"
              >
                🔤 Hinglish / English (A-Z)
              </button>

              <button
                type="button"
                onClick={() => handleVoiceLangChange('hi-IN')}
                style={{
                  padding: '0.22rem 0.6rem',
                  borderRadius: '6px',
                  border: voiceLang === 'hi-IN' ? '1.5px solid var(--task-accent, #6366f1)' : '1px solid var(--border-light, #cbd5e1)',
                  background: voiceLang === 'hi-IN' ? 'var(--task-accent-bg, #eff6ff)' : 'var(--bg-surface, #ffffff)',
                  color: voiceLang === 'hi-IN' ? 'var(--task-accent, #4f46e5)' : 'var(--text-secondary, #64748b)',
                  fontWeight: voiceLang === 'hi-IN' ? 700 : 500,
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Speak in Hindi -> Writes in Devanagari Hindi (अ-क)"
              >
                🇮🇳 हिन्दी (अ-क)
              </button>

              <button
                type="button"
                onClick={() => handleVoiceLangChange('en-US')}
                style={{
                  padding: '0.22rem 0.6rem',
                  borderRadius: '6px',
                  border: voiceLang === 'en-US' ? '1.5px solid var(--task-accent, #6366f1)' : '1px solid var(--border-light, #cbd5e1)',
                  background: voiceLang === 'en-US' ? 'var(--task-accent-bg, #eff6ff)' : 'var(--bg-surface, #ffffff)',
                  color: voiceLang === 'en-US' ? 'var(--task-accent, #4f46e5)' : 'var(--text-secondary, #64748b)',
                  fontWeight: voiceLang === 'en-US' ? 700 : 500,
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Speak in English US -> Pure US English"
              >
                🇺🇸 English (US)
              </button>
            </div>
          </div>

          {/* Title */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Task Title <span style={{ color: 'var(--task-danger)' }}>*</span>
              </label>
              <button
                type="button"
                onClick={() => startVoiceTyping('title')}
                style={{
                  background: listeningField === 'title' ? 'var(--task-danger-bg)' : 'var(--bg-page)',
                  border: listeningField === 'title' ? '1.5px solid var(--task-danger)' : '1px solid var(--border-light)',
                  borderRadius: '6px',
                  padding: '0.2rem 0.6rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: listeningField === 'title' ? 'var(--task-danger)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s ease'
                }}
                title={voiceLang === 'hi-IN' ? "माइक से बोलकर लिखें (हिन्दी Devanagari)" : "Speak to Type (English / Hinglish)"}
              >
                <span>{listeningField === 'title' ? '🔴' : '🎙️'}</span>
                <span>{listeningField === 'title' ? 'Listening...' : (voiceLang === 'hi-IN' ? 'बोलकर लिखें (हिन्दी)' : 'Speak to Type')}</span>
              </button>
            </div>
            <input
              type="text"
              required
              placeholder="e.g. Daily MIS Report / Client Pricing Review / Call Customer"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: listeningField === 'title' ? '1.5px solid var(--task-danger)' : '1px solid var(--border-light, #cbd5e1)',
                background: 'var(--bg-surface, #ffffff)',
                color: 'var(--text-primary, #1e293b)',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Description */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Description / Action Steps
              </label>
              <button
                type="button"
                onClick={() => startVoiceTyping('description')}
                style={{
                  background: listeningField === 'description' ? 'var(--task-danger-bg)' : 'var(--bg-page)',
                  border: listeningField === 'description' ? '1.5px solid var(--task-danger)' : '1px solid var(--border-light)',
                  borderRadius: '6px',
                  padding: '0.2rem 0.6rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: listeningField === 'description' ? 'var(--task-danger)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s ease'
                }}
                title={voiceLang === 'hi-IN' ? "माइक से बोलकर लिखें (हिन्दी Devanagari)" : "Speak to Type (English / Hinglish)"}
              >
                <span>{listeningField === 'description' ? '🔴' : '🎙️'}</span>
                <span>{listeningField === 'description' ? 'Listening...' : (voiceLang === 'hi-IN' ? 'बोलकर लिखें (हिन्दी)' : 'Speak to Type')}</span>
              </button>
            </div>
            <textarea
              rows={2}
              placeholder="Key notes, links, or deliverables expected..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              style={{
                width: '100%',
                padding: '0.6rem 0.85rem',
                borderRadius: '8px',
                border: listeningField === 'description' ? '1.5px solid var(--task-danger)' : '1px solid var(--border-light, #cbd5e1)',
                background: 'var(--bg-surface, #ffffff)',
                color: 'var(--text-primary, #1e293b)',
                fontSize: '0.85rem',
                outline: 'none',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Date & Time Slot Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
            {/* Planned Date */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Planned Date (IST) <span style={{ color: 'var(--task-danger)' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="date"
                  required
                  value={formData.planned_date}
                  onChange={(e) => setFormData({ ...formData, planned_date: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light, #cbd5e1)',
                    background: 'var(--bg-surface, #ffffff)',
                    color: 'var(--text-primary, #1e293b)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
            </div>

            {/* Time Slot Start */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Start Slot
              </label>
              <select
                value={formData.time_slot_start}
                onChange={(e) => {
                  const start = e.target.value;
                  setFormData({
                    ...formData,
                    time_slot_start: start,
                    time_slot_end: start ? getNextSlot(start) : ''
                  });
                }}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  background: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-primary, #1e293b)',
                  fontSize: '0.85rem'
                }}
              >
                <option value="">Anytime (No Time-Block)</option>
                {TIME_SLOT_OPTIONS.map((slot) => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>

            {/* Time Slot End */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                End Slot
              </label>
              <select
                value={formData.time_slot_end}
                onChange={(e) => setFormData({ ...formData, time_slot_end: e.target.value })}
                disabled={!formData.time_slot_start}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  background: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-primary, #1e293b)',
                  fontSize: '0.85rem'
                }}
              >
                <option value="">Auto / Flexible</option>
                {TIME_SLOT_OPTIONS.map((slot) => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority (Eisenhower Quadrants) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.45rem' }}>
              Priority & Eisenhower Quadrant
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {PRIORITY_OPTIONS.map((opt) => {
                const isSelected = formData.priority === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, priority: opt.id })}
                    style={{
                      textAlign: 'left',
                      padding: '0.65rem 0.75rem',
                      borderRadius: '8px',
                      border: isSelected ? `2px solid ${opt.color}` : '1px solid var(--border-light, #e2e8f0)',
                      background: isSelected ? opt.bg : 'var(--bg-surface, #ffffff)',
                      color: isSelected ? opt.color : 'var(--text-primary, #1e293b)',
                      fontWeight: isSelected ? 600 : 400,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check size={14} style={{ flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Estimated Duration */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Est. Duration (Minutes)
              </label>
              {isCustomDuration && (
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--task-accent)' }}>
                  ⏱️ {formatDurationHuman(formData.estimated_minutes)}
                </span>
              )}
            </div>
            <select
              value={isCustomDuration ? 'custom' : formData.estimated_minutes}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'custom') {
                  setIsCustomDuration(true);
                  if ([15, 30, 45, 60, 90, 120].includes(formData.estimated_minutes)) {
                    // keep current or default
                  }
                } else {
                  setIsCustomDuration(false);
                  setFormData({ ...formData, estimated_minutes: parseInt(val, 10) });
                }
              }}
              style={{
                width: '100%',
                padding: '0.6rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light, #cbd5e1)',
                background: 'var(--bg-surface, #ffffff)',
                color: 'var(--text-primary, #1e293b)',
                fontSize: '0.85rem'
              }}
            >
              <option value={15}>15 mins (Quick task)</option>
              <option value={30}>30 mins (Standard)</option>
              <option value={45}>45 mins</option>
              <option value={60}>60 mins (1 hour)</option>
              <option value={90}>90 mins (1.5 hours)</option>
              <option value={120}>120 mins (2 hours)</option>
              <option value="custom">✍️ Custom Minutes (मनचाहा समय)...</option>
            </select>

            {/* Custom Minutes Input */}
            {isCustomDuration && (
              <div style={{
                marginTop: '0.5rem',
                padding: '0.65rem 0.85rem',
                background: 'var(--bg-page)',
                border: '1.5px dashed var(--task-accent-border)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap'
              }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Enter Minutes:
                </span>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  step="5"
                  value={formData.estimated_minutes || ''}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setFormData({ ...formData, estimated_minutes: isNaN(parsed) ? '' : parsed });
                  }}
                  placeholder="e.g. 20, 75, 180"
                  style={{
                    width: '110px',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-surface)',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>minutes</span>
                <div style={{ marginLeft: 'auto', fontSize: '0.825rem', fontWeight: 700, color: 'var(--task-accent)' }}>
                  ➔ {formatDurationHuman(formData.estimated_minutes)}
                </div>
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-light, #e2e8f0)',
            marginTop: '0.5rem'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light, #cbd5e1)',
                background: 'transparent',
                color: 'var(--text-primary, #1e293b)',
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '0.6rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--task-action)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(99, 102, 241, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {saving ? 'Saving...' : (taskToEdit ? 'Update Task' : 'Add to Plan')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
