import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getIstDateRange(dateStr) {
  // If dateStr is like "2026-08-23", calculate IST (UTC+05:30) boundaries in UTC ISO format
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  let targetDate = dateStr;
  if (!targetDate || !datePattern.test(targetDate)) {
    // Default to today in IST
    targetDate = new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0];
  }
  const startUtc = new Date(new Date(`${targetDate}T00:00:00+05:30`).getTime()).toISOString();
  const endUtc = new Date(new Date(`${targetDate}T23:59:59.999+05:30`).getTime()).toISOString();
  return { targetDate, startUtc, endUtc };
}

const tools = [
  {
    type: "function",
    function: {
      name: "get_daily_team_activity_summary",
      description: "Get a comprehensive employee-wise daily work summary (who did what, leads created, calls made, stage changes, assignments, notes, follow-ups) for today or any specific date. MUST be called whenever the user asks for 'aaj ka summary', 'daily report', 'kaun kya kam kia', 'employee wise work summary', 'team performance today', or daily activity.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "The date in YYYY-MM-DD format (e.g. '2026-08-23'). Defaults to today."
          },
          scope: {
            type: "string",
            enum: ["me", "all"],
            description: "If user is Admin, use 'all'. Otherwise 'me'."
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_employee_daily_activity",
      description: "Get a detailed breakdown of work done by a specific employee (leads created, stage changes, calls made, notes, follow-ups) on a given date.",
      parameters: {
        type: "object",
        properties: {
          emp_name: {
            type: "string",
            description: "The name or email of the employee (e.g. 'Kajal Goyal', 'Nitya', 'Saloni Singh', 'Harmanjot Kaur')"
          },
          date: {
            type: "string",
            description: "The date in YYYY-MM-DD format (e.g., '2026-08-23'). Defaults to today."
          }
        },
        required: ["emp_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_leads_summary",
      description: "Get a summary of leads grouped by status. Useful for answering questions like 'how many leads do I have?' or 'status count'.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["me", "all"],
            description: "If the user asks for 'my leads', use 'me'. If the user asks for 'all leads' or 'team leads' (and they are an admin), use 'all'."
          }
        },
        required: ["scope"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_leads",
      description: "Search leads by company name, contact person, phone, email, or Lead Ref ID.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search term (company, name, phone, lead_ref_id)"
          },
          scope: {
            type: "string",
            enum: ["me", "all"],
            description: "If the user is an Admin, ALWAYS default to 'all' unless they specifically say 'my personal leads'. For normal users, use 'me'."
          }
        },
        required: ["query", "scope"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_recent_follow_ups",
      description: "Get leads that have a follow-up scheduled for today or are overdue.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["me", "all"],
            description: "Scope of follow-ups ('me' for user's own, 'all' for entire team)."
          }
        },
        required: ["scope"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_leads_by_date",
      description: "Get leads that were created or followed up on a specific date (e.g. 'yesterday', 'today', or specific YYYY-MM-DD).",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "The date in YYYY-MM-DD format (e.g., '2026-08-23')."
          },
          scope: {
            type: "string",
            enum: ["me", "all"],
            description: "Scope of leads ('me' for user's own, 'all' for entire team)."
          }
        },
        required: ["date", "scope"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_users_summary",
      description: "Get the total count of registered users/employees/agents in the CRM system, grouped by role.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_users",
      description: "Search for an employee, agent, or user by their name, email, employee ID, or department.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The name, email, or employee ID to search for."
          }
        },
        required: ["query"]
      }
    }
  }
];

