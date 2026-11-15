-- Migration 50: Enterprise Broadcast Notifications Upgrade
-- Complete additive schema for broadcast status, multi-attribute targeting, drafts, scheduling, test dispatches, query workflows, and delivery lifecycle

BEGIN;
SET LOCAL timezone = 'Asia/Kolkata';

-- 1. Ensure all additive columns exist on crm_broadcasts
ALTER TABLE public.crm_broadcasts
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS notification_type text NOT NULL DEFAULT 'information',
ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
ADD COLUMN IF NOT EXISTS close_behaviour text NOT NULL DEFAULT 'auto_keep_unread',
ADD COLUMN IF NOT EXISTS department_filter jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS role_filter jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS employee_filter jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS feedback_replies jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS action_buttons jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS allow_feedback boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_reminder boolean DEFAULT true;

-- 2. Ensure all additive columns exist on crm_broadcast_recipients
ALTER TABLE public.crm_broadcast_recipients
ADD COLUMN IF NOT EXISTS emp_id text,
ADD COLUMN IF NOT EXISTS department text,
ADD COLUMN IF NOT EXISTS role text,
ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
ADD COLUMN IF NOT EXISTS query_status text NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS admin_reply text,
ADD COLUMN IF NOT EXISTS admin_replied_at timestamptz,
ADD COLUMN IF NOT EXISTS action_id text,
ADD COLUMN IF NOT EXISTS action_label text,
ADD COLUMN IF NOT EXISTS feedback_text text,
ADD COLUMN IF NOT EXISTS responded_at timestamptz,
ADD COLUMN IF NOT EXISTS reminded_at timestamptz;

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_crm_broadcasts_status ON public.crm_broadcasts(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_crm_broadcasts_type_status ON public.crm_broadcasts(notification_type, status);
CREATE INDEX IF NOT EXISTS idx_crm_broadcasts_scheduled ON public.crm_broadcasts(scheduled_at) WHERE is_draft = false;
CREATE INDEX IF NOT EXISTS idx_crm_broadcast_recipients_query_status ON public.crm_broadcast_recipients(broadcast_id, query_status);
CREATE INDEX IF NOT EXISTS idx_crm_broadcast_recipients_viewed ON public.crm_broadcast_recipients(user_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_response ON public.crm_broadcast_recipients(broadcast_id, action_id);

COMMIT;
