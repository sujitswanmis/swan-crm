'use me';
'use client';

import React, { useState, useEffect } from 'react';
import { Users, Building2, Plus, Eye, CheckCircle2, ShieldAlert, ArrowRightLeft, CreditCard, Landmark, FileText, Filter, RefreshCw, X } from 'lucide-react';
import { getPartyList, createPartyMaster, getParty360Details } from '@/app/actions/partyMaster';

export default function PartyMasterModule() {
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);
  const [party360, setParty360] = useState(null);
  const [showAddPartyModal, setShowAddPartyModal] = useState(false);

  const [addForm, setAddForm] = useState({
    firm_name: '',
    legal_name: '',
    constitution_type: 'PROPRIETORSHIP',
    primary_mobile: '',
    official_email: '',
    gstin: '',
    pan: '',
    primary_contact_name: ''
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
        constitution_type: 'PROPRIETORSHIP',
        primary_mobile: '',
        official_email: '',
        gstin: '',
        pan: '',
        primary_contact_name: ''
      });
      loadParties();
      alert('Party Master record created successfully!');
    } catch (err) {
      alert('Error creating party: ' + err.message);
    }
  };

  const view360 = async (party) => {
    setSelectedParty(party);
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
            Fully Managed Party Master & Onboarding
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
            Universal Party Codes (PTY-xxxxxx), Multi-Role (Dealer/Distributor/Vendor/Customer), Billing Routes & Credit Terms
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={loadParties} style={{ padding: '0.6rem 1.2rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#ffffff', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500 }}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={() => setShowAddPartyModal(true)} style={{ padding: '0.6rem 1.2rem', background: '#10b981', border: 'none', color: '#ffffff', fontWeight: 600, borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
            <Plus size={18} /> New Party Onboarding
          </button>
        </div>
      </div>

      {/* Main Party Table */}
      <div style={{ background: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#1e293b', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#cbd5e1' }}>
              <th style={{ padding: '0.85rem 1rem' }}>Party Code</th>
              <th style={{ padding: '0.85rem 1rem' }}>Firm Name</th>
              <th style={{ padding: '0.85rem 1rem' }}>Mobile / Email</th>
              <th style={{ padding: '0.85rem 1rem' }}>Constitution</th>
              <th style={{ padding: '0.85rem 1rem' }}>GSTIN / PAN</th>
              <th style={{ padding: '0.85rem 1rem' }}>Onboarding Stage</th>
              <th style={{ padding: '0.85rem 1rem' }}>Status</th>
              <th style={{ padding: '0.85rem 1rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {parties.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                  No Party Master records found. Click "New Party Onboarding" or convert a Stage 07 lead.
                </td>
              </tr>
            ) : (
              parties.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)', color: '#f8fafc' }}>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#34d399' }}>{p.party_universal_code}</td>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: '#ffffff' }}>{p.firm_name}</td>
                  <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem' }}>
                    <div style={{ color: '#f8fafc', fontWeight: 600 }}>{p.primary_mobile}</div>
                    <div style={{ color: '#94a3b8' }}>{p.official_email || '-'}</div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: '#e2e8f0' }}>{p.constitution_type}</td>
                  <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem' }}>
                    <div style={{ color: '#e2e8f0' }}>{p.gstin || 'No GSTIN'}</div>
                    <div style={{ color: '#94a3b8' }}>{p.pan || ''}</div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '0.25rem 0.6rem', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                      {p.onboarding_stage}
                    </span>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '4px', background: p.party_status === 'Active' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)', color: p.party_status === 'Active' ? '#34d399' : '#fbbf24', border: p.party_status === 'Active' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(245,158,11,0.3)' }}>
                      {p.party_status}
                    </span>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <button onClick={() => view360(p)} style={{ padding: '0.4rem 0.85rem', background: '#2563eb', border: 'none', color: '#ffffff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
                      <Eye size={14} /> Party 360° View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL: ADD PARTY */}
      {showAddPartyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '580px', color: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>New Party Master Registration</h2>
              <button onClick={() => setShowAddPartyModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateParty}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 500, display: 'block', marginBottom: '0.35rem' }}>Firm / Business Name *</label>
                  <input type="text" required value={addForm.firm_name} onChange={e => setAddForm({ ...addForm, firm_name: e.target.value })} placeholder="e.g. Kisan Agricultural Traders" style={{ width: '100%', padding: '0.65rem 0.8rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 500, display: 'block', marginBottom: '0.35rem' }}>Contact Person Name</label>
                  <input type="text" value={addForm.primary_contact_name} onChange={e => setAddForm({ ...addForm, primary_contact_name: e.target.value })} placeholder="e.g. Rajesh Kumar" style={{ width: '100%', padding: '0.65rem 0.8rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 500, display: 'block', marginBottom: '0.35rem' }}>Primary Mobile *</label>
                  <input type="text" required value={addForm.primary_mobile} onChange={e => setAddForm({ ...addForm, primary_mobile: e.target.value })} placeholder="10-digit mobile" style={{ width: '100%', padding: '0.65rem 0.8rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 500, display: 'block', marginBottom: '0.35rem' }}>Official Email</label>
                  <input type="email" value={addForm.official_email} onChange={e => setAddForm({ ...addForm, official_email: e.target.value })} placeholder="trader@gmail.com" style={{ width: '100%', padding: '0.65rem 0.8rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 500, display: 'block', marginBottom: '0.35rem' }}>GSTIN</label>
                  <input type="text" value={addForm.gstin} onChange={e => setAddForm({ ...addForm, gstin: e.target.value })} placeholder="15-digit GSTIN" style={{ width: '100%', padding: '0.65rem 0.8rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 500, display: 'block', marginBottom: '0.35rem' }}>PAN Number</label>
                  <input type="text" value={addForm.pan} onChange={e => setAddForm({ ...addForm, pan: e.target.value })} placeholder="10-digit PAN" style={{ width: '100%', padding: '0.65rem 0.8rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff', outline: 'none' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowAddPartyModal(false)} style={{ padding: '0.65rem 1.25rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#cbd5e1', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
                <button type="submit" style={{ padding: '0.65rem 1.25rem', background: '#10b981', border: 'none', borderRadius: '8px', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}>Register Party</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PARTY 360 VIEW WITH HIGH-CONTRAST CRYSTAL-CLEAR TEXT */}
      {selectedParty && party360 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '750px', maxHeight: '88vh', overflowY: 'auto', color: '#ffffff', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0.25rem 0.75rem', background: 'rgba(16,185,129,0.25)', color: '#34d399', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.4)', display: 'inline-block' }}>
                  {selectedParty.party_universal_code}
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.5rem 0 0 0', color: '#ffffff' }}>{selectedParty.firm_name}</h2>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '0.2rem' }}>Legal Name: <strong style={{ color: '#ffffff' }}>{selectedParty.legal_name || selectedParty.firm_name}</strong></div>
              </div>
              <button onClick={() => setSelectedParty(null)} style={{ padding: '0.5rem 1rem', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#ffffff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>Close</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', fontSize: '0.92rem' }}>
              {/* Box 1: Basic & Contact Info */}
              <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '1.25rem', borderRadius: '12px' }}>
                <h4 style={{ color: '#38bdf8', marginTop: 0, marginBottom: '0.85rem', fontSize: '1.05rem', fontWeight: 700, borderBottom: '1px solid rgba(56,189,248,0.2)', paddingBottom: '0.4rem' }}>Basic & Contact Info</h4>
                <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Contact Person: <strong style={{ color: '#ffffff', fontSize: '0.95rem' }}>{party360.contacts?.[0]?.contact_name || selectedParty.firm_name}</strong></div>
                <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Primary Mobile: <strong style={{ color: '#ffffff', fontSize: '0.95rem' }}>{selectedParty.primary_mobile}</strong></div>
                <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Official Email: <span style={{ color: '#f8fafc', fontWeight: 500 }}>{selectedParty.official_email || '-'}</span></div>
                <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Constitution: <span style={{ color: '#f8fafc', fontWeight: 500 }}>{selectedParty.constitution_type}</span></div>
                <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>GSTIN: <span style={{ color: '#f8fafc', fontWeight: 500 }}>{selectedParty.gstin || 'Not Provided'}</span></div>
                <div style={{ color: '#cbd5e1' }}>PAN: <span style={{ color: '#f8fafc', fontWeight: 500 }}>{selectedParty.pan || 'Not Provided'}</span></div>
              </div>

              {/* Box 2: Commercial & Credit Terms */}
              <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '1.25rem', borderRadius: '12px' }}>
                <h4 style={{ color: '#fbbf24', marginTop: 0, marginBottom: '0.85rem', fontSize: '1.05rem', fontWeight: 700, borderBottom: '1px solid rgba(251,191,36,0.2)', paddingBottom: '0.4rem' }}>Commercial & Credit Terms</h4>
                <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Credit Limit: <strong style={{ color: '#ffffff', fontSize: '0.95rem' }}>₹{party360.commercial?.credit_limit || 0}</strong></div>
                <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Available Credit: <strong style={{ color: '#ffffff' }}>₹{party360.commercial?.available_credit || 0}</strong></div>
                <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Outstanding Amount: <span style={{ color: '#f8fafc', fontWeight: 500 }}>₹{party360.commercial?.outstanding_amount || 0}</span></div>
                <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>Overdue Amount: <span style={{ color: '#f8fafc', fontWeight: 500 }}>₹{party360.commercial?.overdue_amount || 0}</span></div>
                <div style={{ marginTop: '0.75rem', color: '#cbd5e1' }}>Credit Block Status: <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.82rem', fontWeight: 800, background: party360.commercial?.credit_block_status ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)', color: party360.commercial?.credit_block_status ? '#f87171' : '#34d399', border: party360.commercial?.credit_block_status ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(16,185,129,0.4)' }}>{party360.commercial?.credit_block_status ? 'BLOCKED' : 'ACTIVE / NO BLOCK'}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
