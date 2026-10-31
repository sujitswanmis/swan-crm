import { cleanCorporateName, calculateLeadSimilarityScore } from '../src/utils/dataSanitizer.js';

const allTests = [
  // False matches from screenshots -> Must be 0% Clean
  { in: { company: 'M/S GURU ARJUN DEV TRACTORS', state: 'Punjab', district: 'Ludhiana' }, ex: { company: 'M/S SHUBHAM MOTOR STORE,', state: 'Punjab', district: 'Jalandhar' } },
  { in: { company: 'M/S GREEN MOTOR SERVICE', state: 'Punjab', district: 'Amritsar' }, ex: { company: 'M/S SHUBHAM MOTOR STORE,', state: 'Punjab', district: 'Jalandhar' } },
  { in: { company: 'M/S D.S TRACTORS', state: 'Punjab', district: 'Bathinda' }, ex: { company: 'M/S SHUBHAM MOTOR STORE,', state: 'Punjab', district: 'Jalandhar' } },
  { in: { company: 'VSB ENTERPRISES', state: 'Punjab', district: 'Bathinda' }, ex: { company: 'DTC Enterprise', state: 'Punjab', district: 'Bathinda' } },
  { in: { company: 'NEW DASHMESH TRACTORS', state: 'Punjab', district: 'Amritsar' }, ex: { company: 'new khalsa agro treders', state: 'Punjab', district: 'Amritsar' } },
  { in: { company: 'KRISHAK BANDHU AGENCIES', state: 'UP', district: 'Varanasi' }, ex: { company: 'KRISHAK GHAR', state: 'Bihar', district: 'Patna' } },
  { in: { company: 'PANDIT PALTOORAM MOTORS', state: 'MP', district: 'Bhopal' }, ex: { company: 'pandit ji agro Traders', state: 'UP', district: 'Lucknow' } },
  { in: { company: 'PUNJAB CRDI POINT', state: 'Punjab', district: 'Ludhiana' }, ex: { company: 'PUNJAB AGRICULTURE STORE', state: 'Punjab', district: 'Bathinda' } },
  { in: { company: 'PERFECT AUTOMOBILES', state: 'Punjab', district: 'Ludhiana' }, ex: { company: 'PERFECT TRADERS', state: 'Maharashtra', district: 'Pune' } },

  // Genuine matches from screenshots -> Must be properly detected
  { in: { company: 'VAISHNAV MOTORS', state: 'Chhattisgarh', district: 'Bastar' }, ex: { company: 'Viashnav Motors', state: 'Chhattisgarh', district: 'Bastar' } },
  { in: { company: 'MARUTI MOTORS', state: 'Madhya Pradesh', district: 'Raisen' }, ex: { company: 'maruti motors', state: 'Madhya Pradesh', district: 'Raisen' } },
  { in: { company: 'SANWARIYA TRACTORS', state: 'Madhya Pradesh', district: 'Indore' }, ex: { company: 'SANWARIYA TRACTORS', state: 'Madhya Pradesh', district: 'Bhopal' } },
  { in: { company: 'M/S BARNALA TRACTORS', state: 'Punjab', district: 'Barnala' }, ex: { company: 'M/S Barnala Tractors (Swaraj)', state: 'Punjab', district: 'Barnala' } },
  { in: { company: 'SHIV AUTOMOBILE', state: 'Bihar', district: 'Purnia' }, ex: { company: 'Shiv Automobiles (Kubota)', state: 'Bihar', district: 'Purnia' } },
  { in: { company: 'SRI HANUMAN AUTOMOBILES', state: 'Uttar Pradesh', district: 'Varanasi' }, ex: { company: 'Hanuman', state: 'Uttar Pradesh', district: 'Lucknow' } }
];

let failed = 0;
allTests.forEach((t, i) => {
  const r = calculateLeadSimilarityScore(t.in, t.ex);
  const isCleanExpected = i < 9;
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
  console.log('\n>>> ALL 15 SIMILARITY TESTS PASSED WITH 100% ACCURACY! <<<');
} else {
  console.error(`\n>>> ${failed} TESTS FAILED! <<<`);
  process.exit(1);
}
