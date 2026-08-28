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
 * Uploads user profile photo to Supabase Storage and updates user metadata for all devices
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

    if (!base64Data || typeof base64Data !== 'string') {
      return { success: false, error: 'No valid image data provided' };
    }

    // 1. Convert base64 data to JPEG buffer and upload to public Supabase Storage
    let publicUrl = null;
    try {
      const matches = base64Data.match(/^data:image\/([A-Za-z-+]+);base64,(.+)$/);
      let buffer;
      let ext = 'jpg';
      if (matches && matches[2]) {
        ext = matches[1] === 'png' ? 'png' : 'jpg';
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
        buffer = Buffer.from(cleanBase64, 'base64');
      }

      const filePath = `${userId}/avatar_${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadErr } = await adminClient.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, buffer, {
          contentType: `image/${ext}`,
          upsert: true
        });

      if (!uploadErr) {
        const { data: pubData } = adminClient.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
        publicUrl = pubData?.publicUrl;
      } else {
        console.warn('Storage upload notice:', uploadErr.message);
      }
    } catch (storageErr) {
      console.warn('Storage exception notice:', storageErr.message);
    }

    if (!publicUrl) {
      return { success: false, error: 'Failed to upload photo to cloud storage' };
    }

    // 2. Instantly update user_metadata in Supabase Auth with the short CDN URL
    try {
      const { data: userData } = await adminClient.auth.admin.getUserById(userId);
      const currentMeta = userData?.user?.user_metadata || {};
      await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...currentMeta,
          avatar_url: publicUrl
        }
      });
    } catch (metaErr) {
      console.warn('Error updating user_metadata in auth:', metaErr);
    }

    return {
      success: true,
      avatarUrl: publicUrl
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
