// Comprehensive Data Normalization and Fuzzy-Match Sanitizer for CRM

export const OFFICIAL_INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttarakhand',
  'Uttar Pradesh',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry'
];

// Expanded State Aliases, Abbreviations & Common Misspellings
const STATE_ALIAS_MAP = {
  // Uttarakhand
  'uk': 'Uttarakhand',
  'u.k.': 'Uttarakhand',
  'ua': 'Uttarakhand',
  'u.a.': 'Uttarakhand',
  'uttarakhand': 'Uttarakhand',
  'uttrakhand': 'Uttarakhand',
  'uttarkhand': 'Uttarakhand',
  'uttrakhnd': 'Uttarakhand',
  'uttaranchal': 'Uttarakhand',
  'uttra': 'Uttarakhand',
  'uttra khnd': 'Uttarakhand',
  'utrakhand': 'Uttarakhand',
  'uttranchal': 'Uttarakhand',

  // Uttar Pradesh
  'up': 'Uttar Pradesh',
  'u.p.': 'Uttar Pradesh',
  'u p': 'Uttar Pradesh',
  'uttar pradesh': 'Uttar Pradesh',
  'uttarpradesh': 'Uttar Pradesh',
  'uttra pradesh': 'Uttar Pradesh',
  'uttrapradesh': 'Uttar Pradesh',
  'uttar pardesh': 'Uttar Pradesh',
  'uttar pardes': 'Uttar Pradesh',
  'uttra pardesh': 'Uttar Pradesh',
  'u.p': 'Uttar Pradesh',

  // Maharashtra
  'mh': 'Maharashtra',
  'm.h.': 'Maharashtra',
  'm h': 'Maharashtra',
  'maharashtra': 'Maharashtra',
  'maharastra': 'Maharashtra',
  'maharstra': 'Maharashtra',
  'maha': 'Maharashtra',

  // Madhya Pradesh
  'mp': 'Madhya Pradesh',
  'm.p.': 'Madhya Pradesh',
  'm p': 'Madhya Pradesh',
  'madhya pradesh': 'Madhya Pradesh',
  'madhyapradesh': 'Madhya Pradesh',
  'madhya pardesh': 'Madhya Pradesh',
  'madhya pardes': 'Madhya Pradesh',
  'm.p': 'Madhya Pradesh',

  // Punjab
  'pb': 'Punjab',
  'p.b.': 'Punjab',
  'p b': 'Punjab',
  'punjab': 'Punjab',
  'panjab': 'Punjab',

  // Haryana
  'hr': 'Haryana',
  'h.r.': 'Haryana',
  'h r': 'Haryana',
  'haryana': 'Haryana',
  'haryna': 'Haryana',

  // Delhi
  'dl': 'Delhi',
  'd.l.': 'Delhi',
  'delhi': 'Delhi',
  'new delhi': 'Delhi',
  'newdelhi': 'Delhi',
  'ncr': 'Delhi',
  'delhi ncr': 'Delhi',

  // Rajasthan
  'rj': 'Rajasthan',
  'r.j.': 'Rajasthan',
  'rajasthan': 'Rajasthan',
  'rajsthan': 'Rajasthan',
  'rajasthn': 'Rajasthan',

  // Gujarat
  'gj': 'Gujarat',
  'g.j.': 'Gujarat',
  'gujarat': 'Gujarat',
  'gujrat': 'Gujarat',
  'gujrath': 'Gujarat',

  // West Bengal
  'wb': 'West Bengal',
  'w.b.': 'West Bengal',
  'west bengal': 'West Bengal',
  'westbengal': 'West Bengal',
  'bengal': 'West Bengal',
  'w bengal': 'West Bengal',

  // Bihar
  'br': 'Bihar',
  'b.r.': 'Bihar',
  'bihar': 'Bihar',

  // Jharkhand
  'jh': 'Jharkhand',
  'j.h.': 'Jharkhand',
  'jharkhand': 'Jharkhand',
  'jharkhnd': 'Jharkhand',

  // Chhattisgarh
  'cg': 'Chhattisgarh',
  'c.g.': 'Chhattisgarh',
  'chhattisgarh': 'Chhattisgarh',
  'chhatisgarh': 'Chhattisgarh',
  'chattisgarh': 'Chhattisgarh',
  'chhatishgarh': 'Chhattisgarh',

  // Himachal Pradesh
  'hp': 'Himachal Pradesh',
  'h.p.': 'Himachal Pradesh',
  'himachal pradesh': 'Himachal Pradesh',
  'himachal': 'Himachal Pradesh',
  'himachal pardesh': 'Himachal Pradesh',

  // Jammu & Kashmir
  'jk': 'Jammu and Kashmir',
  'j&k': 'Jammu and Kashmir',
  'j & k': 'Jammu and Kashmir',
  'j k': 'Jammu and Kashmir',
  'jammu and kashmir': 'Jammu and Kashmir',
  'jammu & kashmir': 'Jammu and Kashmir',
  'jammu kashmir': 'Jammu and Kashmir',
  'jammu': 'Jammu and Kashmir',
  'kashmir': 'Jammu and Kashmir',

  // Karnataka
  'ka': 'Karnataka',
  'k.a.': 'Karnataka',
  'karnataka': 'Karnataka',
  'karnatka': 'Karnataka',
  'karnatak': 'Karnataka',

  // Kerala
  'kl': 'Kerala',
  'k.l.': 'Kerala',
  'kerala': 'Kerala',
  'keralam': 'Kerala',

  // Tamil Nadu
  'tn': 'Tamil Nadu',
  't.n.': 'Tamil Nadu',
  'tamil nadu': 'Tamil Nadu',
  'tamilnadu': 'Tamil Nadu',
  'tamil nad': 'Tamil Nadu',

  // Telangana
  'ts': 'Telangana',
  't.s.': 'Telangana',
  'tg': 'Telangana',
  'telangana': 'Telangana',
  'telengana': 'Telangana',

  // Andhra Pradesh
  'ap': 'Andhra Pradesh',
  'a.p.': 'Andhra Pradesh',
  'andhra pradesh': 'Andhra Pradesh',
  'andhra': 'Andhra Pradesh',
  'andhra pardesh': 'Andhra Pradesh',

  // Odisha
  'od': 'Odisha',
  'orissa': 'Odisha',
  'odisha': 'Odisha',
  'odisa': 'Odisha',

  // Assam
  'as': 'Assam',
  'assam': 'Assam',

  // Goa
  'ga': 'Goa',
  'goa': 'Goa',

  // Chandigarh
  'ch': 'Chandigarh',
  'chandigarh': 'Chandigarh',

  // Tripura
  'tr': 'Tripura',
  'tripura': 'Tripura',

  // Meghalaya
  'ml': 'Meghalaya',
  'meghalaya': 'Meghalaya',

  // Manipur
  'mn': 'Manipur',
  'manipur': 'Manipur',

  // Nagaland
  'nl': 'Nagaland',
  'nagaland': 'Nagaland',

  // Mizoram
  'mz': 'Mizoram',
  'mizoram': 'Mizoram',

  // Sikkim
  'sk': 'Sikkim',
  'sikkim': 'Sikkim',

  // Arunachal Pradesh
  'ar': 'Arunachal Pradesh',
  'arunachal pradesh': 'Arunachal Pradesh',
  'arunachal': 'Arunachal Pradesh',

  // Ladakh
  'la': 'Ladakh',
  'ladakh': 'Ladakh',

  // Puducherry
  'py': 'Puducherry',
  'puducherry': 'Puducherry',
  'pondicherry': 'Puducherry',

  // Dadra & Nagar Haveli
  'dn': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman & diu': 'Dadra and Nagar Haveli and Daman and Diu',

  // Andaman & Nicobar
  'an': 'Andaman and Nicobar Islands',
  'andaman and nicobar': 'Andaman and Nicobar Islands',
  'andaman & nicobar': 'Andaman and Nicobar Islands',

  // Lakshadweep
  'ld': 'Lakshadweep',
  'lakshadweep': 'Lakshadweep'
};

