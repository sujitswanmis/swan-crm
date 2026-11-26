/**
 * Instant Devanagari to Hinglish (Roman Script) Transliteration Utility
 * Converts Devanagari speech recognition output into natural, readable Roman Hinglish
 * e.g. "How are you आज तुम क्यों नहीं आये" -> "How are you aaj tum kyun nahi aaye"
 */

const HINGLISH_DICT = {
  // Pronouns & Questions
  'आज': 'aaj', 'कल': 'kal', 'परसों': 'parson', 'तुम': 'tum', 'आप': 'aap', 'हम': 'hum', 'मैं': 'main', 'मुझे': 'mujhe',
  'मुझको': 'mujhko', 'हमें': 'humein', 'उसे': 'use', 'उसको': 'usko', 'उन्हें': 'unhein', 'इनको': 'inko', 'इनका': 'inka',
  'उनका': 'unka', 'तुम्हारा': 'tumhara', 'आपका': 'aapka', 'मेरा': 'mera', 'मेरी': 'meri', 'मेरे': 'mere',
  'क्यों': 'kyun', 'क्यो': 'kyun', 'कब': 'kab', 'कहाँ': 'kahan', 'कहा': 'kaha', 'कैसे': 'kaise', 'क्या': 'kya', 'कौन': 'kaun', 'कितना': 'kitna',

  // Common Verbs & Auxiliaries
  'नहीं': 'nahi', 'नही': 'nahi', 'मत': 'mat', 'ना': 'na', 'हाँ': 'haan', 'हां': 'haan',
  'है': 'hai', 'हैं': 'hain', 'हो': 'ho', 'हूँ': 'hoon', 'था': 'tha', 'थी': 'thi', 'थे': 'the',
  'आओ': 'aao', 'आए': 'aaye', 'आये': 'aaye', 'जाओ': 'jaao', 'गया': 'gaya', 'गए': 'gaye', 'गये': 'gaye', 'गई': 'gayi',
  'करना': 'karna', 'करनी': 'karni', 'करने': 'karne', 'किया': 'kiya', 'करो': 'karo', 'करें': 'karein',
  'होगा': 'hoga', 'होगी': 'hogi', 'होंगे': 'honge', 'सकता': 'sakta', 'सकती': 'sakti', 'सकते': 'sakte',
  'देना': 'dena', 'दिया': 'diya', 'दो': 'do', 'दीजिये': 'dijiye', 'दीजिए': 'dijiye', 'लेना': 'lena', 'लिया': 'liya', 'लो': 'lo',
  'बोलना': 'bolna', 'बोला': 'bola', 'बोली': 'boli', 'बोले': 'bole', 'बताना': 'batana', 'बताया': 'bataya',
  'भेजना': 'bhejna', 'भेजो': 'bhejo', 'भेजा': 'bheja', 'देखना': 'dekhna', 'देखा': 'dekha', 'देखो': 'dekho',

  // Prepositions & Connectors
  'को': 'ko', 'का': 'ka', 'के': 'ke', 'की': 'ki', 'से': 'se', 'में': 'mein', 'पर': 'par', 'तक': 'tak',
  'और': 'aur', 'भी': 'bhi', 'तो': 'to', 'या': 'ya', 'लेकिन': 'lekin', 'अगर': 'agar', 'क्योंकि': 'kyunki',

  // Titles, Office & Daily Words
  'जी': 'ji', 'सर': 'sir', 'मैडम': 'madam', 'भाई': 'bhai', 'साहब': 'sahab',
  'काम': 'kaam', 'बात': 'baat', 'पेमेंट': 'payment', 'कॉल': 'call', 'मीटिंग': 'meeting',
  'रिपोर्ट': 'report', 'फाइल': 'file', 'टास्क': 'task', 'टाइम': 'time', 'फॉलोअप': 'followup',
  'अटेंडेंस': 'attendance', 'लीड': 'lead', 'ऑर्डर': 'order', 'ग्राहक': 'customer', 'कस्टमर': 'customer',
  'क्लाइंट': 'client', 'बिल': 'bill', 'चेक': 'check', 'अपडेट': 'update', 'चाहिए': 'chahiye', 'चाहिये': 'chahiye'
};

const VOWELS = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
  'अं': 'an', 'अः': 'ah'
};

const MATRAS = {
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u',
  'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
  'ं': 'n', 'ँ': 'n', 'ः': 'h', '्': '', 'ॉ': 'o', 'ॅ': 'e'
};

const CONSONANTS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'ड़': 'd',
  'ढ़': 'dh', 'फ़': 'f'
};

/**
 * Transliterates Devanagari text into natural Roman Hinglish.
 * Leaves English words, numbers, and symbols completely unaffected.
 * @param {string} text
 * @returns {string}
 */
export function transliterateToHinglish(text) {
  if (!text) return '';
  // Check if text has any Devanagari characters
  if (!/[\u0900-\u097F]/.test(text)) return text;

  // Split tokens keeping spaces and punctuation intact
  return text.split(/(\s+|[.,!?;:()]+)/).map(token => {
    if (!token || !/[\u0900-\u097F]/.test(token)) return token;

    // Check direct dictionary match first
    const trimmed = token.trim();
    if (HINGLISH_DICT[trimmed]) {
      return HINGLISH_DICT[trimmed];
    }

    const chars = Array.from(trimmed);
    let out = '';
    const n = chars.length;

    for (let i = 0; i < n; i++) {
      const c = chars[i];
      const next = chars[i + 1];

      // Conjunct shortcuts
      if (c === 'क' && next === '्' && chars[i + 2] === 'ष') {
        out += 'ksh';
        i += 2;
        continue;
      }
      if (c === 'ज' && next === '्' && chars[i + 2] === 'ञ') {
        out += 'gy';
        i += 2;
        continue;
      }
      if (c === 'श' && next === '्' && chars[i + 2] === 'र') {
        out += 'shr';
        i += 2;
        continue;
      }

      if (VOWELS[c]) {
        out += VOWELS[c];
      } else if (CONSONANTS[c]) {
        out += CONSONANTS[c];
        if (next === '्') {
          // Halant suppresses inherent 'a'
          i++;
        } else if (MATRAS[next]) {
          out += MATRAS[next];
          i++;
        } else if (next && CONSONANTS[next]) {
          // Inherent 'a' between consonants
          const nextNext = chars[i + 2];
          // Schwa syncope heuristic (e.g. karna, bataya)
          if (i === 1 && n >= 4 && MATRAS[nextNext]) {
            // omit medial schwa
          } else {
            out += 'a';
          }
        }
      } else if (MATRAS[c]) {
        out += MATRAS[c];
      } else {
        out += c;
      }
    }
    return out;
  }).join('');
}
