'use server';

import fs from 'fs/promises';
import path from 'path';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'party_master_config.json');

/**
 * Standard Tenant Code Normalization
 */
function normalizeTenantCode(tenantId) {
  if (!tenantId) return 'TNT00002';
  const str = String(tenantId).trim();
  if (str === 'TNT00001' || str.toLowerCase().includes('supuja')) return 'TNT00001';
  if (str === 'TNT00002' || str.toLowerCase().includes('swan')) return 'TNT00002';
  if (str === 'TNT00003' || str.toLowerCase().includes('testing')) return 'TNT00003';
  if (str.startsWith('TNT')) return str;
  if (str === '00000000-0000-0000-0000-000000000001') return 'TNT00001';
  return 'TNT00002';
}

const DEFAULT_FALLBACK_CONFIG = {
  general: {
    party_code_prefix: 'PTY-',
    include_branch_code: true,
    sequence_padding: 9,
    start_sequence: 1,
    distributor_code_prefix: 'DST-',
    dealer_code_prefix: 'DLR-',
    subdealer_code_prefix: 'SUB-',
    gstin_mandatory: true,
    pan_mandatory: true,
    phone_duplicate_check: true
  },
  tiers: [
    {
      id: 'Distributor',
      name: 'Distributor',
      enabled: true,
      badge_color: '#2563eb',
      badge_bg: '#dbeafe',
      icon: 'Building2',
      requires_parent_hub: false,
      default_credit_days: 30,
      default_min_security_deposit: 50000,
      allowed_billing_routes: ['DIRECT_COMPANY_BILLING']
    },
    {
      id: 'Dealer',
      name: 'Dealer',
      enabled: true,
      badge_color: '#16a34a',
      badge_bg: '#dcfce7',
      icon: 'Users',
      requires_parent_hub: true,
      default_credit_days: 15,
      default_min_security_deposit: 25000,
      allowed_billing_routes: ['DIRECT_COMPANY_BILLING', 'DISTRIBUTOR_BILLED']
    },
    {
      id: 'Sub-Dealer',
      name: 'Sub-Dealer',
      enabled: true,
      badge_color: '#9333ea',
      badge_bg: '#f3e8ff',
      icon: 'Layers',
      requires_parent_hub: true,
      default_credit_days: 7,
      default_min_security_deposit: 10000,
      allowed_billing_routes: ['DISTRIBUTOR_BILLED', 'DEALER_BILLED']
    },
    {
      id: 'Direct Customer',
      name: 'Direct Customer',
      enabled: false,
      badge_color: '#ea580c',
      badge_bg: '#ffedd5',
      icon: 'UserCheck',
      requires_parent_hub: false,
      default_credit_days: 0,
      default_min_security_deposit: 0,
      allowed_billing_routes: ['DIRECT_COMPANY_BILLING']
    },
    {
      id: 'OEM',
      name: 'OEM / Corporate Partner',
      enabled: false,
      badge_color: '#0891b2',
      badge_bg: '#cffafe',
      icon: 'Sparkles',
      requires_parent_hub: false,
      default_credit_days: 45,
      default_min_security_deposit: 100000,
      allowed_billing_routes: ['DIRECT_COMPANY_BILLING']
    }
  ],
  stages: [
    {
      id: 'S00',
      name: 'Transferred to Party',
      description: 'Incoming leads transferred from Lead Pipeline S08 awaiting Party Master verification',
      mandatory_confirmation: true,
      auto_advance: false,
      allowed_roles: ['admin', 'crm', 'sales_manager']
    },
    {
      id: 'S01',
      name: 'Party Master Creation',
      description: 'Firm identity, legal entity name, GSTIN, PAN, and primary contact setup',
      mandatory: true,
      require_gstin: true,
      require_pan: true,
      allowed_roles: ['admin', 'crm', 'sales_manager', 'sales_coordinator']
    },
    {
      id: 'S02',
      name: 'Distributor Registration',
      description: 'Distributor profile, warehouse details, and parent hub setup',
      mandatory: false,
      applicable_tiers: ['Distributor'],
      allowed_roles: ['admin', 'crm', 'sales_manager']
    },
    {
      id: 'S03',
      name: 'Dealer Registration',
      description: 'Dealer profile, showroom/retail counters, and parent distributor mapping',
      mandatory: false,
      applicable_tiers: ['Dealer'],
      allowed_roles: ['admin', 'crm', 'sales_manager']
    },
    {
      id: 'S04',
      name: 'Sub-Dealer Registration',
      description: 'Sub-Dealer profile, village/tehsil counters, and dealer mapping',
      mandatory: false,
      applicable_tiers: ['Sub-Dealer'],
      allowed_roles: ['admin', 'crm', 'sales_manager']
    },
    {
      id: 'S05',
      name: 'Commercial Security Details',
      description: 'Approved credit limit, payment terms, security cheques/PDC, and bank verification',
      mandatory: true,
      require_security_cheques: true,
      require_bank_details: true,
      allowed_roles: ['admin', 'crm', 'accounts_team']
    },
    {
      id: 'S06',
      name: 'Product Auth & Territory',
      description: 'Authorized product groups/brands and assigned operational territory (State/District)',
      mandatory: true,
      territory_granularity: 'DISTRICT',
      allowed_roles: ['admin', 'crm', 'sales_manager']
    },
    {
      id: 'S07',
      name: 'Sales Team Assignment',
      description: 'Dedicated sales manager, executive, telecaller, and service person allocation',
      mandatory: true,
      mandatory_roles: ['Sales Executive', 'Telecaller'],
      allowed_roles: ['admin', 'crm', 'sales_manager']
    },
    {
      id: 'S08',
      name: 'Partner Activation',
      description: 'Final operational sign-off and live business activation',
      mandatory: true,
      default_status: 'Active',
      allowed_roles: ['admin', 'crm']
    }
  ],
  order_calling_defaults: {
    default_frequency: 'MONTHLY',
    inactivity_dormant_days: 45,
    default_preferred_day: 'Monday',
    auto_sync_to_order_desk: true,
    min_order_value: 0
  },
  commercial_defaults: {
    default_billing_route: 'DIRECT_COMPANY_BILLING',
    default_credit_days: 30,
    default_payment_mode: 'RTGS / Bank Transfer',
    grace_period_days: 7
  }
};