// Calculate Levenshtein Distance between two strings
function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

// Calculate similarity ratio between 0 and 1
function stringSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(s1, s2);
  return 1.0 - dist / maxLen;
}

// Converts a string to Title Case ("south delhi" -> "South Delhi", "PUNJAB" -> "Punjab")
export function toTitleCase(str) {
  if (!str || typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (!trimmed) return '';
  
  return trimmed
    .toLowerCase()
    .split(/[\s_-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Extracts 4 to 6 digit numerical employee ID (e.g., "Nitya Verma - 50745" -> "50745")
export function extractEmpId(str) {
  if (!str) return null;
  const match = String(str).match(/\b(\d{4,6})\b/);
  return match ? match[1] : null;
}

/**
 * Normalizes an employee identifier to the official registered employee name from Team Management.
 */
export function normalizeEmployeeName(rawIdentifier, teamMembers = []) {
  if (!rawIdentifier || typeof rawIdentifier !== 'string') {
    return rawIdentifier || '';
  }

  const rawTrimmed = rawIdentifier.trim();
  if (!rawTrimmed || rawTrimmed.toLowerCase() === 'system' || rawTrimmed.toLowerCase() === 'agent') {
    return rawTrimmed;
  }

  if (!teamMembers || teamMembers.length === 0) {
    return rawTrimmed;
  }

  const idCode = extractEmpId(rawTrimmed);
  const rawLower = rawTrimmed.toLowerCase();

  // 1. Match by Employee Code (e.g. 50745)
  if (idCode) {
    const memberByCode = teamMembers.find(m => {
      const mCode = String(m.emp_id || m.emp_code || extractEmpId(m.emp_name) || extractEmpId(m.user_id) || '');
      return mCode === idCode;
    });
    if (memberByCode && memberByCode.emp_name) {
      return memberByCode.emp_name;
    }
  }

  // 2. Match by UUID (user_id / id)
  const memberByUuid = teamMembers.find(m => m.user_id === rawTrimmed || m.id === rawTrimmed);
  if (memberByUuid && memberByUuid.emp_name) {
    return memberByUuid.emp_name;
  }

  // 3. Match by exact Name or Email
  const memberByNameOrEmail = teamMembers.find(m => {
    const mName = String(m.emp_name || '').toLowerCase();
    const mEmail = String(m.email || '').toLowerCase();
    const mPrefix = mEmail.split('@')[0];
    return mName === rawLower || mEmail === rawLower || (mPrefix && mPrefix === rawLower);
  });
  if (memberByNameOrEmail && memberByNameOrEmail.emp_name) {
    return memberByNameOrEmail.emp_name;
  }

  return rawTrimmed;
}

/**
 * Standardizes a State name to official Indian state name with fuzzy matching & alias resolution.
 * Examples:
 * - "Uttra", "Uttrakhand", "uttarakhand", "uk" -> "Uttarakhand"
 * - "Uttra Pradesh", "up", "uttar pardesh" -> "Uttar Pradesh"
 * - "Maharastra", "mh", "maharashtra" -> "Maharashtra"
 * - "Chhatisgarh", "cg" -> "Chhattisgarh"
 * - "Telengana", "ts" -> "Telangana"
 */
export function normalizeStateName(rawState) {
  if (!rawState || typeof rawState !== 'string') return '';
  const trimmed = rawState.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Direct match in expanded Alias Map
  if (STATE_ALIAS_MAP[lower]) {
    return STATE_ALIAS_MAP[lower];
  }

  // 2. Direct match without spaces (e.g. "uttarpradesh", "westbengal")
  const noSpace = lower.replace(/\s+/g, '');
  if (STATE_ALIAS_MAP[noSpace]) {
    return STATE_ALIAS_MAP[noSpace];
  }

  // 3. Exact match against official states list (case-insensitive)
  const officialExact = OFFICIAL_INDIAN_STATES.find(s => s.toLowerCase() === lower);
  if (officialExact) {
    return officialExact;
  }

  // 4. Fuzzy Levenshtein Match against official states
  let bestMatch = null;
  let highestSimilarity = 0;

  for (const officialState of OFFICIAL_INDIAN_STATES) {
    const sim = stringSimilarity(lower, officialState.toLowerCase());
    if (sim > highestSimilarity) {
      highestSimilarity = sim;
      bestMatch = officialState;
    }
  }

  // If similarity is 70% or higher, snap to the official state
  if (highestSimilarity >= 0.70 && bestMatch) {
    return bestMatch;
  }

  return toTitleCase(trimmed);
}

/**
 * Standardizes a District name to clean Title Case.
 */
export function normalizeDistrictName(rawDistrict) {
  if (!rawDistrict || typeof rawDistrict !== 'string') return '';
  const trimmed = rawDistrict.trim();
  if (!trimmed) return '';

  return toTitleCase(trimmed);
}

/**
 * Standardizes City, Tehsil, or Block names to Title Case.
 */
export function normalizeCityName(rawCity) {
  if (!rawCity || typeof rawCity !== 'string') return '';
  const trimmed = rawCity.trim();
  if (!trimmed) return '';

  return toTitleCase(trimmed);
}

/**
 * Applies complete data standardization across all employee and location fields of a lead object.
 */
export function normalizeLeadRecord(lead, teamMembers = []) {
  if (!lead || typeof lead !== 'object') return lead;

  const normalized = { ...lead };

  if (normalized.state_name || normalized.state || normalized.business_state) {
    const cleanState = normalizeStateName(normalized.state_name || normalized.state || normalized.business_state);
    normalized.state_name = cleanState;
    if (normalized.state) normalized.state = cleanState;
    if (normalized.business_state) normalized.business_state = cleanState;
  }

  if (normalized.district_name || normalized.district || normalized.business_district) {
    const cleanDist = normalizeDistrictName(normalized.district_name || normalized.district || normalized.business_district);
    normalized.district_name = cleanDist;
    if (normalized.district) normalized.district = cleanDist;
    if (normalized.business_district) normalized.business_district = cleanDist;
  }

  if (normalized.city_name || normalized.city || normalized.business_city) {
    const cleanCity = normalizeCityName(normalized.city_name || normalized.city || normalized.business_city);
    normalized.city_name = cleanCity;
    if (normalized.city) normalized.city = cleanCity;
    if (normalized.business_city) normalized.business_city = cleanCity;
  }

  if (normalized.tehsil_name || normalized.tehsil) {
    const cleanTehsil = normalizeCityName(normalized.tehsil_name || normalized.tehsil);
    normalized.tehsil_name = cleanTehsil;
    if (normalized.tehsil) normalized.tehsil = cleanTehsil;
  }

  if (normalized.block_name || normalized.block) {
    const cleanBlock = normalizeCityName(normalized.block_name || normalized.block);
    normalized.block_name = cleanBlock;
    if (normalized.block) normalized.block = cleanBlock;
  }

  if (normalized.entry_by) normalized.entry_by = normalizeEmployeeName(normalized.entry_by, teamMembers);
  if (normalized.created_by) normalized.created_by = normalizeEmployeeName(normalized.created_by, teamMembers);

  return normalized;
}
