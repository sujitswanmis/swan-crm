import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// We need a Service Role client to bypass RLS in the webhook
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request) {
  try {
    const payload = await request.json();
    
    // Example Payload format from external engine:
    // { event: 'message_received', instanceKey: '...', message: { from: '91987654321', text: 'Hello', id: 'msg_123' } }
    // { event: 'status_update', instanceKey: '...', status: 'CONNECTED' }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Supabase credentials missing on server' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { event, instanceKey } = payload;

    if (!instanceKey) {
      return NextResponse.json({ error: 'instanceKey missing' }, { status: 400 });
    }

    // 1. Find the instance_id
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id, status')
      .eq('instance_key', instanceKey)
      .single();

    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    // 2. Handle Status Update
    if (event === 'status_update' && payload.status) {
      await supabase
        .from('whatsapp_instances')
        .update({ status: payload.status, last_connected_at: payload.status === 'CONNECTED' ? new Date().toISOString() : undefined })
        .eq('id', instance.id);
        
      return NextResponse.json({ success: true });
    }

    // 3. Handle Incoming Message
    if (event === 'message_received' && payload.message) {
      const msg = payload.message;
      const contactNumber = msg.from;

      // Find or create chat
      let { data: chat } = await supabase
        .from('wa_chats')
        .select('id')
        .eq('instance_id', instance.id)
        .eq('contact_number', contactNumber)
        .single();

      if (!chat) {
        const { data: newChat } = await supabase
          .from('wa_chats')
          .insert([{
            instance_id: instance.id,
            contact_number: contactNumber,
            last_message: msg.text || 'Media Message',
            last_message_at: new Date().toISOString(),
            unread_count: 1
          }])
          .select('id')
          .single();
        chat = newChat;
      } else {
        // Update existing chat
        await supabase.rpc('increment_unread', { chat_id_param: chat.id });
        await supabase
          .from('wa_chats')
          .update({
            last_message: msg.text || 'Media Message',
            last_message_at: new Date().toISOString()
          })
          .eq('id', chat.id);
      }

      // Insert message
      await supabase
        .from('wa_messages')
        .insert([{
          chat_id: chat.id,
          instance_id: instance.id,
          whatsapp_message_id: msg.id,
          direction: 'INCOMING',
          message_type: msg.type || 'TEXT',
          message_text: msg.text,
          media_url: msg.mediaUrl,
          from_number: contactNumber,
          to_number: 'system',
          status: 'RECEIVED',
          received_at: new Date().toISOString()
        }]);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true, message: 'Event ignored' });
  } catch (error) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
