import ExcelJS from 'exceljs';
import fs from 'fs';
import { INDIAN_STATES, INDIAN_DISTRICTS_MAP } from '../src/constants/indianLocations.js';

async function test() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Client Registration');
  const listSheet = wb.addWorksheet('Lists');
  listSheet.state = 'hidden';

  // State column in listSheet
  INDIAN_STATES.forEach((st, i) => {
    listSheet.getCell(`A${i + 1}`).value = st;
  });
  wb.definedNames.add(`Lists!$A$1:$A$${INDIAN_STATES.length}`, 'IndianStates');

  // District lists
  const distSheet = wb.addWorksheet('DistrictLists');
  distSheet.state = 'hidden';

  let colIdx = 1;
  INDIAN_STATES.forEach(state => {
    const safeName = state.replace(/\s+/g, '_');
    const districts = INDIAN_DISTRICTS_MAP[state] || [];
    const colLetter = getColLetter(colIdx);
    distSheet.getCell(`${colLetter}1`).value = safeName;
    districts.forEach((d, dIdx) => {
      distSheet.getCell(`${colLetter}${dIdx + 2}`).value = d;
    });
    if (districts.length > 0) {
      wb.definedNames.add(`DistrictLists!$${colLetter}$2:$${colLetter}$${districts.length + 1}`, safeName);
    }
    colIdx++;
  });

  // State validation on AP
  ws.dataValidations.add('AP2:AP500', {
    type: 'list',
    allowBlank: true,
    formulae: ['=IndianStates']
  });

  // Dependent District validation on AQ
  ws.dataValidations.add('AQ2:AQ500', {
    type: 'list',
    allowBlank: true,
    formulae: ['=INDIRECT(SUBSTITUTE(AP2," ","_"))']
  });

  const buf = await wb.xlsx.writeBuffer();
  fs.writeFileSync('tests/sample_dependent.xlsx', buf);

  // Now reload and inspect
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);
  console.log('Worksheets:', wb2.worksheets.map(w => w.name));
  console.log('Original definedNames Uttar_Pradesh:', wb.definedNames.getRanges('Uttar_Pradesh'));
  console.log('Loaded definedNames Uttar_Pradesh:', wb2.definedNames.getRanges('Uttar_Pradesh'));
  
  // Inspect XML of worksheet to see dataValidation element
  const zip = await import('jszip');
  const jszip = new zip.default();
  const zipContent = await jszip.loadAsync(buf);
  const sheetXml = await zipContent.file('xl/worksheets/sheet1.xml').async('text');
  console.log('DataValidations in sheet1.xml:', sheetXml.match(/<dataValidations[\s\S]*?<\/dataValidations>/)?.[0]);
  const workbookXml = await zipContent.file('xl/workbook.xml').async('text');
  console.log('DefinedNames in workbook.xml (first 500 chars):', workbookXml.match(/<definedNames[\s\S]*?<\/definedNames>/)?.[0]?.substring(0, 500));
}

function getColLetter(col) {
  let letter = '';
  while (col > 0) {
    const mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - mod) / 26);
  }
  return letter;
}

test().catch(console.error);
