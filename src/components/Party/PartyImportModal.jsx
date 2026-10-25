'use client';

import React, { useState, useRef, useMemo } from 'react';
import {
  Upload, Download, X, CheckCircle2, AlertTriangle, Check,
  Clock, ShieldCheck, FileSpreadsheet, RefreshCw, AlertCircle, Search
} from 'lucide-react';
import Papa from 'papaparse';
import { bulkImportPartyMaster, checkPartyAndLeadDuplicates } from '@/app/actions/partyMaster';
import { ALL_INDIAN_STATES, INDIAN_STATE_DISTRICTS } from '@/config/indianStateDistricts';
import { PRODUCT_GROUPS } from '@/config/productCatalog';

export default function PartyImportModal({
  isOpen,
  onClose,
  onImportSuccess,
  existingParties = [],
  tenantId = null,
  userName = ''
}) {
  const [importMode, setImportMode] = useState('FULL'); // 'FULL' (S01 to S08) | 'S01_ONLY'
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [validationSummary, setValidationSummary] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState(null); // { active, percentage, current, total, created, skipped, logs, complete }
  const [previewFilter, setPreviewFilter] = useState('ALL'); // 'ALL' | 'VALID' | 'ISSUES'
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState(25); // 10 | 25 | 50 | 100 | 'ALL'
  const [currentPage, setCurrentPage] = useState(1);

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
      const operatingCompanies = ['NSMLR', 'NSTLP'];
      const constitutionTypes = ['PROPRIETORSHIP', 'PARTNERSHIP', 'PVT_LTD', 'LTD', 'LLP'];
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

      // Populate Column C: Constitution Types
      lookupSheet.getCell('C1').value = 'Constitution Types';
      constitutionTypes.forEach((ctype, i) => { lookupSheet.getCell(`C${i + 2}`).value = ctype; });

      // Populate Column D: Location States (From Central Location Master)
      lookupSheet.getCell('D1').value = 'States';
      locationStates.forEach((st, i) => { lookupSheet.getCell(`D${i + 2}`).value = st; });

      // Populate Column E: Location Districts (From Central Location Master)
      lookupSheet.getCell('E1').value = 'Districts';
      locationDistricts.forEach((dist, i) => { lookupSheet.getCell(`E${i + 2}`).value = dist; });

      // Populate Column F: Billing Routes
      lookupSheet.getCell('F1').value = 'Billing Routes';
      billingRoutes.forEach((route, i) => { lookupSheet.getCell(`F${i + 2}`).value = route; });

      // Populate Column G: Product Categories
      lookupSheet.getCell('G1').value = 'Product Categories';
      productCategories.forEach((cat, i) => { lookupSheet.getCell(`G${i + 2}`).value = cat; });

      // Populate Column H: Security Modes
      lookupSheet.getCell('H1').value = 'Security Modes';
      securityModes.forEach((mode, i) => { lookupSheet.getCell(`H${i + 2}`).value = mode; });

      // Define Names for Universal Excel Dropdowns
      workbook.definedNames.add(`Lookups!$A$2:$A$${partyTiers.length + 1}`, 'PartyTiers');
      workbook.definedNames.add(`Lookups!$B$2:$B$${operatingCompanies.length + 1}`, 'OperatingCompanies');
      workbook.definedNames.add(`Lookups!$C$2:$C$${constitutionTypes.length + 1}`, 'ConstitutionTypes');
      workbook.definedNames.add(`Lookups!$D$2:$D$${locationStates.length + 1}`, 'LocationStates');
      workbook.definedNames.add(`Lookups!$E$2:$E$${locationDistricts.length + 1}`, 'LocationDistricts');
      workbook.definedNames.add(`Lookups!$F$2:$F$${billingRoutes.length + 1}`, 'BillingRoutes');
      workbook.definedNames.add(`Lookups!$G$2:$G$${productCategories.length + 1}`, 'ProductCategories');
      workbook.definedNames.add(`Lookups!$H$2:$H$${securityModes.length + 1}`, 'SecurityModes');

      // Define Complete S01 Headers (Firm Details + 22 Communication Channels) = 44 Columns
      const s01Headers = [
        // 1. Basic Firm Details & Location (14)
        'firm_name',
        'legal_name',
        'party_type',
        'our_company',
        'constitution_type',
        'gstin',
        'pan',
        'state_name',
        'district_name',
        'city_village',
        'tehsil',
        'block_name',
        'pincode',
        'address',

        // 2. Official Business Communication Channels (8)
        'biz_contact_no_1',
        'biz_contact_no_2',
        'biz_alt_no_1',
        'biz_alt_no_2',
        'biz_email_1',
        'biz_email_2',
        'biz_alt_email_1',
        'biz_alt_email_2',

        // 3. Contact Person 1 (Primary Key Official / Director / Proprietor) (7)
        'contact_person_name_1',
        'contact_mobile_1_1',
        'contact_mobile_1_2',
        'contact_alt_mobile_1_1',
        'contact_alt_mobile_1_2',
        'contact_email_1_2',
        'contact_alt_email_1_1',

        // 4. Contact Person 2 (Secondary / Accounts) (7)
        'contact_person_name_2',
        'contact_mobile_2_1',
        'contact_mobile_2_2',
        'contact_alt_mobile_2_1',
        'contact_alt_mobile_2_2',
        'contact_email_2_2',
        'contact_alt_email_2_1',

        // 5. Contact Person 3 (Additional Key Official) (8)
        'contact_person_name_3',
        'contact_mobile_3_1',
        'contact_mobile_3_2',
        'contact_alt_mobile_3_1',
        'contact_alt_mobile_3_2',
        'contact_email_3_1',
        'contact_email_3_2',
        'contact_alt_email_3_1'
      ];

      // Define Full Scope Headers (S01 + Commercial Terms + Activation) = 49 Columns
      const fullHeaders = [
        ...s01Headers,
        'billing_route',
        'product_category',
        'security_deposit',
        'security_mode',
        'parent_distributor_or_dealer'
      ];

      const activeHeaders = isFull ? fullHeaders : s01Headers;
      sheet.addRow(activeHeaders);

      // Header Row Styling
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isFull ? 'FF0F766E' : 'FF0284C7' } // Teal for Full, Sky for S01
      };
      headerRow.height = 25;

      // Realistic Sample Rows tailored to selected scope
      const fullSampleRows = [
        [
          'Majha Agro Implements Hub',
          'Majha Agro Implements Hub Pvt Ltd',
          'Distributor',
          'NSMLR',
          'PVT_LTD',
          '03AAAAA0000A1Z5',
          'ABCDE1234F',
          'Punjab',
          'Amritsar',
          'Rayya',
          'Baba Bakala',
          'Rayya',
          '143201',
          'Shop 12 GT Road Rayya',
          '9876543210',
          '0183250001',
          '',
          '',
          'orders@majhaagro.com',
          'accounts@majhaagro.com',
          '',
          '',
          'Gurpreet Singh',
          '9876543210',
          '9876543211',
          '',
          '',
          'gurpreet@majhaagro.com',
          '',
          'Harman Singh',
          '9876543212',
          '',
          '',
          '',
          'harman@majhaagro.com',
          '',
          'Baljinder Singh',
          '9876543213',
          '',
          '',
          '',
          'baljinder@majhaagro.com',
          '',
          '',
          'DIRECT_COMPANY_BILLING',
          'Rotavator',
          '100000',
          'Cheque',
          ''
        ],
        [
          'Doaba Tractors & Farm Machines',
          'Doaba Tractors & Farm Machines',
          'Dealer',
          'NSMLR',
          'PARTNERSHIP',
          '03BBBBB0000B1Z6',
          'BCDEF2345G',
          'Punjab',
          'Jalandhar',
          'Nakodar',
          'Nakodar',
          'Nakodar',
          '144001',
          'Near Old Bus Stand Nakodar Road',
          '9812345678',
          '0181240002',
          '',
          '',
          'doaba@tractors.com',
          '',
          '',
          '',
          'Harpreet Singh',
          '9812345678',
          '',
          '',
          '',
          'harpreet@tractors.com',
          '',
          'Manjit Kaur',
          '9812345679',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          'DIRECT_COMPANY_BILLING',
          'Super Seeder',
          '50000',
          'Cheque',
          'Majha Agro Implements Hub'
        ],
        [
          'Malwa Kisan Seva Center',
          'Malwa Kisan Seva Center',
          'Sub-Dealer',
          'NSTLP',
          'PROPRIETORSHIP',
          '',
          '',
          'Punjab',
          'Ludhiana',
          'Khanna',
          'Khanna',
          'Khanna',
          '141401',
          'Main Chowk GT Road Khanna',
          '9823456789',
          '',
          '',
          '',
          'malwa@kisan.com',
          '',
          '',
          '',
          'Jaswinder Singh',
          '9823456789',
          '',
          '',
          '',
          'jaswinder@kisan.com',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          'DEALER_BILLED',
          'Rotavator',
          '25000',
          'Cheque',
          'Doaba Tractors & Farm Machines'
        ]
      ];

      const s01SampleRows = fullSampleRows.map(row => row.slice(0, 44));
      const sampleData = isFull ? fullSampleRows : s01SampleRows;

      sampleData.forEach(row => {
        sheet.addRow(row);
      });

      // Set column widths
      sheet.columns.forEach((col, i) => {
        const headerName = activeHeaders[i];
        if (headerName === 'address' || headerName === 'parent_distributor_or_dealer' || headerName.includes('email')) {
          col.width = 28;
        } else if (headerName.includes('firm_name') || headerName.includes('legal_name') || headerName.includes('contact_person_name')) {
          col.width = 25;
        } else if (headerName.includes('mobile') || headerName.includes('contact_no') || headerName.includes('gstin') || headerName === 'billing_route' || headerName === 'product_category') {
          col.width = 20;
        } else {
          col.width = 16;
        }
      });

      // Apply Excel Data Validations (Dropdowns) across rows 2 to 1000
      // Col C: Party Tier
      sheet.dataValidations.add('C2:C1000', {
        type: 'list',
        allowBlank: true,
        formulae: ['=PartyTiers'],
        showErrorMessage: true,
        errorTitle: 'Invalid Tier',
        error: 'Please pick Distributor, Dealer, or Sub-Dealer from dropdown.'
      });

      // Col D: Operating Company
      sheet.dataValidations.add('D2:D1000', {
        type: 'list',
        allowBlank: true,
        formulae: ['=OperatingCompanies'],
        showErrorMessage: true,
        errorTitle: 'Invalid Company',
        error: 'Please pick NSMLR or NSTL from dropdown.'
      });

      // Col E: Constitution Type
      sheet.dataValidations.add('E2:E1000', {
        type: 'list',
        allowBlank: true,
        formulae: ['=ConstitutionTypes'],
        showErrorMessage: true,
        errorTitle: 'Invalid Constitution',
        error: 'Please pick PROPRIETORSHIP, PARTNERSHIP, PVT_LTD, LTD, or LLP.'
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
        // Col AS (Column 45): Billing Route
        sheet.dataValidations.add('AS2:AS1000', {
          type: 'list',
          allowBlank: true,
          formulae: ['=BillingRoutes'],
          showErrorMessage: true,
          errorTitle: 'Invalid Billing Route',
          error: 'Please choose DIRECT_COMPANY_BILLING, DEALER_BILLED, or DISTRIBUTOR_BILLED.'
        });

        // Col AT (Column 46): Product Category
        sheet.dataValidations.add('AT2:AT1000', {
          type: 'list',
          allowBlank: true,
          formulae: ['=ProductCategories'],
          showErrorMessage: true,
          errorTitle: 'Invalid Product Category',
          error: 'Please select an authorized implement category from dropdown.'
        });

        // Col AV (Column 48): Security Mode
        sheet.dataValidations.add('AV2:AV1000', {
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
    setPreviewFilter('ALL');
    setSearchQuery('');
    setCurrentPage(1);
    setIsValidating(true);

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

        await validateAndPrepareRows(rawData);
      } else {
        // CSV Parsing via PapaParse
        Papa.parse(selectedFile, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim().toLowerCase().replace(/[\s/-]+/g, '_'),
          complete: async (results) => {
            const rawData = results.data || [];
            await validateAndPrepareRows(rawData);
            setIsValidating(false);
          },
          error: (err) => {
            alert('Failed to read CSV: ' + err.message);
            setIsValidating(false);
          }
        });
      }
    } catch (err) {
      console.error('File reading error:', err);
      alert('Error parsing uploaded file: ' + err.message);
    } finally {
      if (isXlsx) {
        setIsValidating(false);
      }
    }
  };

  const validateAndPrepareRows = async (rows) => {
    // 1. Collect phones and GSTINs from the file
    const rawPhones = rows.map(r =>
      r.biz_contact_no_1 || r.contact_mobile_1_1 || r.primary_mobile || r.mobile || r.phone || ''
    );
    const rawGSTINs = rows.map(r =>
      r.gstin || r.gst_no || r['gstin'] || ''
    );

    // 2. Query both Party Master and Leads tables in Supabase in real-time
    let partyDuplicates = {};
    let leadDuplicates = {};
    let gstinDuplicates = {};

    try {
      const res = await checkPartyAndLeadDuplicates(rawPhones, tenantId, rawGSTINs);
      partyDuplicates = res?.partyDuplicates || {};
      leadDuplicates = res?.leadDuplicates || {};
      gstinDuplicates = res?.gstinDuplicates || {};
    } catch (err) {
      console.error('Error checking duplicate parties and leads:', err);
    }

    // 3. Fallback supplement with existing parties in client memory (props)
    (existingParties || []).forEach(p => {
      const ph = String(p.primary_mobile || p.contact_mobile_1_1 || p.biz_contact_no_1 || '').replace(/\D/g, '').slice(-10);
      if (ph && !partyDuplicates[ph]) {
        partyDuplicates[ph] = {
          partyId: p.id,
          partyCode: p.party_universal_code || p.party_code || 'Party Master',
          firmName: p.firm_name
        };
      }
      const g = String(p.gstin || '').trim().toUpperCase();
      if (g && !gstinDuplicates[g]) {
        gstinDuplicates[g] = {
          partyId: p.id,
          partyCode: p.party_universal_code || p.party_code || 'Party Master',
          firmName: p.firm_name
        };
      }
    });

    const seenMobilesInBatch = new Map(); // mobile -> rowIdx
    const seenGSTINsInBatch = new Map(); // gstin -> rowIdx
    const validated = [];
    let validCount = 0;
    let errorCount = 0;

    rows.forEach((row, idx) => {
      const rowIdx = idx + 1;
      const firmName = (row.firm_name || row.company || row.firm || '').trim();
      const rawMobile = (row.biz_contact_no_1 || row.contact_mobile_1_1 || row.primary_mobile || row.mobile || row.phone || '').trim();
      const cleanMobile = rawMobile.replace(/\D/g, '').slice(-10);
      const gstin = (row.gstin || row.gst_no || '').trim().toUpperCase();
      const contactPerson = (row.contact_person_name_1 || row.contact_person || row.owner_name || firmName).trim();
      const state = (row.state_name || row.state || 'Punjab').trim();
      const district = (row.district_name || row.district || '').trim();

      const issues = [];
      let partyMatch = null;
      let leadMatch = null;
      let fileDupRow = null;

      if (!firmName) {
        issues.push('Missing Firm Name');
      }

      if (!cleanMobile || cleanMobile.length < 10) {
        issues.push('Invalid 10-digit Mobile');
      } else {
        // Party Master check
        if (partyDuplicates[cleanMobile]) {
          partyMatch = partyDuplicates[cleanMobile];
        }
        // Lead Data check
        if (leadDuplicates[cleanMobile]) {
          leadMatch = leadDuplicates[cleanMobile];
        }
        // In-file duplicate check
        if (seenMobilesInBatch.has(cleanMobile)) {
          fileDupRow = seenMobilesInBatch.get(cleanMobile);
          issues.push(`Duplicate mobile ${cleanMobile} in file (already at Row #${fileDupRow})`);
        } else {
          seenMobilesInBatch.set(cleanMobile, rowIdx);
        }
      }

      // GSTIN check
      if (gstin && gstin.length >= 10) {
        if (gstinDuplicates[gstin] && !partyMatch) {
          partyMatch = gstinDuplicates[gstin];
        }
        if (seenGSTINsInBatch.has(gstin)) {
          issues.push(`Duplicate GSTIN ${gstin} in file (already at Row #${seenGSTINsInBatch.get(gstin)})`);
        } else {
          seenGSTINsInBatch.set(gstin, rowIdx);
        }
      }

      // Add descriptive duplicate issue messages with IDs
      if (partyMatch && leadMatch) {
        issues.push(`Already in Party Master [${partyMatch.partyCode}] (${partyMatch.firmName}) • Also in Leads [Ref #${leadMatch.leadRefId}] (${leadMatch.status})`);
      } else if (partyMatch) {
        issues.push(`Already in Party Master: [${partyMatch.partyCode}] ${partyMatch.firmName}`);
      } else if (leadMatch) {
        issues.push(`Active in Lead Data: [Ref #${leadMatch.leadRefId}] ${leadMatch.company || leadMatch.name} (${leadMatch.status})`);
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
        _partyMatch: partyMatch,
        _leadMatch: leadMatch,
        _fileDupRow: fileDupRow,
        ...row,
        firm_name: firmName,
        primary_mobile: cleanMobile || rawMobile,
        contact_person: contactPerson,
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

  // Start processing import via fast chunked server action batches (Real-time live progress)
  const handleStartImport = async () => {
    const validToImport = parsedRows.filter(r => r._isValid);
    if (validToImport.length === 0) {
      alert('No valid records to import. Please check validation issues.');
      return;
    }

    const totalRecords = validToImport.length;
    const CHUNK_SIZE = 25;
    const totalChunks = Math.ceil(totalRecords / CHUNK_SIZE);

    setIsProcessing(true);
    setImportProgress({
      active: true,
      percentage: 5,
      current: 0,
      total: totalRecords,
      created: 0,
      skipped: 0,
      logs: [
        `Starting import of ${totalRecords} records in ${importMode === 'FULL' ? 'Full S01–S08' : 'S01-Only'} mode...`,
        `Divided into ${totalChunks} fast real-time batches (${CHUNK_SIZE} records per batch).`
      ],
      complete: false
    });

    let totalImported = 0;
    let totalSkipped = 0;
    const allErrors = [];

    try {
      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        const start = chunkIdx * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalRecords);
        const batch = validToImport.slice(start, end);

        setImportProgress(prev => ({
          ...prev,
          logs: [
            ...prev.logs,
            `⏳ Batch ${chunkIdx + 1} of ${totalChunks}: Processing records ${start + 1} to ${end}...`
          ]
        }));

        const res = await bulkImportPartyMaster(batch, importMode, tenantId, userName || 'Bulk Import Admin');

        if (res && res.success) {
          totalImported += res.imported || 0;
          totalSkipped += res.skipped || 0;
          if (res.errors && res.errors.length) {
            allErrors.push(...res.errors);
          }
          const pct = Math.min(Math.round(((chunkIdx + 1) / totalChunks) * 100), 98);
          setImportProgress(prev => ({
            ...prev,
            percentage: pct,
            current: totalImported,
            created: totalImported,
            skipped: totalSkipped,
            logs: [
              ...prev.logs,
              `✓ Batch ${chunkIdx + 1}/${totalChunks} Complete: +${res.imported} created${res.skipped > 0 ? ` (${res.skipped} skipped)` : ''}. Progress: ${totalImported}/${totalRecords}`
            ]
          }));
        } else {
          const errDetail = res?.error || 'Batch import failed';
          allErrors.push(`Batch ${chunkIdx + 1} Error: ${errDetail}`);
          setImportProgress(prev => ({
            ...prev,
            logs: [
              ...prev.logs,
              `⚠️ Batch ${chunkIdx + 1} notice: ${errDetail}`
            ]
          }));
        }
      }

      // All batches successfully processed
      const summaryLogs = [
        `✅ All ${totalChunks} Batches Completed!`,
        `🎉 Successfully Created: ${totalImported} Channel Partners`,
        totalSkipped > 0 ? `⚠️ Skipped / Duplicates: ${totalSkipped}` : null,
        ...allErrors.slice(0, 5)
      ].filter(Boolean);

      setImportProgress({
        active: false,
        percentage: 100,
        current: totalImported,
        total: totalRecords,
        created: totalImported,
        skipped: totalSkipped,
        logs: summaryLogs,
        complete: true
      });

      if (typeof onImportSuccess === 'function') {
        onImportSuccess();
      }
    } catch (err) {
      console.error('Bulk import error:', err);
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
    setPreviewFilter('ALL');
    setSearchQuery('');
    setCurrentPage(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Download rejected / invalid rows with exact issue reasons as CSV
  const handleDownloadIssuesReport = async () => {
    try {
      const invalidRows = parsedRows.filter(r => !r._isValid);
      if (invalidRows.length === 0) return;
      const { saveAs } = await import('file-saver');
      const exportData = invalidRows.map(r => ({
        'Row Number': r._rowIdx,
        'Firm Name': r.firm_name || '',
        'Party Tier': r.party_type || 'Dealer',
        'Mobile': r.primary_mobile || '',
        'Existing Party Code in Party Master': r._partyMatch?.partyCode || '',
        'Existing Party Firm Name': r._partyMatch?.firmName || '',
        'Existing Lead Ref ID': r._leadMatch?.leadRefId || '',
        'Existing Lead Customer/Company': r._leadMatch ? (r._leadMatch.company || r._leadMatch.name) : '',
        'Existing Lead Stage': r._leadMatch?.status || '',
        'Contact Person': r.contact_person || '',
        'State': r.state_name || '',
        'District': r.district_name || '',
        'Reason for Issue': (r._issues || []).join('; ')
      }));
      const csv = Papa.unparse(exportData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, `Party_Import_Issues_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err) {
      console.error('Error exporting issues:', err);
      alert('Could not export issues report: ' + err.message);
    }
  };

  // Structured breakdown of issue rows for quick inspection
  const issueBreakdown = useMemo(() => {
    const invalidRows = parsedRows.filter(r => !r._isValid);
    return invalidRows.map(r => ({
      rowIdx: r._rowIdx,
      firmName: r.firm_name || 'Unnamed Firm',
      mobile: r.primary_mobile || 'No Mobile',
      tier: r.party_type || 'Dealer',
      location: r.district_name ? `${r.district_name}, ${r.state_name}` : (r.state_name || 'N/A'),
      issues: r._issues || [],
      partyMatch: r._partyMatch || null,
      leadMatch: r._leadMatch || null,
      fileDupRow: r._fileDupRow || null
    }));
  }, [parsedRows]);

  // Filtered rows based on tabs and search query
  const filteredRows = useMemo(() => {
    let list = parsedRows;
    if (previewFilter === 'VALID') {
      list = list.filter(r => r._isValid);
    } else if (previewFilter === 'ISSUES') {
      list = list.filter(r => !r._isValid);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r =>
        (r.firm_name && r.firm_name.toLowerCase().includes(q)) ||
        (r.primary_mobile && String(r.primary_mobile).includes(q)) ||
        (r.contact_person && r.contact_person.toLowerCase().includes(q)) ||
        (r.district_name && r.district_name.toLowerCase().includes(q)) ||
        (r.state_name && r.state_name.toLowerCase().includes(q)) ||
        (r._issues && r._issues.some(issue => issue.toLowerCase().includes(q)))
      );
    }

    return list;
  }, [parsedRows, previewFilter, searchQuery]);

  // Pagination calculation
  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(filteredRows.length / pageSize) || 1;
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const displayedRows = useMemo(() => {
    if (pageSize === 'ALL') return filteredRows;
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safeCurrentPage, pageSize]);

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
        maxWidth: '1020px',
        maxHeight: '92vh',
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

                {isValidating ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0' }}>
                    <RefreshCw size={24} className="animate-spin text-sky-400" />
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#38bdf8' }}>
                      Cross-Checking Duplicates Across Party Master &amp; Leads...
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      Inspecting mobile numbers &amp; GSTINs against live database in real time
                    </div>
                  </div>
                ) : file ? (
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {/* Top Bar: Title & Filter Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Pre-Import Validation Preview ({validationSummary.total} Total Rows):
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => { setPreviewFilter('VALID'); setCurrentPage(1); }}
                        style={{
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          color: '#10b981',
                          background: previewFilter === 'VALID' ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.12)',
                          border: previewFilter === 'VALID' ? '1px solid #10b981' : '1px solid rgba(16,185,129,0.25)',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                        title="Click to view only valid rows"
                      >
                        ✓ {validationSummary.valid} Valid Rows
                      </button>
                      {validationSummary.invalid > 0 && (
                        <button
                          type="button"
                          onClick={() => { setPreviewFilter('ISSUES'); setCurrentPage(1); }}
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            color: '#f87171',
                            background: previewFilter === 'ISSUES' ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.12)',
                            border: previewFilter === 'ISSUES' ? '1px solid #ef4444' : '1px solid rgba(239,68,68,0.25)',
                            padding: '0.25rem 0.65rem',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                          title="Click to view only rows with issues"
                        >
                          ⚠️ {validationSummary.invalid} With Issues
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Dedicated Issues Breakdown Box */}
                  {validationSummary.invalid > 0 && (
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.07)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '8px',
                      padding: '0.85rem 1rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#f87171' }}>
                            {validationSummary.invalid} Rows Have Issues (Skipped on Import)
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewFilter(previewFilter === 'ISSUES' ? 'ALL' : 'ISSUES');
                              setCurrentPage(1);
                            }}
                            style={{
                              padding: '0.28rem 0.65rem',
                              background: previewFilter === 'ISSUES' ? '#ef4444' : 'rgba(239, 68, 68, 0.2)',
                              border: '1px solid #ef4444',
                              color: '#fff',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {previewFilter === 'ISSUES' ? 'Show All Rows in Table' : `🔍 Show Only ${validationSummary.invalid} Issues in Table`}
                          </button>
                          <button
                            type="button"
                            onClick={handleDownloadIssuesReport}
                            style={{
                              padding: '0.28rem 0.65rem',
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: 'var(--text-primary, #fff)',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                            title="Download Excel/CSV of rejected rows with issue reasons"
                          >
                            <Download size={13} /> Download Issues (.csv)
                          </button>
                        </div>
                      </div>

                      {/* Detailed Issue Rows List */}
                      <div style={{
                        maxHeight: '125px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                        paddingRight: '0.25rem'
                      }}>
                        {issueBreakdown.map((item, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setPreviewFilter('ISSUES');
                              setSearchQuery(item.firmName !== 'Unnamed Firm' ? item.firmName : item.mobile);
                              setCurrentPage(1);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: 'rgba(0,0,0,0.3)',
                              padding: '0.45rem 0.65rem',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              borderLeft: '3px solid #ef4444',
                              cursor: 'pointer',
                              gap: '0.5rem',
                              flexWrap: 'wrap'
                            }}
                            title="Click to filter this row in preview table"
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' }}>
                              <span style={{ fontWeight: 800, color: '#fca5a5' }}>Row #{item.rowIdx}:</span>
                              <span style={{ fontWeight: 700, color: 'var(--text-primary, #fff)' }}>{item.firmName}</span>
                              <span style={{ color: 'var(--text-secondary, #94a3b8)', fontFamily: 'monospace' }}>({item.mobile})</span>
                              <span style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.7rem' }}>• {item.location}</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              {item.partyMatch && (
                                <span style={{
                                  background: 'rgba(56, 189, 248, 0.2)',
                                  border: '1px solid rgba(56, 189, 248, 0.5)',
                                  color: '#38bdf8',
                                  padding: '0.12rem 0.45rem',
                                  borderRadius: '4px',
                                  fontWeight: 800,
                                  fontSize: '0.7rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}>
                                  🏢 Party ID: {item.partyMatch.partyCode}
                                </span>
                              )}
                              {item.leadMatch && (
                                <span style={{
                                  background: 'rgba(245, 158, 11, 0.2)',
                                  border: '1px solid rgba(245, 158, 11, 0.5)',
                                  color: '#fbbf24',
                                  padding: '0.12rem 0.45rem',
                                  borderRadius: '4px',
                                  fontWeight: 800,
                                  fontSize: '0.7rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}>
                                  🎯 Lead ID: #{item.leadMatch.leadRefId}
                                </span>
                              )}
                              <div style={{ color: '#f87171', fontWeight: 600 }}>
                                {item.issues.join(' • ')}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Filter Pills & Quick Search Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => { setPreviewFilter('ALL'); setCurrentPage(1); }}
                        style={{
                          padding: '0.3rem 0.7rem',
                          borderRadius: '6px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: previewFilter === 'ALL' ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                          background: previewFilter === 'ALL' ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.03)',
                          color: previewFilter === 'ALL' ? '#38bdf8' : 'var(--text-secondary)'
                        }}
                      >
                        All Records ({validationSummary.total})
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPreviewFilter('VALID'); setCurrentPage(1); }}
                        style={{
                          padding: '0.3rem 0.7rem',
                          borderRadius: '6px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: previewFilter === 'VALID' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                          background: previewFilter === 'VALID' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)',
                          color: previewFilter === 'VALID' ? '#10b981' : 'var(--text-secondary)'
                        }}
                      >
                        ✓ Valid Only ({validationSummary.valid})
                      </button>
                      {validationSummary.invalid > 0 && (
                        <button
                          type="button"
                          onClick={() => { setPreviewFilter('ISSUES'); setCurrentPage(1); }}
                          style={{
                            padding: '0.3rem 0.7rem',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: previewFilter === 'ISSUES' ? '1px solid #ef4444' : '1px solid rgba(239,68,68,0.3)',
                            background: previewFilter === 'ISSUES' ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.08)',
                            color: '#f87171'
                          }}
                        >
                          ⚠️ Issues Only ({validationSummary.invalid})
                        </button>
                      )}
                    </div>

                    {/* Quick Search */}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Search firm, mobile, city..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        style={{
                          padding: '0.3rem 0.6rem 0.3rem 1.8rem',
                          background: 'rgba(0,0,0,0.35)',
                          border: '1px solid var(--border-light, rgba(255,255,255,0.15))',
                          borderRadius: '6px',
                          color: 'var(--text-primary, #fff)',
                          fontSize: '0.74rem',
                          width: '200px'
                        }}
                      />
                      <Search size={13} style={{ position: 'absolute', left: '8px', color: 'var(--text-secondary, #94a3b8)', pointerEvents: 'none' }} />
                      {searchQuery && (
                        <X
                          size={13}
                          style={{ position: 'absolute', right: '8px', color: 'var(--text-secondary, #94a3b8)', cursor: 'pointer' }}
                          onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Preview Table with Frozen Header & Full Data Scrolling */}
                  <div style={{
                    maxHeight: '340px',
                    overflowY: 'auto',
                    border: '1px solid var(--border-light, rgba(255,255,255,0.1))',
                    borderRadius: '8px',
                    background: 'var(--bg-primary, #0b1120)'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.78rem', textAlign: 'left' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b1120' }}>
                        <tr style={{ background: '#0b1120', color: 'var(--text-secondary, #94a3b8)', borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.1))' }}>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#0b1120', borderBottom: '1px solid rgba(255,255,255,0.1)', width: '50px' }}>#</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#0b1120', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Firm Name</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#0b1120', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Tier</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#0b1120', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Mobile</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#0b1120', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Contact Person</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#0b1120', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Location</th>
                          <th style={{ padding: '0.55rem 0.75rem', position: 'sticky', top: 0, background: '#0b1120', borderBottom: '1px solid rgba(255,255,255,0.1)', minWidth: '220px' }}>Status &amp; Validation Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedRows.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary, #94a3b8)' }}>
                              No records found matching current filter or search criteria.
                            </td>
                          </tr>
                        ) : (
                          displayedRows.map((r, i) => (
                            <tr
                              key={r._rowIdx || i}
                              style={{
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                background: r._isValid ? 'transparent' : 'rgba(239,68,68,0.08)'
                              }}
                            >
                              <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{r._rowIdx}</td>
                              <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{r.firm_name || '-'}</td>
                              <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{r.party_type || 'Dealer'}</td>
                              <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{r.primary_mobile || '-'}</td>
                              <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{r.contact_person || '-'}</td>
                              <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                {r.district_name ? `${r.district_name}, ${r.state_name}` : r.state_name}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                {r._isValid ? (
                                  <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.74rem' }}>
                                    ✓ Valid &amp; Ready
                                  </span>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    {(r._partyMatch || r._leadMatch) && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                        {r._partyMatch && (
                                          <span style={{
                                            background: 'rgba(56, 189, 248, 0.2)',
                                            border: '1px solid rgba(56, 189, 248, 0.5)',
                                            color: '#38bdf8',
                                            padding: '0.1rem 0.35rem',
                                            borderRadius: '4px',
                                            fontWeight: 800,
                                            fontSize: '0.68rem',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.2rem'
                                          }}>
                                            🏢 {r._partyMatch.partyCode}
                                          </span>
                                        )}
                                        {r._leadMatch && (
                                          <span style={{
                                            background: 'rgba(245, 158, 11, 0.2)',
                                            border: '1px solid rgba(245, 158, 11, 0.5)',
                                            color: '#fbbf24',
                                            padding: '0.1rem 0.35rem',
                                            borderRadius: '4px',
                                            fontWeight: 800,
                                            fontSize: '0.68rem',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.2rem'
                                          }}>
                                            🎯 Lead #{r._leadMatch.leadRefId}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.74rem' }}>
                                      ⚠️ {r._issues[0]}
                                    </span>
                                    {r._issues.length > 1 && (
                                      <span style={{ color: '#fca5a5', fontSize: '0.68rem' }}>
                                        +{r._issues.length - 1} more: {r._issues.slice(1).join(', ')}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination & Full Data Controls */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    fontSize: '0.76rem',
                    color: 'var(--text-secondary, #94a3b8)',
                    paddingTop: '0.2rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span>Rows per page:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          const val = e.target.value === 'ALL' ? 'ALL' : Number(e.target.value);
                          setPageSize(val);
                          setCurrentPage(1);
                        }}
                        style={{
                          background: 'rgba(0,0,0,0.35)',
                          border: '1px solid var(--border-light, rgba(255,255,255,0.15))',
                          borderRadius: '5px',
                          color: 'var(--text-primary, #fff)',
                          padding: '0.2rem 0.45rem',
                          fontSize: '0.75rem',
                          cursor: 'pointer'
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value="ALL">All ({filteredRows.length} Rows)</option>
                      </select>
                      <span>
                        Showing {filteredRows.length === 0 ? 0 : pageSize === 'ALL' ? `1-${filteredRows.length}` : `${(safeCurrentPage - 1) * pageSize + 1}-${Math.min(safeCurrentPage * pageSize, filteredRows.length)}`} of {filteredRows.length} records {previewFilter !== 'ALL' ? `(${previewFilter.toLowerCase()})` : ''}
                      </span>
                    </div>

                    {pageSize !== 'ALL' && totalPages > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <button
                          type="button"
                          disabled={safeCurrentPage <= 1}
                          onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                          style={{
                            padding: '0.25rem 0.6rem',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid var(--border-light, rgba(255,255,255,0.1))',
                            borderRadius: '5px',
                            color: safeCurrentPage <= 1 ? 'rgba(255,255,255,0.3)' : 'var(--text-primary, #fff)',
                            cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer'
                          }}
                        >
                          ◀ Prev
                        </button>
                        <span style={{ padding: '0 0.4rem', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
                          Page {safeCurrentPage} of {totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={safeCurrentPage >= totalPages}
                          onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                          style={{
                            padding: '0.25rem 0.6rem',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid var(--border-light, rgba(255,255,255,0.1))',
                            borderRadius: '5px',
                            color: safeCurrentPage >= totalPages ? 'rgba(255,255,255,0.3)' : 'var(--text-primary, #fff)',
                            cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer'
                          }}
                        >
                          Next ▶
                        </button>
                      </div>
                    )}
                  </div>
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
