'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import * as adapter from './whatsappUnofficialAdapter';

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

  // 1. Get instance_key from WA engine
  const adapterRes = await adapter.createInstance(instanceName);
  if (!adapterRes.success) {
    return adapterRes;
  }

  // 2. Save in DB
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .insert([{
      owner_user_id: userData.user.id,
      instance_name: instanceName,
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
    .select('instance_key, status')
    .eq('id', instanceId)
    .single();

  if (fetchErr || !instance) {
    return { success: false, error: 'Instance not found' };
  }

  // 2. Request new QR from Engine
  const adapterRes = await adapter.regenerateQr(instance.instance_key);
  if (!adapterRes.success) {
    return adapterRes;
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

export async function logoutInstance(instanceId) {
  const supabase = await createClient();
  
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('instance_key')
    .eq('id', instanceId)
    .single();

  if (!instance) return { success: false, error: 'Instance not found' };

  await adapter.logout(instance.instance_key);

  const { data, error } = await supabase
    .from('whatsapp_instances')
    .update({ status: 'LOGGED_OUT', qr_code: null, last_logout_at: new Date().toISOString() })
    .eq('id', instanceId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  
  revalidatePath('/');
  return { success: true, data };
}

export async function syncInstanceStatus(instanceId) {
  const supabase = await createClient();
  const { data: instance } = await supabase.from('whatsapp_instances').select('instance_key').eq('id', instanceId).single();
  
  if (!instance) return { success: false };

  const adapterRes = await adapter.getStatus(instance.instance_key);
  if (adapterRes.success && adapterRes.status) {
    await supabase.from('whatsapp_instances').update({ status: adapterRes.status }).eq('id', instanceId);
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
    .limit(50); // limit for performance

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function sendLiveMessage(instanceId, chatId, text) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return { success: false, error: 'Unauthorized' };

  // 1. Check permissions
  const { data: auth, error: authErr } = await supabase
    .from('whatsapp_instance_users')
    .select('can_reply')
    .eq('instance_id', instanceId)
    .eq('user_id', userData.user.id)
    .single();

  // If user is not admin and has no reply permission
  const { data: userRole } = await supabase.from('user_roles').select('role').eq('user_id', userData.user.id).single();
  if (userRole?.role !== 'admin' && (!auth || !auth.can_reply)) {
    return { success: false, error: 'You do not have permission to reply.' };
  }

  // 2. Get Chat and Instance Details
  const { data: chat } = await supabase.from('wa_chats').select('contact_number').eq('id', chatId).single();
  const { data: instance } = await supabase.from('whatsapp_instances').select('instance_key, status').eq('id', instanceId).single();

  if (!chat || !instance) return { success: false, error: 'Chat or Instance not found.' };
  
  if (instance.status !== 'CONNECTED') {
    return { success: false, status: 'QR_REQUIRED', message: 'WhatsApp account is logged out. Please scan QR again.', instance_id: instanceId };
  }

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
