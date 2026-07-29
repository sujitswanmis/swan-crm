'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Globe, Compass, Plus, AlertCircle, CheckCircle2, Search, X, Building2 } from 'lucide-react';
import {
  getCountriesCentral,
  getStatesCentral,
  getDistrictsCentral,
  getSubdistrictsCentral,
  getBlocksCentral,
  getSettlementsCentral,
  getPostOfficesCentral,
  submitLocationRequest
} from '@/app/actions/centralLocationMaster';

export default function LocationPicker({
  countryRequired = true,
  stateRequired = true,
  districtRequired = true,
  subdistrictEnabled = true,
  blockEnabled = true,
  settlementEnabled = true,
  pinEnabled = true,
  allowLocationRequest = true,
  readOnly = false,
  initialValue = {},
  onChange = () => {}
}) {
  // Cascading Selection State
  const [countries, setCountries] = useState([]);
  const [selectedCountryId, setSelectedCountryId] = useState(initialValue.country_id || '');

  const [states, setStates] = useState([]);
  const [selectedStateId, setSelectedStateId] = useState(initialValue.state_id || '');

  const [districts, setDistricts] = useState([]);
  const [selectedDistrictId, setSelectedDistrictId] = useState(initialValue.district_id || '');

  const [subdistricts, setSubdistricts] = useState([]);
  const [selectedSubdistrictId, setSelectedSubdistrictId] = useState(initialValue.subdistrict_id || '');

  const [blocks, setBlocks] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(initialValue.block_id || '');

  const [settlements, setSettlements] = useState([]);
  const [selectedSettlementId, setSelectedSettlementId] = useState(initialValue.settlement_id || '');

  const [postOffices, setPostOffices] = useState([]);
  const [selectedPostOfficeId, setSelectedPostOfficeId] = useState(initialValue.post_office_id || '');
  const [pinCodeInput, setPinCodeInput] = useState(initialValue.pin_code || '');

  // Validation Guard Alert
  const [validationError, setValidationError] = useState('');

  // Location Not Found Modal
  const [showReqModal, setShowReqModal] = useState(false);
  const [reqForm, setReqForm] = useState({
    proposed_name: '',
    requested_location_type: 'DISTRICT',
    proposed_pin_code: '',
    reason: ''
  });
  const [reqSuccessId, setReqSuccessId] = useState(null);

  // 1. Initial Load: Countries & Auto-Select India if empty
  useEffect(() => {
    loadCountries();
  }, []);

  const loadCountries = async () => {
    const data = await getCountriesCentral();
    setCountries(data || []);
    if (data && data.length > 0 && !selectedCountryId) {
      setSelectedCountryId(data[0].id);
      loadStates(data[0].id);
    } else if (selectedCountryId) {
      loadStates(selectedCountryId);
    }
  };

  // 2. Country Changed -> Load States, Clear Children
  const handleCountryChange = (cId) => {
    setSelectedCountryId(cId);
    setSelectedStateId('');
    setSelectedDistrictId('');
    setSelectedSubdistrictId('');
    setSelectedBlockId('');
    setSelectedSettlementId('');
    setSelectedPostOfficeId('');
    setPinCodeInput('');
    setDistricts([]);
    setSubdistricts([]);
    setBlocks([]);
    setSettlements([]);
    setPostOffices([]);
    setValidationError('');

    if (cId) loadStates(cId);
    emitChange({ country_id: cId, state_id: '', district_id: '' });
  };

  const loadStates = async (cId) => {
    const data = await getStatesCentral(cId);
    setStates(data || []);
  };

  // 3. State Changed -> Load Districts, Clear Children & Guard Invalid Combos
  const handleStateChange = (stId) => {
    setSelectedStateId(stId);
    setSelectedDistrictId('');
    setSelectedSubdistrictId('');
    setSelectedBlockId('');
    setSelectedSettlementId('');
    setSelectedPostOfficeId('');
    setPinCodeInput('');
    setSubdistricts([]);
    setBlocks([]);
    setSettlements([]);
    setPostOffices([]);
    setValidationError('');

    if (stId) loadDistricts(stId);
    emitChange({ country_id: selectedCountryId, state_id: stId, district_id: '' });
  };

  const loadDistricts = async (stId) => {
    const data = await getDistrictsCentral(stId, selectedCountryId);
    setDistricts(data || []);
  };

  // 4. District Changed -> Load Subdistricts & Blocks Independently
  const handleDistrictChange = (distId) => {
    // Cross-State Validation Guard Check
    const selectedDistObj = districts.find(d => d.id === distId);
    if (selectedDistObj && selectedDistObj.state_id !== selectedStateId) {
      setValidationError(`Invalid Location Combination! District "${selectedDistObj.district_name}" does not belong to the selected State.`);
      return;
    }

    setSelectedDistrictId(distId);
    setSelectedSubdistrictId('');
    setSelectedBlockId('');
    setSelectedSettlementId('');
    setSelectedPostOfficeId('');
    setValidationError('');

    if (distId) {
      loadSubdistricts(distId);
      loadBlocks(distId);
      loadSettlements(distId, null, null);
    }

    emitChange({ country_id: selectedCountryId, state_id: selectedStateId, district_id: distId });
  };

  const loadSubdistricts = async (dId) => {
    const data = await getSubdistrictsCentral(dId);
    setSubdistricts(data || []);
  };

  const loadBlocks = async (dId) => {
    const data = await getBlocksCentral(dId);
    setBlocks(data || []);
  };

  const loadSettlements = async (dId, subId, blkId) => {
    const data = await getSettlementsCentral(dId, subId, blkId);
    setSettlements(data || []);
  };

  // 5. Subdistrict Changed -> Filter Settlements
  const handleSubdistrictChange = (subId) => {
    setSelectedSubdistrictId(subId);
    if (selectedDistrictId) {
      loadSettlements(selectedDistrictId, subId, selectedBlockId);
    }
    emitChange({ subdistrict_id: subId });
  };

  // 6. Block Changed -> Filter Settlements (Block is Independent of Tehsil!)
  const handleBlockChange = (blkId) => {
    setSelectedBlockId(blkId);
    if (selectedDistrictId) {
      loadSettlements(selectedDistrictId, selectedSubdistrictId, blkId);
    }
    emitChange({ block_id: blkId });
  };

  // 7. Settlement Changed -> Load Post Offices
  const handleSettlementChange = (settleId) => {
    setSelectedSettlementId(settleId);
    emitChange({ settlement_id: settleId });
  };

  // 8. PIN Search -> Returns Multiple Post Offices
  const handlePinInput = async (e) => {
    const pin = e.target.value;
    setPinCodeInput(pin);
    if (pin.trim().length === 6) {
      const pos = await getPostOfficesCentral(pin, selectedDistrictId);
      setPostOffices(pos || []);
    }
    emitChange({ pin_code: pin });
  };

  const emitChange = (overrides = {}) => {
    onChange({
      country_id: selectedCountryId,
      state_id: selectedStateId,
      district_id: selectedDistrictId,
      subdistrict_id: selectedSubdistrictId,
      block_id: selectedBlockId,
      settlement_id: selectedSettlementId,
      post_office_id: selectedPostOfficeId,
      pin_code: pinCodeInput,
      ...overrides
    });
  };

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await submitLocationRequest({
        ...reqForm,
        country_id: selectedCountryId,
        state_id: selectedStateId,
        district_id: selectedDistrictId
      });
      setReqSuccessId(res.id);
      setReqForm({ proposed_name: '', requested_location_type: 'DISTRICT', proposed_pin_code: '', reason: '' });
      setTimeout(() => {
        setReqSuccessId(null);
        setShowReqModal(false);
      }, 3000);
    } catch (err) {
      alert('Error submitting location request: ' + err.message);
    }
  };

  return (
    <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.25rem', color: '#ffffff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.6rem' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Globe size={18} /> Central Cascading Location Picker
        </h4>
        {allowLocationRequest && !readOnly && (
          <button
            type="button"
            onClick={() => setShowReqModal(true)}
            style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fbbf24', background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', padding: '0.25rem 0.6rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
          >
            <Plus size={14} /> Location Not Found?
          </button>
        )}
      </div>

      {/* Validation Alert */}
      {validationError && (
        <div style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#f87171', padding: '0.6rem 0.8rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <AlertCircle size={16} /> {validationError}
        </div>
      )}

      {/* Grid Cascading Pickers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', fontSize: '0.85rem' }}>
        {/* Country Picker */}
        <div>
          <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.3rem', fontWeight: 500 }}>
            Country {countryRequired && <span style={{ color: '#ef4444' }}>*</span>}
          </label>
          <select
            disabled={readOnly}
            value={selectedCountryId}
            onChange={e => handleCountryChange(e.target.value)}
            style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', outline: 'none' }}
          >
            <option value="">-- Select Country --</option>
            {countries.map(c => <option key={c.id} value={c.id}>{c.country_name} ({c.country_code})</option>)}
          </select>
        </div>

        {/* State Picker */}
        <div>
          <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.3rem', fontWeight: 500 }}>
            State / UT {stateRequired && <span style={{ color: '#ef4444' }}>*</span>}
          </label>
          <select
            disabled={readOnly || !selectedCountryId}
            value={selectedStateId}
            onChange={e => handleStateChange(e.target.value)}
            style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', outline: 'none' }}
          >
            <option value="">-- Select State --</option>
            {states.map(s => <option key={s.id} value={s.id}>{s.state_name}</option>)}
          </select>
        </div>

        {/* District Picker */}
        <div>
          <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.3rem', fontWeight: 500 }}>
            District {districtRequired && <span style={{ color: '#ef4444' }}>*</span>}
          </label>
          <select
            disabled={readOnly || !selectedStateId}
            value={selectedDistrictId}
            onChange={e => handleDistrictChange(e.target.value)}
            style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', outline: 'none' }}
          >
            <option value="">-- Select District --</option>
            {districts.map(d => <option key={d.id} value={d.id}>{d.district_name}</option>)}
          </select>
        </div>

        {/* Tehsil / Subdistrict Picker */}
        {subdistrictEnabled && (
          <div>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.3rem', fontWeight: 500 }}>
              Tehsil / Mandal
            </label>
            <select
              disabled={readOnly || !selectedDistrictId}
              value={selectedSubdistrictId}
              onChange={e => handleSubdistrictChange(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', outline: 'none' }}
            >
              <option value="">-- Select Tehsil --</option>
              {subdistricts.map(sub => <option key={sub.id} value={sub.id}>{sub.subdistrict_name} ({sub.subdistrict_type})</option>)}
            </select>
          </div>
        )}

        {/* Development Block Picker (Independent of Tehsil) */}
        {blockEnabled && (
          <div>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.3rem', fontWeight: 500 }}>
              Development Block
            </label>
            <select
              disabled={readOnly || !selectedDistrictId}
              value={selectedBlockId}
              onChange={e => handleBlockChange(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', outline: 'none' }}
            >
              <option value="">-- Select Block --</option>
              {blocks.map(b => <option key={b.id} value={b.id}>{b.block_name}</option>)}
            </select>
          </div>
        )}

        {/* Settlement / Village / City Picker */}
        {settlementEnabled && (
          <div>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.3rem', fontWeight: 500 }}>
              City / Village / Town
            </label>
            <select
              disabled={readOnly || !selectedDistrictId}
              value={selectedSettlementId}
              onChange={e => handleSettlementChange(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', outline: 'none' }}
            >
              <option value="">-- Select Settlement --</option>
              {settlements.map(st => <option key={st.id} value={st.id}>{st.settlement_name} ({st.settlement_type})</option>)}
            </select>
          </div>
        )}

        {/* PIN Code Search Input */}
        {pinEnabled && (
          <div>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.3rem', fontWeight: 500 }}>
              PIN Code
            </label>
            <input
              type="text"
              readOnly={readOnly}
              value={pinCodeInput}
              onChange={handlePinInput}
              placeholder="e.g. 125104"
              maxLength={6}
              style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', outline: 'none' }}
            />
          </div>
        )}
      </div>

      {/* MODAL: LOCATION NOT FOUND REQUEST */}
      {showReqModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#fbbf24' }}>Submit Location Not Found Request</h3>
              <button type="button" onClick={() => setShowReqModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {reqSuccessId ? (
              <div style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid #10b981', color: '#34d399', padding: '1rem', borderRadius: '8px', textAlign: 'center', fontSize: '0.9rem' }}>
                <CheckCircle2 size={32} style={{ margin: '0 auto 0.5rem auto' }} />
                Request Submitted Successfully!
                <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.3rem' }}>Request ID: {reqSuccessId}</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>Location Admin will review and approve your request.</div>
              </div>
            ) : (
              <form onSubmit={handleRequestSubmit}>
                <div style={{ display: 'grid', gap: '0.85rem', fontSize: '0.85rem' }}>
                  <div>
                    <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.2rem' }}>Requested Location Type</label>
                    <select value={reqForm.requested_location_type} onChange={e => setReqForm({ ...reqForm, requested_location_type: e.target.value })} style={{ width: '100%', padding: '0.55rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}>
                      <option value="DISTRICT">District</option>
                      <option value="SUBDISTRICT">Tehsil / Mandal</option>
                      <option value="BLOCK">Development Block</option>
                      <option value="SETTLEMENT">Village / Town / City</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.2rem' }}>Proposed Location Name *</label>
                    <input type="text" required value={reqForm.proposed_name} onChange={e => setReqForm({ ...reqForm, proposed_name: e.target.value })} placeholder="e.g. Mandi Dabwali Rural" style={{ width: '100%', padding: '0.55rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.2rem' }}>PIN Code (Optional)</label>
                    <input type="text" value={reqForm.proposed_pin_code} onChange={e => setReqForm({ ...reqForm, proposed_pin_code: e.target.value })} placeholder="6-digit PIN" style={{ width: '100%', padding: '0.55rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.2rem' }}>Reason / Reference</label>
                    <textarea value={reqForm.reason} onChange={e => setReqForm({ ...reqForm, reason: e.target.value })} placeholder="New client location not listed in dropdown" style={{ width: '100%', padding: '0.55rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', minHeight: '50px' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                  <button type="button" onClick={() => setShowReqModal(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#cbd5e1', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ padding: '0.5rem 1rem', background: '#fbbf24', border: 'none', borderRadius: '8px', color: '#0f172a', fontWeight: 700, cursor: 'pointer' }}>Submit Request</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
