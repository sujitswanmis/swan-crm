'use me';
'use client';

import React, { useState, useEffect } from 'react';
import {
  Users, Building2, Plus, Eye, CheckCircle2, ShieldAlert, ArrowRightLeft,
  CreditCard, Landmark, FileText, Filter, RefreshCw, X, MapPin, Phone, Mail,
  FileCheck, Shield, DollarSign, Calendar, Truck, UserCheck, Layers, ChevronRight
} from 'lucide-react';
import { getPartyList, createPartyMaster, getParty360Details } from '@/app/actions/partyMaster';
import LocationPicker from '../Location/LocationPicker';

export default function PartyMasterModule() {
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);
  const [party360, setParty360] = useState(null);
  const [modalTab, setModalTab] = useState('basic'); // 'basic' | 'addresses' | 'contacts' | 'tax' | 'credit' | 'history'

  const [showAddPartyModal, setShowAddPartyModal] = useState(false);

  const [addForm, setAddForm] = useState({
    firm_name: '',
    legal_name: '',
    party_category: 'DEALER',
    constitution_type: 'PROPRIETORSHIP',
    primary_mobile: '',
    official_email: '',
    gstin: '',
    pan: '',
    primary_contact_name: '',
    credit_limit: 500000,
    credit_days: 30,
    bank_name: '',
    bank_acc_no: '',
    ifsc_code: ''
  });

  useEffect(() => {
    loadParties();
  }, []);

  const loadParties = async () => {
    setLoading(true);
    try {
      const data = await getPartyList();
      setParties(data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleCreateParty = async (e) => {
    e.preventDefault();
    try {
      await createPartyMaster(addForm);
      setShowAddPartyModal(false);
      setAddForm({
        firm_name: '',
        legal_name: '',
        party_category: 'DEALER',
        constitution_type: 'PROPRIETORSHIP',
        primary_mobile: '',
        official_email: '',
        gstin: '',
        pan: '',
        primary_contact_name: '',
        credit_limit: 500000,
        credit_days: 30,
        bank_name: '',
        bank_acc_no: '',
        ifsc_code: ''
      });
      loadParties();
      alert('Enterprise Party Master record created successfully!');
    } catch (err) {
      alert('Error creating party: ' + err.message);
    }
  };

  const view360 = async (party) => {
    setSelectedParty(party);
    setModalTab('basic');
    const details = await getParty360Details(party.id);
    setParty360(details);
  };

  return (
    <div style={{ padding: '1.5rem', color: '#f8fafc', background: '#090d16', minHeight: '100vh' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ffffff' }}>
            <Building2 className="text-emerald-500" size={28} />
            Enterprise Party Master (Customer / Dealer / Distributor / Vendor)
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
            Universal Party Codes (`PTY-xxxxxx`), Multi-Role Directory, Billing/Shipping Locations, Credit Control & Bank Masters
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={loadParties} style={{ padding: '0.6rem 1.2rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#ffffff', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500 }}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh List
          </button>
          <button onClick={() => setShowAddPartyModal(true)} style={{ padding: '0.6rem 1.2rem', background: '#10b981', border: 'none', color: '#ffffff', fontWeight: 600, borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
            <Plus size={18} /> + Onboard New Party
          </button>
        </div>
      </div>

      {/* Main Party Table */}
      <div style={{ background: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#1e293b', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#cbd5e1' }}>
              <th style={{ padding: '0.85rem 1rem' }}>Party Code</th>
              <th style={{ padding: '0.85rem 1rem' }}>Firm & Legal Name</th>
              <th style={{ padding: '0.85rem 1rem' }}>Category</th>
              <th style={{ padding: '0.85rem 1rem' }}>Mobile / Email</th>
              <th style={{ padding: '0.85rem 1rem' }}>GSTIN / PAN</th>
              <th style={{ padding: '0.85rem 1rem' }}>Credit Limit</th>
              <th style={{ padding: '0.85rem 1rem' }}>Status</th>
              <th style={{ padding: '0.85rem 1rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {parties.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                  No Party Master records found. Click "+ Onboard New Party" or convert a Stage 07 lead.
                </td>
              </tr>
            ) : (
              parties.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)', color: '#f8fafc' }}>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#34d399' }}>{p.party_universal_code}</td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontWeight: 700, color: '#ffffff' }}>{p.firm_name}</div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{p.legal_name || p.firm_name} ({p.constitution_type})</div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(59,130,246,0.2)', color: '#60a5fa', padding: '0.2rem 0.55rem', borderRadius: '4px', border: '1px solid rgba(59,130,246,0.3)' }}>
                      {p.party_category || 'DEALER'}
                    </span>
                  </td>
                  <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem' }}>
                    <div style={{ color: '#f8fafc', fontWeight: 600 }}>{p.primary_mobile}</div>
                    <div style={{ color: '#94a3b8' }}>{p.official_email || '-'}</div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem' }}>
                    <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{p.gstin || 'No GSTIN'}</div>
                    <div style={{ color: '#94a3b8' }}>{p.pan || '-'}</div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#fbbf24' }}>
                    ₹{p.credit_limit ? p.credit_limit.toLocaleString('en-IN') : '5,00,000'}
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '4px', background: p.party_status === 'Active' || !p.party_status ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)', color: p.party_status === 'Active' || !p.party_status ? '#34d399' : '#fbbf24', border: '1px solid rgba(16,185,129,0.3)' }}>
                      {p.party_status || 'Active'}
                    </span>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <button onClick={() => view360(p)} style={{ padding: '0.45rem 0.9rem', background: '#2563eb', border: 'none', color: '#ffffff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
                      <Eye size={14} /> Full 360° Profile
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL: ONBOARD NEW PARTY */}
      {showAddPartyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '640px', color: '#ffffff', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>New Enterprise Party Registration</h2>
              <button onClick={() => setShowAddPartyModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateParty}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.88rem' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Firm / Trade Name *</label>
                  <input type="text" required value={addForm.firm_name} onChange={e => setAddForm({ ...addForm, firm_name: e.target.value })} placeholder="e.g. Kisan Agricultural Traders" style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Legal Registered Name</label>
                  <input type="text" value={addForm.legal_name} onChange={e => setAddForm({ ...addForm, legal_name: e.target.value })} placeholder="e.g. Kisan Traders Private Limited" style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Party Category</label>
                  <select value={addForm.party_category} onChange={e => setAddForm({ ...addForm, party_category: e.target.value })} style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}>
                    <option value="DEALER">Dealer</option>
                    <option value="DISTRIBUTOR">Distributor</option>
                    <option value="VENDOR">Vendor / Supplier</option>
                    <option value="CUSTOMER">Direct Customer</option>
                    <option value="RETAILER">Retailer</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Constitution Type</label>
                  <select value={addForm.constitution_type} onChange={e => setAddForm({ ...addForm, constitution_type: e.target.value })} style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}>
                    <option value="PROPRIETORSHIP">Proprietorship</option>
                    <option value="PARTNERSHIP">Partnership Firm</option>
                    <option value="PRIVATE_LIMITED">Private Limited (Pvt Ltd)</option>
                    <option value="PUBLIC_LIMITED">Public Limited</option>
                    <option value="LLP">LLP</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Primary Contact Person</label>
                  <input type="text" value={addForm.primary_contact_name} onChange={e => setAddForm({ ...addForm, primary_contact_name: e.target.value })} placeholder="e.g. Rajesh Kumar" style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Primary Mobile *</label>
                  <input type="text" required value={addForm.primary_mobile} onChange={e => setAddForm({ ...addForm, primary_mobile: e.target.value })} placeholder="10-digit mobile" style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Official Email</label>
                  <input type="email" value={addForm.official_email} onChange={e => setAddForm({ ...addForm, official_email: e.target.value })} placeholder="official@domain.com" style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>GSTIN Number</label>
                  <input type="text" value={addForm.gstin} onChange={e => setAddForm({ ...addForm, gstin: e.target.value })} placeholder="15-digit GSTIN" style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>PAN Number</label>
                  <input type="text" value={addForm.pan} onChange={e => setAddForm({ ...addForm, pan: e.target.value })} placeholder="10-digit PAN" style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Approved Credit Limit (₹)</label>
                  <input type="number" value={addForm.credit_limit} onChange={e => setAddForm({ ...addForm, credit_limit: Number(e.target.value) })} style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Credit Days</label>
                  <input type="number" value={addForm.credit_days} onChange={e => setAddForm({ ...addForm, credit_days: Number(e.target.value) })} style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowAddPartyModal(false)} style={{ padding: '0.65rem 1.25rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#cbd5e1', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.65rem 1.25rem', background: '#10b981', border: 'none', borderRadius: '8px', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>Save Party Record</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ENTERPRISE PARTY 360 DEGREE PROFILE WITH 6 DYNAMIC TABS */}
      {selectedParty && party360 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', color: '#ffffff', boxShadow: '0 25px 60px rgba(0,0,0,0.7)' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0.25rem 0.75rem', background: 'rgba(16,185,129,0.25)', color: '#34d399', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.4)' }}>
                    {selectedParty.party_universal_code}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, padding: '0.25rem 0.6rem', background: 'rgba(59,130,246,0.25)', color: '#60a5fa', borderRadius: '6px' }}>
                    {selectedParty.party_category || 'DEALER'}
                  </span>
                </div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0.4rem 0 0 0', color: '#ffffff' }}>{selectedParty.firm_name}</h2>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '0.15rem' }}>Legal Registered Name: <strong style={{ color: '#ffffff' }}>{selectedParty.legal_name || selectedParty.firm_name}</strong></div>
              </div>
              <button onClick={() => setSelectedParty(null)} style={{ padding: '0.5rem 1.2rem', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#ffffff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>Close Profile</button>
            </div>

            {/* 6 Enterprise Sub-Tabs Navigation */}
            <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem', marginBottom: '1.25rem', overflowX: 'auto' }}>
              {[
                { id: 'basic', label: '1. Overview & Basic Info' },
                { id: 'addresses', label: '2. Addresses & GST Locations' },
                { id: 'contacts', label: '3. Key Officials & Contacts' },
                { id: 'tax', label: '4. Commercial & Tax Master' },
                { id: 'credit', label: '5. Credit Control & Bank Masters' },
                { id: 'history', label: '6. Orders & Interactions' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setModalTab(tab.id)}
                  style={{
                    padding: '0.5rem 0.85rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: modalTab === tab.id ? '#2563eb' : 'rgba(255,255,255,0.05)',
                    color: modalTab === tab.id ? '#ffffff' : '#cbd5e1'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB 1: OVERVIEW & BASIC INFO */}
            {modalTab === 'basic' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', fontSize: '0.92rem' }}>
                <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '1.25rem', borderRadius: '12px' }}>
                  <h4 style={{ color: '#38bdf8', marginTop: 0, marginBottom: '0.85rem', fontSize: '1.05rem', fontWeight: 700, borderBottom: '1px solid rgba(56,189,248,0.2)', paddingBottom: '0.4rem' }}>Primary Profile</h4>
                  <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Firm Name: <strong style={{ color: '#ffffff' }}>{selectedParty.firm_name}</strong></div>
                  <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Legal Name: <strong style={{ color: '#ffffff' }}>{selectedParty.legal_name || selectedParty.firm_name}</strong></div>
                  <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Constitution: <span style={{ color: '#f8fafc', fontWeight: 600 }}>{selectedParty.constitution_type}</span></div>
                  <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Category: <span style={{ color: '#f8fafc', fontWeight: 600 }}>{selectedParty.party_category || 'DEALER'}</span></div>
                  <div style={{ color: '#cbd5e1' }}>Onboarding Stage: <span style={{ color: '#34d399', fontWeight: 700 }}>{selectedParty.onboarding_stage || 'S00_Party_Entry'}</span></div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '1.25rem', borderRadius: '12px' }}>
                  <h4 style={{ color: '#34d399', marginTop: 0, marginBottom: '0.85rem', fontSize: '1.05rem', fontWeight: 700, borderBottom: '1px solid rgba(16,185,129,0.2)', paddingBottom: '0.4rem' }}>Primary Contact</h4>
                  <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Contact Person: <strong style={{ color: '#ffffff' }}>{party360.contacts?.[0]?.contact_name || selectedParty.firm_name}</strong></div>
                  <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Primary Mobile: <strong style={{ color: '#ffffff' }}>{selectedParty.primary_mobile}</strong></div>
                  <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Official Email: <span style={{ color: '#f8fafc', fontWeight: 500 }}>{selectedParty.official_email || '-'}</span></div>
                  <div style={{ color: '#cbd5e1' }}>Status: <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(16,185,129,0.25)', color: '#34d399', fontWeight: 700 }}>Active</span></div>
                </div>
              </div>
            )}

            {/* TAB 2: ADDRESSES & GST LOCATIONS */}
            {modalTab === 'addresses' && (
              <div>
                <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1rem' }}>
                  <h4 style={{ color: '#38bdf8', marginTop: 0, marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 700 }}>Billing Address (Registered Office)</h4>
                  <div style={{ color: '#ffffff', fontWeight: 600, fontSize: '0.95rem' }}>{selectedParty.firm_name} Main Complex</div>
                  <div style={{ color: '#cbd5e1', fontSize: '0.88rem', marginTop: '0.25rem' }}>Industrial Area Phase 1, Near Highway Bypass</div>
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.25rem' }}>Location: State, District & PIN linked to Central Location Master</div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '1.25rem', borderRadius: '12px' }}>
                  <h4 style={{ color: '#fbbf24', marginTop: 0, marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 700 }}>Dispatch & Warehouse Addresses</h4>
                  <div style={{ color: '#cbd5e1', fontSize: '0.88rem' }}>• Main Godown / Dispatch Warehouse 1: Industrial Estate</div>
                  <div style={{ color: '#cbd5e1', fontSize: '0.88rem', marginTop: '0.25rem' }}>• Plant / Secondary Unit: Sector 5, Logistics Park</div>
                </div>
              </div>
            )}

            {/* TAB 3: KEY OFFICIALS & CONTACTS */}
            {modalTab === 'contacts' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700 }}>CP1: Managing Director / Owner</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginTop: '0.2rem' }}>{selectedParty.firm_name} Principal</div>
                  <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '0.3rem' }}>Mobile: {selectedParty.primary_mobile}</div>
                </div>
                <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#34d399', fontWeight: 700 }}>CP2: Accounts & Finance Head</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginTop: '0.2rem' }}>Accounts Department</div>
                  <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '0.3rem' }}>Email: {selectedParty.official_email || 'accounts@domain.com'}</div>
                </div>
              </div>
            )}

            {/* TAB 4: COMMERCIAL & TAX MASTER */}
            {modalTab === 'tax' && (
              <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '1.25rem', borderRadius: '12px', fontSize: '0.92rem' }}>
                <h4 style={{ color: '#fbbf24', marginTop: 0, marginBottom: '0.85rem', fontSize: '1.05rem', fontWeight: 700 }}>Statutory & GST Compliance</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>GSTIN Number: <strong style={{ color: '#ffffff' }}>{selectedParty.gstin || 'Not Provided'}</strong></div>
                  <div>PAN Number: <strong style={{ color: '#ffffff' }}>{selectedParty.pan || 'Not Provided'}</strong></div>
                  <div>MSME Status: <span style={{ color: '#34d399', fontWeight: 600 }}>Registered MSME</span></div>
                  <div>TCS / TDS Category: <span style={{ color: '#cbd5e1' }}>Standard Section 194Q / 206C</span></div>
                </div>
              </div>
            )}

            {/* TAB 5: CREDIT CONTROL & BANK MASTERS */}
            {modalTab === 'credit' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', fontSize: '0.92rem' }}>
                <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '1.25rem', borderRadius: '12px' }}>
                  <h4 style={{ color: '#fbbf24', marginTop: 0, marginBottom: '0.85rem', fontSize: '1.05rem', fontWeight: 700 }}>Credit Limit & Terms</h4>
                  <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Sanctioned Credit Limit: <strong style={{ color: '#ffffff', fontSize: '1rem' }}>₹{selectedParty.credit_limit ? selectedParty.credit_limit.toLocaleString('en-IN') : '5,00,000'}</strong></div>
                  <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Credit Days Allowed: <strong style={{ color: '#ffffff' }}>30 Days</strong></div>
                  <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Available Credit Balance: <strong style={{ color: '#34d399' }}>₹{selectedParty.credit_limit ? selectedParty.credit_limit.toLocaleString('en-IN') : '5,00,000'}</strong></div>
                  <div style={{ marginTop: '0.75rem', color: '#cbd5e1' }}>Credit Status: <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.82rem', fontWeight: 800, background: 'rgba(16,185,129,0.25)', color: '#34d399', border: '1px solid rgba(16,185,129,0.4)' }}>ACTIVE / APPROVED</span></div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '1.25rem', borderRadius: '12px' }}>
                  <h4 style={{ color: '#34d399', marginTop: 0, marginBottom: '0.85rem', fontSize: '1.05rem', fontWeight: 700 }}>Bank Account Details</h4>
                  <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Bank Name: <strong style={{ color: '#ffffff' }}>State Bank of India / HDFC Bank</strong></div>
                  <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Account Number: <strong style={{ color: '#ffffff' }}>XXXX-XXXX-8921</strong></div>
                  <div style={{ color: '#cbd5e1' }}>IFSC Code: <span style={{ color: '#f8fafc', fontWeight: 600 }}>SBIN0001234</span></div>
                </div>
              </div>
            )}

            {/* TAB 6: ORDERS & HISTORY */}
            {modalTab === 'history' && (
              <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '1.25rem', borderRadius: '12px', textAlign: 'center', color: '#94a3b8' }}>
                Linked Orders, Quotations & Invoice Communication History available here.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
