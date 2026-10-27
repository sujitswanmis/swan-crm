'use server';

import fs from 'fs/promises';
import path from 'path';
import { getAdminClient } from '@/utils/supabase/adminClient';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'order_pipeline_config.json');

/**
 * Standard Tenant Code Normalization
 */
function normalizeTenantCode(tenantId) {
  if (!tenantId) return 'TNT00002';
  const str = String(tenantId).trim();
  if (str === 'TNT00001' || str.toLowerCase().includes('supuja')) return 'TNT00001';
  if (str === 'TNT00002' || str.toLowerCase().includes('swan')) return 'TNT00002';
  if (str.startsWith('TNT')) return str;
  // If UUID, map default UUIDs
  if (str === '00000000-0000-0000-0000-000000000001') return 'TNT00001';
  return 'TNT00002';
}

/**
 * 1. GET ORDER PIPELINE CONFIG (Tenant & Branch Wise)
 */
export async function getOrderPipelineConfig(tenantId = 'TNT00002', branchName = 'All Branches') {
  const tenantCode = normalizeTenantCode(tenantId);
  const effectiveBranch = branchName || 'All Branches';

  try {
    // Read local master JSON configuration
    const fileContent = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    const allConfigs = JSON.parse(fileContent);

    const tenantConfig = allConfigs[tenantCode] || allConfigs['TNT00002'] || {};
    const defaultBranchConfig = tenantConfig['All Branches'] || Object.values(tenantConfig)[0] || null;

    if (effectiveBranch === 'All Branches' || !tenantConfig[effectiveBranch]) {
      return {
        success: true,
        tenantCode,
        branchName: effectiveBranch,
        config: defaultBranchConfig
      };
    }

    // Branch specific override merged with All Branches default
    const branchConfig = tenantConfig[effectiveBranch];
    const mergedStages = (defaultBranchConfig?.stages || []).map(defStage => {
      const branchStage = (branchConfig.stages || []).find(s => s.id === defStage.id);
      return branchStage ? { ...defStage, ...branchStage } : defStage;
    });

    return {
      success: true,
      tenantCode,
      branchName: effectiveBranch,
      config: {
        ...defaultBranchConfig,
        ...branchConfig,
        stages: mergedStages
      }
    };
  } catch (err) {
    console.error('getOrderPipelineConfig error:', err);
    return {
      success: false,
      tenantCode,
      branchName: effectiveBranch,
      error: err.message,
      config: null
    };
  }
}

/**
 * 2. SAVE ORDER PIPELINE CONFIG (Tenant & Branch Wise)
 */
export async function saveOrderPipelineConfig(tenantId = 'TNT00002', branchName = 'All Branches', updatedConfig = {}) {
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

    // Persist to JSON config file
    await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(allConfigs, null, 2), 'utf-8');

    // Also attempt defensive sync to Supabase if tenant_configurations table is available
    try {
      const adminClient = getAdminClient();
      await adminClient
        .from('tenant_configurations')
        .upsert({
          tenant_code: tenantCode,
          config_key: `order_pipeline_${effectiveBranch.replace(/\s+/g, '_')}`,
          config_value: updatedConfig,
          updated_at: new Date().toISOString()
        }, { onConflict: 'tenant_code,config_key' });
    } catch (dbErr) {
      // Non-blocking warning - JSON file is primary persistent store
      console.warn('Defensive DB sync for order_pipeline skipped:', dbErr.message);
    }

    return {
      success: true,
      tenantCode,
      branchName: effectiveBranch,
      config: allConfigs[tenantCode][effectiveBranch]
    };
  } catch (err) {
    console.error('saveOrderPipelineConfig error:', err);
    return {
      success: false,
      tenantCode,
      branchName: effectiveBranch,
      error: err.message
    };
  }
}

/**
 * 3. RESET PIPELINE CONFIG TO DEFAULT 13 STAGES
 */
export async function resetOrderPipelineConfig(tenantId = 'TNT00002', branchName = 'All Branches') {
  const tenantCode = normalizeTenantCode(tenantId);
  const effectiveBranch = branchName || 'All Branches';

  try {
    const fileContent = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    const allConfigs = JSON.parse(fileContent);

    const masterDefaults = allConfigs['TNT00002']?.['All Branches'];
    if (!masterDefaults) {
      throw new Error('Default 13-stage configuration baseline not found');
    }

    if (!allConfigs[tenantCode]) {
      allConfigs[tenantCode] = {};
    }

    allConfigs[tenantCode][effectiveBranch] = JSON.parse(JSON.stringify(masterDefaults));
    await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(allConfigs, null, 2), 'utf-8');

    return {
      success: true,
      tenantCode,
      branchName: effectiveBranch,
      config: allConfigs[tenantCode][effectiveBranch]
    };
  } catch (err) {
    console.error('resetOrderPipelineConfig error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}
