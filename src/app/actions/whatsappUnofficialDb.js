'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import * as adapter from './whatsappUnofficialAdapter';
import { getAdminMessageConfig } from './adminMessageConfig';

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
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .insert([{
      owner_user_id: userData.user.id,
      instance_name: instanceName || `WhatsApp Instance ${Date.now()}`,
      instance_key: adapterRes.instanceKey,
      status: 'QR_REQUIRED'
    }])
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

  // 3. Update DB with new QR and status
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .update({ 
      qr_code: adapterRes.qrCode, 
      status: 'QR_PENDING'
    })
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

export async function sendDirectTestMessage({ instanceId, toNumber, messageText }) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  let targetInstanceKey = instanceId;

  // If instanceId is a UUID from DB, get the instance_key
  if (instanceId && instanceId.includes('-')) {
    const { data: inst } = await supabase.from('whatsapp_instances').select('instance_key').eq('id', instanceId).single();
    if (inst?.instance_key) {
      targetInstanceKey = inst.instance_key;
    }
  }

  // If no instanceId passed, use the first connected instance or default config
  if (!targetInstanceKey) {
    const { data: firstInst } = await supabase.from('whatsapp_instances').select('id, instance_key').limit(1).single();
    targetInstanceKey = firstInst?.instance_key || process.env.WHATSAPP_UNOFFICIAL_DEFAULT_INSTANCE || '6AD37D9D501B2';
  }

  const cleanNumber = String(toNumber).replace(/[^0-9]/g, '');
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

  // Try logging to wa_messages if DB schema permits
  try {
    await supabase.from('wa_messages').insert([{
      instance_id: instanceId && instanceId.includes('-') ? instanceId : null,
      sender_user_id: userData?.user?.id || null,
      direction: 'OUTGOING',
      message_type: 'TEXT',
      message_text: messageText,
      to_number: cleanNumber,
      whatsapp_message_id: adapterRes.messageId,
      status: 'SENT',
      sent_at: new Date().toISOString()
    }]);
  } catch (logErr) {
    console.warn('Notice: Test message sent but could not save to wa_messages:', logErr.message);
  }

  return {
    success: true,
    messageId: adapterRes.messageId,
    message: `Message dispatched successfully to ${cleanNumber}!`,
    data: adapterRes.data
  };
}

export async function sendLiveMessage(instanceId, chatId, text) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return { success: false, error: 'Unauthorized' };

  // 1. Check permissions
  const { data: auth } = await supabase
    .from('whatsapp_instance_users')
    .select('can_reply')
    .eq('instance_id', instanceId)
    .eq('user_id', userData.user.id)
    .single();

  const { data: userRole } = await supabase.from('user_roles').select('role').eq('user_id', userData.user.id).single();
  if (userRole?.role !== 'admin' && (!auth || !auth.can_reply)) {
    return { success: false, error: 'You do not have permission to reply.' };
  }

  // 2. Get Chat and Instance Details
  const { data: chat } = await supabase.from('wa_chats').select('contact_number').eq('id', chatId).single();
  const { data: instance } = await supabase.from('whatsapp_instances').select('instance_key, status').eq('id', instanceId).single();

  if (!chat || !instance) return { success: false, error: 'Chat or Instance not found.' };

  // 3. Send via Adapter
  const adapterRes = await adapter.sendText(instance.instance_key, chat.contact_number, text);
  
  if (!adapterRes.success) {
    return { success: false, error: adapterRes.error };
  }

  // 4. Save to DB
  const { data: newMsg, error: insertErr } = await supabase
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
  await supabase.from('wa_chats').update({
    last_message: text,
    last_message_at: new Date().toISOString(),
    last_message_type: 'TEXT'
  }).eq('id', chatId);

  return { success: true, data: newMsg };
}

export async function getInstanceAuths(instanceId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('whatsapp_instance_users')
    .select('*, user_roles:user_id(emp_name, email)')
    .eq('instance_id', instanceId);

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function saveInstanceAuth(authData) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('whatsapp_instance_users')
    .upsert([authData], { onConflict: 'instance_id,user_id' })
    .select();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function removeInstanceAuth(id) {
  const supabase = await createClient();
  const { error } = await supabase.from('whatsapp_instance_users').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
