-- Migration 38: Add Sub-Category to Tenant Products Catalog
-- Strict IST Timezone (Asia/Kolkata)

ALTER TABLE IF EXISTS public.tenant_products 
ADD COLUMN IF NOT EXISTS sub_category TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_tenant_products_sub_category ON public.tenant_products(sub_category);
