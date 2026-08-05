import React from 'react';
import { UserPlus, FileText, Users, Building2, CheckCircle, Archive, Globe, Bot } from 'lucide-react';

export const MODULES_CONFIG = [
  // General / Dashboards
  { id: 'analytics', path: 'analytics', label: 'Analytics Dashboard', category: 'General' },
  { id: 'new_swan_ai', path: 'ai', label: 'New Swan AI', category: 'General', icon: <Bot size={20} /> },
  { id: 'callcenter', path: 'callcenter', label: 'Call Center', category: 'General' },

  // Sales
  { id: 'registration', path: 'registration', label: 'New Client Registration', category: 'Sales', icon: <UserPlus size={20} /> },
  { id: 'report', path: 'report', label: 'Client Registered Report', category: 'Sales', icon: <FileText size={20} /> },
  { id: 'leads', path: 'leads', label: 'Lead Data', category: 'Sales', icon: <Users size={20} /> },
  { id: 'party', path: 'party', label: 'Party Master', category: 'Sales', icon: <Building2 size={20} /> },
  { id: 'orders', path: 'orders', label: 'Order Management', category: 'Sales', icon: <CheckCircle size={20} /> },
  { id: 'location_master', path: 'location_master', label: 'Location Master', category: 'Sales', icon: <Globe size={20} /> },

  // Purchase
  { id: 'mrp', path: 'mrp', label: 'MRP System', category: 'Purchase', icon: <Archive size={20} /> },
  { id: 'mrp_against', path: 'mrp_against', label: 'MRP Against', category: 'Purchase', icon: <FileText size={20} /> },

  // Human Resource
  { id: 'recruiter', path: 'recruiter', label: 'Recruiter Dashboard', category: 'Human Resource', icon: <Users size={20} /> },
  { id: 'joining', path: 'joining', label: 'Joining Process', category: 'Human Resource', icon: <CheckCircle size={20} /> },

  // System
  { id: 'team', path: 'team', label: 'Team Management', category: 'System' },
  { id: 'aiadmin', path: 'aiadmin', label: 'User AI Usage', category: 'System' },
  { id: 'aiknowledgebase', path: 'aiknowledgebase', label: 'AI Knowledge Base (RAG)', category: 'System' },
  { id: 'calladmin', path: 'calladmin', label: 'Call Admin', category: 'System' },
  { id: 'aicallcenter', path: 'aicallcenter', label: 'AI Call Center', category: 'System' },
  { id: 'whatsapp_official', path: 'whatsapp_official', label: 'WhatsApp Official', category: 'System' },
  { id: 'whatsapp_unofficial', path: 'whatsapp_unofficial', label: 'WhatsApp UnOfficial', category: 'System' },
  { id: 'sms_config', path: 'sms_config', label: 'SMS Configuration', category: 'System' },
  { id: 'rcs_config', path: 'rcs_config', label: 'RCS Configuration', category: 'System' },
  { id: 'email_config', path: 'email_config', label: 'Email Configuration', category: 'System' },
  { id: 'settings', path: 'settings', label: 'Settings', category: 'System' },
];
