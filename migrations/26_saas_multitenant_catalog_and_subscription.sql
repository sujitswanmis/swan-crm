-- ====================================================================
-- MIGRATION 26: SAAS MULTI-TENANT MODULAR CATALOG & SUBSCRIPTION ENGINE
-- Supports 8 Standalone / Combo Business Processes with Dynamic Pricing
-- Zero-Regression Protection for New Swan Group (NSMLR & NSTLP)
-- Strict IST Timezone Enforcement (Asia/Kolkata, UTC+05:30)
-- ====================================================================

-- 1. Ensure Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Update Default Tenant to 'New Swan Group' (NSMLR & NSTLP Parent)
UPDATE tenants
SET 
  tenant_code = 'NEW_SWAN_GROUP',
  name = 'New Swan Group',
  status = 'ACTIVE',
  updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';

-- 3. Dynamic Process Catalog Table
CREATE TABLE IF NOT EXISTS saas_process_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_code text UNIQUE NOT NULL,
  display_name text NOT NULL,
  category text NOT NULL, -- 'SALES', 'TELEPHONY', 'OPERATIONS', 'HR', 'COMBO'
  monthly_rate_per_user numeric(10,2) NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 4. Billing Cycles & Discounts Table
CREATE TABLE IF NOT EXISTS saas_cycle_discounts (
  cycle_code text PRIMARY KEY, -- 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'
  display_name text NOT NULL,
  months_count integer NOT NULL,
  discount_percent numeric(5,2) DEFAULT 0.00,
  is_active boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT now()
);

-- 5. Tenant Custom Negotiated Rates (Client-Specific Deals)
CREATE TABLE IF NOT EXISTS tenant_custom_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  process_code text NOT NULL,
  custom_monthly_rate numeric(10,2) NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, process_code)
);

-- 6. Seed All 8 Master Business Processes
INSERT INTO saas_process_catalog (process_code, display_name, category, monthly_rate_per_user, description, sort_order)
VALUES
  ('LEADS_ONLY', 'Lead Management Only', 'SALES', 199.00, 'Leads Table, Pipeline, Assignment, Activity Logs & Follow-up Reminders', 1),
  ('CALLING_STANDALONE', 'Cloud Calling (WebRTC + Softphone)', 'TELEPHONY', 249.00, 'Browser-based Softphone, WebRTC dialer, call logs, recording & duration tracking (Exclude calling usage)', 2),
  ('LEADS_WITH_CALLING', 'Lead Management + Direct Cloud Calling', 'COMBO', 399.00, 'Integrated Leads Table with 1-Click Browser Dialing, automatic duration logs & recordings (Exclude calling usage)', 3),
  ('TASK_DELEGATION', 'Task Delegation', 'OPERATIONS', 99.00, 'Task assignment to team members, deadlines, status tracker & approval workflows', 4),
  ('SMART_CHECKLIST', 'Smart Checklist', 'OPERATIONS', 99.00, 'Daily & recurring operational checklists, opening/closing SOPs & compliance monitoring', 5),
  ('ATTENDANCE', 'Attendance Management', 'HR', 99.00, 'Geo/mobile punch-in/out, shift management, leave approvals & regularization', 6),
  ('RECRUITER', 'Recruiter Management (ATS)', 'HR', 149.00, 'Job postings, public applicant portal, resume/CV upload & interview pipeline tracking', 7),
  ('PARTY_MASTER', 'Party Master Management', 'OPERATIONS', 99.00, 'Dealers, Distributors, Vendors, Clients directory, territory mapping & ledger accounts', 8)
ON CONFLICT (process_code) DO UPDATE 
SET 
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

-- 7. Seed Billing Cycles
INSERT INTO saas_cycle_discounts (cycle_code, display_name, months_count, discount_percent)
VALUES
  ('MONTHLY', 'Monthly (1 Month)', 1, 0.00),
  ('QUARTERLY', 'Quarterly (3 Months)', 3, 5.00),
  ('HALF_YEARLY', 'Half-Yearly (6 Months)', 6, 10.00),
  ('YEARLY', 'Yearly (12 Months)', 12, 20.00)
ON CONFLICT (cycle_code) DO NOTHING;

-- 8. Seed New Swan Group Subscription & Entitlements (Master Lifetime Production Protection)
INSERT INTO tenant_subscriptions (
  tenant_id,
  plan_name,
  user_seat_limit,
  valid_from,
  valid_until,
  status,
  billing_cycle,
  amount
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'ENTERPRISE_ALL_MODULES',
  999999,
  now(),
  '2099-12-31 23:59:59+05:30',
  'ACTIVE',
  'YEARLY',
  0.00
)
ON CONFLICT DO NOTHING;

-- Ensure All 8 Entitlements are Active for New Swan Group
INSERT INTO tenant_entitlements (tenant_id, module_key, is_enabled, config_json)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'LEADS_ONLY', true, '{"unlimited": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'CALLING_STANDALONE', true, '{"unlimited": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'LEADS_WITH_CALLING', true, '{"unlimited": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'TASK_DELEGATION', true, '{"unlimited": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'SMART_CHECKLIST', true, '{"unlimited": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'ATTENDANCE', true, '{"unlimited": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'RECRUITER', true, '{"unlimited": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'PARTY_MASTER', true, '{"unlimited": true}'::jsonb)
ON CONFLICT (tenant_id, module_key) DO UPDATE 
SET is_enabled = true;
