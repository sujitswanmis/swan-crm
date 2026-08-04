'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Globe, Map, Compass, UserCheck, ShieldAlert, Plus, RefreshCw, CheckCircle2, Search, ArrowRight, Layers, Building, X } from 'lucide-react';
import { getStates, createState, getDistricts, createDistrict, createSubdistrict, resolveLocationAlias, createLocationRequest } from '@/app/actions/locationMaster';
import { getTerritories, createTerritory, assignTerritoryEmployee } from '@/app/actions/territoryBuilder';

export default function LocationTerritoryModule() {
  const [subTab, setSubTab] = useState('locations'); // 'locations' | 'territories' | 'alias'
  const [loading, setLoading] = useState(false);

  const [states, setStates] = useState([]);
  const [selectedState, setSelectedState] = useState('');
  const [districts, setDistricts] = useState([]);
  const [selectedDistrict, setSelectedDistrict] = useState(null);

  const [territories, setTerritories] = useState([]);

  // Modals for Registration
  const [showAddStateModal, setShowAddStateModal] = useState(false);
  const [stateForm, setStateForm] = useState({ name: '', code: '' });

  const [showAddDistrictModal, setShowAddDistrictModal] = useState(false);
  const [districtForm, setDistrictForm] = useState({ name: '', code: '' });

  const [showAddSubdistrictModal, setShowAddSubdistrictModal] = useState(false);
  const [subdistrictForm, setSubdistrictForm] = useState({ name: '', code: '' });

  // Alias Resolver State
  const [aliasQuery, setAliasQuery] = useState('');
  const [resolvedAlias, setResolvedAlias] = useState(null);

  // New Territory Form
  const [showAddTerritoryModal, setShowAddTerritoryModal] = useState(false);
  const [territoryForm, setTerritoryForm] = useState({
    territory_name: '',
    territory_type: 'TERRITORY',
    state_name: '',
    district_name: ''
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [stList, terrList] = await Promise.all([
        getStates(),
        getTerritories()
      ]);
      setStates(stList || []);
      setTerritories(terrList || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleStateChange = async (stId) => {
    setSelectedState(stId);
    setSelectedDistrict(null);
    if (!stId) {
      setDistricts([]);
      return;
    }
    const distList = await getDistricts(stId);
    setDistricts(distList || []);
  };

  const handleCreateState = async (e) => {
    e.preventDefault();
    try {
      await createState(stateForm);
      setShowAddStateModal(false);
      setStateForm({ name: '', code: '' });
      loadInitialData();
      alert('State / UT registered successfully!');
    } catch (err) {
      alert('Error registering state: ' + err.message);
    }
  };

  const handleCreateDistrict = async (e) => {
    e.preventDefault();
    if (!selectedState) {
      alert('Please select a State first!');
      return;
    }
    try {
      await createDistrict({ ...districtForm, state_id: selectedState });
      setShowAddDistrictModal(false);
      setDistrictForm({ name: '', code: '' });
      const distList = await getDistricts(selectedState);
      setDistricts(distList || []);
      alert('District registered successfully!');
    } catch (err) {
      alert('Error registering district: ' + err.message);
    }
  };

  const handleCreateSubdistrict = async (e) => {
    e.preventDefault();
    if (!selectedDistrict) {
      alert('Please select a District first!');
      return;
    }
    try {
      await createSubdistrict({ ...subdistrictForm, district_id: selectedDistrict.id });
      setShowAddSubdistrictModal(false);
      setSubdistrictForm({ name: '', code: '' });
      alert('Tehsil / Mandal registered successfully!');
    } catch (err) {
      alert('Error registering tehsil: ' + err.message);
    }
  };

  const handleTestAlias = async () => {
    if (!aliasQuery) return;
    const res = await resolveLocationAlias(aliasQuery);
    setResolvedAlias(res);
  };

  const handleCreateTerritory = async (e) => {
    e.preventDefault();
    try {
      await createTerritory(territoryForm);
      setShowAddTerritoryModal(false);
      setTerritoryForm({ territory_name: '', territory_type: 'TERRITORY', state_name: '', district_name: '' });
      loadInitialData();
      alert('Territory created successfully!');
    } catch (err) {
      alert('Error creating territory: ' + err.message);
    }
  };

  return (
    <div style={{ padding: '1rem', color: '#f8fafc' }}>
      {/* Sub-tab Switcher */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem' }}>
        <button
          onClick={() => setSubTab('locations')}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            border: 'none',
            background: subTab === 'locations' ? '#2563eb' : '#1e293b',
            color: '#ffffff',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          <Globe size={18} /> Universal Location Registration & Master
        </button>
        <button
          onClick={() => setSubTab('territories')}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            border: 'none',
            background: subTab === 'territories' ? '#2563eb' : '#1e293b',
            color: '#ffffff',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          <Compass size={18} /> Territory Builder & Assignment
        </button>
        <button
          onClick={() => setSubTab('alias')}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            border: 'none',
            background: subTab === 'alias' ? '#2563eb' : '#1e293b',
            color: '#ffffff',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          <MapPin size={18} /> Location Alias Resolver
        </button>
      </div>

      {/* 1. UNIVERSAL LOCATION REGISTRATION & MASTER */}
      {subTab === 'locations' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '280px 340px 1fr', gap: '1.25rem' }}>
            {/* 1. State Registration & Selector */}
            <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#38bdf8' }}>1. States / UTs</h3>
                <button onClick={() => setShowAddStateModal(true)} style={{ padding: '0.35rem 0.65rem', background: '#38bdf8', border: 'none', borderRadius: '6px', color: '#0f172a', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <Plus size={14} /> Add State
                </button>
              </div>
              <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
                {states.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Loading states...</div>
                ) : (
                  states.map(st => (
                    <div
                      key={st.id}
                      onClick={() => handleStateChange(st.id)}
                      style={{
                        padding: '0.6rem 0.8rem',
                        marginBottom: '0.35rem',
                        borderRadius: '6px',
                        background: selectedState === st.id ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.03)',
                        border: selectedState === st.id ? '1px solid #3b82f6' : '1px solid transparent',
                        color: selectedState === st.id ? '#60a5fa' : '#f8fafc',
                        cursor: 'pointer',
                        fontWeight: selectedState === st.id ? 700 : 400,
                        fontSize: '0.88rem',
                        display: 'flex',
                        justify: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{st.name}</span>
                        {st.code && (
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '0.15rem 0.4rem', borderRadius: '4px', background: selectedState === st.id ? 'rgba(255,255,255,0.2)' : 'rgba(56,189,248,0.15)', color: selectedState === st.id ? '#ffffff' : '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
                            {st.code}
                          </span>
                        )}
                      </div>
                      <ArrowRight size={14} style={{ opacity: selectedState === st.id ? 1 : 0.4 }} />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 2. District Registration & Selector */}
            <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#34d399' }}>
                  2. Districts {selectedState && `(${districts.length})`}
                </h3>
                {selectedState && (
                  <button onClick={() => setShowAddDistrictModal(true)} style={{ padding: '0.35rem 0.65rem', background: '#34d399', border: 'none', borderRadius: '6px', color: '#0f172a', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Plus size={14} /> Add District
                  </button>
                )}
              </div>
              {!selectedState ? (
                <div style={{ color: '#94a3b8', padding: '2rem', textAlign: 'center', fontSize: '0.85rem' }}>
                  Select a state on the left to view districts.
                </div>
              ) : districts.length === 0 ? (
                <div style={{ color: '#94a3b8', padding: '2rem', textAlign: 'center', fontSize: '0.85rem' }}>
                  No districts found. Click "+ Add District" to register a district.
                </div>
              ) : (
                <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
                  {districts.map(d => (
                    <div
                      key={d.id}
                      onClick={() => setSelectedDistrict(d)}
                      style={{
                        padding: '0.6rem 0.8rem',
                        marginBottom: '0.35rem',
                        borderRadius: '6px',
                        background: selectedDistrict?.id === d.id ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.03)',
                        border: selectedDistrict?.id === d.id ? '1px solid #10b981' : '1px solid transparent',
                        color: selectedDistrict?.id === d.id ? '#34d399' : '#f8fafc',
                        cursor: 'pointer',
                        fontWeight: selectedDistrict?.id === d.id ? 700 : 500,
                        fontSize: '0.88rem',
                        display: 'flex',
                        alignItems: 'center',
                        justify: 'space-between'
                      }}
                    >
                      <span><MapPin size={14} className="inline mr-2" />{d.name}</span>
                      <ArrowRight size={14} style={{ opacity: selectedDistrict?.id === d.id ? 1 : 0.4 }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Tehsil / Mandal / Block Breakdown & Registration */}
            <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#fbbf24' }}>
                  3. Tehsil / Mandal / Block Breakdown
                </h3>
                {selectedDistrict && (
                  <button onClick={() => setShowAddSubdistrictModal(true)} style={{ padding: '0.35rem 0.65rem', background: '#fbbf24', border: 'none', borderRadius: '6px', color: '#0f172a', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Plus size={14} /> Add Tehsil
                  </button>
                )}
              </div>
              {!selectedDistrict ? (
                <div style={{ color: '#94a3b8', padding: '3rem', textAlign: 'center', fontSize: '0.88rem' }}>
                  Select a district on the left to view Tehsils, Mandals, Blocks & Villages.
                </div>
              ) : (
                <div>
                  <div style={{ background: '#1e293b', padding: '0.85rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Selected District:</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#34d399' }}>{selectedDistrict.name}</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    {/* Tehsils / Mandals */}
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <h4 style={{ color: '#38bdf8', margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: 700 }}>Tehsils / Mandals / Talukas</h4>
                      <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                        <div>• {selectedDistrict.name} Sadar Tehsil</div>
                        <div>• {selectedDistrict.name} North Sub-Division</div>
                        <div>• {selectedDistrict.name} Rural Mandal</div>
                      </div>
                    </div>

                    {/* Development Blocks */}
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <h4 style={{ color: '#fbbf24', margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: 700 }}>Development Blocks</h4>
                      <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                        <div>• Block 1 - Central Circle</div>
                        <div>• Block 2 - Agricultural Zone</div>
                        <div>• Block 3 - Highway Belt</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. TERRITORY BUILDER & EMPLOYEE ASSIGNMENTS */}
      {subTab === 'territories' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>Sales Territories & Hierarchy</h3>
            <button onClick={() => setShowAddTerritoryModal(true)} style={{ padding: '0.5rem 1rem', background: '#10b981', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Plus size={16} /> Create Territory
            </button>
          </div>

          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#cbd5e1', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Territory Code</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Territory Name</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Type</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>State / Region</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Assigned RSM / ASM</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {territories.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                      No Territories created yet. Click "Create Territory" to set up Sales Zones & Regions.
                    </td>
                  </tr>
                ) : (
                  territories.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#f8fafc' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#38bdf8' }}>{t.territory_code}</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{t.territory_name}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{t.territory_type}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{t.state_name || 'Multi-State'}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#34d399' }}>{t.territory_employee_assignments?.[0]?.employee?.emp_name || 'Unassigned'}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(16,185,129,0.2)', color: '#34d399', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Active</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. LOCATION ALIAS RESOLVER */}
      {subTab === 'alias' && (
        <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.5rem', maxWidth: '650px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#ffffff' }}>Location Alias Resolver Engine</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Automatically normalizes non-standard raw location names (e.g. <code>Gurgaon $\rightarrow$ Gurugram</code>, <code>Dist Sirsa $\rightarrow$ Sirsa</code>, <code>Mohali $\rightarrow$ Sahibzada Ajit Singh Nagar</code>).
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            <input
              type="text"
              value={aliasQuery}
              onChange={e => setAliasQuery(e.target.value)}
              placeholder="Enter raw location name (e.g. Gurgaon)"
              style={{ flex: 1, padding: '0.65rem 0.8rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff', outline: 'none' }}
            />
            <button onClick={handleTestAlias} style={{ padding: '0.65rem 1.2rem', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              Resolve Alias
            </button>
          </div>

          {resolvedAlias && (
            <div style={{ background: '#1e293b', border: '1px solid #10b981', padding: '1rem', borderRadius: '8px', color: '#ffffff' }}>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Resolved Official Name:</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#34d399', marginTop: '0.2rem' }}>{resolvedAlias}</div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD STATE */}
      {showAddStateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '420px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#ffffff' }}>Register New State / UT</h3>
            <form onSubmit={handleCreateState}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'block', marginBottom: '0.3rem' }}>State / UT Name *</label>
                <input type="text" required value={stateForm.name} onChange={e => setStateForm({ ...stateForm, name: e.target.value })} placeholder="e.g. Telangana" style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'block', marginBottom: '0.3rem' }}>State Code (Optional)</label>
                <input type="text" value={stateForm.code} onChange={e => setStateForm({ ...stateForm, code: e.target.value })} placeholder="e.g. TS" style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" onClick={() => setShowAddStateModal(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#cbd5e1', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#38bdf8', border: 'none', borderRadius: '8px', color: '#0f172a', fontWeight: 700, cursor: 'pointer' }}>Register State</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD DISTRICT */}
      {showAddDistrictModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '420px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#ffffff' }}>Register New District</h3>
            <form onSubmit={handleCreateDistrict}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'block', marginBottom: '0.3rem' }}>District Name *</label>
                <input type="text" required value={districtForm.name} onChange={e => setDistrictForm({ ...districtForm, name: e.target.value })} placeholder="e.g. Ludhiana" style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" onClick={() => setShowAddDistrictModal(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#cbd5e1', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#34d399', border: 'none', borderRadius: '8px', color: '#0f172a', fontWeight: 700, cursor: 'pointer' }}>Register District</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD TEHSIL / SUBDISTRICT */}
      {showAddSubdistrictModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '420px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#ffffff' }}>Register Tehsil / Mandal / Taluka</h3>
            <form onSubmit={handleCreateSubdistrict}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'block', marginBottom: '0.3rem' }}>Tehsil / Mandal Name *</label>
                <input type="text" required value={subdistrictForm.name} onChange={e => setSubdistrictForm({ ...subdistrictForm, name: e.target.value })} placeholder="e.g. Khanna Tehsil" style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" onClick={() => setShowAddSubdistrictModal(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#cbd5e1', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#fbbf24', border: 'none', borderRadius: '8px', color: '#0f172a', fontWeight: 700, cursor: 'pointer' }}>Register Tehsil</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE TERRITORY MODAL */}
      {showAddTerritoryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '480px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#ffffff' }}>Create Sales Territory</h3>
            <form onSubmit={handleCreateTerritory}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'block', marginBottom: '0.3rem' }}>Territory Name *</label>
                <input type="text" required value={territoryForm.territory_name} onChange={e => setTerritoryForm({ ...territoryForm, territory_name: e.target.value })} placeholder="e.g. Malwa South Territory" style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'block', marginBottom: '0.3rem' }}>Territory Type</label>
                <select value={territoryForm.territory_type} onChange={e => setTerritoryForm({ ...territoryForm, territory_type: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}>
                  <option value="ZONE">ZONE</option>
                  <option value="REGION">REGION</option>
                  <option value="TERRITORY">TERRITORY</option>
                  <option value="SALES_AREA">SALES AREA</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" onClick={() => setShowAddTerritoryModal(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#cbd5e1', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#10b981', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Create Territory</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
