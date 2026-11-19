-- Migration 51: Add Multi-Tenant and Branch Isolation to Recruitment Module
-- Tables affected: recruitment_positions, recruitment_candidates

-- 1. Add tenant and branch isolation columns to recruitment_positions
ALTER TABLE recruitment_positions 
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS tenant_code VARCHAR(20) DEFAULT 'TNT00002',
  ADD COLUMN IF NOT EXISTS branch_code VARCHAR(50) DEFAULT 'TNT00002-B0002',
  ADD COLUMN IF NOT EXISTS company VARCHAR(100) DEFAULT 'NSMLR';

-- 2. Add tenant and branch isolation columns to recruitment_candidates
ALTER TABLE recruitment_candidates 
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS tenant_code VARCHAR(20) DEFAULT 'TNT00002',
  ADD COLUMN IF NOT EXISTS branch_code VARCHAR(50) DEFAULT 'TNT00002-B0002',
  ADD COLUMN IF NOT EXISTS company VARCHAR(100) DEFAULT 'NSMLR';

-- 3. Backfill existing records to New Swan Group (TNT00002) - NSMLR (TNT00002-B0002)
UPDATE recruitment_positions
SET 
  tenant_id = '00000000-0000-0000-0000-000000000001',
  tenant_code = 'TNT00002',
  branch_code = 'TNT00002-B0002',
  company = 'NSMLR'
WHERE tenant_id IS NULL;

UPDATE recruitment_candidates
SET 
  tenant_id = '00000000-0000-0000-0000-000000000001',
  tenant_code = 'TNT00002',
  branch_code = 'TNT00002-B0002',
  company = 'NSMLR'
WHERE tenant_id IS NULL;

-- 4. Create performance indexes for scoped queries
CREATE INDEX IF NOT EXISTS idx_recruitment_positions_tenant_branch 
  ON recruitment_positions(tenant_id, branch_code);

CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_tenant_branch 
  ON recruitment_candidates(tenant_id, branch_code);
