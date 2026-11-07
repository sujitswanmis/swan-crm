// Shared by the directory, import preview and server-side import validation.
export const MAX_IMPORT_ROWS = 1000;
export const IMPORT_BATCH_SIZE = 25;
export const END_CUSTOMER_COMPANIES = ['NSMLR', 'NSTLP'];

export function normalizeEndCustomerCompany(value) {
  const company = String(value ?? '').trim().toUpperCase();
  return company === 'NSTL' ? 'NSTLP' : company;
}

export function endCustomerDealerCompany(party) {
  return normalizeEndCustomerCompany(party?.our_company || party?.meta?.our_company || 'NSMLR');
}

export function filterEndCustomerDealers(parties, company) {
  const selected = normalizeEndCustomerCompany(company);
  return selected ? (parties || []).filter(party => endCustomerDealerCompany(party) === selected) : [];
}

export const END_CUSTOMER_COLUMNS = [
  ['customer_code', 'Customer Code'], ['full_name', 'Full Name', true],
  ['mobile_1', 'Mobile 1', true], ['mobile_2', 'Mobile 2'],
  ['alternate_mobile_1', 'Alternate Mobile 1'], ['alternate_mobile_2', 'Alternate Mobile 2'],
  ['email_1', 'Email 1'], ['alternate_email_1', 'Alternate Email 1'],
  ['state_name', 'State'], ['district_name', 'District'], ['pin_code', 'PIN Code'],
  ['landmark', 'Landmark'], ['block_area_name', 'Block / Area'], ['full_address', 'Full Address'],
  ['linked_party_name', 'Linked Dealer'], ['linked_party_code', 'Dealer Code'],
  ['product_name', 'Product Model', true], ['product_sku', 'Product SKU'],
  ['chassis_serial_number', 'Chassis Serial No'], ['purchase_date', 'Purchase Date'],
  ['purchase_invoice_no', 'Invoice No'], ['warranty_months', 'Warranty Months'],
  ['warranty_status', 'Warranty Status'], ['warranty_expiry_date', 'Warranty Expiry Date'],
  ['complaints_count', 'Total Complaints'], ['our_company', 'Company Name']
].map(([key, label, required = false]) => ({ key, label, required }));

const text = value => String(value ?? '').trim();
const normalized = value => text(value).toLowerCase().replace(/\s+/g, ' ');
const headerKey = value => normalized(value).replace(/[^a-z0-9]/g, '');
const headerFields = new Map(END_CUSTOMER_COLUMNS.flatMap(c => [[headerKey(c.key), c.key], [headerKey(c.label), c.key]]));
[['customerfullname', 'full_name'], ['emailid1', 'email_1'], ['alternatemailid1', 'alternate_email_1'],
  ['statename', 'state_name'], ['districtname', 'district_name'], ['chassismachineserialnumber', 'chassis_serial_number'],
  ['operatingcompany', 'our_company'], ['company', 'our_company']
].forEach(([alias, key]) => headerFields.set(alias, key));

export function getISTDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