async function executeTool(toolCall, userId, isAdmin) {
  const name = toolCall.function.name;
  let args = {};
  try {
    args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
  } catch (e) {
    // Ignore parse error
  }
  
  const scope = isAdmin && args.scope === 'all' ? 'all' : (isAdmin ? 'all' : 'me');
  
  try {
    if (name === 'get_daily_team_activity_summary') {
      const { targetDate, startUtc, endUtc } = getIstDateRange(args.date);

      // Fetch audit logs for the day
      let allAudit = [];
      let page = 0;
      while (true) {
        let q = supabase
          .from('audit_logs')
          .select('id, emp_name, email, user_id, action, target, created_at')
          .gte('created_at', startUtc)
          .lte('created_at', endUtc)
          .range(page * 1000, (page + 1) * 1000 - 1);
        
        if (scope === 'me') {
          q = q.eq('user_id', userId);
        }

        const { data, error } = await q;
        if (error || !data || data.length === 0) break;
        allAudit = allAudit.concat(data);
        if (data.length < 1000) break;
        page++;
      }

      // Fetch lead notes for the day
      const { data: todayNotes } = await supabase
        .from('lead_notes')
        .select('id, lead_id, note_text, created_by, created_at')
        .gte('created_at', startUtc)
        .lte('created_at', endUtc);

      // Group by employee
      const employees = {};

      allAudit.forEach(log => {
        const emp = log.emp_name || log.email || 'System User';
        if (!employees[emp]) {
          employees[emp] = {
            emp_name: emp,
            total_actions: 0,
            leads_created_count: 0,
            leads_created_sample: [],
            stage_changes_count: 0,
            stage_breakdown: {},
            leads_assigned_count: 0,
            follow_ups_set_count: 0,
            notes_count: 0
          };
        }
        employees[emp].total_actions++;

        if (log.action === 'Create Lead') {
          employees[emp].leads_created_count++;
          if (employees[emp].leads_created_sample.length < 5) {
            employees[emp].leads_created_sample.push(log.target.replace(/^Created New Lead:\s*/i, ''));
          }
        } else if (log.action === 'Stage Changed') {
          employees[emp].stage_changes_count++;
          const match = log.target.match(/to\s+"([^"]+)"/i);
          const stageName = match ? match[1].split('>').pop() || match[1] : 'Updated';
          employees[emp].stage_breakdown[stageName] = (employees[emp].stage_breakdown[stageName] || 0) + 1;
        } else if (log.action === 'Assign Lead') {
          employees[emp].leads_assigned_count++;
        } else if (log.action === 'Set Follow-up' || (log.target && log.target.toLowerCase().includes('follow-up'))) {
          employees[emp].follow_ups_set_count++;
        }
      });

      (todayNotes || []).forEach(note => {
        const noteAuthor = note.created_by || 'Unknown';
        let matchedKey = Object.keys(employees).find(e => e.toLowerCase().includes(noteAuthor.toLowerCase()) || noteAuthor.toLowerCase().includes(e.toLowerCase()));
        if (!matchedKey) {
          if (scope === 'all' || noteAuthor.toLowerCase().includes(userId.toLowerCase())) {
            matchedKey = noteAuthor;
            employees[matchedKey] = {
              emp_name: matchedKey,
              total_actions: 0,
              leads_created_count: 0,
              leads_created_sample: [],
              stage_changes_count: 0,
              stage_breakdown: {},
              leads_assigned_count: 0,
              follow_ups_set_count: 0,
              notes_count: 0
            };
          }
        }
        if (matchedKey && employees[matchedKey]) {
          employees[matchedKey].notes_count++;
        }
      });

      const employeeList = Object.values(employees).sort((a, b) => (b.total_actions + b.notes_count) - (a.total_actions + a.notes_count));

      return JSON.stringify({
        date: targetDate,
        total_team_actions: allAudit.length,
        total_notes_written: (todayNotes || []).length,
        active_employees_count: employeeList.length,
        employees_summary: employeeList
      });
    }

    if (name === 'get_employee_daily_activity') {
      const { targetDate, startUtc, endUtc } = getIstDateRange(args.date);
      const empSearch = (args.emp_name || '').trim();

      // Query audit logs
      const { data: empLogs } = await supabase
        .from('audit_logs')
        .select('id, emp_name, action, target, created_at')
        .gte('created_at', startUtc)
        .lte('created_at', endUtc)
        .or(`emp_name.ilike.%${empSearch}%,email.ilike.%${empSearch}%`)
        .order('created_at', { ascending: false });

      // Query lead notes
      const { data: empNotes } = await supabase
        .from('lead_notes')
        .select('id, lead_id, note_text, created_by, created_at')
        .gte('created_at', startUtc)
        .lte('created_at', endUtc)
        .ilike('created_by', `%${empSearch}%`)
        .order('created_at', { ascending: false });

      const logsList = empLogs || [];
      const notesList = empNotes || [];

      if (logsList.length === 0 && notesList.length === 0) {
        return JSON.stringify({
          employee: empSearch,
          date: targetDate,
          summary: `No activity recorded for ${empSearch} on ${targetDate}.`
        });
      }

      const stageBreakdown = {};
      const leadsCreated = [];
      const leadsAssigned = [];
      const followUpsSet = [];

      logsList.forEach(log => {
        if (log.action === 'Create Lead') {
          leadsCreated.push(log.target.replace(/^Created New Lead:\s*/i, ''));
        } else if (log.action === 'Stage Changed') {
          const match = log.target.match(/to\s+"([^"]+)"/i);
          const stageName = match ? match[1].split('>').pop() || match[1] : 'Updated';
          stageBreakdown[stageName] = (stageBreakdown[stageName] || 0) + 1;
        } else if (log.action === 'Assign Lead') {
          leadsAssigned.push(log.target);
        } else if (log.action === 'Set Follow-up') {
          followUpsSet.push(log.target);
        }
      });

      return JSON.stringify({
        employee: empSearch,
        date: targetDate,
        total_actions: logsList.length,
        total_notes: notesList.length,
        leads_created_count: leadsCreated.length,
        leads_created_sample: leadsCreated.slice(0, 10),
        stage_changes_count: Object.values(stageBreakdown).reduce((a, b) => a + b, 0),
        stage_breakdown: stageBreakdown,
        leads_assigned_count: leadsAssigned.length,
        notes_sample: notesList.slice(0, 5).map(n => n.note_text),
        recent_activity_logs: logsList.slice(0, 15).map(l => ({ action: l.action, detail: l.target, time: l.created_at }))
      });
    }

    if (name === 'get_leads_summary' || name === 'get_my_leads_summary') {
      let allData = [];
      let page = 0;
      while (true) {
        let query = supabase.from('leads').select('status').range(page * 1000, (page + 1) * 1000 - 1);
        if (scope === 'me') query = query.eq('assigned_to', userId);
          
        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        
        allData = allData.concat(data);
        if (data.length < 1000) break;
        page++;
      }
      
      const summary = allData.reduce((acc, lead) => {
        acc[lead.status] = (acc[lead.status] || 0) + 1;
        return acc;
      }, {});
      
      return JSON.stringify({ total: allData.length, summary, scope_applied: scope });
    }
    
    if (name === 'search_leads' || name === 'search_my_leads') {
      let q = (args.query || '').trim();
      const cleanDigits = q.replace(/[^0-9]/g, '');
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
      const is15Digit = /^\d{15}$/.test(q);

      let query = supabase
        .from('leads')
        .select('id, lead_ref_id, name, company, phone, business_contact_1, business_contact_2, business_alt_1, cp1_name, cp1_mobile_2, cp2_name, cp2_mobile_1, city_name, district_name, state_name, status, assigned_to, follow_up_date, requirement');
        
      if (isUUID) {
        query = query.eq('id', q);
      } else if (is15Digit) {
        query = query.eq('lead_ref_id', q);
      } else {
        const orConditions = [
          `name.ilike.%${q}%`,
          `company.ilike.%${q}%`,
          `lead_ref_id.ilike.%${q}%`,
          `phone.ilike.%${q}%`,
          `business_contact_1.ilike.%${q}%`,
          `business_contact_2.ilike.%${q}%`,
          `business_alt_1.ilike.%${q}%`,
          `cp1_name.ilike.%${q}%`,
          `cp1_mobile_2.ilike.%${q}%`,
          `cp2_name.ilike.%${q}%`,
          `cp2_mobile_1.ilike.%${q}%`,
          `cp3_name.ilike.%${q}%`,
          `cp3_mobile_1.ilike.%${q}%`,
          `city_name.ilike.%${q}%`,
          `district_name.ilike.%${q}%`
        ];

        if (cleanDigits.length >= 4 && cleanDigits !== q) {
          orConditions.push(
            `phone.ilike.%${cleanDigits}%`,
            `business_contact_1.ilike.%${cleanDigits}%`,
            `business_contact_2.ilike.%${cleanDigits}%`,
            `cp1_mobile_2.ilike.%${cleanDigits}%`,
            `cp2_mobile_1.ilike.%${cleanDigits}%`
          );
        }

        query = query.or(orConditions.join(','));
      }
        
      if (scope === 'me') query = query.eq('assigned_to', userId);
      query = query.limit(10);
        
      let { data, error } = await query;
      if (error) throw error;

      // If no exact match found and user typed a phone number, attempt partial matching (last 7-8 digits)
      if ((!data || data.length === 0) && cleanDigits.length >= 7) {
        const partialDigits = cleanDigits.slice(-7);
        const partialOr = [
          `phone.ilike.%${partialDigits}%`,
          `business_contact_1.ilike.%${partialDigits}%`,
          `business_contact_2.ilike.%${partialDigits}%`,
          `cp1_mobile_2.ilike.%${partialDigits}%`,
          `cp2_mobile_1.ilike.%${partialDigits}%`
        ].join(',');

        let fallbackQuery = supabase
          .from('leads')
          .select('id, lead_ref_id, name, company, phone, business_contact_1, business_contact_2, cp1_name, cp2_name, cp2_mobile_1, city_name, district_name, status, assigned_to, follow_up_date, requirement')
          .or(partialOr)
          .limit(5);

        if (scope === 'me') fallbackQuery = fallbackQuery.eq('assigned_to', userId);
        const { data: fallbackData } = await fallbackQuery;
        if (fallbackData && fallbackData.length > 0) {
          data = fallbackData;
        }
      }

      return JSON.stringify({ results: data || [], scope_applied: scope });
    }
    
    if (name === 'get_users_summary') {
      const { data, error } = await supabase.from('user_roles').select('role, is_approved');
      if (error) throw error;
      const summary = data.reduce((acc, user) => {
        const key = `${user.role} (${user.is_approved ? 'Approved' : 'Pending'})`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      return JSON.stringify({ total_users: data.length, breakdown: summary });
    }
    
    if (name === 'search_users') {
      const { data, error } = await supabase
        .from('user_roles')
        .select('emp_id, emp_name, email, role, emp_department, emp_designation, is_approved, emp_mobile')
        .or(`emp_name.ilike.%${args.query}%,email.ilike.%${args.query}%,emp_id.ilike.%${args.query}%,emp_mobile.ilike.%${args.query}%`)
        .limit(10);
      if (error) throw error;
      return JSON.stringify({ results: data });
    }
    
    if (name === 'get_recent_follow_ups') {
      const { targetDate } = getIstDateRange();
      let query = supabase
        .from('leads')
        .select('lead_ref_id, name, company, phone, status, assigned_to, follow_up_date')
        .lte('follow_up_date', targetDate)
        .neq('status', 'Converted')
        .order('follow_up_date', { ascending: true })
        .limit(15);
        
      if (scope === 'me') query = query.eq('assigned_to', userId);
        
      const { data, error } = await query;
      if (error) throw error;
      return JSON.stringify({ follow_ups: data, scope_applied: scope });
    }
    
    if (name === 'get_leads_by_date') {
      const { targetDate, startUtc, endUtc } = getIstDateRange(args.date);
      let query = supabase
        .from('leads')
        .select('lead_ref_id, name, company, phone, status, assigned_to, follow_up_date, created_at')
        .or(`and(created_at.gte.${startUtc},created_at.lte.${endUtc}),follow_up_date.eq.${targetDate}`)
        .order('created_at', { ascending: false })
        .limit(20);
        
      if (scope === 'me') query = query.eq('assigned_to', userId);
        
      const { data, error } = await query;
      if (error) throw error;
      return JSON.stringify({ leads: data, date: targetDate, scope_applied: scope });
    }
    
    return JSON.stringify({ error: 'Tool not found' });
  } catch (error) {
    return JSON.stringify({ error: error.message });
  }
}

