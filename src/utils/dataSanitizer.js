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
export function stringSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(s1, s2);
  return 1.0 - dist / maxLen;
}

// Common Business and Legal Prefixes, Titles & Honorifics (e.g. M/s, Shree, New, etc.)
const BUSINESS_PREFIX_REGEX = /^(shri|sri|shree|sree|mr|mrs|miss|dr|er|the|new|old|late|pandit|sardar|thakur|chaudhary|choudhary|babu|seth|lala|maa|mata|baba|om|jai|sai|sant|swami|bhagwan|punjab|haryana|rajasthan|delhi|bihar|gujarat|maharashtra|bengal|karnataka|kerala|tamil|india|national|all\s+india|hindustan|bharat)\b/gi;

// Common Corporate Entity, Trade Designations & Industry Suffixes
const BUSINESS_SUFFIX_REGEX = /\b(pvt|private|ltd|limited|llp|llc|inc|corp|corporation|co|company|group|enterprises|enterprise|traders|trader|trading|treders|agencies|agency|store|stores|motors|motor|automobiles|automobile|automotives|automotive|auto|service|services|tractors|tractor|trailers|trailer|engineering|engineers|engineer|works|industries|industry|solutions|distributors|distributor|sales|supply|supplies|point|hub|center|centre|house|bhandar|ghar|kendra|depot|agro|agri|agriculture|implements|harvester|machinery|farm|farming)\b/gi;

/**
 * Strips universal legal entity types, trade suffixes, honorifics and punctuation for clean business name normalization.
 * Operates purely tenant-agnostic across Fashion, Auto, Pharma, Hardware, Agriculture, etc.
 */
export function cleanCorporateName(name) {
  if (!name || typeof name !== 'string') return '';
  let s = name.toLowerCase().trim();

  // 1. Remove M/s variations before punctuation stripping so / and . do not turn into separate letters
  s = s.replace(/\bm[\/.]?\s*s[\/.]?\b/gi, ' ');

  // 2. Remove leading prefixes, honorifics, and geographic qualifiers repeatedly
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(BUSINESS_PREFIX_REGEX, ' ').trim();
  }

  // 3. Remove non-alphanumeric punctuation
  s = s.replace(/[^\w\s]/g, ' ');

  // 4. Remove common trade entity suffixes
  s = s.replace(BUSINESS_SUFFIX_REGEX, ' ');

  const cleaned = s.replace(/\s+/g, ' ').trim();
  if (cleaned.length > 0) return cleaned;

  // Fallback to punctuation-stripped original name if all words were common entity terms
  return name.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Calculates a comprehensive similarity match score (0 to 100) between an incoming row and an existing database lead.
 * Compares Primary Business Name Tokens so that unrelated businesses that share generic trade suffixes (like "Enterprises", "Traders", "Store")
 * or generic prefixes (like "M/S", "New") are NOT falsely flagged as duplicates.
 */
