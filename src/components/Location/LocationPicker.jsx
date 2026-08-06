'use me';
'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Globe, AlertTriangle, Plus, Search, CheckCircle2, ChevronRight, X } from 'lucide-react';
import {
  getStatesCentral,
  getDistrictsCentral,
  getSubdistrictsCentral,
  getBlocksCentral,
  getSettlementsCentral,
  getPostOfficesCentral,
  submitLocationRequest
} from '@/app/actions/centralLocationMaster';

export default function LocationPicker({
  value = {},
  onChange = () => {},
  countryRequired = true,
  stateRequired = true,
  districtRequired = true,
  subdistrictEnabled = true,
  blockEnabled = true,
  settlementEnabled = true,
  postOfficeEnabled = true,
  pinEnabled = true,
  allowLocationRequest = true,
  disabled = false,
  readOnly = false,
  validationMode = 'strict',
  hideHeader = false,
  noStyle = false
}) {
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [subdistricts, setSubdistricts] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [postOffices, setPostOffices] = useState([]);

  const [selectedState, setSelectedState] = useState(value.state_id || '');
  const [selectedDistrict, setSelectedDistrict] = useState(value.district_id || '');
  const [selectedSubdistrict, setSelectedSubdistrict] = useState(value.subdistrict_id || '');
  const [selectedBlock, setSelectedBlock] = useState(value.block_id || '');
  const [selectedSettlement, setSelectedSettlement] = useState(value.settlement_id || '');
  const [selectedPostOffice, setSelectedPostOffice] = useState(value.post_office_id || '');
  const [pinCodeInput, setPinCodeInput] = useState(value.pin_code || '');

  // Guard warning for cross-state invalid combination
  const [hierarchyMismatch, setHierarchyMismatch] = useState('');

  // Location Not Found Modal
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({
    requested_location_type: 'SETTLEMENT',
    proposed_name: '',
    reason: '',
    proposed_pin_code: ''
  });

  useEffect(() => {
    loadStates();
  }, []);

  const loadStates = async () => {
    const data = await getStatesCentral('00000000-0000-0000-0000-000000000001');
    setStates(data || []);
  };

  // State Change Handler
  const handleStateChange = async (e) => {
    const stId = e.target.value;
    setSelectedState(stId);
    setSelectedDistrict('');
    setSelectedSubdistrict('');
    setSelectedBlock('');
    setSelectedSettlement('');
    setSelectedPostOffice('');
    setDistricts([]);
    setSubdistricts([]);
    setBlocks([]);
    setSettlements([]);
    setPostOffices([]);
    setHierarchyMismatch('');

    if (stId) {
      const dists = await getDistrictsCentral(stId);
      setDistricts(dists || []);
    }
    emitChange({ state_id: stId, district_id: '', subdistrict_id: '', block_id: '', settlement_id: '', post_office_id: '', pin_code: pinCodeInput });
  };

  // District Change Handler
  const handleDistrictChange = async (e) => {
    const distId = e.target.value;
    setSelectedDistrict(distId);
    setSelectedSubdistrict('');
    setSelectedBlock('');
    setSelectedSettlement('');
    setSelectedPostOffice('');
    setSubdistricts([]);
    setBlocks([]);
    setSettlements([]);
    setPostOffices([]);
    setHierarchyMismatch('');

    if (distId) {
      const [subs, blks, setts, pos] = await Promise.all([
        subdistrictEnabled ? getSubdistrictsCentral(distId) : Promise.resolve([]),
        blockEnabled ? getBlocksCentral(distId) : Promise.resolve([]),
        settlementEnabled ? getSettlementsCentral(distId) : Promise.resolve([]),
        postOfficeEnabled ? getPostOfficesCentral('', distId) : Promise.resolve([])
      ]);
      setSubdistricts(subs || []);
      setBlocks(blks || []);
      setSettlements(setts || []);
      setPostOffices(pos || []);
    }
    emitChange({ state_id: selectedState, district_id: distId, subdistrict_id: '', block_id: '', settlement_id: '', post_office_id: '', pin_code: pinCodeInput });
  };

  // PIN Code Lookup Handler
  const handlePinLookup = async (pin) => {
    setPinCodeInput(pin);
    if (pin.length === 6) {
      const pos = await getPostOfficesCentral(pin);
      if (pos && pos.length > 0) {
        setPostOffices(pos);
      }
    }
    emitChange({ state_id: selectedState, district_id: selectedDistrict, subdistrict_id: selectedSubdistrict, block_id: selectedBlock, settlement_id: selectedSettlement, post_office_id: selectedPostOffice, pin_code: pin });
  };

  const emitChange = (newVal) => {
    onChange({
      country_id: '00000000-0000-0000-0000-000000000001',
      ...newVal
    });
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    try {
      await submitLocationRequest({
        ...requestForm,
        state_id: selectedState || null,
        district_id: selectedDistrict || null,
        reason: requestForm.reason || 'Location not found in Central Master'
      });
      setShowRequestModal(false);
      setRequestForm({ requested_location_type: 'SETTLEMENT', proposed_name: '', reason: '', proposed_pin_code: '' });
      alert('Location Request submitted to Location Admin successfully!');
    } catch (err) {
      alert('Failed to submit request: ' + err.message);
    }
  };

  return (
    <div style={noStyle ? {} : { background: '#ffffff', border: '1px solid #e2e8f0', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      {!hideHeader && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <MapPin size={18} className="text-blue-600" /> Cascading Location Picker (Central Master)
          </h4>
          {allowLocationRequest && (
            <button
              type="button"
              onClick={() => setShowRequestModal(true)}
              style={{ fontSize: '0.78rem', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', fontWeight: 700, padding: '0.3rem 0.65rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
            >
              <Plus size={12} /> Location Not Found?
            </button>
          )}
        </div>
      )}

      {hierarchyMismatch && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.6rem 0.8rem', borderRadius: '6px', fontSize: '0.82rem', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <AlertTriangle size={14} /> {hierarchyMismatch}
        </div>
      )}

      {/* Cascading Picker Form */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {/* Country */}
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>Country *</label>
          <select disabled style={{ width: '100%', padding: '0.55rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontSize: '0.85rem' }}>
            <option>India (IN)</option>
          </select>
        </div>

        {/* State */}
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>State / UT {stateRequired && '*'}</label>
          <select
            value={selectedState}
            onChange={handleStateChange}
            disabled={disabled || readOnly}
            style={{ width: '100%', padding: '0.55rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontSize: '0.85rem', outline: 'none' }}
          >
            <option value="">Select State / UT...</option>
            {states.map(s => (
              <option key={s.id} value={s.id}>{s.state_name} ({s.state_code})</option>
            ))}
          </select>
        </div>

        {/* District */}
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>District {districtRequired && '*'}</label>
          <select
            value={selectedDistrict}
            onChange={handleDistrictChange}
            disabled={disabled || readOnly || !selectedState}
            style={{ width: '100%', padding: '0.55rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontSize: '0.85rem', outline: 'none' }}
          >
            <option value="">{selectedState ? 'Select District...' : 'Select State First'}</option>
            {districts.map(d => (
              <option key={d.id} value={d.id}>{d.district_name}</option>
            ))}
          </select>
        </div>

        {/* Tehsil / Sub-District */}
        {subdistrictEnabled && (
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>Tehsil / Sub-District</label>
            <select
              value={selectedSubdistrict}
              onChange={e => {
                setSelectedSubdistrict(e.target.value);
                emitChange({ state_id: selectedState, district_id: selectedDistrict, subdistrict_id: e.target.value, block_id: selectedBlock, settlement_id: selectedSettlement, post_office_id: selectedPostOffice, pin_code: pinCodeInput });
              }}
              disabled={disabled || readOnly || !selectedDistrict}
              style={{ width: '100%', padding: '0.55rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontSize: '0.85rem', outline: 'none' }}
            >
              <option value="">{selectedDistrict ? 'Select Tehsil / Mandal...' : 'Select District First'}</option>
              {subdistricts.map(sub => (
                <option key={sub.id} value={sub.id}>{sub.subdistrict_name} ({sub.subdistrict_type})</option>
              ))}
            </select>
          </div>
        )}

        {/* Development Block */}
        {blockEnabled && (
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>Development Block</label>
            <select
              value={selectedBlock}
              onChange={e => {
                setSelectedBlock(e.target.value);
                emitChange({ state_id: selectedState, district_id: selectedDistrict, subdistrict_id: selectedSubdistrict, block_id: e.target.value, settlement_id: selectedSettlement, post_office_id: selectedPostOffice, pin_code: pinCodeInput });
              }}
              disabled={disabled || readOnly || !selectedDistrict}
              style={{ width: '100%', padding: '0.55rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontSize: '0.85rem', outline: 'none' }}
            >
              <option value="">{selectedDistrict ? 'Select Block...' : 'Select District First'}</option>
              {blocks.map(b => (
                <option key={b.id} value={b.id}>{b.block_name}</option>
              ))}
            </select>
          </div>
        )}

        {/* City / Village */}
        {settlementEnabled && (
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>City / Town / Village</label>
            <select
              value={selectedSettlement}
              onChange={e => {
                setSelectedSettlement(e.target.value);
                emitChange({ state_id: selectedState, district_id: selectedDistrict, subdistrict_id: selectedSubdistrict, block_id: selectedBlock, settlement_id: e.target.value, post_office_id: selectedPostOffice, pin_code: pinCodeInput });
              }}
              disabled={disabled || readOnly || !selectedDistrict}
              style={{ width: '100%', padding: '0.55rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontSize: '0.85rem', outline: 'none' }}
            >
              <option value="">{selectedDistrict ? 'Select City / Village...' : 'Select District First'}</option>
              {settlements.map(st => (
                <option key={st.id} value={st.id}>{st.settlement_name} ({st.settlement_type})</option>
              ))}
            </select>
          </div>
        )}

        {/* PIN Code Lookup */}
        {pinEnabled && (
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>PIN Code</label>
            <input
              type="text"
              maxLength={6}
              value={pinCodeInput}
              onChange={e => handlePinLookup(e.target.value)}
              placeholder="e.g. 141001"
              disabled={disabled || readOnly}
              style={{ width: '100%', padding: '0.55rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontSize: '0.85rem', outline: 'none' }}
            />
          </div>
        )}
      </div>

      {/* MODAL: LOCATION NOT FOUND REQUEST */}
      {showRequestModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '440px', color: '#0f172a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Request New Location Registration</h3>
              <button onClick={() => setShowRequestModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmitRequest}>
              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Location Type</label>
                <select value={requestForm.requested_location_type} onChange={e => setRequestForm({ ...requestForm, requested_location_type: e.target.value })} style={{ width: '100%', padding: '0.55rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                  <option value="DISTRICT">District</option>
                  <option value="SUBDISTRICT">Tehsil / Sub-District</option>
                  <option value="BLOCK">Development Block</option>
                  <option value="SETTLEMENT">City / Village</option>
                  <option value="POST_OFFICE">Post Office / PIN</option>
                </select>
              </div>
              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Proposed Location Name *</label>
                <input type="text" required value={requestForm.proposed_name} onChange={e => setRequestForm({ ...requestForm, proposed_name: e.target.value })} placeholder="e.g. New Industrial Focal Point" style={{ width: '100%', padding: '0.55rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
              </div>
              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>PIN Code (Optional)</label>
                <input type="text" value={requestForm.proposed_pin_code} onChange={e => setRequestForm({ ...requestForm, proposed_pin_code: e.target.value })} placeholder="6-digit PIN" style={{ width: '100%', padding: '0.55rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Reason / Details *</label>
                <textarea required rows={3} value={requestForm.reason} onChange={e => setRequestForm({ ...requestForm, reason: e.target.value })} placeholder="Why is this location required?" style={{ width: '100%', padding: '0.55rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setShowRequestModal(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700 }}>Submit to Admin</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
