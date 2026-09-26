/**
 * Predefined Role Profiles & Permission Templates for SuPuja Workplace
 */

export const ROLE_PRESETS = [
  {
    key: 'master_admin',
    name: 'Master Admin',
    description: 'Full unrestricted access to all modules, administrative controls, settings & security',
    color: '#dc2626',
    badgeBg: '#fef2f2',
    badgeBorder: '#fecaca',
    presetData: {
      is_master_admin: true,
      can_import_data: true,
      can_export_data: true,
      can_self_reset_password: true,
      can_assign_leads: true,
      can_delete_leads: true,
      can_view_all_companies: true,
      can_access_audit_logs: true,
      can_manage_settings: true,
      can_manage_column_data: true,
      can_claim_unassigned: true,
      can_bulk_actions: true,
      analytics: { view: true, read: true, write: true, edit: true, export: true },
      new_swan_ai: { view: true, read: true, write: true, edit: true, export: true },
      callcenter: { view: true, read: true, write: true, edit: true, export: true },
      attendance: {
        view: true, read: true, write: true, edit: true, export: true,
        sub_items: {
          my_attendance: { view: true },
          monthly_logs: { view: true },
          regularization: { view: true },
          hod_approvals: { view: true },
          team_report: { view: true }
        }
      },
      checklist: {
        view: true, read: true, write: true, edit: true, export: true,
        sub_items: {
          my_checklists: { view: true },
          templates: { view: true },
          compliance: { view: true }
        }
      },
      delegation: {
        view: true, read: true, write: true, edit: true, export: true,
        sub_items: {
          dashboard: { view: true },
          to_me: { view: true },
          by_me: { view: true },
          all: { view: true }
        }
      },
      registration: { view: true, read: true, write: true, edit: true, export: true },
      report: { view: true, read: true, write: true, edit: true, export: true },
      leads: {
        view: true, read: true, write: true, edit: true, export: true, delete: true,
        assigned_steps: ['lead_dashboard', 'hourly_work', '01 - New Stage', '02 - Contact Stage', '03 - Qualification Stage', '04 - Follow Up Stage', '05 - Sales Process Stage', '06 - Conversion Stage', '07 - Final Stage', '08 - Transfer to Party'],
        sub_items: {
          lead_dashboard: { view: true },
          hourly_work: { view: true },
          '01 - New Stage': { view: true },
          '02 - Contact Stage': { view: true },
          '03 - Qualification Stage': { view: true },
          '04 - Follow Up Stage': { view: true },
          '05 - Sales Process Stage': { view: true },
          '06 - Conversion Stage': { view: true },
          '07 - Final Stage': { view: true },
          '08 - Transfer to Party': { view: true }
        }
      },
      party: { view: true, read: true, write: true, edit: true, export: true },
      orders: { view: true, read: true, write: true, edit: true, export: true },
      location_master: { view: true, read: true, write: true, edit: true, export: true },
      mrp: { view: true, read: true, write: true, edit: true, export: true },
      mrp_against: { view: true, read: true, write: true, edit: true, export: true },
      recruiter: {
        view: true, read: true, write: true, edit: true, export: true,
        assigned_steps: ['S00', 'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09'],
        sub_items: {
          S00: { view: true }, S01: { view: true }, S02: { view: true },
          S03: { view: true }, S04: { view: true }, S05: { view: true },
          S06: { view: true }, S07: { view: true }, S08: { view: true }, S09: { view: true }
        }
      },
      joining: { view: true, read: true, write: true, edit: true, export: true },
      team: { view: true, read: true, write: true, edit: true, export: true },
      workplace: { view: true, read: true, write: true, edit: true, export: true },
      public_users: { view: true, read: true, write: true, edit: true, export: true },
      aiadmin: { view: true, read: true, write: true, edit: true, export: true },
      aiknowledgebase: { view: true, read: true, write: true, edit: true, export: true },
      calladmin: { view: true, read: true, write: true, edit: true, export: true },
      aicallcenter: { view: true, read: true, write: true, edit: true, export: true },
      whatsapp_official: { view: true, read: true, write: true, edit: true, export: true },
      whatsapp_unofficial: { view: true, read: true, write: true, edit: true, export: true },
      sms_config: { view: true, read: true, write: true, edit: true, export: true },
      rcs_config: { view: true, read: true, write: true, edit: true, export: true },
      email_config: { view: true, read: true, write: true, edit: true, export: true },
      admin_message_config: { view: true, read: true, write: true, edit: true, export: true },
      offline_rule: { view: true, read: true, write: true, edit: true, export: true },
      settings: { view: true, read: true, write: true, edit: true, export: true }
    }
  },
  {
    key: 'hod_dept_head',
    name: 'Department Head / HOD',
    description: 'Attendance approvals, team reports, delegation monitoring, and department dashboards',
    color: '#2563eb',
    badgeBg: '#eff6ff',
    badgeBorder: '#bfdbfe',
    presetData: {
      can_import_data: false,
      can_export_data: true,
      can_self_reset_password: true,
      can_assign_leads: true,
      can_delete_leads: false,
      can_view_all_companies: true,
      can_access_audit_logs: false,
      can_manage_settings: false,
      can_manage_column_data: false,
      can_claim_unassigned: true,
      can_bulk_actions: true,
      analytics: { view: true, read: true, write: false, edit: false, export: true },
      attendance: {
        view: true, read: true, write: true, edit: true, export: true,
        sub_items: {
          my_attendance: { view: true },
          monthly_logs: { view: true },
          regularization: { view: true },
          hod_approvals: { view: true },
          team_report: { view: true }
        }
      },
      checklist: {
        view: true, read: true, write: true, edit: true, export: true,
        sub_items: {
          my_checklists: { view: true },
          templates: { view: true },
          compliance: { view: true }
        }
      },
      delegation: {
        view: true, read: true, write: true, edit: true, export: true,
        sub_items: {
          dashboard: { view: true },
          to_me: { view: true },
          by_me: { view: true },
          all: { view: true }
        }
      },
      report: { view: true, read: true, write: false, edit: false, export: true },
      leads: {
        view: true, read: true, write: true, edit: true, export: true,
        assigned_steps: ['lead_dashboard', 'hourly_work', '01 - New Stage', '02 - Contact Stage', '03 - Qualification Stage'],
        sub_items: {
          lead_dashboard: { view: true },
          hourly_work: { view: true },
          '01 - New Stage': { view: true },
          '02 - Contact Stage': { view: true },
          '03 - Qualification Stage': { view: true }
        }
      }
    }
  },
  {
    key: 'sales_manager',
    name: 'Sales Manager',
    description: 'Management of all sales leads, assignments, hourly work tracking, party master & reports',
    color: '#059669',
    badgeBg: '#ecfdf5',
    badgeBorder: '#a7f3d0',
    presetData: {
      can_import_data: true,
      can_export_data: true,
      can_self_reset_password: true,
      can_assign_leads: true,
      can_delete_leads: false,
      can_view_all_companies: true,
      can_access_audit_logs: false,
      can_manage_settings: false,
      can_manage_column_data: true,
      can_claim_unassigned: true,
      can_bulk_actions: true,
      analytics: { view: true, read: true, write: false, edit: false, export: true },
      callcenter: { view: true, read: true, write: true, edit: true, export: true },
      registration: { view: true, read: true, write: true, edit: true, export: true },
      report: { view: true, read: true, write: false, edit: false, export: true },
      leads: {
        view: true, read: true, write: true, edit: true, export: true,
        assigned_steps: ['lead_dashboard', 'hourly_work', '01 - New Stage', '02 - Contact Stage', '03 - Qualification Stage', '04 - Follow Up Stage', '05 - Sales Process Stage', '06 - Conversion Stage', '07 - Final Stage', '08 - Transfer to Party'],
        sub_items: {
          lead_dashboard: { view: true },
          hourly_work: { view: true },
          '01 - New Stage': { view: true },
          '02 - Contact Stage': { view: true },
          '03 - Qualification Stage': { view: true },
          '04 - Follow Up Stage': { view: true },
          '05 - Sales Process Stage': { view: true },
          '06 - Conversion Stage': { view: true },
          '07 - Final Stage': { view: true },
          '08 - Transfer to Party': { view: true }
        }
      },
      party: { view: true, read: true, write: true, edit: true, export: true },
      orders: { view: true, read: true, write: true, edit: true, export: true },
      attendance: {
        view: true, read: true, write: true, edit: false, export: false,
        sub_items: {
          my_attendance: { view: true },
          monthly_logs: { view: true },
          regularization: { view: true }
        }
      },
      delegation: {
        view: true, read: true, write: true, edit: true, export: true,
        sub_items: {
          dashboard: { view: true },
          to_me: { view: true },
          by_me: { view: true },
          all: { view: true }
        }
      }
    }
  },
  {
    key: 'sales_executive',
    name: 'Sales Executive',
    description: 'Field & desk sales: Calling, own assigned leads, punch station, tasks to me',
    color: '#0891b2',
    badgeBg: '#ecfeff',
    badgeBorder: '#a5f3fc',
    presetData: {
      can_import_data: false,
      can_export_data: false,
      can_self_reset_password: true,
      can_assign_leads: false,
      can_delete_leads: false,
      can_view_all_companies: false,
      can_access_audit_logs: false,
      can_manage_settings: false,
      can_manage_column_data: false,
      can_claim_unassigned: true,
      can_bulk_actions: false,
      callcenter: { view: true, read: true, write: true, edit: true, export: false },
      registration: { view: true, read: true, write: true, edit: false, export: false },
      leads: {
        view: true, read: true, write: true, edit: true, export: false,
        assigned_steps: ['lead_dashboard', 'hourly_work', '01 - New Stage', '02 - Contact Stage', '03 - Qualification Stage', '04 - Follow Up Stage', '05 - Sales Process Stage', '06 - Conversion Stage'],
        sub_items: {
          lead_dashboard: { view: true },
          hourly_work: { view: true },
          '01 - New Stage': { view: true },
          '02 - Contact Stage': { view: true },
          '03 - Qualification Stage': { view: true },
          '04 - Follow Up Stage': { view: true },
          '05 - Sales Process Stage': { view: true },
          '06 - Conversion Stage': { view: true }
        }
      },
      attendance: {
        view: true, read: true, write: true, edit: false, export: false,
        sub_items: {
          my_attendance: { view: true },
          monthly_logs: { view: true },
          regularization: { view: true }
        }
      },
      checklist: {
        view: true, read: true, write: true, edit: false, export: false,
        sub_items: {
          my_checklists: { view: true }
        }
      },
      delegation: {
        view: true, read: true, write: true, edit: false, export: false,
        sub_items: {
          to_me: { view: true }
        }
      }
    }
  },
  {
    key: 'hr_recruiter',
    name: 'HR Recruiter',
    description: 'Recruitment lifecycle (S00-S09), candidate onboarding, attendance, and checklists',
    color: '#7c3aed',
    badgeBg: '#f5f3ff',
    badgeBorder: '#ddd6fe',
    presetData: {
      can_import_data: true,
      can_export_data: true,
      can_self_reset_password: true,
      can_assign_leads: false,
      can_delete_leads: false,
      can_view_all_companies: true,
      can_access_audit_logs: false,
      can_manage_settings: false,
      can_manage_column_data: false,
      can_claim_unassigned: false,
      can_bulk_actions: true,
      recruiter: {
        view: true, read: true, write: true, edit: true, export: true,
        assigned_steps: ['S00', 'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09'],
        sub_items: {
          S00: { view: true }, S01: { view: true }, S02: { view: true },
          S03: { view: true }, S04: { view: true }, S05: { view: true },
          S06: { view: true }, S07: { view: true }, S08: { view: true }, S09: { view: true }
        }
      },
      joining: { view: true, read: true, write: true, edit: true, export: true },
      attendance: {
        view: true, read: true, write: true, edit: false, export: false,
        sub_items: {
          my_attendance: { view: true },
          monthly_logs: { view: true },
          regularization: { view: true }
        }
      },
      checklist: {
        view: true, read: true, write: true, edit: true, export: false,
        sub_items: {
          my_checklists: { view: true },
          templates: { view: true }
        }
      },
      delegation: {
        view: true, read: true, write: true, edit: true, export: false,
        sub_items: {
          dashboard: { view: true },
          to_me: { view: true },
          by_me: { view: true }
        }
      }
    }
  },
  {
    key: 'read_only_viewer',
    name: 'Read-Only Viewer',
    description: 'Audit, inspection, and view-only access across reports, analytics, and lists',
    color: '#475569',
    badgeBg: '#f8fafc',
    badgeBorder: '#cbd5e1',
    presetData: {
      can_import_data: false,
      can_export_data: false,
      can_self_reset_password: false,
      can_assign_leads: false,
      can_delete_leads: false,
      can_view_all_companies: true,
      can_access_audit_logs: true,
      can_manage_settings: false,
      can_manage_column_data: false,
      can_claim_unassigned: false,
      can_bulk_actions: false,
      analytics: { view: true, read: true, write: false, edit: false, export: false },
      report: { view: true, read: true, write: false, edit: false, export: false },
      party: { view: true, read: true, write: false, edit: false, export: false },
      orders: { view: true, read: true, write: false, edit: false, export: false }
    }
  }
];

export function getRolePreset(roleKey) {
  return ROLE_PRESETS.find(p => p.key === roleKey) || null;
}
