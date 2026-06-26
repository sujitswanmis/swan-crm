'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

export async function getPositionDetails(positionId) {
  if (!positionId) return null;
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('recruitment_positions')
    .select('*')
    .eq('id', positionId)
    .single();

  if (error) {
    console.error('Error fetching position details:', error);
    return null;
  }
  return data;
}

export async function uploadResumeToServer(fileName, base64Data) {
  try {
    const adminClient = getAdminClient();
    const buffer = Buffer.from(base64Data, 'base64');
    
    const fileExt = fileName.split('.').pop();
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `resumes/${uniqueName}`;

    const { data, error } = await adminClient.storage
      .from('recruitment_resumes')
      .upload(filePath, buffer, {
        contentType: getContentType(fileExt),
        duplex: 'half'
      });

    if (error) {
      console.error('Storage upload error:', error);
      return { success: false, error: error.message };
    }

    const { data: publicUrlData } = adminClient.storage
      .from('recruitment_resumes')
      .getPublicUrl(filePath);

    return { success: true, url: publicUrlData.publicUrl };
  } catch (err) {
    console.error('Exception in uploadResumeToServer:', err);
    return { success: false, error: err.message };
  }
}

export async function submitApplication(positionId, formData) {
  try {
    const adminClient = getAdminClient();
    
    const expected_salary_min = formData.expected_salary_min ? parseInt(formData.expected_salary_min) : null;
    const expected_salary_max = formData.expected_salary_max ? parseInt(formData.expected_salary_max) : null;

    // Insert candidate
    const { data, error } = await adminClient
      .from('recruitment_candidates')
      .insert([{
        position_id: positionId,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        expected_salary_min,
        expected_salary_max,
        resume_url: formData.resume_url || '',
        current_stage: 'S02',
        candidate_status: 'Awaiting Screening',
        created_by: 'Online Application'
      }])
      .select()
      .single();

    if (error) {
      console.error('Error submitting application:', error);
      return { success: false, error: error.message };
    }

    // Get position details to log a rich note
    const { data: posData } = await adminClient
      .from('recruitment_positions')
      .select('title')
      .eq('id', positionId)
      .single();

    const posTitle = posData?.title || 'this position';

    // Insert log note
    await adminClient
      .from('recruitment_candidate_notes')
      .insert([{
        candidate_id: data.id,
        note_text: `Candidate applied online for "${posTitle}" via public application link.`,
        created_by: 'System'
      }]);

    return { success: true };
  } catch (err) {
    console.error('Exception in submitApplication:', err);
    return { success: false, error: err.message };
  }
}

function getContentType(ext) {
  switch (ext.toLowerCase()) {
    case 'pdf': return 'application/pdf';
    case 'doc': return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'txt': return 'text/plain';
    default: return 'application/octet-stream';
  }
}
