'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { getPositionDetails, uploadResumeToServer, submitApplication } from '../../actions/recruitment';
import { formatBranchStandard } from '@/utils/branchAccess';
import { ALL_INDIAN_DISTRICTS } from '@/constants/indianLocations';
import { Briefcase, User, Mail, Phone, DollarSign, FileText, CheckCircle2, AlertTriangle, Loader2, Building2, UserCheck, MapPin, GraduationCap, Clock, AlignLeft, ChevronDown, Copy, Check } from 'lucide-react';

const LOCAL_HUBS = [
  'Ludhiana', 'Raian (Ludhiana)', 'Paharuwal', 'Sahnewal', 'Khanna', 'Doraha', 'Mandi Gobindgarh',
  'Chandigarh', 'Mohali (SAS Nagar)', 'Panchkula', 'Ambala', 'Jalandhar', 'Amritsar', 'Patiala', 'Bathinda',
  'Hoshiarpur', 'Kapurthala', 'Phagwara', 'Nawanshahr', 'Ropar (Rupnagar)', 'Fatehgarh Sahib', 'Malerkotla', 'Sangrur',
  'Delhi NCR', 'Gurugram (Gurgaon)', 'Noida', 'Greater Noida', 'Faridabad', 'Ghaziabad', 'Sonipat', 'Panipat', 'Karnal', 'Kurukshetra',
  'Jaipur', 'Ahmedabad', 'Vadodara', 'Surat', 'Rajkot', 'Pune', 'Mumbai', 'Navi Mumbai', 'Thane', 'Nashik', 'Aurangabad',
  'Bengaluru (Bangalore)', 'Chennai', 'Coimbatore', 'Hyderabad', 'Secunderabad', 'Visakhapatnam', 'Vijayawada',
  'Kolkata', 'Howrah', 'Bhubaneswar', 'Cuttack', 'Ranchi', 'Jamshedpur', 'Patna', 'Gaya',
  'Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Prayagraj (Allahabad)', 'Meerut', 'Bareilly', 'Aligarh', 'Moradabad',
  'Dehradun', 'Haridwar', 'Roorkee', 'Rishikesh', 'Baddi (Solan)', 'Shimla', 'Solan', 'Dharamshala', 'Kullu',
  'Indore', 'Bhopal', 'Gwalior', 'Jabalpur', 'Raipur', 'Bilaspur', 'Nagpur'
];

const MASTER_CITIES = Array.from(new Set([...LOCAL_HUBS, ...(ALL_INDIAN_DISTRICTS || [])]));