export function normalizeImportDate(value) {
  if (value === '' || value == null) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : getISTDate(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value > 100000) return null;
    return getISTDate(new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000));
  }
  const raw = text(value);
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    const indian = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (indian) match = [raw, indian[3], indian[2].padStart(2, '0'), indian[1].padStart(2, '0')];
  }
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${iso}T00:00:00+05:30`);
  return !Number.isNaN(date.getTime()) && getISTDate(date) === iso ? iso : null;
}

export function partyCode(party) {
  return text(party.party_universal_code || party.distributor_code || party.dealer_code || party.sub_dealer_code || party.external_sap_code);
}

export function dealerLabel(party) {
  const code = partyCode(party);
  return `${party.firm_name || party.legal_name || 'Dealer'}${code ? ` [${code}]` : ''}`;
}

function matchMaster(items, name, code, getName, getCode) {
  const label = text(name).match(/^(.*?)\s+\[([^\]]+)\]$/);
  const wantedName = normalized(label ? label[1] : name);
  const wantedCode = normalized(code || label?.[2]);
  if (code && label && normalized(code) !== normalized(label[2])) return null;
  const matches = items.filter(item => (!wantedCode || normalized(getCode(item)) === wantedCode)
    && (!wantedName || normalized(getName(item)) === wantedName));
  return matches.length === 1 ? matches[0] : null;
}

function mobileText(value) {
  let raw = text(value).replace(/^'/, '').replace(/[\s()-]/g, '');
  if (/^\+91\d{10}$/.test(raw)) raw = raw.slice(3);
  else if (/^91\d{10}$/.test(raw)) raw = raw.slice(2);
  return raw;
}

function duplicateKeys(row) {
  const keys = [];
  if (row.customer_code) keys.push(`code:${normalized(row.customer_code)}`);
  if (row.chassis_serial_number) keys.push(`chassis:${normalized(row.chassis_serial_number)}`);
  else keys.push(`owner:${normalized(row.full_name)}|${mobileText(row.mobile_1)}|${normalized(row.product_name)}|${normalized(row.purchase_invoice_no)}|${row.purchase_date || ''}`);
  return keys;
}

export function validateEndCustomerRows(rows, { parties = [], products = [], districtsByState = {}, existingCustomers = [] } = {}) {
  const seen = new Set(existingCustomers.flatMap(duplicateKeys));
  return rows.map((raw, index) => {
    const data = Object.fromEntries(END_CUSTOMER_COLUMNS.map(c => [c.key, text(raw[c.key])]));
    const errors = [];
    const requestedCompany = normalizeEndCustomerCompany(data.our_company);
    if (requestedCompany && !END_CUSTOMER_COMPANIES.includes(requestedCompany)) errors.push('Company Name must be NSMLR or NSTLP');
    let dealerCompany = '';
    if (!data.full_name) errors.push('Full Name is required');
    for (const key of ['mobile_1', 'mobile_2', 'alternate_mobile_1', 'alternate_mobile_2']) {
      data[key] = mobileText(data[key]);
      if ((key === 'mobile_1' || data[key]) && !/^[6-9]\d{9}$/.test(data[key])) errors.push(`${END_CUSTOMER_COLUMNS.find(c => c.key === key).label} must be a valid 10-digit Indian mobile`);
    }
    for (const key of ['email_1', 'alternate_email_1']) {
      if (data[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data[key])) errors.push('Invalid email address');
    }
    if (data.pin_code && !/^[1-9]\d{5}$/.test(data.pin_code)) errors.push('PIN Code must contain 6 digits');
    const purchaseDate = normalizeImportDate(raw.purchase_date);
    if (purchaseDate === null) errors.push('Purchase Date must be YYYY-MM-DD or DD-MM-YYYY');
    data.purchase_date = purchaseDate || '';

    const states = Object.keys(districtsByState);
    const state = states.find(s => normalized(s) === normalized(data.state_name));
    if (data.state_name && states.length && !state) errors.push('State is not in Location Master');
    if (state) data.state_name = state;
    if (data.district_name) {
      const district = (districtsByState[state] || []).find(d => normalized(d) === normalized(data.district_name));
      if (!state || !district) errors.push('District must belong to the selected State');
      else data.district_name = district;
    }

    if (data.linked_party_name || data.linked_party_code) {
      const party = matchMaster(parties, data.linked_party_name, data.linked_party_code, p => p.firm_name || p.legal_name, partyCode);
      if (!party) errors.push('Dealer must match a unique Party Master name/code in this workspace');
      else {
        dealerCompany = endCustomerDealerCompany(party);
        if (requestedCompany && requestedCompany !== dealerCompany) errors.push('Selected Dealer does not belong to Company Name');
        Object.assign(data, { linked_party_id: party.id, linked_party_code: partyCode(party), linked_party_name: party.firm_name || party.legal_name,
          dealer_city_district: [party.city_name, party.district_name].filter(Boolean).join(', ') });
      }
    }
    // Earlier templates did not have this column; keep them importable without changing existing rows.
    data.our_company = requestedCompany || dealerCompany || 'NSMLR';
    if (!END_CUSTOMER_COMPANIES.includes(data.our_company) && !requestedCompany) errors.push('Dealer Company is not supported; check Party Master');
    const product = (data.product_name || data.product_sku)
      ? matchMaster(products, data.product_name, data.product_sku, p => p.name, p => p.sku) : null;
    if (!product) errors.push('Product Model / SKU must match a unique Product Master entry');
    else Object.assign(data, { product_id: product.id, product_name: product.name, product_sku: text(product.sku) });
    const defaultMonths = /leveller/i.test(`${product?.category || ''} ${product?.name || ''}`) ? 24 : 12;
    const months = data.warranty_months ? Number(data.warranty_months) : defaultMonths;
    if (!Number.isInteger(months) || months < 1 || months > 120) errors.push('Warranty Months must be an integer from 1 to 120');
    data.warranty_months = months;
    const keys = duplicateKeys(data);
    const duplicate = !errors.length && keys.some(key => seen.has(key));
    if (!errors.length && !duplicate) keys.forEach(key => seen.add(key));
    return { rowNumber: Number(raw._rowNumber) || index + 2, data, status: errors.length ? 'invalid' : duplicate ? 'duplicate' : 'ready',
      messages: duplicate ? ['Already exists or repeated in this file; will be skipped'] : errors };
  });
}

export function recordsFromMatrix(matrix) {
  const headerIndex = matrix.findIndex(row => row.some(v => text(v)));
  if (headerIndex < 0) throw new Error('The file is empty. Download a template first.');
  const fields = matrix[headerIndex].map(value => headerFields.get(headerKey(value)));
  const recognized = fields.filter(Boolean);
  if (new Set(recognized).size !== recognized.length) throw new Error('Duplicate column headings. Use each template column once.');
  for (const column of END_CUSTOMER_COLUMNS.filter(c => c.required)) {
    if (!fields.includes(column.key)) throw new Error(`Missing required column: ${column.label}`);
  }
  const records = [];
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const values = matrix[i];
    if (!fields.some((field, j) => field && text(values[j]))) continue;
    const record = { _rowNumber: i + 1 };
    fields.forEach((field, j) => { if (field) record[field] = values[j] ?? ''; });
    records.push(record);
    if (records.length > MAX_IMPORT_ROWS) throw new Error(`Import at most ${MAX_IMPORT_ROWS} records per file.`);
  }
  if (!records.length) throw new Error('No customer rows found. Fill the template below its header.');
  return records;
}

function excelCellValue(cell) {
  const value = cell.value;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (value.formula || value.sharedFormula) throw new Error(`Formula found in ${cell.address}. Paste values before importing.`);
    if (value.richText) return value.richText.map(part => part.text).join('');
    if (value.text != null) return value.text;
    if (value.error) throw new Error(`Excel error in ${cell.address}. Correct it before importing.`);
  }
  return value ?? '';
}

export async function parseEndCustomerFile(file, format) {
  if (file.size > 5 * 1024 * 1024) throw new Error('File must be 5 MB or smaller.');
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension !== format) throw new Error(`Select a .${format} file.`);
  if (format === 'csv') {
    const Papa = (await import('papaparse')).default;
    const result = Papa.parse(await file.text(), { skipEmptyLines: false });
    if (result.errors.length) throw new Error(`CSV could not be read: ${result.errors[0].message}`);
    return recordsFromMatrix(result.data);
  }
  if (format !== 'xlsx') throw new Error('Use CSV or Excel (.xlsx).');
  const ExcelMod = await import('exceljs/dist/exceljs.min.js');
  const ExcelJS = ExcelMod.default || ExcelMod;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet('End Customers') || workbook.worksheets.find(s => s.state === 'visible');
  if (!sheet) throw new Error('No visible customer sheet found.');
  if (sheet.rowCount > 10001 || sheet.columnCount > 100) throw new Error('Worksheet is too large. Use the supplied template.');
  const matrix = [];
  sheet.eachRow({ includeEmpty: true }, row => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => { values[column - 1] = excelCellValue(cell); });
    matrix.push(values);
  });
  return recordsFromMatrix(matrix);
}

export function exportEndCustomerRows(customers, complaints = () => 0) {
  return customers.map(customer => Object.fromEntries(END_CUSTOMER_COLUMNS.map(({ key }) => {
    let value = customer[key] ?? '';
    if (key === 'warranty_status') value = customer.warranty_info?.status || '';
    if (key === 'warranty_expiry_date') value = customer.warranty_info?.expiryDate || customer.warranty_info?.expiry_date || '';
    if (key === 'complaints_count') value = complaints(customer);
    return [key, value];
  })));
}

export async function createEndCustomerCSV(rows = []) {
  const Papa = (await import('papaparse')).default;
  return '\uFEFF' + Papa.unparse({ fields: END_CUSTOMER_COLUMNS.map(c => c.label),
    data: rows.map(row => END_CUSTOMER_COLUMNS.map(c => row[c.key] ?? '')) }, { escapeFormulae: true });
}

export async function createEndCustomerWorkbook(rows = [], { template = false, parties = [], products = [], districtsByState = {} } = {}) {
  const ExcelMod = await import('exceljs/dist/exceljs.min.js');
  const ExcelJS = ExcelMod.default || ExcelMod;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SuPuja Creations CRM';
  const sheet = workbook.addWorksheet('End Customers', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
  sheet.columns = END_CUSTOMER_COLUMNS.map(c => ({ header: c.label, key: c.key, width: /name|address|dealer|model|landmark|area/.test(c.key) ? 30 : 21,
    style: { numFmt: c.key === 'warranty_months' || c.key === 'complaints_count' ? '0' : '@', alignment: { vertical: 'top', wrapText: true } } }));
  rows.forEach(row => sheet.addRow(END_CUSTOMER_COLUMNS.map(c => row[c.key] ?? '')));
  sheet.getRow(1).height = 34;
  sheet.getRow(1).eachCell((cell, index) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: END_CUSTOMER_COLUMNS[index - 1].required ? 'FF1D4ED8' : 'FF334155' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: END_CUSTOMER_COLUMNS.length } };
  if (template) {
    const lookup = workbook.addWorksheet('Lookups', { state: 'veryHidden' });
    let lookupColumn = 0;
    const addList = (name, entries) => {
      const values = [...new Set(entries.map(text).filter(Boolean))];
      const column = lookup.getColumn(++lookupColumn);
      column.values = [name, ...(values.length ? values : [''])];
      workbook.definedNames.add(`'Lookups'!$${column.letter}$2:$${column.letter}$${Math.max(2, values.length + 1)}`, name);
      return name;
    };
    const lists = {
      linked_party_name: addList('EC_Dealers', parties.map(dealerLabel)),
      linked_party_code: addList('EC_DealerCodes', parties.map(partyCode)),
      product_name: addList('EC_Products', products.map(p => p.name)),
      product_sku: addList('EC_ProductSKUs', products.map(p => p.sku)),
      state_name: addList('EC_States', Object.keys(districtsByState)),
      our_company: addList('EC_Companies', END_CUSTOMER_COMPANIES)
    };
    const emptyList = addList('EC_NoDistricts', []);
    const districtRanges = Object.entries(districtsByState).map(([state, districts], index) => [state, addList(`EC_District_${index}`, districts)]);
    const mapColumn = ++lookupColumn;
    lookup.getColumn(mapColumn).values = ['State', ...districtRanges.map(([state]) => state)];
    lookup.getColumn(++lookupColumn).values = ['District Range', ...districtRanges.map(([, name]) => name)];
    workbook.definedNames.add(`'Lookups'!$${lookup.getColumn(mapColumn).letter}$2:$${lookup.getColumn(lookupColumn).letter}$${Math.max(2, districtRanges.length + 1)}`, 'EC_StateDistrictMap');
    const stateLetter = sheet.getColumn('state_name').letter;
    for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row++) {
      for (const [key, name] of Object.entries(lists)) sheet.getCell(`${sheet.getColumn(key).letter}${row}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [name], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Choose from the master list', error: 'Select a value from this dropdown.'
      };
      sheet.getCell(`${sheet.getColumn('district_name').letter}${row}`).dataValidation = { type: 'list', allowBlank: true,
        formulae: [`INDIRECT(IFERROR(VLOOKUP($${stateLetter}${row},EC_StateDistrictMap,2,FALSE),"${emptyList}"))`],
        showErrorMessage: true, errorStyle: 'stop', error: 'Choose State first, then one of its districts.' };
      sheet.getCell(`${sheet.getColumn('warranty_months').letter}${row}`).dataValidation = { type: 'whole', operator: 'between', allowBlank: true, formulae: [1, 120], showErrorMessage: true, error: 'Enter whole months between 1 and 120.' };
    }
    const instructions = workbook.addWorksheet('Instructions');
    instructions.columns = [{ width: 32 }, { width: 100 }];
    [ ['End Customer Import', 'Fill End Customers from row 2. Blue headers are required. Maximum 1000 records.'],
      ['Required', 'Full Name, Mobile 1 and Product Model. Use Product SKU when model names are ambiguous.'],
      ['Dealer', 'Choose Linked Dealer from the dropdown. Dealer Code may stay blank when that selection contains the code.'],
      ['Company Name', 'Choose NSMLR or NSTLP. The dealer must belong to that company. Older files without this column use the dealer company, or NSMLR when no dealer is supplied.'],
      ['Location', 'Choose State first, then District. Both values are checked against Location Master.'],
      ['Dates and mobile numbers', 'Purchase Date: YYYY-MM-DD or DD-MM-YYYY (IST). Keep phone numbers and codes as text.'],
      ['Calculated fields', 'Leave Customer Code, Warranty Status, Warranty Expiry Date and Total Complaints blank for new customers.'],
      ['Import behavior', 'Preview before importing. Invalid and duplicate rows are skipped. Existing customers are never overwritten.'],
      ['Attachments', 'Invoice and chassis photo uploads are available through Register End Customer.'],
      ['Warranty Months', 'Leave blank for the product default (24 months for Land Leveller; otherwise 12).']
    ].forEach(values => { const row = instructions.addRow(values); row.height = 42; row.alignment = { vertical: 'middle', wrapText: true }; });
    instructions.getRow(1).font = { bold: true, size: 12 };
  }
  return workbook;
}

export async function downloadEndCustomerFile(format, rows, { tenantId, template = false, ...lookups } = {}) {
  const fileName = `End_Customers_${text(tenantId).replace(/[^a-zA-Z0-9_-]/g, '')}_${template ? 'Template_' : ''}${getISTDate()}.${format}`;
  const { saveAs } = await import('file-saver');
  if (format === 'csv') saveAs(new Blob([await createEndCustomerCSV(rows)], { type: 'text/csv;charset=utf-8' }), fileName);
  else {
    const workbook = await createEndCustomerWorkbook(rows, { template, ...lookups });
    saveAs(new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
  }
}
