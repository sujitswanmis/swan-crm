import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { saveImpersonateToken } from "@/lib/impersonateStore";
import { getAdminClient } from "@/utils/supabase/adminClient";

/**
 * POST /api/admin/impersonate-token
 * Generates a one-time temporary impersonation link (expires in 5 minutes, single use).
 * Body: { targetUserId }
 */
export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const adminClient = getAdminClient();

    // Verify caller is admin
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role, emp_name, email")
      .eq("user_id", user.id)
      .maybeSingle();

    const isAdmin = callerRole?.role === "admin" || callerRole?.role === "Admin";
    if (!isAdmin) {
      return NextResponse.json({ error: "Permission denied." }, { status: 403 });
    }

    const body = await request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId required." }, { status: 400 });
    }

    // Fetch target user
    const { data: targetUser, error: targetError } = await adminClient
      .from("user_roles")
      .select("user_id, email, emp_official_mail_id, emp_name, role")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (targetError || !targetUser) {
      return NextResponse.json({ error: "Target employee not found." }, { status: 404 });
    }

    const targetEmail = targetUser.email || targetUser.emp_official_mail_id;
    if (!targetEmail) {
      return NextResponse.json({ error: "Target employee has no registered email." }, { status: 400 });
    }

    // Generate magic link for target user
    const linkRes = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: targetEmail,
    });

    if (!linkRes.data?.properties?.hashed_token) {
      return NextResponse.json({ error: "Failed to generate session token." }, { status: 500 });
    }

    // Generate admin restore token
    const adminEmail = callerRole?.email || user.email;
    let adminRestoreToken = null;
    if (adminEmail) {
      const adminLinkRes = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: adminEmail,
      });
      adminRestoreToken = adminLinkRes.data?.properties?.hashed_token || null;
    }

    // Store one-time key in memory (expires 5 min, single use)
    const oneTimeKey = saveImpersonateToken({
      tokenHash: linkRes.data.properties.hashed_token,
      adminRestoreToken,
      name: targetUser.emp_name || targetEmail,
      role: targetUser.role || "agent",
    });

    return NextResponse.json({ key: oneTimeKey });
  } catch (err) {
    console.error("impersonate-token error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