const QUALIFICATION_CATEGORIES = [
  {
    category: 'Basic Education & Schooling',
    options: [
      'Uneducated',
      'Class 5',
      'Class 8',
      'Below 10th',
      '10th Pass (Matriculation)',
      '12th Pass - Non-Medical (PCM)',
      '12th Pass - Medical (PCB)',
      '12th Pass - Commerce',
      '12th Pass - Arts / Humanities'
    ]
  },
  {
    category: 'ITI & Vocational Trades',
    options: [
      'ITI - Fitter / Turner / Machinist',
      'ITI - Welder (Gas & Electric)',
      'ITI - Electrician / Wireman',
      'ITI - Motor Mechanic / Automobile / Diesel',
      'ITI - Tool & Die Maker',
      'ITI - Draughtsman (Mechanical / Civil)',
      'ITI - COPA / Computer Operator',
      'ITI - Other Vocational Trade'
    ]
  },
  {
    category: 'Polytechnic & Diploma (3 Years)',
    options: [
      'Diploma in Mechanical Engineering',
      'Diploma in Production / Industrial Engineering',
      'Diploma in Automobile Engineering',
      'Diploma in Electrical Engineering',
      'Diploma in Electronics & Communication',
      'Diploma in Tool & Die Making',
      'Diploma in Civil Engineering',
      'Diploma in Computer Science / IT',
      'Diploma - Other Technical Discipline'
    ]
  },
  {
    category: 'Graduation - Engineering & Technology (B.Tech / B.E.)',
    options: [
      'B.Tech / B.E. - Mechanical Engineering',
      'B.Tech / B.E. - Production / Industrial Engineering',
      'B.Tech / B.E. - Automobile Engineering',
      'B.Tech / B.E. - Electrical / Electronics Engineering',
      'B.Tech / B.E. - Computer Science / IT',
      'B.Tech / B.E. - Civil Engineering',
      'B.Tech / B.E. - Mechatronics / Robotics',
      'B.Tech / B.E. - Chemical / Metallurgy',
      'B.Tech / B.E. - Other Engineering Branch'
    ]
  },
  {
    category: 'Graduation - Commerce, Arts, Science & Management',
    options: [
      'B.Com (Bachelor of Commerce)',
      'B.Com (Honours)',
      'BBA (Bachelor of Business Administration)',
      'BCA (Bachelor of Computer Applications)',
      'B.Sc (Bachelor of Science)',
      'B.Sc - Agriculture / Forestry',
      'B.Sc - Computer Science / IT',
      'BA (Bachelor of Arts)',
      'BA (Honours)',
      'B.Des / B.Arch (Design / Architecture)',
      'B.Pharma / B.Sc Nursing / Medical',
      'LLB / B.A. LLB (Law Graduate)',
      'Other Bachelor Degree'
    ]
  },
  {
    category: 'Post Graduation (Master’s Degree)',
    options: [
      'MBA - Human Resources (HR)',
      'MBA - Marketing & Sales',
      'MBA - Operations & Supply Chain',
      'MBA - Finance & Accounts',
      'MBA - International Business / General',
      'PGDM (Post Graduate Diploma in Management)',
      'MCA (Master of Computer Applications)',
      'M.Tech / M.E. - Mechanical Engineering',
      'M.Tech / M.E. - Other Branch',
      'M.Com (Master of Commerce)',
      'M.Sc (Master of Science)',
      'MA (Master of Arts)',
      'LLM (Master of Law)',
      'Other Master Degree'
    ]
  },
  {
    category: 'Professional Certifications & Doctorate',
    options: [
      'CA (Chartered Accountant)',
      'CS (Company Secretary)',
      'CMA / ICWA (Cost & Management Accountant)',
      'CFA (Chartered Financial Analyst)',
      'PhD / Doctorate',
      'Other Professional Certification'
    ]
  }
];

