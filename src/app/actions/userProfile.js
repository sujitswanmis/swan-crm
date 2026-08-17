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
 * Uploads user profile photo to Supabase Storage and updates user metadata
 */
export async function uploadUserAvatar(formData) {
  try {
    const adminClient = getAdminClient();
    await ensureAvatarBucket(adminClient);

    const file = formData.get('file');
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

    let buffer;
    let fileExt = 'jpg';
    let fileType = 'image/jpeg';

    if (file && typeof file !== 'string' && typeof file.arrayBuffer === 'function') {
      // Validate size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        return { success: false, error: 'File size exceeds 10MB limit' };
      }

      fileExt = (file.name?.split('.').pop() || 'jpg').toLowerCase();
      if (fileExt === 'jpeg') fileExt = 'jpg';
      fileType = file.type || `image/${fileExt}`;

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (base64Data && typeof base64Data === 'string') {
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        fileType = matches[1];
        fileExt = fileType.split('/')[1] || 'jpg';
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(base64Data, 'base64');
      }
    } else {
      return { success: false, error: 'No image file or data provided' };
    }

    const fileName = `avatar_${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    // List and delete existing old avatars for this user to keep storage clean
    try {
      const { data: existingFiles } = await adminClient.storage.from(AVATAR_BUCKET).list(userId);
      if (existingFiles && existingFiles.length > 0) {
        const filesToRemove = existingFiles.map(f => `${userId}/${f.name}`);
        await adminClient.storage.from(AVATAR_BUCKET).remove(filesToRemove);
      }
    } catch (cleanErr) {
      console.warn('Could not clean old avatars:', cleanErr);
    }

    // Upload new avatar to Supabase Storage
    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from(AVATAR_BUCKET)
      .upload(filePath, buffer, {
        contentType: fileType,
        upsert: true
      });

    if (uploadError) {
      console.error('Avatar storage upload error:', uploadError);
      return { success: false, error: uploadError.message };
    }

    // Get permanent public URL
    const { data: publicUrlData } = adminClient.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData?.publicUrl;
    if (!publicUrl) {
      return { success: false, error: 'Failed to generate public avatar URL' };
    }

    // Update user_metadata in Supabase Auth
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
