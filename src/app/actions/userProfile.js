'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/utils/supabase/server';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const AVATAR_BUCKET = 'avatars';

/**
 * Ensures the avatars storage bucket exists and is public
 */
async function ensureAvatarBucket(adminClient) {
  try {
    const { data: buckets } = await adminClient.storage.listBuckets();
    if (!buckets?.some(b => b.name === AVATAR_BUCKET)) {
      await adminClient.storage.createBucket(AVATAR_BUCKET, {
        public: true,
        fileSizeLimit: 10485760, // 10MB
        allowedMimeTypes: null
      });
    }
  } catch (err) {
    console.warn('Bucket check/create error (non-fatal):', err);
  }
}

/**
 * Uploads user profile photo to user metadata and auth instantly without hanging
 */
export async function uploadUserAvatar(formData) {
  try {
    const adminClient = getAdminClient();
    const base64Data = formData.get('base64');
    let userId = formData.get('userId');

    // If userId not explicitly provided, try to resolve from server session cookies
    if (!userId) {
      try {
        const serverClient = await createServerAuthClient();
        const { data: { user } } = await serverClient.auth.getUser();
        if (user?.id) userId = user.id;
      } catch (sessErr) {
        console.warn('Could not extract user from session:', sessErr);
      }
    }

    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    const finalAvatarUrl = typeof base64Data === 'string' && base64Data.startsWith('data:') ? base64Data : null;

    if (!finalAvatarUrl) {
      return { success: false, error: 'No valid image data provided' };
    }

    // 1. Instantly update user_metadata in Supabase Auth (takes ~150ms)
    try {
      const { data: userData } = await adminClient.auth.admin.getUserById(userId);
      const currentMeta = userData?.user?.user_metadata || {};
      await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...currentMeta,
          avatar_url: finalAvatarUrl
        }
      });
    } catch (metaErr) {
      console.warn('Error updating user_metadata in auth:', metaErr);
    }

    // 2. Also update user_roles table if column exists
    try {
      await adminClient
        .from('user_roles')
        .update({ avatar_url: finalAvatarUrl })
        .eq('user_id', userId);
    } catch (dbErr) {}

    return {
      success: true,
      avatarUrl: finalAvatarUrl
    };
  } catch (err) {
    console.error('Unhandled error in uploadUserAvatar:', err);
    return { success: false, error: err.message || 'Server error during avatar upload' };
  }
}

/**
 * Removes user profile photo from Supabase Storage and clears user metadata
 */
export async function removeUserAvatar(userId) {
  try {
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    const adminClient = getAdminClient();

    // Remove files from storage
    try {
      const { data: existingFiles } = await adminClient.storage.from(AVATAR_BUCKET).list(userId);
      if (existingFiles && existingFiles.length > 0) {
        const filesToRemove = existingFiles.map(f => `${userId}/${f.name}`);
        await adminClient.storage.from(AVATAR_BUCKET).remove(filesToRemove);
      }
    } catch (cleanErr) {
      console.warn('Could not clean avatar files from bucket:', cleanErr);
    }

    // Remove from auth user_metadata
    try {
      const { data: userData } = await adminClient.auth.admin.getUserById(userId);
      const currentMeta = userData?.user?.user_metadata || {};
      const { avatar_url, ...restMeta } = currentMeta;
      await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...restMeta,
          avatar_url: null
        }
      });
    } catch (metaErr) {
      console.warn('Error clearing avatar_url in auth metadata:', metaErr);
    }

    return { success: true };
  } catch (err) {
    console.error('Unhandled error in removeUserAvatar:', err);
    return { success: false, error: err.message || 'Server error during avatar removal' };
  }
}

/**
 * Fetches user avatar URL from user metadata
 */
export async function getUserAvatar(userId) {
  try {
    if (!userId) return null;
    const adminClient = getAdminClient();
    const { data: userData, error } = await adminClient.auth.admin.getUserById(userId);
    if (error || !userData?.user) return null;
    return userData.user.user_metadata?.avatar_url || null;
  } catch (err) {
    console.warn('Error fetching user avatar:', err);
    return null;
  }
}
