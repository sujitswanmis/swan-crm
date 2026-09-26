'use client';

import React, { useState } from 'react';
import { X, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Info } from 'lucide-react';
import { bulkImportEmployeesFast } from '@/app/actions/team';
import Papa from 'papaparse';

export default function BulkImportExportModal({
  isOpen,
  onClose,
  onImportComplete
}) {
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({
    active: false,
    current: 0,
    total: 0,
    percentage: 0,
    currentName: '',
    createdCount: 0,
    updatedCount: 0,
    failCount: 0,
    complete: false,
    failReasons: []
  });

  if (!isOpen) return null;

  const handleDownloadSample = () => {
    const csvContent = "data:text/csv;charset=utf-8," + 
      "Employee ID,Name,Department,Sub Department,Designation,Mobile,Alt Mobile,Email,Company,Location Type,Location Name,Primary Reporting,Secondary Reporting,HOD,Password\n" +
      "EMP001,John Doe,Sales,Direct Sales,Sales Executive,9876543210,,john@supujacreations.com,SuPuja Creations,Headquarters,Delhi Office,manager@supujacreations.com,,hod@supujacreations.com,Pass@1234\n" +
      "EMP002,Jane Smith,Human Resource,Talent Acquisition,HR Recruiter,9876543211,,jane@supujacreations.com,SuPuja Creations,Headquarters,Delhi Office,,,Pass@1234";

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "employees_import_sample.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setImportFile(e.target.files[0]);
    }
  };

  const handleStartImport = () => {
    if (!importFile) return;

    setImporting(true);
    setProgress({
      active: true,
      current: 0,
      total: 0,
      percentage: 0,
      currentName: 'Parsing CSV...',
      createdCount: 0,
      updatedCount: 0,
      failCount: 0,
      complete: false,
      failReasons: []
    });

    Papa.parse(importFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;
        if (!rows || rows.length === 0) {
          alert("The CSV file is empty or invalid.");
          setImporting(false);
          setProgress(prev => ({ ...prev, active: false }));
          return;
        }

        const validEmployees = rows.map(r => ({
          emp_id: r['Employee ID'] || r['emp_id'] || '',
          emp_name: r['Name'] || r['emp_name'] || '',
          emp_department: r['Department'] || r['emp_department'] || '',
          emp_sub_department: r['Sub Department'] || r['emp_sub_department'] || '',
          emp_designation: r['Designation'] || r['emp_designation'] || '',
          emp_mobile: r['Mobile'] || r['emp_mobile'] || '',
          emp_alt_mobile: r['Alt Mobile'] || r['emp_alt_mobile'] || '',
          email: r['Email'] || r['email'] || '',
          company: r['Company'] || r['company'] || 'SuPuja Creations',
          work_location_type: r['Location Type'] || r['work_location_type'] || 'Headquarters',
          work_location_name: r['Location Name'] || r['work_location_name'] || '',
          primary_reporting_person: r['Primary Reporting'] || r['primary_reporting_person'] || '',
          secondary_reporting_person: r['Secondary Reporting'] || r['secondary_reporting_person'] || '',
          hod_person: r['HOD'] || r['hod_person'] || '',
          password: r['Password'] || r['password'] || ''
        })).filter(e => e.email && e.emp_name);

        if (validEmployees.length === 0) {
          alert("No valid employee rows found. Each row requires at least a Name and Email.");
          setImporting(false);
          setProgress(prev => ({ ...prev, active: false }));
          return;
        }

        const batchSize = 10;
        let created = 0;
        let updated = 0;
        let failed = 0;
        const reasons = [];

        for (let i = 0; i < validEmployees.length; i += batchSize) {
          const batch = validEmployees.slice(i, i + batchSize);
          setProgress(prev => ({
            ...prev,
            current: i,
            total: validEmployees.length,
            percentage: Math.round((i / validEmployees.length) * 100),
            currentName: `Importing records ${i + 1} to ${Math.min(i + batchSize, validEmployees.length)}...`
          }));

          try {
            const res = await bulkImportEmployeesFast(batch);
            if (res.success) {
              created += res.createdCount || 0;
              updated += res.updatedCount || 0;
            } else {
              failed += batch.length;
              reasons.push(res.error || 'Batch import failed');
            }
          } catch (err) {
            failed += batch.length;
            reasons.push(err.message || 'Network error');
          }
        }

        setProgress({
          active: false,
          current: validEmployees.length,
          total: validEmployees.length,
          percentage: 100,
          currentName: 'Completed!',
          createdCount: created,
          updatedCount: updated,
          failCount: failed,
          complete: true,
          failReasons: reasons
        });
        setImporting(false);

        if (onImportComplete) {
          onImportComplete();
        }
      },
      error: (err) => {
        alert("Failed to parse CSV: " + err.message);
        setImporting(false);
        setProgress(prev => ({ ...prev, active: false }));
      }
    });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1060,
      padding: '1rem'
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '560px',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '16px',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
        border: '1px solid var(--border-light)',
        overflow: 'hidden',
        padding: 0
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileSpreadsheet size={20} style={{ color: '#059669' }} />
              Bulk Import Users (CSV / Excel)
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Quickly create or update multiple employee accounts using CSV spreadsheet
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '0.35rem',
              borderRadius: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem' }}>
          {/* Sample Download Banner */}
          <div style={{
            padding: '0.85rem 1rem',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-primary, #f8fafc)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.25rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Info size={18} style={{ color: 'var(--primary-color, #2563eb)' }} />
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Need the CSV Template?</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Download formatted sample file with required headers</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadSample}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <Download size={14} />
              Sample CSV
            </button>
          </div>

          {/* Upload Area */}
          <div style={{
            border: '2px dashed var(--border-light)',
            borderRadius: '12px',
            padding: '2rem 1.5rem',
            textAlign: 'center',
            backgroundColor: 'var(--bg-primary, rgba(0,0,0,0.01))',
            marginBottom: '1.25rem'
          }}>
            <Upload size={32} style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem' }} />
            <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              Select CSV File to Upload
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Supported format: .csv (UTF-8 encoding)
            </div>

            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              id="csvFileInput"
              style={{ display: 'none' }}
            />
            <label
              htmlFor="csvFileInput"
              style={{
                display: 'inline-block',
                padding: '0.5rem 1.25rem',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {importFile ? importFile.name : 'Choose File'}
            </label>
          </div>

          {/* Progress / Status */}
          {progress.active && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                <span>{progress.currentName}</span>
                <span>{progress.percentage}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', borderRadius: '4px', backgroundColor: 'var(--border-light)', overflow: 'hidden' }}>
                <div style={{ width: `${progress.percentage}%`, height: '100%', backgroundColor: '#059669', transition: 'width 0.2s ease' }} />
              </div>
            </div>
          )}

          {progress.complete && (
            <div style={{
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              backgroundColor: '#ecfdf5',
              border: '1px solid #a7f3d0',
              color: '#059669',
              fontSize: '0.8rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={18} />
                <span>Import Finished! Created: <strong>{progress.createdCount}</strong>, Updated: <strong>{progress.updatedCount}</strong></span>
              </div>
              {progress.failCount > 0 && (
                <span style={{ color: '#dc2626', fontWeight: 600 }}>Failed: {progress.failCount}</span>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              Close
            </button>

            <button
              type="button"
              disabled={!importFile || importing}
              onClick={handleStartImport}
              style={{
                padding: '0.55rem 1.4rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#059669',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: (!importFile || importing) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {importing ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
              {importing ? 'Importing Records...' : 'Start Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
