'use server';

import { getAdminMessageConfig } from './adminMessageConfig';

// ==========================================
// WhatsApp Unofficial Multi-BSP Gateway Adapter
// Supports: AK Nexus, Saasyto, MyTAPI, Wasender, Evolution API, UltraMsg, WPPConnect, & Custom
// With Built-in Auto-Healing for Expired/Invalidated Sessions
// ==========================================

async function getGatewayConfig(tenantId = null) {
  try {
    const cfgRes = await getAdminMessageConfig();
    const wa = cfgRes?.data?.wa_unofficial || {};

    // Check if tenant has a specific allocation / override
    let tenantConfig = null;
    if (tenantId && wa.tenant_allocations && wa.tenant_allocations[tenantId]) {
      tenantConfig = wa.tenant_allocations[tenantId];
    }

    const provider = tenantConfig?.provider || wa?.provider || 'aknexus';
    const baseUrl = (tenantConfig?.server_url || wa?.server_url || process.env.WHATSAPP_UNOFFICIAL_BASE_URL || 'https://app.aknexus.in/api').replace(/\/+$/, '');
    const token = tenantConfig?.api_token || wa?.api_token || process.env.WHATSAPP_UNOFFICIAL_ACCESS_TOKEN || '6abe519e92b26';
    const defaultInst = tenantConfig?.instance_id || wa?.instance_id || process.env.WHATSAPP_UNOFFICIAL_DEFAULT_INSTANCE || '6AD37BDFCEDF5';
    const phoneId = tenantConfig?.phone_id || wa?.phone_id || process.env.WHATSAPP_UNOFFICIAL_PHONE_ID || '';
    const maxLimit = typeof tenantConfig?.max_scanned_instances === 'number'
      ? tenantConfig.max_scanned_instances
      : (typeof wa?.max_scanned_instances === 'number' ? wa.max_scanned_instances : 5);

    return { baseUrl, token, defaultInst, phoneId, maxLimit, provider };
  } catch (err) {
    return {
      baseUrl: (process.env.WHATSAPP_UNOFFICIAL_BASE_URL || 'https://app.aknexus.in/api').replace(/\/+$/, ''),
      token: process.env.WHATSAPP_UNOFFICIAL_ACCESS_TOKEN || '6abe519e92b26',
      defaultInst: process.env.WHATSAPP_UNOFFICIAL_DEFAULT_INSTANCE || '6AD37BDFCEDF5',
      phoneId: process.env.WHATSAPP_UNOFFICIAL_PHONE_ID || '',
      maxLimit: 5,
      provider: 'aknexus'
    };
  }
}

// -------------------------------------------------------------
// Core Request Dispatcher for Standard Gateway (AK Nexus / Saasyto / MyTAPI)
// -------------------------------------------------------------
async function callStandardGateway(endpoint, queryParams = {}, postBody = null, overrideConfig = null) {
  const config = overrideConfig || (await getGatewayConfig());
  const params = new URLSearchParams({
    access_token: config.token,
    ...(config.phoneId ? { phone_id: config.phoneId } : {}),
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
      // Non-JSON
    }

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

// -------------------------------------------------------------
// CREATE INSTANCE
// -------------------------------------------------------------
export async function createInstance(instanceName = 'WhatsApp Instance', tenantId = null) {
  const config = await getGatewayConfig(tenantId);
  const prov = (config.provider || 'aknexus').toLowerCase();

  // 1. Wasender API
  if (prov === 'wasender') {
    try {
      const url = `${config.baseUrl}/whatsapp-sessions`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: instanceName,
          phone_number: '+919999999999',
          account_protection: true,
          log_messages: true
        })
      });
      const data = await res.json().catch(() => null);
      if (data?.data?.id || data?.id) {
        const id = String(data.data?.id || data.id);
        return { success: true, instanceKey: id, instanceId: id };
      }
      return { success: false, error: data?.message || 'Wasender create session error' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 2. Evolution API
  if (prov === 'evolution') {
    try {
      const cleanName = instanceName.replace(/[^a-zA-Z0-9_-]/g, '_') || `inst_${Date.now()}`;
      const url = `${config.baseUrl}/instance/create`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': config.token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instanceName: cleanName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS'
        })
      });
      const data = await res.json().catch(() => null);
      if (data?.instance?.instanceName || data?.instanceName || cleanName) {
        const key = data.instance?.instanceName || data.instanceName || cleanName;
        return { success: true, instanceKey: key, instanceId: key };
      }
      return { success: false, error: data?.message || 'Evolution create instance error' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 3. WPPConnect Server
  if (prov === 'wppconnect') {
    try {
      const session = instanceName.replace(/[^a-zA-Z0-9_-]/g, '_') || `session_${Date.now()}`;
      const url = `${config.baseUrl}/api/${session}/start-session`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ waitQrCode: true })
      });
      const data = await res.json().catch(() => null);
      return { success: true, instanceKey: session, instanceId: session };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 4. UltraMsg (Instance ID is issued via their web console)
  if (prov === 'ultramsg') {
    const key = config.defaultInst || `instance_${Date.now()}`;
    return { success: true, instanceKey: key, instanceId: key };
  }

  // 5. Standard Gateways: AK Nexus, Saasyto, MyTAPI, Custom
  const res = await callStandardGateway('/create_instance', {}, null, config);
  if (res.success && res.data) {
    const instanceKey = res.data.instance_id || res.data.instanceKey;
    if (instanceKey) {
      return { success: true, instanceKey, instanceId: instanceKey };
    }
  }
  return { success: false, error: res.error || 'Failed to generate instance ID from gateway' };
}

