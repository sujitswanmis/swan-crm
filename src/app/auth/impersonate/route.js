import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token");
  const adminRestoreToken = requestUrl.searchParams.get("restore");
  const targetName = requestUrl.searchParams.get("name") || "Employee";
  const targetRole = requestUrl.searchParams.get("role") || "agent";
  const origin = requestUrl.origin;

  if (!tokenHash) {
    return NextResponse.redirect(`${origin}/auth/impersonate/expired?reason=missing`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });

  if (error || !data?.session) {
    console.error("Failed to verify impersonation token:", error);
    return NextResponse.redirect(`${origin}/auth/impersonate/expired?reason=invalid`);
  }

  // Pre-activate user session in user_sessions to prevent any stale termination popup
  try {
    const adminClient = getAdminClient();
    await adminClient.from("user_sessions")
      .update({ is_active: true, last_active: new Date().toISOString() })
      .eq("user_id", data.user.id);
  } catch (e) {
    console.error("Failed to set active session on impersonate:", e);
  }

  const destination = (targetRole || "").toLowerCase() === "customer" ? "/chat" : "/";
  const response = NextResponse.redirect(`${origin}${destination}`);

  // Set restore cookie so admin can switch back in 1 click
  if (adminRestoreToken) {
    response.cookies.set("crm_admin_restore_token", adminRestoreToken, {
      path: "/",
      httpOnly: false,
      maxAge: 60 * 60 * 24,
      sameSite: "lax",
    });
  }

  response.cookies.set(
    "crm_impersonator_info",
    JSON.stringify({
      impersonated: true,
      name: targetName,
      role: targetRole,
      loggedAt: new Date().toISOString(),
    }),
    {
      path: "/",
      httpOnly: false,
      maxAge: 60 * 60 * 24,
      sameSite: "lax",
    }
  );

  return response;
}
