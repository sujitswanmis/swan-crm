import { NextResponse } from 'next/server';
import { getAdminClient } from '@/utils/supabase/adminClient';

// Helper to format 10-digit Indian numbers with 91 prefix
function formatContactNumber(phone) {
  let clean = String(phone || '').replace(/[^0-9]/g, '');
  if (clean.length === 10 && /^[6-9]/.test(clean)) {
    clean = `91${clean}`;
  }
  return clean;
}

// Universal parser for incoming webhook payloads
function parseWebhookPayload(payload) {
  // 1. Identify Instance Key / ID
  const instanceKey = 
    payload.instance_id ||
    payload.instanceId ||
    payload.instanceKey ||
    payload.instance ||
    payload.data?.instance_id ||
    payload.data?.instanceKey ||
    payload.data?.instance ||
    null;

  // 2. Event name
  const event = payload.event || payload.event_type || payload.type || 'message_received';

  // 3. Sender information & fromMe flag
  const fromMe = Boolean(
    payload.data?.key?.fromMe ??
    payload.fromMe ??
    payload.message?.fromMe ??
    payload.data?.fromMe ??
    false
  );

  // Raw sender string (e.g. "916283362279@s.whatsapp.net" or "916283362279@c.us" or "916283362279")
  const rawSender = 
    payload.data?.key?.remoteJid ||
    payload.contactNumber ||
    payload.message?.from ||
    payload.data?.from ||
    payload.from ||
    payload.sender ||
    payload.data?.key?.participant ||
    '';

  // Check if it's a broadcast or status or group
  const isGroup = rawSender.includes('@g.us');
  const isStatus = rawSender.includes('status') || rawSender.includes('broadcast');

  const cleanNumber = formatContactNumber(rawSender.replace(/@.*$/, ''));

  // Contact name
  const pushName = 
    payload.contactName ||
    payload.data?.pushName ||
    payload.pushName ||
    payload.data?.verifiedBizName ||
    payload.data?.name ||
    payload.message?.name ||
    '';

  // 4. Message Content (Text & Media)
  const messageObj = payload.data?.message || payload.message || {};
  const text = (
    payload.messageText ||
    messageObj.conversation ||
    messageObj.extendedTextMessage?.text ||
    messageObj.imageMessage?.caption ||
    messageObj.videoMessage?.caption ||
    messageObj.documentMessage?.title ||
    messageObj.buttonsResponseMessage?.selectedDisplayText ||
    messageObj.templateButtonReplyMessage?.selectedDisplayText ||
    messageObj.listResponseMessage?.title ||
    payload.data?.body ||
    payload.data?.text ||
    payload.message?.text ||
    payload.message?.body ||
    payload.text ||
    ''
  ).trim();

  // Media
  const mediaUrl = 
    payload.mediaUrl ||
    messageObj.imageMessage?.url ||
    messageObj.videoMessage?.url ||
    messageObj.documentMessage?.url ||
    messageObj.audioMessage?.url ||
    payload.data?.mediaUrl ||
    null;

  let messageType = 'TEXT';
  if (messageObj.imageMessage || payload.messageType === 'IMAGE') messageType = 'IMAGE';
  else if (messageObj.videoMessage || payload.messageType === 'VIDEO') messageType = 'VIDEO';
  else if (messageObj.documentMessage || payload.messageType === 'DOCUMENT') messageType = 'DOCUMENT';
  else if (messageObj.audioMessage || payload.messageType === 'AUDIO') messageType = 'AUDIO';
  else if (payload.messageType) messageType = String(payload.messageType).toUpperCase();

  // WhatsApp Message ID
  const messageId = 
    payload.data?.key?.id ||
    messageObj.id ||
    payload.message?.id ||
    payload.data?.id ||
    payload.id ||
    `msg_in_${Date.now()}`;

  return {
    instanceKey,
    event,
    fromMe,
    isGroup,
    isStatus,
    cleanNumber,
    contactName: pushName || cleanNumber,
    text,
    mediaUrl,
    messageType,
    messageId,
    status: payload.status || (payload.data?.state === 'open' ? 'CONNECTED' : payload.data?.state === 'close' ? 'DISCONNECTED' : null)
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const challenge = searchParams.get('hub.challenge') || searchParams.get('challenge');
    if (challenge) {
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return NextResponse.json({
      status: 'active',
      service: 'Swan CRM WhatsApp Universal Webhook',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or missing JSON payload' }, { status: 400 });
    }

    const adminDb = getAdminClient();
    const parsed = parseWebhookPayload(payload);

    // 1. Resolve Target Instance from DB
    let instance = null;
    if (parsed.instanceKey) {
      const { data: matched } = await adminDb
        .from('whatsapp_instances')
        .select('id, instance_key, instance_name, status')
        .or(`instance_key.eq.${parsed.instanceKey},id.eq.${parsed.instanceKey}`)
        .maybeSingle();
      instance = matched;
    }

    // Fallback: If instanceKey was not provided or matched, pick the active connected instance
    if (!instance) {
      const { data: fallback } = await adminDb
        .from('whatsapp_instances')
        .select('id, instance_key, instance_name, status')
        .eq('status', 'CONNECTED')
        .order('last_connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      instance = fallback;
    }

    // If still no instance exists in DB, return 404
    if (!instance) {
      return NextResponse.json({ 
        error: 'WhatsApp instance not found for webhook dispatch', 
        receivedKey: parsed.instanceKey 
      }, { status: 404 });
    }

    const nowIso = new Date().toISOString();

    // 2. Handle Connection / Status Updates
    if (parsed.event === 'status_update' || parsed.event === 'connection.update' || (parsed.status && !parsed.text && !parsed.cleanNumber)) {
      if (parsed.status) {
        await adminDb
          .from('whatsapp_instances')
          .update({
            status: parsed.status,
            last_connected_at: parsed.status === 'CONNECTED' ? nowIso : undefined,
            updated_at: nowIso
          })
          .eq('id', instance.id);

        return NextResponse.json({ success: true, event: 'status_updated', status: parsed.status });
      }
    }

    // 3. Skip Outgoing self-messages from our phone or broadcast stories
    if (parsed.fromMe) {
      return NextResponse.json({ success: true, message: 'Self-sent message ignored to prevent echo' });
    }

    if (parsed.isStatus) {
      return NextResponse.json({ success: true, message: 'Status broadcast update ignored' });
    }

    // Ensure we have a valid contact phone number
    if (!parsed.cleanNumber || parsed.cleanNumber.length < 10) {
      return NextResponse.json({ 
        success: true, 
        message: 'Non-message event or missing contact phone number' 
      });
    }

    // 4. Find or Create Chat in wa_chats
    let { data: chat } = await adminDb
      .from('wa_chats')
      .select('id, contact_name, unread_count')
      .eq('instance_id', instance.id)
      .eq('contact_number', parsed.cleanNumber)
      .maybeSingle();

    const snippet = parsed.text || (parsed.mediaUrl ? `[${parsed.messageType}]` : 'Incoming Message');

    if (!chat) {
      const { data: newChat, error: chatErr } = await adminDb
        .from('wa_chats')
        .insert([{
          instance_id: instance.id,
          contact_number: parsed.cleanNumber,
          contact_name: parsed.contactName || parsed.cleanNumber,
          last_message: snippet,
          last_message_type: parsed.messageType,
          last_message_at: nowIso,
          unread_count: 1,
          status: 'OPEN'
        }])
        .select('id, contact_name, unread_count')
        .single();

      if (chatErr) {
        console.error('Webhook wa_chats insert error:', chatErr);
        return NextResponse.json({ error: chatErr.message }, { status: 500 });
      }
      chat = newChat;
    } else {
      // Increment unread count and update last message
      const nextUnread = (chat.unread_count || 0) + 1;
      const updateData = {
        last_message: snippet,
        last_message_type: parsed.messageType,
        last_message_at: nowIso,
        unread_count: nextUnread
      };

      if (parsed.contactName && (!chat.contact_name || chat.contact_name === parsed.cleanNumber)) {
        updateData.contact_name = parsed.contactName;
      }

      await adminDb
        .from('wa_chats')
        .update(updateData)
        .eq('id', chat.id);
    }

    // 5. Insert Message into wa_messages
    const { data: newMsg, error: msgErr } = await adminDb
      .from('wa_messages')
      .insert([{
        chat_id: chat.id,
        instance_id: instance.id,
        whatsapp_message_id: parsed.messageId,
        direction: 'INCOMING',
        message_type: parsed.messageType,
        message_text: parsed.text || '',
        media_url: parsed.mediaUrl,
        from_number: parsed.cleanNumber,
        to_number: 'system',
        status: 'RECEIVED',
        received_at: nowIso
      }])
      .select()
      .single();

    if (msgErr) {
      console.error('Webhook wa_messages insert error:', msgErr);
      return NextResponse.json({ error: msgErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      messageId: newMsg.id,
      chatId: chat.id,
      contactNumber: parsed.cleanNumber
    });
  } catch (error) {
    console.error('Webhook Execution Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
