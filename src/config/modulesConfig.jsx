import React from 'react';
import { UserPlus, FileText, Users, Building2, CheckCircle, Archive, Globe, Bot, Shield, PhoneCall, Phone, MessageCircle, Settings2, PieChart } from 'lucide-react';

export const MODULES_CONFIG = [
  // General / Dashboards
  { id: 'analytics', path: 'analytics', label: 'Analytics Dashboard', category: 'General', icon: <PieChart size={20} /> },
  { id: 'new_swan_ai', path: 'ai', label: 'New Swan AI', category: 'General', icon: <Bot size={20} /> },
  { id: 'callcenter', path: 'callcenter', label: 'Call Center', category: 'General', icon: <PhoneCall size={20} /> },

  // Sales
  { id: 'registration', path: 'registration', label: 'New Client Registration', category: 'Sales', icon: <UserPlus size={20} /> },
  { id: 'report', path: 'report', label: 'Client Registered Report', category: 'Sales', icon: <FileText size={20} /> },
  { 
    id: 'leads', 
    path: 'leads', 
    label: 'Lead Data', 
    category: 'Sales', 
    icon: <Users size={20} />,
    subItemsType: 'leads_stages',
    subItems: [
      { id: '01 - New Stage', label: '01 - New Stage' },
      { id: '02 - Contact Stage', label: '02 - Contact Stage' },
      { id: '03 - Qualification Stage', label: '03 - Qualification Stage' },
      { id: '04 - Follow Up Stage', label: '04 - Follow Up Stage' },
      { id: '05 - Sales Process Stage', label: '05 - Sales Process Stage' },
      { id: '06 - Conversion Stage', label: '06 - Conversion Stage' },
      { id: '07 - Final Stage', label: '07 - Final Stage' }
    ]
  },
  { id: 'party', path: 'party', label: 'Party Master', category: 'Sales', icon: <Building2 size={20} /> },
  { id: 'orders', path: 'orders', label: 'Order Management', category: 'Sales', icon: <CheckCircle size={20} /> },
  { 
    id: 'location_master', 
    path: 'location_master', 
    label: 'Location Master', 
    category: 'Sales', 
    icon: <Globe size={20} />,
    subItemsType: 'tabs',
    subItems: [
      { id: 'explorer', label: '1. Explorer' },
      { id: 'states', label: '2. States / UTs' },
      { id: 'districts', label: '3. Districts' },
      { id: 'subdistricts', label: '4. Tehsil / Sub-District' },
      { id: 'blocks', label: '5. Development Blocks' },
      { id: 'settlements', label: '6. Cities / Towns / Villages' },
      { id: 'post_offices', label: '7. PIN / Post Offices' },
      { id: 'aliases', label: '8. Aliases' },
      { id: 'import', label: '9. Import' },
      { id: 'requests', label: '10. Location Requests' },
      { id: 'history', label: '11. Change History' }
    ]
  },

  // Purchase
  { id: 'mrp', path: 'mrp', label: 'MRP System', category: 'Purchase', icon: <Archive size={20} /> },
  { id: 'mrp_against', path: 'mrp_against', label: 'MRP Against', category: 'Purchase', icon: <FileText size={20} /> },

  // Human Resource
  { 
    id: 'recruiter', 
    path: 'recruiter', 
    label: 'Recruiter Dashboard', 
    category: 'Human Resource', 
    icon: <Users size={20} />,
    subItemsType: 'recruiter_stages',
    subItems: [
      { id: 'S00', label: 'S00 — Requirements Received' },
      { id: 'S01', label: 'S01 — JDs Prepared & Posted' },
      { id: 'S02', label: 'S02 — Resume Filtered' },
      { id: 'S03', label: 'S03 — Interview Executed' },
      { id: 'S04', label: 'S04 — Test Results' },
      { id: 'S05', label: 'S05 — ED Approval' },
      { id: 'S06', label: 'S06 — Salary Negotiation' },
      { id: 'S07', label: 'S07 — Shortlisted' },
      { id: 'S08', label: 'S08 — LOI Released' },
      { id: 'S09', label: 'S09 — Joined' }
    ]
  },
  { id: 'joining', path: 'joining', label: 'Joining Process', category: 'Human Resource', icon: <CheckCircle size={20} /> },

  // System
  { id: 'team', path: 'team', label: 'Team Management', category: 'System', icon: <Shield size={20} /> },
  { 
    id: 'workplace', 
    path: 'workplace', 
    label: 'Workplace (WMS)', 
    category: 'System', 
    icon: <Building2 size={20} />,
    subItemsType: 'tabs',
    subItems: [
      { id: 'employees', label: 'Employees Master' },
      { id: 'designations', label: 'Designation Hierarchy' },
      { id: 'org', label: 'Organization Structure' },
      { id: 'access', label: 'Access Control Matrix' },
      { id: 'location_territory', label: 'Location & Territory' },
      { id: 'workflow', label: 'Workflow Engine' }
    ]
  },
  { id: 'public_users', path: 'public_users', label: 'Public User Management', category: 'System', icon: <Users size={20} /> },
  { id: 'aiadmin', path: 'aiadmin', label: 'User AI Usage', category: 'System', icon: <Bot size={20} /> },
  { id: 'aiknowledgebase', path: 'aiknowledgebase', label: 'AI Knowledge Base (RAG)', category: 'System', icon: <Bot size={20} /> },
  { 
    id: 'calladmin', 
    path: 'calladmin', 
    label: 'Call Admin', 
    category: 'System', 
    icon: <Phone size={20} />,
    subItemsType: 'tabs',
    subItems: [
      { id: 'agents', label: 'Agents & Endpoints' },
      { id: 'endpoints', label: 'SIP Endpoints' },
      { id: 'calllogs', label: 'Call Logs' },
      { id: 'monitor', label: 'Live Monitor' },
      { id: 'settings', label: 'Settings' }
    ]
  },
  { 
    id: 'aicallcenter', 
    path: 'aicallcenter', 
    label: 'AI Call Center', 
    category: 'System', 
    icon: <Bot size={20} />,
    subItemsType: 'tabs',
    subItems: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'campaigns', label: 'Campaigns' },
      { id: 'settings', label: 'Incoming Settings' }
    ]
  },
  { 
    id: 'whatsapp_official', 
    path: 'whatsapp_official', 
    label: 'WhatsApp Official', 
    category: 'System', 
    icon: <MessageCircle size={20} />,
    subItemsType: 'tabs',
    subItems: [
      { id: 'templates', label: 'Templates' },
      { id: 'automations', label: 'Automations' },
      { id: 'settings', label: 'API Settings' }
    ]
  },
  { 
    id: 'whatsapp_unofficial', 
    path: 'whatsapp_unofficial', 
    label: 'WhatsApp UnOfficial', 
    category: 'System', 
    icon: <MessageCircle size={20} />,
    subItemsType: 'tabs',
    subItems: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'live_chat', label: 'Live Chat Inbox' },
      { id: 'instances', label: 'Instance Management' },
      { id: 'auth', label: 'User Authorization' },
      { id: 'test', label: 'Test Message' },
      { id: 'logs', label: 'Message Logs' }
    ]
  },
  { id: 'sms_config', path: 'sms_config', label: 'SMS Configuration', category: 'System', icon: <MessageCircle size={20} /> },
  { id: 'rcs_config', path: 'rcs_config', label: 'RCS Configuration', category: 'System', icon: <MessageCircle size={20} /> },
  { id: 'email_config', path: 'email_config', label: 'Email Configuration', category: 'System', icon: <MessageCircle size={20} /> },
  { 
    id: 'settings', 
    path: 'settings', 
    label: 'Settings', 
    category: 'System', 
    icon: <Settings2 size={20} />,
    subItemsType: 'tabs',
    subItems: [
      { id: 'business', label: 'Business Profile' },
      { id: 'crm', label: 'CRM & Lead Config' },
      { id: 'fields', label: 'Custom Fields' },
      { id: 'notifications', label: 'Notifications & Alerts' },
      { id: 'roles', label: 'Roles & Permissions' },
      { id: 'automation', label: 'Automation & API' },
      { id: 'sessions', label: 'Monitor Sessions' },
      { id: 'audit', label: 'Activity Audit Logs' },
      { id: 'data', label: 'Data Management' },
      { id: 'targets', label: 'Targets & Performance' },
      { id: 'media', label: 'File & Media Settings' },
      { id: 'navigation', label: 'Page Navigation' },
      { id: 'departments', label: 'Manage Departments' }
    ]
  }
];

