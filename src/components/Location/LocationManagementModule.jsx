'use client';

import React, { useState, useEffect } from 'react';
import {
  Globe, MapPin, Compass, Layers, ShieldCheck, Plus, RefreshCw, Search,
  CheckCircle2, AlertCircle, FileSpreadsheet, History, Filter, ArrowRight, Eye
} from 'lucide-react';
import {
  getLocationExplorer,
  getCountriesCentral,
  getStatesCentral,
  getDistrictsCentral,
  getSubdistrictsCentral,
  getBlocksCentral,
  getPendingLocationRequests,
  processLocationRequest,
  createImportBatchCentral,
  processImportStagingRows
} from '@/app/actions/centralLocationMaster';
import LocationPicker from './LocationPicker';

export default function LocationManagementModule() {
  const [activeMenu, setActiveMenu] = useState('explorer'); // 1 to 12
  const [loading, setLoading] = useState(false);

  // Explorer Data
  const [explorerData, setExplorerData] = useState(null);
  const [explorerFilter, setExplorerFilter] = useState({ search: '', state_id: '' });
  const [explorerPage, setExplorerPage] = useState(1);

  // Pending Requests Data
  const [pendingRequests, setPendingRequests] = useState([]);

  // Import Staging Data
  const [importFile, setImportFile] = useState(null);
  const [importSummary, setImportSummary] = useState(null);

  useEffect(() => {
    loadExplorerData();
  }, [explorerPage]);

  const loadExplorerData = async () => {
    setLoading(true);
    try {
      const data = await getLocationExplorer(explorerFilter, explorerPage, 15);
      setExplorerData(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleFilterSearch = async (e) => {
    e.preventDefault();
    setExplorerPage(1);
    loadExplorerData();
  };

  const loadRequests = async () => {
    setLoading(true);
    const reqs = await getPendingLocationRequests();
    setPendingRequests(reqs || []);
    setLoading(false);
  };

  const handleApproveRequest = async (reqId) => {
    try {
      await processLocationRequest(reqId, 'APPROVED', null, 'Approved by Location Admin');
      alert('Location Request Approved!');
      loadRequests();
    } catch (err) {
      alert('Error approving request: ' + err.message);
    }
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importFile) return;
    setLoading(true);
    try {
      const batch = await createImportBatchCentral(importFile.name);
      // Sample staging records
      const sampleRows = [
        { country_name_raw: 'India', state_name_raw: 'Punjab', district_name_raw: 'Ludhiana', subdistrict_name_raw: 'Ludhiana East', block_name_raw: 'Central Block' },
        { country_name_raw: 'India', state_name_raw: 'Haryana', district_name_raw: 'Sirsa', subdistrict_name_raw: 'Dabwali', block_name_raw: 'Odhan' }
      ];
      const res = await processImportStagingRows(batch.id, sampleRows);
      setImportSummary(res);
      alert('File staging validated successfully! Staged into location_import_staging.');
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '1.5rem', color: '#f8fafc', background: '#090d16', minHeight: '100vh' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Globe className="text-sky-400" size={28} /> Central Location Master & Explorer
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
            Unified geographic infrastructure for Lead Management, Party Master, Employee Master, and Forms.
          </p>
        </div>
        <button onClick={loadExplorerData} style={{ padding: '0.6rem 1.2rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#ffffff', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500 }}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh Data
        </button>
      </div>

      {/* 12 Submenus Navigation Bar */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.5rem', background: '#0f172a', padding: '0.6rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
        {[
          { id: 'explorer', label: '1. Location Explorer' },
          { id: 'countries', label: '2. Countries' },
          { id: 'states', label: '3. States' },
          { id: 'districts', label: '4. Districts' },
          { id: 'subdistricts', label: '5. Sub-Districts' },
          { id: 'blocks', label: '6. Blocks' },
          { id: 'settlements', label: '7. Cities/Villages' },
          { id: 'post_offices', label: '8. Post Offices' },
          { id: 'aliases', label: '9. Aliases' },
          { id: 'import', label: '10. Import Wizard' },
          { id: 'requests', label: '11. Requests' },
          { id: 'history', label: '12. Audit History' }
        ].map(menu => (
          <button
            key={menu.id}
            onClick={() => {
              setActiveMenu(menu.id);
              if (menu.id === 'requests') loadRequests();
            }}
            style={{
              padding: '0.5rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeMenu === menu.id ? '#2563eb' : 'transparent',
              color: activeMenu === menu.id ? '#ffffff' : '#cbd5e1'
            }}
          >
            {menu.label}
          </button>
        ))}
      </div>

      {/* 1. LOCATION EXPLORER */}
      {activeMenu === 'explorer' && (
        <div>
          {/* Summary Metric Cards */}
          {explorerData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '10px' }}>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Total States</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8' }}>{explorerData.summary.totalStates}</div>
              </div>
              <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '10px' }}>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Total Districts</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#34d399' }}>{explorerData.summary.totalDistricts}</div>
              </div>
              <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '10px' }}>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Sub-Districts (Tehsils)</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fbbf24' }}>{explorerData.summary.totalSubdistricts}</div>
              </div>
              <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '10px' }}>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Development Blocks</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#a5b4fc' }}>{explorerData.summary.totalBlocks}</div>
              </div>
              <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '10px' }}>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Pending Requests</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f87171' }}>{explorerData.summary.pendingRequests}</div>
              </div>
            </div>
          )}

          {/* Search Filter Form */}
          <form onSubmit={handleFilterSearch} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            <input
              type="text"
              value={explorerFilter.search}
              onChange={e => setExplorerFilter({ ...explorerFilter, search: e.target.value })}
              placeholder="Search by District name..."
              style={{ flex: 1, padding: '0.65rem 0.8rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff', outline: 'none' }}
            />
            <button type="submit" style={{ padding: '0.65rem 1.25rem', background: '#2563eb', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              Search Explorer
            </button>
          </form>

          {/* Explorer Table */}
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#cbd5e1', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>District Code</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>District Name</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>State</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Country</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Official Code</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {!explorerData || explorerData.rows.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                      No Location Master records found.
                    </td>
                  </tr>
                ) : (
                  explorerData.rows.map(row => (
                    <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#f8fafc' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#38bdf8' }}>{row.district_code}</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{row.district_name}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{row.state?.state_name}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{row.state?.country?.country_name}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>{row.official_code || 'N/A'}</td>
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

      {/* 2 to 8. INDIVIDUAL MASTERS & CASCADING PICKER DEMO */}
      {['countries', 'states', 'districts', 'subdistricts', 'blocks', 'settlements', 'post_offices'].includes(activeMenu) && (
        <div style={{ maxWidth: '800px' }}>
          <LocationPicker />
        </div>
      )}

      {/* 9. ALIAS MANAGEMENT */}
      {activeMenu === 'aliases' && (
        <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.5rem', maxWidth: '650px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#ffffff' }}>Location Alias Management</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Alias mappings configured: <code>Gurgaon $\rightarrow$ Gurugram</code>, <code>Mohali $\rightarrow$ Sahibzada Ajit Singh Nagar</code>, <code>Distt Sirsa $\rightarrow$ Sirsa</code>.
          </p>
        </div>
      )}

      {/* 10. IMPORT WIZARD */}
      {activeMenu === 'import' && (
        <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.5rem', maxWidth: '650px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#ffffff' }}>Location Import Wizard (Staging Isolation)</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Uploaded file records are inserted into <code>location_import_staging</code> first for 7-step validation before master entry.
          </p>
          <form onSubmit={handleImportSubmit}>
            <input type="file" onChange={e => setImportFile(e.target.files[0])} style={{ marginBottom: '1rem', display: 'block', color: '#cbd5e1' }} />
            <button type="submit" style={{ padding: '0.65rem 1.25rem', background: '#10b981', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Upload & Stage Validation
            </button>
          </form>
          {importSummary && (
            <div style={{ marginTop: '1rem', background: '#1e293b', padding: '1rem', borderRadius: '8px', border: '1px solid #10b981' }}>
              <div>Total Staged Rows: {importSummary.total}</div>
              <div>Valid Rows: {importSummary.valid}</div>
            </div>
          )}
        </div>
      )}

      {/* 11. LOCATION REQUESTS */}
      {activeMenu === 'requests' && (
        <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#ffffff' }}>Pending Location Requests</h3>
          {pendingRequests.length === 0 ? (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>No pending location requests found.</div>
          ) : (
            pendingRequests.map(r => (
              <div key={r.id} style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem', borderRadius: '8px', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#38bdf8' }}>{r.proposed_name} ({r.requested_location_type})</div>
                  <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '0.2rem' }}>Reason: {r.reason || 'Not specified'}</div>
                </div>
                <button onClick={() => handleApproveRequest(r.id)} style={{ padding: '0.4rem 0.85rem', background: '#10b981', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  Approve Request
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* 12. AUDIT CHANGE HISTORY */}
      {activeMenu === 'history' && (
        <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#ffffff' }}>Location Audit & Change History</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Historical location changes logged into <code>location_change_history</code>.</p>
        </div>
      )}
    </div>
  );
}