/**
 * 1. GET PARTY MASTER CONFIG (Tenant & Branch Wise)
 */
export async function getPartyMasterConfig(tenantId = 'TNT00002', branchName = 'All Branches') {
  const tenantCode = normalizeTenantCode(tenantId);
  const effectiveBranch = branchName || 'All Branches';

  try {
    let allConfigs = {};
    try {
      const fileContent = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
      allConfigs = JSON.parse(fileContent);
    } catch (_) {
      allConfigs = {};
    }

    const tenantConfig = allConfigs[tenantCode] || allConfigs['TNT00002'] || {};
    const defaultBranchConfig = tenantConfig['All Branches'] || Object.values(tenantConfig)[0] || DEFAULT_FALLBACK_CONFIG;

    let branchConfig = tenantConfig[effectiveBranch];
    if (!branchConfig && effectiveBranch !== 'All Branches') {
      const match = effectiveBranch.match(/\[([A-Z0-9-]+)\]/);
      if (match) {
        const uid = match[1];
        const foundKey = Object.keys(tenantConfig).find(k => k.includes(`[${uid}]`));
        if (foundKey) {
          branchConfig = tenantConfig[foundKey];
        }
      }
    }

    if (effectiveBranch === 'All Branches' || !branchConfig) {
      return {
        success: true,
        tenantCode,
        branchName: effectiveBranch,
        config: defaultBranchConfig
      };
    }

    // Branch-specific override merged with All Branches default
    return {
      success: true,
      tenantCode,
      branchName: effectiveBranch,
      config: {
        ...defaultBranchConfig,
        ...branchConfig,
        general: {
          ...defaultBranchConfig.general,
          ...branchConfig.general
        },
        order_calling_defaults: {
          ...defaultBranchConfig.order_calling_defaults,
          ...branchConfig.order_calling_defaults
        },
        commercial_defaults: {
          ...defaultBranchConfig.commercial_defaults,
          ...branchConfig.commercial_defaults
        }
      }
    };
  } catch (err) {
    console.error('getPartyMasterConfig error:', err);
    return {
      success: false,
      tenantCode,
      branchName: effectiveBranch,
      error: err.message,
      config: DEFAULT_FALLBACK_CONFIG
    };
  }
}

/**
 * 2. SAVE PARTY MASTER CONFIG (Tenant & Branch Wise)
 */
export async function savePartyMasterConfig(tenantId = 'TNT00002', branchName = 'All Branches', updatedConfig = {}) {
  const tenantCode = normalizeTenantCode(tenantId);
  const effectiveBranch = branchName || 'All Branches';

  try {
    let allConfigs = {};
    try {
      const fileContent = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
      allConfigs = JSON.parse(fileContent);
    } catch (_) {
      allConfigs = {};
    }

    if (!allConfigs[tenantCode]) {
      allConfigs[tenantCode] = {};
    }

    allConfigs[tenantCode][effectiveBranch] = {
      ...allConfigs[tenantCode][effectiveBranch],
      ...updatedConfig,
      updated_at: new Date().toISOString()
    };

    await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(allConfigs, null, 2), 'utf-8');

    return {
      success: true,
      tenantCode,
      branchName: effectiveBranch,
      config: allConfigs[tenantCode][effectiveBranch]
    };
  } catch (err) {
    console.error('savePartyMasterConfig error:', err);
    return {
      success: false,
      tenantCode,
      branchName: effectiveBranch,
      error: err.message
    };
  }
}

/**
 * 3. RESET PARTY MASTER CONFIG TO DEFAULTS
 */
export async function resetPartyMasterConfig(tenantId = 'TNT00002', branchName = 'All Branches') {
  const tenantCode = normalizeTenantCode(tenantId);
  const effectiveBranch = branchName || 'All Branches';

  try {
    const fileContent = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    const allConfigs = JSON.parse(fileContent);

    if (effectiveBranch !== 'All Branches' && allConfigs[tenantCode]?.[effectiveBranch]) {
      delete allConfigs[tenantCode][effectiveBranch];
      await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(allConfigs, null, 2), 'utf-8');
    }

    return {
      success: true,
      tenantCode,
      branchName: effectiveBranch,
      config: allConfigs[tenantCode]?.['All Branches'] || DEFAULT_FALLBACK_CONFIG
    };
  } catch (err) {
    console.error('resetPartyMasterConfig error:', err);
    return {
      success: false,
      tenantCode,
      branchName: effectiveBranch,
      error: err.message
    };
  }
}
