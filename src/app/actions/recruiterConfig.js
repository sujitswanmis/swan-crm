'use server';

import fs from 'fs/promises';
import path from 'path';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'recruiter_pipeline_config.json');

/**
 * Standard Tenant Code Normalization
 */
function normalizeTenantCode(tenantId) {
  if (!tenantId) return 'TNT00002';
  const str = String(tenantId).trim();
  if (str === 'TNT00001' || str === '0a37b8e8-1c28-4e19-8891-951fc3f8f8af' || str.toLowerCase().includes('supuja')) return 'TNT00001';
  if (str === 'TNT00002' || str === '00000000-0000-0000-0000-000000000001' || str.toLowerCase().includes('swan')) return 'TNT00002';
  if (str === 'TNT00003' || str.toLowerCase().includes('testing')) return 'TNT00003';
  if (str.startsWith('TNT')) return str;
  return 'TNT00002';
}

/**
 * Standard Default Recruiter Stages Configuration
 */
const DEFAULT_STAGES = [
  {
    id: "S00",
    step_no: 0,
    name: "S00 — Requirements Received",
    short_code: "REQUIREMENTS_RECEIVED",
    department: "Human Resource",
    tat_hours: 24,
    color: "#94a3b8",
    textColor: "#1e293b",
    is_enabled: true,
    default_note: "Job requirement received from department HOD.",
    authorized_roles: ["admin", "hr_manager", "recruiter", "hod"],
    status_options: ["Pending Review", "Requirement Verified", "Hold", "Cancelled"],
    custom_fields: []
  },
  {
    id: "S01",
    step_no: 1,
    name: "S01 — JDs Prepared & Posted",
    short_code: "JD_POSTED",
    department: "Human Resource",
    tat_hours: 48,
    color: "#a855f7",
    textColor: "#581c87",
    is_enabled: true,
    default_note: "Job Description drafted, approved, and posted across recruitment portals.",
    authorized_roles: ["admin", "hr_manager", "recruiter"],
    status_options: ["Drafting JD", "JD Approved", "Posted on Job Boards", "Application Window Open"],
    custom_fields: []
  },
  {
    id: "S02",
    step_no: 2,
    name: "S02 — Resume Filtered",
    short_code: "RESUME_FILTERED",
    department: "Human Resource",
    tat_hours: 24,
    color: "#cbd5e1",
    textColor: "#334155",
    is_enabled: true,
    default_note: "Resumes screened and initial profile matching completed.",
    authorized_roles: ["admin", "hr_manager", "recruiter"],
    status_options: ["Awaiting Screening", "Resume Selected", "Resume Rejected", "No Response", "ReSchedule"],
    custom_fields: []
  },
  {
    id: "S03",
    step_no: 3,
    name: "S03 — Interview Executed",
    short_code: "INTERVIEW_EXECUTED",
    department: "Technical / HR",
    tat_hours: 48,
    color: "#fef9c3",
    textColor: "#854d0e",
    is_enabled: true,
    default_note: "Technical / HR interview rounds scheduled and conducted.",
    authorized_roles: ["admin", "hr_manager", "recruiter", "interviewer"],
    status_options: ["Interview Scheduled", "Interview Cleared", "Interview Rejected", "No Response", "ReSchedule"],
    custom_fields: []
  },
  {
    id: "S04",
    step_no: 4,
    name: "S04 — Test Results",
    short_code: "TEST_RESULTS",
    department: "Quality / Engineering / HR",
    tat_hours: 24,
    color: "#dbeafe",
    textColor: "#1e40af",
    is_enabled: true,
    default_note: "Skill assessment, aptitude, or machine test evaluated.",
    authorized_roles: ["admin", "hr_manager", "recruiter", "interviewer"],
    status_options: ["Test Pending", "Test Passed", "Test Failed", "No Response", "ReSchedule"],
    custom_fields: []
  },
  {
    id: "S05",
    step_no: 5,
    name: "S05 — Final Confirmation",
    short_code: "ED_APPROVAL",
    department: "Executive Director",
    tat_hours: 48,
    color: "#ffedd5",
    textColor: "#c2410c",
    is_enabled: true,
    default_note: "Candidate dossier submitted for Executive Director final approval.",
    authorized_roles: ["admin", "hr_manager", "ed"],
    status_options: ["No Response", "ReSchedule", "Final Pending", "Final Rejected", "Final Confirmed"],
    custom_fields: []
  },
  {
    id: "S06",
    step_no: 6,
    name: "S06 — Salary Negotiation",
    short_code: "SALARY_NEGOTIATION",
    department: "Human Resource",
    tat_hours: 24,
    color: "#f5d0fe",
    textColor: "#86198f",
    is_enabled: true,
    default_note: "CTC break-up discussed, benefits outlined, and offer numbers agreed.",
    authorized_roles: ["admin", "hr_manager", "recruiter"],
    status_options: ["Negotiation Pending", "Salary Agreed", "Salary Rejected", "No Response", "ReSchedule"],
    custom_fields: []
  },
  {
    id: "S07",
    step_no: 7,
    name: "S07 — Shortlisted",
    short_code: "SHORTLISTED",
    department: "Human Resource",
    tat_hours: 24,
    color: "#e0e7ff",
    textColor: "#3730a3",
    is_enabled: true,
    default_note: "Final candidate structure confirmed and formal approval locked.",
    authorized_roles: ["admin", "hr_manager"],
    status_options: ["Shortlisted", "Dropped", "No Response", "ReSchedule"],
    custom_fields: []
  },
  {
    id: "S08",
    step_no: 8,
    name: "S08 — LOI Released",
    short_code: "LOI_RELEASED",
    department: "Human Resource",
    tat_hours: 24,
    color: "#e0f2fe",
    textColor: "#0369a1",
    is_enabled: true,
    default_note: "Letter of Intent / Offer letter issued to candidate.",
    authorized_roles: ["admin", "hr_manager", "recruiter"],
    status_options: ["LOI Released", "LOI Accepted", "LOI Declined", "No Response", "ReSchedule"],
    custom_fields: []
  },
  {
    id: "S09",
    step_no: 9,
    name: "S09 — Joined",
    short_code: "JOINED",
    department: "Human Resource",
    tat_hours: 48,
    color: "#dcfce7",
    textColor: "#166534",
    is_enabled: true,
    default_note: "Candidate onboarding formalities, asset allocation, and induction.",
    authorized_roles: ["admin", "hr_manager", "recruiter"],
    status_options: ["Joining Pending", "Joined", "No Show", "No Response", "ReSchedule"],
    custom_fields: []
  },
  {
    id: "S10",
    step_no: 10,
    name: "S10 — Document Collection",
    short_code: "DOC_COLLECTION",
    department: "Human Resource",
    tat_hours: 48,
    color: "#fed7aa",
    textColor: "#9a3412",
    is_enabled: true,
    default_note: "Post-joining document verification, KYC, and background credentials.",
    authorized_roles: ["admin", "hr_manager", "recruiter"],
    status_options: ["Pending Documents", "Documents Submitted", "KYC & Verification Completed", "Discrepancy Found", "Hold", "ReSchedule"],
    custom_fields: []
  },
  {
    id: "S11",
    step_no: 11,
    name: "S11 — Employee ID & Final Mapping",
    short_code: "EMP_ID_MAPPING",
    department: "HR & Systems",
    tat_hours: 24,
    color: "#c7d2fe",
    textColor: "#312e81",
    is_enabled: true,
    default_note: "Official Employee Code generation, branch allocation, email creation, and attendance handover.",
    authorized_roles: ["admin", "hr_manager", "recruiter"],
    status_options: ["Mapping Pending", "Employee ID Generated", "Biometric Enrolled", "System & Email Created", "Handover Completed", "Hold"],
    custom_fields: []
  },
  {
    id: "S12",
    step_no: 12,
    name: "S12 — Employee Working Rating",
    short_code: "WORKING_RATING",
    department: "HOD / Management / HR",
    tat_hours: 720,
    color: "#fef08a",
    textColor: "#713f12",
    is_enabled: true,
    default_note: "Probation review, HOD working evaluation rating (1–5 stars), and confirmation status.",
    authorized_roles: ["admin", "hr_manager", "hod"],
    status_options: ["Under Probation", "30-Day Review Completed", "60-Day Review Completed", "Confirmed (Good)", "Average (Needs Monitoring)", "Probation Extended", "Early Left / Resigned"],
    custom_fields: []
  }
];

