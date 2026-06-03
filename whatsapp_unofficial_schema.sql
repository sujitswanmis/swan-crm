-- WhatsApp UnOfficial Module Schema
-- Run this in your Supabase SQL Editor

-- 1. whatsapp_instances
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  instance_name text NOT NULL,
  instance_key text UNIQUE NOT NULL,
  phone_number text,
  qr_code text,
  status text DEFAULT 'QR_PENDING',
  last_connected_at timestamp with time zone,
  last_logout_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 2. whatsapp_instance_users
CREATE TABLE IF NOT EXISTS whatsapp_instance_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text DEFAULT 'agent',
  can_view_chat boolean DEFAULT true,
  can_reply boolean DEFAULT false,
  can_send_media boolean DEFAULT false,
  can_create_campaign boolean DEFAULT false,
  can_view_logs boolean DEFAULT false,
  status text DEFAULT 'ACTIVE',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(instance_id, user_id)
);

-- 3. wa_chats
CREATE TABLE IF NOT EXISTS wa_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  contact_number text NOT NULL,
  contact_name text,
  profile_pic_url text,
  last_message text,
  last_message_type text,
  last_message_at timestamp with time zone,
  unread_count integer DEFAULT 0,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text DEFAULT 'OPEN',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(instance_id, contact_number)
);

-- 4. wa_messages
CREATE TABLE IF NOT EXISTS wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid REFERENCES wa_chats(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  whatsapp_message_id text,
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('INCOMING', 'OUTGOING')),
  message_type text DEFAULT 'TEXT',
  message_text text,
  media_url text,
  media_mime_type text,
  from_number text,
  to_number text,
  status text DEFAULT 'PENDING',
  error_message text,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  read_at timestamp with time zone,
  received_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- 5. whatsapp_message_logs
CREATE TABLE IF NOT EXISTS whatsapp_message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES wa_chats(id) ON DELETE SET NULL,
  message_id uuid REFERENCES wa_messages(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  request_payload jsonb,
  response_payload jsonb,
  status text,
  error_message text,
  created_at timestamp with time zone DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wa_chats_instance_id ON wa_chats(instance_id);
CREATE INDEX IF NOT EXISTS idx_wa_chats_last_message_at ON wa_chats(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_chat_id ON wa_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_instance_id ON wa_messages(instance_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instance_users_user_id ON whatsapp_instance_users(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instance_users_instance_id ON whatsapp_instance_users(instance_id);

-- RLS (Row Level Security) Configuration
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_instance_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_message_logs ENABLE ROW LEVEL SECURITY;

-- Disable RLS strictly for now, or just allow all authenticated since filtering happens in backend API
-- If you want strict RLS, uncomment and modify below:
CREATE POLICY "Allow full access to authenticated users for WA instances" ON whatsapp_instances FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow full access to authenticated users for WA users" ON whatsapp_instance_users FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow full access to authenticated users for WA chats" ON wa_chats FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow full access to authenticated users for WA messages" ON wa_messages FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow full access to authenticated users for WA logs" ON whatsapp_message_logs FOR ALL TO authenticated USING (true);

-- Functions and Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_whatsapp_instances_updated_at
BEFORE UPDATE ON whatsapp_instances
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_whatsapp_instance_users_updated_at
BEFORE UPDATE ON whatsapp_instance_users
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_wa_chats_updated_at
BEFORE UPDATE ON wa_chats
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Function to increment unread count securely
CREATE OR REPLACE FUNCTION increment_unread(chat_id_param uuid)
RETURNS void AS $$
BEGIN
  UPDATE wa_chats 
  SET unread_count = unread_count + 1 
  WHERE id = chat_id_param;
END;
$$ LANGUAGE plpgsql;
