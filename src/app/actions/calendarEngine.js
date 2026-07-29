'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

export async function calculateStagePlannedCompletion(startIsoString, tatHours = 24) {
  const startDate = startIsoString ? new Date(startIsoString) : new Date();
  const completionDate = new Date(startDate.getTime() + tatHours * 60 * 60 * 1000);
  return completionDate.toISOString();
}

/**
 * Rolling Planning Mode:
 * Next Revised Planned = Previous Actual + Current TAT
 * If previous Actual is blank: Next Revised = Previous Baseline Planned + TAT
 */
export async function calculateRollingRevisedPlanned(previousActualIso, tatHours = 24, baselinePlannedIso = null) {
  const baseDate = previousActualIso 
    ? new Date(previousActualIso) 
    : (baselinePlannedIso ? new Date(baselinePlannedIso) : new Date());

  const revisedDate = new Date(baseDate.getTime() + tatHours * 60 * 60 * 1000);
  return revisedDate.toISOString();
}
