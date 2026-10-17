'use server';

import { getAdminMessageConfig } from './adminMessageConfig';

// ==========================================
// WhatsApp Unofficial BSP Gateway Adapter
// Supports AK Nexus, Saasyto, MyTAPI, & Custom Gateways
// ==========================================

async function getGatewayConfig() {
  try {
    const cfgRes = await getAdminMessageConfig();
    const wa = cfgRes?.data?.wa_unofficial;
    const baseUrl = (wa?.server_url || process.env.WHATSAPP_UNOFFICIAL_BASE_URL || 'https://app.aknexus.in/api').replace(/\/+$/, '');
    const token = wa?.api_token || process.env.WHATSAPP_UNOFFICIAL_ACCESS_TOKEN || '6abe519e92b26';
    const defaultInst = wa?.instance_id || process.env.WHATSAPP_UNOFFICIAL_DEFAULT_INSTANCE || '6AD37D9D501B2';
    const maxLimit = Number(wa?.max_scanned_instances ?? 5);
    return { baseUrl, token, defaultInst, maxLimit, provider: wa?.provider || 'aknexus' };
  } catch (err) {
    return {
      baseUrl: (process.env.WHATSAPP_UNOFFICIAL_BASE_URL || 'https://app.aknexus.in/api').replace(/\/+$/, ''),
      token: process.env.WHATSAPP_UNOFFICIAL_ACCESS_TOKEN || '6abe519e92b26',
      defaultInst: process.env.WHATSAPP_UNOFFICIAL_DEFAULT_INSTANCE || '6AD37D9D501B2',
      maxLimit: 5,
      provider: 'aknexus'
    };
  }
}

async function callGateway(endpoint, queryParams = {}, postBody = null) {
  const config = await getGatewayConfig();
  const params = new URLSearchParams({
    access_token: config.token,
    ...queryParams
  });

  const url = `${config.baseUrl}${endpoint}?${params.toString()}`;
  
  try {
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        ...(postBody ? { 'Content-Type': 'application/json' } : {})
      },
      ...(postBody ? { body: JSON.stringify(postBody) } : {})
    };

    const res = await fetch(url, fetchOptions);
    const text = await res.text();
    
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // In case response is not JSON
    }

    // Some gateways (like AK Nexus) return HTTP 404 header along with JSON body { status: 'success', ... }
    if (json) {
      if (json.status === 'success' || json.success === true || json.base64 || json.instance_id) {
        return { success: true, data: json };
      }
      return { success: false, error: json.message || 'Gateway returned error', raw: json };
    }

    if (!res.ok) {
      return { success: false, error: `Gateway HTTP Error: ${res.status}` };
    }

    return { success: true, data: text };
  } catch (error) {
    console.error(`WhatsApp Gateway API Error (${endpoint}):`, error);
    return { success: false, error: error.message };
  }
}

export async function createInstance(instanceName = 'WhatsApp Instance') {
  const res = await callGateway('/create_instance');
  if (res.success && res.data) {
    const instanceKey = res.data.instance_id || res.data.instanceKey;
    if (instanceKey) {
      return { success: true, instanceKey, instanceId: instanceKey };
    }
  }
  return { success: false, error: res.error || 'Failed to generate instance ID from gateway' };
}

export async function regenerateQr(instanceKey) {
  if (!instanceKey) {
    return { success: false, error: 'Instance key is required to generate QR code' };
  }

  const res = await callGateway('/get_qrcode', { instance_id: instanceKey });
  
  if (res.success && res.data) {
    const qrCode = res.data.base64 || res.data.qr || res.data.qrcode;
    if (qrCode) {
      return { 
        success: true, 
        qrCode, 
        expiresIn: res.data.expires_in || 300,
        status: 'QR_PENDING'
      };
    }
  }

  // Handle specific known gateway responses
  if (res.raw?.message?.includes('Instance ID has been used')) {
    return { 
      success: true, 
      status: 'CONNECTED', 
      alreadyConnected: true,
      message: 'Account is already paired and connected' 
    };
  }

  if (res.raw?.message?.includes('Invalidated')) {
    return {
      success: false,
      error: 'Instance ID has been invalidated. Please reboot or create a new instance.',
      invalidated: true
    };
  }

  return { success: false, error: res.error || 'Failed to fetch QR code from gateway' };
}

export async function getStatus(instanceKey) {
  if (!instanceKey) return { success: false, status: 'LOGGED_OUT' };

  // Checking QR endpoint helps determine if connected or waiting
  const res = await callGateway('/get_qrcode', { instance_id: instanceKey });
  
  if (res.success && res.data?.base64) {
    return { success: true, status: 'QR_PENDING', qrCode: res.data.base64 };
  }

  if (res.raw?.message?.includes('Instance ID has been used')) {
    return { success: true, status: 'CONNECTED' };
  }

  if (res.raw?.message?.includes('Invalidated')) {
    return { success: true, status: 'LOGGED_OUT' };
  }

  return { success: true, status: 'QR_REQUIRED' };
}

export async function reconnectInstance(instanceKey) {
  if (!instanceKey) return { success: false, error: 'Missing instance key' };
  const res = await callGateway('/reconnect', { instance_id: instanceKey });
  return res;
}

export async function rebootInstance(instanceKey) {
  if (!instanceKey) return { success: false, error: 'Missing instance key' };
  const res = await callGateway('/reboot', { instance_id: instanceKey });
  return res;
}

export async function resetInstance(instanceKey) {
  if (!instanceKey) return { success: false, error: 'Missing instance key' };
  const res = await callGateway('/reset_instance', { instance_id: instanceKey });
  return res;
}

export async function logout(instanceKey) {
  return rebootInstance(instanceKey);
}

export async function sendText(instanceKey, toNumber, messageText) {
  if (!instanceKey || !toNumber || !messageText) {
    return { success: false, error: 'Missing required parameters (instanceKey, toNumber, messageText)' };
  }

  const config = await getGatewayConfig();
  const cleanNumber = String(toNumber).replace(/[^0-9]/g, '');

  const payload = {
    number: cleanNumber,
    type: 'text',
    message: messageText,
    instance_id: instanceKey,
    access_token: config.token
  };

  const res = await callGateway('/send', {}, payload);
  if (res.success) {
    return { 
      success: true, 
      messageId: res.data?.message_id || `msg_${Date.now()}`,
      data: res.data
    };
  }

  return { success: false, error: res.error || 'Failed to dispatch text message' };
}

export async function sendMedia(instanceKey, toNumber, mediaUrl, messageType = 'media', caption = '', filename = 'file.jpg') {
  if (!instanceKey || !toNumber || !mediaUrl) {
    return { success: false, error: 'Missing required parameters for media dispatch' };
  }

  const config = await getGatewayConfig();
  const cleanNumber = String(toNumber).replace(/[^0-9]/g, '');

  const payload = {
    number: cleanNumber,
    type: messageType || 'media',
    message: caption || '',
    media_url: mediaUrl,
    filename: filename || 'file.jpg',
    instance_id: instanceKey,
    access_token: config.token
  };

  const res = await callGateway('/send', {}, payload);
  if (res.success) {
    return { 
      success: true, 
      messageId: res.data?.message_id || `msg_${Date.now()}`,
      data: res.data 
    };
  }

  return { success: false, error: res.error || 'Failed to dispatch media message' };
}

export async function getGroups(instanceKey) {
  if (!instanceKey) return { success: false, error: 'Missing instance key' };
  const res = await callGateway('/get_groups', { instance_id: instanceKey });
  return res;
}