const DEFAULT_CONFIG = {
  tat_mode: "DUAL",
  planned_anchor: "CANDIDATE_CREATION",
  enable_tat_alerts: true,
  stages: DEFAULT_STAGES
};

/**
 * 1. GET RECRUITER PIPELINE CONFIG (Tenant & Branch Wise)
 */
export async function getRecruiterPipelineConfig(tenantId = 'TNT00002', branchName = 'All Branches') {
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
    const rawDefaultBranchConfig = tenantConfig['All Branches'] || DEFAULT_CONFIG;

    // Ensure all standard DEFAULT_STAGES (S00 to S12) are present in defaultBranchConfig
    const existingDefaultIds = new Set((rawDefaultBranchConfig.stages || []).map(s => s.id));
    const missingDefaultStages = DEFAULT_STAGES.filter(s => !existingDefaultIds.has(s.id));
    const defaultBranchConfig = {
      ...rawDefaultBranchConfig,
      stages: missingDefaultStages.length > 0 
        ? [...(rawDefaultBranchConfig.stages || []), ...missingDefaultStages]
        : (rawDefaultBranchConfig.stages || DEFAULT_STAGES)
    };

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
    const mergedStages = (defaultBranchConfig?.stages || DEFAULT_STAGES).map(defStage => {
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
    console.error('getRecruiterPipelineConfig error:', err);
    return {
      success: false,
      tenantCode,
      branchName: effectiveBranch,
      error: err.message,
      config: DEFAULT_CONFIG
    };
  }
}

/**
 * 2. SAVE RECRUITER PIPELINE CONFIG (Tenant & Branch Wise)
 */
export async function saveRecruiterPipelineConfig(tenantId = 'TNT00002', branchName = 'All Branches', updatedConfig = {}) {
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
      allConfigs[tenantCode] = { 'All Branches': { ...DEFAULT_CONFIG } };
    }

    const nowIST = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date());

    allConfigs[tenantCode][effectiveBranch] = {
      ...(allConfigs[tenantCode][effectiveBranch] || {}),
      ...updatedConfig,
      updated_at_ist: nowIST
    };

    await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(allConfigs, null, 2), 'utf-8');

    return {
      success: true,
      tenantCode,
      branchName: effectiveBranch,
      savedAtIST: nowIST
    };
  } catch (err) {
    console.error('saveRecruiterPipelineConfig error:', err);
    return {
      success: false,
      tenantCode,
      branchName: effectiveBranch,
      error: err.message
    };
  }
}

