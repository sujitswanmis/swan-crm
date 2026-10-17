'use server';

import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/supabase/adminClient';
import { revalidatePath } from 'next/cache';
import * as adapter from './whatsappUnofficialAdapter';
import { getAdminMessageConfig, saveAdminMessageConfig } from './adminMessageConfig';

// Helper to fetch Master Admin capacity limit and current connected instances
export async function getInstanceLimitInfo() {
  try {
    const supabase = await createClient();
    const configRes = await getAdminMessageConfig();
    const waConfig = configRes.data?.wa_unofficial || {};
    const maxLimit = typeof waConfig.max_scanned_instances === 'number' 
      ? waConfig.max_scanned_instances 
      : 5;

    const { count: connectedCount, error: cntErr } = await supabase
      .from('whatsapp_instances')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'CONNECTED');

    const { count: totalCount } = await supabase
      .from('whatsapp_instances')
      .select('*', { count: 'exact', head: true });

    const connected = connectedCount || 0;
    const isLimitReached = maxLimit > 0 && connected >= maxLimit;
    const allowedRemaining = maxLimit > 0 ? Math.max(0, maxLimit - connected) : 999;

    return {
      success: true,
      maxLimit,
      connectedCount: connected,
      totalCount: totalCount || 0,
      isLimitReached,
      allowedRemaining,
      provider: waConfig.provider || 'aknexus'
    };
  } catch (err) {
    console.error('getInstanceLimitInfo error:', err);
    return {
      success: false,
      maxLimit: 5,
      connectedCount: 0,
      totalCount: 0,
      isLimitReached: false,
      allowedRemaining: 5,
      provider: 'aknexus'
    };
  }
}

export async function getInstances() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching instances:', error);
    return { success: false, error: error.message };
  }
  return { success: true, data };
}

