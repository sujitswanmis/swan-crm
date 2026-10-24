-- =========================================================================
-- COMPLETE SELF-CONTAINED OPERATIONAL ENGINE MIGRATION
-- Order Follow-up, Frequency Recurrence, Lifecycle & Complaints SLA
-- =========================================================================

-- 1. DAILY ORDER TAKING FOLLOWUP LOGS
CREATE TABLE IF NOT EXISTS party_order_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL DEFAULT CURRENT_DATE,
  assigned_caller_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  assigned_caller_name text,
  call_status text DEFAULT 'PENDING',
  current_outstanding numeric(14,2) DEFAULT 0.00,
  available_credit numeric(14,2) DEFAULT 0.00,
  last_order_date date,
  is_order_placed boolean DEFAULT false,
  generated_order_no text,
  order_line_items jsonb DEFAULT '[]'::jsonb,
  billing_route text DEFAULT 'DIRECT_COMPANY_BILLING',
  tagged_distributor_id uuid REFERENCES party_master(id) ON DELETE SET NULL,
  preferred_dispatch_date date,
  no_order_reason text,
  rescheduled_time timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_party_order_followups_party_date 
  ON party_order_followups(tenant_id, party_id, scheduled_date);

-- 2. RECURRING ORDER FREQUENCY RULES (Daily / Weekly / Half-Month / Monthly / Custom)
CREATE TABLE IF NOT EXISTS party_order_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  frequency_type text NOT NULL DEFAULT 'MONTHLY',
  weekly_days jsonb DEFAULT '["MON"]'::jsonb,
  monthly_date integer DEFAULT 1,
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

-- 3. POST-ORDER SATISFACTION FEEDBACK
CREATE TABLE IF NOT EXISTS party_order_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  order_id text NOT NULL,
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  telecaller_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  telecaller_name text,
  call_datetime timestamp with time zone DEFAULT now(),
  rating_delivery_time integer DEFAULT 5,
  rating_product_quality integer DEFAULT 5,
  rating_packaging integer DEFAULT 5,
  rating_transporter integer DEFAULT 5,
  has_transit_damage_shortage boolean DEFAULT false,
  damage_details text,
  dealer_comments text,
  repeat_order_intent text DEFAULT 'NORMAL',
  repeat_order_expected_date date,
  overall_satisfaction integer DEFAULT 5,
  auto_complaint_triggered boolean DEFAULT false,
  linked_ticket_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_party_order_feedback_order 
  ON party_order_feedback(tenant_id, order_id);

-- 4. MONTHLY PARTNER HEALTH CHECKS
CREATE TABLE IF NOT EXISTS party_monthly_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  evaluation_period text NOT NULL,
  telecaller_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  telecaller_name text,
  days_inactive integer DEFAULT 0,
  is_dormant_risk boolean DEFAULT false,
  market_sentiment text DEFAULT 'STEADY',
  competitor_schemes text,
  rating_order_delivery integer DEFAULT 5,
  rating_product_quality integer DEFAULT 5,
  rating_sales_support integer DEFAULT 5,
  rating_account_billing integer DEFAULT 5,
  rating_overall integer DEFAULT 5,
  next_month_demand_plan text,
  dealer_suggestions text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_party_monthly_feedback_period 
  ON party_monthly_feedback(tenant_id, party_id, evaluation_period);

-- 5. COMPLAINT MANAGEMENT & SLA TRACKING
CREATE TABLE IF NOT EXISTS party_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  ticket_number text UNIQUE NOT NULL,
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  complaint_source text DEFAULT 'DIRECT_PHONE',
  category text NOT NULL,
  priority text DEFAULT 'MEDIUM',
  issue_description text NOT NULL,
  attachments text[] DEFAULT ARRAY[]::text[],
  assigned_department text DEFAULT 'QUALITY_ASSURANCE',
  assigned_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  assigned_employee_name text,
  sla_deadline timestamp with time zone,
  sla_breached boolean DEFAULT false,
  resolution_type text,
  resolution_notes text,
  action_reference_no text,
  closure_otp text,
  dealer_satisfaction_rating integer DEFAULT 5,
  ticket_status text DEFAULT 'OPEN',
  created_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_party_complaints_status_dept 
  ON party_complaints(tenant_id, ticket_status, assigned_department);

-- 6. SALES ORDERS EXTENSIONS (Dispatched, LR, Transporter, Delivered)
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
