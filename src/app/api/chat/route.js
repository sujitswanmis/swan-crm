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
    // Default to today in strict IST (Asia/Kolkata)
    targetDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }
  const startUtc = new Date(`${targetDate}T00:00:00+05:30`).toISOString();
  const endUtc = new Date(`${targetDate}T23:59:59.999+05:30`).toISOString();
  return { targetDate, startUtc, endUtc };
}

function parseTemplateMeta(rawDesc = '') {
  let scheduleMeta = {};
  const match = (rawDesc || '').match(/<!--__SWAN_SCHEDULE_META__([\s\S]*?)__END_META__-->/);
  if (match) {
    try {
      scheduleMeta = JSON.parse(match[1]) || {};
    } catch (_) {}
  }
  return scheduleMeta;
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
      description: "Get a comprehensive work breakdown and Lead Details Report for a specific employee on a given date (individual leads updated, company names, contact numbers, stage changes, remarks/notes, calls, follow-ups). MUST be called whenever asked for employee work summary, 'lead details report', 'kaun se leads update kiye', or updates by an employee.",
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
  },
  {
    type: "function",
    function: {
      name: "get_checklist_summary",
      description: "Get comprehensive checklist execution status, total scheduled, completed count, and critically MISSING/OVERDUE checklists (checklists whose slot time has passed without submission) for today or a specific date. MUST be called whenever the user asks about checklists, 'kitna checklist missing hua', 'aaj ka checklist', 'checklist report', 'pending checklist', or employee checklist compliance.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format (defaults to today in IST)."
          },
          filter_type: {
            type: "string",
            enum: ["all", "missing", "completed", "pending"],
            description: "Filter checklist status: 'missing' (overdue/expired without submission), 'completed', 'pending' (upcoming slot today), or 'all'."
          },
          employee_search: {
            type: "string",
            description: "Optional employee name or email to filter checklist records."
          },
          department: {
            type: "string",
            description: "Optional department filter."
          },
          scope: {
            type: "string",
            enum: ["me", "all"],
            description: "If admin, default to 'all'. Otherwise 'me'."
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_team_overview",
      description: "Get full company team structure, department-wise headcount, active vs inactive employees list, designations, HODs, and reporting managers. MUST be called whenever user asks about 'team', 'team members', 'department wise team', 'total employees', 'kaun kis department me hai', 'company staff'.",
      parameters: {
        type: "object",
        properties: {
          department: {
            type: "string",
            description: "Optional department name to filter (e.g. 'Sales', 'Operations', 'Human Resource', 'Accounts & Finance', 'IT')."
          },
          status: {
            type: "string",
            enum: ["active", "all", "inactive"],
            description: "Status filter: 'active' (default), 'all', or 'inactive'."
          },
          search: {
            type: "string",
            description: "Optional search query (name, designation, employee ID, mobile, email)."
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_delegation_tasks_summary",
      description: "Get task delegation summary (employee-to-employee tasks), status breakdown (pending, in_progress, completed, overdue, reopened, submitted), priority breakdown (urgent, high, medium, low), and deadline tracking. MUST be called whenever the user asks about 'delegation task', 'tasks assigned', 'maine kitna task assign kiya', 'mujhe kitna task mila', 'overdue tasks', 'delegated tasks', 'kaun sa task pending hai'.",
      parameters: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            enum: ["all", "assigned_by_me", "assigned_to_me"],
            description: "Filter by task assignment direction: 'assigned_by_me' when user asks what tasks THEY assigned/delegated to others ('maine kitne task diye/assign kiye'), 'assigned_to_me' when user asks what tasks were assigned to them ('mujhe kitna task mila/mere tasks'), or 'all' when asking for entire company/team tasks."
          },
          status: {
            type: "string",
            enum: ["all", "pending", "in_progress", "completed", "overdue", "urgent", "reopened", "submitted"],
            description: "Status filter for delegation tasks."
          },
          priority: {
            type: "string",
            enum: ["all", "URGENT", "HIGH", "MEDIUM", "LOW"],
            description: "Priority filter."
          },
          employee: {
            type: "string",
            description: "Optional employee name or email to filter tasks assigned to or delegated by them."
          },
          scope: {
            type: "string",
            enum: ["me", "all"],
            description: "Scope: 'all' for admin/managers, 'me' for current user."
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_recruitment_summary",
      description: "Get recruitment and HR hiring pipeline status, active job positions/openings, candidate counts across stages (S02 Resume Screening to S09 Joined), and interview/test statuses. MUST be called whenever user asks about 'recruiter process', 'hiring', 'open positions', 'vacancies', 'candidates', 'interview schedule', 'recruitment status'.",
      parameters: {
        type: "object",
        properties: {
          view: {
            type: "string",
            enum: ["all", "positions", "candidates"],
            description: "What to focus on: 'all', 'positions' (job vacancies), or 'candidates' (pipeline)."
          },
          stage: {
            type: "string",
            description: "Optional stage filter (e.g. 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', or 'Joined', 'Interview Scheduled')."
          },
          search: {
            type: "string",
            description: "Optional candidate name, phone, or job title search."
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_attendance_summary",
      description: "Get today's (or any specific date's) live employee attendance summary, including total present, late arrivals, half-days, regularized, and CRITICALLY who is ABSENT today (active employees who have not punched in). MUST be called whenever user asks about 'attendance', 'aaj kaun aaya kaun nahi', 'absent employees', 'late punch', 'present count', 'attendance report'.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format (defaults to today in IST)."
          },
          filter_type: {
            type: "string",
            enum: ["all", "absent", "present", "late", "half_day"],
            description: "Filter: 'all', 'absent' (employees who didn't punch in), 'present', 'late', 'half_day'."
          },
          employee_name: {
            type: "string",
            description: "Optional employee name or email to check their specific attendance."
          },
          department: {
            type: "string",
            description: "Optional department filter."
          },
          scope: {
            type: "string",
            enum: ["me", "all"],
            description: "Scope: 'all' for admin/managers, 'me' for user."
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_client_registrations_summary",
      description: "Get today's (or any date's) new client registration count, new leads created, source breakdown (Website, GST Data, IndiaMART, Google Ads, etc.), who registered them (entry_by), and recent client details. MUST be called whenever user asks 'aaj kitna new client registration hua', 'new clients today', 'nayi lead registration', 'client registrations today'.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format (defaults to today in IST)."
          },
          source: {
            type: "string",
            description: "Optional lead source filter (e.g. 'Website', 'Google Ads', 'IndiaMART', 'GST Data', 'Phone Call')."
          },
          registered_by: {
            type: "string",
            description: "Optional employee name or email who registered the client."
          },
          scope: {
            type: "string",
            enum: ["me", "all"],
            description: "Scope: 'all' for admin, 'me' for user."
          }
        }
      }
    }
  }
];

async function executeTool(toolCall, userId, isAdmin, currentUser = {}) {
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

      const actionCounts = {};
      const stageBreakdown = {};
      const stageUpdateLogs = [];
      const leadsCreated = [];
      const leadsAssigned = [];
      const followUpsSet = [];
      let breakCount = 0;

      logsList.forEach(log => {
        actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
        const timeIst = new Date(log.created_at).toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        if (log.action === 'Create Lead') {
          leadsCreated.push({ name: log.target.replace(/^Created New Lead:\s*/i, ''), time: timeIst });
        } else if (log.action === 'Stage Changed') {
          const nameMatch = log.target.match(/lead\s+"([^"]+)"/i);
          const stageMatch = log.target.match(/to\s+"([^"]+)"/i);
          const leadName = nameMatch ? nameMatch[1] : 'Unknown Lead';
          const stageName = stageMatch ? stageMatch[1].split('>').pop() || stageMatch[1] : 'Updated';
          stageBreakdown[stageName] = (stageBreakdown[stageName] || 0) + 1;

          stageUpdateLogs.push({
            company: leadName,
            stage: stageName,
            time: timeIst,
            detail: log.target
          });
        } else if (log.action === 'Assign Lead') {
          leadsAssigned.push({ detail: log.target, time: timeIst });
        } else if (log.action === 'Set Follow-up') {
          followUpsSet.push({ detail: log.target, time: timeIst });
        } else if (log.action.includes('Break')) {
          breakCount++;
        }
      });

      // Fetch full lead details for all leads where notes were written or stages updated
      const noteLeadIds = Array.from(new Set(notesList.map(n => n.lead_id).filter(Boolean)));
      let leadsData = [];
      if (noteLeadIds.length > 0) {
        const { data: leads } = await supabase
          .from('leads')
          .select('id, lead_ref_id, company, name, phone, status, city_name, district_name')
          .in('id', noteLeadIds.slice(0, 80));
        leadsData = leads || [];
      }

      // Map latest note to each lead
      const latestNoteByLead = new Map();
      notesList.forEach(n => {
        if (n.lead_id && !latestNoteByLead.has(n.lead_id)) {
          latestNoteByLead.set(n.lead_id, {
            note: n.note_text,
            time: new Date(n.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
          });
        }
      });

      const detailedLeadsWorkedOn = leadsData.map(l => {
        const noteInfo = latestNoteByLead.get(l.id);
        const cleanStage = (l.status || '').split('>').pop() || l.status || 'Updated';
        return {
          lead_ref_id: l.lead_ref_id || 'N/A',
          company: l.company || l.name || 'Individual',
          contact_person: l.name || 'N/A',
          phone: l.phone || 'N/A',
          city: l.city_name || l.district_name || 'N/A',
          current_stage: cleanStage,
          latest_note: noteInfo?.note || 'Updated',
          note_time: noteInfo?.time || ''
        };
      });

      const stageSummaryTable = Object.entries(stageBreakdown)
        .map(([stage, count]) => ({ stage, count }))
        .sort((a, b) => b.count - a.count);

      return JSON.stringify({
        employee: empSearch,
        date: targetDate,
        activity_overview: {
          total_actions: logsList.length,
          stage_changes_count: stageUpdateLogs.length,
          notes_written_count: notesList.length,
          leads_created_count: leadsCreated.length,
          leads_assigned_count: leadsAssigned.length,
          follow_ups_count: followUpsSet.length,
          breaks_count: breakCount,
          unique_leads_updated: detailedLeadsWorkedOn.length
        },
        action_type_breakdown: actionCounts,
        stage_breakdown: stageBreakdown,
        stage_breakdown_table: stageSummaryTable,
        leads_worked_on_details: detailedLeadsWorkedOn.slice(0, 50),
        sample_recent_updates: stageUpdateLogs.slice(0, 25)
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
    
    if (name === 'get_checklist_summary') {
      const { targetDate, startUtc, endUtc } = getIstDateRange(args.date);
      const nowIst = new Date(Date.now() + 5.5 * 3600000);
      const currentHours = nowIst.getUTCHours();
      const currentMinutes = nowIst.getUTCMinutes();
      const currentTimeMinutes = currentHours * 60 + currentMinutes;
      const todayDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const isEvaluatingToday = targetDate === todayDateStr;

      // 1. Fetch active templates
      const { data: templates, error: tErr } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('is_active', true);

      if (tErr) throw tErr;

      // 2. Fetch active approved employees
      const { data: usersData } = await supabase
        .from('user_roles')
        .select('user_id, emp_name, email, emp_id, emp_department, role, is_approved, module_access');
      
      const activeEmployees = (usersData || []).filter(u => {
        if (!u.is_approved || u.role === 'customer') return false;
        const st = u.module_access?.emp_status;
        return st !== 'InActive' && st !== 'Terminated' && st !== 'Resigned' && st !== 'Trash';
      }).map(u => ({
        name: u.emp_name || u.email.split('@')[0],
        email: (u.email || '').trim().toLowerCase(),
        emp_code: u.emp_id || '',
        department: u.emp_department || 'General'
      }));

      // 3. Fetch submissions for targetDate
      const { data: submissions } = await supabase
        .from('checklist_submissions')
        .select('*')
        .like('period_key', `${targetDate}%`);

      const subMap = new Map();
      (submissions || []).forEach(s => {
        const email = (s.employee_email || '').toLowerCase();
        const key = `${s.template_id}_${email}_${s.period_key}`;
        subMap.set(key, s);
        const sMatch = (s.period_key || '').match(/_S\d+$/);
        if (sMatch) {
          subMap.set(`${s.template_id}_${email}_${sMatch[0].replace('_', '')}`, s);
        }
      });

      const targetDateObj = new Date(`${targetDate}T12:00:00+05:30`);
      const dayName = targetDateObj.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
      const isSunday = dayName === 'Sunday';

      const scheduled = [];
      const completed = [];
      const missing = [];
      const pending = [];
      const deptStats = {};
      const empStats = {};

      const empFilter = (args.employee_search || '').trim().toLowerCase();
      const deptFilter = (args.department || '').trim().toLowerCase();

      (templates || []).forEach(tmpl => {
        const freq = (tmpl.frequency || 'DAILY').toUpperCase();
        let isScheduledToday = false;
        if (freq === 'DAILY') {
          isScheduledToday = true;
          if (isSunday && tmpl.include_sundays === false) isScheduledToday = false;
        } else if (freq === 'WEEKLY') {
          const daysOfWeek = Array.isArray(tmpl.days_of_week) ? tmpl.days_of_week : ['Monday'];
          if (daysOfWeek.includes(dayName)) isScheduledToday = true;
        } else if (freq === 'MONTHLY') {
          const dayOfMonth = targetDateObj.getDate();
          if (tmpl.day_of_month === dayOfMonth) isScheduledToday = true;
        }

        if (!isScheduledToday) return;

        const meta = parseTemplateMeta(tmpl.description);

        let slots = [{ slot_id: 'S1', label: 'Daily Task', due_time: tmpl.due_time || '18:00' }];
        if (Array.isArray(tmpl.daily_slots) && tmpl.daily_slots.length > 0) {
          slots = tmpl.daily_slots;
        } else if (Array.isArray(meta.daily_slots) && meta.daily_slots.length > 0) {
          slots = meta.daily_slots;
        } else if (tmpl.schedule_config?.daily_slots && Array.isArray(tmpl.schedule_config.daily_slots)) {
          slots = tmpl.schedule_config.daily_slots;
        }

        const bufferMins = parseInt(tmpl.buffer_minutes || meta.buffer_minutes || 20, 10);

        let targetEmps = [];
        if (tmpl.assigned_type === 'ALL') {
          targetEmps = activeEmployees;
        } else if (tmpl.assigned_type === 'DEPARTMENT') {
          targetEmps = activeEmployees.filter(e => e.department.toLowerCase() === (tmpl.department || '').toLowerCase());
        } else {
          const assignedEmails = (tmpl.assigned_employee_email || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
          targetEmps = activeEmployees.filter(e => assignedEmails.includes(e.email));
          if (targetEmps.length === 0 && tmpl.assigned_employee_name) {
            targetEmps = [{ name: tmpl.assigned_employee_name, email: (tmpl.assigned_employee_email || '').toLowerCase(), department: tmpl.department || 'General' }];
          }
        }

        targetEmps.forEach(emp => {
          if (empFilter && !emp.name.toLowerCase().includes(empFilter) && !emp.email.toLowerCase().includes(empFilter)) return;
          if (deptFilter && !emp.department.toLowerCase().includes(deptFilter)) return;
          if (scope === 'me' && emp.email !== (userRoleData?.email || '').toLowerCase()) return;

          if (!deptStats[emp.department]) deptStats[emp.department] = { scheduled: 0, completed: 0, missing: 0, pending: 0 };
          if (!empStats[emp.name]) empStats[emp.name] = { 
            employee_name: emp.name, 
            email: emp.email, 
            department: emp.department, 
            scheduled: 0, 
            completed: 0, 
            missing: 0, 
            pending: 0 
          };

          slots.forEach((slot, sIdx) => {
            const slotPeriodKey = slots.length > 1 ? `${targetDate}_${slot.slot_id || `S${sIdx + 1}`}` : targetDate;
            let sub = subMap.get(`${tmpl.id}_${emp.email}_${slotPeriodKey}`);
            if (!sub) {
              sub = subMap.get(`${tmpl.id}_${emp.email}_${targetDate}_S${sIdx + 1}`);
            }
            if (!sub && slots.length === 1) {
              sub = subMap.get(`${tmpl.id}_${emp.email}_${targetDate}_S1`);
            }

            const slotDue = slot.due_time || tmpl.due_time || '18:00';
            const [dueH, dueM] = slotDue.split(':').map(Number);
            const dueMinutes = (dueH || 0) * 60 + (dueM || 0);
            const cutoffMinutes = dueMinutes + bufferMins;

            const cutoffH = Math.floor(cutoffMinutes / 60);
            const cutoffM = cutoffMinutes % 60;
            const cutoffTimeStr = `${String(cutoffH).padStart(2, '0')}:${String(cutoffM).padStart(2, '0')}`;

            const taskItem = {
              template_id: tmpl.id,
              template_title: tmpl.title,
              slot_label: slot.label || `Slot ${sIdx + 1}`,
              due_time: slotDue,
              cutoff_time: cutoffTimeStr,
              employee_name: emp.name,
              employee_email: emp.email,
              department: emp.department,
              period_key: slotPeriodKey
            };

            scheduled.push(taskItem);
            deptStats[emp.department].scheduled++;
            empStats[emp.name].scheduled++;

            if (sub && sub.status === 'COMPLETED') {
              completed.push({
                ...taskItem,
                status: 'COMPLETED',
                submitted_at: sub.submitted_at,
                items_completed: `${sub.items_completed_count || 0}/${sub.items_total_count || 0}`
              });
              deptStats[emp.department].completed++;
              empStats[emp.name].completed++;
            } else {
              const isPastCutoff = !isEvaluatingToday ? true : currentTimeMinutes > cutoffMinutes;
              if (isPastCutoff) {
                missing.push({
                  ...taskItem,
                  status: 'MISSING',
                  delay_minutes: isEvaluatingToday ? Math.max(0, currentTimeMinutes - cutoffMinutes) : null,
                  reason: `Slot closed at ${cutoffTimeStr} IST without submission`
                });
                deptStats[emp.department].missing++;
                empStats[emp.name].missing++;
              } else {
                pending.push({
                  ...taskItem,
                  status: 'PENDING',
                  due_at: `${slotDue} IST (Closes at ${cutoffTimeStr} IST)`
                });
                deptStats[emp.department].pending++;
                empStats[emp.name].pending++;
              }
            }
          });
        });
      });

      const complianceRate = scheduled.length > 0 ? `${Math.round((completed.length / scheduled.length) * 100)}%` : '0%';

      const employeeBreakdown = Object.values(empStats).map(e => ({
        employee_name: e.employee_name,
        department: e.department,
        scheduled: e.scheduled,
        completed: e.completed,
        missing: e.missing,
        pending: e.pending,
        compliance_rate: e.scheduled > 0 ? `${Math.round((e.completed / e.scheduled) * 100)}%` : '0%'
      })).sort((a, b) => b.completed - a.completed);

      let responsePayload = {
        date: targetDate,
        summary: {
          total_scheduled: scheduled.length,
          total_completed: completed.length,
          total_missing: missing.length,
          total_pending: pending.length,
          compliance_rate: complianceRate
        },
        employee_breakdown: employeeBreakdown,
        department_breakdown: deptStats,
        missing_count: missing.length,
        missing_checklists: missing.slice(0, 40),
        pending_sample: pending.slice(0, 15),
        completed_sample: completed.slice(0, 15)
      };

      if (args.filter_type === 'missing') {
        responsePayload = {
          date: targetDate,
          summary: responsePayload.summary,
          employee_breakdown: employeeBreakdown,
          missing_checklists: missing.slice(0, 50),
          missing_count: missing.length
        };
      } else if (args.filter_type === 'completed') {
        responsePayload = {
          date: targetDate,
          summary: responsePayload.summary,
          employee_breakdown: employeeBreakdown,
          completed_checklists: completed.slice(0, 50),
          completed_count: completed.length
        };
      }

      return JSON.stringify(responsePayload);
    }

    if (name === 'get_team_overview') {
      const { data: users, error: uErr } = await supabase
        .from('user_roles')
        .select('user_id, emp_id, emp_name, email, role, emp_department, emp_designation, emp_mobile, is_approved, module_access, created_at')
        .neq('role', 'customer')
        .order('emp_department', { ascending: true });

      if (uErr) throw uErr;

      let allUsers = users || [];

      const deptFilter = (args.department || '').trim().toLowerCase();
      const search = (args.search || '').trim().toLowerCase();
      const statusFilter = (args.status || 'active').toLowerCase();

      const enriched = allUsers.map(u => {
        const mod = u.module_access || {};
        const empStatus = mod.emp_status || (u.is_approved ? 'Active' : 'Pending');
        const isActive = empStatus !== 'InActive' && empStatus !== 'Terminated' && empStatus !== 'Resigned' && empStatus !== 'Trash';
        return {
          emp_id: u.emp_id || '',
          emp_name: u.emp_name || u.email?.split('@')[0],
          email: u.email,
          role: u.role,
          department: u.emp_department || 'General',
          designation: u.emp_designation || 'Staff',
          mobile: u.emp_mobile || '',
          status: empStatus,
          is_active: isActive,
          primary_reporting: mod.primary_reporting_person || '',
          secondary_reporting: mod.secondary_reporting_person || '',
          hod: mod.hod_person || ''
        };
      });

      let filtered = enriched;
      if (statusFilter === 'active') {
        filtered = filtered.filter(u => u.is_active);
      } else if (statusFilter === 'inactive') {
        filtered = filtered.filter(u => !u.is_active);
      }

      if (deptFilter) {
        filtered = filtered.filter(u => u.department.toLowerCase().includes(deptFilter));
      }

      if (search) {
        filtered = filtered.filter(u => 
          u.emp_name.toLowerCase().includes(search) ||
          u.email.toLowerCase().includes(search) ||
          u.emp_id.toLowerCase().includes(search) ||
          u.designation.toLowerCase().includes(search) ||
          u.department.toLowerCase().includes(search) ||
          u.mobile.includes(search)
        );
      }

      const departmentBreakdown = {};
      enriched.filter(u => u.is_active).forEach(u => {
        departmentBreakdown[u.department] = (departmentBreakdown[u.department] || 0) + 1;
      });

      return JSON.stringify({
        total_users_registered: enriched.length,
        active_employees_count: enriched.filter(u => u.is_active).length,
        inactive_count: enriched.filter(u => !u.is_active).length,
        department_headcounts: departmentBreakdown,
        filtered_count: filtered.length,
        employees: filtered.slice(0, 40)
      });
    }

    if (name === 'get_delegation_tasks_summary') {
      let query = supabase
        .from('delegation_tasks')
        .select('id, task_code, title, description, priority, category, delegated_by_name, delegated_by_email, assigned_to_name, assigned_to_email, assigned_to_department, start_date, deadline, status, is_overdue, created_at')
        .order('created_at', { ascending: false });

      if (scope === 'me' && !isAdmin) {
        const uEmail = currentUser?.email || '';
        query = query.or(`assigned_to_email.ilike.%${uEmail}%,delegated_by_email.ilike.%${uEmail}%`);
      }

      const { data: tasks, error: dErr } = await query;
      if (dErr) throw dErr;

      const now = new Date();
      const allTasks = (tasks || []).map(t => {
        const isPastDeadline = t.deadline ? new Date(t.deadline) < now : false;
        const isClosed = ['COMPLETED', 'CANCELLED'].includes(t.status);
        const isOverdue = !isClosed && isPastDeadline;
        return {
          ...t,
          is_overdue: isOverdue,
          deadline_ist: t.deadline ? new Date(t.deadline).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'
        };
      });

      const userEmail = (currentUser?.email || '').trim().toLowerCase();
      const userName = (currentUser?.name || '').trim().toLowerCase();

      const isUserDelegator = (t) => {
        const dEmail = (t.delegated_by_email || '').toLowerCase();
        const dName = (t.delegated_by_name || '').toLowerCase();
        return (userEmail && dEmail.includes(userEmail)) || 
               (userName && userName.length > 2 && dName.includes(userName));
      };

      const isUserAssignee = (t) => {
        const aEmail = (t.assigned_to_email || '').toLowerCase();
        const aName = (t.assigned_to_name || '').toLowerCase();
        return (userEmail && aEmail.includes(userEmail)) || 
               (userName && userName.length > 2 && aName.includes(userName));
      };

      const tasksDelegatedByUser = allTasks.filter(isUserDelegator);
      const tasksAssignedToUser = allTasks.filter(isUserAssignee);

      let filtered = allTasks;
      if (args.direction === 'assigned_by_me') {
        filtered = tasksDelegatedByUser;
      } else if (args.direction === 'assigned_to_me') {
        filtered = tasksAssignedToUser;
      } else if (args.employee) {
        const q = args.employee.toLowerCase();
        filtered = allTasks.filter(t => 
          (t.assigned_to_name && t.assigned_to_name.toLowerCase().includes(q)) ||
          (t.assigned_to_email && t.assigned_to_email.toLowerCase().includes(q)) ||
          (t.delegated_by_name && t.delegated_by_name.toLowerCase().includes(q)) ||
          (t.delegated_by_email && t.delegated_by_email.toLowerCase().includes(q))
        );
      }

      if (args.status && args.status !== 'all') {
        if (args.status === 'overdue') {
          filtered = filtered.filter(t => t.is_overdue);
        } else if (args.status === 'urgent') {
          filtered = filtered.filter(t => t.priority === 'URGENT' && !['COMPLETED', 'CANCELLED'].includes(t.status));
        } else {
          filtered = filtered.filter(t => (t.status || '').toLowerCase() === args.status.toLowerCase());
        }
      }

      if (args.priority && args.priority !== 'all') {
        filtered = filtered.filter(t => (t.priority || '').toUpperCase() === args.priority.toUpperCase());
      }

      const summary = {
        total_company_tasks: allTasks.length,
        tasks_delegated_by_logged_in_user: tasksDelegatedByUser.length,
        tasks_assigned_to_logged_in_user: tasksAssignedToUser.length,
        filtered_count: filtered.length,
        pending: filtered.filter(t => t.status === 'PENDING').length,
        in_progress: filtered.filter(t => t.status === 'IN_PROGRESS').length,
        completed: filtered.filter(t => t.status === 'COMPLETED').length,
        reopened: filtered.filter(t => t.status === 'REOPENED').length,
        submitted: filtered.filter(t => t.status === 'SUBMITTED').length,
        overdue: filtered.filter(t => t.is_overdue).length,
        urgent: filtered.filter(t => t.priority === 'URGENT' && !['COMPLETED', 'CANCELLED'].includes(t.status)).length,
        high_priority: filtered.filter(t => t.priority === 'HIGH' && !['COMPLETED', 'CANCELLED'].includes(t.status)).length
      };

      return JSON.stringify({
        summary,
        logged_in_user_perspective: {
          user_name: currentUser?.name || 'User',
          user_email: currentUser?.email || '',
          delegated_by_user_count: tasksDelegatedByUser.length,
          delegated_by_user_tasks: tasksDelegatedByUser.map(t => ({
            task_code: t.task_code,
            title: t.title,
            priority: t.priority,
            status: t.status,
            assigned_to: t.assigned_to_name,
            deadline: t.deadline_ist
          })),
          assigned_to_user_count: tasksAssignedToUser.length,
          assigned_to_user_tasks: tasksAssignedToUser.map(t => ({
            task_code: t.task_code,
            title: t.title,
            priority: t.priority,
            status: t.status,
            delegated_by: t.delegated_by_name,
            deadline: t.deadline_ist
          }))
        },
        direction_applied: args.direction || 'all',
        filtered_count: filtered.length,
        tasks: filtered.slice(0, 30).map(t => ({
          task_code: t.task_code,
          title: t.title,
          priority: t.priority,
          status: t.status,
          is_overdue: t.is_overdue,
          assigned_to: t.assigned_to_name,
          department: t.assigned_to_department,
          delegated_by: t.delegated_by_name,
          deadline: t.deadline_ist
        }))
      });
    }

    if (name === 'get_recruitment_summary') {
      const [posRes, candRes] = await Promise.all([
        supabase.from('recruitment_positions').select('*').order('created_at', { ascending: false }),
        supabase.from('recruitment_candidates').select('id, name, email, phone, candidate_code, current_stage, candidate_status, position_id, created_at').order('created_at', { ascending: false })
      ]);

      const positions = posRes.data || [];
      const candidates = candRes.data || [];

      const posMap = new Map(positions.map(p => [p.id, p]));

      const stageLabels = {
        S02: 'S02: Resume Filtered',
        S03: 'S03: Interview Executed',
        S04: 'S04: Test Results',
        S05: 'S05: ED Approval Pending',
        S06: 'S06: Salary Negotiating',
        S07: 'S07: Shortlisted',
        S08: 'S08: LOI Released',
        S09: 'S09: Joined'
      };

      const stageCounts = {};
      Object.keys(stageLabels).forEach(k => { stageCounts[k] = 0; });
      const statusCounts = {};

      const enrichedCandidates = candidates.map(c => {
        const pos = posMap.get(c.position_id);
        const stg = c.current_stage || 'S02';
        stageCounts[stg] = (stageCounts[stg] || 0) + 1;
        const stat = c.candidate_status || 'Pending';
        statusCounts[stat] = (statusCounts[stat] || 0) + 1;

        return {
          name: c.name,
          candidate_code: c.candidate_code,
          stage: stg,
          stage_label: stageLabels[stg] || stg,
          status: stat,
          position: pos?.title || 'General Vacancy',
          department: pos?.department || 'General',
          applied_at: c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A'
        };
      });

      let filteredCandidates = enrichedCandidates;
      if (args.stage) {
        const sClean = args.stage.trim().toUpperCase();
        filteredCandidates = filteredCandidates.filter(c => c.stage === sClean || c.status.toLowerCase().includes(args.stage.toLowerCase()));
      }
      if (args.search) {
        const q = args.search.trim().toLowerCase();
        filteredCandidates = filteredCandidates.filter(c => 
          c.name.toLowerCase().includes(q) ||
          c.candidate_code.toLowerCase().includes(q) ||
          c.position.toLowerCase().includes(q) ||
          c.department.toLowerCase().includes(q)
        );
      }

      return JSON.stringify({
        total_open_positions: positions.filter(p => p.status !== 'Closed').length,
        positions_list: positions.map(p => ({
          title: p.title,
          department: p.department,
          openings: p.openings || 1,
          status: p.status,
          recruiter_assigned: p.recruiter_assigned || 'Unassigned',
          deadline: p.deadline_date || 'Open'
        })),
        total_candidates_in_pipeline: candidates.length,
        stage_breakdown: Object.entries(stageCounts).map(([stage, count]) => ({ stage, label: stageLabels[stage] || stage, count })),
        status_breakdown: statusCounts,
        recent_candidates: filteredCandidates.slice(0, 20)
      });
    }

    if (name === 'get_attendance_summary') {
      const { targetDate } = getIstDateRange(args.date);

      // 1. Fetch active approved employees
      const { data: usersData } = await supabase
        .from('user_roles')
        .select('user_id, emp_name, email, emp_id, emp_department, role, is_approved, module_access');

      const activeEmployees = (usersData || []).filter(u => {
        if (!u.is_approved || u.role === 'customer') return false;
        const st = u.module_access?.emp_status;
        return st !== 'InActive' && st !== 'Terminated' && st !== 'Resigned' && st !== 'Trash';
      }).map(u => ({
        name: u.emp_name || u.email.split('@')[0],
        email: (u.email || '').trim().toLowerCase(),
        emp_code: u.emp_id || '',
        department: u.emp_department || 'General'
      }));

      // 2. Fetch attendance records for targetDate
      const { data: attendanceRecords, error: aErr } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('attendance_date', targetDate);

      if (aErr) throw aErr;

      const punchedMap = new Map();
      (attendanceRecords || []).forEach(r => {
        if (r.email) punchedMap.set(r.email.trim().toLowerCase(), r);
      });

      const presentList = [];
      const absentList = [];
      const lateList = [];
      const halfDayList = [];

      const empFilter = (args.employee_name || '').trim().toLowerCase();
      const deptFilter = (args.department || '').trim().toLowerCase();

      activeEmployees.forEach(emp => {
        if (empFilter && !emp.name.toLowerCase().includes(empFilter) && !emp.email.toLowerCase().includes(empFilter)) return;
        if (deptFilter && !emp.department.toLowerCase().includes(deptFilter)) return;
        if (scope === 'me' && emp.email !== (currentUser?.email || '').toLowerCase()) return;

        const punch = punchedMap.get(emp.email);

        if (punch && punch.in_time) {
          const inTimeStr = new Date(punch.in_time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
          const outTimeStr = punch.out_time ? new Date(punch.out_time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : 'Working...';
          const item = {
            name: emp.name,
            emp_code: emp.emp_code,
            department: emp.department,
            in_time: inTimeStr,
            out_time: outTimeStr,
            status: punch.status || 'PRESENT',
            working_hours: punch.total_working_minutes ? `${Math.floor(punch.total_working_minutes / 60)}h ${punch.total_working_minutes % 60}m` : 'In Progress'
          };
          presentList.push(item);
          if (punch.status === 'LATE') lateList.push(item);
          if (punch.status === 'HALF_DAY') halfDayList.push(item);
        } else {
          absentList.push({
            name: emp.name,
            emp_code: emp.emp_code,
            department: emp.department,
            email: emp.email,
            status: 'ABSENT'
          });
        }
      });

      let result = {
        date: targetDate,
        summary: {
          total_active_staff: activeEmployees.length,
          total_present: presentList.length,
          total_absent: absentList.length,
          total_late: lateList.length,
          total_half_day: halfDayList.length,
          attendance_rate: activeEmployees.length > 0 ? `${Math.round((presentList.length / activeEmployees.length) * 100)}%` : '0%'
        },
        absent_employees: absentList,
        absent_count: absentList.length,
        late_arrivals: lateList,
        present_employees: presentList.slice(0, 30)
      };

      if (args.filter_type === 'absent') {
        result = {
          date: targetDate,
          summary: result.summary,
          absent_count: absentList.length,
          absent_employees: absentList
        };
      } else if (args.filter_type === 'late') {
        result = {
          date: targetDate,
          summary: result.summary,
          late_count: lateList.length,
          late_arrivals: lateList
        };
      } else if (args.filter_type === 'present') {
        result = {
          date: targetDate,
          summary: result.summary,
          present_count: presentList.length,
          present_employees: presentList
        };
      }

      return JSON.stringify(result);
    }

    if (name === 'get_client_registrations_summary') {
      const { targetDate, startUtc, endUtc } = getIstDateRange(args.date);

      let query = supabase
        .from('leads')
        .select('id, lead_ref_id, name, company, phone, business_contact_1, city_name, district_name, state_name, source, source_name, entry_by, assigned_to, status, requirement, investment, created_at, lead_date')
        .or(`and(created_at.gte.${startUtc},created_at.lte.${endUtc}),lead_date.eq.${targetDate}`)
        .order('created_at', { ascending: false });

      if (scope === 'me') {
        query = query.eq('assigned_to', userId);
      }

      const { data: leads, error: lErr } = await query;
      if (lErr) throw lErr;

      let allLeads = leads || [];

      if (args.source) {
        allLeads = allLeads.filter(l => (l.source || '').toLowerCase().includes(args.source.toLowerCase()));
      }

      if (args.registered_by) {
        allLeads = allLeads.filter(l => (l.entry_by || '').toLowerCase().includes(args.registered_by.toLowerCase()));
      }

      const sourceBreakdown = {};
      const registeredByBreakdown = {};
      const statusBreakdown = {};

      allLeads.forEach(l => {
        const src = l.source || 'Direct/Unknown';
        sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;

        const by = l.entry_by || 'System';
        registeredByBreakdown[by] = (registeredByBreakdown[by] || 0) + 1;

        const st = l.status || 'New';
        statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
      });

      return JSON.stringify({
        date: targetDate,
        total_registered_today: allLeads.length,
        source_breakdown: sourceBreakdown,
        registered_by_breakdown: registeredByBreakdown,
        status_breakdown: statusBreakdown,
        recent_registrations: allLeads.slice(0, 25).map(l => ({
          lead_ref_id: l.lead_ref_id,
          company: l.company || l.name || 'Individual',
          contact_person: l.name || 'N/A',
          phone: l.phone || l.business_contact_1 || 'N/A',
          city: l.city_name || l.district_name || 'N/A',
          source: l.source || 'N/A',
          registered_by: l.entry_by || 'Unknown',
          status: l.status,
          registered_time: l.created_at ? new Date(l.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A'
        }))
      });
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
    const { data: userRoleData } = await supabase.from('user_roles').select('emp_name, email, emp_id, role, module_access').eq('user_id', userId).single();
    const isAdmin = userRoleData?.role === 'admin';
    const isCustomer = userRoleData?.role === 'customer';
    const currentUser = {
      userId,
      name: userRoleData?.emp_name || 'User',
      email: (userRoleData?.email || '').toLowerCase(),
      emp_id: userRoleData?.emp_id || '',
      role: userRoleData?.role || 'user',
      isAdmin
    };
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

    const currentIstDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const currentIstFormatted = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    let currentMessages = [
      { 
        role: 'system', 
        content: `You are New Swan AI, an extremely smart and adaptive professional CRM assistant. You have FULL VISION CAPABILITIES and can analyze data, text, and uploaded images perfectly. 
Current Date and Time (IST): ${currentIstFormatted} (Date: ${currentIstDateStr})${knowledgeContext}
Current Logged-in User Profile:
- Name: ${currentUser.name}
- Email: ${currentUser.email}
- Employee ID: ${currentUser.emp_id || 'N/A'}
- Role: ${currentUser.role} (Is Admin: ${isAdmin ? 'Yes' : 'No'})
- If the user uploads an image, YOU MUST LOOK AT THE IMAGE and describe it or answer questions about it. Do not say you cannot see it.
- Use the search_users tool to look up details about any specific employee, agent, or team member mentioned by the user (e.g. "Who is Sujit Kumar Gupta?").
- Read and respect the user's intent.${isPremiumFallback ? ' Note: The user has reached their premium model limit, so you are running on a fallback basic model.' : ''}
- You are STRICTLY FORBIDDEN from generating, drawing, or attempting to create images under any circumstances.
- You have access to tools that fetch live CRM data. When a user asks about their leads, checklists, team, attendance, delegation, recruitment, or client registrations, USE THE TOOLS IMMEDIATELY.
- NEVER say data is not available without calling the appropriate tool first!
- NEVER display raw database UUIDs (e.g. 'f87f583e-67dd-4d5b-9627-254ca5e65640') in user responses. Display Lead Ref ID, Company Name, or Employee Name instead.
${isAdmin ? `- YOU ARE TALKING TO AN ADMIN (${currentUser.name}). You have the super-power to view data for the ENTIRE TEAM. However, when the user asks about what THEY personally did or assigned (e.g. "maine kitna task assign kiya", "mere leads", "kya maine task diya"), you MUST distinguish between their personal actions (${currentUser.name}) vs the entire company/team.` : "- You ONLY see data belonging to the logged-in user."}

CORE CRM DOMAIN TOOL DISPATCH RULES:
1. CHECKLISTS & MISSING STATUS:
   - When asked about checklists, today's checklist, missing checklists, "kitna checklist missing hua", "aaj ka checklist", "checklist summary", or who missed their checklist:
   - ALWAYS call 'get_checklist_summary' IMMEDIATELY!
   - Clearly report Total Scheduled, Completed, Missing (Window Closed / Overdue), and Pending (Due later).
   - When asked for employee-wise status ("emp wise", "employee wise", "kaun kitna kia"), ALWAYS present a clean, complete Markdown Table from the returned 'employee_breakdown' (Columns: Employee Name, Department, Scheduled, Completed, Missing, Compliance Rate). NEVER guess, invent, or hallucinate employee counts!
   - Highlight the top performers with highest completed/compliance, and those who have 0 submissions.
   - When commenting on missing checklists, strictly reference the 'Missing' column numbers from 'employee_breakdown' (DO NOT confuse Scheduled count with Missing count; e.g. if Monika has Scheduled: 38 and Missing: 13, she has 13 missing, NOT 38).

2. TEAM MEMBERS & STRUCTURE:
   - When asked about the team, "team ka batao", department-wise staff, total employees, "kaun kis department me hai", reporting managers, or HODs:
   - ALWAYS call 'get_team_overview' IMMEDIATELY! (or 'search_users' for an individual).
   - Display a department-wise breakdown table with headcounts and active staff details.

3. DELEGATION TASKS:
   - When asked about delegation tasks, "delegation task", assigned tasks, overdue tasks, urgent tasks, or task status:
   - ALWAYS call 'get_delegation_tasks_summary' IMMEDIATELY!
   - STRICT PERSPECTIVE DISTINCTION (WHO ASSIGNED VS WHO RECEIVED):
     * When the user asks in FIRST PERSON ("MAINE kitna delegation task assign kiya", "maine kitne task diye", "tasks assigned by me", "maine kisko kya task diya"):
       - You MUST pass direction: 'assigned_by_me'.
       - You MUST report ONLY the tasks DELEGATED BY THE LOGGED-IN USER (${currentUser.name}) using 'logged_in_user_perspective.delegated_by_user_tasks' and 'delegated_by_user_count'!
       - NEVER tell the user that the entire company's tasks (e.g. 13 tasks) were assigned by them! That is completely false and misleading.
       - State clearly: "Aapne (${currentUser.name}) ne total **X tasks** assign/delegate kiye hain:" followed by a clean markdown table of those specific tasks (Columns: Task Code, Title, Assigned To, Priority, Status, Deadline).
       - If you mention company-wide total, clearly label it separately (e.g. "Company-wide total 13 delegation tasks hain").
     * When the user asks ("MUJHE kitna task mila", "mere pending tasks", "tasks assigned to me"):
       - Pass direction: 'assigned_to_me'.
       - Report tasks assigned TO the logged-in user from 'logged_in_user_perspective.assigned_to_user_tasks'.
     * When the user asks about the overall team or company ("company me kitne delegation task hain", "team tasks", "all delegation tasks", "pending tasks"):
       - Pass direction: 'all'.
       - Report company-wide summary counts and detailed task table.

4. RECRUITER & HIRING PIPELINE:
   - When asked about recruiter process, "recruiter process", open vacancies, job positions, candidates pipeline, interviews, or hiring status:
   - ALWAYS call 'get_recruitment_summary' IMMEDIATELY!
   - Report active open positions with vacancies, candidate counts across stages (S02 Screening to S09 Joined), and interview/test statuses.

5. ATTENDANCE & ABSENTEEISM:
   - When asked about attendance, "attendance ka batao", "aaj kaun absent hai", "kaun aaya kaun nahi", late arrivals, or punches:
   - ALWAYS call 'get_attendance_summary' IMMEDIATELY!
   - Report total active staff, present count, late arrivals, and CRITICALLY the list of ABSENT employees who did not punch in today with their names and departments.

6. NEW CLIENT REGISTRATIONS:
   - When asked about new client registrations, "aaj kitna new client registration hua", "aaj kitne client register hue", "new client registration", or new leads created today:
   - ALWAYS call 'get_client_registrations_summary' IMMEDIATELY!
   - Report total new clients registered today in IST, breakdown by source, breakdown by registered_by (which employee entered them), and a clear table of registered clients (Company, Contact Person, Phone, City, Source, Time).

7. DAILY EXECUTIVE WORK SUMMARY & LEAD DETAILS REPORT:
   - Whenever the user asks for daily summary, work summary, employee performance, "aaj ka summary", "daily report", "kaun kya kam kia", "aaj ka kaam", or specific employee work / updates:
   - ALWAYS CALL 'get_daily_team_activity_summary' or 'get_employee_daily_activity'!
   - When asked for "lead details report", "updates ka detail", "103 update ka report dikhao", or specific leads updated by an employee:
     1. Clearly explain the Activity Overview (total actions, stage changes count, notes written, leads assigned, breaks).
     2. ALWAYS display the complete Stage Breakdown Table with ALL stages from 'stage_breakdown_table' (e.g. Call not connected, Contacted, ReSchedule, Interested, No Response) with exact counts so the sum matches stage_changes_count. NEVER drop or omit any stage!
     3. CRITICALLY: ALWAYS present a clean, comprehensive 'Lead Details Report' Markdown Table from 'leads_worked_on_details' (Columns: Lead Ref ID, Company / Business Name, Contact Person, Phone, City, Stage, Latest Remark / Note, Time).

IMPORTANT BEHAVIORAL RULES:
1. ALWAYS adapt your tone and language to match the user. If they use short, casual phrases, you reply concisely. 
2. HINGLISH RULE: If the user speaks in Hinglish (Hindi written in English alphabet, e.g. "aaj kitna new client registration hua"), you MUST reply in natural, conversational WhatsApp-style Hinglish. 
   - DO NOT use stiff, formal Hindi transliterations.
   - DO NOT use phonetic spellings with diacritics.
   - Use standard English spellings for common English loan words (e.g., "Leads", "Calls", "Summary", "Stages", "Follow-ups", "Checklist", "Attendance", "Missing", "Delegation", "Recruiter", "Registration").
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
          const result = await executeTool(toolCall, userId, isAdmin, currentUser);
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
