'use server';

import { getAdminClient } from '@/utils/supabase/adminClient';
import { sendAdminAccountEmailOtp } from './adminMessageConfig';

// Supabase owns OTP storage, expiry and verification across server instances.
// Never return email_otp, hashed_token or action_link to the unauthenticated client.
export async function requestEmailLoginOtp(email) {
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
    return { success: false, error: 'Please provide a valid official email address.' };
  }

  try {
    const adminClient = getAdminClient();
    // Quote PostgREST filter values and escape ILIKE wildcards for exact email matching.
    const emailPattern = cleanEmail.replace(/[\\%_]/g, character => `\\${character}`);
    const emailFilter = JSON.stringify(emailPattern);
    const { data: user, error } = await adminClient
      .from('user_roles')
      .select('user_id,email,emp_official_mail_id,emp_name,role,is_approved')
      .or(`email.ilike.${emailFilter},emp_official_mail_id.ilike.${emailFilter}`)
      .maybeSingle();

    const exactEmailMatch = [user?.email, user?.emp_official_mail_id]
      .some(address => typeof address === 'string' && address.trim().toLowerCase() === cleanEmail);
    if (error || !user?.user_id || !exactEmailMatch) {
      return { success: false, error: 'No workplace account found with this email. Please contact your administrator.' };
    }
    if (user.is_approved === false && !['admin', 'Admin'].includes(user.role)) {
      return { success: false, error: 'Your account is pending administrator approval before you can sign in.' };
    }

    // Use the existing Auth user's canonical address, including when an employee
    // signs in with their official-email alias. Do not create accounts via magiclink.
    const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(user.user_id);
    const verificationEmail = authData?.user?.email;
    if (authError || authData?.user?.id !== user.user_id || !verificationEmail) {
      return { success: false, error: 'Your login account could not be found. Please contact your administrator.' };
    }

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: verificationEmail,
    });
    const otp = linkData?.properties?.email_otp;
    if (linkError || linkData?.user?.id !== user.user_id || !/^\d{6,10}$/.test(otp || '')) {
      return { success: false, error: 'Authentication service temporarily unavailable. Please sign in with password.' };
    }

    const sent = await sendAdminAccountEmailOtp(cleanEmail, otp, 'login_otp', {
      name: user.emp_name || 'User',
      email: cleanEmail,
      company: 'Swan CRM',
    });
    if (!sent?.success) {
      return { success: false, error: 'Could not send the login email. Please try again shortly or sign in with password.' };
    }

    return {
      success: true,
      verificationEmail,
      otpLength: otp.length,
      message: `A ${otp.length}-digit login code has been sent to ${cleanEmail}. Use the latest email code.`,
    };
  } catch {
    return { success: false, error: 'Could not request a login code. Please try again shortly or sign in with password.' };
  }
}