/**
 * 3. CALCULATE RECRUITER STAGE TIMELINE & SLA (Planned to TAT to Planned & Planned to Actual to TAT to Planned)
 * 
 * Strict IST (Asia/Kolkata) enforcement
 */
export async function calculateRecruiterStageTimeline({
  candidateCreatedDate,
  currentStageId = 'S02',
  stageHistory = {}, // { 'S02': { completed_at: '2026-11-10T10:00:00Z' } }
  stagesConfig = DEFAULT_STAGES,
  tatMode = 'DUAL'
}) {
  const activeStages = (stagesConfig || DEFAULT_STAGES).filter(s => s.is_enabled !== false);
  
  // Anchor date in IST
  const anchorTime = candidateCreatedDate ? new Date(candidateCreatedDate).getTime() : Date.now();
  
  let baselineAccumulator = anchorTime;
  let dynamicAccumulator = anchorTime;
  
  const timeline = {};
  
  for (let i = 0; i < activeStages.length; i++) {
    const stage = activeStages[i];
    const tatMs = (stage.tat_hours || 24) * 60 * 60 * 1000;
    
    // Model 1: Planned to TAT to Planned (Static Baseline Timeline)
    const baselinePlannedStart = new Date(baselineAccumulator);
    const baselinePlannedFinish = new Date(baselineAccumulator + tatMs);
    baselineAccumulator += tatMs;
    
    // Model 2: Planned to Actual to TAT to Planned (Dynamic Cascading Timeline)
    const historyEntry = stageHistory[stage.id] || null;
    const actualCompletionDate = historyEntry?.completed_at ? new Date(historyEntry.completed_at) : null;
    
    const dynamicPlannedStart = new Date(dynamicAccumulator);
    const dynamicPlannedFinish = new Date(dynamicAccumulator + tatMs);
    
    let slaStatus = 'PENDING';
    let delayHours = 0;
    
    if (actualCompletionDate) {
      // Completed stage: evaluate variance
      const actualMs = actualCompletionDate.getTime();
      const varianceMs = actualMs - dynamicPlannedFinish.getTime();
      delayHours = Math.round(varianceMs / (1000 * 60 * 60));
      
      if (delayHours > 0) {
        slaStatus = 'DELAYED';
      } else {
        slaStatus = 'ON_TIME';
      }
      
      // Cascading for next stage: dynamic start becomes this actual finish
      dynamicAccumulator = actualMs;
    } else {
      // In-progress or future stage
      if (stage.id === currentStageId) {
        const nowMs = Date.now();
        if (nowMs > dynamicPlannedFinish.getTime()) {
          slaStatus = 'OVERDUE';
          delayHours = Math.round((nowMs - dynamicPlannedFinish.getTime()) / (1000 * 60 * 60));
        } else {
          slaStatus = 'IN_PROGRESS';
        }
      } else {
        slaStatus = 'UPCOMING';
      }
      dynamicAccumulator += tatMs;
    }
    
    timeline[stage.id] = {
      stageId: stage.id,
      stageName: stage.name,
      tatHours: stage.tat_hours,
      color: stage.color,
      textColor: stage.textColor,
      // Model 1
      baselinePlannedStart: baselinePlannedStart.toISOString(),
      baselinePlannedFinish: baselinePlannedFinish.toISOString(),
      // Model 2
      dynamicPlannedStart: dynamicPlannedStart.toISOString(),
      dynamicPlannedFinish: dynamicPlannedFinish.toISOString(),
      actualCompletionDate: actualCompletionDate ? actualCompletionDate.toISOString() : null,
      slaStatus,
      delayHours
    };
  }
  
  return {
    tatMode,
    currentStageId,
    timeline
  };
}

