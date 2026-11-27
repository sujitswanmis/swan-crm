-- ====================================================================
-- PHASE 59 MIGRATION: TASK PLANNER REQUESTER & INWARD TASK ORIGIN
-- Multi-Tenant SaaS WMS / CRM Infrastructure
-- Safety: Non-destructive, additive, idempotent (IF NOT EXISTS)
-- ====================================================================

-- Add Inward Task / Requested By columns to task_planner_items
ALTER TABLE task_planner_items 
  ADD COLUMN IF NOT EXISTS requested_by_name text;

ALTER TABLE task_planner_items 
  ADD COLUMN IF NOT EXISTS requested_by_channel text DEFAULT 'VERBAL';

-- Add index on requested_by_name for rapid filtering
CREATE INDEX IF NOT EXISTS idx_task_planner_requester 
  ON task_planner_items (tenant_id, requested_by_name);
