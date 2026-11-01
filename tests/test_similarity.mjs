import { cleanCorporateName, calculateLeadSimilarityScore } from '../src/utils/dataSanitizer.js';

const allTests = [
  // False matches from screenshots & data analysis -> Must be 0% Clean
  { in: { company: 'M/S GURU ARJUN DEV TRACTORS', state: 'Punjab', district: 'Ludhiana' }, ex: { company: 'M/S SHUBHAM MOTOR STORE,', state: 'Punjab', district: 'Jalandhar' } },
  { in: { company: 'M/S GREEN MOTOR SERVICE', state: 'Punjab', district: 'Amritsar' }, ex: { company: 'M/S SHUBHAM MOTOR STORE,', state: 'Punjab', district: 'Jalandhar' } },
  { in: { company: 'M/S D.S TRACTORS', state: 'Punjab', district: 'Bathinda' }, ex: { company: 'M/S SHUBHAM MOTOR STORE,', state: 'Punjab', district: 'Jalandhar' } },
  { in: { company: 'VSB ENTERPRISES', state: 'Punjab', district: 'Bathinda' }, ex: { company: 'DTC Enterprise', state: 'Punjab', district: 'Bathinda' } },
  { in: { company: 'NEW DASHMESH TRACTORS', state: 'Punjab', district: 'Amritsar' }, ex: { company: 'new khalsa agro treders', state: 'Punjab', district: 'Amritsar' } },
  { in: { company: 'KRISHAK BANDHU AGENCIES', state: 'UP', district: 'Varanasi' }, ex: { company: 'KRISHAK GHAR', state: 'Bihar', district: 'Patna' } },
  { in: { company: 'PANDIT PALTOORAM MOTORS', state: 'MP', district: 'Bhopal' }, ex: { company: 'pandit ji agro Traders', state: 'UP', district: 'Lucknow' } },
  { in: { company: 'PUNJAB CRDI POINT', state: 'Punjab', district: 'Ludhiana' }, ex: { company: 'PUNJAB AGRICULTURE STORE', state: 'Punjab', district: 'Bathinda' } },
  { in: { company: 'PERFECT AUTOMOBILES', state: 'Punjab', district: 'Ludhiana' }, ex: { company: 'PERFECT TRADERS', state: 'Maharashtra', district: 'Pune' } },
  { in: { company: 'M M ENTERPRISES', state: 'Bihar', district: 'East Champaran' }, ex: { company: 'Tirhut Farm Machinery', state: 'Bihar', district: 'East Champaran' } },
  { in: { company: 'SHYAM TRACTORS', state: 'Gujarat', district: 'Bhavnagar' }, ex: { company: 'Kalathiya Ghanshyambhai Babubhai', state: 'Gujarat', district: 'Bhavnagar' } },
  { in: { company: 'MAA AMBIKA TRACTOR', state: 'Chhattisgarh', district: 'Raigarh' }, ex: { company: 'MAA DURGA SALES', state: 'Chhattisgarh', district: 'Raigarh' } },
  { in: { company: 'TEAM ENGINEERS', state: 'Maharashtra', district: 'Pune' }, ex: { company: 'TWIN ENGINEERS PVT LTD', state: 'Maharashtra', district: 'Pune' } },
  { in: { company: 'BABA VISHKARMA TRACTORS', state: 'Punjab', district: 'Nawanshahr' }, ex: { company: 'baba buda sahib ji automobile', state: 'Punjab', district: 'Nawanshahr' } },
  { in: { company: 'OM TECH EQUIPMENTS', state: 'Karnataka', district: 'Hubli' }, ex: { company: 'OM SHAKTHI HYDRAULICS PVT LTD', state: 'Karnataka', district: 'Hubli' } },

  // Genuine matches from screenshots -> Must be properly detected
  { in: { company: 'VAISHNAV MOTORS', state: 'Chhattisgarh', district: 'Bastar' }, ex: { company: 'Viashnav Motors', state: 'Chhattisgarh', district: 'Bastar' } },
  { in: { company: 'MARUTI MOTORS', state: 'Madhya Pradesh', district: 'Raisen' }, ex: { company: 'maruti motors', state: 'Madhya Pradesh', district: 'Raisen' } },
  { in: { company: 'SANWARIYA TRACTORS', state: 'Madhya Pradesh', district: 'Indore' }, ex: { company: 'SANWARIYA TRACTORS', state: 'Madhya Pradesh', district: 'Bhopal' } },
  { in: { company: 'M/S BARNALA TRACTORS', state: 'Punjab', district: 'Barnala' }, ex: { company: 'M/S Barnala Tractors (Swaraj)', state: 'Punjab', district: 'Barnala' } },
  { in: { company: 'SHIV AUTOMOBILE', state: 'Bihar', district: 'Purnia' }, ex: { company: 'Shiv Automobiles (Kubota)', state: 'Bihar', district: 'Purnia' } },
  { in: { company: 'SRI HANUMAN AUTOMOBILES', state: 'Uttar Pradesh', district: 'Varanasi' }, ex: { company: 'Hanuman', state: 'Uttar Pradesh', district: 'Lucknow' } },
  { in: { company: 'GURU NANAK MOTORS', state: 'Punjab', district: 'Kapurthala' }, ex: { company: 'Guru Nanak Motors (Sonalika)', state: 'Punjab', district: 'Kapurthala' } },
  { in: { company: 'JIMIDARA AGROTECH', state: 'Punjab', district: 'Mansa' }, ex: { company: 'Zimidara Agriculture implements', state: 'Punjab', district: 'Mansa' } }
];

let failed = 0;
allTests.forEach((t, i) => {
  const r = calculateLeadSimilarityScore(t.in, t.ex);
  const isCleanExpected = i < 15;
  if (isCleanExpected && r.score > 0) {
    console.error(`[FAIL] Test #${i + 1} Expected 0% Clean but got ${r.score}% (${r.reason}) for ${t.in.company} vs ${t.ex.company}`);
    failed++;
  } else if (!isCleanExpected && r.score === 0) {
    console.error(`[FAIL] Test #${i + 1} Expected Match but got 0% Clean for ${t.in.company} vs ${t.ex.company}`);
    failed++;
  } else {
    console.log(`[PASS] Test #${i + 1}: ${t.in.company} vs ${t.ex.company} => ${r.score}% | ${r.reason || '0% CLEAN'}`);
  }
});

if (failed === 0) {
  console.log(`\n>>> ALL ${allTests.length} SIMILARITY TESTS PASSED WITH 100% ACCURACY! <<<`);
} else {
  console.error(`\n>>> ${failed} TESTS FAILED! <<<`);
  process.exit(1);
}