/**
 * 4. GET RECRUITER WORKLOAD LIMITS
 */
export async function getRecruiterWorkloadLimits(tenantId = 'TNT00002') {
  const tenantCode = normalizeTenantCode(tenantId);
  try {
    let allConfigs = {};
    try {
      const fileContent = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
      allConfigs = JSON.parse(fileContent);
    } catch (_) {
      allConfigs = {};
    }
    const tenantConfig = allConfigs[tenantCode] || allConfigs['TNT00002'] || {};

    // Live Server-Side Active Positions Counting (Bypasses client RLS)
    const activeCounts = {};
    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const adminClient = createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const { data: positions } = await adminClient
          .from('recruitment_positions')
          .select('id, recruiter_assigned, status')
          .in('status', ['S00', 'S01']);

        if (positions) {
          positions.forEach(p => {
            if (p.recruiter_assigned && p.recruiter_assigned !== 'All') {
              const key = String(p.recruiter_assigned).trim();
              activeCounts[key] = (activeCounts[key] || 0) + 1;
              if (key.includes('-')) {
                const baseName = key.split('-')[0].trim();
                activeCounts[baseName] = (activeCounts[baseName] || 0) + 1;
              }
            }
          });
        }
      }
    } catch (countErr) {
      console.warn('Failed to calculate active counts on server:', countErr);
    }

    return {
      success: true,
      tenantCode,
      workload_limits: tenantConfig.workload_limits || {},
      active_counts: activeCounts
    };
  } catch (err) {
    console.error('getRecruiterWorkloadLimits error:', err);
    return { success: false, error: err.message, workload_limits: {}, active_counts: {} };
  }
}

/**
 * 5. SAVE RECRUITER WORKLOAD LIMITS (Per-recruiter or batch)
 */
export async function saveRecruiterWorkloadLimits(tenantId = 'TNT00002', recruiterKey, limitData = {}) {
  const tenantCode = normalizeTenantCode(tenantId);
  try {
    let allConfigs = {};
    try {
      const fileContent = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
      allConfigs = JSON.parse(fileContent);
    } catch (_) {
      allConfigs = {};
    }
    if (!allConfigs[tenantCode]) {
      allConfigs[tenantCode] = { 'All Branches': { ...DEFAULT_CONFIG } };
    }
    if (!allConfigs[tenantCode].workload_limits) {
      allConfigs[tenantCode].workload_limits = {};
    }
    allConfigs[tenantCode].workload_limits[recruiterKey] = {
      ...(allConfigs[tenantCode].workload_limits[recruiterKey] || {}),
      ...limitData
    };
    await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(allConfigs, null, 2), 'utf-8');
    return {
      success: true,
      tenantCode,
      workload_limits: allConfigs[tenantCode].workload_limits
    };
  } catch (err) {
    console.error('saveRecruiterWorkloadLimits error:', err);
    return { success: false, error: err.message };
  }
}
