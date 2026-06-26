'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getPositionDetails, uploadResumeToServer, submitApplication } from '../../actions/recruitment';
import { Briefcase, User, Mail, Phone, DollarSign, FileText, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

export default function PublicApplyPage() {
  const params = useParams();
  const positionId = params?.id;

  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [success, setSuccess] = useState(false);

  // Form State
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    expected_salary_min: '',
    expected_salary_max: ''
  });
  
  // File State
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeName, setResumeName] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');

  useEffect(() => {
    if (!positionId) return;

    const fetchPosition = async () => {
      try {
        const data = await getPositionDetails(positionId);
        if (data) {
          setPosition(data);
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
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds the 10MB limit.');
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
        // Strip out the metadata prefix (e.g. "data:application/pdf;base64,")
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.phone) {
      alert('Please fill out all required fields.');
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
        resume_url: resumeUrl
      });

      if (!submitRes.success) {
        throw new Error(submitRes.error || 'Failed to submit application.');
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
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#090d16',
        color: '#f8fafc',
        fontFamily: 'Inter, sans-serif'
      }}>
        <Loader2 size={40} className="animate-spin" style={{ color: '#3b82f6', marginBottom: '1rem' }} />
        <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Loading job details...</p>
      </div>
    );
  }

  // Check if position is active (must be in S01 stage to accept applications)
  const isPositionActive = position && position.status === 'S01';

  if (errorMsg || !isPositionActive) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#090d16',
        color: '#f8fafc',
        fontFamily: 'Inter, sans-serif',
        padding: '2rem',
        boxSizing: 'border-box'
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '2.5rem',
          maxWidth: '480px',
          textAlign: 'center',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
        }}>
          <AlertTriangle size={48} style={{ color: '#f59e0b', margin: '0 auto 1.25rem' }} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem', color: '#f1f5f9' }}>Position Unavailable</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
            {errorMsg || 'This job position is no longer active or is not accepting applications at this time.'}
          </p>
          <a href="/" style={{
            display: 'inline-block',
            background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
            color: 'white',
            textDecoration: 'none',
            padding: '0.65rem 1.5rem',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 600,
            boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)'
          }}>
            Return Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, #0f172a 0%, #030712 100%)',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '3rem 1.5rem',
      boxSizing: 'border-box',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .apply-card {
          width: 100%;
          max-width: 650px;
          background: rgba(17, 24, 39, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 2.5rem;
          backdrop-filter: blur(16px);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
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
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .form-input {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 0.65rem 0.85rem;
          color: #f1f5f9;
          font-size: 0.95rem;
          outline: none;
          transition: all 0.2s ease;
        }
        .form-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
          background: rgba(15, 23, 42, 0.8);
        }
        .form-input::placeholder {
          color: #475569;
        }
        .btn-submit {
          background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 0.85rem;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          box-shadow: 0 4px 15px rgba(59, 130, 246, 0.35);
        }
        .btn-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(59, 130, 246, 0.45);
        }
        .btn-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .jd-summary-box {
          background: rgba(255,255,255,0.02);
          border: 1px dashed rgba(255,255,255,0.1);
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
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.75rem', color: '#f1f5f9' }}>Application Submitted!</h2>
            <p style={{ color: '#a3a3a3', fontSize: '1rem', lineHeight: 1.6, maxWidth: '450px', margin: '0 auto 2rem' }}>
              Thank you for applying, <strong>{form.name}</strong>. Your details have been securely logged in our system. Our recruitment team will review your application for the <strong>{position.title}</strong> role and contact you shortly.
            </p>
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', fontSize: '0.85rem', color: '#737373', maxWidth: '350px', margin: '0 auto' }}>
              Application reference: {positionId.substring(0, 8)}-{Date.now().toString().slice(-4)}
            </div>
          </div>
        ) : (
          <>
            {/* Job Details Header */}
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1.5rem', marginBottom: '1.75rem' }}>
              <span style={{
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.25rem 0.75rem',
                borderRadius: '20px',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                display: 'inline-block',
                marginBottom: '0.75rem'
              }}>
                {position.department}
              </span>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 800, margin: 0, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                Apply for {position.title}
              </h1>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0.4rem 0 0 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Briefcase size={14} /> Openings: {position.openings} positions
              </p>
            </div>

            {/* JD summary */}
            {position.jd_text && (
              <div className="jd-summary-box">
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9', margin: '0 0 0.5rem 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Job Description Summary</h4>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {position.jd_text}
                </p>
              </div>
            )}

            {/* Application Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><User size={13} /> Full Name *</label>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Mail size={13} /> Email Address *</label>
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
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Phone size={13} /> Phone Number *</label>
                  <input 
                    required
                    type="tel" 
                    name="phone" 
                    value={form.phone} 
                    onChange={handleInputChange} 
                    placeholder="Phone number" 
                    className="form-input" 
                    disabled={submitting}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><DollarSign size={13} /> Exp. Salary Min (₹/month)</label>
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
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><DollarSign size={13} /> Exp. Salary Max (₹/month)</label>
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

              {/* File Upload */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><FileText size={13} /> Resume / CV *</label>
                <div style={{
                  border: '2px dashed rgba(255,255,255,0.1)',
                  borderRadius: '10px',
                  padding: '1.5rem',
                  textAlign: 'center',
                  background: 'rgba(255,255,255,0.01)',
                  cursor: 'pointer',
                  position: 'relative'
                }}>
                  <input 
                    required
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
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                    {resumeName ? (
                      <span style={{ fontWeight: 600, color: '#38bdf8' }}>📄 {resumeName}</span>
                    ) : (
                      <span>Drag and drop your file here or <span style={{ color: '#3b82f6', fontWeight: 600 }}>Browse</span><br/><span style={{ fontSize: '0.75rem', color: '#475569' }}>Supported formats: PDF, DOC, DOCX, TXT (Max 10MB)</span></span>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <button type="submit" className="btn-submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>{uploadProgress || 'Submitting...'}</span>
                  </>
                ) : (
                  <span>Submit Application</span>
                )}
              </button>

              {errorMsg && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
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
