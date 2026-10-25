'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Upload, Building2, MapPin, FileText, Save, Plus, Search,
  Edit3, Trash2, Phone, Mail, User, ShieldCheck, CheckCircle2,
  AlertCircle, X, Compass, Globe, Briefcase, Factory, Warehouse, Building
} from 'lucide-react';
import { logAuditAction } from '@/app/actions/audit';
import { getTenantBranches, saveTenantBranch, deleteTenantBranch } from '@/app/actions/tenantBranches';

const LOCATION_TYPES = [
  { id: 'Headquarters', label: 'Headquarters / Main Office', icon: Building },
  { id: 'Branch Office', label: 'Branch Office / Regional Hub', icon: Briefcase },
  { id: 'Factory / Plant', label: 'Factory / Manufacturing Plant', icon: Factory },
  { id: 'Warehouse / Godown', label: 'Warehouse / Distribution Center', icon: Warehouse },
  { id: 'Sales Territory', label: 'Sales Office / Territory Hub', icon: Compass }
];

export default function BusinessProfile({ userCompany = '' }) {
  const effectiveCompany = userCompany || 'Swan Hosting';
  const [subTab, setSubTab] = useState('profile'); // 'profile' | 'branches'
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  // --- TAB 1: Company Profile State ---
  const [formData, setFormData] = useState({
    companyName: effectiveCompany,
    address: '123 Tech Park, Cyber City',
    gstin: '27AADCB2230M1Z2',
    phone: '',
    email: '',
    website: ''
  });

  // Load saved company profile from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`crm_business_profile_${effectiveCompany}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setFormData(prev => ({ ...prev, ...parsed }));
      }
    } catch (_) {}
  }, [effectiveCompany]);

  const handleSaveProfile = () => {
    setLoading(true);
    try {
      localStorage.setItem(`crm_business_profile_${effectiveCompany}`, JSON.stringify(formData));
      logAuditAction('Update Business Profile', `Updated business profile: ${formData.companyName}`);
      setSaveMessage('Business Profile details saved successfully!');
      setTimeout(() => setSaveMessage(null), 3500);
    } catch (e) {
      console.error('Audit Log failed', e);
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };

  // --- TAB 2: Multi-Branch Management State ---
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchSearch, setBranchSearch] = useState('');
  const [branchTypeFilter, setBranchTypeFilter] = useState('ALL');

  // Branch Modal State
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [savingBranch, setSavingBranch] = useState(false);
  const [branchModalError, setBranchModalError] = useState(null);

  const [branchFormData, setBranchFormData] = useState({
    branchName: '',
    branchCode: '',
    locationType: 'Branch Office',
    address: '',
    city: '',
    state: '',
    pincode: '',
    gstin: '',
    phone: '',
    email: '',
    inchargeName: '',
    radiusMeters: 200,
    isActive: true
  });

  // Load branches
  const loadBranches = async () => {
    setLoadingBranches(true);
    try {
      const res = await getTenantBranches(effectiveCompany);
      if (res.success) {
        setBranches(res.branches || []);
      }
    } catch (err) {
      console.error('Error loading branches:', err);
    } finally {
      setLoadingBranches(false);
    }
  };

  useEffect(() => {
    if (subTab === 'branches') {
      loadBranches();
    }
  }, [subTab, effectiveCompany]);

  const handleOpenAddBranch = () => {
    setEditingBranch(null);
    setBranchFormData({
      branchName: '',
      branchCode: '',
      locationType: 'Branch Office',
      address: '',
      city: '',
      state: '',
      pincode: '',
      gstin: '',
      phone: '',
      email: '',
      inchargeName: '',
      radiusMeters: 200,
      isActive: true
    });
    setBranchModalError(null);
    setShowBranchModal(true);
  };

  const handleOpenEditBranch = (br) => {
    setEditingBranch(br);
    setBranchFormData({
      branchName: br.branch_name || '',
      branchCode: br.branch_code || '',
      locationType: br.location_type || 'Branch Office',
      address: br.address || '',
      city: br.city || '',
      state: br.state || '',
      pincode: br.pincode || '',
      gstin: br.gstin || '',
      phone: br.phone || '',
      email: br.email || '',
      inchargeName: br.incharge_name || '',
      radiusMeters: br.radius_meters || 200,
      isActive: br.is_active !== false
    });
    setBranchModalError(null);
    setShowBranchModal(true);
  };

  const handleSaveBranch = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!branchFormData.branchName.trim()) {
      setBranchModalError('Branch Name is required!');
      return;
    }

    setSavingBranch(true);
    setBranchModalError(null);

    try {
      const res = await saveTenantBranch({
        id: editingBranch?.id || null,
        company: effectiveCompany,
        branchName: branchFormData.branchName,
        branchCode: branchFormData.branchCode,
        locationType: branchFormData.locationType,
        address: branchFormData.address,
        city: branchFormData.city,
        state: branchFormData.state,
        pincode: branchFormData.pincode,
        gstin: branchFormData.gstin,
        phone: branchFormData.phone,
        email: branchFormData.email,
        inchargeName: branchFormData.inchargeName,
        radiusMeters: branchFormData.radiusMeters,
        isActive: branchFormData.isActive
      });

      if (res.success) {
        setShowBranchModal(false);
        await loadBranches();
      } else {
        setBranchModalError(res.error || 'Failed to save branch.');
      }
    } catch (err) {
      setBranchModalError(err.message || 'An error occurred.');
    } finally {
      setSavingBranch(false);
    }
  };

  const handleDeleteBranch = async (branchId, branchName) => {
    if (!window.confirm(`Are you sure you want to remove branch "${branchName}"?`)) {
      return;
    }
    try {
      const res = await deleteTenantBranch(branchId, effectiveCompany);
      if (res.success) {
        await loadBranches();
      }
    } catch (err) {
      console.error('Delete branch error:', err);
    }
  };

  const filteredBranches = useMemo(() => {
    return branches.filter(b => {
      const matchesSearch = !branchSearch ||
        (b.branch_name && b.branch_name.toLowerCase().includes(branchSearch.toLowerCase())) ||
        (b.branch_code && b.branch_code.toLowerCase().includes(branchSearch.toLowerCase())) ||
        (b.city && b.city.toLowerCase().includes(branchSearch.toLowerCase())) ||
        (b.incharge_name && b.incharge_name.toLowerCase().includes(branchSearch.toLowerCase()));

      const matchesType = branchTypeFilter === 'ALL' || b.location_type === branchTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [branches, branchSearch, branchTypeFilter]);

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.4rem' }}>
          <Building2 size={24} color="var(--accent-color)" />
          Business Profile & Branch Locations
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.86rem' }}>
          Manage your parent organization branding, legal details, and multi-location branch offices / plants.
        </p>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        borderBottom: '2px solid var(--border-light)',
        marginBottom: '1.5rem',
        paddingBottom: '2px'
      }}>
        <button
          type="button"
          onClick={() => setSubTab('profile')}
          style={{
            padding: '0.65rem 1.25rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: subTab === 'profile' ? 700 : 500,
            color: subTab === 'profile' ? 'var(--accent-color)' : 'var(--text-secondary)',
            borderBottom: subTab === 'profile' ? '3px solid var(--accent-color)' : '3px solid transparent',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '-4px'
          }}
        >
          <Building size={16} />
          Head Office & Branding
        </button>

        <button
          type="button"
          onClick={() => setSubTab('branches')}
          style={{
            padding: '0.65rem 1.25rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: subTab === 'branches' ? 700 : 500,
            color: subTab === 'branches' ? 'var(--accent-color)' : 'var(--text-secondary)',
            borderBottom: subTab === 'branches' ? '3px solid var(--accent-color)' : '3px solid transparent',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '-4px'
          }}
        >
          <MapPin size={16} />
          Branch Offices & Plants
          {branches.length > 0 && (
            <span style={{
              background: subTab === 'branches' ? 'var(--accent-color)' : '#e2e8f0',
              color: subTab === 'branches' ? '#fff' : '#475569',
              padding: '1px 7px',
              borderRadius: '10px',
              fontSize: '0.72rem',
              fontWeight: 800
            }}>
              {branches.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: HEAD OFFICE & BRANDING */}
      {subTab === 'profile' && (
        <div style={{ display: 'flex', gap: '1.5rem', flexDirection: 'column' }}>
          {saveMessage && (
            <div style={{ padding: '0.75rem 1rem', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '8px', color: '#166534', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} />
              {saveMessage}
            </div>
          )}

          {/* Logo Upload Section */}
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>
              Company Logo & Branding
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
              <div style={{ width: '90px', height: '90px', borderRadius: '50%', background: 'var(--th-filtered-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)', fontSize: '2rem', fontWeight: 'bold' }}>
                {formData.companyName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.85rem', maxWidth: '380px' }}>
                  This logo is displayed on the login screen, top navigation bar, and generated proforma/tax invoices. Recommended size: 256x256px.
                </p>
                <button
                  type="button"
                  style={{ padding: '0.55rem 1.15rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.82rem' }}
                >
                  <Upload size={14} />
                  Upload New Logo
                </button>
              </div>
            </div>
          </div>

          {/* Company Details Section */}
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '1.25rem' }}>
              Headquarters Legal & Tax Details
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  Company Legal Entity Name
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                    <Building2 size={16} />
                  </div>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 1rem 0.65rem 2.5rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  Registered Head Office Address
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }}>
                    <MapPin size={16} />
                  </div>
                  <textarea
                    rows={3}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 1rem 0.65rem 2.5rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.88rem', resize: 'vertical' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                    Head Office GSTIN / Tax ID
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                      <FileText size={16} />
                    </div>
                    <input
                      type="text"
                      value={formData.gstin}
                      onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                      style={{ width: '100%', padding: '0.65rem 1rem 0.65rem 2.5rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.88rem', textTransform: 'uppercase' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                    Corporate Website
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                      <Globe size={16} />
                    </div>
                    <input
                      type="text"
                      placeholder="https://example.com"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      style={{ width: '100%', padding: '0.65rem 1rem 0.65rem 2.5rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              onClick={handleSaveProfile}
              disabled={loading}
              style={{
                padding: '0.65rem 1.85rem', background: 'var(--accent-color)', color: 'white',
                border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                opacity: loading ? 0.7 : 1
              }}
            >
              <Save size={16} />
              {loading ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: BRANCH OFFICES & PLANTS */}
      {subTab === 'branches' && (
        <div>
          {/* Top Control Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: '260px' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search branch name, code, city..."
                  value={branchSearch}
                  onChange={(e) => setBranchSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem 0.5rem 2rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-surface)',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              <select
                value={branchTypeFilter}
                onChange={(e) => setBranchTypeFilter(e.target.value)}
                style={{
                  padding: '0.5rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-surface)',
                  fontSize: '0.82rem',
                  fontWeight: 600
                }}
              >
                <option value="ALL">All Types</option>
                {LOCATION_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleOpenAddBranch}
              style={{
                padding: '0.55rem 1.15rem',
                borderRadius: '6px',
                border: 'none',
                background: 'var(--accent-color)',
                color: '#fff',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Plus size={16} />
              Add New Branch
            </button>
          </div>

          {/* Branch Grid */}
          {loadingBranches ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
              Loading branches...
            </div>
          ) : filteredBranches.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px dashed var(--border-light)' }}>
              <MapPin size={36} color="#94a3b8" style={{ marginBottom: '0.5rem' }} />
              <h4 style={{ margin: '0 0 0.35rem 0', color: 'var(--text-primary)' }}>No branches found</h4>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Click "+ Add New Branch" to create branch offices, factories, or warehouses for {effectiveCompany}.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
              {filteredBranches.map((br) => {
                const IconComp = LOCATION_TYPES.find(t => t.id === br.location_type)?.icon || Building;
                return (
                  <div
                    key={br.id || br.branch_code}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '10px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                      transition: 'border-color 0.15s ease'
                    }}
                  >
                    <div>
                      {/* Top Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <IconComp size={16} color="var(--accent-color)" />
                            <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {br.branch_name}
                            </h4>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.25rem' }}>
                            <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>
                              Branch ID:
                            </span>
                            <span style={{ fontSize: '0.74rem', background: '#e0e7ff', color: '#3730a3', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.5px', border: '1px solid #c7d2fe' }}>
                              {br.branch_code || br.id}
                            </span>
                          </div>
                        </div>

                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: br.location_type === 'Headquarters' ? '#dbeafe' : '#f1f5f9',
                          color: br.location_type === 'Headquarters' ? '#1e40af' : '#475569'
                        }}>
                          {br.location_type}
                        </span>
                      </div>

                      {/* Details */}
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.4rem', margin: '0.65rem 0' }}>
                        {br.address && (
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                            <MapPin size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>{br.address}{br.city ? `, ${br.city}` : ''}{br.state ? `, ${br.state}` : ''}{br.pincode ? ` - ${br.pincode}` : ''}</span>
                          </div>
                        )}

                        {br.gstin && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FileText size={13} />
                            <span>GSTIN: <strong>{br.gstin}</strong></span>
                          </div>
                        )}

                        {br.incharge_name && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <User size={13} />
                            <span>Incharge: <strong>{br.incharge_name}</strong></span>
                          </div>
                        )}

                        {br.phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Phone size={13} />
                            <span>{br.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEditBranch(br)}
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: '5px',
                          border: '1px solid var(--border-light)',
                          background: 'none',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Edit3 size={12} /> Edit
                      </button>

                      {br.location_type !== 'Headquarters' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteBranch(br.id, br.branch_name)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '5px',
                            border: '1px solid #fecaca',
                            background: '#fef2f2',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#b91c1c',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD / EDIT BRANCH */}
      {showBranchModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '1rem'
        }}>
          <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={20} color="var(--accent-color)" />
                {editingBranch ? 'Edit Branch Location' : 'Add New Branch / Plant Location'}
              </h3>
              <button
                type="button"
                onClick={() => setShowBranchModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
              >
                <X size={18} />
              </button>
            </div>

            {branchModalError && (
              <div style={{ padding: '0.65rem 0.85rem', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#991b1b', fontSize: '0.8rem', marginBottom: '1rem' }}>
                {branchModalError}
              </div>
            )}

            <form onSubmit={handleSaveBranch} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                    Branch / Location Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={branchFormData.branchName}
                    onChange={(e) => setBranchFormData({ ...branchFormData, branchName: e.target.value })}
                    placeholder="e.g. Mumbai Regional Office"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                    Branch Code
                  </label>
                  <input
                    type="text"
                    value={branchFormData.branchCode}
                    onChange={(e) => setBranchFormData({ ...branchFormData, branchCode: e.target.value })}
                    placeholder="e.g. BR-MUM-01"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', textTransform: 'uppercase' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Location Type
                </label>
                <select
                  value={branchFormData.locationType}
                  onChange={(e) => setBranchFormData({ ...branchFormData, locationType: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                >
                  {LOCATION_TYPES.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Street Address
                </label>
                <textarea
                  rows={2}
                  value={branchFormData.address}
                  onChange={(e) => setBranchFormData({ ...branchFormData, address: e.target.value })}
                  placeholder="Plot/Office #, Industrial Area, Landmark"
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                    City
                  </label>
                  <input
                    type="text"
                    value={branchFormData.city}
                    onChange={(e) => setBranchFormData({ ...branchFormData, city: e.target.value })}
                    placeholder="Mumbai"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                    State
                  </label>
                  <input
                    type="text"
                    value={branchFormData.state}
                    onChange={(e) => setBranchFormData({ ...branchFormData, state: e.target.value })}
                    placeholder="Maharashtra"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                    PIN Code
                  </label>
                  <input
                    type="text"
                    value={branchFormData.pincode}
                    onChange={(e) => setBranchFormData({ ...branchFormData, pincode: e.target.value })}
                    placeholder="400001"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                    Branch Specific GSTIN (Optional)
                  </label>
                  <input
                    type="text"
                    value={branchFormData.gstin}
                    onChange={(e) => setBranchFormData({ ...branchFormData, gstin: e.target.value })}
                    placeholder="27AABCU9603R1ZM"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', textTransform: 'uppercase' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                    Branch Incharge / Manager
                  </label>
                  <input
                    type="text"
                    value={branchFormData.inchargeName}
                    onChange={(e) => setBranchFormData({ ...branchFormData, inchargeName: e.target.value })}
                    placeholder="e.g. Ramesh Patil"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                    Phone / Mobile
                  </label>
                  <input
                    type="text"
                    value={branchFormData.phone}
                    onChange={(e) => setBranchFormData({ ...branchFormData, phone: e.target.value })}
                    placeholder="+91 98200XXXXX"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                    Branch Email
                  </label>
                  <input
                    type="email"
                    value={branchFormData.email}
                    onChange={(e) => setBranchFormData({ ...branchFormData, email: e.target.value })}
                    placeholder="mumbai@example.com"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowBranchModal(false)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'none', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBranch}
                  style={{
                    padding: '0.55rem 1.35rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--accent-color)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: savingBranch ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Save size={15} />
                  {savingBranch ? 'Saving...' : (editingBranch ? 'Update Branch' : 'Create Branch')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
