'use client';

import React, { useState, useRef } from 'react';
import {
  Upload, Download, X, CheckCircle2, AlertTriangle, Check,
  Clock, ShieldCheck, FileSpreadsheet, RefreshCw, AlertCircle
} from 'lucide-react';
import Papa from 'papaparse';
import { bulkImportPartyMaster } from '@/app/actions/partyMaster';
import { ALL_INDIAN_STATES, INDIAN_STATE_DISTRICTS } from '@/config/indianStateDistricts';
import { PRODUCT_GROUPS } from '@/config/productCatalog';

export default function PartyImportModal({
  isOpen,
  onClose,
  onImportSuccess,
  existingParties = []
}) {
  const [importMode, setImportMode] = useState('FULL'); // 'FULL' (S01 to S08) | 'S01_ONLY'
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [validationSummary, setValidationSummary] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState(null); // { active, percentage, current, total, created, skipped, logs, complete }

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // Generate and download Excel (.xlsx) template with real dropdowns from Location Master
  const handleDownloadTemplate = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const { saveAs } = await import('file-saver');

      const isFull = importMode === 'FULL';
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(isFull ? 'Full Onboarding S01-S08' : 'Party Master S01');

      // Create hidden Lookups sheet to store Location Master and enum lists (bypasses Excel 255 char formula limits)
      const lookupSheet = workbook.addWorksheet('Lookups');
      lookupSheet.state = 'hidden';

      const partyTiers = ['Distributor', 'Dealer', 'Sub-Dealer'];
      const operatingCompanies = ['NSMLR', 'NSTL'];
      const locationStates = ALL_INDIAN_STATES && ALL_INDIAN_STATES.length > 0 ? ALL_INDIAN_STATES : ['Punjab', 'Haryana', 'Uttar Pradesh', 'Rajasthan'];
      const locationDistricts = Array.from(new Set(Object.values(INDIAN_STATE_DISTRICTS || {}).flat())).filter(Boolean).sort();
      const billingRoutes = ['DIRECT_COMPANY_BILLING', 'DEALER_BILLED', 'DISTRIBUTOR_BILLED'];
      const productCategories = [
        'Rotavator',
        'Hydraulic Reversible MB Plough',
        'Mounted Disc Plough',
        'Laser Land Leveller',
        'Super Seeder',
        'Roto Seeder',
        'Happy Seeder',
        'Zero Till Seed Drill',
        'Mulcher',
        'Straw Reaper',
        'Square Baler',
        'Fertilizer Spreader',
        'Disc Harrow',
        'Cultivator',
        'Sub Soiler',
        'Genuine Swan Blades, Gearbox & Spares'
      ];
      const securityModes = ['Cheque', 'NEFT/RTGS', 'DD', 'Bank Guarantee', 'Cash'];

      // Populate Column A: Party Tiers
      lookupSheet.getCell('A1').value = 'Party Tiers';
      partyTiers.forEach((tier, i) => { lookupSheet.getCell(`A${i + 2}`).value = tier; });

      // Populate Column B: Operating Companies
      lookupSheet.getCell('B1').value = 'Operating Companies';
      operatingCompanies.forEach((comp, i) => { lookupSheet.getCell(`B${i + 2}`).value = comp; });

      // Populate Column C: Location States (From Central Location Master)
      lookupSheet.getCell('C1').value = 'States';
      locationStates.forEach((st, i) => { lookupSheet.getCell(`C${i + 2}`).value = st; });

      // Populate Column D: Location Districts (From Central Location Master)
      lookupSheet.getCell('D1').value = 'Districts';
      locationDistricts.forEach((dist, i) => { lookupSheet.getCell(`D${i + 2}`).value = dist; });

      // Populate Column E: Billing Routes
      lookupSheet.getCell('E1').value = 'Billing Routes';
      billingRoutes.forEach((route, i) => { lookupSheet.getCell(`E${i + 2}`).value = route; });

      // Populate Column F: Product Categories
      lookupSheet.getCell('F1').value = 'Product Categories';
      productCategories.forEach((cat, i) => { lookupSheet.getCell(`F${i + 2}`).value = cat; });

      // Populate Column G: Security Modes
      lookupSheet.getCell('G1').value = 'Security Modes';
      securityModes.forEach((mode, i) => { lookupSheet.getCell(`G${i + 2}`).value = mode; });

      // Define Names for Universal Excel Dropdowns
      workbook.definedNames.add(`Lookups!$A$2:$A$${partyTiers.length + 1}`, 'PartyTiers');
      workbook.definedNames.add(`Lookups!$B$2:$B$${operatingCompanies.length + 1}`, 'OperatingCompanies');
      workbook.definedNames.add(`Lookups!$C$2:$C$${locationStates.length + 1}`, 'LocationStates');
      workbook.definedNames.add(`Lookups!$D$2:$D$${locationDistricts.length + 1}`, 'LocationDistricts');
      workbook.definedNames.add(`Lookups!$E$2:$E$${billingRoutes.length + 1}`, 'BillingRoutes');
      workbook.definedNames.add(`Lookups!$F$2:$F$${productCategories.length + 1}`, 'ProductCategories');
      workbook.definedNames.add(`Lookups!$G$2:$G$${securityModes.length + 1}`, 'SecurityModes');

      // Define Headers based on Import Scope
      const fullHeaders = [
        'firm_name',
        'party_type',
        'our_company',
        'contact_person',
        'primary_mobile',
        'alt_mobile',
        'email',
        'state_name',
        'district_name',
        'tehsil',
        'pincode',
        'address',
        'gstin',
        'pan',
        'billing_route',
        'product_category',
        'security_deposit',
        'security_mode',
        'parent_distributor_or_dealer'
      ];

      const s01Headers = [
        'firm_name',
        'party_type',
        'our_company',
        'contact_person',
        'primary_mobile',
        'alt_mobile',
        'email',
        'state_name',
        'district_name',
        'tehsil',
        'pincode',
        'address',
        'gstin',
        'pan'
      ];

      const activeHeaders = isFull ? fullHeaders : s01Headers;
      sheet.addRow(activeHeaders);

      // Header Row Styling
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isFull ? 'FF0F766E' : 'FF0284C7' } // Teal for Full, Sky for S01
      };
      headerRow.height = 24;

      // Add Sample Rows tailored to selected scope
      const fullSampleRows = [
        [
          'Majha Agro Implements Hub',
          'Distributor',
          'NSMLR',
          'Gurpreet Singh',
          '9876543210',
          '9876543211',
          'majha@agro.com',
          'Punjab',
          'Amritsar',
          'Baba Bakala',
          '143201',
          'Shop 12 GT Road Rayya',
          '03AAAAA0000A1Z5',
          'ABCDE1234F',
          'DIRECT_COMPANY_BILLING',
          'Rotavator',
          '100000',
          'Cheque',
          ''
        ],
        [
          'Doaba Tractors & Farm Machines',
          'Dealer',
          'NSMLR',
          'Harpreet Singh',
          '9812345678',
          '',
          'doaba@tractors.com',
          'Punjab',
          'Jalandhar',
          'Nakodar',
          '144001',
          'Near Old Bus Stand Nakodar Road',
          '03BBBBB0000B1Z6',
          'BCDEF2345G',
          'DIRECT_COMPANY_BILLING',
          'Super Seeder',
          '50000',
          'Cheque',
          'Majha Agro Implements Hub'
        ],
        [
          'Malwa Kisan Seva Center',
          'Sub-Dealer',
          'NSTL',
          'Jaswinder Singh',
          '9823456789',
          '',
          'malwa@kisan.com',
          'Punjab',
          'Ludhiana',
          'Khanna',
          '141401',
          'Main Chowk GT Road Khanna',
          '',
          '',
          'DEALER_BILLED',
          'Rotavator',
          '25000',
          'Cheque',
          'Doaba Tractors & Farm Machines'
        ]
      ];

      const s01SampleRows = fullSampleRows.map(row => row.slice(0, 14));
      const sampleData = isFull ? fullSampleRows : s01SampleRows;

      sampleData.forEach(row => {
        sheet.addRow(row);
      });

      // Set column widths
      sheet.columns.forEach((col, i) => {
        const headerName = activeHeaders[i];
        if (headerName === 'address' || headerName === 'parent_distributor_or_dealer') {
          col.width = 30;
        } else if (headerName === 'firm_name') {
          col.width = 28;
        } else if (headerName === 'primary_mobile' || headerName === 'gstin' || headerName === 'billing_route' || headerName === 'product_category') {
          col.width = 22;
        } else {
          col.width = 18;
        }
      });

      // Apply Excel Data Validations (Dropdowns) across rows 2 to 1000
      // Col B: Party Tier
      sheet.dataValidations.add('B2:B1000', {
        type: 'list',
        allowBlank: true,
        formulae: ['=PartyTiers'],
        showErrorMessage: true,
        errorTitle: 'Invalid Tier',
        error: 'Please pick Distributor, Dealer, or Sub-Dealer from dropdown.'
      });

      // Col C: Operating Company
      sheet.dataValidations.add('C2:C1000', {
        type: 'list',
        allowBlank: true,
        formulae: ['=OperatingCompanies'],
        showErrorMessage: true,
        errorTitle: 'Invalid Company',
        error: 'Please pick NSMLR or NSTL from dropdown.'
      });

      // Col H: State (from Location Master)
      sheet.dataValidations.add('H2:H1000', {
        type: 'list',
        allowBlank: true,
        formulae: ['=LocationStates'],
        showErrorMessage: true,
        errorTitle: 'Invalid State',
        error: 'Please select a valid Indian State from Location Master dropdown.'
      });

      // Col I: District (from Location Master)
      sheet.dataValidations.add('I2:I1000', {
        type: 'list',
        allowBlank: true,
        formulae: ['=LocationDistricts'],
        showErrorMessage: true,
        errorTitle: 'Invalid District',
        error: 'Please select a valid District from Location Master dropdown.'
      });

      if (isFull) {
        // Col O: Billing Route
        sheet.dataValidations.add('O2:O1000', {
          type: 'list',
          allowBlank: true,
          formulae: ['=BillingRoutes'],
          showErrorMessage: true,
          errorTitle: 'Invalid Billing Route',
          error: 'Please choose DIRECT_COMPANY_BILLING, DEALER_BILLED, or DISTRIBUTOR_BILLED.'
        });

        // Col P: Product Category
        sheet.dataValidations.add('P2:P1000', {
          type: 'list',
          allowBlank: true,
          formulae: ['=ProductCategories'],
          showErrorMessage: true,
          errorTitle: 'Invalid Product Category',
          error: 'Please select an authorized implement category from dropdown.'
        });

        // Col R: Security Mode
        sheet.dataValidations.add('R2:R1000', {
          type: 'list',
          allowBlank: true,
          formulae: ['=SecurityModes'],
          showErrorMessage: true,
          errorTitle: 'Invalid Security Mode',
          error: 'Please choose Cheque, NEFT/RTGS, DD, Bank Guarantee, or Cash.'
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const fileName = isFull
        ? 'Swan_Party_Master_Full_S01_to_S08_Template.xlsx'
        : 'Swan_Party_Master_Only_S01_Template.xlsx';

      saveAs(new Blob([buffer]), fileName);
    } catch (err) {
      console.error('Error generating Excel template:', err);
      alert('Could not generate Excel template: ' + err.message);
    }
  };

  // Parse and validate uploaded file (supports BOTH .xlsx and .csv)
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const lowerName = selectedFile.name.toLowerCase();
    const isXlsx = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
    const isCsv = lowerName.endsWith('.csv');

    if (!isXlsx && !isCsv) {
      alert('Please upload a valid Excel (.xlsx, .xls) or CSV (.csv) file.');
      return;
    }

    setFile(selectedFile);
    setValidationSummary(null);
    setParsedRows([]);

    try {
      if (isXlsx) {
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        const arrayBuffer = await selectedFile.arrayBuffer();
        await workbook.xlsx.load(arrayBuffer);
        const worksheet = workbook.worksheets[0];

        const worksheetHeaders = [];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
          const val = cell.value ? String(cell.value).trim().toLowerCase().replace(/[\s/-]+/g, '_') : '';
          worksheetHeaders[colNumber] = val;
        });

        const rawData = [];
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // skip header row
          const rowData = {};
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = worksheetHeaders[colNumber];
            if (header) {
              let val = cell.value;
              if (val instanceof Date) {
                val = val.toISOString().split('T')[0];
              } else if (val && typeof val === 'object' && val.text) {
                val = val.text;
              } else if (val && typeof val === 'object' && val.result !== undefined) {
                val = val.result;
              }
              rowData[header] = val !== null && val !== undefined ? String(val).trim() : '';
            }
          });
          if (Object.values(rowData).some(v => v !== '')) {
            rawData.push(rowData);
          }
        });

        validateAndPrepareRows(rawData);
      } else {
        // CSV Parsing via PapaParse
        Papa.parse(selectedFile, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim().toLowerCase().replace(/[\s/-]+/g, '_'),
          complete: (results) => {
            const rawData = results.data || [];
            validateAndPrepareRows(rawData);
          },
          error: (err) => {
            alert('Failed to read CSV: ' + err.message);
          }
        });
      }
    } catch (err) {
      console.error('File reading error:', err);
      alert('Error parsing uploaded file: ' + err.message);
    }
  };

  const validateAndPrepareRows = (rows) => {
    // Existing mobiles set
    const existingMobiles = new Set();
    existingParties.forEach(p => {
      const ph = p.primary_mobile || p.contact_mobile_1_1 || p.biz_contact_no_1;
      if (ph) existingMobiles.add(String(ph).replace(/\D/g, '').slice(-10));
    });

    const batchMobiles = new Set();
    const validated = [];
    let validCount = 0;
    let errorCount = 0;

    rows.forEach((row, idx) => {
      const rowIdx = idx + 1;
      const firmName = (row.firm_name || row.company || row.firm || '').trim();
      const rawMobile = (row.primary_mobile || row.mobile || row.phone || '').trim();
      const cleanMobile = rawMobile.replace(/\D/g, '').slice(-10);
      const state = (row.state_name || row.state || 'Punjab').trim();
      const district = (row.district_name || row.district || '').trim();

      const issues = [];

      if (!firmName) {
        issues.push('Missing Firm Name');
      }

      if (!cleanMobile || cleanMobile.length < 10) {
        issues.push('Invalid 10-digit Mobile');
      } else if (existingMobiles.has(cleanMobile)) {
        issues.push(`Mobile ${cleanMobile} already in CRM`);
      } else if (batchMobiles.has(cleanMobile)) {
        issues.push(`Duplicate mobile ${cleanMobile} in file`);
      } else {
        batchMobiles.add(cleanMobile);
      }

      if (!state) {
        issues.push('Missing State');
      }

      const isValid = issues.length === 0;
      if (isValid) validCount++;
      else errorCount++;

      validated.push({
        _rowIdx: rowIdx,
        _isValid: isValid,
        _issues: issues,
        ...row,
        firm_name: firmName,
        primary_mobile: cleanMobile || rawMobile,
        state_name: state,
        district_name: district
      });
    });

    setParsedRows(validated);
    setValidationSummary({
      total: rows.length,
      valid: validCount,
      invalid: errorCount
    });
  };

  // Start processing import via server action
  const handleStartImport = async () => {
    const validToImport = parsedRows.filter(r => r._isValid);
    if (validToImport.length === 0) {
      alert('No valid records to import. Please check validation issues.');
      return;
    }

    setIsProcessing(true);
    setImportProgress({
      active: true,
      percentage: 15,
      current: 0,
      total: validToImport.length,
      created: 0,
      skipped: 0,
      logs: [`Starting import of ${validToImport.length} records in ${importMode === 'FULL' ? 'Full S01–S08' : 'S01-Only'} mode...`],
      complete: false
    });

    try {
      setImportProgress(prev => ({ ...prev, percentage: 40, logs: [...prev.logs, 'Contacting Supabase backend...'] }));

      const res = await bulkImportPartyMaster(validToImport, importMode);

      if (!res.success) {
        setImportProgress(prev => ({
          ...prev,
          active: false,
          complete: true,
          percentage: 100,
          logs: [...prev.logs, `❌ Import Failed: ${res.error}`]
        }));
        setIsProcessing(false);
        return;
      }

      const successLogs = [
        `✅ Import Finished Successfully!`,
        `🎉 Successfully Created: ${res.imported} Channel Partners`,
        res.skipped > 0 ? `⚠️ Skipped / Duplicates: ${res.skipped}` : null,
        ...(res.errors || []).slice(0, 8)
      ].filter(Boolean);

      setImportProgress({
        active: false,
        percentage: 100,
        current: res.imported,
        total: validToImport.length,
        created: res.imported,
        skipped: res.skipped,
        logs: successLogs,
        complete: true
      });

      if (typeof onImportSuccess === 'function') {
        onImportSuccess();
      }
    } catch (err) {
      setImportProgress(prev => ({
        ...prev,
        active: false,
        complete: true,
        percentage: 100,
        logs: [...prev.logs, `❌ Network / Execution Error: ${err.message}`]
      }));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParsedRows([]);
    setValidationSummary(null);
    setImportProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(4px)',
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--bg-surface, #0f172a)',
        border: '1px solid var(--border-light, rgba(255,255,255,0.1))',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '860px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '1.2rem 1.5rem',
          borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-primary, #0b1120)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(16,185,129,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981'
            }}>
              <Upload size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary, #fff)' }}>
                Bulk Import Party Master
              </h3>
              <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary, #94a3b8)' }}>
                Upload CSV to onboard Channel Partners (Distributors, Dealers, Sub-Dealers)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              padding: '0.4rem',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* If import in progress or complete */}
          {importProgress ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                background: 'var(--bg-primary, #0b1120)',
                border: '1px solid var(--border-light, rgba(255,255,255,0.08))',
                borderRadius: '10px',
                padding: '1.25rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.6rem' }}>
                  {importProgress.complete ? '🎉 Import Completed!' : '⏳ Importing Channel Partners...'}
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                  <div style={{
                    width: `${importProgress.percentage}%`,
                    height: '100%',
                    background: importProgress.complete ? '#10b981' : '#38bdf8',
                    transition: 'width 0.4s ease'
                  }} />
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginTop: '1rem' }}>
                  <div style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', padding: '0.6rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8' }}>{importProgress.total}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Total Valid</div>
                  </div>
                  <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', padding: '0.6rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981' }}>{importProgress.created}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Successfully Created</div>
                  </div>
                  <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', padding: '0.6rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fbbf24' }}>{importProgress.skipped}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Skipped / Duplicates</div>
                  </div>
                </div>
              </div>

              {/* Logs */}
              <div style={{
                background: '#070d19',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px',
                padding: '0.85rem',
                maxHeight: '160px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                color: '#cbd5e1'
              }}>
                <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: '0.35rem', fontSize: '0.74rem' }}>
                  Import Logs & Audit Stream:
                </div>
                {importProgress.logs.map((log, i) => (
                  <div key={i} style={{ padding: '0.15rem 0' }}>{log}</div>
                ))}
              </div>

              {importProgress.complete && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      padding: '0.6rem 1.4rem',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.84rem'
                    }}
                  >
                    Done & View Partners
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* 1. Import Mode Selector */}
              <div style={{
                background: 'var(--bg-primary, #0b1120)',
                border: '1px solid var(--border-light, rgba(255,255,255,0.08))',
                borderRadius: '10px',
                padding: '1rem'
              }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.65rem' }}>
                  1. Select Onboarding Scope:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                  
                  {/* Mode Option A: FULL S01-S08 */}
                  <label
                    onClick={() => setImportMode('FULL')}
                    style={{
                      border: `1px solid ${importMode === 'FULL' ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
                      background: importMode === 'FULL' ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.6rem'
                    }}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'FULL'}
                      onChange={() => setImportMode('FULL')}
                      style={{ marginTop: '0.2rem', accentColor: '#10b981' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: importMode === 'FULL' ? '#10b981' : 'var(--text-primary)' }}>
                        🟢 Full S01–S08 Onboarding (Recommended)
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        Imports full firm identity, billing mode, product category & security terms. Automatically qualifies partner for S08 Activation!
                      </div>
                    </div>
                  </label>

                  {/* Mode Option B: S01 ONLY */}
                  <label
                    onClick={() => setImportMode('S01_ONLY')}
                    style={{
                      border: `1px solid ${importMode === 'S01_ONLY' ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`,
                      background: importMode === 'S01_ONLY' ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.02)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.6rem'
                    }}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'S01_ONLY'}
                      onChange={() => setImportMode('S01_ONLY')}
                      style={{ marginTop: '0.2rem', accentColor: '#38bdf8' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: importMode === 'S01_ONLY' ? '#38bdf8' : 'var(--text-primary)' }}>
                        🟡 Only S01 Master Registration
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        Creates basic party record with Firm Name & Contacts. Subsequent stages (S02–S08) will be verified manually via CRM modal.
                      </div>
                    </div>
                  </label>

                </div>
              </div>

              {/* 2. Download Template Box */}
              <div style={{
                background: 'rgba(56,189,248,0.05)',
                border: '1px dashed rgba(56,189,248,0.3)',
                borderRadius: '10px',
                padding: '0.9rem 1.1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <FileSpreadsheet size={22} className="text-sky-400" />
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {importMode === 'FULL' ? 'Full S01–S08 Excel Template' : 'Only S01 Registration Excel Template'}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      Includes Location Master dropdowns for State & District, plus Party Tier, Company, Billing Route & Products.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  style={{
                    padding: '0.45rem 0.95rem',
                    background: importMode === 'FULL' ? 'rgba(16,185,129,0.15)' : 'rgba(56,189,248,0.15)',
                    border: `1px solid ${importMode === 'FULL' ? 'rgba(16,185,129,0.4)' : 'rgba(56,189,248,0.4)'}`,
                    color: importMode === 'FULL' ? '#10b981' : '#38bdf8',
                    borderRadius: '7px',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <Download size={14} /> {importMode === 'FULL' ? 'Download Full S01–S08 Template (.xlsx)' : 'Download Only S01 Template (.xlsx)'}
                </button>
              </div>

              {/* 3. File Upload Area */}
              <div style={{
                background: 'var(--bg-primary, #0b1120)',
                border: '2px dashed var(--border-light, rgba(255,255,255,0.15))',
                borderRadius: '10px',
                padding: '1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                position: 'relative'
              }} onClick={() => fileInputRef.current?.click()}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />

                <Upload size={28} style={{ color: '#10b981', margin: '0 auto 0.5rem auto' }} />

                {file ? (
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#10b981' }}>
                      Selected: {file.name}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      Size: {(file.size / 1024).toFixed(1)} KB • Click to change file
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Click to choose or drag & drop Excel or CSV file
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Supports Excel (`.xlsx`, `.xls`) with dropdowns and comma-separated `.csv`
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Pre-Flight Validation Preview */}
              {validationSummary && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Pre-Import Validation Preview:
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                        ✓ {validationSummary.valid} Valid Rows
                      </span>
                      {validationSummary.invalid > 0 && (
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#f87171', background: 'rgba(239,68,68,0.15)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                          ⚠️ {validationSummary.invalid} With Issues
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div style={{
                    maxHeight: '220px',
                    overflowY: 'auto',
                    border: '1px solid var(--border-light, rgba(255,255,255,0.08))',
                    borderRadius: '8px'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                          <th style={{ padding: '0.5rem 0.75rem' }}>#</th>
                          <th style={{ padding: '0.5rem 0.75rem' }}>Firm Name</th>
                          <th style={{ padding: '0.5rem 0.75rem' }}>Tier</th>
                          <th style={{ padding: '0.5rem 0.75rem' }}>Mobile</th>
                          <th style={{ padding: '0.5rem 0.75rem' }}>Location</th>
                          <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.slice(0, 10).map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: r._isValid ? 'transparent' : 'rgba(239,68,68,0.05)' }}>
                            <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary)' }}>{r._rowIdx}</td>
                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{r.firm_name || '-'}</td>
                            <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary)' }}>{r.party_type || 'Dealer'}</td>
                            <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace' }}>{r.primary_mobile || '-'}</td>
                            <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary)' }}>{r.district_name ? `${r.district_name}, ${r.state_name}` : r.state_name}</td>
                            <td style={{ padding: '0.5rem 0.75rem' }}>
                              {r._isValid ? (
                                <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.72rem' }}>✓ Valid</span>
                              ) : (
                                <span style={{ color: '#f87171', fontWeight: 600, fontSize: '0.72rem' }} title={r._issues.join(', ')}>
                                  ⚠️ {r._issues[0]}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {parsedRows.length > 10 && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                      Showing first 10 of {parsedRows.length} rows...
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border-light, rgba(255,255,255,0.08))'
              }}>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={!file || isProcessing}
                  style={{
                    padding: '0.5rem 0.9rem',
                    background: 'transparent',
                    border: '1px solid var(--border-light, rgba(255,255,255,0.15))',
                    color: 'var(--text-secondary, #94a3b8)',
                    borderRadius: '7px',
                    fontSize: '0.8rem',
                    cursor: !file ? 'not-allowed' : 'pointer'
                  }}
                >
                  Clear Selection
                </button>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isProcessing}
                    style={{
                      padding: '0.55rem 1.15rem',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-light, rgba(255,255,255,0.1))',
                      color: 'var(--text-primary, #fff)',
                      borderRadius: '8px',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleStartImport}
                    disabled={!validationSummary || validationSummary.valid === 0 || isProcessing}
                    style={{
                      padding: '0.55rem 1.35rem',
                      background: (!validationSummary || validationSummary.valid === 0 || isProcessing)
                        ? 'rgba(16,185,129,0.3)'
                        : 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      cursor: (!validationSummary || validationSummary.valid === 0 || isProcessing) ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      boxShadow: '0 2px 10px rgba(16,185,129,0.3)'
                    }}
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" /> Processing...
                      </>
                    ) : (
                      <>
                        <Check size={15} /> Start Import ({validationSummary?.valid || 0} Records)
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
