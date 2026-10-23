'use client';
import { useEffect, useState } from 'react';
import { normalizeIndianPhoneNumber } from '@/app/api/plivo/phone-number';

const UNKNOWN = { name: 'UnKnow Person', source: null, recordId: null };
const cached = new Map();
const pending = new Map();

export function contactPhone(value) {
  return normalizeIndianPhoneNumber(String(value || '').replace(/^(sip:|tel:)/i, '').split('@')[0]);
}

async function loadContacts(userId, scope, phones) {
  const keyFor = phone => JSON.stringify([userId, scope, phone]);
  const missing = phones.filter(phone => {
    const entry = cached.get(keyFor(phone));
    return !(entry && entry.expiresAt > Date.now()) && !pending.has(keyFor(phone));
  });
  if (missing.length) {
    const request = Promise.resolve().then(async () => {
      try {
        const response = await fetch('/api/plivo/contact-name', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, phones: missing }), signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) return {};
        const result = await response.json();
        const contacts = {};
        for (const phone of missing) {
          const contact = result.contacts?.[phone];
          contacts[phone] = contact && typeof contact.name === 'string' && contact.name.trim()
            ? { name: contact.name.trim(), source: contact.source || null, recordId: contact.recordId || null } : UNKNOWN;
          if (cached.size >= 128 && !cached.has(keyFor(phone))) cached.delete(cached.keys().next().value);
          cached.set(keyFor(phone), { contact: contacts[phone], expiresAt: Date.now() + (contacts[phone].source ? 60000 : 10000) });
        }
        return contacts;
      } catch {
        return {};
      } finally {
        missing.forEach(phone => pending.delete(keyFor(phone)));
      }
    });
    missing.forEach(phone => pending.set(keyFor(phone), request));
  }
  return Object.fromEntries(await Promise.all(phones.map(async phone => {
    const key = keyFor(phone);
    const existing = cached.get(key);
    if (existing && existing.expiresAt > Date.now()) return [phone, existing.contact];
    const request = pending.get(key);
    return [phone, (request && (await request)[phone]) || UNKNOWN];
  })));
}

export function useSoftphoneContacts(userId, numbers, scope = '') {
  const phonesKey = JSON.stringify([...new Set(numbers.map(contactPhone).filter(Boolean))].sort().slice(0, 12));
  const requestKey = JSON.stringify([userId, scope, phonesKey]);
  const [resolved, setResolved] = useState(null);
  useEffect(() => {
    if (!userId || phonesKey === '[]') return;
    let cancelled = false;
    const enrichNames = async () => {
      const contacts = await loadContacts(userId, scope, JSON.parse(phonesKey));
      if (!cancelled) setResolved({ requestKey, contacts });
    };
    enrichNames();
    return () => { cancelled = true; };
  }, [userId, scope, phonesKey, requestKey]);
  return value => resolved?.requestKey === requestKey ? resolved.contacts[contactPhone(value)] || UNKNOWN : UNKNOWN;
}
