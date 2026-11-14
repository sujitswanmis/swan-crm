import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/utils/supabase/server';
import { getManagedFieldTasks } from '@/app/actions/fieldTasks';
import { getTenantCustomForms } from '@/app/actions/fieldFormStudio';
import { getTeamMembers } from '@/app/actions/team';

export const dynamic = 'force-dynamic';

function buildTeamBranchScope(branchAccess, adminCompanyFilter) {
  if (branchAccess && typeof branchAccess === 'object') {
    return {
      scope: branchAccess.scope,
      isAllBranches: branchAccess.isAllBranches,
      allowedCompanies: branchAccess.allowedCompanies,
      allowedBranchNames: branchAccess.allowedBranchNames,
      allowedBranchCodes: branchAccess.allowedBranchCodes,
      selectedFilter: adminCompanyFilter || 'All',
    };
  }
  if (adminCompanyFilter && adminCompanyFilter !== 'All') {
    return { selectedFilter: adminCompanyFilter };
  }
  return null;
}

/**
 * Authenticated Field Task Manager sync endpoint.
 * Runs outside Next.js Server Action FIFO queue so initial load & delta sync execute immediately in parallel.
 */
export async function POST(request) {
  try {
    const supabase = await createServerAuthClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      viewScope = 'assigned_by_me',
      currentUserId = null,
      company = 'TNT00001',
      tenantId = null,
      branchAccess = null,
      adminCompanyFilter = 'All',
      since = null,
      includeActiveIds = false,
      includeMeta = false,
      limit = 500,
    } = body || {};

    const tasksPromise = getManagedFieldTasks({
      viewScope,
      currentUserId: currentUserId || user.id,
      company,
      tenantId,
      branchAccess,
      adminCompanyFilter,
      limit,
      since,
      includeActiveIds: Boolean(includeActiveIds),
    });

    if (includeMeta) {
      const branchScope = buildTeamBranchScope(branchAccess, adminCompanyFilter);
      const [tasksRes, formsData, membersData] = await Promise.all([
        tasksPromise,
        getTenantCustomForms(company),
        getTeamMembers(company, tenantId, branchScope),
      ]);
      return NextResponse.json(
        {
          ...tasksRes,
          forms: Array.isArray(formsData) ? formsData : [],
          teamMembers: Array.isArray(membersData) ? membersData : [],
        },
        {
          status: tasksRes?.success === false ? 500 : 200,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }

    const tasksRes = await tasksPromise;
    return NextResponse.json(tasksRes, {
      status: tasksRes?.success === false ? 500 : 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('Field tasks sync API error:', err);
    return NextResponse.json(
      { success: false, tasks: [], error: err?.message || 'Failed to sync field tasks' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
