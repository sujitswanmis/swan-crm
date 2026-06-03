'use server';

import { createClient } from '@/utils/supabase/server';

export async function getDashboardMetrics(leadIds, dateFilter = 'Today') {
  if (!leadIds || leadIds.length === 0) {
    return { success: true, data: { employeeActivity: [], whatsappStats: { period: 0, total: 0 } } };
  }

  try {
    const supabase = await createClient();
    
    let startDate = null;
    const now = new Date();
    if (dateFilter === 'Today') {
      startDate = new Date(now.setHours(0,0,0,0)).toISOString();
    } else if (dateFilter === 'Last 7 Days') {
      startDate = new Date(now.setDate(now.getDate() - 7)).toISOString();
    } else if (dateFilter === 'This Month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    } // 'All Time' leaves startDate as null

    // We no longer query lead_notes here because it's too large for a single GET request
    // and the client already has lead_notes embedded in the `leads` object.

    // Fetch WhatsApp stats using Chunking to prevent 414 URI Too Long
    let totalWaCount = 0;
    let periodWaCount = 0;
    const chunkSize = 200; // Small chunk to be super safe with URL length

    for (let i = 0; i < leadIds.length; i += chunkSize) {
      const chunk = leadIds.slice(i, i + chunkSize);

      // Total
      const { count: tCount, error: err1 } = await supabase
        .from('whatsapp_message_logs')
        .select('*', { count: 'exact', head: true })
        .in('lead_id', chunk)
        .not('status', 'ilike', 'failed%');
      
      if (!err1) totalWaCount += (tCount || 0);

      // Period
      if (startDate) {
        const { count: pCount, error: err2 } = await supabase
          .from('whatsapp_message_logs')
          .select('*', { count: 'exact', head: true })
          .in('lead_id', chunk)
          .gte('created_at', startDate)
          .not('status', 'ilike', 'failed%');
        if (!err2) periodWaCount += (pCount || 0);
      } else {
        periodWaCount += (tCount || 0);
      }
    }

    return { 
      success: true, 
      data: { 
        employeeActivity: [], // Handled on client now
        whatsappStats: { period: periodWaCount, total: totalWaCount } 
      } 
    };

  } catch (error) {
    console.error('Error fetching analytics:', error);
    return { success: false, error: error.message };
  }
}
