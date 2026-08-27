-- ====================================================================
-- PHASE 21 MIGRATION: SMART ATTENDANCE & MISSING PUNCH REGULARIZATION
-- Multi-Tenant WMS / CRM Infrastructure
-- Safety: Non-destructive, idempotent (IF NOT EXISTS)
-- ====================================================================

-- 1. Daily Attendance Records Table
CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  user_id uuid,
  emp_code text,
  emp_name text NOT NULL,
  email text NOT NULL,
  department text,
  attendance_date date NOT NULL,
  in_time timestamp with time zone,
  out_time timestamp with time zone,
  in_location text,
  out_location text,
  in_method text DEFAULT 'WEB_PUNCH',
  out_method text DEFAULT 'WEB_PUNCH',
  total_working_minutes integer DEFAULT 0,
  status text DEFAULT 'PRESENT' CHECK (status IN ('PRESENT', 'HALF_DAY', 'LATE', 'MISSED_PUNCH', 'REGULARIZED', 'ABSENT', 'ON_LEAVE')),
  is_regularized boolean DEFAULT false,
  regularization_id uuid,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_attendance_user_date UNIQUE (email, attendance_date)
);

-- 2. Attendance Regularization Requests (Missing Attendance Applications)
CREATE TABLE IF NOT EXISTS attendance_regularization_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  user_id uuid,
  emp_code text,
  emp_name text NOT NULL,
  email text NOT NULL,
  department text,
  attendance_date date NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('MISSED_IN', 'MISSED_OUT', 'BOTH')),
  current_in_time timestamp with time zone,
  current_out_time timestamp with time zone,
  requested_in_time timestamp with time zone,
  requested_out_time timestamp with time zone,
  reason_type text NOT NULL,
  reason_details text NOT NULL,
  assigned_hod_email text,
  assigned_hod_name text,
  status text DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  action_by_user_id uuid,
  action_by_name text,
  action_by_email text,
  action_at timestamp with time zone,
  action_remarks text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records (attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_email ON attendance_records (email);
CREATE INDEX IF NOT EXISTS idx_attendance_records_tenant ON attendance_records (tenant_id);

CREATE INDEX IF NOT EXISTS idx_regularization_requests_email ON attendance_regularization_requests (email);
CREATE INDEX IF NOT EXISTS idx_regularization_requests_hod ON attendance_regularization_requests (assigned_hod_email);
CREATE INDEX IF NOT EXISTS idx_regularization_requests_status ON attendance_regularization_requests (status);
CREATE INDEX IF NOT EXISTS idx_regularization_requests_date ON attendance_regularization_requests (attendance_date);
