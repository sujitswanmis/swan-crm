-- Migration 37: Tenant Branch-Wise Product Catalog
-- Strict IST Timezone (Asia/Kolkata)

CREATE TABLE IF NOT EXISTS public.tenant_products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  company TEXT NOT NULL,
  branch_id TEXT,
  branch_name TEXT DEFAULT 'All Branches',
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT DEFAULT 'General',
  uom TEXT DEFAULT 'Units',
  price NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 12,
  hsn_code TEXT,
  stock_quantity NUMERIC DEFAULT 0,
  min_order_qty NUMERIC DEFAULT 1,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'),
  updated_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata')
);

CREATE INDEX IF NOT EXISTS idx_tenant_products_company ON public.tenant_products(company);
CREATE INDEX IF NOT EXISTS idx_tenant_products_branch ON public.tenant_products(branch_name);
CREATE INDEX IF NOT EXISTS idx_tenant_products_sku ON public.tenant_products(sku);
CREATE INDEX IF NOT EXISTS idx_tenant_products_active ON public.tenant_products(is_active);
