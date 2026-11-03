'use server';

import fs from 'fs/promises';
import path from 'path';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'complaint_pipeline_config.json');

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

/**
 * 1. GET COMPLAINT PIPELINE CONFIG (Tenant & Branch Wise)
 */
export async function getComplaintPipelineConfig(tenantId = 'TNT00002', branchName = 'All Branches') {
  const tenantCode = normalizeTenantCode(tenantId);
  const effectiveBranch = branchName || 'All Branches';

  try {
    const fileContent = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    const allConfigs = JSON.parse(fileContent);

    const tenantConfig = allConfigs[tenantCode] || allConfigs['TNT00002'] || {};
    const defaultBranchConfig = tenantConfig['All Branches'] || Object.values(tenantConfig)[0] || null;

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

    // Branch specific override merged with All Branches default
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
    console.error('getComplaintPipelineConfig error:', err);
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
 * 2. SAVE COMPLAINT PIPELINE CONFIG (Tenant & Branch Wise)
 */
export async function saveComplaintPipelineConfig(tenantId = 'TNT00002', branchName = 'All Branches', updatedConfig = {}) {
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
    console.error('saveComplaintPipelineConfig error:', err);
    return {
      success: false,
      tenantCode,
      branchName: effectiveBranch,
      error: err.message
    };
  }
}

/**
 * 3. RESET COMPLAINT PIPELINE CONFIG TO DEFAULTS
 */
export async function resetComplaintPipelineConfig(tenantId = 'TNT00002', branchName = 'All Branches') {
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
      config: allConfigs[tenantCode]?.['All Branches'] || null
    };
  } catch (err) {
    console.error('resetComplaintPipelineConfig error:', err);
    return {
      success: false,
      tenantCode,
      branchName: effectiveBranch,
      error: err.message
    };
  }
}