export function calculateLeadSimilarityScore(incoming, existing) {
  if (!incoming || !existing) return { score: 0, reason: '', matchedField: '' };

  // 1. Business Name comparison
  const rawInComp = String(incoming.company || incoming.business_name || '').trim();
  const rawExComp = String(existing.company || existing.business_name || '').trim();
  const cleanInComp = cleanCorporateName(rawInComp);
  const cleanExComp = cleanCorporateName(rawExComp);

  if (!cleanInComp || !cleanExComp) return { score: 0, reason: '', matchedField: '' };

  const inTokens = cleanInComp.split(' ').filter(Boolean);
  const exTokens = cleanExComp.split(' ').filter(Boolean);

  // Exact core name match after corporate & prefix cleaning
  const isExactCleanName = cleanInComp === cleanExComp;
  const rawCleanIn = rawInComp.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const rawCleanEx = rawExComp.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const isExactRawName = rawCleanIn === rawCleanEx;

  // Primary brand token (leading distinctive word) comparison
  const brand1 = inTokens[0] || '';
  const brand2 = exTokens[0] || '';
  const brand1Sim = stringSimilarity(brand1, brand2);

  // Two-word brand prefix comparison (e.g. "Guru Arjun", "New Swan")
  const brand2Tokens1 = inTokens.slice(0, 2).join(' ');
  const brand2Tokens2 = exTokens.slice(0, 2).join(' ');
  const brand2Sim = (inTokens.length >= 2 && exTokens.length >= 2) ? stringSimilarity(brand2Tokens1, brand2Tokens2) : 0;

  // Whole-word subset check (prevents substring bugs like "farm machinery" matching "m m" or "ghanshyam" matching "shyam")
  const isWholeWordSubset = (tokensShort, tokensLong) => {
    if (tokensShort.length === 0 || tokensLong.length === 0) return false;
    const hasDistinctiveToken = tokensShort.some(t => t.length >= 4);
    if (!hasDistinctiveToken) return false;
    return tokensShort.every(t => tokensLong.includes(t));
  };

  const isSubset = isWholeWordSubset(inTokens, exTokens) || isWholeWordSubset(exTokens, inTokens);
  const fullSim = stringSimilarity(cleanInComp, cleanExComp);

  const primaryBrandSim = isExactCleanName ? 1.0 : (isSubset ? Math.max(0.90, brand1Sim) : Math.max(brand1Sim, brand2Sim, fullSim));

  // 2. Location comparison (State, District, City)
  let locScore = 0;
  const inState = String(incoming.state_name || incoming.state || '').trim().toLowerCase();
  const exState = String(existing.state_name || existing.state || '').trim().toLowerCase();
  const inDist = String(incoming.district_name || incoming.district || '').trim().toLowerCase();
  const exDist = String(existing.district_name || existing.district || '').trim().toLowerCase();
  const inCity = String(incoming.city_name || incoming.city || '').trim().toLowerCase();
  const exCity = String(existing.city_name || existing.city || '').trim().toLowerCase();

  const stateMatches = inState && exState && inState === exState;
  const distMatches = inDist && exDist && inDist === exDist;
  const cityMatches = inCity && exCity && inCity === exCity;

  if (stateMatches && distMatches && cityMatches) locScore = 1.0;
  else if (stateMatches && distMatches) locScore = 0.85;
  else if (distMatches) locScore = 0.70;
  else if (stateMatches) locScore = 0.35;

  // 3. Contact Person Name comparison
  let personScore = 0;
  const inName = String(incoming.name || incoming.cp1_name || '').trim().toLowerCase();
  const exName = String(existing.name || existing.cp1_name || '').trim().toLowerCase();
  if (inName && exName) {
    if (inName === exName) personScore = 1.0;
    else personScore = stringSimilarity(inName, exName);
  }

  // CORE TENANT-AGNOSTIC GUARD:
  // If the primary business name does not match (< 0.75) and full name is not exact or subset,
  // do NOT match just because of a shared suffix or same district!
  if (!isExactCleanName && !isExactRawName && primaryBrandSim < 0.75 && !isSubset) {
    // Only exception: Owner contact person matches strongly (>= 85%) in same location
    if (personScore >= 0.85 && locScore >= 0.70) {
      const total = Math.round((personScore * 0.50 + locScore * 0.40) * 100);
      return {
        score: Math.min(95, total),
        compScore: Math.round(primaryBrandSim * 100),
        locScore: Math.round(locScore * 100),
        personScore: Math.round(personScore * 100),
        reason: `Contact Person ${Math.round(personScore * 100)}% match in same location`
      };
    }
    return { score: 0, reason: '', compScore: 0, locScore: 0, personScore: 0 };
  }

  // LOCATION-AWARE GUARD:
  // If neither district NOR state matches, never match random businesses across different states
  // simply because they share a single generic word!
  if (!distMatches && !stateMatches) {
    // Only flag across different states if it is a multi-word exact business name (e.g. 2+ words)
    if ((isExactCleanName || isExactRawName) && inTokens.length >= 2) {
      return {
        score: 50,
        compScore: 100,
        locScore: 0,
        personScore: Math.round(personScore * 100),
        reason: `Exact Business Name in Different State (${cleanInComp.toUpperCase()})`
      };
    }
    // Or if contact person also matches strongly
    if (personScore >= 0.85 && primaryBrandSim >= 0.80) {
      return {
        score: 65,
        compScore: Math.round(primaryBrandSim * 100),
        locScore: 0,
        personScore: Math.round(personScore * 100),
        reason: `Business Name with Matching Contact Person (${Math.round(personScore * 100)}%)`
      };
    }
    return { score: 0, reason: '', compScore: 0, locScore: 0, personScore: 0 };
  }

  // Calculate Weighted Score for Valid Matches
  let totalScore = 0;
  let reasons = [];

  if (isExactCleanName || isExactRawName) {
    if (distMatches) {
      totalScore = 0.95;
      reasons.push(`Exact Business Name in Same District (${incoming.district_name || incoming.district})`);
    } else if (stateMatches) {
      totalScore = 0.88;
      reasons.push(`Exact Business Name in Same State (${incoming.state_name || incoming.state})`);
    }
    if (personScore >= 0.75) {
      totalScore = Math.min(0.99, totalScore + 0.05);
      reasons.push(`Contact Person match (${Math.round(personScore * 100)}%)`);
    }
  } else if (primaryBrandSim >= 0.75 || isSubset) {
    const dispSim = Math.round(Math.max(primaryBrandSim, fullSim) * 100);
    if (distMatches) {
      totalScore = 0.90;
      reasons.push(`Business Name ${dispSim}% match in Same District (${incoming.district_name || incoming.district})`);
    } else if (stateMatches) {
      totalScore = 0.82;
      reasons.push(`Business Name ${dispSim}% match in Same State (${incoming.state_name || incoming.state})`);
    }
    if (personScore >= 0.75) {
      totalScore = Math.min(0.99, totalScore + 0.05);
      reasons.push(`Contact Person match (${Math.round(personScore * 100)}%)`);
    }
  }

  const finalScorePercent = Math.min(99, Math.round(totalScore * 100));
  return {
    score: finalScorePercent,
    compScore: Math.round(primaryBrandSim * 100),
    locScore: Math.round(locScore * 100),
    personScore: Math.round(personScore * 100),
    reason: reasons.join(' • '),
    primaryReason: reasons[0] || '',
    locationReason: distMatches ? (incoming.district_name || incoming.district || '') : (stateMatches ? (incoming.state_name || incoming.state || '') : '')
  };
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

// Caching maps to prevent repetitive computation (e.g. Levenshtein distance on 5,000+ items)
const stateCache = new Map();
const employeeNameCache = new Map();

/**
 * Standardizes a phone number to its last 10 digits for accurate duplicate checking.
 * Handles +91, 0 prefix, spaces, dashes, parentheses, etc.
 */
export function normalizePhoneTo10(phoneStr) {
  if (!phoneStr) return '';
  const digits = String(phoneStr).replace(/\D/g, '');
  if (!digits) return '';
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Resolves an employee identifier (Name, Email, Employee Code, or UUID)
 * to their official Supabase user_id / id. Returns null if unassigned or not found.
 */
export function resolveTeamMemberId(rawVal, teamMembers = []) {
  if (!rawVal || typeof rawVal !== 'string') return null;
  const trimmed = rawVal.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unassigned' || trimmed.toLowerCase() === 'open lead' || trimmed.toLowerCase() === 'none' || trimmed === '-') {
    return null;
  }

  if (!teamMembers || teamMembers.length === 0) {
    // If it's already a valid UUID format, return it directly
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return trimmed;
    }
    return null;
  }

  // 1. Direct match by UUID / ID
  const byUuid = teamMembers.find(m => m.user_id === trimmed || m.id === trimmed);
  if (byUuid) return byUuid.user_id || byUuid.id;

  // 2. Direct match by Email (case-insensitive)
  const rawLower = trimmed.toLowerCase();
  const byEmail = teamMembers.find(m => m.email && m.email.toLowerCase() === rawLower);
  if (byEmail) return byEmail.user_id || byEmail.id;

  // 3. Match by Employee Code (e.g. 50745)
  const idCode = extractEmpId(trimmed);
  if (idCode) {
    const byCode = teamMembers.find(m => {
      const mCode = String(m.emp_id || m.emp_code || extractEmpId(m.emp_name) || extractEmpId(m.user_id) || '');
      return mCode === idCode;
    });
    if (byCode) return byCode.user_id || byCode.id;
  }

  // 4. Match by Employee Name (case-insensitive)
  const byName = teamMembers.find(m => {
    const mName = String(m.emp_name || '').toLowerCase();
    const mPrefix = String(m.email || '').toLowerCase().split('@')[0];
    return mName === rawLower || (mPrefix && mPrefix === rawLower);
  });
  if (byName) return byName.user_id || byName.id;

  // 5. Fallback: if already a valid UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }

  return null;
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

  const cacheKey = `${rawTrimmed}__${teamMembers.length}`;
  if (employeeNameCache.has(cacheKey)) {
    return employeeNameCache.get(cacheKey);
  }

  const idCode = extractEmpId(rawTrimmed);
  const rawLower = rawTrimmed.toLowerCase();

  let resolved = rawTrimmed;

  // 1. Match by Employee Code (e.g. 50745)
  if (idCode) {
    const memberByCode = teamMembers.find(m => {
      const mCode = String(m.emp_id || m.emp_code || extractEmpId(m.emp_name) || extractEmpId(m.user_id) || '');
      return mCode === idCode;
    });
    if (memberByCode && memberByCode.emp_name) {
      resolved = memberByCode.emp_name;
      employeeNameCache.set(cacheKey, resolved);
      return resolved;
    }
  }

  // 2. Match by UUID (user_id / id)
  const memberByUuid = teamMembers.find(m => m.user_id === rawTrimmed || m.id === rawTrimmed);
  if (memberByUuid && memberByUuid.emp_name) {
    resolved = memberByUuid.emp_name;
    employeeNameCache.set(cacheKey, resolved);
    return resolved;
  }

  // 3. Match by exact Name or Email
  const memberByNameOrEmail = teamMembers.find(m => {
    const mName = String(m.emp_name || '').toLowerCase();
    const mEmail = String(m.email || '').toLowerCase();
    const mPrefix = mEmail.split('@')[0];
    return mName === rawLower || mEmail === rawLower || (mPrefix && mPrefix === rawLower);
  });
  if (memberByNameOrEmail && memberByNameOrEmail.emp_name) {
    resolved = memberByNameOrEmail.emp_name;
    employeeNameCache.set(cacheKey, resolved);
    return resolved;
  }

  employeeNameCache.set(cacheKey, resolved);
  return resolved;
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

  if (stateCache.has(trimmed)) {
    return stateCache.get(trimmed);
  }

  const lower = trimmed.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Direct match in expanded Alias Map
  if (STATE_ALIAS_MAP[lower]) {
    const res = STATE_ALIAS_MAP[lower];
    stateCache.set(trimmed, res);
    return res;
  }

  // 2. Direct match without spaces (e.g. "uttarpradesh", "westbengal")
  const noSpace = lower.replace(/\s+/g, '');
  if (STATE_ALIAS_MAP[noSpace]) {
    const res = STATE_ALIAS_MAP[noSpace];
    stateCache.set(trimmed, res);
    return res;
  }

  // 3. Exact match against official states list (case-insensitive)
  const officialExact = OFFICIAL_INDIAN_STATES.find(s => s.toLowerCase() === lower);
  if (officialExact) {
    stateCache.set(trimmed, officialExact);
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
    stateCache.set(trimmed, bestMatch);
    return bestMatch;
  }

  const res = toTitleCase(trimmed);
  stateCache.set(trimmed, res);
  return res;
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