export default function PublicApplyPage({ params: pageParams }) {
  const routerParams = useParams();
  const [resolvedId, setResolvedId] = useState(() => {
    if (routerParams?.id) return routerParams.id;
    if (pageParams && typeof pageParams.then !== 'function' && pageParams.id) return pageParams.id;
    return null;
  });

  useEffect(() => {
    if (routerParams?.id) {
      setResolvedId(routerParams.id);
    } else if (pageParams) {
      if (typeof pageParams.then === 'function') {
        pageParams.then(p => {
          if (p?.id) setResolvedId(p.id);
        }).catch(() => {});
      } else if (pageParams.id) {
        setResolvedId(pageParams.id);
      }
    }
  }, [routerParams, pageParams]);

  const positionId = resolvedId || routerParams?.id;

  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [success, setSuccess] = useState(false);
  const [theme, setTheme] = useState('default');

  // Form State
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    alternate_phone: '',
    current_city: '',
    total_experience: '',
    highest_qualification: '',
    current_salary: '',
    expected_salary_min: '',
    expected_salary_max: '',
    notice_period: '',
    cover_note: ''
  });

  // Autocomplete & Searchable Combobox States
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showQualDropdown, setShowQualDropdown] = useState(false);
  const [submittedCode, setSubmittedCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Live Filtered Cities Suggestions (Top 10 matches)
  const filteredCities = useMemo(() => {
    const q = (form.current_city || '').trim().toLowerCase();
    if (!q || q.length < 1) return [];
    return MASTER_CITIES.filter(c => c.toLowerCase().includes(q)).slice(0, 10);
  }, [form.current_city]);

  // Live Filtered Qualifications (Grouped)
  const filteredQualifications = useMemo(() => {
    const q = (form.highest_qualification || '').trim().toLowerCase();
    if (!q) {
      return QUALIFICATION_CATEGORIES;
    }
    const matched = [];
    for (const cat of QUALIFICATION_CATEGORIES) {
      const filteredOpts = cat.options.filter(opt => opt.toLowerCase().includes(q));
      if (filteredOpts.length > 0) {
        matched.push({ category: cat.category, options: filteredOpts });
      }
    }
    return matched;
  }, [form.highest_qualification]);
  
  // File State
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeName, setResumeName] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');

  // Synchronize Active CRM Theme
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('crm-theme') || 'default';
      setTheme(savedTheme);
      if (typeof document !== 'undefined' && document.body) {
        Array.from(document.body.classList).forEach(c => {
          if (c.startsWith('theme-')) document.body.classList.remove(c);
        });
        if (savedTheme && savedTheme !== 'default') {
          document.body.classList.add(savedTheme);
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!positionId) return;

    const fetchPosition = async () => {
      try {
        const data = await getPositionDetails(positionId);
        if (data) {
          setPosition(data);
          setErrorMsg(null);
        } else {
          setErrorMsg('Job position not found or has been closed.');
        }
      } catch (err) {
        console.error('Error fetching position:', err);
        setErrorMsg('An error occurred while loading job details.');
      } finally {
        setLoading(false);
      }
    };

    fetchPosition();
  }, [positionId]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone' || name === 'alternate_phone') {
      const cleanDigits = value.replace(/\D/g, '').slice(0, 10);
      setForm(prev => ({ ...prev, [name]: cleanDigits }));
      return;
    }
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (200 KB max limit)
    if (file.size > 200 * 1024) {
      alert('File size exceeds the 200 KB limit. Please upload a file under 200 KB.');
      return;
    }

    setResumeFile(file);
    setResumeName(file.name);
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.phone || !form.current_city || !form.total_experience || !form.highest_qualification || !form.notice_period) {
      alert('Please fill out all required fields marked with *');
      return;
    }

    // Validate Primary Mobile Number: Exactly 10 digits
    const cleanPhone = (form.phone || '').replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      alert('Contact Mobile Number must be exactly 10 digits (na kam na zyada).');
      return;
    }

    // Validate Alternate Mobile Number if entered: Exactly 10 digits
    if (form.alternate_phone) {
      const cleanAlt = form.alternate_phone.replace(/\D/g, '');
      if (cleanAlt.length !== 10) {
        alert('Alternate Mobile Number must be exactly 10 digits.');
        return;
      }
    }

    if (!form.highest_qualification.trim()) {
      alert('Please enter or select your Highest Qualification.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setUploadProgress('Preparing upload...');

    try {
      let resumeUrl = '';

      if (resumeFile) {
        setUploadProgress('Uploading resume...');
        const base64Data = await fileToBase64(resumeFile);
        const uploadRes = await uploadResumeToServer(resumeFile.name, base64Data);

        if (!uploadRes.success) {
          throw new Error(`Resume upload failed: ${uploadRes.error}`);
        }
        resumeUrl = uploadRes.url;
      }

      setUploadProgress('Submitting application...');
      const submitRes = await submitApplication(positionId, {
        ...form,
        highest_qualification: form.highest_qualification.trim(),
        resume_url: resumeUrl
      });

      if (!submitRes.success) {
        throw new Error(submitRes.error || 'Failed to submit application.');
      }

      if (submitRes.candidateCode) {
        setSubmittedCode(submitRes.candidateCode);
      }
      setSuccess(true);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'An unexpected error occurred during submission.');
    } finally {
      setSubmitting(false);
      setUploadProgress('');
    }
  };

  if (loading) {
    return (
      <div className={theme} style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'var(--bg-primary, #f8fafc)',
        color: 'var(--text-primary, #0f172a)',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <Loader2 size={40} className="animate-spin" style={{ color: 'var(--accent-color, #3b82f6)', marginBottom: '1rem' }} />
        <p style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.95rem' }}>Loading job details...</p>
      </div>
    );
  }

  // Check if position is active (must be in S01 stage to accept applications)
  const isPositionActive = position && position.status === 'S01';

  if (errorMsg || !isPositionActive) {
    return (
      <div className={theme} style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'var(--bg-primary, #f8fafc)',
        color: 'var(--text-primary, #0f172a)',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '2rem',
        boxSizing: 'border-box'
      }}>
        <div style={{
          backgroundColor: 'var(--bg-surface, #ffffff)',
          border: '1px solid var(--border-light, #e2e8f0)',
          borderRadius: '16px',
          padding: '2.5rem',
          maxWidth: '480px',
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(0,0,0,0.06)'
        }}>
          <AlertTriangle size={48} style={{ color: '#f59e0b', margin: '0 auto 1.25rem' }} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-primary, #0f172a)' }}>Position Unavailable</h2>
          <p style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.95rem', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
            {errorMsg || 'This job position is no longer active or is not accepting applications at this time.'}
          </p>
          <a href="/" style={{
            display: 'inline-block',
            backgroundColor: 'var(--accent-color, #3b82f6)',
            color: 'white',
            textDecoration: 'none',
            padding: '0.65rem 1.5rem',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 600,
            boxShadow: '0 4px 15px rgba(59, 130, 246, 0.25)'
          }}>
            Return Home
          </a>
        </div>
      </div>
    );
  }

  const branchDisplay = position ? (
    formatBranchStandard({
      branch_code: position.branch_code,
      branch_name: position.branch_name,
      company: position.company
    }) || `${position.branch_code || 'TNT00001-B0001'} — ${position.branch_name || position.company || 'Headquarters'}`
  ) : '';

  return (
    <div className={theme} style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary, #f8fafc)',
      color: 'var(--text-primary, #0f172a)',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '2.5rem 1rem',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .apply-card {
          width: 100%;
          max-width: 680px;
          background-color: var(--bg-surface, #ffffff);
          border: 1px solid var(--border-light, #e2e8f0);
          border-radius: 20px;
          padding: 2.5rem;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.08);
          transition: all 0.3s ease;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .form-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary, #64748b);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .form-input {
          background-color: var(--bg-primary, #f8fafc);
          border: 1px solid var(--border-light, #cbd5e1);
          border-radius: 8px;
          padding: 0.65rem 0.85rem;
          color: var(--text-primary, #0f172a);
          font-size: 0.95rem;
          outline: none;
          transition: all 0.2s ease;
        }
        .form-input:focus {
          border-color: var(--accent-color, #3b82f6);
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
        }
        .form-input::placeholder {
          color: var(--text-secondary, #94a3b8);
          opacity: 0.7;
        }
        select.form-input {
          cursor: pointer;
        }
        select.form-input option {
          background-color: var(--bg-surface, #ffffff);
          color: var(--text-primary, #0f172a);
        }
        textarea.form-input {
          resize: vertical;
          min-height: 70px;
          font-family: inherit;
        }
        .btn-submit {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%) !important;
          color: #ffffff !important;
          border: none !important;
          border-radius: 10px !important;
          padding: 0.95rem 1.5rem !important;
          font-size: 1.02rem !important;
          font-weight: 700 !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 0.5rem !important;
          box-shadow: 0 4px 18px rgba(37, 99, 235, 0.4) !important;
          letter-spacing: 0.01em !important;
          width: 100% !important;
        }
        .btn-submit, .btn-submit *, .btn-submit span {
          color: #ffffff !important;
        }
        .btn-submit:hover:not(:disabled) {
          transform: translateY(-2px) !important;
          filter: brightness(1.1) !important;
          box-shadow: 0 6px 24px rgba(37, 99, 235, 0.5) !important;
        }
        .btn-submit:active:not(:disabled) {
          transform: translateY(0) scale(0.99) !important;
        }
        .btn-submit:disabled {
          opacity: 0.65 !important;
          cursor: not-allowed !important;
        }
        .jd-summary-box {
          background-color: var(--bg-primary, #f8fafc);
          border: 1px dashed var(--border-light, #cbd5e1);
          border-radius: 12px;
          padding: 1.25rem;
          margin-bottom: 1.75rem;
        }
      `}} />

      <div className="apply-card">
        {success ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ display: 'inline-flex', background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '50%', marginBottom: '1.5rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <CheckCircle2 size={48} style={{ color: '#10b981' }} />
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--text-primary, #0f172a)' }}>Application Submitted!</h2>
            <p style={{ color: 'var(--text-secondary, #64748b)', fontSize: '1rem', lineHeight: 1.6, maxWidth: '450px', margin: '0 auto 2rem' }}>
              Thank you for applying, <strong>{form.name}</strong>. Your details have been securely logged in our system. Our recruitment team will review your application for the <strong>{position.title}</strong> role and contact you shortly.
            </p>
            <div style={{
              padding: '1.25rem',
              backgroundColor: 'var(--bg-primary, #f8fafc)',
              border: '1px solid var(--border-light, #e2e8f0)',
              borderRadius: '12px',
              maxWidth: '420px',
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary, #64748b)' }}>
                Official Candidate Application ID
              </span>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.65rem',
                backgroundColor: 'var(--bg-surface, #ffffff)',
                border: '1.5px dashed var(--accent-color, #2563eb)',
                padding: '0.65rem 1rem',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '1.1rem',
                fontWeight: 800,
                color: 'var(--accent-color, #2563eb)',
                letterSpacing: '0.05em'
              }}>
                <span>{submittedCode || `POS-${positionId.substring(0, 8).toUpperCase()}`}</span>
                <button
                  type="button"
                  onClick={() => {
                    const textToCopy = submittedCode || `POS-${positionId.substring(0, 8).toUpperCase()}`;
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(textToCopy);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }
                  }}
                  title="Copy Candidate ID"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px',
                    color: copiedCode ? '#10b981' : 'var(--text-secondary, #64748b)'
                  }}
                >
                  {copiedCode ? <Check size={18} style={{ color: '#10b981' }} /> : <Copy size={18} />}
                </button>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)' }}>
                {copiedCode ? '✅ Copied to clipboard!' : 'Please save this ID for interview tracking & future communications.'}
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* 1. Branch Branding & Assigned Recruiter Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: '1.25rem',
              borderBottom: '1px solid var(--border-light, #e2e8f0)',
              marginBottom: '1.5rem',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              {/* Left: Branch Logo + Branch Standard Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: '240px' }}>
                {position.logo_url ? (
                  <img 
                    src={position.logo_url} 
                    alt={position.company || 'Company Logo'} 
                    style={{ height: '42px', width: 'auto', maxHeight: '42px', objectFit: 'contain' }}
                  />
                ) : (
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--accent-color, #3b82f6)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}>
                    <Building2 size={22} />
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', lineHeight: 1.3 }}>
                    {branchDisplay}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.15rem' }}>
                    {position.company || 'Enterprise Workspace'}
                  </div>
                </div>
              </div>

              {/* Right: Assigned Recruiter Name Badge */}
              {position.recruiter_assigned && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.4rem 0.85rem',
                  borderRadius: '20px',
                  backgroundColor: 'var(--bg-primary, #f8fafc)',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary, #475569)'
                }}>
                  <UserCheck size={15} style={{ color: 'var(--accent-color, #3b82f6)' }} />
                  <span>Recruiter: <strong style={{ color: 'var(--text-primary, #0f172a)' }}>{position.recruiter_assigned}</strong></span>
                </div>
              )}
            </div>

            {/* 2. Job Details Header */}
            <div style={{ paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <span style={{
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                color: 'var(--accent-color, #3b82f6)',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.25rem 0.75rem',
                borderRadius: '20px',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                display: 'inline-block',
                marginBottom: '0.65rem'
              }}>
                {position.department}
              </span>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--text-primary, #0f172a)', letterSpacing: '-0.02em' }}>
                Apply for {position.title}
              </h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.65rem', alignItems: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', backgroundColor: 'var(--bg-primary, #f8fafc)', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light, #e2e8f0)' }}>
                  <Briefcase size={13} /> {position.openings} {position.openings > 1 ? 'Openings' : 'Opening'}
                </span>
                {position.job_type && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', backgroundColor: 'var(--bg-primary, #f8fafc)', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light, #e2e8f0)' }}>
                    💼 {position.job_type}
                  </span>
                )}
                {position.experience_required && position.experience_required !== 'Any Experience' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', backgroundColor: 'var(--bg-primary, #f8fafc)', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light, #e2e8f0)' }}>
                    ⏳ Exp: {position.experience_required}
                  </span>
                )}
                {position.min_qualification && position.min_qualification !== 'Any / Uneducated' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', backgroundColor: 'var(--bg-primary, #f8fafc)', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light, #e2e8f0)' }}>
                    🎓 Min. Qual: {position.min_qualification}
                  </span>
                )}
                {position.work_mode && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', backgroundColor: 'var(--bg-primary, #f8fafc)', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light, #e2e8f0)' }}>
                    📍 {position.work_mode}
                  </span>
                )}
                {position.shift_type && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', backgroundColor: 'var(--bg-primary, #f8fafc)', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light, #e2e8f0)' }}>
                    🕒 Shift: {position.shift_type}
                  </span>
                )}
                {position.gender_preference && position.gender_preference !== 'No Preference (Any)' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', backgroundColor: 'var(--bg-primary, #f8fafc)', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light, #e2e8f0)' }}>
                    🚻 {position.gender_preference}
                  </span>
                )}
              </div>
              {position.key_skills && (
                <div style={{ marginTop: '0.6rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)' }}>Key Skills:</span>
                  {position.key_skills.split(',').map((skill, sIdx) => {
                    const sk = skill.trim();
                    if (!sk) return null;
                    return (
                      <span key={sIdx} style={{ fontSize: '0.72rem', backgroundColor: 'rgba(59, 130, 246, 0.08)', color: 'var(--accent-color, #2563eb)', padding: '0.15rem 0.5rem', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)', fontWeight: 600 }}>
                        {sk}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. JD summary */}
            {position.jd_text && (
              <div className="jd-summary-box">
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', margin: '0 0 0.5rem 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Job Description Summary</h4>
                <p style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.85rem', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {position.jd_text}
                </p>
              </div>
            )}

            {/* 4. Application Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Row 1: Full Name */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <User size={13} /> Full Name *
                </label>
                <input 
                  required
                  type="text" 
                  name="name" 
                  value={form.name} 
                  onChange={handleInputChange} 
                  placeholder="Enter your full name" 
                  className="form-input" 
                  disabled={submitting}
                />
              </div>

              {/* Row 2: Email & Contact Mobile Number */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Mail size={13} /> Email Address *
                  </label>
                  <input 
                    required
                    type="email" 
                    name="email" 
                    value={form.email} 
                    onChange={handleInputChange} 
                    placeholder="name@example.com" 
                    className="form-input" 
                    disabled={submitting}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Phone size={13} /> Contact Mobile Number *
                  </label>
                  <input 
                    required
                    type="tel" 
                    name="phone" 
                    value={form.phone} 
                    onChange={handleInputChange} 
                    placeholder="10-digit mobile number" 
                    maxLength={10}
                    minLength={10}
                    pattern="[0-9]{10}"
                    inputMode="numeric"
                    className="form-input" 
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* Row 3: Alternate Mobile & Current City */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Phone size={13} /> Alternate Mobile Number (Optional)
                  </label>
                  <input 
                    type="tel" 
                    name="alternate_phone" 
                    value={form.alternate_phone} 
                    onChange={handleInputChange} 
                    placeholder="10-digit alternate mobile number" 
                    maxLength={10}
                    minLength={10}
                    pattern="[0-9]{10}"
                    inputMode="numeric"
                    className="form-input" 
                    disabled={submitting}
                  />
                </div>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <MapPin size={13} /> Current City / Location *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      required
                      type="text" 
                      name="current_city" 
                      value={form.current_city} 
                      onChange={(e) => {
                        handleInputChange(e);
                        setShowCityDropdown(true);
                      }}
                      onFocus={() => {
                        if (form.current_city) setShowCityDropdown(true);
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowCityDropdown(false), 250);
                      }}
                      autoComplete="off"
                      placeholder="Type city (e.g. Ludhiana, Raian, Chandigarh...)" 
                      className="form-input" 
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      disabled={submitting}
                    />

                    {/* Auto-suggest dropdown popup */}
                    {showCityDropdown && filteredCities.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        right: 0,
                        zIndex: 100,
                        backgroundColor: 'var(--bg-surface, #ffffff)',
                        border: '1px solid var(--border-light, #cbd5e1)',
                        borderRadius: '10px',
                        boxShadow: '0 12px 28px rgba(0,0,0,0.15)',
                        maxHeight: '220px',
                        overflowY: 'auto'
                      }}>
                        {filteredCities.map((city) => (
                          <div 
                            key={city}
                            onMouseDown={() => {
                              setForm(prev => ({ ...prev, current_city: city }));
                              setShowCityDropdown(false);
                            }}
                            style={{
                              padding: '0.6rem 0.85rem',
                              cursor: 'pointer',
                              fontSize: '0.88rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              borderBottom: '1px solid var(--border-light, #f1f5f9)',
                              color: 'var(--text-primary, #0f172a)',
                              transition: 'background-color 0.15s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary, #f8fafc)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <MapPin size={13} style={{ color: 'var(--accent-color, #2563eb)', flexShrink: 0 }} />
                            <span>{city}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 4: Total Experience & Notice Period */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Briefcase size={13} /> Total Experience *
                  </label>
                  <select 
                    required
                    name="total_experience" 
                    value={form.total_experience} 
                    onChange={handleInputChange} 
                    className="form-input" 
                    disabled={submitting}
                  >
                    <option value="">Select Total Experience *</option>
                    <option value="Fresher (No Experience)">Fresher (No Experience)</option>
                    <option value="Less than 1 Year">Less than 1 Year</option>
                    <option value="1 - 2 Years">1 - 2 Years</option>
                    <option value="2 - 3 Years">2 - 3 Years</option>
                    <option value="3 - 5 Years">3 - 5 Years</option>
                    <option value="5 - 7 Years">5 - 7 Years</option>
                    <option value="7 - 10 Years">7 - 10 Years</option>
                    <option value="10+ Years">10+ Years</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Clock size={13} /> Notice Period / Availability *
                  </label>
                  <select 
                    required
                    name="notice_period" 
                    value={form.notice_period} 
                    onChange={handleInputChange} 
                    className="form-input" 
                    disabled={submitting}
                  >
                    <option value="">Select Notice Period *</option>
                    <option value="Immediate Joiner (Available Now)">Immediate Joiner (Available Now)</option>
                    <option value="7 Days">7 Days</option>
                    <option value="15 Days">15 Days</option>
                    <option value="30 Days (1 Month)">30 Days (1 Month)</option>
                    <option value="45 Days">45 Days</option>
                    <option value="60 Days (2 Months)">60 Days (2 Months)</option>
                    <option value="90 Days (3 Months)">90 Days (3 Months)</option>
                    <option value="Serving Notice Period">Serving Notice Period</option>
                  </select>
                </div>
              </div>

              {/* Row 5: Highest Qualification */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <GraduationCap size={13} /> Highest Qualification *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      required
                      type="text" 
                      name="highest_qualification" 
                      value={form.highest_qualification} 
                      onChange={(e) => {
                        handleInputChange(e);
                        setShowQualDropdown(true);
                      }}
                      onFocus={() => {
                        setShowQualDropdown(true);
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowQualDropdown(false), 250);
                      }}
                      autoComplete="off"
                      placeholder="Select or type qualification (e.g. Class 8, ITI, B.Tech...)" 
                      className="form-input" 
                      style={{ width: '100%', boxSizing: 'border-box', paddingRight: '2rem' }}
                      disabled={submitting}
                    />
                    <div
                      role="button"
                      tabIndex={-1}
                      onClick={() => setShowQualDropdown(prev => !prev)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-secondary, #64748b)'
                      }}
                    >
                      <ChevronDown size={16} />
                    </div>

                    {/* Grouped Searchable Dropdown Popup */}
                    {showQualDropdown && (
                      <div style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        right: 0,
                        zIndex: 100,
                        backgroundColor: 'var(--bg-surface, #ffffff)',
                        border: '1px solid var(--border-light, #cbd5e1)',
                        borderRadius: '10px',
                        boxShadow: '0 12px 28px rgba(0,0,0,0.15)',
                        maxHeight: '260px',
                        overflowY: 'auto'
                      }}>
                        {filteredQualifications.length === 0 ? (
                          <div style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic' }}>
                            Custom: "{form.highest_qualification}" (Click away or press Tab to keep this)
                          </div>
                        ) : (
                          filteredQualifications.map((cat) => (
                            <div key={cat.category}>
                              <div style={{
                                padding: '0.45rem 0.85rem',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                color: 'var(--accent-color, #2563eb)',
                                backgroundColor: 'var(--bg-primary, #f8fafc)',
                                borderBottom: '1px solid var(--border-light, #f1f5f9)'
                              }}>
                                {cat.category}
                              </div>
                              {cat.options.map((opt) => (
                                <div
                                  key={opt}
                                  onMouseDown={() => {
                                    setForm(prev => ({ ...prev, highest_qualification: opt }));
                                    setShowQualDropdown(false);
                                  }}
                                  style={{
                                    padding: '0.55rem 0.85rem',
                                    cursor: 'pointer',
                                    fontSize: '0.86rem',
                                    color: form.highest_qualification === opt ? 'var(--accent-color, #2563eb)' : 'var(--text-primary, #0f172a)',
                                    fontWeight: form.highest_qualification === opt ? 700 : 500,
                                    borderBottom: '1px solid var(--border-light, #f8fafc)',
                                    transition: 'background-color 0.15s ease'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary, #f1f5f9)'}
                                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                  {opt}
                                </div>
                              ))}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 5: Current & Expected Salary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <DollarSign size={13} /> Current Salary (₹/month)
                  </label>
                  <input 
                    type="number" 
                    name="current_salary" 
                    value={form.current_salary} 
                    onChange={handleInputChange} 
                    placeholder="e.g. 25000 (optional)" 
                    className="form-input" 
                    disabled={submitting}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <DollarSign size={13} /> Exp. Salary Min (₹/month)
                  </label>
                  <input 
                    type="number" 
                    name="expected_salary_min" 
                    value={form.expected_salary_min} 
                    onChange={handleInputChange} 
                    placeholder="Min salary (optional)" 
                    className="form-input" 
                    disabled={submitting}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <DollarSign size={13} /> Exp. Salary Max (₹/month)
                  </label>
                  <input 
                    type="number" 
                    name="expected_salary_max" 
                    value={form.expected_salary_max} 
                    onChange={handleInputChange} 
                    placeholder="Max salary (optional)" 
                    className="form-input" 
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* Row 6: Resume Upload */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <FileText size={13} /> Resume / CV (Optional)
                </label>
                <div style={{
                  border: '2px dashed var(--border-light, #cbd5e1)',
                  borderRadius: '10px',
                  padding: '1.5rem',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-primary, #f8fafc)',
                  cursor: 'pointer',
                  position: 'relative'
                }}>
                  <input 
                    type="file" 
                    accept=".pdf,.doc,.docx,.txt" 
                    onChange={handleFileChange}
                    style={{
                      position: 'absolute',
                      top: 0, left: 0, right: 0, bottom: 0,
                      opacity: 0, cursor: 'pointer', width: '100%', height: '100%'
                    }}
                    disabled={submitting}
                  />
                  <div style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.85rem' }}>
                    {resumeName ? (
                      <span style={{ fontWeight: 600, color: 'var(--accent-color, #3b82f6)' }}>📄 {resumeName}</span>
                    ) : (
                      <span>Drag and drop your file here or <span style={{ color: 'var(--accent-color, #3b82f6)', fontWeight: 600 }}>Browse</span><br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Supported formats: PDF, DOC, DOCX, TXT (Max 200 KB)</span></span>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 7: Brief Remarks / Cover Note */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <AlignLeft size={13} /> Key Skills & Remarks (Optional)
                </label>
                <textarea 
                  name="cover_note" 
                  rows={3}
                  value={form.cover_note} 
                  onChange={handleInputChange} 
                  placeholder="Share any key skills, strengths, achievements, or notes for the recruiter..." 
                  className="form-input" 
                  disabled={submitting}
                />
              </div>

              {/* Submit Button */}
              <button type="submit" className="btn-submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" style={{ color: '#ffffff !important' }} />
                    <span style={{ color: '#ffffff !important', fontWeight: 700, fontSize: '1rem' }}>
                      {uploadProgress || 'Submitting Application...'}
                    </span>
                  </>
                ) : (
                  <span style={{ color: '#ffffff !important', fontWeight: 700, fontSize: '1rem' }}>
                    Submit Application
                  </span>
                )}
              </button>

              {errorMsg && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#dc2626',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '0.5rem'
                }}>
                  <AlertTriangle size={16} />
                  <span>{errorMsg}</span>
                </div>
              )}

            </form>
          </>
        )}
      </div>
    </div>
  );
}