// -------------------------------------------------------------
// REGENERATE QR (With Built-in Auto-Healing)
// -------------------------------------------------------------
export async function regenerateQr(instanceKey, tenantId = null) {
  const config = await getGatewayConfig(tenantId);
  const prov = (config.provider || 'aknexus').toLowerCase();

  // 1. Wasender API
  if (prov === 'wasender') {
    try {
      const url = `${config.baseUrl}/whatsapp-sessions/${instanceKey}/connect`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json().catch(() => null);
      const qr = data?.data?.qr || data?.qr;
      if (qr) {
        return { success: true, qrCode: qr, status: 'QR_PENDING' };
      }
      return { success: false, error: data?.message || 'Failed to fetch Wasender QR code' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 2. Evolution API
  if (prov === 'evolution') {
    try {
      const url = `${config.baseUrl}/instance/connect/${instanceKey}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'apikey': config.token }
      });
      const data = await res.json().catch(() => null);
      const qr = data?.base64 || data?.qrcode?.base64 || data?.code;
      if (qr) {
        return { success: true, qrCode: qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`, status: 'QR_PENDING' };
      }
      if (data?.state === 'open' || data?.instance?.state === 'open') {
        return { success: true, status: 'CONNECTED', alreadyConnected: true };
      }
      return { success: false, error: data?.message || 'Evolution QR not available' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 3. UltraMsg API
  if (prov === 'ultramsg') {
    try {
      const url = `${config.baseUrl}/${instanceKey}/instance/qrCode?token=${config.token}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => null);
      if (data?.qrCode) {
        return { success: true, qrCode: data.qrCode, status: 'QR_PENDING' };
      }
      if (data?.connected || data?.status === 'authenticated') {
        return { success: true, status: 'CONNECTED', alreadyConnected: true };
      }
      return { success: false, error: data?.error || 'UltraMsg QR error' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 4. WPPConnect API
  if (prov === 'wppconnect') {
    try {
      const url = `${config.baseUrl}/api/${instanceKey}/qrcode-session`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${config.token}` }
      });
      const data = await res.json().catch(() => null);
      const qr = data?.qrcode || data?.base64;
      if (qr) {
        return { success: true, qrCode: qr, status: 'QR_PENDING' };
      }
      return { success: false, error: data?.message || 'WPPConnect QR error' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 5. Standard Gateway: AK Nexus / Saasyto / MyTAPI (With AUTO-HEALING!)
  let activeKey = instanceKey;
  let res = null;

  if (activeKey) {
    res = await callStandardGateway('/get_qrcode', { instance_id: activeKey }, null, config);
  }

  // Check if activeKey is already paired
  if (res?.raw?.message?.includes('Instance ID has been used')) {
    return { 
      success: true, 
      status: 'CONNECTED', 
      alreadyConnected: true,
      message: 'Account is already paired and connected' 
    };
  }

  // If valid QR returned
  if (res?.success && res.data?.base64) {
    return { 
      success: true, 
      qrCode: res.data.base64, 
      expiresIn: res.data.expires_in || 300,
      status: 'QR_PENDING',
      instanceKey: activeKey
    };
  }

  // ========================================================
  // AUTO-HEALING MECHANISM:
  // If instance is missing, expired, or AK Nexus returned "Instance ID Invalidated"
  // Automatically create a fresh instance on the fly and fetch its fresh live QR!
  // ========================================================
  if (!activeKey || res?.raw?.message?.includes('Invalidated') || !res?.success) {
    console.log(`[Auto-Heal] AK Nexus Instance "${activeKey}" was invalidated/expired. Auto-generating fresh instance...`);
    const freshRes = await createInstance('WhatsApp Auto-Heal', tenantId);
    
    if (freshRes.success && freshRes.instanceKey) {
      const freshQrRes = await callStandardGateway('/get_qrcode', { instance_id: freshRes.instanceKey }, null, config);
      if (freshQrRes.success && freshQrRes.data?.base64) {
        return {
          success: true,
          qrCode: freshQrRes.data.base64,
          expiresIn: freshQrRes.data.expires_in || 300,
          status: 'QR_PENDING',
          freshInstanceKey: freshRes.instanceKey, // Tells DB to seamlessly update the row!
          autoHealed: true
        };
      }
    }
  }

  return { success: false, error: res?.error || 'Failed to fetch QR code from gateway' };
}

// -------------------------------------------------------------
// STATUS CHECK
// -------------------------------------------------------------
export async function getStatus(instanceKey, tenantId = null) {
  if (!instanceKey) return { success: false, status: 'LOGGED_OUT' };
  const config = await getGatewayConfig(tenantId);
  const prov = (config.provider || 'aknexus').toLowerCase();

  if (prov === 'ultramsg') {
    try {
      const res = await fetch(`${config.baseUrl}/${instanceKey}/instance/status?token=${config.token}`);
      const data = await res.json().catch(() => null);
      if (data?.status?.accountStatus?.authenticated) return { success: true, status: 'CONNECTED' };
      return { success: true, status: 'QR_PENDING' };
    } catch {
      return { success: false, status: 'UNKNOWN' };
    }
  }

  if (prov === 'evolution') {
    try {
      const res = await fetch(`${config.baseUrl}/instance/connectionState/${instanceKey}`, {
        headers: { 'apikey': config.token }
      });
      const data = await res.json().catch(() => null);
      if (data?.instance?.state === 'open') return { success: true, status: 'CONNECTED' };
      return { success: true, status: 'QR_PENDING' };
    } catch {
      return { success: false, status: 'UNKNOWN' };
    }
  }

  // Standard Gateway check
  const res = await callStandardGateway('/get_qrcode', { instance_id: instanceKey }, null, config);
  if (res.success && res.data?.base64) {
    return { success: true, status: 'QR_PENDING', qrCode: res.data.base64 };
  }
  if (res.raw?.message?.includes('Instance ID has been used')) {
    return { success: true, status: 'CONNECTED' };
  }
  if (res.raw?.message?.includes('Invalidated')) {
    return { success: true, status: 'LOGGED_OUT', invalidated: true };
  }

  return { success: true, status: 'QR_REQUIRED' };
}

// -------------------------------------------------------------
// REBOOT & RECONNECT
// -------------------------------------------------------------
export async function reconnectInstance(instanceKey, tenantId = null) {
  if (!instanceKey) return { success: false, error: 'Missing instance key' };
  const config = await getGatewayConfig(tenantId);
  return callStandardGateway('/reconnect', { instance_id: instanceKey }, null, config);
}

export async function rebootInstance(instanceKey, tenantId = null) {
  if (!instanceKey) return { success: false, error: 'Missing instance key' };
  const config = await getGatewayConfig(tenantId);
  return callStandardGateway('/reboot', { instance_id: instanceKey }, null, config);
}

export async function resetInstance(instanceKey, tenantId = null) {
  if (!instanceKey) return { success: false, error: 'Missing instance key' };
  const config = await getGatewayConfig(tenantId);
  return callStandardGateway('/reset_instance', { instance_id: instanceKey }, null, config);
}

export async function logout(instanceKey, tenantId = null) {
  return rebootInstance(instanceKey, tenantId);
}

// -------------------------------------------------------------
// SEND TEXT MESSAGE
// -------------------------------------------------------------
export async function sendText(instanceKey, toNumber, messageText, tenantId = null) {
  if (!toNumber || !messageText) {
    return { success: false, error: 'Recipient number and message text are required.' };
  }

  const config = await getGatewayConfig(tenantId);
  const prov = (config.provider || 'aknexus').toLowerCase();
  const cleanNumber = String(toNumber).replace(/[^0-9]/g, '');

  // 1. Wasender API
  if (prov === 'wasender') {
    try {
      const url = `${config.baseUrl}/send-message`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: `+${cleanNumber}`,
          text: messageText
        })
      });
      const data = await res.json().catch(() => null);
      if (data?.success || data?.data?.msgId) {
        return { success: true, messageId: String(data.data?.msgId || Date.now()), data };
      }
      return { success: false, error: data?.message || 'Wasender dispatch error' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 2. Evolution API
  if (prov === 'evolution') {
    try {
      const url = `${config.baseUrl}/message/sendText/${instanceKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': config.token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: cleanNumber,
          text: messageText
        })
      });
      const data = await res.json().catch(() => null);
      if (data?.key?.id || data?.message) {
        return { success: true, messageId: data.key?.id || `msg_${Date.now()}`, data };
      }
      return { success: false, error: data?.message || 'Evolution dispatch error' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 3. UltraMsg API
  if (prov === 'ultramsg') {
    try {
      const url = `${config.baseUrl}/${instanceKey}/messages/chat`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: config.token,
          to: `+${cleanNumber}`,
          body: messageText
        }).toString()
      });
      const data = await res.json().catch(() => null);
      if (data?.sent === 'true' || data?.id) {
        return { success: true, messageId: String(data.id || Date.now()), data };
      }
      return { success: false, error: data?.message || 'UltraMsg dispatch error' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 4. WPPConnect API
  if (prov === 'wppconnect') {
    try {
      const url = `${config.baseUrl}/api/${instanceKey}/send-message`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: cleanNumber,
          message: messageText
        })
      });
      const data = await res.json().catch(() => null);
      if (data?.status === 'success' || data?.response) {
        return { success: true, messageId: `msg_${Date.now()}`, data };
      }
      return { success: false, error: data?.message || 'WPPConnect dispatch error' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 5. Standard Gateways: AK Nexus, Saasyto, MyTAPI, Custom
  const targetKey = instanceKey || config.defaultInst;
  const payload = {
    number: cleanNumber,
    type: 'text',
    message: messageText,
    instance_id: targetKey,
    access_token: config.token,
    ...(config.phoneId ? { phone_id: config.phoneId } : {})
  };

  const res = await callStandardGateway('/send', {}, payload, config);
  if (res.success) {
    return { 
      success: true, 
      messageId: res.data?.message_id || `msg_${Date.now()}`,
      data: res.data
    };
  }

  return { success: false, error: res.error || 'Failed to dispatch message via gateway' };
}

// -------------------------------------------------------------
// SEND MEDIA MESSAGE
// -------------------------------------------------------------
export async function sendMedia(instanceKey, toNumber, mediaUrl, messageType = 'media', caption = '', filename = 'file.jpg', tenantId = null) {
  if (!toNumber || !mediaUrl) {
    return { success: false, error: 'Recipient number and media URL are required.' };
  }

  const config = await getGatewayConfig(tenantId);
  const cleanNumber = String(toNumber).replace(/[^0-9]/g, '');

  const payload = {
    number: cleanNumber,
    type: messageType || 'media',
    message: caption || '',
    media_url: mediaUrl,
    filename: filename || 'file.jpg',
    instance_id: instanceKey || config.defaultInst,
    access_token: config.token,
    ...(config.phoneId ? { phone_id: config.phoneId } : {})
  };

  const res = await callStandardGateway('/send', {}, payload, config);
  if (res.success) {
    return { 
      success: true, 
      messageId: res.data?.message_id || `msg_${Date.now()}`,
      data: res.data 
    };
  }

  return { success: false, error: res.error || 'Failed to dispatch media message' };
}
