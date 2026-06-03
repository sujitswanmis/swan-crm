'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

// ==========================================
// WhatsApp Engine Adapter
// Acts as a bridge between the CRM and the external WA Engine API
// ==========================================

const WA_ENGINE_URL = process.env.WHATSAPP_ENGINE_BASE_URL || 'http://localhost:3000';
const WA_ENGINE_SECRET = process.env.WHATSAPP_ENGINE_SECRET || 'secret';

async function fetchEngine(endpoint, options = {}) {
  const url = `${WA_ENGINE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': WA_ENGINE_SECRET,
    ...(options.headers || {})
  };

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `API Error: ${res.status}`);
    }
    return { success: true, data };
  } catch (error) {
    console.error('WA Engine API Error:', error);
    return { success: false, error: error.message };
  }
}

export async function createInstance(instanceName) {
  // In a real scenario, you'd call your WA engine to initialize an instance
  // For now, we mock the creation and return a unique instance_key
  const instanceKey = `wa_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  // MOCK: Replace with actual WA engine call
  // const res = await fetchEngine('/instance/create', { method: 'POST', body: JSON.stringify({ instanceName, instanceKey }) });
  // if (!res.success) return res;

  return { success: true, instanceKey };
}

export async function regenerateQr(instanceKey) {
  // Call WA engine to request a new QR code for an existing instance key
  
  // MOCK: Replace with actual WA engine call
  // const res = await fetchEngine('/instance/qr', { method: 'POST', body: JSON.stringify({ instanceKey }) });
  // return res;

  // Mock response for development
  return { 
    success: true, 
    qrCode: `mock_qr_data_${Date.now()}` 
  };
}

export async function getStatus(instanceKey) {
  // Check the connection status of the instance from the WA engine
  
  // MOCK: Replace with actual WA engine call
  // const res = await fetchEngine('/instance/status', { method: 'GET' });
  // return res;

  return { success: true, status: 'QR_PENDING' }; // mock status
}

export async function sendText(instanceKey, toNumber, messageText) {
  // Send a text message via the WA engine
  const payload = {
    instanceKey,
    to: toNumber,
    type: 'text',
    message: messageText
  };
  
  // MOCK: Replace with actual WA engine call
  // const res = await fetchEngine('/message/send', { method: 'POST', body: JSON.stringify(payload) });
  // return res;
  
  return { success: true, messageId: `msg_${Date.now()}` };
}

export async function sendMedia(instanceKey, toNumber, mediaUrl, messageType, caption) {
  const payload = {
    instanceKey,
    to: toNumber,
    type: messageType,
    mediaUrl,
    caption
  };
  
  // MOCK: Replace with actual WA engine call
  // const res = await fetchEngine('/message/sendMedia', { method: 'POST', body: JSON.stringify(payload) });
  // return res;

  return { success: true, messageId: `msg_${Date.now()}` };
}

export async function logout(instanceKey) {
  // Force logout the WA session from the engine
  
  // MOCK: Replace with actual WA engine call
  // const res = await fetchEngine('/instance/logout', { method: 'POST', body: JSON.stringify({ instanceKey }) });
  // return res;

  return { success: true };
}
