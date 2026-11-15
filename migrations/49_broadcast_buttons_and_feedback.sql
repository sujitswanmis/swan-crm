-- Migration 49: Additive Interactive Action Buttons, User Feedback & Snooze/Reminder Support
-- Safe additive changes for broadcast notifications

ALTER TABLE public.crm_broadcasts
ADD COLUMN IF NOT EXISTS action_buttons jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS allow_feedback boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_reminder boolean DEFAULT true;

ALTER TABLE public.crm_broadcast_recipients
ADD COLUMN IF NOT EXISTS action_id text,
ADD COLUMN IF NOT EXISTS action_label text,
ADD COLUMN IF NOT EXISTS feedback_text text,
ADD COLUMN IF NOT EXISTS responded_at timestamptz,
ADD COLUMN IF NOT EXISTS reminded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_response ON public.crm_broadcast_recipients(broadcast_id, action_id);