export async function POST(req) {
  try {
    const { messages, userId, selectedAiModel } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required for AI usage tracking. Please refresh the page.' }, { status: 400 });
    }

    const selectedAiModelInput = selectedAiModel || 'gpt-4o-mini';

    // New check: Is user an Admin or Customer?
    const { data: userRoleData } = await supabase.from('user_roles').select('role, module_access').eq('user_id', userId).single();
    const isAdmin = userRoleData?.role === 'admin';
    const isCustomer = userRoleData?.role === 'customer';
    const assignedAiModels = (userRoleData?.module_access || {}).ai_models || ['gpt-4o-mini'];
    const premiumLimit = (userRoleData?.module_access || {}).premium_limit || 10000;

    let assignedAiModel = 'gpt-4o-mini';
    if (assignedAiModels.includes(selectedAiModelInput)) {
      assignedAiModel = selectedAiModelInput;
    } else if (assignedAiModels.length > 0) {
      assignedAiModel = assignedAiModels[0];
    }

    // 1. Check AI Token Usage
    const { data: usageData, error: usageError } = await supabase
      .from('ai_token_usage')
      .select('total_tokens, token_limit')
      .eq('user_id', userId)
      .single();

    if (usageData && usageData.total_tokens >= usageData.token_limit) {
      return NextResponse.json({ error: 'Token limit exceeded. Please contact your admin.' }, { status: 403 });
    }

    // Premium Limit Fallback Logic
    let isPremiumFallback = false;
    if (assignedAiModel !== 'gpt-4o-mini' && assignedAiModel !== 'gpt-3.5-turbo') {
      if (usageData && usageData.total_tokens >= premiumLimit) {
        assignedAiModel = 'gpt-4o-mini'; // Fallback to basic model
        isPremiumFallback = true;
      }
    }

    // Model translation mapping for custom model names
    const modelMapping = {
      'gpt-5.5-instant': 'gpt-4o-mini',
      'gpt-5.5-thinking': 'o3-mini',
      'gpt-5.5-pro': 'gpt-4o'
    };
    
    let resolvedModel = assignedAiModel;
    if (modelMapping[assignedAiModel]) {
      resolvedModel = modelMapping[assignedAiModel];
    }

    if (!usageError && usageData) {
      const currentTokens = Number(usageData.total_tokens) || 0;
      if (currentTokens >= usageData.token_limit) {
        return NextResponse.json({ error: 'Token limit exceeded. Please contact your administrator to increase your AI allowance.' }, { status: 403 });
      }
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key is missing on the server' }, { status: 500 });
    }

    // --- RAG Knowledge Base Retrieval ---
    let knowledgeContext = "";
    try {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        const queryText = typeof lastUserMsg.content === 'string' 
          ? lastUserMsg.content 
          : Array.isArray(lastUserMsg.content) 
            ? lastUserMsg.content.filter(c => c.type === 'text').map(c => c.text).join(' ') 
            : '';

        if (queryText.trim().length > 5) {
          const embRes = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: 'text-embedding-3-small', input: queryText })
          });
          if (embRes.ok) {
            const embData = await embRes.json();
            const queryEmbedding = embData.data[0].embedding;
            
            const { data: matchedDocs } = await supabase.rpc('match_company_documents', {
              query_embedding: queryEmbedding,
              match_threshold: 0.25,
              match_count: 3
            });
            
            if (matchedDocs && matchedDocs.length > 0) {
              knowledgeContext = "\n\n--- COMPANY KNOWLEDGE BASE ---\nUse the following official company rules/policies to answer the user if relevant:\n\n" + 
                matchedDocs.map(d => {
                  const cleanTitle = d.title.replace(/^\[(text|url|pdf)\]/, '');
                  return `Title: ${cleanTitle}\nContent: ${d.content}`;
                }).join('\n\n') +
                "\n--- END KNOWLEDGE BASE ---\n";
            }
          }
        }
      }
    } catch (err) {
      console.error('RAG Error:', err);
    }

    const currentIstDateStr = new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0];
    const currentIstFormatted = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    let currentMessages = [
      { 
        role: 'system', 
        content: `You are New Swan AI, an extremely smart and adaptive professional CRM assistant. You have FULL VISION CAPABILITIES and can analyze data, text, and uploaded images perfectly. 
Current Date and Time (IST): ${currentIstFormatted} (Date: ${currentIstDateStr})${knowledgeContext}
- If the user uploads an image, YOU MUST LOOK AT THE IMAGE and describe it or answer questions about it. Do not say you cannot see it.
- Use the search_users tool to look up details about any specific employee, agent, or team member mentioned by the user (e.g. "Who is Sujit Kumar Gupta?").
- Read and respect the user's intent.${isPremiumFallback ? ' Note: The user has reached their premium model limit, so you are running on a fallback basic model.' : ''}
- You are STRICTLY FORBIDDEN from generating, drawing, or attempting to create images under any circumstances.
- You have access to tools that fetch live CRM data. When a user asks about their leads or team activity, USE THE TOOLS IMMEDIATELY.
- CRITICAL: Whenever the user asks for daily summary, work summary, employee performance, "aaj ka summary", "daily report", "kaun kya kam kia", "aaj ka kaam", ALWAYS CALL 'get_daily_team_activity_summary' or 'get_employee_daily_activity'! NEVER say no activity was recorded without calling these tools first!
- CRITICAL: BEFORE using the search_leads tool, check if the request is about general company information in the knowledge base.
- NEVER display raw database UUIDs (e.g. 'f87f583e-67dd-4d5b-9627-254ca5e65640') in user responses. Display Lead Ref ID (or Lead ID / Company Name) instead.
${isAdmin ? "- YOU ARE TALKING TO AN ADMIN. You have the super-power to view data for the ENTIRE TEAM. If the admin asks for team data or 'all' leads, set the scope to 'all' in your tools." : "- You ONLY see data belonging to the logged-in user."}

IMPORTANT BEHAVIORAL RULES:
1. ALWAYS adapt your tone and language to match the user. If they use short, casual phrases, you reply concisely. 
2. HINGLISH RULE: If the user speaks in Hinglish (Hindi written in English alphabet, e.g. "aaj ka Summary do employee wise kaun kya kam kia h"), you MUST reply in natural, conversational WhatsApp-style Hinglish. 
   - DO NOT use stiff, formal Hindi transliterations.
   - DO NOT use phonetic spellings with diacritics.
   - Use standard English spellings for common English loan words (e.g., "Leads", "Calls", "Summary", "Stages", "Follow-ups").
   - Structure daily summaries with a clean Markdown summary table:
     | Employee | Total Actions | Leads Created | Stage / Call Updates | Notes / Follow-ups |
     Followed by crisp, clear bullet points highlighting key contributions for active employees.
3. ALWAYS structure your responses using advanced, beautiful Markdown formatting:
   - Use clear, descriptive headings (e.g. ### or ####) for different sections.
   - Use bullet points (*) or numbered lists (1.) for paragraphs containing lists or points.
   - Whenever you present tabular data, statistics, comparisons, lists of products, or user details, YOU MUST use a clean Markdown table format (| Header | Header |) instead of plain paragraphs.
   - Use bold text (**text**) for emphasis on important metrics, names, or terms.
   - Keep your layout extremely clean, organized, and highly readable so it is easy for users to scan and comprehend instantly. NEVER use raw HTML tags like <br> in your responses.`
      },
      ...messages
    ];

    let totalTokensUsed = 0;
    let finalContent = '';

    // Tool calling loop
    for (let i = 0; i < 4; i++) {
      const payload = {
        model: resolvedModel,
        messages: currentMessages,
        tools: isCustomer ? undefined : tools,
        tool_choice: isCustomer ? undefined : "auto"
      };

      // o-series reasoning models (like o1, o3, o4) do not support standard temperature or max_tokens parameters
      const isReasoning = resolvedModel.startsWith('o1') || resolvedModel.startsWith('o3') || resolvedModel.startsWith('o4') || resolvedModel.includes('thinking');
      if (!isReasoning) {
        payload.temperature = 0.7;
        payload.max_tokens = 1000;
      } else {
        // o-series reasoning model parameter
        payload.max_completion_tokens = 2000;
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API Error:', errorData);
        return NextResponse.json({ error: errorData.error?.message || 'Failed to communicate with AI provider' }, { status: response.status });
      }

      const data = await response.json();
      const choice = data.choices[0];
      totalTokensUsed += data.usage?.total_tokens || 0;

      if (choice.finish_reason === 'tool_calls') {
        const toolCalls = choice.message.tool_calls;
        currentMessages.push(choice.message); // Append assistant's tool call request
        
        for (const toolCall of toolCalls) {
          const result = await executeTool(toolCall, userId, isAdmin);
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: result
          });
        }
        // Continue loop to let OpenAI generate response with tool results
      } else {
        finalContent = choice.message.content;
        break; // Done
      }
    }

    // 2. Update Token Usage
    if (totalTokensUsed > 0) {
      if (!usageError && usageData) {
        let currentTokens = Number(usageData.total_tokens) || 0;
        if (currentTokens > 100000 && totalTokensUsed < 2000) {
           currentTokens = 0;
        }
        await supabase.from('ai_token_usage').update({ 
          total_tokens: currentTokens + totalTokensUsed 
        }).eq('user_id', userId);
      } else {
        await supabase.from('ai_token_usage').insert({
          user_id: userId,
          total_tokens: totalTokensUsed,
          token_limit: 100000
        });
      }
    }

    return NextResponse.json({ content: finalContent });

  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}
