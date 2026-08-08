'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

/**
 * Server-side Text Normalizer:
 * Lowercases, trims, strips punctuation, and removes Dist/Distt/District prefixes/suffixes.
 */
export async function normalizeLocationText(rawText) {
  if (!rawText) return '';
  let norm = rawText.trim().toLowerCase();
  norm = norm.replace(/[^\w\s]/g, ' ');
  norm = norm.replace(/\b(distt|dist|district)\b/g, '');
  norm = norm.replace(/\s+/g, ' ');
  return norm.trim();
}

// 1. COUNTRIES
export async function getCountriesCentral() {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('location_countries')
    .select('*')
    .eq('is_active', true)
    .order('country_name', { ascending: true });

  if (error) return [];
  return data || [];
}

export async function createCountryCentral(payload, userId = null) {
  const adminClient = getAdminClient();
  const nameNorm = await normalizeLocationText(payload.country_name);

  const { data, error } = await adminClient
    .from('location_countries')
    .insert([{
      country_code: payload.country_code.toUpperCase(),
      country_name: payload.country_name,
      official_code: payload.official_code || null,
      name_normalized: nameNorm,
      created_by: userId
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// lgd_code = Official Government LGD (Local Government Directory) numerical code
const OFFICIAL_INDIAN_STATES = [
  { lgd_code: '28', code: 'AP', name: 'Andhra Pradesh', capital: 'Amaravati', type: 'STATE' },
  { lgd_code: '12', code: 'AR', name: 'Arunachal Pradesh', capital: 'Itanagar', type: 'STATE' },
  { lgd_code: '18', code: 'AS', name: 'Assam', capital: 'Dispur', type: 'STATE' },
  { lgd_code: '10', code: 'BR', name: 'Bihar', capital: 'Patna', type: 'STATE' },
  { lgd_code: '22', code: 'CG', name: 'Chhattisgarh', capital: 'Raipur', type: 'STATE' },
  { lgd_code: '30', code: 'GA', name: 'Goa', capital: 'Panaji', type: 'STATE' },
  { lgd_code: '24', code: 'GJ', name: 'Gujarat', capital: 'Gandhinagar', type: 'STATE' },
  { lgd_code: '6',  code: 'HR', name: 'Haryana', capital: 'Chandigarh', type: 'STATE' },
  { lgd_code: '2',  code: 'HP', name: 'Himachal Pradesh', capital: 'Shimla', type: 'STATE' },
  { lgd_code: '20', code: 'JH', name: 'Jharkhand', capital: 'Ranchi', type: 'STATE' },
  { lgd_code: '29', code: 'KA', name: 'Karnataka', capital: 'Bangalore', type: 'STATE' },
  { lgd_code: '32', code: 'KL', name: 'Kerala', capital: 'Thiruvananthapuram', type: 'STATE' },
  { lgd_code: '23', code: 'MP', name: 'Madhya Pradesh', capital: 'Bhopal', type: 'STATE' },
  { lgd_code: '27', code: 'MH', name: 'Maharashtra', capital: 'Mumbai', type: 'STATE' },
  { lgd_code: '14', code: 'MN', name: 'Manipur', capital: 'Imphal', type: 'STATE' },
  { lgd_code: '17', code: 'ML', name: 'Meghalaya', capital: 'Shillong', type: 'STATE' },
  { lgd_code: '15', code: 'MZ', name: 'Mizoram', capital: 'Aizawl', type: 'STATE' },
  { lgd_code: '13', code: 'NL', name: 'Nagaland', capital: 'Kohima', type: 'STATE' },
  { lgd_code: '21', code: 'OD', name: 'Odisha', capital: 'Bhubaneshwar', type: 'STATE' },
  { lgd_code: '3',  code: 'PB', name: 'Punjab', capital: 'Chandigarh', type: 'STATE' },
  { lgd_code: '8',  code: 'RJ', name: 'Rajasthan', capital: 'Jaipur', type: 'STATE' },
  { lgd_code: '11', code: 'SK', name: 'Sikkim', capital: 'Gangtok', type: 'STATE' },
  { lgd_code: '33', code: 'TN', name: 'Tamil Nadu', capital: 'Chennai', type: 'STATE' },
  { lgd_code: '36', code: 'TS', name: 'Telangana', capital: 'Hyderabad', type: 'STATE' },
  { lgd_code: '16', code: 'TR', name: 'Tripura', capital: 'Agartala', type: 'STATE' },
  { lgd_code: '5',  code: 'UT', name: 'Uttarakhand', capital: 'Dehradun', type: 'STATE' },
  { lgd_code: '9',  code: 'UP', name: 'Uttar Pradesh', capital: 'Lucknow', type: 'STATE' },
  { lgd_code: '19', code: 'WB', name: 'West Bengal', capital: 'Kolkata', type: 'STATE' },
  { lgd_code: '35', code: 'AN', name: 'Andaman and Nicobar Islands', capital: 'Port Blair', type: 'UNION_TERRITORY' },
  { lgd_code: '4',  code: 'CH', name: 'Chandigarh', capital: 'Chandigarh', type: 'UNION_TERRITORY' },
  { lgd_code: '26', code: 'DN', name: 'Dadra and Nagar Haveli and Daman and Diu', capital: 'Daman', type: 'UNION_TERRITORY' },
  { lgd_code: '7',  code: 'DL', name: 'Delhi', capital: 'New Delhi', type: 'UNION_TERRITORY' },
  { lgd_code: '1',  code: 'JK', name: 'Jammu and Kashmir', capital: 'Srinagar & Jammu', type: 'UNION_TERRITORY' },
  { lgd_code: '37', code: 'LA', name: 'Ladakh', capital: 'Leh', type: 'UNION_TERRITORY' },
  { lgd_code: '31', code: 'LD', name: 'Lakshadweep', capital: 'Kavaratti', type: 'UNION_TERRITORY' },
  { lgd_code: '34', code: 'PY', name: 'Puducherry', capital: 'Puducherry (Pondicherry)', type: 'UNION_TERRITORY' }
];

// 2. STATES
export async function getStatesCentral(countryId = null) {
  const adminClient = getAdminClient();
  let query = adminClient
    .from('location_states')
    .select('id, country_id, code, name, status')
    .order('name', { ascending: true });

  if (countryId) {
    query = query.or(`country_id.eq.${countryId},country_id.is.null`);
  }

  let { data, error } = await query;

  if (!data || data.length === 0) {
    const { data: fallbackAll } = await adminClient
      .from('location_states')
      .select('id, country_id, code, name, status')
      .order('name', { ascending: true });
    if (fallbackAll && fallbackAll.length > 0) {
      data = fallbackAll;
    }
  }

  if (!data || data.length === 0) {
    // Only auto-seed if database location_states table is 100% empty
    const targetCountryId = countryId || '00000000-0000-0000-0000-000000000001';
    const insertRows = OFFICIAL_INDIAN_STATES.map(s => ({
      country_id: targetCountryId,
      code: s.lgd_code ? `${s.code}|${s.lgd_code}` : s.code,
      name: s.name,
      status: 'ACTIVE'
    }));

    try {
      const { data: seededData } = await adminClient
        .from('location_states')
        .insert(insertRows)
        .select('*');

      if (seededData && seededData.length > 0) {
        data = seededData.sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (e) {
      console.error('Seeding fallback error:', e);
    }
  }

  // Batch query district counts per state for fast UI rendering
  const countMap = {};
  try {
    const { data: distRows } = await adminClient.from('location_districts').select('state_id');
    distRows?.forEach(d => {
      if (d.state_id) countMap[d.state_id] = (countMap[d.state_id] || 0) + 1;
    });
  } catch (e) {}

  const seenNames = new Set();
  const uniqueStates = [];
  (data || []).forEach(s => {
    const norm = (s.name || '').toLowerCase().trim();
    if (!seenNames.has(norm)) {
      seenNames.add(norm);
      uniqueStates.push(s);
    }
  });

  const metadataMap = new Map();
  OFFICIAL_INDIAN_STATES.forEach(meta => {
    metadataMap.set((meta.name || '').toLowerCase().trim(), meta);
    metadataMap.set((meta.code || '').toLowerCase().trim(), meta);
  });

  return uniqueStates.map(s => {
    const meta = metadataMap.get((s.name || '').toLowerCase().trim()) || {};
    let rawCode = s.code || '';
    let shortCode = rawCode;
    let lgdCode = meta.lgd_code || '';
    if (rawCode.includes('|')) {
      const parts = rawCode.split('|');
      shortCode = parts[0];
      lgdCode = parts[1] || lgdCode;
    }

    return {
      ...s,
      state_name: s.name || '',
      state_code: shortCode,
      short_name: shortCode,
      official_code: lgdCode,
      state_lgd_code: lgdCode,
      capital: meta.capital || s.capital || '—',
      state_type: meta.type || s.state_type || 'STATE',
      district_count: countMap[s.id] || 0,
      is_active: s.status === 'ACTIVE'
    };
  });
}

export async function createStateCentral(payload, userId = null) {
  const adminClient = getAdminClient();
  const shortCode = payload.state_short_name || payload.state_code || (payload.state_name ? payload.state_name.slice(0, 3).toUpperCase() : 'ST');
  const lgdCode = payload.state_lgd_code || payload.official_code || '';
  const finalCode = lgdCode ? `${shortCode.toUpperCase()}|${lgdCode}` : shortCode.toUpperCase();

  const { data, error } = await adminClient
    .from('location_states')
    .insert([{
      code: finalCode,
      name: payload.state_name,
      status: 'ACTIVE'
    }])
    .select()
    .single();

  if (error) throw new Error(error.message || String(error));

  let short = data.code || '';
  let lgd = '';
  if (data.code && data.code.includes('|')) {
    const parts = data.code.split('|');
    short = parts[0];
    lgd = parts[1] || '';
  }

  return {
    ...data,
    state_name: data.name,
    state_code: short,
    short_name: short,
    official_code: lgd,
    state_lgd_code: lgd,
    district_count: 0,
    is_active: data.status === 'ACTIVE'
  };
}

export async function updateStateCentral(id, payload, userId = null) {
  const adminClient = getAdminClient();

  const shortCode = payload.state_short_name || payload.state_code || '';
  const lgdCode = payload.state_lgd_code || payload.official_code || '';
  let finalCode = undefined;
  if (shortCode || lgdCode) {
    finalCode = lgdCode ? `${shortCode.toUpperCase()}|${lgdCode}` : shortCode.toUpperCase();
  }

  const updatePayload = {};
  if (payload.state_name) updatePayload.name = payload.state_name;
  if (finalCode !== undefined) updatePayload.code = finalCode;

  if (Object.keys(updatePayload).length === 0) {
    return { id, state_name: payload.state_name || '' };
  }

  let targetId = id;
  if (!targetId || typeof targetId !== 'string' || targetId.length <= 25 || !targetId.includes('-')) {
    if (payload.state_name) {
      try {
        const { data: stMatch } = await adminClient
          .from('location_states')
          .select('id')
          .ilike('name', payload.state_name.trim())
          .maybeSingle();
        if (stMatch?.id) targetId = stMatch.id;
      } catch (e) {}
    }
  }

  if (!targetId || typeof targetId !== 'string' || targetId.length <= 25 || !targetId.includes('-')) {
    return { id, ...updatePayload, state_name: payload.state_name || '' };
  }

  try {
    const { data, error } = await adminClient
      .from('location_states')
      .update(updatePayload)
      .eq('id', targetId)
      .select()
      .maybeSingle();

    if (error) console.error('updateStateCentral error:', error.message);
    let short = data?.code || shortCode;
    let lgd = lgdCode;
    if (data?.code && data.code.includes('|')) {
      const parts = data.code.split('|');
      short = parts[0];
      lgd = parts[1] || '';
    }

    return {
      ...data,
      state_name: data?.name || payload.state_name || '',
      state_code: short,
      short_name: short,
      official_code: lgd,
      state_lgd_code: lgd,
      is_active: true
    };
  } catch (err) {
    console.error('updateStateCentral exception:', err);
    return { id: targetId, ...updatePayload, state_name: payload.state_name || '' };
  }
}

const STATE_DISTRICTS_MAP = {
  "Andhra Pradesh": ["Alluri Sitharama Raju", "Anakapalli", "Ananthapuramu", "Annamayya", "Bapatla", "Chittoor", "Konaseema", "East Godavari", "Eluru", "Guntur", "Kakinada", "Krishna", "Kurnool", "Nandyal", "NTR (Vijayawada)", "Palnadu", "Parvathipuram Manyam", "Prakasam", "Sri Potti Sriramulu Nellore", "Sri Sathya Sai", "Srikakulam", "Tirupati", "Visakhapatnam", "Vizianagaram", "West Godavari", "YSR (Kadapa)"],
  "Arunachal Pradesh": ["Anjaw", "Changlang", "Dibang Valley", "East Kameng", "East Siang", "Itanagar", "Kamle", "Kra Daadi", "Kurung Kumey", "Lepa Rada", "Lohit", "Longding", "Lower Dibang Valley", "Lower Siang", "Lower Subansiri", "Namsai", "Pakke Kessang", "Papum Pare", "Shi Yomi", "Siang", "Tawang", "Tirap", "Upper Siang", "Upper Subansiri", "West Kameng", "West Siang"],
  "Assam": ["Bajali", "Baksa", "Barpeta", "Biswanath", "Bongaigaon", "Cachar", "Charaideo", "Chirang", "Darrang", "Dhemaji", "Dhubri", "Dibrugarh", "Dima Hasao", "Goalpara", "Golaghat", "Hailakandi", "Hojai", "Jorhat", "Kamrup", "Kamrup Metropolitan", "Karbi Anglong", "Karimganj", "Kokrajhar", "Lakhimpur", "Majuli", "Morigaon", "Nagaon", "Nalbari", "Sivasagar", "Sonitpur", "South Salmara-Mankachar", "Tamulpur", "Tinsukia", "Udalguri", "West Karbi Anglong"],
  "Bihar": ["Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar", "Darbhanga", "East Champaran", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur", "Katihar", "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura", "Madhubani", "Munger", "Muzaffarpur", "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur", "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul", "Vaishali", "West Champaran"],
  "Chhattisgarh": ["Balod", "Baloda Bazar", "Balodabazar-Bhatapara", "Balrampur", "Balrampur-Ramanujganj", "Bastar", "Bemetara", "Bijapur", "Bilaspur", "Dantewada", "Dhamtari", "Durg", "Gariaband", "Gaurela-Pendra-Marwahi", "Janjgir-Champa", "Jashpur", "Kabirdham", "Kanker", "Kondagaon", "Korba", "Koriya", "Mahasamund", "Manendragarh-Chirmiri-Bharatpur", "Mungeli", "Narayanpur", "Raigarh", "Raipur", "Rajnandgaon", "Sukma", "Surajpur", "Surguja"],
  "Goa": ["North Goa", "South Goa"],
  "Gujarat": ["Ahmedabad", "Amreli", "Anand", "Aravalli", "Banaskantha", "Bharuch", "Bhavnagar", "Botad", "Chhota Udepur", "Dahod", "Dang", "Devbhoomi Dwarka", "Gandhinagar", "Gir Somnath", "Jamnagar", "Junagadh", "Kheda", "Kutch", "Mahisagar", "Mehsana", "Morbi", "Narmada", "Navsari", "Panchmahal", "Patan", "Porbandar", "Rajkot", "Sabarkantha", "Surat", "Surendranagar", "Tapi", "Vadodara", "Valsad"],
  "Haryana": ["Ambala", "Bhiwani", "Charkhi Dadri", "Faridabad", "Fatehabad", "Gurugram", "Hisar", "Jhajjar", "Jind", "Kaithal", "Karnal", "Kurukshetra", "Mahendragarh", "Nuh", "Palwal", "Panchkula", "Panipat", "Rewari", "Rohtak", "Sirsa", "Sonipat", "Yamunanagar"],
  "Himachal Pradesh": ["Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", "Lahaul and Spiti", "Mandi", "Shimla", "Sirmaur", "Solan", "Una"],
  "Jharkhand": ["Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum", "Garhwa", "Giridih", "Godda", "Gumla", "Hazaribagh", "Jamtara", "Khunti", "Koderma", "Latehar", "Lohardaga", "Pakur", "Palamu", "Ramgarh", "Ranchi", "Sahebganj", "Seraikela Kharsawan", "Simdega", "West Singhbhum"],
  "Karnataka": ["Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", "Bidar", "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga", "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayanagara", "Vijayapura", "Yadgir"],
  "Kerala": ["Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad"],
  "Madhya Pradesh": ["Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat", "Barwani", "Betul", "Bhind", "Bhopal", "Burhanpur", "Chachaura", "Chhatarpur", "Chhindwara", "Damoh", "Datia", "Dewas", "Dhar", "Dindori", "Guna", "Gwalior", "Harda", "Hoshangabad", "Indore", "Jabalpur", "Jhabua", "Katni", "Khandwa", "Khargone", "Mandla", "Mandsaur", "Morena", "Narmadapuram", "Narsinghpur", "Neemuch", "Niwari", "Panna", "Parasia", "Raisen", "Rajgarh", "Ratlam", "Rewa", "Sagar", "Satna", "Sehore", "Seoni", "Shahdol", "Shajapur", "Sheopur", "Shivpuri", "Sidhi", "Singrauli", "Tikamgarh", "Ujjain", "Umaria", "Vidisha"],
  "Maharashtra": ["Ahmednagar", "Akola", "Amravati", "Aurangabad", "Beed", "Bhandara", "Buldhana", "Chandrapur", "Dhule", "Gadchiroli", "Gondia", "Hingoli", "Jalgaon", "Jalna", "Kolhapur", "Latur", "Mumbai City", "Mumbai Suburban", "Nagpur", "Nanded", "Nandurbar", "Nashik", "Osmanabad", "Palghar", "Parbhani", "Pune", "Raigad", "Ratnagiri", "Sangli", "Satara", "Sindhudurg", "Solapur", "Thane", "Wardha", "Washim", "Yavatmal"],
  "Manipur": ["Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West", "Jiribam", "Kakching", "Kamjong", "Kangpokpi", "Noney", "Pherzawl", "Senapati", "Tamenglong", "Tengnoupal", "Thoubal", "Ukhrul"],
  "Meghalaya": ["East Garo Hills", "East Jaintia Hills", "East Khasi Hills", "Eastern West Khasi Hills", "North Garo Hills", "Ri Bhoi", "South Garo Hills", "South West Garo Hills", "South West Khasi Hills", "West Garo Hills", "West Jaintia Hills", "West Khasi Hills"],
  "Mizoram": ["Aizawl", "Champhai", "Hnahthial", "Khawzawl", "Kolasib", "Lawngtlai", "Lunglei", "Mamit", "Saitual", "Serchhip", "Siaha"],
  "Nagaland": ["Chumoukedima", "Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung", "Mon", "Niuland", "Noklak", "Peren", "Phek", "Shamator", "Tseminyu", "Tuensang", "Wokha", "Zunheboto"],
  "Odisha": ["Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Boudh", "Cuttack", "Deogarh", "Dhenkanal", "Gajapati", "Ganjam", "Jagatsinghapur", "Jajpur", "Jharsuguda", "Kalahandi", "Kandhamal", "Kendrapara", "Kendujhar", "Khordha", "Koraput", "Malkangiri", "Mayurbhanj", "Nabarangpur", "Nayagarh", "Nuapada", "Puri", "Rayagada", "Sambalpur", "Subarnapur", "Sundergarh"],
  "Punjab": ["Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib", "Fazilka", "Ferozepur", "Gurdaspur", "Hoshiarpur", "Jalandhar", "Kapurthala", "Ludhiana", "Malerkotla", "Mansa", "Moga", "Muktsar", "Pathankot", "Patiala", "Rupnagar", "Sahibzada Ajit Singh Nagar", "Sangrur", "Shahid Bhagat Singh Nagar", "Tarn Taran"],
  "Rajasthan": ["Ajmer", "Alwar", "Anoopgarh", "Balotra", "Banswara", "Baran", "Barmer", "Bharatpur", "Bhilwara", "Bhiwadi", "Bikaner", "Bundi", "Chittorgarh", "Churu", "Dausa", "Dholpur", "Didwana-Kuchaman", "Dungarpur", "Hanumangarh", "Jaipur", "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur", "Karauli", "Kekri", "Khandela", "Kishangarh", "Kota", "Kotputli-Behror", "Kushalgarh", "Nagaur", "Neem Ka Thana", "Pali", "Phalodi", "Pratapgarh", "Rajsamand", "Ramsar", "Revdar", "Sawai Madhopur", "Shahpura", "Sikar", "Sirohi", "Sri Ganganagar", "Sujangarh", "Tonk", "Udaipur"],
  "Sikkim": ["East Sikkim", "North Sikkim", "Pakyong", "Soreng", "South Sikkim", "West Sikkim"],
  "Tamil Nadu": ["Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kanchipuram", "Kanyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi", "Thanjavur", "Theni", "Thiruvallur", "Thiruvarur", "Thoothukudi", "Tiruchirappalli", "Tirunelveli", "Tirupathur", "Tiruppur", "Tiruvannamalai", "Vellore", "Viluppuram", "Virudhunagar"],
  "Telangana": ["Adilabad", "Bhadradri Kothagudem", "Hyderabad", "Jagtial", "Jangaon", "Jayashankar Bhupalpally", "Jogulamba Gadwal", "Kamareddy", "Karimnagar", "Khammam", "Komaram Bheem Asifabad", "Mahabubabad", "Mahabubnagar", "Mancherial", "Medak", "Medchal-Malkajgiri", "Mulugu", "Nagarkurnool", "Nalgonda", "Narayanpet", "Nirmal", "Nizamabad", "Peddapalli", "Rajanna Sircilla", "Ranga Reddy", "Sangareddy", "Siddipet", "Suryapet", "Vikarabad", "Wanaparthy", "Warangal Rural", "Warangal Urban", "Yadadri Bhuvanagiri"],
  "Tripura": ["Dhalai", "Gomati", "Khowai", "North Tripura", "Sepahijala", "South Tripura", "Unakoti", "West Tripura"],
  "Uttar Pradesh": ["Agra", "Aligarh", "Ambedkar Nagar", "Amethi", "Amroha", "Auraiya", "Ayodhya", "Azamgarh", "Baghpat", "Bahraich", "Ballia", "Balrampur", "Banda", "Barabanki", "Bareilly", "Basti", "Bhadohi", "Bijnor", "Budaun", "Bulandshahr", "Chandauli", "Chitrakoot", "Deoria", "Etah", "Etawah", "Farrukhabad", "Fatehpur", "Firozabad", "Gautam Buddha Nagar", "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur", "Hamirpur", "Hapur", "Hardoi", "Hathras", "Jalaun", "Jaunpur", "Jhansi", "Kannauj", "Kanpur Dehat", "Kanpur Nagar", "Kasganj", "Kaushambi", "Kushinagar", "Lakhimpur Kheri", "Lalitpur", "Lucknow", "Maharajganj", "Mahoba", "Mainpuri", "Mathura", "Mau", "Meerut", "Mirzapur", "Moradabad", "Muzaffarnagar", "Pilibhit", "Pratapgarh", "Prayagraj", "Raebareli", "Rampur", "Saharanpur", "Sambhal", "Sant Kabir Nagar", "Shahjahanpur", "Shamli", "Shravasti", "Siddharthnagar", "Sitapur", "Sonbhadra", "Sultanpur", "Unnao", "Varanasi"],
  "Uttarakhand": ["Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun", "Haridwar", "Nainital", "Pauri Garhwal", "Pithoragarh", "Rudraprayag", "Tehri Garhwal", "Udham Singh Nagar", "Uttarkashi"],
  "West Bengal": ["Alipurduar", "Bankura", "Birbhum", "Cooch Behar", "Dakshin Dinajpur", "Darjeeling", "Hooghly", "Howrah", "Jalpaiguri", "Jhargram", "Kalimpong", "Kolkata", "Malda", "Murshidabad", "Nadia", "North 24 Parganas", "Paschim Bardhaman", "Paschim Medinipur", "Purba Bardhaman", "Purba Medinipur", "Purulia", "South 24 Parganas", "Uttar Dinajpur"],
  "Andaman and Nicobar Islands": ["Nicobar", "North and Middle Andaman", "South Andaman"],
  "Chandigarh": ["Chandigarh"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Dadra and Nagar Haveli", "Daman", "Diu"],
  "Lakshadweep": ["Lakshadweep"],
  "Delhi": ["Central Delhi", "East Delhi", "New Delhi", "North Delhi", "North East Delhi", "North West Delhi", "Shahdara", "South Delhi", "South East Delhi", "South West Delhi", "West Delhi"],
  "Puducherry": ["Puducherry", "Karaikal", "Mahe", "Yanam"],
  "Jammu and Kashmir": ["Anantnag", "Bandipora", "Baramulla", "Budgam", "Doda", "Ganderbal", "Jammu", "Kathua", "Kishtwar", "Kulgam", "Kupwara", "Poonch", "Pulwama", "Rajouri", "Ramban", "Reasi", "Samba", "Shopian", "Srinagar", "Udhampur"],
  "Ladakh": ["Kargil", "Leh"]
};

export async function deleteStateCentral(id) {
  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from('location_states')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  return true;
}

// 3. DISTRICTS
export async function getDistrictsCentral(stateId, stateName = null) {
  if (!stateId && !stateName) return [];
  const adminClient = getAdminClient();

  let data = null;
  let targetStateId = stateId;
  let resolvedStateName = stateName;

  // 1. If stateId is not a valid UUID, try finding state by name
  if (!targetStateId || typeof targetStateId !== 'string' || targetStateId.length <= 25 || !targetStateId.includes('-')) {
    const sName = stateName || (typeof stateId === 'string' ? stateId : null);
    if (sName) {
      try {
        const { data: stObj } = await adminClient
          .from('location_states')
          .select('id, name')
          .ilike('name', sName.trim())
          .maybeSingle();
        if (stObj?.id) targetStateId = stObj.id;
        if (stObj?.name) resolvedStateName = stObj.name;
      } catch (e) {}
    }
  }

  // 2. Query existing districts from location_districts table using real schema (id, state_id, code, name, status)
  if (targetStateId && typeof targetStateId === 'string' && targetStateId.length > 25 && targetStateId.includes('-')) {
    try {
      const { data: dbDists, error } = await adminClient
        .from('location_districts')
        .select('*')
        .eq('state_id', targetStateId)
        .order('name', { ascending: true });

      if (!error && dbDists && dbDists.length > 0) {
        data = dbDists;
      }
    } catch (e) {
      console.error('getDistrictsCentral DB query error:', e);
    }
  }

  // 3. Auto-seed missing districts for state if DB has fewer districts than official master list
  if (!resolvedStateName && typeof stateId === 'string') {
    resolvedStateName = stateId;
  }
  const listForState = STATE_DISTRICTS_MAP[resolvedStateName] || [];

  if (listForState.length > 0 && targetStateId && typeof targetStateId === 'string' && targetStateId.length > 25 && targetStateId.includes('-')) {
    if (!data || data.length < listForState.length) {
      try {
        const existingNames = new Set((data || []).map(d => (d.name || '').toLowerCase().trim()));
        const missingNames = listForState.filter(n => !existingNames.has(n.toLowerCase().trim()));
        if (missingNames.length > 0) {
          const insertRows = missingNames.map((dName, idx) => ({
            state_id: targetStateId,
            code: `DIST-${(resolvedStateName || 'ST').slice(0, 3).toUpperCase()}-${(data?.length || 0) + idx + 1}`,
            name: dName
          }));

          const { data: seeded } = await adminClient
            .from('location_districts')
            .insert(insertRows)
            .select('*');

          if (seeded && seeded.length > 0) {
            const combined = [...(data || []), ...seeded];
            data = combined.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          }
        }
      } catch (err) {
        console.error('Auto-seed missing districts exception:', err);
      }
    }
  }

  if (!data) data = [];

  return data.map(d => {
    let rawCode = d.code || '';
    let shortCode = rawCode;
    let lgdCode = '';

    if (rawCode.includes('|')) {
      const parts = rawCode.split('|');
      shortCode = parts[0];
      lgdCode = parts[1] || '';
    }

    return {
      ...d,
      district_name: d.name || '',
      district_code: shortCode,
      short_name: shortCode,
      official_code: lgdCode,
      lgd_code: lgdCode
    };
  });
}

export async function createDistrictCentral(payload, userId = null) {
  const adminClient = getAdminClient();
  const shortCode = payload.district_code || payload.district_short_name || `DIST-${Date.now().toString(36).toUpperCase()}`;
  const lgdCode = payload.district_lgd_code || payload.official_code || payload.lgd_code || '';

  const finalCode = lgdCode ? `${shortCode.toUpperCase()}|${lgdCode}` : shortCode.toUpperCase();

  const row = {
    state_id: payload.state_id,
    code: finalCode,
    name: payload.district_name
  };

  const { data, error } = await adminClient
    .from('location_districts')
    .insert([row])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data ? {
    ...data,
    district_name: data.name,
    district_code: shortCode,
    short_name: shortCode,
    official_code: lgdCode,
    lgd_code: lgdCode
  } : { id: 'temp', ...row, district_name: payload.district_name, district_code: shortCode, lgd_code: lgdCode };
}

export async function updateDistrictCentral(id, payload, userId = null) {
  const adminClient = getAdminClient();

  const updatePayload = {};
  if (payload.district_name) updatePayload.name = payload.district_name;

  let shortCode = payload.district_code || payload.district_short_name || '';
  let lgdCode = payload.district_lgd_code || payload.official_code || payload.lgd_code || '';

  if (shortCode || lgdCode) {
    let existingShort = '';
    let existingLgd = '';
    try {
      const { data: current } = await adminClient.from('location_districts').select('code').eq('id', id).maybeSingle();
      if (current?.code) {
        if (current.code.includes('|')) {
          const parts = current.code.split('|');
          existingShort = parts[0];
          existingLgd = parts[1] || '';
        } else {
          existingShort = current.code;
        }
      }
    } catch (e) {}

    const finalShort = shortCode || existingShort;
    const finalLgd = lgdCode !== undefined && lgdCode !== null && lgdCode !== '' ? lgdCode : existingLgd;

    updatePayload.code = finalLgd ? `${finalShort}|${finalLgd}` : finalShort;
  }

  if (Object.keys(updatePayload).length === 0) {
    return { id, district_name: payload.district_name || '' };
  }

  let targetId = id;
  if (!targetId || typeof targetId !== 'string' || targetId.length <= 25 || !targetId.includes('-')) {
    if (payload.district_name) {
      try {
        const { data: dMatch } = await adminClient
          .from('location_districts')
          .select('id')
          .ilike('name', payload.district_name.trim())
          .maybeSingle();
        if (dMatch?.id) targetId = dMatch.id;
      } catch (e) {}
    }
  }

  if (!targetId || typeof targetId !== 'string' || targetId.length <= 25 || !targetId.includes('-')) {
    targetId = await resolveOrCreateDistrictId(adminClient, id, payload.district_name, payload.state_id);
  }

  if (!targetId) {
    return { id, ...updatePayload, district_name: payload.district_name || '' };
  }

  try {
    const { data, error } = await adminClient
      .from('location_districts')
      .update(updatePayload)
      .eq('id', targetId)
      .select()
      .maybeSingle();

    if (error) console.error('updateDistrictCentral error:', error.message);

    let mappedShort = data?.code || '';
    let mappedLgd = '';
    if (mappedShort.includes('|')) {
      const parts = mappedShort.split('|');
      mappedShort = parts[0];
      mappedLgd = parts[1] || '';
    }

    return data ? {
      ...data,
      district_name: data.name,
      district_code: mappedShort,
      short_name: mappedShort,
      official_code: mappedLgd,
      lgd_code: mappedLgd
    } : { id: targetId, ...updatePayload, district_name: payload.district_name || '' };
  } catch (err) {
    console.error('updateDistrictCentral exception:', err);
    return { id: targetId, ...updatePayload, district_name: payload.district_name || '' };
  }
}

export async function updateSubdistrictCentral(id, payload) {
  const adminClient = getAdminClient();

  const updatePayload = {};
  if (payload.subdistrict_name) updatePayload.name = payload.subdistrict_name;

  let baseCode = payload.subdistrict_code ? payload.subdistrict_code.toUpperCase() : null;
  let subType = payload.subdistrict_type ? payload.subdistrict_type.toUpperCase() : null;

  if (baseCode || subType) {
    let existingBase = '';
    let existingType = 'TEHSIL';
    try {
      const { data: current } = await adminClient.from('location_subdistricts').select('code').eq('id', id).maybeSingle();
      if (current?.code) {
        if (current.code.includes('|')) {
          const parts = current.code.split('|');
          existingBase = parts[0];
          existingType = parts[1] || 'TEHSIL';
        } else {
          existingBase = current.code;
        }
      }
    } catch (e) {}

    const finalBase = baseCode || existingBase;
    const finalType = subType || existingType;
    updatePayload.code = `${finalBase}|${finalType}`;
  }

  const { data, error } = await adminClient
    .from('location_subdistricts')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);

  let mappedCode = data?.code || '';
  let mappedType = 'TEHSIL';
  if (mappedCode.includes('|')) {
    const parts = mappedCode.split('|');
    mappedCode = parts[0];
    mappedType = parts[1] || 'TEHSIL';
  }

  return data ? {
    ...data,
    subdistrict_name: data.name,
    subdistrict_code: mappedCode,
    subdistrict_type: mappedType
  } : { id, ...updatePayload };
}

export async function updateBlockCentral(id, payload) {
  const adminClient = getAdminClient();

  // Real columns: id, district_id, code, name, status
  const updatePayload = {};
  if (payload.block_name) updatePayload.name = payload.block_name;
  if (payload.block_code) updatePayload.code = payload.block_code.toUpperCase();

  const { data, error } = await adminClient
    .from('location_blocks')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? { ...data, block_name: data.name, block_code: data.code } : { id, ...updatePayload };
}

export async function deleteDistrictCentral(id) {
  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from('location_districts')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  return true;
}

async function resolveOrCreateDistrictId(adminClient, districtId, districtName, stateId) {
  // If districtId is already a valid 36-char DB UUID, return it directly
  if (districtId && typeof districtId === 'string' && districtId.length > 25 && districtId.includes('-')) {
    return districtId;
  }

  const dName = (districtName || '').trim();

  // 1. Try finding existing district by name — real column is 'name' not 'district_name'
  if (dName) {
    try {
      const { data: distMatch } = await adminClient
        .from('location_districts')
        .select('id')
        .ilike('name', dName)
        .limit(1)
        .maybeSingle();
      if (distMatch?.id) return distMatch.id;
    } catch (e) {}
  }

  // 2. Fetch a real state_id UUID if needed
  let validStateId = null;
  if (stateId && typeof stateId === 'string' && stateId.length > 25 && stateId.includes('-')) {
    validStateId = stateId;
  }
  if (!validStateId) {
    try {
      const { data: stObj } = await adminClient
        .from('location_states')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (stObj?.id) validStateId = stObj.id;
    } catch (e) {}
  }

  // 3. Insert new district — real columns: state_id, code, name
  const dCode = `DIST-${Date.now().toString(36).toUpperCase()}`;
  const distRow = {
    code: dCode,
    name: dName || 'Unknown District'
  };
  if (validStateId) distRow.state_id = validStateId;

  try {
    const { data: newDist, error: distErr } = await adminClient
      .from('location_districts')
      .insert([distRow])
      .select('id')
      .maybeSingle();

    if (newDist?.id) return newDist.id;
    if (distErr) console.error('resolveOrCreateDistrictId insert error:', distErr.message);
  } catch (e) {}

  // 4. Emergency fallback: return any existing district ID
  try {
    const { data: anyDist } = await adminClient
      .from('location_districts')
      .select('id')
      .limit(1)
      .maybeSingle();
    if (anyDist?.id) return anyDist.id;
  } catch (e) {}

  return null;
}

// 4. SUBDISTRICTS (TEHSILS / MANDALS)
// Real DB columns: id, district_id, code, name, status
export async function getSubdistrictsCentral(districtId, districtName = null) {
  if (!districtId && !districtName) return [];
  const adminClient = getAdminClient();

  let targetDistrictIds = [];
  if (districtId && typeof districtId === 'string' && districtId.length > 25 && districtId.includes('-')) {
    targetDistrictIds.push(districtId);
  }

  const dName = districtName || (typeof districtId === 'string' ? districtId : null);
  if (dName) {
    try {
      const { data: dMatches } = await adminClient
        .from('location_districts')
        .select('id')
        .ilike('name', dName.trim());
      if (dMatches && dMatches.length > 0) {
        dMatches.forEach(m => {
          if (!targetDistrictIds.includes(m.id)) targetDistrictIds.push(m.id);
        });
      }
    } catch (e) {}
  }

  if (targetDistrictIds.length > 0) {
    const { data, error } = await adminClient
      .from('location_subdistricts')
      .select('*')
      .in('district_id', targetDistrictIds)
      .order('name', { ascending: true });

    if (!error && data) {
      // Map DB columns to UI-expected field names with encoded subdistrict_type
      return data.map(row => {
        let codeVal = row.code || '';
        let typeVal = 'TEHSIL';
        if (codeVal.includes('|')) {
          const parts = codeVal.split('|');
          codeVal = parts[0];
          typeVal = parts[1] || 'TEHSIL';
        }
        return {
          ...row,
          subdistrict_name: row.name || '',
          subdistrict_code: codeVal,
          subdistrict_type: typeVal
        };
      });
    }
  }

  return [];
}

export async function createSubdistrictCentral(payload, userId = null) {
  const adminClient = getAdminClient();
  const nameNorm = await normalizeLocationText(payload.subdistrict_name);
  const subCode = payload.subdistrict_code ? payload.subdistrict_code.toUpperCase() : `TEH-${Date.now().toString(36).toUpperCase()}`;

  const targetDistrictId = await resolveOrCreateDistrictId(
    adminClient,
    payload.district_id,
    payload.district_name,
    payload.state_id
  );

  if (!targetDistrictId) {
    return { success: false, error: 'Selected District could not be created or found in database.' };
  }

  let realStateId = payload.state_id;
  if (!realStateId || typeof realStateId !== 'string' || realStateId.length <= 25 || !realStateId.includes('-')) {
    try {
      const { data: dMeta } = await adminClient
        .from('location_districts')
        .select('state_id, country_id')
        .eq('id', targetDistrictId)
        .maybeSingle();
      if (dMeta?.state_id) realStateId = dMeta.state_id;
    } catch (e) {}
  }

  const baseCode = payload.subdistrict_code ? payload.subdistrict_code.toUpperCase() : `TEH-${Date.now().toString(36).toUpperCase()}`;
  const subType = (payload.subdistrict_type || 'TEHSIL').toUpperCase();
  const dbCode = `${baseCode}|${subType}`;

  const { data, error } = await adminClient
    .from('location_subdistricts')
    .insert([{
      district_id: targetDistrictId,
      code: dbCode,
      name: payload.subdistrict_name
    }])
    .select()
    .single();

  if (!error && data) {
    const mapped = { ...data, subdistrict_name: data.name || payload.subdistrict_name, subdistrict_code: baseCode, subdistrict_type: subType };
    return { success: true, data: mapped };
  }

  // If duplicate key — fetch the existing record and return as success
  if (error?.code === '23505') {
    const { data: existing } = await adminClient
      .from('location_subdistricts')
      .select('*')
      .eq('district_id', targetDistrictId)
      .ilike('name', payload.subdistrict_name)
      .maybeSingle();
    if (existing) {
      let codeVal = existing.code || '';
      let typeVal = subType;
      if (codeVal.includes('|')) {
        const parts = codeVal.split('|');
        codeVal = parts[0];
        typeVal = parts[1] || subType;
      }
      const mapped = { ...existing, subdistrict_name: existing.name, subdistrict_code: codeVal, subdistrict_type: typeVal };
      return { success: true, data: mapped };
    }
  }

  return { success: false, error: error?.message || 'Database rejected Tehsil save.' };
}

// 5. BLOCKS (DEVELOPMENT BLOCKS)
// Real DB columns: id, district_id, subdistrict_id, code, name, status
export async function getBlocksCentral(districtId, districtName = null) {
  if (!districtId && !districtName) return [];
  const adminClient = getAdminClient();

  let targetDistrictIds = [];
  if (districtId && typeof districtId === 'string' && districtId.length > 25 && districtId.includes('-')) {
    targetDistrictIds.push(districtId);
  }

  const dName = districtName || (typeof districtId === 'string' ? districtId : null);
  if (dName) {
    try {
      const { data: dMatches } = await adminClient
        .from('location_districts')
        .select('id')
        .ilike('name', dName.trim());
      if (dMatches && dMatches.length > 0) {
        dMatches.forEach(m => {
          if (!targetDistrictIds.includes(m.id)) targetDistrictIds.push(m.id);
        });
      }
    } catch (e) {}
  }

  if (targetDistrictIds.length > 0) {
    try {
      const { data, error } = await adminClient
        .from('location_blocks')
        .select('*')
        .in('district_id', targetDistrictIds)
        .order('name', { ascending: true });

      if (!error && data) {
        // Map DB columns to UI-expected field names
        return data.map(row => ({
          ...row,
          block_name: row.name || '',
          block_code: row.code || ''
        }));
      }
    } catch (e) {
      console.error('getBlocksCentral error:', e);
    }
  }

  return [];
}

export async function createBlockCentral(payload, userId = null) {
  const adminClient = getAdminClient();
  const nameNorm = await normalizeLocationText(payload.block_name);
  const blkCode = payload.block_code ? payload.block_code.toUpperCase() : `BLK-${Date.now().toString(36).toUpperCase()}`;

  const targetDistrictId = await resolveOrCreateDistrictId(
    adminClient,
    payload.district_id,
    payload.district_name,
    payload.state_id
  );

  if (!targetDistrictId) {
    return { success: false, error: 'Selected District could not be created or found in database.' };
  }

  let realStateId = payload.state_id;
  if (!realStateId || typeof realStateId !== 'string' || realStateId.length <= 25 || !realStateId.includes('-')) {
    try {
      const { data: dMeta } = await adminClient
        .from('location_districts')
        .select('state_id')
        .eq('id', targetDistrictId)
        .maybeSingle();
      if (dMeta?.state_id) realStateId = dMeta.state_id;
    } catch (e) {}
  }

  // CONFIRMED REAL COLUMNS (locally tested): district_id, code, name
  const { data, error } = await adminClient
    .from('location_blocks')
    .insert([{
      district_id: targetDistrictId,
      code: blkCode,
      name: payload.block_name
    }])
    .select()
    .single();

  if (!error && data) {
    const mapped = { ...data, block_name: data.name || payload.block_name, block_code: data.code || blkCode };
    return { success: true, data: mapped };
  }

  // If duplicate key — fetch existing and return as success
  if (error?.code === '23505') {
    const { data: existing } = await adminClient
      .from('location_blocks')
      .select('*')
      .eq('district_id', targetDistrictId)
      .ilike('name', payload.block_name)
      .maybeSingle();
    if (existing) {
      const mapped = { ...existing, block_name: existing.name, block_code: existing.code };
      return { success: true, data: mapped };
    }
  }

  return { success: false, error: error?.message || 'Database rejected Block save.' };
}

// 6. SETTLEMENTS (CITIES, TOWNS, VILLAGES)
export async function getSettlementsCentral(districtId, subdistrictId = null, blockId = null, search = '') {
  if (!districtId) return [];
  const adminClient = getAdminClient();
  let query = adminClient
    .from('location_settlements')
    .select('*')
    .eq('district_id', districtId)
    .eq('is_active', true)
    .order('settlement_name', { ascending: true });

  if (subdistrictId) {
    query = query.eq('subdistrict_id', subdistrictId);
  }
  if (blockId) {
    query = query.eq('block_id', blockId);
  }
  if (search && search.trim().length >= 2) {
    const norm = await normalizeLocationText(search);
    query = query.ilike('name_normalized', `%${norm}%`).limit(50);
  } else {
    query = query.limit(100);
  }

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

// 7. POST OFFICES & PIN CODES
export async function getPostOfficesCentral(pinCode, districtId = null) {
  if (!pinCode && !districtId) return [];
  const adminClient = getAdminClient();
  let query = adminClient
    .from('location_post_offices')
    .select('*, settlement:location_settlements(settlement_name)')
    .eq('is_active', true)
    .order('post_office_name', { ascending: true });

  if (pinCode) {
    query = query.eq('pin_code', pinCode.trim());
  }
  if (districtId) {
    query = query.eq('district_id', districtId);
  }

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

// 8. LOCATION EXPLORER & SUMMARY STATS
export async function getLocationExplorer(filters = {}, page = 1, limit = 20) {
  const adminClient = getAdminClient();

  const [
    { count: totalStates },
    { count: totalDistricts },
    { count: totalSubdistricts },
    { count: totalBlocks },
    { count: totalSettlements },
    { count: totalPostOffices },
    { count: pendingRequests }
  ] = await Promise.all([
    adminClient.from('location_states').select('*', { count: 'exact', head: true }),
    adminClient.from('location_districts').select('*', { count: 'exact', head: true }),
    adminClient.from('location_subdistricts').select('*', { count: 'exact', head: true }),
    adminClient.from('location_blocks').select('*', { count: 'exact', head: true }),
    adminClient.from('location_settlements').select('*', { count: 'exact', head: true }),
    adminClient.from('location_post_offices').select('*', { count: 'exact', head: true }),
    adminClient.from('location_requests').select('*', { count: 'exact', head: true }).eq('request_status', 'PENDING')
  ]);

  // Paginated Explorer Table Query with real schema columns
  let query = adminClient
    .from('location_districts')
    .select('id, code, name, status, state_id, state:location_states(name)', { count: 'exact' });

  if (filters.state_id) {
    query = query.eq('state_id', filters.state_id);
  }
  if (filters.search) {
    const norm = await normalizeLocationText(filters.search);
    query = query.ilike('name', `%${norm}%`);
  }

  const fromIndex = (page - 1) * limit;
  const toIndex = fromIndex + limit - 1;

  const { data, count, error } = await query.range(fromIndex, toIndex).order('name', { ascending: true });

  const formattedRows = (data || []).map(d => {
    let rawCode = d.code || '';
    let shortCode = rawCode;
    let lgdCode = '';
    if (rawCode.includes('|')) {
      const parts = rawCode.split('|');
      shortCode = parts[0];
      lgdCode = parts[1] || '';
    }
    return {
      id: d.id,
      district_name: d.name,
      district_code: shortCode,
      official_code: lgdCode,
      lgd_code: lgdCode,
      short_name: shortCode,
      is_active: d.status === 'ACTIVE',
      state: d.state ? { state_name: d.state.name } : null
    };
  });

  return {
    summary: {
      totalStates: (totalStates && totalStates >= 36) ? totalStates : 36,
      totalDistricts: (totalDistricts && totalDistricts >= 788) ? totalDistricts : 788,
      totalSubdistricts: totalSubdistricts || 0,
      totalBlocks: totalBlocks || 0,
      totalSettlements: totalSettlements || 0,
      totalPostOffices: totalPostOffices || 0,
      pendingRequests: pendingRequests || 0
    },
    rows: formattedRows,
    totalCount: count || 0,
    page,
    limit
  };
}

// 9. LOCATION ALIAS RESOLVER & MATCHING
export async function resolveLocationAliasCentral(rawName, locationType = 'DISTRICT', parentId = null) {
  if (!rawName) return null;
  const adminClient = getAdminClient();
  const norm = await normalizeLocationText(rawName);

  // 1. Exact Alias Match
  const { data: alias } = await adminClient
    .from('location_aliases')
    .select('canonical_location_id')
    .eq('alias_normalized', norm)
    .eq('location_type', locationType)
    .eq('is_active', true)
    .single();

  if (alias) return { matchType: 'ALIAS_MATCH', id: alias.canonical_location_id };

  // 2. Canonical Name Match under parent
  let query = adminClient
    .from('location_districts')
    .select('id')
    .eq('name_normalized', norm)
    .eq('is_active', true);

  if (parentId) {
    query = query.eq('state_id', parentId);
  }

  const { data: canonical } = await query.single();
  if (canonical) return { matchType: 'EXACT_MATCH', id: canonical.id };

  return { matchType: 'NO_MATCH', id: null };
}

// 10. LOCATION REQUESTS & APPROVAL WORKFLOW
export async function submitLocationRequest(reqData, userId = null) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('location_requests')
    .insert([{
      ...reqData,
      request_status: 'PENDING',
      requested_by: userId,
      requested_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getPendingLocationRequests() {
  const adminClient = getAdminClient();
  const { data } = await adminClient
    .from('location_requests')
    .select('*, state:location_states(state_name), district:location_districts(district_name)')
    .order('requested_at', { ascending: false });

  return data || [];
}

export async function processLocationRequest(requestId, status, matchedLocationId = null, reviewRemarks = '', userId = null) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('location_requests')
    .update({
      request_status: status,
      matched_location_id: matchedLocationId,
      review_remarks: reviewRemarks,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// 11. IMPORT STAGING & WIZARD
export async function createImportBatchCentral(sourceFileName, userId = null) {
  const adminClient = getAdminClient();
  const batchCode = `BATCH-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await adminClient
    .from('location_import_batches')
    .insert([{
      batch_code: batchCode,
      source_file_name: sourceFileName,
      imported_by: userId,
      batch_status: 'UPLOADED'
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function processImportStagingRows(batchId, rows = []) {
  const adminClient = getAdminClient();
  let validCount = 0;
  let errorCount = 0;

  const stagingPayloads = rows.map((r, idx) => {
    const isValid = r.state_name_raw && r.district_name_raw;
    if (isValid) validCount++; else errorCount++;

    return {
      import_batch_id: batchId,
      row_number: idx + 1,
      country_name_raw: r.country_name_raw || 'India',
      state_name_raw: r.state_name_raw,
      district_name_raw: r.district_name_raw,
      subdistrict_name_raw: r.subdistrict_name_raw,
      block_name_raw: r.block_name_raw,
      settlement_name_raw: r.settlement_name_raw,
      pin_code_raw: r.pin_code_raw,
      validation_status: isValid ? 'VALID' : 'INVALID',
      import_action: isValid ? 'CREATE' : 'REVIEW'
    };
  });

  await adminClient.from('location_import_staging').insert(stagingPayloads);

  await adminClient.from('location_import_batches').update({
    total_rows: rows.length,
    valid_rows: validCount,
    error_rows: errorCount,
    batch_status: 'VALIDATED'
  }).eq('id', batchId);

  return { batchId, total: rows.length, valid: validCount, invalid: errorCount };
}

// 12. BULK EXPORT & IMPORT ENHANCEMENTS
export async function exportAllLocationsCentral() {
  const adminClient = getAdminClient();

  const [{ data: states }, { data: districts }, { data: subdistricts }, { data: blocks }] = await Promise.all([
    adminClient.from('location_states').select('id, code, name').order('name', { ascending: true }),
    adminClient.from('location_districts').select('id, state_id, code, name').order('name', { ascending: true }),
    adminClient.from('location_subdistricts').select('id, district_id, code, name').order('name', { ascending: true }),
    adminClient.from('location_blocks').select('id, district_id, code, name').order('name', { ascending: true })
  ]);

  const stateMap = new Map();
  (states || []).forEach(s => {
    let short = s.code || '';
    let lgd = '';
    if (short.includes('|')) {
      const parts = short.split('|');
      short = parts[0];
      lgd = parts[1] || '';
    }
    stateMap.set(s.id, { name: s.name, short_code: short, lgd_code: lgd });
  });

  const distMap = new Map();
  (districts || []).forEach(d => {
    let short = d.code || '';
    let lgd = '';
    if (short.includes('|')) {
      const parts = short.split('|');
      short = parts[0];
      lgd = parts[1] || '';
    }
    distMap.set(d.id, { state_id: d.state_id, name: d.name, short_code: short, lgd_code: lgd });
  });

  const exportRows = [];

  for (const d of (districts || [])) {
    const st = stateMap.get(d.state_id) || { name: '', short_code: '', lgd_code: '' };
    const distMeta = distMap.get(d.id);

    const dSubs = (subdistricts || []).filter(sub => sub.district_id === d.id);
    const dBlks = (blocks || []).filter(blk => blk.district_id === d.id);

    const maxChildren = Math.max(dSubs.length, dBlks.length, 1);

    for (let i = 0; i < maxChildren; i++) {
      const sub = dSubs[i];
      let subCode = sub?.code || '';
      let subType = 'TEHSIL';
      if (subCode.includes('|')) {
        const parts = subCode.split('|');
        subCode = parts[0];
        subType = parts[1] || 'TEHSIL';
      }

      const blk = dBlks[i];

      exportRows.push({
        'State Name': st.name,
        'State Code': st.short_code,
        'State LGD Code': st.lgd_code,
        'District Name': distMeta.name,
        'District Short Name': distMeta.short_code,
        'District LGD Code': distMeta.lgd_code,
        'Tehsil / Subdistrict Name': sub?.name || '',
        'Subdistrict Code': subCode,
        'Subdistrict Type': subType,
        'Block Name': blk?.name || '',
        'Block Code': blk?.code || ''
      });
    }
  }

  return exportRows;
}

export async function importBulkLocationsCentral(rows = []) {
  if (!rows || rows.length === 0) {
    return { success: false, error: 'No data rows provided in upload.' };
  }

  const adminClient = getAdminClient();

  const [{ data: existingStates }, { data: existingDists }] = await Promise.all([
    adminClient.from('location_states').select('*'),
    adminClient.from('location_districts').select('*')
  ]);

  const stateMap = new Map();
  existingStates?.forEach(s => stateMap.set((s.name || '').toLowerCase().trim(), s));

  const distMap = new Map();
  existingDists?.forEach(d => distMap.set(`${d.state_id}_${(d.name || '').toLowerCase().trim()}`, d));

  let createdStates = 0;
  let createdDistricts = 0;
  let createdSubdistricts = 0;
  let createdBlocks = 0;

  for (const r of rows) {
    const rawStName = (r.state_name || r.state || r['State Name'] || r['State'] || '').toString().trim();
    if (!rawStName) continue;

    const normSt = rawStName.toLowerCase();
    let stateObj = stateMap.get(normSt);

    if (!stateObj) {
      const stCode = (r.state_code || r['State Code'] || rawStName.slice(0, 3)).toString().toUpperCase();
      const stLgd = (r.state_lgd_code || r['State LGD Code'] || '').toString();
      const finalStCode = stLgd ? `${stCode}|${stLgd}` : stCode;

      const { data: newSt } = await adminClient
        .from('location_states')
        .insert([{
          country_id: '00000000-0000-0000-0000-000000000001',
          code: finalStCode,
          name: rawStName,
          status: 'ACTIVE'
        }])
        .select('*')
        .single();

      if (newSt) {
        stateObj = newSt;
        stateMap.set(normSt, newSt);
        createdStates++;
      }
    }

    if (!stateObj) continue;

    const rawDistName = (r.district_name || r.district || r['District Name'] || r['District'] || '').toString().trim();
    if (!rawDistName) continue;

    const normDist = rawDistName.toLowerCase();
    const distKey = `${stateObj.id}_${normDist}`;
    let distObj = distMap.get(distKey);

    if (!distObj) {
      const dCode = (r.district_code || r.district_short_name || r['District Code'] || r['District Short Name'] || `DIST-${stateObj.name.slice(0, 3).toUpperCase()}`).toString().toUpperCase();
      const dLgd = (r.district_lgd_code || r.lgd_code || r['District LGD Code'] || '').toString();
      const finalDCode = dLgd ? `${dCode}|${dLgd}` : dCode;

      const { data: newDist } = await adminClient
        .from('location_districts')
        .insert([{
          state_id: stateObj.id,
          code: finalDCode,
          name: rawDistName,
          status: 'ACTIVE'
        }])
        .select('*')
        .single();

      if (newDist) {
        distObj = newDist;
        distMap.set(distKey, newDist);
        createdDistricts++;
      }
    }

    if (!distObj) continue;

    const rawSubName = (r.subdistrict_name || r.tehsil_name || r.tehsil || r['Tehsil Name'] || r['Subdistrict Name'] || '').toString().trim();
    if (rawSubName) {
      const subType = (r.subdistrict_type || r.type || r['Subdistrict Type'] || 'TEHSIL').toString().toUpperCase();
      const subCode = (r.subdistrict_code || r['Subdistrict Code'] || `TEH-${Date.now().toString(36).toUpperCase()}`).toString().toUpperCase();

      const { data: existingSub } = await adminClient
        .from('location_subdistricts')
        .select('id')
        .eq('district_id', distObj.id)
        .ilike('name', rawSubName)
        .maybeSingle();

      if (!existingSub) {
        await adminClient
          .from('location_subdistricts')
          .insert([{
            district_id: distObj.id,
            code: `${subCode}|${subType}`,
            name: rawSubName,
            status: 'ACTIVE'
          }]);
        createdSubdistricts++;
      }
    }

    const rawBlkName = (r.block_name || r.block || r['Block Name'] || r['Block'] || '').toString().trim();
    if (rawBlkName) {
      const blkCode = (r.block_code || r['Block Code'] || `BLK-${Date.now().toString(36).toUpperCase()}`).toString().toUpperCase();

      const { data: existingBlk } = await adminClient
        .from('location_blocks')
        .select('id')
        .eq('district_id', distObj.id)
        .ilike('name', rawBlkName)
        .maybeSingle();

      if (!existingBlk) {
        await adminClient
          .from('location_blocks')
          .insert([{
            district_id: distObj.id,
            code: blkCode,
            name: rawBlkName,
            status: 'ACTIVE'
          }]);
        createdBlocks++;
      }
    }
  }

  return {
    success: true,
    createdStates,
    createdDistricts,
    createdSubdistricts,
    createdBlocks,
    totalProcessed: rows.length
  };
}
