'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, X, FileText, Users, Bot, PhoneCall, Settings, LayoutDashboard, 
  Database, Briefcase, UserPlus, ShoppingCart, Boxes, MessageSquare, 
  CornerDownLeft, Shield, Sparkles, Building2, MapPin, 
  Palette, Phone, User, Tag
} from 'lucide-react';

export default function GlobalSpotlightModal({
  isOpen,
  onClose,
  leads = [],
  teamMembers = [],
  userRole = '',
  moduleAccess = {},
  onNavigate,
  onAction
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const isAdmin = userRole === 'admin' || userRole === 'Admin';

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Define All Available Modules with their permission checks
  const allModules = useMemo(() => {
    const modules = [
      { id: 'dashboard', name: 'Analytics Dashboard', category: 'General', icon: LayoutDashboard, keywords: ['stats', 'analytics', 'overview', 'summary', 'charts'] },
      { id: 'ai', name: 'AI Chatbot Assistant', category: 'General', icon: Bot, keywords: ['ai', 'chat', 'gpt', 'bot', 'assistant', 'ask'] },
      { id: 'callcenter', name: 'Telecalling Softphone (WebRTC)', category: 'General', icon: PhoneCall, keywords: ['calling', 'dialer', 'phone', 'microsip', 'calls'] },
      { id: 'leads', name: 'Leads Database (All Leads)', category: 'Sales Pipeline', icon: Database, keywords: ['leads', 'customers', 'contacts', 'pipeline', 'sales'] },
      { id: 'orders', name: 'Order Management', category: 'Sales Pipeline', icon: ShoppingCart, keywords: ['orders', 'billing', 'sales orders'] },
      { id: 'mrp', name: 'MRP System', category: 'Production & MRP', icon: Boxes, keywords: ['mrp', 'manufacturing', 'material', 'production'] },
      { id: 'mrp_against', name: 'MRP Against', category: 'Production & MRP', icon: Boxes, keywords: ['mrp against', 'bom'] },
      { id: 'party', name: 'Fully Managed Party Master', category: 'Masters', icon: Building2, keywords: ['parties', 'dealers', 'vendors', 'distributors'] },
      { id: 'location_territory', name: 'Universal Location & Territory Master', category: 'Masters', icon: MapPin, keywords: ['states', 'cities', 'territory', 'zones'] },
      { id: 'recruiter', name: 'Recruiter Dashboard & Stages', category: 'HR & Recruitment', icon: Briefcase, keywords: ['recruitment', 'hr', 'jobs', 'hiring', 'candidates'] },
      { id: 'joining', name: 'Joining Process', category: 'HR & Recruitment', icon: UserPlus, keywords: ['onboarding', 'joining', 'new employee'] },
      { id: 'registration', name: 'Client Registration', category: 'Clients', icon: FileText, keywords: ['client registration', 'form'] },
      { id: 'report', name: 'Client Registered Report', category: 'Clients', icon: FileText, keywords: ['client report', 'export'] },
      { id: 'team', name: 'Team Management & Permissions', category: 'System Administration', icon: Users, keywords: ['team', 'users', 'roles', 'permissions', 'staff', 'employees'] },
      { id: 'public_users', name: 'Public Candidate Applicants', category: 'HR & Recruitment', icon: Users, keywords: ['applicants', 'resumes', 'job applications'] },
      { id: 'aiadmin', name: 'AI Admin Configuration', category: 'System Administration', icon: Bot, keywords: ['ai config', 'prompts', 'openai', 'models'] },
      { id: 'aiknowledgebase', name: 'AI Knowledge Base Documents', category: 'System Administration', icon: FileText, keywords: ['kb', 'knowledge', 'documents', 'training'] },
      { id: 'calladmin', name: 'Call Admin & Recordings', category: 'System Administration', icon: Phone, keywords: ['call logs', 'recordings', 'plivo', 'sip'] },
      { id: 'aicallcenter', name: 'AI Call Center Agents', category: 'System Administration', icon: Sparkles, keywords: ['ai voice', 'campaigns', 'voice bot'] },
      { id: 'whatsapp_official', name: 'WhatsApp Official (Meta API)', category: 'Messaging Gateway', icon: MessageSquare, keywords: ['whatsapp', 'meta', 'templates', 'waba'] },
      { id: 'whatsapp_unofficial', name: 'WhatsApp Unofficial Gateway', category: 'Messaging Gateway', icon: MessageSquare, keywords: ['wa session', 'instance', 'qr code'] },
      { id: 'sms_config', name: 'SMS Gateway Config (Fast2SMS / DLT)', category: 'Messaging Gateway', icon: MessageSquare, keywords: ['sms', 'dlt', 'fast2sms', 'otp'] },
      { id: 'rcs_config', name: 'RCS Messaging Config', category: 'Messaging Gateway', icon: MessageSquare, keywords: ['rcs', 'rich communication'] },
      { id: 'email_config', name: 'Email Gateway (SMTP Config)', category: 'Messaging Gateway', icon: FileText, keywords: ['smtp', 'mail', 'email template'] },
      { id: 'admin_message_config', name: 'Admin Message & OTP Hub', category: 'System Administration', icon: Shield, keywords: ['admin messages', 'otp settings', 'gateway test'] },
      { id: 'settings', name: 'Enterprise Settings', category: 'System Administration', icon: Settings, keywords: ['settings', 'config', 'company', 'brand'] }
    ];

    // Filter modules according to user permissions
    return modules.filter(mod => {
      if (isAdmin) return true;
      if (['dashboard', 'ai', 'callcenter'].includes(mod.id)) return true;
      return !!moduleAccess[mod.id]?.view;
    });
  }, [isAdmin, moduleAccess]);

  // Lead Stages with permissions
  const leadStages = useMemo(() => {
    const stages = [
      '01 - New Stage',
      '02 - Contact Stage',
      '03 - Qualification Stage',
      '04 - Follow Up Stage',
      '05 - Sales Process Stage',
      '06 - Conversion Stage',
      '07 - Final Stage'
    ];

    const leadsAccess = moduleAccess?.leads || {};
    const isManager = leadsAccess.is_manager;
    const assignedSteps = leadsAccess.assigned_steps || [];

    return stages.filter(stage => {
      if (isAdmin || isManager) return true;
      return assignedSteps.includes(stage);
    });
  }, [isAdmin, moduleAccess]);

  // Recruiter Stages with permissions
  const recruiterStages = useMemo(() => {
    const stages = [
      { id: 'dashboard', label: '📊 Recruiter Dashboard' },
      { id: 'all_stages', label: '🔍 Recruiter All Stages' },
      { id: 'S00', label: 'S00 - Requirements Received' },
      { id: 'S01', label: 'S01 - JDs Prepared & Posted' },
      { id: 'S02', label: 'S02 - Resume Filtered' },
      { id: 'S03', label: 'S03 - Interview Executed' },
      { id: 'S04', label: 'S04 - Test Result Updated' },
      { id: 'S05', label: 'S05 - ED Approval Pending' },
      { id: 'S06', label: 'S06 - Salary Negotiating' },
      { id: 'S07', label: 'S07 - Shortlisted' },
      { id: 'S08', label: 'S08 - LOI Released' },
      { id: 'S09', label: 'S09 - Joined' }
    ];

    const recAccess = moduleAccess?.recruiter || {};
    const isFullAccess = isAdmin || recAccess.is_manager || recAccess.is_full_access;
    const assignedSteps = recAccess.assigned_steps || [];

    return stages.filter(st => {
      if (isFullAccess) return true;
      return assignedSteps.includes(st.id);
    });
  }, [isAdmin, moduleAccess]);

  // Calculate Intelligent Search Results
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const results = [];

    // 1. Pages & Modules Search
    allModules.forEach(mod => {
      const matchName = mod.name.toLowerCase().includes(q);
      const matchCategory = mod.category.toLowerCase().includes(q);
      const matchKeywords = mod.keywords?.some(k => k.toLowerCase().includes(q));
      
      if (!q || matchName || matchCategory || matchKeywords) {
        results.push({
          type: 'module',
          category: 'Pages & Modules',
          title: mod.name,
          subtitle: mod.category,
          icon: mod.icon,
          action: () => {
            onNavigate(mod.id, null);
            onClose();
          }
        });
      }
    });

    // 2. Lead Stages Search
    if (isAdmin || moduleAccess?.leads?.view) {
      leadStages.forEach(stage => {
        if (!q || stage.toLowerCase().includes(q) || 'lead stage'.includes(q) || 'leads'.includes(q)) {
          results.push({
            type: 'lead_stage',
            category: 'Lead Stages',
            title: `Lead Data: ${stage}`,
            subtitle: 'Jump to specific sales stage filter',
            icon: Tag,
            badge: stage.slice(0, 2),
            action: () => {
              onNavigate('leads', stage);
              onClose();
            }
          });
        }
      });
    }

    // 3. Recruiter Stages Search
    if (isAdmin || moduleAccess?.recruiter?.view) {
      recruiterStages.forEach(st => {
        if (!q || st.label.toLowerCase().includes(q) || 'recruiter candidate hr'.includes(q)) {
          results.push({
            type: 'recruiter_stage',
            category: 'Recruiter Stages',
            title: st.label,
            subtitle: 'HR recruitment pipeline stage',
            icon: Briefcase,
            badge: st.id,
            action: () => {
              onNavigate('recruiter', st.id);
              onClose();
            }
          });
        }
      });
    }

    // 4. Quick Actions
    const quickActions = [
      {
        title: 'Toggle CRM Softphone (WebRTC)',
        subtitle: 'Show / Hide floating softphone widget',
        icon: PhoneCall,
        keywords: ['call', 'phone', 'dialer', 'softphone', 'microsip'],
        action: () => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('toggle-softphone'));
          }
          onClose();
        }
      },
      {
        title: 'Switch Color Theme',
        subtitle: 'Toggle theme or palette menu',
        icon: Palette,
        keywords: ['theme', 'dark', 'light', 'midnight', 'sunset', 'emerald', 'color'],
        action: () => {
          onAction?.('theme');
          onClose();
        }
      },
      {
        title: 'Upload / Change Profile Photo',
        subtitle: 'Update your avatar picture in profile',
        icon: User,
        keywords: ['profile', 'avatar', 'photo', 'picture', 'upload', 'image'],
        action: () => {
          onAction?.('profile');
          onClose();
        }
      },
      {
        title: 'Sign Out / Logout',
        subtitle: 'End your current workplace session',
        icon: Shield,
        keywords: ['logout', 'signout', 'exit', 'leave'],
        action: () => {
          onAction?.('logout');
          onClose();
        }
      }
    ];

    quickActions.forEach(act => {
      if (!q || act.title.toLowerCase().includes(q) || act.keywords.some(k => k.includes(q))) {
        results.push({
          type: 'action',
          category: 'Quick Actions',
          title: act.title,
          subtitle: act.subtitle,
          icon: act.icon,
          action: act.action
        });
      }
    });

    // 5. Leads & Contacts Search (Fuzzy across memory leads)
    if (q && (isAdmin || moduleAccess?.leads?.view)) {
      const matchingLeads = leads.filter(lead => {
        const name = (lead.name || '').toLowerCase();
        const phone = (lead.phone || '').toLowerCase();
        const company = (lead.company || '').toLowerCase();
        const refId = (lead.lead_ref_id || '').toLowerCase();
        const stage = (lead.stage || '').toLowerCase();
        const city = (lead.city || '').toLowerCase();

        return name.includes(q) || phone.includes(q) || company.includes(q) || refId.includes(q) || stage.includes(q) || city.includes(q);
      }).slice(0, 15); // Top 15 matching leads

      matchingLeads.forEach(lead => {
        results.push({
          type: 'lead',
          category: 'Leads & Contacts',
          title: lead.name || 'Unnamed Lead',
          subtitle: `${lead.phone || 'No phone'} • ${lead.company || lead.city || 'Individual'} • ${lead.stage || 'No stage'}`,
          icon: User,
          badge: lead.lead_ref_id || 'LEAD',
          action: () => {
            onNavigate('leads', lead.stage || null, lead.lead_ref_id || lead.name);
            onClose();
          }
        });
      });
    }

    // 6. Team Members Search (Admins & HR only)
    if (q && (isAdmin || moduleAccess?.team?.view)) {
      const matchingStaff = teamMembers.filter(staff => {
        const name = (staff.name || staff.raw_user_meta_data?.name || staff.email || '').toLowerCase();
        const email = (staff.email || '').toLowerCase();
        const role = (staff.role || '').toLowerCase();
        const empId = (staff.emp_id || '').toLowerCase();

        return name.includes(q) || email.includes(q) || role.includes(q) || empId.includes(q);
      }).slice(0, 8);

      matchingStaff.forEach(staff => {
        results.push({
          type: 'staff',
          category: 'Team Members',
          title: staff.name || staff.raw_user_meta_data?.name || staff.email,
          subtitle: `${staff.email} • Role: ${staff.role || 'Agent'}`,
          icon: Users,
          badge: staff.emp_id || (staff.role || 'USER').toUpperCase(),
          action: () => {
            onNavigate('team', null, staff.email || staff.name);
            onClose();
          }
        });
      });
    }

    return results;
  }, [query, allModules, leadStages, recruiterStages, leads, teamMembers, isAdmin, moduleAccess, onNavigate, onAction, onClose]);

  // Keyboard navigation inside search results
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % (searchResults.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + searchResults.length) % (searchResults.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (searchResults[selectedIndex]) {
          searchResults[selectedIndex].action();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, searchResults, selectedIndex, onClose]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '10vh 1rem 2rem 1rem'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          width: '100%',
          maxWidth: '680px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-light)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '78vh'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--border-light)',
          background: 'var(--bg-primary)'
        }}>
          <Search size={22} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search anything (Leads, Modules, Stages, Team, Actions)..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '1.05rem',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              fontWeight: 500
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}
            >
              <X size={16} />
            </button>
          )}
          <kbd style={{
            fontSize: '0.72rem',
            padding: '0.2rem 0.45rem',
            borderRadius: '6px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            color: 'var(--text-secondary)',
            fontWeight: 600
          }}>
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div 
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.5rem'
          }}
        >
          {searchResults.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Search size={36} style={{ opacity: 0.25, margin: '0 auto 0.75rem auto' }} />
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>No matching results found</div>
              <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>Try searching by name, phone, lead ID, stage, or module keyword.</div>
            </div>
          ) : (
            searchResults.map((item, index) => {
              const isSelected = selectedIndex === index;
              const IconComponent = item.icon || FileText;

              return (
                <div
                  key={`${item.type}-${item.title}-${index}`}
                  data-index={index}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'var(--nav-active-bg)' : 'transparent',
                    border: isSelected ? '1px solid var(--border-light)' : '1px solid transparent',
                    transition: 'background 0.1s, border 0.1s',
                    marginBottom: '0.25rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? 'var(--accent-color)' : 'var(--bg-primary)',
                      color: isSelected ? '#ffffff' : 'var(--accent-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.15s'
                    }}>
                      <IconComponent size={18} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                          fontSize: '0.92rem',
                          fontWeight: isSelected ? 700 : 600,
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {item.title}
                        </span>

                        {item.badge && (
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '0.1rem 0.4rem',
                            borderRadius: '6px',
                            background: 'var(--bg-primary)',
                            color: 'var(--accent-color)',
                            border: '1px solid var(--border-light)',
                            whiteSpace: 'nowrap'
                          }}>
                            {item.badge}
                          </span>
                        )}
                      </div>

                      {item.subtitle && (
                        <span style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginTop: '0.1rem'
                        }}>
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {item.category}
                    </span>
                    {isSelected && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.2rem',
                        fontSize: '0.72rem',
                        color: 'var(--accent-color)',
                        fontWeight: 600,
                        backgroundColor: 'var(--bg-surface)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)'
                      }}>
                        <span>Open</span>
                        <CornerDownLeft size={12} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Hints */}
        <div style={{
          padding: '0.65rem 1.25rem',
          borderTop: '1px solid var(--border-light)',
          background: 'var(--bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <kbd style={{ padding: '0.1rem 0.35rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '4px', fontWeight: 600 }}>↑</kbd>
              <kbd style={{ padding: '0.1rem 0.35rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '4px', fontWeight: 600 }}>↓</kbd>
              to navigate
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <kbd style={{ padding: '0.1rem 0.35rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '4px', fontWeight: 600 }}>↵</kbd>
              to select
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span>Role:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{userRole}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