export async function createNewInstance(instanceName) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  // 1. Enforce Master Admin scan limit
  const limitInfo = await getInstanceLimitInfo();
  if (limitInfo.isLimitReached) {
    return {
      success: false,
      error: `Master Admin scan limit reached (${limitInfo.connectedCount}/${limitInfo.maxLimit} connected accounts). Please disconnect an unused account or ask Master Admin to increase the capacity in Config Master Studio.`
    };
  }

  // 2. Get instance_key from WA engine
  const adapterRes = await adapter.createInstance(instanceName);
  if (!adapterRes.success) {
    return adapterRes;
  }

  // 3. Save in DB
  const initialStatus = adapterRes.status === 'CONNECTED' ? 'CONNECTED' : 'QR_REQUIRED';
  const insertPayload = {
    owner_user_id: userData.user.id,
    instance_name: instanceName || `WhatsApp Instance ${Date.now()}`,
    instance_key: adapterRes.instanceKey,
    status: initialStatus
  };
  if (initialStatus === 'CONNECTED') {
    insertPayload.last_connected_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('whatsapp_instances')
    .insert([insertPayload])
    .select()
    .single();

  if (error) {
    console.error('Error creating DB instance:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/');
  return { success: true, data };
}

export async function regenerateInstanceQr(instanceId) {
  const supabase = await createClient();
  
  // 1. Get instance key from DB
  const { data: instance, error: fetchErr } = await supabase
    .from('whatsapp_instances')
    .select('instance_key, status, instance_name')
    .eq('id', instanceId)
    .single();

  if (fetchErr || !instance) {
    return { success: false, error: 'Instance not found' };
  }

  // If not already connected, verify limit before allowing new scan
  if (instance.status !== 'CONNECTED') {
    const limitInfo = await getInstanceLimitInfo();
    if (limitInfo.isLimitReached) {
      return {
        success: false,
        error: `Master Admin limit reached (${limitInfo.connectedCount}/${limitInfo.maxLimit} connected accounts). Please disconnect another account first.`
      };
    }
  }

  // 2. Request new QR from Engine
  const adapterRes = await adapter.regenerateQr(instance.instance_key);
  if (!adapterRes.success) {
    return adapterRes;
  }

  // If already connected on the gateway
  if (adapterRes.status === 'CONNECTED' || adapterRes.alreadyConnected) {
    const { data: updated } = await supabase
      .from('whatsapp_instances')
      .update({
        status: 'CONNECTED',
        last_connected_at: new Date().toISOString()
      })
      .eq('id', instanceId)
      .select()
      .single();

    revalidatePath('/');
    return { success: true, data: updated, status: 'CONNECTED', alreadyConnected: true };
  }

  // 3. Update DB with new QR and status (and auto-heal instance_key if adapter refreshed expired key)
  const updatePayload = { 
    qr_code: adapterRes.qrCode, 
    status: 'QR_PENDING'
  };
  if (adapterRes.freshInstanceKey) {
    updatePayload.instance_key = adapterRes.freshInstanceKey;
  }

  const { data, error } = await supabase
    .from('whatsapp_instances')
    .update(updatePayload)
    .eq('id', instanceId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  return { success: true, data };
}

export async function reconnectInstanceDb(instanceId) {
  const supabase = await createClient();
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('instance_key')
    .eq('id', instanceId)
    .single();

  if (!instance) return { success: false, error: 'Instance not found' };

  const res = await adapter.reconnectInstance(instance.instance_key);
  if (res.success) {
    await supabase.from('whatsapp_instances').update({ status: 'CONNECTED', last_connected_at: new Date().toISOString() }).eq('id', instanceId);
  }
  revalidatePath('/');
  return res;
}

export async function rebootInstanceDb(instanceId) {
  const supabase = await createClient();
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('instance_key')
    .eq('id', instanceId)
    .single();

  if (!instance) return { success: false, error: 'Instance not found' };

  const res = await adapter.rebootInstance(instance.instance_key);
  await supabase.from('whatsapp_instances').update({
    status: 'QR_REQUIRED',
    qr_code: null,
    last_logout_at: new Date().toISOString()
  }).eq('id', instanceId);

  revalidatePath('/');
  return res;
}

export async function logoutInstance(instanceId) {
  return rebootInstanceDb(instanceId);
}

export async function syncInstanceStatus(instanceId) {
  const supabase = await createClient();
  const { data: instance } = await supabase.from('whatsapp_instances').select('instance_key, status').eq('id', instanceId).single();
  
  if (!instance) return { success: false };

  const adapterRes = await adapter.getStatus(instance.instance_key);
  if (adapterRes.success && adapterRes.status) {
    const updatePayload = { status: adapterRes.status };
    if (adapterRes.status === 'CONNECTED') {
      updatePayload.last_connected_at = new Date().toISOString();
    }
    if (adapterRes.qrCode) {
      updatePayload.qr_code = adapterRes.qrCode;
    }
    await supabase.from('whatsapp_instances').update(updatePayload).eq('id', instanceId);
    return { success: true, status: adapterRes.status };
  }
  return { success: false };
}

export async function getChats(instanceId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('wa_chats')
    .select('*')
    .eq('instance_id', instanceId)
    .order('last_message_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getMessages(chatId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('wa_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// -------------------------------------------------------------
// GET OR CREATE CHAT THREAD
// -------------------------------------------------------------
export async function getOrCreateChat(instanceId, contactNumber, contactName = '') {
  try {
    const supabase = await createClient();
    const cleanNumber = await adapter.formatWhatsAppNumber(contactNumber);
    if (!instanceId || !cleanNumber) {
      return { success: false, error: 'Instance ID and Contact Number are required.' };
    }

    // Check if chat exists
    const { data: existingChat, error: fetchErr } = await supabase
      .from('wa_chats')
      .select('*')
      .eq('instance_id', instanceId)
      .eq('contact_number', cleanNumber)
      .maybeSingle();

    if (fetchErr) {
      console.warn('Error querying wa_chats:', fetchErr.message);
    }

    if (existingChat) {
      // Update contact_name if provided and not previously set
      if (contactName && (!existingChat.contact_name || existingChat.contact_name === cleanNumber)) {
        await supabase.from('wa_chats').update({ contact_name: contactName }).eq('id', existingChat.id);
        existingChat.contact_name = contactName;
      }
      return { success: true, chat: existingChat, isNew: false };
    }

    // Create new chat row
    const { data: newChat, error: insertErr } = await supabase
      .from('wa_chats')
      .insert([{
        instance_id: instanceId,
        contact_number: cleanNumber,
        contact_name: contactName || cleanNumber,
        status: 'OPEN',
        unread_count: 0,
        last_message_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (insertErr) {
      console.error('Error creating wa_chats row:', insertErr);
      return { success: false, error: insertErr.message };
    }

    return { success: true, chat: newChat, isNew: true };
  } catch (err) {
    console.error('getOrCreateChat exception:', err);
    return { success: false, error: err.message };
  }
}

// -------------------------------------------------------------
// START NEW CHAT (From Live Chat UI or Lead Detail)
// -------------------------------------------------------------
export async function startNewChat({ instanceId, contactNumber, contactName = '', initialMessage = '' }) {
  try {
    const cleanNumber = await adapter.formatWhatsAppNumber(contactNumber);
    if (!cleanNumber || cleanNumber.length < 10) {
      return { success: false, error: 'Please enter a valid phone number (at least 10 digits).' };
    }

    const chatRes = await getOrCreateChat(instanceId, cleanNumber, contactName);
    if (!chatRes.success || !chatRes.chat) {
      return chatRes;
    }

    // If an initial message was provided, send it right away
    if (initialMessage && initialMessage.trim()) {
      const sendRes = await sendLiveMessage(instanceId, chatRes.chat.id, initialMessage.trim());
      if (!sendRes.success) {
        return {
          success: true,
          chat: chatRes.chat,
          warning: `Chat thread opened, but message delivery failed: ${sendRes.error}`
        };
      }
    }

    return { success: true, chat: chatRes.chat };
  } catch (err) {
    console.error('startNewChat error:', err);
    return { success: false, error: err.message };
  }
}

export async function sendDirectTestMessage({ instanceId, toNumber, messageText }) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  let targetInstanceKey = instanceId;
  let targetDbInstanceId = null;

  // If instanceId is a UUID from DB, get the instance_key
  if (instanceId && instanceId.includes('-')) {
    targetDbInstanceId = instanceId;
    const { data: inst } = await supabase.from('whatsapp_instances').select('id, instance_key').eq('id', instanceId).single();
    if (inst?.instance_key) {
      targetInstanceKey = inst.instance_key;
    }
  }

  // If no instanceId passed or not UUID, find the first connected or matching instance
  if (!targetInstanceKey || !targetDbInstanceId) {
    const { data: matchedInst } = await supabase
      .from('whatsapp_instances')
      .select('id, instance_key')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (matchedInst) {
      targetDbInstanceId = targetDbInstanceId || matchedInst.id;
      targetInstanceKey = targetInstanceKey || matchedInst.instance_key;
    } else {
      targetInstanceKey = targetInstanceKey || process.env.WHATSAPP_UNOFFICIAL_DEFAULT_INSTANCE || '6AD37D9D501B2';
    }
  }

  const cleanNumber = await adapter.formatWhatsAppNumber(toNumber);
  if (!cleanNumber || cleanNumber.length < 10) {
    return { success: false, error: 'Please enter a valid phone number with country code (e.g. 917261902348).' };
  }

  if (!messageText || !messageText.trim()) {
    return { success: false, error: 'Message text cannot be empty.' };
  }

  // Send via adapter
  const adapterRes = await adapter.sendText(targetInstanceKey, cleanNumber, messageText);
  
  if (!adapterRes.success) {
    return { success: false, error: adapterRes.error };
  }

  let createdChat = null;

  // Ensure chat thread exists in wa_chats so it appears in Live Chat!
  if (targetDbInstanceId) {
    try {
      const chatRes = await getOrCreateChat(targetDbInstanceId, cleanNumber, `WhatsApp Recipient (${cleanNumber})`);
      if (chatRes.success && chatRes.chat) {
        createdChat = chatRes.chat;
        
        // Update last message in wa_chats
        await supabase.from('wa_chats').update({
          last_message: messageText,
          last_message_at: new Date().toISOString(),
          last_message_type: 'TEXT'
        }).eq('id', createdChat.id);

        // Save into wa_messages linked to chat_id
        await supabase.from('wa_messages').insert([{
          chat_id: createdChat.id,
          instance_id: targetDbInstanceId,
          sender_user_id: userData?.user?.id || null,
          direction: 'OUTGOING',
          message_type: 'TEXT',
          message_text: messageText,
          to_number: cleanNumber,
          whatsapp_message_id: adapterRes.messageId,
          status: 'SENT',
          sent_at: new Date().toISOString()
        }]);
      }
    } catch (logErr) {
      console.warn('Notice: Test message sent but could not sync to wa_chats/wa_messages:', logErr.message);
    }
  }

  return {
    success: true,
    messageId: adapterRes.messageId,
    message: `Message dispatched successfully to ${cleanNumber}!`,
    chatId: createdChat?.id,
    cleanNumber,
    data: adapterRes.data
  };
}

export async function sendLiveMessage(instanceId, chatId, text) {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return { success: false, error: 'Unauthorized' };

    const adminDb = getAdminClient();

    // 1. Check permissions using adminDb to avoid RLS recursion on user_roles
    const { data: userRole } = await adminDb
      .from('user_roles')
      .select('role, email, module_access')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    const userEmail = String(userData.user.email || userRole?.email || '').toLowerCase().trim();
    const roleName = String(userRole?.role || '').toLowerCase().trim();
    const isMasterOrAdmin = 
      roleName === 'admin' || 
      roleName === 'masteradmin' || 
      roleName === 'superadmin' || 
      userRole?.module_access?.is_master_admin === true ||
      ['supujacreations@gmail.com', 'admin@newswangroup.com', 'sujitswanmis@gmail.com'].includes(userEmail);

    // 2. Get Chat and Instance Details
    const { data: chat } = await adminDb.from('wa_chats').select('contact_number').eq('id', chatId).maybeSingle();
    const { data: instance } = await adminDb.from('whatsapp_instances').select('id, instance_key, status, owner_user_id').eq('id', instanceId).maybeSingle();

    if (!chat || !instance) return { success: false, error: 'Chat or Instance not found.' };

    const isOwner = instance.owner_user_id === userData.user.id;
    let canReply = isMasterOrAdmin || isOwner;

    if (!canReply) {
      const { data: auth } = await adminDb
        .from('whatsapp_instance_users')
        .select('can_reply')
        .eq('instance_id', instanceId)
        .eq('user_id', userData.user.id)
        .maybeSingle();

      if (auth?.can_reply) {
        canReply = true;
      }
    }

    if (!canReply) {
      return { success: false, error: 'You do not have permission to reply.' };
    }

    // 3. Send via Adapter
    const adapterRes = await adapter.sendText(instance.instance_key, chat.contact_number, text);
    
    if (!adapterRes.success) {
      return { success: false, error: adapterRes.error };
    }

    // 4. Save to DB using adminDb to prevent any RLS friction
    const { data: newMsg, error: insertErr } = await adminDb
      .from('wa_messages')
      .insert([{
        chat_id: chatId,
        instance_id: instanceId,
        sender_user_id: userData.user.id,
        direction: 'OUTGOING',
        message_type: 'TEXT',
        message_text: text,
        to_number: chat.contact_number,
        whatsapp_message_id: adapterRes.messageId,
        status: 'SENT',
        sent_at: new Date().toISOString()
      }])
      .select()
      .single();

    // Update chat last message
    await adminDb.from('wa_chats').update({
      last_message: text,
      last_message_at: new Date().toISOString(),
      last_message_type: 'TEXT'
    }).eq('id', chatId);

    return { success: true, data: newMsg };
  } catch (err) {
    console.error('sendLiveMessage error:', err);
    return { success: false, error: err.message };
  }
}

export async function getInstanceAuths(instanceId) {
  try {
    const adminDb = getAdminClient();
    const { data, error } = await adminDb
      .from('whatsapp_instance_users')
      .select('*, user_roles:user_id(emp_name, email)')
      .eq('instance_id', instanceId);

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function saveInstanceAuth(authData) {
  try {
    const adminDb = getAdminClient();
    const { data, error } = await adminDb
      .from('whatsapp_instance_users')
      .upsert([authData], { onConflict: 'instance_id,user_id' })
      .select();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function removeInstanceAuth(id) {
  try {
    const adminDb = getAdminClient();
    const { error } = await adminDb.from('whatsapp_instance_users').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =========================================================================
// SaaS Tenant Allocation & Custom BSP Management
// =========================================================================

export async function getSaaSTenantsAndAllocations() {
  try {
    const supabase = await createClient();
    const { data: tenants, error: tErr } = await supabase
      .from('tenants')
      .select('id, name, tenant_code, status')
      .order('name', { ascending: true });

    if (tErr) {
      console.error('getSaaSTenantsAndAllocations tErr:', tErr);
      return { success: false, error: tErr.message, tenants: [] };
    }

    const configRes = await getAdminMessageConfig();
    const wa = configRes?.data?.wa_unofficial || {};
    const tenantAllocations = wa.tenant_allocations || {};

    const enrichedTenants = (tenants || []).map(t => {
      const alloc = tenantAllocations[t.id] || {};
      return {
        ...t,
        assigned_provider: alloc.provider || wa.provider || 'aknexus',
        max_scanned_instances: typeof alloc.max_scanned_instances === 'number' ? alloc.max_scanned_instances : (wa.max_scanned_instances || 5),
        instance_id: alloc.instance_id || '',
        api_token: alloc.api_token || alloc.access_token || '',
        phone_id: alloc.phone_id || '',
        server_url: alloc.server_url || '',
        is_allocated_active: alloc.is_active !== false
      };
    });

    return { 
      success: true, 
      tenants: enrichedTenants,
      global_provider: wa.provider || 'aknexus',
      global_max_instances: wa.max_scanned_instances || 5,
      global_instance_id: wa.instance_id || '',
      global_phone_id: wa.phone_id || '',
      custom_providers: wa.custom_providers || []
    };
  } catch (err) {
    console.error('getSaaSTenantsAndAllocations error:', err);
    return { success: false, error: err.message, tenants: [] };
  }
}

export async function saveSaaSTenantAllocation(tenantId, allocationData) {
  try {
    const configRes = await getAdminMessageConfig();
    const wa = configRes?.data?.wa_unofficial || {};
    const tenantAllocations = { ...(wa.tenant_allocations || {}) };

    tenantAllocations[tenantId] = {
      ...(tenantAllocations[tenantId] || {}),
      provider: allocationData.provider || wa.provider || 'aknexus',
      max_scanned_instances: Number(allocationData.max_scanned_instances) || 0,
      instance_id: allocationData.instance_id ? allocationData.instance_id.trim() : '',
      api_token: allocationData.api_token ? allocationData.api_token.trim() : '',
      phone_id: allocationData.phone_id ? allocationData.phone_id.trim() : '',
      server_url: allocationData.server_url ? allocationData.server_url.trim() : '',
      is_active: allocationData.is_active !== false,
      updated_at: new Date().toISOString()
    };

    const res = await saveAdminMessageConfig('wa_unofficial', {
      tenant_allocations: tenantAllocations
    });

    revalidatePath('/');
    return res;
  } catch (err) {
    console.error('saveSaaSTenantAllocation error:', err);
    return { success: false, error: err.message };
  }
}

export async function saveCustomBspProvider(providerData) {
  try {
    const configRes = await getAdminMessageConfig();
    const wa = configRes?.data?.wa_unofficial || {};
    const customProviders = Array.isArray(wa.custom_providers) ? [...wa.custom_providers] : [];

    const existingIdx = customProviders.findIndex(p => p.id === providerData.id);
    if (existingIdx >= 0) {
      customProviders[existingIdx] = { ...customProviders[existingIdx], ...providerData };
    } else {
      customProviders.push(providerData);
    }

    const res = await saveAdminMessageConfig('wa_unofficial', {
      custom_providers: customProviders
    });

    revalidatePath('/');
    return { success: true, customProviders };
  } catch (err) {
    console.error('saveCustomBspProvider error:', err);
    return { success: false, error: err.message };
  }
}

// =========================================================================
// 🏢 Tenant Self-Service (BYOK - Bring Your Own Key) Gateway Actions
// =========================================================================

export async function getMyTenantGatewayConfig(requestedTenantId = null) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { success: false, error: 'Unauthorized: Please sign in.' };
    }

    const adminDb = getAdminClient();
    const { data: userRoleRow } = await adminDb
      .from('user_roles')
      .select('role, company, tenant_id, module_access')
      .eq('user_id', user.id)
      .maybeSingle();

    const emailLower = (user.email || '').toLowerCase().trim();
    const isMasterAdmin = 
      emailLower === 'supujacreations@gmail.com' ||
      emailLower === 'sujitswanmis@gmail.com' ||
      userRoleRow?.role?.toLowerCase() === 'masteradmin' ||
      userRoleRow?.module_access?.is_master_admin === true;

    // Resolve effective tenant ID
    const effectiveTenantId = requestedTenantId || userRoleRow?.tenant_id || userRoleRow?.module_access?._tenantId || null;

    let tenantDetails = null;
    if (effectiveTenantId) {
      const { data: tData } = await adminDb
        .from('tenants')
        .select('id, name, tenant_code, status')
        .eq('id', effectiveTenantId)
        .maybeSingle();
      tenantDetails = tData;
    }

    const configRes = await getAdminMessageConfig();
    const wa = configRes?.data?.wa_unofficial || {};
    const tenantAllocations = wa.tenant_allocations || {};
    const alloc = effectiveTenantId ? tenantAllocations[effectiveTenantId] : null;

    const hasCustomConfig = !!(alloc && (alloc.api_token || alloc.instance_id || alloc.server_url));
    const useCustom = alloc ? (alloc.use_custom !== false && hasCustomConfig) : false;

    return {
      success: true,
      isMasterAdmin,
      tenantId: effectiveTenantId,
      tenant: tenantDetails || (effectiveTenantId ? { id: effectiveTenantId, name: userRoleRow?.company || 'My Organization' } : null),
      hasCustomConfig,
      use_custom: useCustom,
      config: {
        provider: alloc?.provider || wa.provider || 'wasender',
        api_token: alloc?.api_token || '',
        instance_id: alloc?.instance_id || '',
        phone_id: alloc?.phone_id || '',
        server_url: alloc?.server_url || '',
        max_scanned_instances: typeof alloc?.max_scanned_instances === 'number' ? alloc.max_scanned_instances : (wa.max_scanned_instances || 5),
        is_active: alloc?.is_active !== false
      },
      globalDefaults: {
        provider: wa.provider || 'wasender',
        server_url: wa.server_url || 'https://wasenderapi.com/api',
        max_scanned_instances: wa.max_scanned_instances || 5,
        has_global_token: !!wa.api_token
      },
      custom_providers: wa.custom_providers || []
    };
  } catch (err) {
    console.error('getMyTenantGatewayConfig error:', err);
    return { success: false, error: err.message };
  }
}

export async function saveMyTenantGatewayConfig(payload) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { success: false, error: 'Unauthorized: Please sign in.' };
    }

    const adminDb = getAdminClient();
    const { data: userRoleRow } = await adminDb
      .from('user_roles')
      .select('role, company, tenant_id, module_access')
      .eq('user_id', user.id)
      .maybeSingle();

    const emailLower = (user.email || '').toLowerCase().trim();
    const isMasterAdmin = 
      emailLower === 'supujacreations@gmail.com' ||
      emailLower === 'sujitswanmis@gmail.com' ||
      userRoleRow?.role?.toLowerCase() === 'masteradmin' ||
      userRoleRow?.module_access?.is_master_admin === true;

    const isTenantAdmin = ['admin', 'superadmin', 'manager'].includes(userRoleRow?.role?.toLowerCase());

    if (!isMasterAdmin && !isTenantAdmin) {
      return { success: false, error: 'Permission denied: Only Organization Admins can manage Gateway credentials.' };
    }

    const effectiveTenantId = payload.tenantId || userRoleRow?.tenant_id || userRoleRow?.module_access?._tenantId;
    if (!effectiveTenantId) {
      return { success: false, error: 'No workspace or tenant ID associated with your account.' };
    }

    // Security check: non-master admins can only update their own tenant
    if (!isMasterAdmin) {
      const userTenant = userRoleRow?.tenant_id || userRoleRow?.module_access?._tenantId;
      if (userTenant && userTenant !== effectiveTenantId) {
        return { success: false, error: "Forbidden: You cannot modify another organization's settings." };
      }
    }

    const configRes = await getAdminMessageConfig();
    const wa = configRes?.data?.wa_unofficial || {};
    const tenantAllocations = { ...(wa.tenant_allocations || {}) };

    const useCustom = payload.use_custom === true;

    tenantAllocations[effectiveTenantId] = {
      ...(tenantAllocations[effectiveTenantId] || {}),
      provider: payload.provider || (useCustom ? 'wasender' : wa.provider || 'wasender'),
      api_token: useCustom && payload.api_token ? payload.api_token.trim() : '',
      instance_id: useCustom && payload.instance_id ? payload.instance_id.trim() : '',
      phone_id: useCustom && payload.phone_id ? payload.phone_id.trim() : '',
      server_url: useCustom && payload.server_url ? payload.server_url.trim() : '',
      max_scanned_instances: typeof payload.max_scanned_instances === 'number' ? payload.max_scanned_instances : 5,
      is_active: payload.is_active !== false,
      use_custom: useCustom,
      updated_at: new Date().toISOString()
    };

    const res = await saveAdminMessageConfig('wa_unofficial', {
      tenant_allocations: tenantAllocations
    });

    revalidatePath('/');
    return res;
  } catch (err) {
    console.error('saveMyTenantGatewayConfig error:', err);
    return { success: false, error: err.message };
  }
}

export async function testTenantGatewayChannel({ tenantId = null, config = {}, recipientNumber }) {
  try {
    if (!recipientNumber) {
      return { success: false, error: 'Recipient mobile number is required.' };
    }

    const cleanNum = await adapter.formatWhatsAppNumber(recipientNumber);
    const timeIst = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'short',
      timeStyle: 'medium'
    }).format(new Date());

    const text = `SuPuja Swan CRM Gateway Test: Your custom WhatsApp BSP credentials (${config.provider || 'Wasender'}) are configured and operational! Time (IST): ${timeIst}`;

    const overrideConfig = {
      baseUrl: (config.server_url || (config.provider === 'wasender' ? 'https://wasenderapi.com/api' : 'https://app.aknexus.in/api')).replace(/\/+$/, ''),
      token: (config.api_token || '').trim(),
      defaultInst: (config.instance_id || '').trim(),
      phoneId: (config.phone_id || '').trim(),
      provider: config.provider || 'wasender'
    };

    const targetInst = overrideConfig.defaultInst || 'test_instance';
    const sendRes = await adapter.sendText(targetInst, cleanNum, text, tenantId, overrideConfig);

    return sendRes;
  } catch (err) {
    console.error('testTenantGatewayChannel error:', err);
    return { success: false, error: err.message };
  }
}

// =========================================================================
// Universal Incoming Simulation & Webhook Registration
// =========================================================================

export async function simulateIncomingCustomerMessage({ instanceId, contactNumber, messageText, contactName = '' }) {
  try {
    const adminDb = getAdminClient();
    
    // Resolve instance
    let targetInstance = null;
    if (instanceId) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(instanceId);
      let instQuery = adminDb
        .from('whatsapp_instances')
        .select('id, instance_key, instance_name, status');
      if (isUUID) {
        instQuery = instQuery.or(`id.eq.${instanceId},instance_key.eq.${instanceId}`);
      } else {
        instQuery = instQuery.eq('instance_key', instanceId);
      }
      const { data: inst } = await instQuery.maybeSingle();
      targetInstance = inst;
    }
    if (!targetInstance) {
      const { data: fallback } = await adminDb
        .from('whatsapp_instances')
        .select('id, instance_key, instance_name, status')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      targetInstance = fallback;
    }
    if (!targetInstance) {
      return { success: false, error: 'No WhatsApp instance found to receive message.' };
    }

    const cleanNumber = await adapter.formatWhatsAppNumber(contactNumber);
    if (!cleanNumber || cleanNumber.length < 10) {
      return { success: false, error: 'Valid phone number required (e.g. 919876543210).' };
    }

    const text = (messageText || 'Hello from customer!').trim();
    const nowIso = new Date().toISOString();

    // Find or create chat
    let { data: chat } = await adminDb
      .from('wa_chats')
      .select('id, contact_name, unread_count')
      .eq('instance_id', targetInstance.id)
      .eq('contact_number', cleanNumber)
      .maybeSingle();

    if (!chat) {
      const { data: newChat, error: chatErr } = await adminDb
        .from('wa_chats')
        .insert([{
          instance_id: targetInstance.id,
          contact_number: cleanNumber,
          contact_name: contactName || cleanNumber,
          last_message: text,
          last_message_type: 'TEXT',
          last_message_at: nowIso,
          unread_count: 1,
          status: 'OPEN'
        }])
        .select()
        .single();

      if (chatErr) return { success: false, error: chatErr.message };
      chat = newChat;
    } else {
      const nextUnread = (chat.unread_count || 0) + 1;
      const updateData = {
        last_message: text,
        last_message_type: 'TEXT',
        last_message_at: nowIso,
        unread_count: nextUnread
      };
      if (contactName && (!chat.contact_name || chat.contact_name === cleanNumber)) {
        updateData.contact_name = contactName;
      }
      await adminDb.from('wa_chats').update(updateData).eq('id', chat.id);
    }

    // Insert incoming message
    const msgId = `sim_in_${Date.now()}`;
    const { data: newMsg, error: msgErr } = await adminDb
      .from('wa_messages')
      .insert([{
        chat_id: chat.id,
        instance_id: targetInstance.id,
        whatsapp_message_id: msgId,
        direction: 'INCOMING',
        message_type: 'TEXT',
        message_text: text,
        from_number: cleanNumber,
        to_number: 'system',
        status: 'RECEIVED',
        received_at: nowIso
      }])
      .select()
      .single();

    if (msgErr) return { success: false, error: msgErr.message };

    return {
      success: true,
      message: 'Simulated customer message received successfully!',
      data: newMsg,
      chat
    };
  } catch (err) {
    console.error('simulateIncomingCustomerMessage error:', err);
    return { success: false, error: err.message };
  }
}

export async function registerInstanceWebhook(instanceId, webhookUrl) {
  try {
    const adminDb = getAdminClient();
    let targetKey = instanceId;

    if (instanceId && instanceId.includes('-')) {
      const { data: inst } = await adminDb
        .from('whatsapp_instances')
        .select('instance_key')
        .eq('id', instanceId)
        .maybeSingle();
      if (inst?.instance_key) targetKey = inst.instance_key;
    }

    const res = await adapter.setWebhook(targetKey, webhookUrl);
    return res;
  } catch (err) {
    console.error('registerInstanceWebhook error:', err);
    return { success: false, error: err.message };
  }
}


