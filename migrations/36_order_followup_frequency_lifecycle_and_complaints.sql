-- Migration 36: Order Followup Frequency, Lifecycle & Complaints SLA
-- Additive & Non-destructive migration for Recurring Calling, Order-to-Delivery Pipeline & Complaints SLA

-- 1. PARTY ORDER SCHEDULES (Recurring Calling Engine)
CREATE TABLE IF NOT EXISTS party_order_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  frequency_type text NOT NULL DEFAULT 'MONTHLY' CHECK (frequency_type IN (
    'DAILY', 'WEEKLY', 'HALF_MONTHLY', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM_DAYS', 'MANUAL'
  )),
  weekly_days jsonb DEFAULT '[]'::jsonb, -- e.g. ["MON", "THU"]
  monthly_date integer DEFAULT 1,        -- 1 to 31
  half_monthly_dates jsonb DEFAULT '[1, 16]'::jsonb,
  quarterly_month integer DEFAULT 1,
  quarterly_day integer DEFAULT 1,
  half_yearly_month integer DEFAULT 1,
  half_yearly_day integer DEFAULT 1,
  yearly_month integer DEFAULT 1,
  yearly_day integer DEFAULT 1,
  custom_interval_days integer DEFAULT 15,
  preferred_time_slot text DEFAULT 'ANYTIME',
  assigned_caller_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  last_followup_at timestamp with time zone,
  next_due_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT party_order_schedules_tenant_party_unique UNIQUE (tenant_id, party_id)
);

CREATE INDEX IF NOT EXISTS idx_party_order_schedules_next_due 
  ON party_order_schedules(tenant_id, next_due_date, is_active);

-- 2. SALES ORDERS LIFECYCLE EXTENSIONS
ALTER TABLE sales_orders
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
  ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'PUNCHED';

CREATE INDEX IF NOT EXISTS idx_sales_orders_delivery_status 
  ON sales_orders(tenant_id, delivery_status);

-- 3. POST-ORDER FEEDBACK EXTENSIONS
ALTER TABLE party_order_feedback
  ADD COLUMN IF NOT EXISTS rating_packaging integer CHECK (rating_packaging BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS rating_transporter integer CHECK (rating_transporter BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS repeat_order_intent text,
  ADD COLUMN IF NOT EXISTS repeat_order_expected_date date;

-- 4. MONTHLY HEALTH CHECK AUDIT EXTENSIONS
ALTER TABLE party_monthly_feedback
  ADD COLUMN IF NOT EXISTS rating_order_delivery integer CHECK (rating_order_delivery BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS rating_product_quality integer CHECK (rating_product_quality BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS rating_sales_support integer CHECK (rating_sales_support BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS rating_account_billing integer CHECK (rating_account_billing BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS rating_overall integer CHECK (rating_overall BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS demand_forecast_json jsonb DEFAULT '[]'::jsonb;

-- 5. COMPLAINT MANAGEMENT SLA EXTENSIONS
ALTER TABLE party_complaints
  ADD COLUMN IF NOT EXISTS sla_breached boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS corrective_action_summary text,
  ADD COLUMN IF NOT EXISTS resolution_attachment_url text;

CREATE INDEX IF NOT EXISTS idx_party_complaints_status_dept 
  ON party_complaints(tenant_id, ticket_status, assigned_department);
