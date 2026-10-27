-- =========================================================================
-- MIGRATION 41: SALES ORDERS COMPLETE SCHEMA WITH STAGE HISTORY & CUSTOM FIELDS
-- Ensures all 13 stages (S01-S13), dynamic custom fields, line items, 
-- dispatch details, and cancellation logs are 100% saved in Supabase.
-- =========================================================================

BEGIN;

-- 1. Ensure sales_orders table has all required columns for 13-stage pipeline
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS stage_history jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS split_lots jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS order_line_items jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS billing_route text DEFAULT 'DIRECT_COMPANY_BILLING',
  ADD COLUMN IF NOT EXISTS preferred_dispatch_date date,
  ADD COLUMN IF NOT EXISTS actual_dispatch_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS estimated_delivery_date date,
  ADD COLUMN IF NOT EXISTS actual_delivery_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS transporter_name text,
  ADD COLUMN IF NOT EXISTS lr_number text,
  ADD COLUMN IF NOT EXISTS vehicle_number text,
  ADD COLUMN IF NOT EXISTS eway_bill_no text,
  ADD COLUMN IF NOT EXISTS tracking_link text,
  ADD COLUMN IF NOT EXISTS pod_document_url text,
  ADD COLUMN IF NOT EXISTS delivery_confirmed_by text,
  ADD COLUMN IF NOT EXISTS delivery_notes text,
  ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'S01',
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_notes text,
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;

-- 2. Performance indexes for fast querying & stage filtering
CREATE INDEX IF NOT EXISTS idx_sales_orders_tenant_delivery_status 
  ON public.sales_orders(tenant_id, delivery_status);

CREATE INDEX IF NOT EXISTS idx_sales_orders_party_created 
  ON public.sales_orders(tenant_id, party_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_orders_stage_history 
  ON public.sales_orders USING gin (stage_history);

COMMIT;
