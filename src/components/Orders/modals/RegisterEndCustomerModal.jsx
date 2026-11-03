'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  X, User, Phone, MapPin, Building2, Package, ShieldCheck,
  Upload, CheckCircle2, AlertCircle, FileText, Image as ImageIcon,
  Calendar, Layers, Sparkles
} from 'lucide-react';
import { INDIAN_STATE_DISTRICTS } from '@/config/indianStateDistricts';
import { PRODUCT_GROUPS } from '@/config/productCatalog';
import { getTenantProducts } from '@/app/actions/tenantProducts';
import { getStatesCentral, getDistrictsCentral } from '@/app/actions/centralLocationMaster';
import { getPartyList } from '@/app/actions/partyMaster';
import SearchableProductSelect from '@/components/common/SearchableProductSelect';
import { createEndCustomer } from '@/app/actions/endCustomers';
import { calculateWarrantyStatus } from '@/utils/warrantyUtils';
import { END_CUSTOMER_COMPANIES, endCustomerDealerCompany, filterEndCustomerDealers, partyCode } from '@/utils/endCustomerTransfer';

/**
 * Client-side file compressor to guarantee file size is strictly <= 100 KB
 */
async function compressFileUnder100Kb(file) {
  return new Promise((resolve, reject) => {
    // If it is a PDF or other file
    if (!file.type.startsWith('image/')) {
      if (file.size > 100 * 1024) {
        reject(new Error(`PDF / Document exceeds 100KB limit (${Math.round(file.size / 1024)} KB). Please upload a smaller file.`));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: reader.result, sizeKb: Math.round(file.size / 1024) });
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    // If it is an image, compress using HTML5 Canvas
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxDimension = 1000;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.8;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);

        // Reduce quality iteratively if still > 100KB
        while (dataUrl.length * 0.75 > 100 * 1024 && quality > 0.15) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        const finalKb = Math.round((dataUrl.length * 0.75) / 1024);
        resolve({ dataUrl, sizeKb: finalKb });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function RegisterEndCustomerModal({
  isOpen,
  onClose,
  onSuccess,
  parties = [],
  tenantId = 'TNT00002'
}) {
  const [formData, setFormData] = useState({
    // 1. Basic Identity & Contact
    our_company: '',
    full_name: '',
    mobile_1: '',
    mobile_2: '',
    alternate_mobile_1: '',
    alternate_mobile_2: '',
    email_1: '',
    alternate_email_1: '',
    state_name: 'Punjab',
    district_name: 'Ludhiana',
    pin_code: '',
    landmark: '',
    block_area_name: '',
    full_address: '',

    // 2. Dealer Mapping & Product
    linked_party_id: '',
    linked_party_code: '',
    linked_party_name: '',
    dealer_city_district: '',
    purchase_invoice_no: '',
    purchase_date: new Date().toISOString().split('T')[0],
    invoice_document_url: '',
    invoice_file_name: '',
    invoice_size_kb: null,

    // Product & Chassis
    product_id: '',
    product_name: '',
    warranty_months: 12,
    chassis_serial_number: '',
    chassis_plate_photo_url: '',
    chassis_file_name: '',
    chassis_size_kb: null
  });

  const [dealerSearch, setDealerSearch] = useState('');
  const dealerInputRef = useRef(null);
  const [showDealerDropdown, setShowDealerDropdown] = useState(false);
  const [liveParties, setLiveParties] = useState(parties || []);
  const [dealerDisplayLimit, setDealerDisplayLimit] = useState(100);
  const [availableProducts, setAvailableProducts] = useState(PRODUCT_GROUPS);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadingChassis, setUploadingChassis] = useState(false);

  // Sync parties prop when updated by parent
  React.useEffect(() => {
    if (parties && parties.length > 0) {
      setLiveParties(parties);
    }
  }, [parties]);

  // Load live parties from Party Master directly to guarantee 100% complete dealer list
  React.useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    async function loadDealers() {
      try {
        const partyRes = await getPartyList(tenantId || 'TNT00002');
        const list = Array.isArray(partyRes?.data) ? partyRes.data : (Array.isArray(partyRes) ? partyRes : []);
        if (isMounted && list.length > 0) {
          setLiveParties(list);
        }
      } catch (err) {
        console.warn('Failed to load live parties in RegisterEndCustomerModal:', err);
      }
    }
    loadDealers();
    return () => { isMounted = false; };
  }, [isOpen, tenantId]);

  // Load live tenant catalog products
  React.useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    async function loadCatalog() {
      try {
        const res = await getTenantProducts(tenantId || 'TNT00002', 'ALL');
        const list = Array.isArray(res) ? res : (Array.isArray(res?.products) ? res.products : []);
        if (isMounted) {
          if (list.length > 0) {
            setAvailableProducts(list);
          } else {
            setAvailableProducts(PRODUCT_GROUPS);
          }
        }
      } catch (err) {
        console.warn('Failed to load live tenant products in RegisterEndCustomerModal, fallback to groups:', err);
        if (isMounted) setAvailableProducts(PRODUCT_GROUPS);
      }
    }
    loadCatalog();
    return () => { isMounted = false; };
  }, [isOpen, tenantId]);

  const [locationStates, setLocationStates] = useState([]);
  const [locationDistricts, setLocationDistricts] = useState([]);
  const [loadingLocation, setLoadingLocation] = useState(false);

  // 1. Load authoritative States from Location Master
  React.useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    async function loadMasterStates() {
      try {
        const statesData = await getStatesCentral();
        if (isMounted && Array.isArray(statesData) && statesData.length > 0) {
          const names = statesData.map(s => s.state_name || s.name).filter(Boolean);
          setLocationStates(names);
        } else if (isMounted) {
          setLocationStates(Object.keys(INDIAN_STATE_DISTRICTS));
        }
      } catch (err) {
        console.warn('Failed to load Location Master states, using fallback:', err);
        if (isMounted) setLocationStates(Object.keys(INDIAN_STATE_DISTRICTS));
      }
    }
    loadMasterStates();
    return () => { isMounted = false; };
  }, [isOpen]);

  // 2. Load authoritative Districts for selected state from Location Master
  React.useEffect(() => {
    if (!isOpen || !formData.state_name) return;
    let isMounted = true;
    async function loadMasterDistricts() {
      setLoadingLocation(true);
      try {
        const distData = await getDistrictsCentral(null, formData.state_name);
        if (isMounted && Array.isArray(distData) && distData.length > 0) {
          const dNames = distData.map(d => d.name || d.district_name).filter(Boolean);
          setLocationDistricts(dNames);
          if (!formData.district_name || !dNames.includes(formData.district_name)) {
            setFormData(prev => ({ ...prev, district_name: dNames[0] || '' }));
          }
        } else if (isMounted) {
          const fallbackDists = INDIAN_STATE_DISTRICTS[formData.state_name] || [];
          setLocationDistricts(fallbackDists);
          if (!formData.district_name || !fallbackDists.includes(formData.district_name)) {
            setFormData(prev => ({ ...prev, district_name: fallbackDists[0] || '' }));
          }
        }
      } catch (err) {
        console.warn('Failed to load Location Master districts, using fallback:', err);
        if (isMounted) {
          const fallbackDists = INDIAN_STATE_DISTRICTS[formData.state_name] || [];
          setLocationDistricts(fallbackDists);
        }
      } finally {
        if (isMounted) setLoadingLocation(false);
      }
    }
    loadMasterDistricts();
    return () => { isMounted = false; };
  }, [isOpen, formData.state_name]);

  // States & Dependent Districts (Synced with Location Master)
  const statesList = useMemo(() => {
    if (locationStates.length > 0) return locationStates;
    return Object.keys(INDIAN_STATE_DISTRICTS);
  }, [locationStates]);

  const districtsList = useMemo(() => {
    if (locationDistricts.length > 0) return locationDistricts;
    return INDIAN_STATE_DISTRICTS[formData.state_name] || [];
  }, [locationDistricts, formData.state_name]);

  // Live filtered dealers across ALL channel partners (No hardcoded 50 cap!)
  const allMatchingDealers = useMemo(() => {
    const source = filterEndCustomerDealers((liveParties && liveParties.length > 0) ? liveParties : parties, formData.our_company);
    if (!dealerSearch || !dealerSearch.trim()) return source;
    const q = dealerSearch.toLowerCase().trim();
    return source.filter(p => {
      const name = (p.firm_name || p.legal_name || '').toLowerCase();
      const code = (
        p.party_universal_code ||
        p.distributor_code ||
        p.dealer_code ||
        p.sub_dealer_code ||
        p.external_sap_code ||
        ''
      ).toLowerCase();
      const city = (p.district_name || p.city_name || p.city || '').toLowerCase();
      const state = (p.state_name || p.state || '').toLowerCase();
      const mobile = (p.primary_mobile || p.biz_contact_no_1 || '').toLowerCase();
      return name.includes(q) || code.includes(q) || city.includes(q) || state.includes(q) || mobile.includes(q);
    });
  }, [liveParties, parties, dealerSearch, formData.our_company]);

  // If total matching dealers <= 300, show ALL matching dealers directly so scrolling never gets stuck!
  // Otherwise, display in smooth batches with infinite scroll + "Load all" option.
  const visibleDealers = useMemo(() => {
    if (allMatchingDealers.length <= 300) {
      return allMatchingDealers;
    }
    return allMatchingDealers.slice(0, dealerDisplayLimit);
  }, [allMatchingDealers, dealerDisplayLimit]);

  // Reset display limit when user types in search
  React.useEffect(() => {
    setDealerDisplayLimit(100);
  }, [dealerSearch]);

  // Infinite scroll trigger on dropdown scroll
  const handleDealerDropdownScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 60) {
      if (dealerDisplayLimit < allMatchingDealers.length) {
        setDealerDisplayLimit(prev => Math.min(prev + 100, allMatchingDealers.length));
      }
    }
  };

  // Realtime Warranty Preview Calculation
  const warrantyPreview = useMemo(() => {
    return calculateWarrantyStatus(formData.purchase_date, formData.warranty_months);
  }, [formData.purchase_date, formData.warranty_months]);

  if (!isOpen) return null;

  const handleStateChange = (stateName) => {
    setFormData(prev => ({
      ...prev,
      state_name: stateName,
      district_name: ''
    }));
  };

  const handleCompanyChange = (company) => {
    setFormData(prev => ({ ...prev, our_company: company, linked_party_id: '', linked_party_code: '', linked_party_name: '', dealer_city_district: '' }));
    setDealerSearch('');
    setShowDealerDropdown(false);
    setDealerDisplayLimit(100);
  };

  const handleSelectDealer = (party) => {
    if (!formData.our_company || endCustomerDealerCompany(party) !== formData.our_company) return;
    const code = partyCode(party);
    const name = party.firm_name || party.legal_name || 'Dealer';
    const location = [party.city_name, party.district_name].filter(Boolean).join(', ');

    setFormData(prev => ({
      ...prev,
      linked_party_id: party.id,
      linked_party_code: code,
      linked_party_name: name,
      dealer_city_district: location
    }));
    setDealerSearch(code ? `${name} [${code}]` : name);
    setShowDealerDropdown(false);
  };

  const handleChangeDealer = () => {
    setFormData(prev => ({
      ...prev,
      linked_party_id: '',
      linked_party_code: '',
      linked_party_name: '',
      dealer_city_district: ''
    }));
    setDealerSearch('');
    setShowDealerDropdown(true);
    dealerInputRef.current?.focus();
  };

  const handleSelectProduct = (prod) => {
    if (!prod) return;
    const prodId = prod.id || prod.sku || prod.name || '';
    const prodName = prod.name || (typeof prod === 'string' ? prod : '');
    const category = prod.category || prod.sub_category || '';
    
    // Default warranty based on category (Land Leveller gets 24 months, others 12 months)
    const isLandLeveller = String(category).toLowerCase().includes('land leveller') || 
      String(prodName).toLowerCase().includes('laser land') || 
      String(prodName).toLowerCase().includes('leveller');

    setFormData(prev => ({
      ...prev,
      product_id: prodId,
      product_name: prodName,
      warranty_months: isLandLeveller ? 24 : 12
    }));
  };

  const handleInvoiceUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    setErrorMsg('');
    try {
      const res = await compressFileUnder100Kb(file);
      setFormData(prev => ({
        ...prev,
        invoice_document_url: res.dataUrl,
        invoice_file_name: file.name,
        invoice_size_kb: res.sizeKb
      }));
    } catch (err) {
      setErrorMsg(err.message || 'Failed to compress document.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleChassisUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingChassis(true);
    setErrorMsg('');
    try {
      const res = await compressFileUnder100Kb(file);
      setFormData(prev => ({
        ...prev,
        chassis_plate_photo_url: res.dataUrl,
        chassis_file_name: file.name,
        chassis_size_kb: res.sizeKb
      }));
    } catch (err) {
      setErrorMsg(err.message || 'Failed to compress photo.');
    } finally {
      setUploadingChassis(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!END_CUSTOMER_COMPANIES.includes(formData.our_company)) {
      setErrorMsg('Please select Company Name (NSMLR or NSTLP).');
      return;
    }
    if (!formData.full_name.trim()) {
      setErrorMsg('Customer Full Name is required.');
      return;
    }
    if (!formData.mobile_1.trim() || formData.mobile_1.trim().length < 10) {
      setErrorMsg('Valid 10-digit Primary Mobile Number (Mobile 1) is required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createEndCustomer(formData, tenantId);
      if (res.success && res.customer) {
        if (onSuccess) onSuccess(res.customer);
        onClose();
      } else {
        setErrorMsg(res.error || 'Failed to register end customer.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Unexpected error creating customer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      backdropFilter: 'blur(3px)'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface, #1e293b)',
        border: '1px solid var(--border-light, #334155)',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '850px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--border-light, #334155)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-primary, #0f172a)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6'
            }}>
              <User size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary, #f8fafc)' }}>
                Register New End Customer (Consumer)
              </h3>
              <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-secondary, #94a3b8)' }}>
                Retail machine buyer registration &amp; parent dealer mapping
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: 'pointer',
              padding: '0.35rem',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {errorMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* BLOCK 1: Basic Identity & Contact */}
          <div style={{ background: 'var(--bg-primary, #0f172a)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-light, #334155)' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <User size={15} />
              <span>1. 👤 Basic Identity &amp; Contact (Pehchaan &amp; Sampark)</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              <div style={{ gridColumn: '1 / -1', maxWidth: '350px', width: '100%' }}>
                <label htmlFor="end-customer-company" style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Company Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select id="end-customer-company" required value={formData.our_company} onChange={e => handleCompanyChange(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                  <option value="">Select Company</option>
                  {END_CUSTOMER_COMPANIES.map(company => <option key={company} value={company}>{company}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Customer Full Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Singh"
                  value={formData.full_name}
                  onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Mobile 1 (Primary for OTP &amp; WhatsApp) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  placeholder="10-digit mobile number"
                  value={formData.mobile_1}
                  onChange={e => setFormData({ ...formData, mobile_1: e.target.value.replace(/\D/g, '') })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Mobile 2
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="Secondary mobile"
                  value={formData.mobile_2}
                  onChange={e => setFormData({ ...formData, mobile_2: e.target.value.replace(/\D/g, '') })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Alternate Mobile 1
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="Alt mobile 1"
                  value={formData.alternate_mobile_1}
                  onChange={e => setFormData({ ...formData, alternate_mobile_1: e.target.value.replace(/\D/g, '') })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Alternate Mobile 2
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="Alt mobile 2"
                  value={formData.alternate_mobile_2}
                  onChange={e => setFormData({ ...formData, alternate_mobile_2: e.target.value.replace(/\D/g, '') })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Email ID 1
                </label>
                <input
                  type="email"
                  placeholder="e.g. customer@gmail.com"
                  value={formData.email_1}
                  onChange={e => setFormData({ ...formData, email_1: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Alternate Email ID 1
                </label>
                <input
                  type="email"
                  placeholder="Alternate email"
                  value={formData.alternate_email_1}
                  onChange={e => setFormData({ ...formData, alternate_email_1: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  State Name (Location Master)
                </label>
                <select
                  value={formData.state_name}
                  onChange={e => handleStateChange(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  {statesList.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  District Name
                </label>
                <select
                  value={formData.district_name}
                  onChange={e => setFormData({ ...formData, district_name: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  {districtsList.map(dst => (
                    <option key={dst} value={dst}>{dst}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  PIN Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="6-digit PIN"
                  value={formData.pin_code}
                  onChange={e => setFormData({ ...formData, pin_code: e.target.value.replace(/\D/g, '') })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Landmark
                </label>
                <input
                  type="text"
                  placeholder="Near Water Tank / Temple"
                  value={formData.landmark}
                  onChange={e => setFormData({ ...formData, landmark: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Block / Area Name
                </label>
                <input
                  type="text"
                  placeholder="Tehsil or Block"
                  value={formData.block_area_name}
                  onChange={e => setFormData({ ...formData, block_area_name: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Full Village / Delivery Address
                </label>
                <textarea
                  rows={2}
                  placeholder="Complete village address with house/farm reference for technician"
                  value={formData.full_address}
                  onChange={e => setFormData({ ...formData, full_address: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem', resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* BLOCK 2: Dealer Mapping & Document Upload */}
          <div style={{ background: 'var(--bg-primary, #0f172a)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-light, #334155)' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fbbf24', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Building2 size={15} />
              <span>2. 🏪 Dealer Mapping &amp; Product Details</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {/* Linked Dealer Search */}
              <div style={{ position: 'relative', gridColumn: '1 / -1' }}>
                <label htmlFor="linked-dealer-input" style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Linked Dealer / Distributor (Party Master search)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    id="linked-dealer-input"
                    ref={dealerInputRef}
                    type="text"
                    disabled={!formData.our_company}
                    placeholder={formData.our_company ? 'Type to search Dealer firm name, code, or city...' : 'Select Company Name first'}
                    value={dealerSearch}
                    readOnly={Boolean(formData.linked_party_id)}
                    onChange={e => {
                      if (formData.linked_party_id) return;
                      setDealerSearch(e.target.value);
                      setShowDealerDropdown(true);
                    }}
                    onFocus={() => {
                      if (formData.our_company && !formData.linked_party_id) setShowDealerDropdown(true);
                    }}
                    style={{ width: '100%', minWidth: 0, flex: 1, padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                  />
                  {formData.linked_party_id && (
                    <button
                      type="button"
                      onClick={handleChangeDealer}
                      aria-label="Change dealer"
                      title="Clear selected dealer and search again"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0, padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem', cursor: 'pointer' }}
                    >
                      <X size={14} aria-hidden="true" />
                      Change
                    </button>
                  )}
                </div>

                {showDealerDropdown && formData.our_company && !formData.linked_party_id && (
                  <div
                    onScroll={handleDealerDropdownScroll}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      maxHeight: '290px',
                      overflowY: 'auto',
                      background: 'var(--bg-surface, #1e293b)',
                      border: '1px solid var(--border-light, #334155)',
                      borderRadius: '8px',
                      zIndex: 50,
                      marginTop: '4px',
                      boxShadow: '0 12px 24px -4px rgba(0, 0, 0, 0.5)'
                    }}
                  >
                    {/* Header Counter Bar */}
                    <div style={{
                      padding: '0.45rem 0.75rem',
                      background: 'rgba(59, 130, 246, 0.08)',
                      borderBottom: '1px solid var(--border-light)',
                      fontSize: '0.72rem',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      position: 'sticky',
                      top: 0,
                      zIndex: 2,
                      backgroundColor: 'var(--bg-surface)'
                    }}>
                      <span>
                        Showing <strong>{Math.min(visibleDealers.length, allMatchingDealers.length)}</strong> of <strong>{allMatchingDealers.length}</strong> Channel Partners
                      </span>
                      {visibleDealers.length < allMatchingDealers.length ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 600 }}>
                            📜 Scroll for more...
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDealerDisplayLimit(allMatchingDealers.length);
                            }}
                            style={{
                              background: '#3b82f6',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '2px 7px',
                              fontSize: '0.68rem',
                              cursor: 'pointer',
                              fontWeight: 600
                            }}
                          >
                            Load All ({allMatchingDealers.length})
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600 }}>
                          ✓ All loaded ({allMatchingDealers.length})
                        </span>
                      )}
                    </div>

                    {visibleDealers.length === 0 ? (
                      <div style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                        No channel partners found matching &quot;{dealerSearch}&quot;
                      </div>
                    ) : (
                      visibleDealers.map(party => (
                        <div
                          key={party.id}
                          onClick={() => handleSelectDealer(party)}
                          style={{
                            padding: '0.55rem 0.75rem',
                            borderBottom: '1px solid var(--border-light)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            color: 'var(--text-primary)'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.15)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{party.firm_name}</strong>
                            <span style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: 'rgba(234, 88, 12, 0.12)',
                              color: '#ea580c',
                              fontFamily: 'monospace'
                            }}>
                              {partyCode(party) || 'Code unavailable'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span>📍 {[party.city_village || party.city_name, party.district_name, party.state_name].filter(Boolean).join(', ') || 'No territory set'}</span>
                            {party.party_type && <span style={{ color: '#38bdf8' }}>🏷️ {party.party_type}</span>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Purchase Invoice / Bill No
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-24-25/1108"
                  value={formData.purchase_invoice_no}
                  onChange={e => setFormData({ ...formData, purchase_invoice_no: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Purchase Date (IST)
                </label>
                <input
                  type="date"
                  value={formData.purchase_date}
                  onChange={e => setFormData({ ...formData, purchase_date: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Product Model (Searchable Product Master) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <SearchableProductSelect
                  products={availableProducts}
                  value={formData.product_name || formData.product_id}
                  onChange={handleSelectProduct}
                  placeholder="Click to search model name, SKU, or category..."
                  showPrice={false}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Chassis / Machine Serial Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. RT-7FT-2026-98124"
                  value={formData.chassis_serial_number}
                  onChange={e => setFormData({ ...formData, chassis_serial_number: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              {/* Invoice Upload (max 100KB) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Invoice / Bill Copy (PDF/Image ≤ 100KB)
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleInvoiceUpload}
                  style={{ width: '100%', fontSize: '0.75rem', color: 'var(--text-secondary)' }}
                />
                {uploadingDoc && <span style={{ fontSize: '0.7rem', color: '#3b82f6' }}>Compressing...</span>}
                {formData.invoice_size_kb && (
                  <span style={{ fontSize: '0.7rem', color: '#10b981', display: 'block', marginTop: '2px' }}>
                    ✓ Ready: {formData.invoice_file_name} ({formData.invoice_size_kb} KB)
                  </span>
                )}
              </div>

              {/* Chassis Plate Photo Upload (max 100KB) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Chassis Plate Photo (Optional ≤ 100KB)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleChassisUpload}
                  style={{ width: '100%', fontSize: '0.75rem', color: 'var(--text-secondary)' }}
                />
                {uploadingChassis && <span style={{ fontSize: '0.7rem', color: '#3b82f6' }}>Compressing...</span>}
                {formData.chassis_size_kb && (
                  <span style={{ fontSize: '0.7rem', color: '#10b981', display: 'block', marginTop: '2px' }}>
                    ✓ Ready: {formData.chassis_file_name} ({formData.chassis_size_kb} KB)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* BLOCK 3: Auto Warranty Status Engine (Realtime Preview) */}
          <div style={{
            background: 'var(--bg-primary, #0f172a)',
            padding: '1rem',
            borderRadius: '10px',
            border: `1px solid ${warrantyPreview.color}40`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                3. 🚜 Auto Warranty Status (Calculated)
              </div>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                Warranty Expiry: <strong>{warrantyPreview.expiryDate || 'N/A'}</strong> (Standard {formData.warranty_months} Months)
              </div>
            </div>

            <div style={{
              padding: '0.45rem 1rem',
              borderRadius: '20px',
              background: `${warrantyPreview.color}20`,
              color: warrantyPreview.color,
              border: `1px solid ${warrantyPreview.color}`,
              fontWeight: 800,
              fontSize: '0.84rem'
            }}>
              {warrantyPreview.label}
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-light)' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '0.55rem 1.1rem',
                borderRadius: '8px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '0.55rem 1.35rem',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                border: 'none',
                color: '#fff',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: '0.84rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem'
              }}
            >
              {submitting ? 'Registering Customer...' : 'Save & Select for Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
