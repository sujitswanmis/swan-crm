export const AVAILABLE_WIDGETS = [
  {
    id: 'attendance_card',
    title: 'Smart Attendance (Multi-Action)',
    description: 'Today’s punch in/out, Station, Missing Punch, and Leave applications',
    category: 'Workforce',
    requiredModule: 'attendance',
    icon: 'Clock',
    color: '#f97316',
    defaultEnabled: true
  },
  {
    id: 'delegation_tasks_card',
    title: 'Delegation Tasks (Multi-Action)',
    description: 'Instant Task assignment, task list, and upcoming deadlines',
    category: 'Productivity',
    requiredModule: 'delegation',
    icon: 'Users',
    color: '#0ea5e9',
    defaultEnabled: true
  },
  {
    id: 'order_pipeline_card',
    title: 'Order Pipeline & Stages (Multi-Action)',
    description: 'Instant Order punch, dispatch pipeline, and S01–S13 stage navigation',
    category: 'Sales',
    requiredModule: 'channel_ops',
    icon: 'Truck',
    color: '#2563eb',
    defaultEnabled: true
  },
  {
    id: 'lead_data_card',
    title: 'Lead Pipeline & Stages (Multi-Action)',
    description: 'Instant Lead creation, table view, and 01–08 conversion stages',
    category: 'Sales',
    requiredModule: 'leads',
    icon: 'Users',
    color: '#6366f1',
    defaultEnabled: true
  },
  {
    id: 'complaints_card',
    title: 'Complaint Desk & Stages (Multi-Action)',
    description: 'Instant Ticket logging, triage desk, and C01–C06 stage quick jump',
    category: 'Sales',
    requiredModule: 'channel_ops',
    icon: 'AlertTriangle',
    color: '#ef4444',
    defaultEnabled: true
  },
  {
    id: 'recruitment_card',
    title: 'Recruitment Hub & Stages (Multi-Action)',
    description: 'Candidate pipeline, interview tracking, and S00–S06 stage quick jump',
    category: 'Human Resource',
    requiredModule: 'recruiter',
    icon: 'UserPlus',
    color: '#ec4899',
    defaultEnabled: true
  }
];

export function getPermittedWidgets(moduleAccess = {}, userRole = '') {
  const rLower = String(userRole || '').trim().toLowerCase();
  const isAdmin = rLower === 'admin' || rLower === 'superadmin' || rLower === 'masteradmin' || rLower === 'super_admin' || rLower === 'master_admin';
  
  if (isAdmin) {
    return AVAILABLE_WIDGETS;
  }

  return AVAILABLE_WIDGETS.filter(widget => {
    // Widgets with no specific module required (e.g. quick actions) are always available
    if (!widget.requiredModule) return true;

    const mod = widget.requiredModule;

    // Workforce operational modules: attendance, checklist, delegation
    // Default to true for authenticated employees unless explicitly disabled (view: false)
    if (mod === 'attendance') {
      return moduleAccess?.attendance?.view !== false;
    }
    if (mod === 'checklist') {
      return moduleAccess?.checklist?.view !== false;
    }
    if (mod === 'delegation') {
      return moduleAccess?.delegation?.view !== false;
    }

    // Sales and Dispatch modules: channel_ops / party / orders
    if (mod === 'channel_ops') {
      return (
        moduleAccess?.channel_ops?.view === true ||
        moduleAccess?.party?.view === true ||
        moduleAccess?.orders?.view === true
      );
    }

    // Lead Management & CRM pipeline
    if (mod === 'leads') {
      return moduleAccess?.leads?.view === true || moduleAccess?.registration?.view === true;
    }

    // Call Center / Telecalling Desk
    if (mod === 'callcenter') {
      return moduleAccess?.callcenter?.view === true;
    }

    // HR & Candidate Recruitment Hub
    if (mod === 'recruiter') {
      return moduleAccess?.recruiter?.view === true;
    }

    // Field Force Operations & Radar
    if (mod === 'field_force') {
      return moduleAccess?.field_force?.view === true;
    }

    return moduleAccess?.[mod]?.view === true;
  });
}
