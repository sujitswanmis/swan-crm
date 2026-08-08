'use client';

import React, { useState, useEffect } from 'react';
import {
  Globe, MapPin, Compass, Layers, ShieldCheck, Plus, RefreshCw, Search,
  CheckCircle2, AlertCircle, FileSpreadsheet, History, Filter, ArrowRight, Eye, Upload, X, Building, Check
} from 'lucide-react';
import Papa from 'papaparse';
import {
  getLocationExplorer,
  getCountriesCentral,
  getStatesCentral,
  getDistrictsCentral,
  getSubdistrictsCentral,
  getBlocksCentral,
  getSettlementsCentral,
  getPostOfficesCentral,
  createStateCentral,
  updateStateCentral,
  createDistrictCentral,
  updateDistrictCentral,
  updateSubdistrictCentral,
  updateBlockCentral,
  createSubdistrictCentral,
  createBlockCentral,
  getPendingLocationRequests,
  processLocationRequest,
  createImportBatchCentral,
  processImportStagingRows,
  exportAllLocationsCentral,
  importBulkLocationsCentral
} from '@/app/actions/centralLocationMaster';
import LocationPicker from './LocationPicker';

export default function LocationManagementModule() {
  const [activeTab, setActiveTab] = useState('explorer'); // 1 to 11
  const [loading, setLoading] = useState(false);

  // 100% Database-Driven Explorer State
  const [explorerData, setExplorerData] = useState(null);
  const [statesList, setStatesList] = useState([]);
  const [selectedStateId, setSelectedStateId] = useState('');
  const [districtsList, setDistrictsList] = useState([]);
  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [selectedDistrictObj, setSelectedDistrictObj] = useState(null);

  const [subdistrictsList, setSubdistrictsList] = useState([]);
  const [blocksList, setBlocksList] = useState([]);
  const [settlementsList, setSettlementsList] = useState([]);
  const [postOfficesList, setPostOfficesList] = useState([]);

  // Search & Filters
  const [stateSearch, setStateSearch] = useState('');
  const [districtSearch, setDistrictSearch] = useState('');

  // Modals for Registration
  const [showAddStateModal, setShowAddStateModal] = useState(false);
  const [stateForm, setStateForm] = useState({ state_name: '', state_lgd_code: '', state_short_name: '', state_type: 'STATE' });

  const [showAddDistrictModal, setShowAddDistrictModal] = useState(false);
  const [districtForm, setDistrictForm] = useState({ district_name: '', district_lgd_code: '', district_short_name: '' });

  const [showAddSubdistrictModal, setShowAddSubdistrictModal] = useState(false);
  const [subdistrictForm, setSubdistrictForm] = useState({ subdistrict_name: '', subdistrict_code: '', subdistrict_short_name: '', subdistrict_type: 'TEHSIL' });

  const [showAddBlockModal, setShowAddBlockModal] = useState(false);
  const [blockForm, setBlockForm] = useState({ block_name: '', block_code: '', block_short_name: '' });

  // Edit Modal State
  const [editingItem, setEditingItem] = useState(null); // { type: 'STATE'|'DISTRICT', data: {} }
  const [editForm, setEditForm] = useState({ name: '', code: '', official_code: '', reason: '' });

  const startEditing = (type, item) => {
    setEditingItem({ type, data: item });

    let lgd = item.lgd_code || item.official_code || item.state_lgd_code || item.district_lgd_code || item.subdistrict_code || item.block_code || '';
    let short = item.short_name || item.district_code || item.state_code || item.subdistrict_short_name || item.block_short_name || '';

    if (type === 'DISTRICT') {
      short = item.short_name || item.district_code || '';
      lgd = item.lgd_code || item.official_code || '';
      if (!lgd && item.code && item.code.includes('|')) {
        const parts = item.code.split('|');
        short = parts[0];
        lgd = parts[1] || '';
      }
    }

    setEditForm({
      name: item.name || item.state_name || item.district_name || item.subdistrict_name || item.block_name || '',
      lgd_code: lgd,
      short_name: short,
      sub_type: item.subdistrict_type || 'TEHSIL',
      reason: ''
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      if (editingItem.type === 'STATE') {
        const updated = await updateStateCentral(editingItem.data.id, {
          state_name: editForm.name,
          state_short_name: editForm.short_name,
          state_lgd_code: editForm.lgd_code,
          change_reason: editForm.reason
        });
        setStatesList(prev => prev.map(st =>
          st.id === editingItem.data.id ? { ...st, name: editForm.name, state_name: editForm.name, code: editForm.short_name, state_code: editForm.short_name } : st
        ));
      } else if (editingItem.type === 'DISTRICT') {
        const updated = await updateDistrictCentral(editingItem.data.id, {
          district_name: editForm.name,
          district_code: editForm.short_name,
          district_lgd_code: editForm.lgd_code,
          change_reason: editForm.reason
        });
        setDistrictsList(prev => prev.map(d =>
          d.id === editingItem.data.id ? {
            ...d,
            name: editForm.name,
            district_name: editForm.name,
            code: editForm.short_name,
            district_code: editForm.short_name,
            short_name: editForm.short_name,
            official_code: editForm.lgd_code,
            lgd_code: editForm.lgd_code
          } : d
        ));
        if (selectedDistrictId === editingItem.data.id) {
          setSelectedDistrictObj(prev => prev ? {
            ...prev,
            name: editForm.name,
            district_name: editForm.name,
            code: editForm.short_name,
            district_code: editForm.short_name,
            short_name: editForm.short_name,
            official_code: editForm.lgd_code,
            lgd_code: editForm.lgd_code
          } : null);
        }
      } else if (editingItem.type === 'SUBDISTRICT' || editingItem.type === 'TEHSIL') {
        const codeToSave = editForm.lgd_code || editForm.short_name;
        await updateSubdistrictCentral(editingItem.data.id, {
          subdistrict_name: editForm.name,
          subdistrict_code: codeToSave,
          subdistrict_type: editForm.sub_type
        });
        // Instant local state update
        setSubdistrictsList(prev => prev.map(s =>
          s.id === editingItem.data.id ? {
            ...s,
            name: editForm.name,
            subdistrict_name: editForm.name,
            code: codeToSave,
            subdistrict_code: codeToSave,
            subdistrict_short_name: editForm.short_name,
            subdistrict_type: editForm.sub_type || s.subdistrict_type
          } : s
        ));
        if (selectedDistrictObj) await handleDistrictClick(selectedDistrictObj);
        else if (selectedDistrictId) await handleDistrictClick(selectedDistrictId);
      } else if (editingItem.type === 'BLOCK') {
        const codeToSave = editForm.lgd_code || editForm.short_name;
        await updateBlockCentral(editingItem.data.id, {
          block_name: editForm.name,
          block_code: codeToSave
        });
        // Instant local state update
        setBlocksList(prev => prev.map(b =>
          b.id === editingItem.data.id ? {
            ...b,
            name: editForm.name,
            block_name: editForm.name,
            code: codeToSave,
            block_code: codeToSave,
            block_short_name: editForm.short_name
          } : b
        ));
        if (selectedDistrictObj) await handleDistrictClick(selectedDistrictObj);
        else if (selectedDistrictId) await handleDistrictClick(selectedDistrictId);
      }
      setEditingItem(null);
    } catch (err) {
      alert('Error updating location: ' + err.message);
    }
  };

  // Requests Data
  const [pendingRequests, setPendingRequests] = useState([]);

  // Import Staging Data
  const [importFile, setImportFile] = useState(null);
  const [importSummary, setImportSummary] = useState(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [exp, stList] = await Promise.all([
        getLocationExplorer(),
        getStatesCentral('00000000-0000-0000-0000-000000000001')
      ]);
      setExplorerData(exp);
      setStatesList(stList || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // State Selected -> Fetch Districts strictly from Database
  const handleStateClick = async (st) => {
    const stId = typeof st === 'object' ? st.id : st;
    const stName = typeof st === 'object' ? st.state_name : null;

    setSelectedStateId(stId);
    setSelectedDistrictId('');
    setSelectedDistrictObj(null);
    setDistrictsList([]);
    setSubdistrictsList([]);
    setBlocksList([]);
    setSettlementsList([]);
    setPostOfficesList([]);

    if (!stId) return;
    setLoading(true);
    const dists = await getDistrictsCentral(stId, stName);
    setDistrictsList(dists || []);
    setLoading(false);
  };

  // District Selected -> Fetch Tehsils, Blocks, Settlements, POs strictly from Database
  const handleDistrictClick = async (dist) => {
    const dId = typeof dist === 'object' ? dist.id : dist;
    const dName = typeof dist === 'object' ? (dist.name || dist.district_name) : null;

    setSelectedDistrictId(dId);
    setSelectedDistrictObj(typeof dist === 'object' ? dist : null);
    setLoading(true);
    try {
      const [subs, blks, setts, pos] = await Promise.all([
        getSubdistrictsCentral(dId, dName),
        getBlocksCentral(dId, dName),
        getSettlementsCentral(dId),
        getPostOfficesCentral('', dId)
      ]);
      setSubdistrictsList(subs || []);
      setBlocksList(blks || []);
      setSettlementsList(setts || []);
      setPostOfficesList(pos || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleCreateState = async (e) => {
    e.preventDefault();
    try {
      const newState = await createStateCentral({
        state_name: stateForm.state_name,
        state_short_name: stateForm.state_short_name,
        state_lgd_code: stateForm.state_lgd_code,
        state_type: stateForm.state_type || 'STATE',
        country_id: '00000000-0000-0000-0000-000000000001'
      });
      setShowAddStateModal(false);
      setStateForm({ state_name: '', state_lgd_code: '', state_short_name: '', state_type: 'STATE' });
      // Realtime: insert new state immediately into list
      if (newState) {
        setStatesList(prev => [...prev, newState].sort((a, b) => a.state_name.localeCompare(b.state_name)));
      } else {
        loadInitialData();
      }
    } catch (err) {
      alert('Error creating State: ' + err.message);
    }
  };

  const handleCreateDistrict = async (e) => {
    e.preventDefault();
    if (!selectedStateId) return alert('Please select a State first!');
    try {
      const newDist = await createDistrictCentral({
        district_name: districtForm.district_name,
        district_code: districtForm.district_short_name,
        official_code: districtForm.district_lgd_code,
        country_id: '00000000-0000-0000-0000-000000000001',
        state_id: selectedStateId
      });
      setShowAddDistrictModal(false);
      setDistrictForm({ district_name: '', district_lgd_code: '', district_short_name: '' });
      // Realtime: insert new district immediately into list
      if (newDist) {
        setDistrictsList(prev => [...prev, newDist].sort((a, b) => a.district_name.localeCompare(b.district_name)));
      } else {
        handleStateClick(selectedStateId);
      }
    } catch (err) {
      alert('Error creating District: ' + err.message);
    }
  };

  const handleCreateSubdistrict = async (e) => {
    e.preventDefault();
    if (!selectedDistrictId || !selectedStateId) return alert('Please select a District first!');
    try {
      const res = await createSubdistrictCentral({
        subdistrict_name: subdistrictForm.subdistrict_name,
        subdistrict_code: subdistrictForm.subdistrict_code,
        subdistrict_short_name: subdistrictForm.subdistrict_short_name,
        subdistrict_type: subdistrictForm.subdistrict_type || 'TEHSIL',
        country_id: '00000000-0000-0000-0000-000000000001',
        state_id: selectedStateId,
        district_id: selectedDistrictId,
        district_name: selectedDistrictObj?.name || selectedDistrictObj?.district_name
      });

      if (res && res.success === false) {
        alert('Error creating Tehsil: ' + (res.error || 'Failed to save to Database.'));
        return;
      }

      setShowAddSubdistrictModal(false);
      setSubdistrictForm({ subdistrict_name: '', subdistrict_code: '', subdistrict_short_name: '', subdistrict_type: 'TEHSIL' });
      // Always reload from DB to show latest data
      if (selectedDistrictObj) await handleDistrictClick(selectedDistrictObj);
    } catch (err) {
      alert('Error creating Tehsil: ' + err.message);
    }
  };

  const handleCreateBlock = async (e) => {
    e.preventDefault();
    if (!selectedDistrictId || !selectedStateId) return alert('Please select a District first!');
    try {
      const res = await createBlockCentral({
        block_name: blockForm.block_name,
        block_code: blockForm.block_code,
        block_short_name: blockForm.block_short_name,
        country_id: '00000000-0000-0000-0000-000000000001',
        state_id: selectedStateId,
        district_id: selectedDistrictId,
        district_name: selectedDistrictObj?.name || selectedDistrictObj?.district_name
      });

      if (res && res.success === false) {
        alert('Error creating Block: ' + (res.error || 'Failed to save to Database.'));
        return;
      }

      setShowAddBlockModal(false);
      setBlockForm({ block_name: '', block_code: '', block_short_name: '' });
      // Always reload from DB to show latest data
      if (selectedDistrictObj) await handleDistrictClick(selectedDistrictObj);
    } catch (err) {
      alert('Error creating Block: ' + err.message);
    }
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

  const handleExportData = async (type = 'csv') => {
    setLoading(true);
    try {
      const rows = await exportAllLocationsCentral();
      if (!rows || rows.length === 0) {
        alert('No location data available to export.');
        setLoading(false);
        return;
      }

      const csv = Papa.unparse(rows);
      const mime = type === 'excel' ? 'application/vnd.ms-excel;charset=utf-8;' : 'text/csv;charset=utf-8;';
      const ext = type === 'excel' ? 'xls' : 'csv';

      const blob = new Blob(['\uFEFF' + csv], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Swan_CRM_Location_Master_${Date.now()}.${ext}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
    setLoading(false);
  };

  const handleDownloadTemplate = () => {
    const sampleRows = [
      {
        'State Name': 'Punjab',
        'State Code': 'PB',
        'State LGD Code': '3',
        'District Name': 'Ludhiana',
        'District Short Name': 'LDH',
        'District LGD Code': '0301',
        'Tehsil / Subdistrict Name': 'Ludhiana East',
        'Subdistrict Type': 'TEHSIL',
        'Block Name': 'Central Block'
      },
      {
        'State Name': 'Haryana',
        'State Code': 'HR',
        'State LGD Code': '6',
        'District Name': 'Sirsa',
        'District Short Name': 'SRS',
        'District LGD Code': '0601',
        'Tehsil / Subdistrict Name': 'Dabwali',
        'Subdistrict Type': 'TEHSIL',
        'Block Name': 'Odhan'
      }
    ];
    const csv = Papa.unparse(sampleRows);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Location_Bulk_Import_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importFile) return alert('Please select a CSV or Excel file to upload!');
    setLoading(true);

    Papa.parse(importFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data || [];
          if (rows.length === 0) {
            alert('Uploaded file is empty or could not be parsed.');
            setLoading(false);
            return;
          }

          const res = await importBulkLocationsCentral(rows);
          if (res.success) {
            setImportSummary(res);
            alert(`🎉 Bulk Import Completed Successfully!\n\n` +
              `• Total Processed: ${res.totalProcessed}\n` +
              `• States Created: ${res.createdStates}\n` +
              `• Districts Created: ${res.createdDistricts}\n` +
              `• Tehsils Created: ${res.createdSubdistricts}\n` +
              `• Blocks Created: ${res.createdBlocks}`
            );
            loadInitialData();
          } else {
            alert('Import Error: ' + res.error);
          }
        } catch (err) {
          alert('Failed to process bulk upload: ' + err.message);
        }
        setLoading(false);
      },
      error: (err) => {
        alert('File parsing error: ' + err.message);
        setLoading(false);
      }
    });
  };

  const filteredStates = statesList.filter(s => s.state_name?.toLowerCase().includes(stateSearch.toLowerCase()));
  const filteredDistricts = districtsList.filter(d => d.district_name?.toLowerCase().includes(districtSearch.toLowerCase()));

  return (
    <div style={{ padding: '1.5rem', color: '#0f172a', background: 'var(--bg-primary, #f8fafc)', minHeight: '100vh', paddingBottom: '120px' }}>
      {/* Exact Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', background: '#ffffff', padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Globe className="text-blue-600" size={26} /> Central Location Master
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.88rem', margin: '0.35rem 0 0 0' }}>
            Manage State, District, Tehsil, Block, City, Village and PIN Code master data from one centralized location source.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleExportData('csv')}
            title="Export all location data as CSV/Excel"
            style={{ padding: '0.55rem 1.1rem', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            <FileSpreadsheet size={16} style={{ color: '#16a34a' }} /> Export Data
          </button>
          <button
            onClick={() => setActiveTab('import')}
            title="Bulk Upload CSV/Excel locations"
            style={{ padding: '0.55rem 1.1rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            <Upload size={16} style={{ color: '#2563eb' }} /> Upload File
          </button>
          <button onClick={() => setShowAddStateModal(true)} style={{ padding: '0.55rem 1.1rem', background: '#2563eb', border: 'none', color: '#ffffff', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}>
            <Plus size={16} /> Add Location
          </button>
        </div>
      </div>

      {/* 11 Sub-Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '1.5rem', background: '#ffffff', padding: '0.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        {[
          { id: 'explorer', label: '1. Explorer' },
          { id: 'states', label: '2. States / UTs' },
          { id: 'districts', label: '3. Districts' },
          { id: 'subdistricts', label: '4. Tehsil / Sub-District' },
          { id: 'blocks', label: '5. Development Blocks' },
          { id: 'settlements', label: '6. Cities / Towns / Villages' },
          { id: 'post_offices', label: '7. PIN / Post Offices' },
          { id: 'aliases', label: '8. Aliases' },
          { id: 'import', label: '9. Import' },
          { id: 'requests', label: '10. Location Requests' },
          { id: 'history', label: '11. Change History' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'requests') loadRequests();
            }}
            style={{
              padding: '0.5rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === tab.id ? '#2563eb' : 'transparent',
              color: activeTab === tab.id ? '#ffffff' : '#64748b'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. LOCATION EXPLORER (LIGHT CRM THEME) */}
      {activeTab === 'explorer' && (
        <div>
          {/* Top Summary Cards (Light Theme) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Active States / UTs</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#2563eb', marginTop: '0.2rem' }}>{explorerData?.summary?.totalStates || statesList.length}</div>
            </div>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Active Districts</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981', marginTop: '0.2rem' }}>{explorerData?.summary?.totalDistricts || 0}</div>
            </div>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Active Tehsils</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.2rem' }}>{explorerData?.summary?.totalSubdistricts || 0}</div>
            </div>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Active Blocks</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#8b5cf6', marginTop: '0.2rem' }}>{explorerData?.summary?.totalBlocks || 0}</div>
            </div>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Active Cities/Villages</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#06b6d4', marginTop: '0.2rem' }}>{explorerData?.summary?.totalSettlements || 0}</div>
            </div>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Post Offices</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#6366f1', marginTop: '0.2rem' }}>{explorerData?.summary?.totalPostOffices || 0}</div>
            </div>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Pending Requests</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ef4444', marginTop: '0.2rem' }}>{explorerData?.summary?.pendingRequests || 0}</div>
            </div>
          </div>

          {/* 3-Column Explorer Layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '260px 300px 1fr', gap: '1.25rem' }}>
            
            {/* COLUMN 1: STATES / UTS */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: '#1e293b' }}>1. States / UTs ({filteredStates.length})</h3>
                <button onClick={() => setShowAddStateModal(true)} style={{ padding: '0.25rem 0.5rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', color: '#2563eb', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <Plus size={12} /> Add
                </button>
              </div>
              <input
                type="text"
                value={stateSearch}
                onChange={e => setStateSearch(e.target.value)}
                placeholder="Search State..."
                style={{ width: '100%', padding: '0.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '0.75rem', outline: 'none' }}
              />
              <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
                {filteredStates.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '1rem', textAlign: 'center' }}>No states found in Database.</div>
                ) : (
                  filteredStates.map(st => (
                    <div
                      key={st.id}
                      onClick={() => handleStateClick(st)}
                      style={{
                        padding: '0.6rem 0.75rem',
                        marginBottom: '0.35rem',
                        borderRadius: '6px',
                        background: selectedStateId === st.id ? '#eff6ff' : '#ffffff',
                        border: selectedStateId === st.id ? '1px solid #3b82f6' : '1px solid #f1f5f9',
                        color: selectedStateId === st.id ? '#1d4ed8' : '#334155',
                        cursor: 'pointer',
                        fontWeight: selectedStateId === st.id ? 700 : 500,
                        fontSize: '0.88rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span>{st.state_name}</span>
                        {/* State Short Name badge */}
                        {st.state_code && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '0.1rem 0.35rem', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                            {st.state_code}
                          </span>
                        )}
                        {/* District Count badge */}
                        {st.district_count !== undefined && (
                          <span title="District Count in Database" style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: '4px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                            {st.district_count}
                          </span>
                        )}
                        {/* State LGD Code badge */}
                        {(st.official_code || st.state_lgd_code) && (
                          <span title="Government LGD Code" style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.3rem', borderRadius: '4px', background: '#fef9c3', color: '#a16207', border: '1px solid #fde68a' }}>
                            LGD: {st.official_code || st.state_lgd_code}
                          </span>
                        )}
                        <button
                          title="Edit State"
                          onClick={e => { e.stopPropagation(); startEditing('STATE', st); }}
                          style={{ padding: '0.1rem 0.3rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '0.68rem' }}
                        >✏️</button>
                      </div>
                      <ArrowRight size={14} style={{ opacity: selectedStateId === st.id ? 1 : 0.3 }} />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* COLUMN 2: DISTRICTS */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: '#1e293b' }}>
                  2. Districts {selectedStateId && `(${filteredDistricts.length})`}
                </h3>
                {selectedStateId && (
                  <button onClick={() => setShowAddDistrictModal(true)} style={{ padding: '0.25rem 0.5rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', color: '#059669', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Plus size={12} /> Add
                  </button>
                )}
              </div>
              {!selectedStateId ? (
                <div style={{ color: '#94a3b8', padding: '2.5rem 1rem', textAlign: 'center', fontSize: '0.85rem' }}>
                  Select a State on the left to view its Districts.
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={districtSearch}
                    onChange={e => setDistrictSearch(e.target.value)}
                    placeholder="Search District..."
                    style={{ width: '100%', padding: '0.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '0.75rem', outline: 'none' }}
                  />
                  <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
                    {filteredDistricts.length === 0 ? (
                      <div style={{ color: '#94a3b8', padding: '2rem 1rem', textAlign: 'center', fontSize: '0.85rem' }}>
                        No Districts registered in Database for this State. Click "+ Add" to register.
                      </div>
                    ) : (
                      filteredDistricts.map(d => (
                        <div
                          key={d.id}
                          onClick={() => handleDistrictClick(d)}
                          style={{
                            padding: '0.6rem 0.75rem',
                            marginBottom: '0.35rem',
                            borderRadius: '6px',
                            background: selectedDistrictId === d.id ? '#ecfdf5' : '#ffffff',
                            border: selectedDistrictId === d.id ? '1px solid #10b981' : '1px solid #f1f5f9',
                            color: selectedDistrictId === d.id ? '#047857' : '#334155',
                            cursor: 'pointer',
                            fontWeight: selectedDistrictId === d.id ? 700 : 500,
                            fontSize: '0.88rem',
                            display: 'flex',
                            alignItems: 'center',
                            justify: 'space-between'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span><MapPin size={14} className="inline mr-1 text-emerald-600" />{d.district_name}</span>
                            {d.district_code && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '4px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                                {d.district_code}
                              </span>
                            )}
                            <button
                              title="Edit District"
                              onClick={(e) => { e.stopPropagation(); startEditing('DISTRICT', d); }}
                              style={{ padding: '0.15rem 0.4rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '0.72rem' }}
                            >
                              ✏️
                            </button>
                          </div>
                          <ArrowRight size={14} style={{ opacity: selectedDistrictId === d.id ? 1 : 0.3 }} />
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* COLUMN 3: DISTRICT DETAILS BREAKDOWN */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              {!selectedDistrictObj ? (
                <div style={{ color: '#94a3b8', padding: '5rem 2rem', textAlign: 'center', fontSize: '0.9rem' }}>
                  Select a District on the left to view its Tehsils, Blocks, Cities and Villages.
                </div>
              ) : (
                <div>
                  {/* Selected District Header */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.85rem 1.1rem', borderRadius: '10px', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Selected District:</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#047857' }}>{selectedDistrictObj.district_name}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => setShowAddSubdistrictModal(true)} style={{ padding: '0.35rem 0.65rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>+ Add Tehsil</button>
                      <button onClick={() => setShowAddBlockModal(true)} style={{ padding: '0.35rem 0.65rem', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>+ Add Block</button>
                    </div>
                  </div>

                  {/* ROW 1: Tehsils Card & Development Blocks Card Side by Side */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                    {/* Tehsils Card */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '10px' }}>
                      <h4 style={{ color: '#2563eb', margin: '0 0 0.6rem 0', fontSize: '0.9rem', fontWeight: 700 }}>
                        Tehsils / Sub-Districts ({subdistrictsList.length})
                      </h4>
                      {subdistrictsList.length === 0 ? (
                        <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>No Tehsils registered yet.</div>
                      ) : (
                        <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                          {subdistrictsList.map(sub => (
                            <div key={sub.id} style={{ padding: '0.25rem 0', borderBottom: '1px border-dashed #f1f5f9' }}>
                              • <strong>{sub.subdistrict_name}</strong> ({sub.subdistrict_type})
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Development Blocks Card (Independent of Tehsil) */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '10px' }}>
                      <h4 style={{ color: '#8b5cf6', margin: '0 0 0.6rem 0', fontSize: '0.9rem', fontWeight: 700 }}>
                        Development Blocks ({blocksList.length})
                      </h4>
                      {blocksList.length === 0 ? (
                        <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>No Blocks registered yet.</div>
                      ) : (
                        <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                          {blocksList.map(blk => (
                            <div key={blk.id} style={{ padding: '0.25rem 0', borderBottom: '1px border-dashed #f1f5f9' }}>
                              • <strong>{blk.block_name}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ROW 2: Settlements Table */}
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '10px', marginBottom: '1.25rem' }}>
                    <h4 style={{ color: '#06b6d4', margin: '0 0 0.6rem 0', fontSize: '0.9rem', fontWeight: 700 }}>
                      Cities / Towns / Villages ({settlementsList.length})
                    </h4>
                    {settlementsList.length === 0 ? (
                      <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>No Settlements registered for this district.</div>
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                        {settlementsList.map(st => (
                          <div key={st.id} style={{ padding: '0.3rem 0', borderBottom: '1px solid #f1f5f9' }}>
                            • <strong>{st.settlement_name}</strong> ({st.settlement_type})
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ROW 3: PIN / Post Offices Table */}
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '10px' }}>
                    <h4 style={{ color: '#6366f1', margin: '0 0 0.6rem 0', fontSize: '0.9rem', fontWeight: 700 }}>
                      PIN Codes & Post Offices ({postOfficesList.length})
                    </h4>
                    {postOfficesList.length === 0 ? (
                      <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>No Post Offices registered for this district.</div>
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                        {postOfficesList.map(po => (
                          <div key={po.id} style={{ padding: '0.3rem 0', borderBottom: '1px solid #f1f5f9' }}>
                            • <strong>PIN {po.pin_code}</strong> — {po.post_office_name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. STATES / UTS MASTER TABLE */}
      {activeTab === 'states' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Official Indian States & Union Territories Master ({statesList.length})
            </h3>
            <button onClick={() => setShowAddStateModal(true)} style={{ padding: '0.45rem 0.9rem', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
              + Add State / UT
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>#</th>
                  <th style={{ padding: '0.75rem 1rem' }}>State Code</th>
                  <th style={{ padding: '0.75rem 1rem' }}>State Name</th>
                  <th style={{ padding: '0.75rem 1rem' }}>State Short Name</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Capital</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {statesList.map((st, idx) => (
                  <tr key={st.id || st.state_code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontSize: '0.8rem' }}>{idx + 1}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px', background: '#fef9c3', color: '#a16207', border: '1px solid #fde68a' }}>
                        {st.official_code || st.state_lgd_code || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>{st.state_name}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                        {st.state_code || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>{st.capital || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '4px', background: st.state_type === 'UNION_TERRITORY' ? '#fef3c7' : '#dcfce7', color: st.state_type === 'UNION_TERRITORY' ? '#b45309' : '#15803d' }}>
                        {st.state_type || 'STATE'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>Active</span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => startEditing('STATE', st)} style={{ padding: '0.3rem 0.65rem', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                        ✏️ Edit
                      </button>
                      <button onClick={() => { setActiveTab('explorer'); handleStateClick(st); }} style={{ padding: '0.3rem 0.65rem', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                        View Districts
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. DISTRICTS MASTER TABLE */}
      {activeTab === 'districts' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Districts Master Directory {selectedStateId && `(${districtsList.length})`}
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', color: '#64748b', fontSize: '0.82rem' }}>
                Select a State to view and manage its districts
              </p>
            </div>
            {selectedStateId && (
              <button onClick={() => setShowAddDistrictModal(true)} style={{ padding: '0.45rem 0.9rem', background: '#10b981', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
                + Add District
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Select State / UT:</label>
            <select
              value={selectedStateId}
              onChange={e => {
                const selectedSt = statesList.find(s => s.id === e.target.value);
                handleStateClick(selectedSt || e.target.value);
              }}
              style={{ padding: '0.5rem 0.8rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontWeight: 600, fontSize: '0.88rem', outline: 'none' }}
            >
              <option value="">-- Choose State --</option>
              {statesList.map(st => (
                <option key={st.id} value={st.id}>{st.state_name} ({st.state_code})</option>
              ))}
            </select>
          </div>

          {!selectedStateId ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
              Please select a State from the dropdown above to view its Districts.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>#</th>
                    <th style={{ padding: '0.75rem 1rem' }}>District Name</th>
                    <th style={{ padding: '0.75rem 1rem' }}>District Code</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {districtsList.map((d, idx) => (
                    <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontSize: '0.8rem' }}>{idx + 1}</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>{d.district_name}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                          {d.district_code || d.id}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>Active</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button onClick={() => startEditing('DISTRICT', d)} style={{ padding: '0.3rem 0.65rem', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                          ✏️ Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. TEHSIL / SUB-DISTRICT MASTER TABLE */}
      {activeTab === 'subdistricts' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Tehsil / Sub-District Directory ({subdistrictsList.length})
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', color: '#64748b', fontSize: '0.82rem' }}>
                Select a District to view registered Tehsils, Sub-districts and Mandals
              </p>
            </div>
            {selectedDistrictId && (
              <button onClick={() => setShowAddSubdistrictModal(true)} style={{ padding: '0.45rem 0.9rem', background: '#8b5cf6', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
                + Add Tehsil
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Select District:</label>
            <select
              value={selectedDistrictId}
              onChange={e => {
                const distObj = districtsList.find(d => d.id === e.target.value);
                if (distObj) handleDistrictClick(distObj);
              }}
              style={{ padding: '0.5rem 0.8rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontWeight: 600, fontSize: '0.88rem', outline: 'none' }}
            >
              <option value="">-- Choose District --</option>
              {districtsList.map(d => (
                <option key={d.id} value={d.id}>{d.district_name}</option>
              ))}
            </select>
          </div>

          {!selectedDistrictId ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
              Please select a District from the Explorer tab or the dropdown above to view its Tehsils.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>#</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Sub-District Code</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Sub-District Type</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Sub-District Name</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Sub-District Short Name</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subdistrictsList.map((sub, idx) => (
                    <tr key={sub.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontSize: '0.8rem' }}>{idx + 1}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px', background: '#fef9c3', color: '#a16207', border: '1px solid #fde68a' }}>
                          {sub.subdistrict_code || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '4px', background: '#f3e8ff', color: '#6b21a8' }}>
                          {sub.subdistrict_type || 'TEHSIL'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>{sub.subdistrict_name}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {sub.subdistrict_short_name ? (
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                            {sub.subdistrict_short_name}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>Active</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button onClick={() => startEditing('SUBDISTRICT', sub)} style={{ padding: '0.3rem 0.65rem', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                          ✏️ Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 5. DEVELOPMENT BLOCKS MASTER TABLE */}
      {activeTab === 'blocks' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Development Blocks Master ({blocksList.length})
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', color: '#64748b', fontSize: '0.82rem' }}>
                Select a District to view registered rural development blocks
              </p>
            </div>
            {selectedDistrictId && (
              <button onClick={() => setShowAddBlockModal(true)} style={{ padding: '0.45rem 0.9rem', background: '#f59e0b', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
                + Add Block
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Select District:</label>
            <select
              value={selectedDistrictId}
              onChange={e => {
                const distObj = districtsList.find(d => d.id === e.target.value);
                if (distObj) handleDistrictClick(distObj);
              }}
              style={{ padding: '0.5rem 0.8rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontWeight: 600, fontSize: '0.88rem', outline: 'none' }}
            >
              <option value="">-- Choose District --</option>
              {districtsList.map(d => (
                <option key={d.id} value={d.id}>{d.district_name}</option>
              ))}
            </select>
          </div>

          {!selectedDistrictId ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
              Please select a District from the Explorer tab or dropdown to view Development Blocks.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>#</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Block Code</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Block Name</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Block Short Name</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {blocksList.map((blk, idx) => (
                    <tr key={blk.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontSize: '0.8rem' }}>{idx + 1}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px', background: '#fef9c3', color: '#a16207', border: '1px solid #fde68a' }}>
                          {blk.block_code || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>{blk.block_name}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {blk.block_short_name ? (
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                            {blk.block_short_name}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>Active</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button onClick={() => startEditing('BLOCK', blk)} style={{ padding: '0.3rem 0.65rem', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                          ✏️ Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 6. CITIES / TOWNS / VILLAGES MASTER TABLE */}
      {activeTab === 'settlements' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>
            Cities, Towns & Villages Master ({settlementsList.length})
          </h3>
          <LocationPicker />
        </div>
      )}

      {/* 7. PIN / POST OFFICES MASTER TABLE */}
      {activeTab === 'post_offices' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>
            PIN Codes & Post Offices Directory ({postOfficesList.length})
          </h3>
          <LocationPicker />
        </div>
      )}

      {/* 8. ALIASES */}
      {activeTab === 'aliases' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', maxWidth: '650px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#0f172a' }}>Location Alias Management</h3>
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
            Alias mappings configured in database: <code>Gurgaon $\rightarrow$ Gurugram</code>, <code>Mohali $\rightarrow$ Sahibzada Ajit Singh Nagar</code>, <code>Distt Sirsa $\rightarrow$ Sirsa</code>.
          </p>
        </div>
      )}

      {/* 9. BULK UPLOAD & IMPORT WIZARD */}
      {activeTab === 'import' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.75rem', maxWidth: '720px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Upload className="text-blue-600" size={20} /> Bulk Upload Location Data
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                Upload CSV or Excel files containing States, Districts, Tehsils, and Blocks to automatically insert/update location master records in bulk.
              </p>
            </div>
            <button
              onClick={handleDownloadTemplate}
              style={{ padding: '0.45rem 0.85rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', color: '#2563eb', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}
            >
              <FileSpreadsheet size={15} /> Download Sample Template
            </button>
          </div>

          <form onSubmit={handleImportSubmit} style={{ marginTop: '1.25rem' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.5rem' }}>
              Select CSV / Excel File (.csv, .xls, .xlsx)
            </label>
            <input
              type="file"
              accept=".csv, .xls, .xlsx"
              onChange={e => setImportFile(e.target.files[0])}
              style={{ width: '100%', padding: '0.65rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', marginBottom: '1.25rem', color: '#334155', fontSize: '0.88rem' }}
            />

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="submit"
                disabled={loading || !importFile}
                style={{ padding: '0.65rem 1.5rem', background: loading || !importFile ? '#94a3b8' : '#2563eb', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: loading || !importFile ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}
              >
                <Upload size={16} /> {loading ? 'Processing Upload...' : 'Upload & Process Locations'}
              </button>
              <button
                type="button"
                onClick={() => handleExportData('csv')}
                style={{ padding: '0.65rem 1.25rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#334155', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}
              >
                <FileSpreadsheet size={16} className="text-green-600" /> Export Existing Data
              </button>
            </div>
          </form>

          {importSummary && (
            <div style={{ marginTop: '1.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '1.25rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#166534', margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CheckCircle2 size={18} /> Bulk Import Result Summary
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat( auto-fit, minmax(120px, 1fr) )', gap: '0.75rem' }}>
                <div style={{ background: '#ffffff', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid #dcfce7' }}>
                  <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600 }}>Total Rows</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#166534' }}>{importSummary.totalProcessed || importSummary.total || 0}</div>
                </div>
                <div style={{ background: '#ffffff', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid #dcfce7' }}>
                  <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600 }}>States Created</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#166534' }}>{importSummary.createdStates || 0}</div>
                </div>
                <div style={{ background: '#ffffff', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid #dcfce7' }}>
                  <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600 }}>Districts Created</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#166534' }}>{importSummary.createdDistricts || 0}</div>
                </div>
                <div style={{ background: '#ffffff', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid #dcfce7' }}>
                  <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600 }}>Tehsils Created</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#166534' }}>{importSummary.createdSubdistricts || 0}</div>
                </div>
                <div style={{ background: '#ffffff', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid #dcfce7' }}>
                  <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600 }}>Blocks Created</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#166534' }}>{importSummary.createdBlocks || 0}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 10. LOCATION REQUESTS */}
      {activeTab === 'requests' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>Pending Location Requests</h3>
          {pendingRequests.length === 0 ? (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>No pending location requests found in database.</div>
          ) : (
            pendingRequests.map(r => (
              <div key={r.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '8px', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#2563eb' }}>{r.proposed_name} ({r.requested_location_type})</div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>Reason: {r.reason || 'Not specified'}</div>
                </div>
                <button onClick={() => handleApproveRequest(r.id)} style={{ padding: '0.4rem 0.85rem', background: '#10b981', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  Approve Request
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* 11. CHANGE HISTORY */}
      {activeTab === 'history' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#0f172a' }}>Location Audit & Change History</h3>
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Historical location changes logged into <code>location_change_history</code>.</p>
        </div>
      )}

      {/* MODAL: ADD STATE */}
      {showAddStateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '440px', color: '#0f172a' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>Register New State / UT</h3>
            <form onSubmit={handleCreateState}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>State Code</label>
                <input type="text" value={stateForm.state_lgd_code} onChange={e => setStateForm({ ...stateForm, state_lgd_code: e.target.value })} placeholder="e.g. 9 (UP), 22 (CG), 28 (AP)" style={{ width: '100%', padding: '0.65rem', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', color: '#0f172a', fontWeight: 600 }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>State Name *</label>
                <input type="text" required value={stateForm.state_name} onChange={e => setStateForm({ ...stateForm, state_name: e.target.value })} placeholder="e.g. Telangana" style={{ width: '100%', padding: '0.65rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>State Short Name</label>
                <input type="text" value={stateForm.state_short_name} onChange={e => setStateForm({ ...stateForm, state_short_name: e.target.value.toUpperCase() })} placeholder="e.g. TS, UP, CG, AP" style={{ width: '100%', padding: '0.65rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', color: '#0f172a', fontWeight: 700 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" onClick={() => setShowAddStateModal(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#475569', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#2563eb', border: 'none', borderRadius: '8px', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>Register State</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD DISTRICT */}
      {showAddDistrictModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '440px', color: '#0f172a' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>Register New District</h3>
            <form onSubmit={handleCreateDistrict}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>District LGD Code</label>
                <input type="text" value={districtForm.district_lgd_code} onChange={e => setDistrictForm({ ...districtForm, district_lgd_code: e.target.value })} placeholder="e.g. 518 (Balod), 188 (Lucknow)" style={{ width: '100%', padding: '0.65rem', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', color: '#0f172a', fontWeight: 600 }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>District Name *</label>
                <input type="text" required value={districtForm.district_name} onChange={e => setDistrictForm({ ...districtForm, district_name: e.target.value })} placeholder="e.g. Ludhiana / Lucknow" style={{ width: '100%', padding: '0.65rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>District Short Name / Railway Station Code</label>
                <input type="text" value={districtForm.district_short_name} onChange={e => setDistrictForm({ ...districtForm, district_short_name: e.target.value.toUpperCase() })} placeholder="e.g. LDH, LKO, NDLS, CNB, GZB, ASR" style={{ width: '100%', padding: '0.65rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', color: '#0f172a', fontWeight: 700 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" onClick={() => setShowAddDistrictModal(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#475569', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#10b981', border: 'none', borderRadius: '8px', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>Register District</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT / UPDATE LOCATION */}
      {editingItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '480px', color: '#0f172a', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>
              ✏️ Edit / Rename {(editingItem.type === 'SUBDISTRICT' || editingItem.type === 'TEHSIL') ? 'Sub-District / Tehsil' : editingItem.type}
            </h3>
            <form onSubmit={handleSaveEdit}>

              {/* Code / LGD Code — for STATE and DISTRICT */}
              {(editingItem.type === 'STATE' || editingItem.type === 'DISTRICT') && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
                    {editingItem.type === 'STATE' ? 'State Code' : 'District LGD Code'}
                  </label>
                  <input
                    type="text"
                    value={editForm.lgd_code}
                    onChange={e => setEditForm({ ...editForm, lgd_code: e.target.value })}
                    placeholder={editingItem.type === 'STATE' ? 'e.g. 9 (UP), 22 (CG), 28 (AP)' : 'e.g. 518 (Balod), 188 (Lucknow)'}
                    style={{ width: '100%', padding: '0.65rem', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', color: '#0f172a', fontWeight: 600 }}
                  />
                </div>
              )}


              {/* Sub-District Code */}
              {(editingItem.type === 'TEHSIL' || editingItem.type === 'SUBDISTRICT') && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Sub-District Code</label>
                  <input
                    type="text"
                    value={editForm.lgd_code}
                    onChange={e => setEditForm({ ...editForm, lgd_code: e.target.value })}
                    placeholder="e.g. TEH-0012 or 4845"
                    style={{ width: '100%', padding: '0.65rem', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', color: '#0f172a', fontWeight: 600 }}
                  />
                </div>
              )}

              {/* Block Code */}
              {editingItem.type === 'BLOCK' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Block Code</label>
                  <input
                    type="text"
                    value={editForm.lgd_code}
                    onChange={e => setEditForm({ ...editForm, lgd_code: e.target.value })}
                    placeholder="e.g. BLK-0042"
                    style={{ width: '100%', padding: '0.65rem', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', color: '#0f172a', fontWeight: 600 }}
                  />
                </div>
              )}

              {/* Sub-District Type */}
              {(editingItem.type === 'TEHSIL' || editingItem.type === 'SUBDISTRICT') && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Sub-District Type</label>
                  <select
                    value={editForm.sub_type || 'TEHSIL'}
                    onChange={e => setEditForm({ ...editForm, sub_type: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', background: '#f3e8ff', border: '1px solid #d8b4fe', borderRadius: '8px', color: '#0f172a', fontWeight: 600 }}
                  >
                    <option value="TEHSIL">Tehsil</option>
                    <option value="TALUKA">Taluka</option>
                    <option value="MANDAL">Mandal</option>
                    <option value="BLOCK">Block</option>
                    <option value="CIRCLE">Circle</option>
                    <option value="SUBDIVISION">Subdivision</option>
                  </select>
                </div>
              )}

              {/* Name */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
                  {editingItem.type === 'STATE' ? 'State' : editingItem.type === 'DISTRICT' ? 'District' : (editingItem.type === 'TEHSIL' || editingItem.type === 'SUBDISTRICT') ? 'Sub-District' : 'Block'} Name *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', fontWeight: 600 }}
                />
              </div>

              {/* Short Name */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
                  {editingItem.type === 'STATE' ? 'State Short Name' : editingItem.type === 'DISTRICT' ? 'District Short Name / Railway Code' : (editingItem.type === 'TEHSIL' || editingItem.type === 'SUBDISTRICT') ? 'Sub-District Short Name' : 'Block Short Name'}
                </label>
                <input
                  type="text"
                  value={editForm.short_name}
                  onChange={e => setEditForm({ ...editForm, short_name: e.target.value.toUpperCase() })}
                  placeholder={editingItem.type === 'STATE' ? 'e.g. UP, CG, AP, MH' : editingItem.type === 'DISTRICT' ? 'e.g. LKO, LDH, NDLS, CNB' : 'e.g. KHN, LDH'}
                  style={{ width: '100%', padding: '0.65rem', background: editingItem.type === 'STATE' ? '#eff6ff' : editingItem.type === 'DISTRICT' ? '#f0fdf4' : '#f0fdf4', border: editingItem.type === 'STATE' ? '1px solid #bfdbfe' : '1px solid #86efac', borderRadius: '8px', color: '#0f172a', fontWeight: 700 }}
                />
              </div>

              {/* Reason */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Reason for Change / Note</label>
                <input
                  type="text"
                  value={editForm.reason}
                  onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
                  placeholder="e.g. Official Government Renaming Notification"
                  style={{ width: '100%', padding: '0.65rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" onClick={() => setEditingItem(null)} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#475569', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#2563eb', border: 'none', borderRadius: '8px', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD TEHSIL */}
      {showAddSubdistrictModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '460px', color: '#0f172a' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>Register Tehsil / Sub-District</h3>
            <form onSubmit={handleCreateSubdistrict}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Sub-District Code</label>
                <input type="text" value={subdistrictForm.subdistrict_code} onChange={e => setSubdistrictForm({ ...subdistrictForm, subdistrict_code: e.target.value })} placeholder="e.g. TEH-0012" style={{ width: '100%', padding: '0.65rem', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', color: '#0f172a', fontWeight: 600 }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Sub-District Type</label>
                <select value={subdistrictForm.subdistrict_type} onChange={e => setSubdistrictForm({ ...subdistrictForm, subdistrict_type: e.target.value })} style={{ width: '100%', padding: '0.65rem', background: '#f3e8ff', border: '1px solid #d8b4fe', borderRadius: '8px', color: '#0f172a', fontWeight: 600 }}>
                  <option value="TEHSIL">Tehsil</option>
                  <option value="TALUKA">Taluka</option>
                  <option value="MANDAL">Mandal</option>
                  <option value="BLOCK">Block</option>
                  <option value="CIRCLE">Circle</option>
                  <option value="SUBDIVISION">Subdivision</option>
                </select>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Sub-District Name *</label>
                <input type="text" required value={subdistrictForm.subdistrict_name} onChange={e => setSubdistrictForm({ ...subdistrictForm, subdistrict_name: e.target.value })} placeholder="e.g. Khanna Tehsil" style={{ width: '100%', padding: '0.65rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Sub-District Short Name</label>
                <input type="text" value={subdistrictForm.subdistrict_short_name} onChange={e => setSubdistrictForm({ ...subdistrictForm, subdistrict_short_name: e.target.value.toUpperCase() })} placeholder="e.g. KHN" style={{ width: '100%', padding: '0.65rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', color: '#0f172a', fontWeight: 700 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" onClick={() => setShowAddSubdistrictModal(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#475569', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>Register Tehsil</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD BLOCK */}
      {showAddBlockModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '460px', color: '#0f172a' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>Register Development Block</h3>
            <form onSubmit={handleCreateBlock}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Block Code</label>
                <input type="text" value={blockForm.block_code} onChange={e => setBlockForm({ ...blockForm, block_code: e.target.value })} placeholder="e.g. BLK-0042" style={{ width: '100%', padding: '0.65rem', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', color: '#0f172a', fontWeight: 600 }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Block Name *</label>
                <input type="text" required value={blockForm.block_name} onChange={e => setBlockForm({ ...blockForm, block_name: e.target.value })} placeholder="e.g. Khanna Block" style={{ width: '100%', padding: '0.65rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Block Short Name</label>
                <input type="text" value={blockForm.block_short_name} onChange={e => setBlockForm({ ...blockForm, block_short_name: e.target.value.toUpperCase() })} placeholder="e.g. KHN" style={{ width: '100%', padding: '0.65rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', color: '#0f172a', fontWeight: 700 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" onClick={() => setShowAddBlockModal(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#475569', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#8b5cf6', border: 'none', borderRadius: '8px', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>Register Block</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
