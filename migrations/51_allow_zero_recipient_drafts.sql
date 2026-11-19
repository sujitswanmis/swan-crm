-- Migration 51: Relax recipient count check to allow drafts with 0 or more recipients
ALTER TABLE public.crm_broadcasts DROP CONSTRAINT IF EXISTS crm_broadcasts_recipient_count_check;
ALTER TABLE public.crm_broadcasts ADD CONSTRAINT crm_broadcasts_recipient_count_check CHECK (recipient_count >= 0);
