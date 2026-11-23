'use client';

import MobileTableView, { TableViewToggle, useTableViewPreference } from '@/components/common/MobileTableView';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { 
  Plus, Briefcase, Users, Search, ChevronRight, UserPlus, Filter, RefreshCw, Calendar, 
  FileText, CheckCircle2, ClipboardList, Star, Award, TrendingUp, Clock, AlertTriangle, 
  RotateCcw, Building2, Target, Check, ChevronDown, CheckCircle, XCircle, X,
  Activity, BarChart3, LayoutDashboard, CheckSquare, Sparkles, UserCheck, ShieldCheck, 
  ThumbsUp, ArrowUpRight, CalendarDays, Layers, SlidersHorizontal, Eye, Loader2
} from 'lucide-react';
import DateRangePicker, { computeDateRange } from '@/components/common/DateRangePicker';
import StandardTablePagination from '@/components/common/StandardTablePagination';
import CandidateProfilePanel from './CandidateProfilePanel';
import CandidateStageHistoryModal from './CandidateStageHistoryModal';
import PositionDetailsPanel from './PositionDetailsPanel';
import { getRecruitersList, getTeamMembers } from '@/app/actions/team';
import { getTenantBranches } from '@/app/actions/tenantBranches';
import UniversalBranchSelect from '@/components/common/UniversalBranchSelect';
import SearchableEmployeeSelect from '@/components/common/SearchableEmployeeSelect';
import { formatBranchStandard } from '@/utils/branchAccess';
import { showSyncToast } from '@/utils/offlineSync';
import { submitRecruiterChange, useRecruiterLists } from '@/utils/recruiterLocalDb';
import { getRecruiterPipelineConfig } from '@/app/actions/recruiterConfig';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';
import { ALL_INDIAN_DISTRICTS } from '@/constants/indianLocations';

const LOCAL_HUBS = [
  'Ludhiana', 'Raian (Ludhiana)', 'Paharuwal', 'Sahnewal', 'Khanna', 'Doraha', 'Mandi Gobindgarh',
  'Chandigarh', 'Mohali (SAS Nagar)', 'Panchkula', 'Ambala', 'Jalandhar', 'Amritsar', 'Patiala', 'Bathinda',
  'Hoshiarpur', 'Kapurthala', 'Phagwara', 'Nawanshahr', 'Ropar (Rupnagar)', 'Fatehgarh Sahib', 'Malerkotla', 'Sangrur',
  'Delhi NCR', 'Gurugram (Gurgaon)', 'Noida', 'Greater Noida', 'Faridabad', 'Ghaziabad', 'Sonipat', 'Panipat', 'Karnal', 'Kurukshetra',
  'Jaipur', 'Ahmedabad', 'Vadodara', 'Surat', 'Rajkot', 'Pune', 'Mumbai', 'Navi Mumbai', 'Thane', 'Nashik', 'Aurangabad',
  'Bengaluru (Bangalore)', 'Chennai', 'Coimbatore', 'Hyderabad', 'Secunderabad', 'Visakhapatnam', 'Vijayawada',
  'Kolkata', 'Howrah', 'Bhubaneswar', 'Cuttack', 'Ranchi', 'Jamshedpur', 'Patna', 'Gaya',
  'Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Prayagraj (Allahabad)', 'Meerut', 'Bareilly', 'Aligarh', 'Moradabad',
  'Dehradun', 'Haridwar', 'Roorkee', 'Rishikesh', 'Baddi (Solan)', 'Shimla', 'Solan', 'Dharamshala', 'Kullu',
  'Indore', 'Bhopal', 'Gwalior', 'Jabalpur', 'Raipur', 'Bilaspur', 'Nagpur'
];

const MASTER_CITIES = Array.from(new Set([...LOCAL_HUBS, ...(ALL_INDIAN_DISTRICTS || [])]));

const EXPERIENCE_LEVEL_OPTIONS = [
  'Fresher / 0 Years',
  '0 - 1 Year',
  '1 - 2 Years',
  '2 - 3 Years',
  '3 - 5 Years',
  '5 - 7 Years',
  '7 - 10 Years',
  '10+ Years'
];

const NOTICE_PERIOD_OPTIONS = [
  'Immediate Joiner (0 Days)',
  '7 Days',
  '15 Days',
  '30 Days (1 Month)',
  '45 Days',
  '60 Days (2 Months)',
  '90 Days (3 Months)'
];

export const formatPositionCode = (pos) => {
  if (!pos) return '';
  if (typeof pos === 'string') {
    return pos.startsWith('POS-') ? pos : `POS-${pos.substring(0, 8).toUpperCase()}`;
  }
  if (pos.position_code) return pos.position_code;
  if (pos.id) return `POS-${String(pos.id).substring(0, 8).toUpperCase()}`;
  return '';
};

export const STANDARD_POSTING_SOURCES = [
  'Naukri.com',
  'LinkedIn',
  'Indeed',
  'apna',
  'Foundit (Monster)',
  'WorkIndia',
  'WhatsApp Groups / Broadcast',
  'Employee Referral',
  'Campus / College Placement',
  'Social Media (Instagram / FB)',
  'Newspaper / Offline Print',
  'Walk-in Drive'
];

const RECRUITER_POSITIONS_DEFAULT_COL_WIDTHS = {
  actions: 140,
  title: 220,
  position_id: 130,
  department: 160,
  branch: 200,
  openings: 100,
  salary: 160,
  status: 130,
  deadline: 130,
  planned_tat: 155,
  actual_logged: 155,
  delay_status: 145,
  interviewer: 160,
  recruiter: 170,
  jd: 240,
  posting_status: 160,
  posting_sources: 220,
  apply_link: 160,
  created_by: 130
};

const RECRUITER_POSITIONS_MIN_COL_WIDTHS = {
  actions: 110,
  title: 120,
  position_id: 90,
  department: 100,
  branch: 110,
  openings: 70,
  salary: 110,
  status: 90,
  deadline: 90,
  planned_tat: 110,
  actual_logged: 110,
  delay_status: 100,
  interviewer: 100,
  recruiter: 110,
  jd: 130,
  posting_status: 120,
  posting_sources: 140,
  apply_link: 100,
  created_by: 90
};

const RECRUITER_CANDIDATES_DEFAULT_COL_WIDTHS = {
  actions: 125,
  name: 200,
  applying_for: 180,
  resume: 120,
  stage_status: 195,
  details: 240,
  planned_tat: 155,
  actual_logged: 155,
  delay_status: 145,
  date: 130
};

const RECRUITER_CANDIDATES_MIN_COL_WIDTHS = {
  actions: 110,
  name: 120,
  applying_for: 110,
  resume: 80,
  stage_status: 130,
  details: 140,
  planned_tat: 110,
  actual_logged: 110,
  delay_status: 100,
  date: 90
};

export const POSITION_VACANCY_REASONS = [
  'New Position',
  'Replacement',
  'Resigned'
];

export const POSITION_JOB_TYPES = [
  'Full Time (Permanent)',
  'On-Roll',
  'Contract / Vendor (Off-Roll)',
  'Apprentice (NAPS / NATS)',
  'Trainee / Intern'
];

export const POSITION_EXPERIENCES = [
  'Any Experience',
  'Fresher (No Experience)',
  '0 - 1 Year',
  '1 - 2 Years',
  '2 - 3 Years',
  '3 - 5 Years',
  '5 - 7 Years',
  '7 - 10 Years',
  '10 - 15 Years',
  '15+ Years'
];

export const QUALIFICATION_CATEGORIES = [
  {
    category: 'Basic Education & Schooling',
    options: [
      'Uneducated',
      'Class 5',
      'Class 8',
      'Below 10th',
      '10th Pass (Matriculation)',
      '12th Pass - Non-Medical (PCM)',
      '12th Pass - Medical (PCB)',
      '12th Pass - Commerce',
      '12th Pass - Arts / Humanities'
    ]
  },
  {
    category: 'ITI & Vocational Trades',
    options: [
      'ITI - Fitter / Turner / Machinist',
      'ITI - Welder (Gas & Electric)',
      'ITI - Electrician / Wireman',
      'ITI - Motor Mechanic / Automobile / Diesel',
      'ITI - Tool & Die Maker',
      'ITI - Draughtsman (Mechanical / Civil)',
      'ITI - COPA / Computer Operator',
      'ITI - Other Vocational Trade'
    ]
  },
  {
    category: 'Polytechnic & Diploma (3 Years)',
    options: [
      'Diploma in Mechanical Engineering',
      'Diploma in Production / Industrial Engineering',
      'Diploma in Automobile Engineering',
      'Diploma in Electrical Engineering',
      'Diploma in Electronics & Communication',
      'Diploma in Tool & Die Making',
      'Diploma in Civil Engineering',
      'Diploma in Computer Science / IT',
      'Diploma - Other Technical Discipline'
    ]
  },
  {
    category: 'Graduation - Engineering & Technology (B.Tech / B.E.)',
    options: [
      'B.Tech / B.E. - Mechanical Engineering',
      'B.Tech / B.E. - Production / Industrial Engineering',
      'B.Tech / B.E. - Automobile Engineering',
      'B.Tech / B.E. - Electrical / Electronics Engineering',
      'B.Tech / B.E. - Computer Science / IT',
      'B.Tech / B.E. - Civil Engineering',
      'B.Tech / B.E. - Mechatronics / Robotics',
      'B.Tech / B.E. - Chemical / Metallurgy',
      'B.Tech / B.E. - Other Engineering Branch'
    ]
  },
  {
    category: 'Graduation - Commerce, Arts, Science & Management',
    options: [
      'B.Com (Bachelor of Commerce)',
      'B.Com (Honours)',
      'BBA (Bachelor of Business Administration)',
      'BCA (Bachelor of Computer Applications)',
      'B.Sc (Bachelor of Science)',
      'B.Sc - Agriculture / Forestry',
      'B.Sc - Computer Science / IT',
      'BA (Bachelor of Arts)',
      'BA (Honours)',
      'Any Graduate'
    ]
  },
  {
    category: 'Post Graduation (Master’s Degree)',
    options: [
      'MBA - Human Resources (HR)',
      'MBA - Marketing & Sales',
      'MBA - Operations & Supply Chain',
      'MBA - Finance & Accounts',
      'PGDM (Post Graduate Diploma in Management)',
      'MCA (Master of Computer Applications)',
      'M.Tech / M.E. - Mechanical Engineering',
      'M.Tech / M.E. - Other Branch',
      'M.Com (Master of Commerce)',
      'M.Sc (Master of Science)',
      'MA (Master of Arts)',
      'Any Post Graduate'
    ]
  },
  {
    category: 'Professional Certifications & Doctorate',
    options: [
      'CA (Chartered Accountant)',
      'CS (Company Secretary)',
      'ICWA / CMA (Cost Accountant)',
      'Ph.D / Doctorate',
      'Any Qualification (No Minimum Bar)'
    ]
  }
];

export const SKILLS_CATEGORIES = [
  {
    category: '🏭 Production & Machining',
    skills: [
      'CNC Operating', 'CNC Programming', 'VMC Operating', 'VMC Programming',
      'Lathe Machine Operator', 'Conventional Milling', 'Grinding (Surface / Cylindrical)',
      'Drilling & Tapping', 'Power Press Operator', 'Hydraulic Press',
      'Laser Cutting Machine', 'CNC Bending Machine', 'Shearing Machine',
      'Sheet Metal Stamping', 'Press Tool Operations', 'Die Casting (HPDC / LPDC)',
      'Plastic Injection Moulding', 'MIG / MAG Welding', 'TIG Welding',
      'Arc Welding', 'Spot Welding', 'Robotic Welding', 'Powder Coating & Painting',
      'Electroplating & Phosphating', 'Heat Treatment Operations', 'Assembly Line Operations',
      'Overhead Crane Operating', 'Forklift Operating', 'Packing & Dispatch'
    ]
  },
  {
    category: '🔍 Quality Assurance & Testing',
    skills: [
      'Quality Inspection (IQC / IPQC / FQC)', 'Pre-Dispatch Inspection (PDI)',
      'CMM Inspection', 'Optical Profile Projector', 'Vernier Caliper & Micrometer',
      'Height Gauge & Bore Gauge', '7 QC Tools', '5S / Kaizen Implementation',
      'IATF 16949 / ISO 9001', 'ISO 14001 / ISO 45001', 'PPAP (Part Approval)',
      'APQP (Product Quality Planning)', 'FMEA (Failure Mode Effects)', 'MSA (Measurement Analysis)',
      'SPC (Process Control)', 'Calibration & Gauge R&R', 'Raw Material Testing',
      'Tensile & Hardness Testing', 'Root Cause Analysis (RCA)', 'CAPA Implementation',
      '8D Problem Solving', 'Poka-Yoke (Mistake Proofing)', 'TPM (Total Productive Maintenance)'
    ]
  },
  {
    category: '📐 Design, Tooling & CAD/CAM',
    skills: [
      'AutoCAD 2D / 3D', 'SolidWorks', 'Siemens NX (Unigraphics)', 'CATIA',
      'Creo / Pro-Engineer', 'Autodesk Inventor', 'Mastercam', 'Delcam / PowerMill',
      'Press Tool Design', 'Plastic Mould Design', 'Jigs & Fixtures Design',
      'Tool & Die Making', 'GD&T (Geometric Dimensioning)', 'Reverse Engineering',
      'Bill of Materials (BOM)', 'Rapid Prototyping / 3D Printing'
    ]
  },
  {
    category: '⚡ Electrical, PLC & Maintenance',
    skills: [
      'Machine Maintenance (Mechanical)', 'Electrical Maintenance', 'Preventive Maintenance',
      'Breakdown Maintenance', 'PLC Programming (Siemens / Mitsubishi)', 'SCADA Systems',
      'VFD / AC Drives', 'HMI Programming', 'Control Panel Wiring',
      'Pneumatics & Hydraulics', 'Substation & HT / LT Panels', 'Transformer Maintenance',
      'DG Set Maintenance', 'Air Compressor Maintenance', 'Motor Rewinding',
      'Industrial Automation'
    ]
  },
  {
    category: '📊 Accounts, Finance & Taxation',
    skills: [
      'Tally Prime', 'Tally ERP 9', 'SAP ERP (FICO / MM)', 'Busy Accounting',
      'Marg ERP', 'MS Excel (VLOOKUP / Pivot / Formulas)', 'GST Returns (GSTR-1, 3B, 9)',
      'TDS & TCS Compliance', 'Accounts Payable (AP)', 'Accounts Receivable (AR)',
      'Bank Reconciliation (BRS)', 'Balance Sheet & P&L', 'Invoicing & E-Way Bill',
      'E-Invoicing Compliance', 'Statutory & Tax Audit', 'Cost Accounting & Budgeting',
      'Cash Flow Management', 'MIS Reporting'
    ]
  },
  {
    category: '👥 HR, Admin & Statutory Compliance',
    skills: [
      'HR Recruitment & Talent Sourcing', 'Candidate Screening & Interviewing',
      'Payroll Processing & Salary Slip', 'PF & ESIC Compliance', 'Factory Act & Labour Laws',
      'Gratuity & Bonus Calculation', 'Time Office & Attendance Management',
      'Biometric Software Systems', 'Contract Labour Management', 'HR Generalist Operations',
      'Employee Grievance Handling', 'Disciplinary & Domestic Enquiry',
      'Office Administration', 'Facility Management', 'Industrial Safety & Fire Fighting',
      'EHS Compliance'
    ]
  },
  {
    category: '📦 Store, Purchase & Logistics',
    skills: [
      'Purchase Procurement', 'Vendor Development & Sourcing', 'Price & Contract Negotiation',
      'Purchase Order (PO) Management', 'Store & Inventory Management', 'Material Inward (GRN)',
      'FIFO & Bin Card System', 'Dispatch & Logistics Coordination', 'Vehicle Tracking & Fleet',
      'Packing & Dispatch Documentation', 'Supply Chain Management',
      'Production Planning & Control (PPC)', 'Material Requirement Planning (MRP)'
    ]
  },
  {
    category: '💼 Sales, Marketing & Business Development',
    skills: [
      'B2B Industrial Sales', 'OEM Sales & Business Development', 'Key Account Management',
      'Industrial Quotations & Tenders', 'Cold Calling & Lead Generation',
      'Client Relationship Management', 'Customer Complaints Resolution',
      'Sales Pitch & Presentations', 'Market Research & Competitor Analysis',
      'Export-Import (EXIM) Documentation'
    ]
  },
  {
    category: '💻 IT, Software & Computer Support',
    skills: [
      'Computer Hardware & Networking', 'LAN / WAN & Wi-Fi Configuration',
      'CCTV & Surveillance System', 'System Administration (Windows Server)',
      'IT Desktop Support', 'Data Entry & Fast Typing', 'MIS Reporting & Google Sheets',
      'Web Development', 'SQL / Database Management', 'Cybersecurity Basics'
    ]
  }
];

export const MASTER_SKILLS_LIBRARY = Array.from(new Set(SKILLS_CATEGORIES.flatMap(c => c.skills)));

export const POPULAR_QUICK_SKILLS = [
  'AutoCAD',
  'SolidWorks',
  'CNC / VMC',
  'Quality Inspection',
  'IATF 16949',
  'CMM Inspection',
  'Tally Prime',
  'MS Excel',
  'PLC Programming',
  'Machine Maintenance',
  'MIG / TIG Welding',
  'Purchase Procurement',
  'HR Recruitment',
  'GST Filing'
];

export const POSITION_URGENCIES = [
  '🔴 Critical / Urgent',
  '🟠 High Priority',
  '🟡 Medium Priority',
  '🟢 Low Priority',
  '⚪ Pipeline / Future'
];

export const POSITION_WORK_MODES = [
  'On-Site (Plant / Office)',
  'Field Work (Sales / Site)',
  'Hybrid',
  'Work From Home'
];

export const POSITION_SHIFT_TYPES = [
  'General Shift (Day)',
  'Rotational Shifts (A, B, C)',
  'Night Shift Only'
];

export const POSITION_GENDERS = [
  'No Preference (Any)',
  'Male Only',
  'Female Only'
];

function formatISTDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(d);
}

function getStageNumber(stageId) {
  if (!stageId) return -1;
  const match = String(stageId).match(/\d+/);
  return match ? parseInt(match[0], 10) : -1;
}

function getSlaDelayInfo(plannedDateObj, actualDateObj = null) {
  if (!plannedDateObj || isNaN(plannedDateObj.getTime())) {
    return { isDelayed: false, badgeText: '🟢 On Track', color: '#166534', bg: '#dcfce7' };
  }
  const compareTime = actualDateObj && !isNaN(actualDateObj.getTime()) ? actualDateObj.getTime() : Date.now();
  const diffMs = compareTime - plannedDateObj.getTime();
  
  if (diffMs > 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(diffHours / 24);
    const hours = diffHours % 24;
    const durStr = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
    return {
      isDelayed: true,
      badgeText: `🔴 Delayed (${durStr})`,
      color: '#991b1b',
      bg: '#fee2e2'
    };
  } else {
    return {
      isDelayed: false,
      badgeText: '🟢 On Track',
      color: '#166534',
      bg: '#dcfce7'
    };
  }
}

const getStatusOptions = (stage) => {
  switch (stage) {
    case 'S02':
      return ['Awaiting Screening', 'Resume Selected', 'Resume Rejected', 'No Response', 'ReSchedule'];
    case 'S03':
      return ['Interview Scheduled', 'Interview Cleared', 'Interview Rejected', 'No Response', 'ReSchedule'];
    case 'S04':
      return ['Test Pending', 'Test Passed', 'Test Failed', 'No Response', 'ReSchedule'];
    case 'S05':
      return ['No Response', 'ReSchedule', 'Final Pending', 'Final Rejected', 'Final Confirmed'];
    case 'S06':
      return ['Negotiation Pending', 'Salary Agreed', 'Salary Rejected', 'No Response', 'ReSchedule'];
    case 'S07':
      return ['Shortlisted', 'Dropped', 'No Response', 'ReSchedule'];
    case 'S08':
      return ['LOI Released', 'LOI Accepted', 'LOI Declined', 'No Response', 'ReSchedule'];
    case 'S09':
      return ['Joining Pending', 'Joined', 'No Show', 'No Response', 'ReSchedule'];
    default:
      return ['Pending', 'No Response', 'ReSchedule'];
  }
};

const DEFAULT_DEPARTMENTS = [
  "Accounts & Finance", "Administration", "Audit", "Dispatch", "Director",
  "Corporate Strategy and Planning", "Electrical & Maintenance", "Human Resource",
  "Human Resource & Administration", "Information Technology", "Logistics",
  "Manufacturing Engineering", "Marketing", "Operations", "Production",
  "Purchase", "Quality Assurance", "Research & Development", "Sales",
  "Sales & Marketing", "Service", "Store", "Tool Room", "Training and Development",
  "Transport", "Security", "Production Planning and Control", "Vendor Development"
];

function SearchableQualificationSelect({ value, onChange, placeholder = "Select or type qualification..." }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value || '');

  useEffect(() => {
    setSearch(value || '');
  }, [value]);

  const filtered = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return QUALIFICATION_CATEGORIES;
    const res = [];
    for (const cat of QUALIFICATION_CATEGORIES) {
      const matched = cat.options.filter(opt => opt.toLowerCase().includes(q));
      if (matched.length > 0) {
        res.push({ category: cat.category, options: matched });
      }
    }
    return res;
  }, [search]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            setTimeout(() => setIsOpen(false), 250);
          }}
          placeholder={placeholder}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '0.5rem 2.2rem 0.5rem 0.65rem',
            borderRadius: '8px',
            border: '1px solid var(--border-light)',
            backgroundColor: 'var(--bg-surface)',
            fontSize: '0.85rem'
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen(prev => !prev)}
          style={{
            position: 'absolute',
            right: '8px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            fontSize: '0.75rem',
            padding: '0.2rem'
          }}
        >
          ▾
        </button>
      </div>

      {isOpen && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 1000,
          backgroundColor: 'var(--bg-surface, #ffffff)',
          border: '1px solid var(--border-light, #cbd5e1)',
          borderRadius: '8px',
          boxShadow: '0 12px 28px rgba(0,0,0,0.15)',
          maxHeight: '260px',
          overflowY: 'auto'
        }}>
          {filtered.map(cat => (
            <div key={cat.category}>
              <div style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-primary)',
                borderBottom: '1px solid var(--border-light)',
                letterSpacing: '0.03em'
              }}>
                {cat.category}
              </div>
              {cat.options.map(opt => (
                <div
                  key={opt}
                  onMouseDown={() => {
                    setSearch(opt);
                    onChange(opt);
                    setIsOpen(false);
                  }}
                  style={{
                    padding: '0.5rem 0.85rem',
                    cursor: 'pointer',
                    fontSize: '0.83rem',
                    color: 'var(--text-primary)',
                    borderBottom: '1px solid var(--border-light)',
                    transition: 'background-color 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {opt}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InteractiveSkillTagInput({ value, onChange }) {
  const [inputVal, setInputVal] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Parse comma-separated value into array of trimmed strings
  const currentSkills = useMemo(() => {
    if (!value) return [];
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }, [value]);

  const addSkill = (skill) => {
    const clean = skill.trim();
    if (!clean) return;
    if (!currentSkills.some(s => s.toLowerCase() === clean.toLowerCase())) {
      const next = [...currentSkills, clean];
      onChange(next.join(', '));
    }
    setInputVal('');
  };

  const addMultipleSkills = (skillsArray) => {
    const existingLower = new Set(currentSkills.map(s => s.toLowerCase()));
    const toAdd = [];
    for (const s of skillsArray) {
      const clean = s.trim();
      if (clean && !existingLower.has(clean.toLowerCase())) {
        toAdd.push(clean);
        existingLower.add(clean.toLowerCase());
      }
    }
    if (toAdd.length > 0) {
      onChange([...currentSkills, ...toAdd].join(', '));
    }
    setInputVal('');
  };

  const removeSkill = (indexToRemove) => {
    const next = currentSkills.filter((_, i) => i !== indexToRemove);
    onChange(next.join(', '));
  };

  const matchingSuggestions = useMemo(() => {
    const q = inputVal.trim().toLowerCase();
    if (!q) return [];
    return MASTER_SKILLS_LIBRARY.filter(s => 
      s.toLowerCase().includes(q) && 
      !currentSkills.some(cs => cs.toLowerCase() === s.toLowerCase())
    ).slice(0, 15);
  }, [inputVal, currentSkills]);

  const isExactMatch = useMemo(() => {
    const q = inputVal.trim().toLowerCase();
    if (!q) return true;
    return MASTER_SKILLS_LIBRARY.some(s => s.toLowerCase() === q) || 
           currentSkills.some(s => s.toLowerCase() === q);
  }, [inputVal, currentSkills]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', width: '100%' }}>
      {/* Container box with active tags and input */}
      <div 
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.35rem',
          alignItems: 'center',
          padding: '0.4rem 0.5rem',
          borderRadius: '8px',
          border: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-surface)',
          minHeight: '42px',
          position: 'relative'
        }}
      >
        {currentSkills.map((sk, idx) => (
          <span 
            key={idx}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: 'rgba(37, 99, 235, 0.1)',
              color: 'var(--accent-color, #2563eb)',
              border: '1px solid rgba(37, 99, 235, 0.25)',
              padding: '0.2rem 0.5rem',
              borderRadius: '14px'
            }}
          >
            <span>{sk}</span>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => removeSkill(idx)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '0 0.1rem',
                fontSize: '0.75rem',
                color: 'var(--accent-color, #2563eb)',
                display: 'inline-flex',
                alignItems: 'center'
              }}
              title="Remove skill"
            >
              ✕
            </button>
          </span>
        ))}

        <div style={{ flex: 1, minWidth: '160px', display: 'flex', alignItems: 'center', position: 'relative' }}>
          <input 
            type="text"
            value={inputVal}
            onChange={(e) => {
              const val = e.target.value;
              if (val.includes(',')) {
                const parts = val.split(',');
                addMultipleSkills(parts);
              } else {
                setInputVal(val);
                setIsOpen(true);
              }
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => {
              setTimeout(() => setIsOpen(false), 280);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (inputVal.trim()) {
                  addSkill(inputVal);
                }
              } else if (e.key === 'Backspace' && !inputVal && currentSkills.length > 0) {
                removeSkill(currentSkills.length - 1);
              }
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData?.getData('text');
              if (pasted && (pasted.includes(',') || pasted.includes('\n'))) {
                e.preventDefault();
                const parts = pasted.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
                addMultipleSkills(parts);
              }
            }}
            placeholder={currentSkills.length === 0 ? "Type skill (AutoCAD, CNC, Tally...) or click ▾" : "Add more skills..."}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '0.82rem',
              width: '100%',
              padding: '0.2rem',
              color: 'var(--text-primary)'
            }}
          />

          <button
            type="button"
            tabIndex={-1}
            onClick={() => setIsOpen(prev => !prev)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '0.75rem',
              padding: '0.2rem 0.4rem',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px'
            }}
            title="Browse all skills"
          >
            ▾
          </button>
        </div>

        {/* Dropdown Popup */}
        {isOpen && (
          <div 
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              zIndex: 1050,
              backgroundColor: 'var(--bg-surface, #ffffff)',
              border: '1px solid var(--border-light, #cbd5e1)',
              borderRadius: '8px',
              boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
              maxHeight: '270px',
              overflowY: 'auto'
            }}
          >
            {/* If user typed something not matching, allow ➕ Add custom skill */}
            {inputVal.trim() && !isExactMatch && (
              <div
                onMouseDown={() => addSkill(inputVal)}
                style={{
                  padding: '0.6rem 0.85rem',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  backgroundColor: 'rgba(37, 99, 235, 0.08)',
                  color: 'var(--accent-color, #2563eb)',
                  borderBottom: '1px solid var(--border-light)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <span>➕ Add custom skill: <strong>"{inputVal.trim()}"</strong></span>
              </div>
            )}

            {/* If user is typing: show matching suggestions */}
            {inputVal.trim() ? (
              matchingSuggestions.length > 0 ? (
                matchingSuggestions.map(s => (
                  <div 
                    key={s}
                    onMouseDown={() => addSkill(s)}
                    style={{
                      padding: '0.5rem 0.85rem',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      borderBottom: '1px solid var(--border-light)',
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <span>{s}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)', fontWeight: 600 }}>+ Add</span>
                  </div>
                ))
              ) : !isExactMatch ? null : (
                <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  No more matching skills
                </div>
              )
            ) : (
              /* If input is empty: show CATEGORIZED browse list */
              <div>
                <div style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)' }}>
                  Browse All Skills by Department (Click to Add)
                </div>
                {SKILLS_CATEGORIES.map(cat => (
                  <div key={cat.category}>
                    <div style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      backgroundColor: 'var(--bg-primary)',
                      borderBottom: '1px solid var(--border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}>
                      {cat.category}
                    </div>
                    {cat.skills.filter(s => !currentSkills.some(cs => cs.toLowerCase() === s.toLowerCase())).map(sk => (
                      <div
                        key={sk}
                        onMouseDown={() => addSkill(sk)}
                        style={{
                          padding: '0.45rem 0.85rem',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          color: 'var(--text-primary)',
                          borderBottom: '1px solid var(--border-light)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'background-color 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <span>{sk}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)' }}>+ Add</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Add Popular Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Popular:</span>
        {POPULAR_QUICK_SKILLS.map(quick => {
          const isAdded = currentSkills.some(cs => cs.toLowerCase() === quick.toLowerCase());
          return (
            <button
              key={quick}
              type="button"
              tabIndex={-1}
              onClick={() => {
                if (isAdded) {
                  const idx = currentSkills.findIndex(cs => cs.toLowerCase() === quick.toLowerCase());
                  if (idx >= 0) removeSkill(idx);
                } else {
                  addSkill(quick);
                }
              }}
              style={{
                fontSize: '0.68rem',
                padding: '0.15rem 0.45rem',
                borderRadius: '12px',
                border: isAdded ? '1px solid var(--accent-color)' : '1px solid var(--border-light)',
                backgroundColor: isAdded ? 'var(--accent-color)' : 'var(--bg-primary)',
                color: isAdded ? '#ffffff' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              {isAdded ? `✓ ${quick}` : `+ ${quick}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =========================================================================
// RECRUITER INSTANT LOCAL CACHE & SWR (STALE-WHILE-REVALIDATE) HELPERS
// =========================================================================
const RECRUITER_CACHE_KEYS = {
  departments: 'recruiter_departments_cache',
  recruiters: (comp) => `recruiter_recruiters_cache_${comp || 'all'}`
};

function readLocalCache(key, fallback = []) {
  if (typeof window === 'undefined' || !key) return fallback;
  try {
    const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeLocalCache(key, data) {
  if (typeof window === 'undefined' || !key) return;
  try {
    const serialized = JSON.stringify(data);
    sessionStorage.setItem(key, serialized);
    localStorage.setItem(key, serialized);
  } catch (_) {}
}

export default function RecruiterDashboard({ 
  viewerId,
  userRole, 
  userName, 
  selectedStage = 'positions', 
  recruiterAccess = null, 
  moduleAccess = null,
  isAdmin = false,
  userCompany = '',
  tenantId = null,
  adminCompanyFilter = 'All',
  onSelectStage = null
}) {
  const supabase = useMemo(() => createClient(), []);

  const isSuperOrAdmin = Boolean(
    isAdmin ||
    userRole === 'admin' ||
    userRole === 'Admin' ||
    userRole === 'superadmin' ||
    userRole === 'masteradmin' ||
    userRole === 'Master Admin' ||
    (typeof userRole === 'string' && userRole.toLowerCase().includes('admin')) ||
    moduleAccess?.is_master_admin === true
  );

  const effectiveTenantId = useMemo(() => {
    if (tenantId) return tenantId;
    const c = String(userCompany || '').toLowerCase().trim();
    const SWAN_COMPANIES = ['nsmlr', 'nstlp', 'nstl', 'new swan group', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl'];
    if (!c || SWAN_COMPANIES.includes(c)) return '00000000-0000-0000-0000-000000000001';
    return null;
  }, [tenantId, userCompany]);

  // Compute which stages this user can access
  const canAccessStage = (stageId) => {
    if (isSuperOrAdmin) return true;
    if (!recruiterAccess) return true; // fallback: allow all if no access config
    if (recruiterAccess.is_manager) return true; // full access
    const steps = recruiterAccess.assigned_steps_view || recruiterAccess.assigned_steps || [];
    if (steps.length === 0) return true; // no restriction set
    return steps.includes(stageId);
  };

  // Compute if user has edit permission for a stage
  const canEditStage = (stageId) => {
    if (isSuperOrAdmin) return true;
    if (!recruiterAccess) return true; // fallback: allow all if no access config
    if (recruiterAccess.is_manager) return true; // full access
    const steps = recruiterAccess.assigned_steps_edit || recruiterAccess.assigned_steps || [];
    if (steps.length === 0) return true; // no restriction set
    return steps.includes(stageId);
  };

  const canAccessDashboard = isSuperOrAdmin || !!(recruiterAccess?.is_manager);
  const canAccessAllStages = canAccessDashboard;

  // Power check: only Manager, Admin, or users with can_decrease_recruiter_stage can revert/demote stages
  const canDecreaseStage = useMemo(() => {
    return isSuperOrAdmin || 
      recruiterAccess?.is_manager === true || 
      recruiterAccess?.can_decrease_stage === true || 
      moduleAccess?.can_decrease_recruiter_stage === true ||
      moduleAccess?.recruiter?.can_decrease_stage === true ||
      moduleAccess?.recruiter?.is_manager === true ||
      moduleAccess?.is_master_admin === true;
  }, [isSuperOrAdmin, recruiterAccess, moduleAccess]);

  const isManagerOrAdmin = useMemo(() => {
    return isSuperOrAdmin || 
      recruiterAccess?.is_manager === true || 
      userRole === 'manager' || 
      userRole === 'Manager' || 
      userRole === 'hr_manager' || 
      userRole === 'HR Manager' ||
      moduleAccess?.recruiter?.is_manager === true ||
      moduleAccess?.can_decrease_recruiter_stage === true;
  }, [isSuperOrAdmin, recruiterAccess, userRole, moduleAccess]);
  
  // Table View Preference (Table vs Tiles)
  const currentTableId = (selectedStage === 'S00' || selectedStage === 'S01') 
    ? 'Recruiter/RecruiterDashboard-1' 
    : 'Recruiter/RecruiterDashboard-2';
  const [recruiterTableView, setRecruiterTableView] = useTableViewPreference(currentTableId);

  // Data State - Initialized synchronously from fast local cache for 0ms Instant Mount
  const recruiterScope = useMemo(() => ({
    userId: viewerId,
    tenantId: effectiveTenantId,
    filter: adminCompanyFilter,
    autoAssign: canAccessDashboard,
    permissions: JSON.stringify([userRole, isSuperOrAdmin, recruiterAccess, moduleAccess?.assigned_branch_scope, moduleAccess?.assigned_branch_codes, moduleAccess?.assigned_branches])
  }), [viewerId, effectiveTenantId, adminCompanyFilter, userRole, isSuperOrAdmin, canAccessDashboard, recruiterAccess,
    moduleAccess?.assigned_branch_scope, moduleAccess?.assigned_branch_codes, moduleAccess?.assigned_branches]);
  const { rows, loading, error: syncError, manual: isBackgroundSyncing, loadData } = useRecruiterLists(recruiterScope, supabase);
  const { positions, candidates } = rows;
  const [departments, setDepartments] = useState(() => readLocalCache(RECRUITER_CACHE_KEYS.departments, DEFAULT_DEPARTMENTS));
  const submitChange = async (operation, payload, options) => {
    const result = await submitRecruiterChange(recruiterScope, operation, payload, options);
    if (result?.queued) showSyncToast('Recruiter change saved offline. It will sync when you reconnect.', 'success');
    return result;
  };
  const savePosition = payload => submitChange('position:save', payload);
  const saveCandidate = (payload, options) => submitChange('candidate:save', payload, options);
  const [recruitersList, setRecruitersList] = useState(() => readLocalCache(RECRUITER_CACHE_KEYS.recruiters(userCompany), []));

  // Column Resizing Hooks (Lead Data Pattern)
  const {
    colWidths: posColWidths,
    resizingCol: posResizingCol,
    handleResizeStart: handlePosResizeStart,
    resetColWidth: resetPosColWidth,
    getTotalTableWidth: getPosTotalTableWidth
  } = useTableColumnResize(
    'recruiter_positions_table_col_widths',
    RECRUITER_POSITIONS_DEFAULT_COL_WIDTHS,
    RECRUITER_POSITIONS_MIN_COL_WIDTHS
  );

  const {
    colWidths: candColWidths,
    resizingCol: candResizingCol,
    handleResizeStart: handleCandResizeStart,
    resetColWidth: resetCandColWidth,
    getTotalTableWidth: getCandTotalTableWidth
  } = useTableColumnResize(
    'recruiter_candidates_table_col_widths',
    RECRUITER_CANDIDATES_DEFAULT_COL_WIDTHS,
    RECRUITER_CANDIDATES_MIN_COL_WIDTHS
  );
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPositionFilter, setSelectedPositionFilter] = useState('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
  const [selectedRecruiterFilter, setSelectedRecruiterFilter] = useState('All');
  const [selectedAllStagesPillFilter, setSelectedAllStagesPillFilter] = useState('All');

  // Standard Table Pagination State (synced with Config Master > Page Navigation Rules)
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const settings = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (settings.defaultPageSize) {
          return settings.defaultPageSize === 'All' ? 100000 : parseInt(settings.defaultPageSize, 10);
        }
      } catch (e) {}
    }
    return 15;
  });
  const [currentPage, setCurrentPage] = useState(1);

  // Sync pageSize with crm_page_nav_updated & crm_config_updated window events
  useEffect(() => {
    const handleNavConfigUpdate = () => {
      try {
        const cached = localStorage.getItem('crmPageNavSettings');
        if (cached) {
          const settings = JSON.parse(cached);
          if (settings.defaultPageSize !== undefined) {
            const defSize = settings.defaultPageSize === 'All' ? 100000 : parseInt(settings.defaultPageSize, 10);
            if (defSize) {
              setPageSize(defSize);
              setCurrentPage(1);
            }
          }
        }
      } catch (e) {}
    };
    window.addEventListener('crm_page_nav_updated', handleNavConfigUpdate);
    window.addEventListener('crm_config_updated', handleNavConfigUpdate);
    return () => {
      window.removeEventListener('crm_page_nav_updated', handleNavConfigUpdate);
      window.removeEventListener('crm_config_updated', handleNavConfigUpdate);
    };
  }, []);

  // Reset stage-specific filters and pagination when switching active stage
  useEffect(() => {
    setSelectedStatusFilter('All');
    setSelectedAllStagesPillFilter('All');
    setSearchTerm('');
    setSelectedPositionFilter('All');
    setSelectedRecruiterFilter('All');
    setCurrentPage(1);
  }, [selectedStage]);

  // Automatic Page Reset: Whenever user searches or alters filters, reset to page 1
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedPositionFilter, selectedStatusFilter, selectedRecruiterFilter, selectedAllStagesPillFilter]);

  // Dashboard Sub-Tab Navigation with URL Route Sync
  const resolveSubTabFromUrl = useCallback(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('/daily-activity') || path.includes('/daily_activity')) return 'daily_activity';
      if (path.includes('/scoring')) return 'scoring';
      if (path.includes('/overview')) return 'overview';
      const params = new URLSearchParams(window.location.search);
      const tabParam = (params.get('subtab') || params.get('tab') || '').toLowerCase();
      if (tabParam === 'daily-activity' || tabParam === 'daily_activity') return 'daily_activity';
      if (tabParam === 'scoring') return 'scoring';
      if (tabParam === 'overview') return 'overview';
    }
    return 'overview';
  }, []);

  const [dashboardSubTab, setDashboardSubTab] = useState(resolveSubTabFromUrl);

  const handleSwitchSubTab = useCallback((tab) => {
    setDashboardSubTab(tab);
    if (typeof window !== 'undefined') {
      const targetUrl = tab === 'overview' 
        ? '/recruiter/overview' 
        : tab === 'daily_activity' 
        ? '/recruiter/daily-activity' 
        : '/recruiter/scoring';
      window.history.pushState(null, '', targetUrl);
    }
  }, []);

  // Listen to browser Back/Forward (popstate)
  useEffect(() => {
    const handlePopState = () => {
      setDashboardSubTab(resolveSubTabFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [resolveSubTabFromUrl]);

  // Dashboard Interactive Multi-Filter State (Strict IST)
  const [dashDatePreset, setDashDatePreset] = useState('all');
  const [dashStartDate, setDashStartDate] = useState('');
  const [dashEndDate, setDashEndDate] = useState('');
  const [dashBranchFilter, setDashBranchFilter] = useState('All');
  const [dashDeptFilter, setDashDeptFilter] = useState('All');
  const [dashPosFilter, setDashPosFilter] = useState('All');
  const [dashRecruiterFilter, setDashRecruiterFilter] = useState('All');
  const [dashStatusFilter, setDashStatusFilter] = useState('All');

  // Daily Activity Sub-Tab Filters (Strict IST)
  const [dailyDatePreset, setDailyDatePreset] = useState('today');
  const [dailyCustomStart, setDailyCustomStart] = useState('');
  const [dailyCustomEnd, setDailyCustomEnd] = useState('');

  // Job Requirement Scoring Sub-Tab Filters & Sorting
  const [reqSearch, setReqSearch] = useState('');
  const [reqFulfillmentFilter, setReqFulfillmentFilter] = useState('All');
  const [reqDeptFilter, setReqDeptFilter] = useState('All');
  const [reqRecruiterFilter, setReqRecruiterFilter] = useState('All');
  const [reqSort, setReqSort] = useState('score_desc');

  const handleResetDashFilters = () => {
    setDashDatePreset('all');
    setDashStartDate('');
    setDashEndDate('');
    setDashBranchFilter('All');
    setDashDeptFilter('All');
    setDashPosFilter('All');
    setDashRecruiterFilter('All');
    setDashStatusFilter('All');
  };
  
  // Modals & Panels State
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [isCandidateModalOpen, setIsCandidateModalOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [candidateProfileInitialView, setCandidateProfileInitialView] = useState('details');

  // Candidate Stage History Table Modal State
  const [selectedCandidateForHistory, setSelectedCandidateForHistory] = useState(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // Position Details Drawer State
  const [selectedPositionForDetails, setSelectedPositionForDetails] = useState(null);
  const [isPositionDetailsOpen, setIsPositionDetailsOpen] = useState(false);

  // Admin Quick Stage Change Modal State
  const [stageChangeCandidate, setStageChangeCandidate] = useState(null);
  const [isStageChangeModalOpen, setIsStageChangeModalOpen] = useState(false);
  const [targetStageOverride, setTargetStageOverride] = useState('S02');
  const [stageOverrideReason, setStageOverrideReason] = useState('');
  const [isOverridingStage, setIsOverridingStage] = useState(false);
  
  // Edit Position State
  const [editingPosition, setEditingPosition] = useState(null);
  const [editPositionForm, setEditPositionForm] = useState({});
  const [savingEditPos, setSavingEditPos] = useState(false);
  const [copiedPosId, setCopiedPosId] = useState(null);

  // S01 Job Description "View More" Modal State
  const [selectedJdPosition, setSelectedJdPosition] = useState(null);

  // S01 Job Posting Channels Checklist Modal State
  const [editingChannelsPos, setEditingChannelsPos] = useState(null);
  const [tempChannels, setTempChannels] = useState([]);
  const [savingChannels, setSavingChannels] = useState(false);

  // S01 Posting Status Instant Saving State
  const [savingPostingStatus, setSavingPostingStatus] = useState({});


  const handleUpdatePostingStatus = async (positionId, newPostingStatus) => {
    setSavingPostingStatus(prev => ({ ...prev, [positionId]: true }));
    try {
      const res = await savePosition({
        id: positionId,
        posting_status: newPostingStatus
      });
      if (!res.success) throw new Error(res.error);
    } catch (err) {
      alert("Error updating posting status: " + err.message);
    } finally {
      setSavingPostingStatus(prev => ({ ...prev, [positionId]: false }));
    }
  };

  const handleOpenChannelsModal = (pos) => {
    setEditingChannelsPos(pos);
    setTempChannels(Array.isArray(pos.posting_sources) ? [...pos.posting_sources] : []);
  };

  const handleToggleChannel = (channel) => {
    setTempChannels(prev => 
      prev.includes(channel) 
        ? prev.filter(c => c !== channel) 
        : [...prev, channel]
    );
  };

  const handleSelectAllChannels = () => {
    setTempChannels([...STANDARD_POSTING_SOURCES]);
  };

  const handleClearAllChannels = () => {
    setTempChannels([]);
  };

  const handleSaveChannels = async () => {
    if (!editingChannelsPos) return;
    setSavingChannels(true);
    try {
      const res = await savePosition({
        id: editingChannelsPos.id,
        posting_sources: tempChannels
      });
      if (!res.success) throw new Error(res.error);
      setEditingChannelsPos(null);
    } catch (err) {
      alert("Error saving posting channels: " + err.message);
    } finally {
      setSavingChannels(false);
    }
  };

  const handleCopyApplyLink = async (posId) => {
    try {
      const link = `${window.location.origin}/apply/${posId}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const ta = document.createElement('textarea');
        ta.value = link;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedPosId(posId);
      setTimeout(() => setCopiedPosId(null), 2500);
    } catch (err) {
      console.warn('Clipboard writeText failed:', err);
      prompt('Copy the application link below:', `${window.location.origin}/apply/${posId}`);
    }
  };
  
  // Form State
  const [newPosition, setNewPosition] = useState({ 
    title: '', 
    department: '', 
    branch_code: '',
    openings: 1, 
    jd_text: '', 
    deadline_date: '', 
    interviewer_name: '', 
    recruiter_assigned: 'All', 
    salary_min: '', 
    salary_max: '',
    job_type: 'Full Time (Permanent)',
    vacancy_reason: 'New Position',
    experience_required: 'Any Experience',
    min_qualification: 'Any Qualification (No Minimum Bar)',
    urgency: '🟡 Medium Priority',
    work_mode: 'On-Site (Plant / Office)',
    shift_type: 'General Shift (Day)',
    gender_preference: 'No Preference (Any)',
    key_skills: '',
    posting_status: 'Draft',
    posting_sources: []
  });
  const branchCacheKey = useMemo(() => `recruiter_branches_${userCompany || 'all'}`, [userCompany]);
  const teamCacheKey = useMemo(() => `recruiter_team_${userCompany || 'all'}_${effectiveTenantId || 'default'}`, [userCompany, effectiveTenantId]);

  const [availableBranches, setAvailableBranches] = useState(() => readLocalCache(`recruiter_branches_${userCompany || 'all'}`, []));
  const [teamMembers, setTeamMembers] = useState(() => readLocalCache(`recruiter_team_${userCompany || 'all'}_${effectiveTenantId || 'default'}`, []));

  // Load Available Branches (SWR pattern)
  useEffect(() => {
    async function loadBranches() {
      try {
        const res = await getTenantBranches(userCompany || 'New Swan Group');
        if (res?.success && Array.isArray(res.branches)) {
          const activeBranches = res.branches.filter(b => b.is_active !== false);
          setAvailableBranches(activeBranches);
          writeLocalCache(branchCacheKey, activeBranches);
        }
      } catch (e) {
        console.warn('Failed to load branches in RecruiterDashboard:', e);
      }
    }
    loadBranches();
  }, [userCompany, branchCacheKey]);

  // Load Team Members for Interviewer Search & Select (SWR pattern)
  useEffect(() => {
    async function loadTeam() {
      try {
        const members = await getTeamMembers(userCompany, effectiveTenantId);
        if (Array.isArray(members)) {
          const mappedMembers = members.map(m => ({
            ...m,
            id: m.user_id || m.id,
            email: m.email || '',
            name: m.emp_name || m.name || m.email || 'Employee',
            emp_name: m.emp_name || m.name || m.email || 'Employee',
            department: m.department || m.emp_department || 'General',
            designation: m.emp_designation || m.designation || 'Staff'
          }));
          setTeamMembers(mappedMembers);
          writeLocalCache(teamCacheKey, mappedMembers);
        }
      } catch (e) {
        console.warn('Failed to load team members in RecruiterDashboard:', e);
      }
    }
    loadTeam();
  }, [userCompany, effectiveTenantId, teamCacheKey]);

  // Set default branch for newPosition
  useEffect(() => {
    if (availableBranches.length > 0 && !newPosition.branch_code) {
      const defaultBranch = (adminCompanyFilter && adminCompanyFilter !== 'All') 
        ? adminCompanyFilter 
        : (availableBranches[0]?.code || 'TNT00002-B0002');
      setNewPosition(prev => ({ ...prev, branch_code: prev.branch_code || defaultBranch }));
    }
  }, [availableBranches, adminCompanyFilter, newPosition.branch_code]);
  const [newCandidate, setNewCandidate] = useState({ 
    name: '', 
    email: '', 
    phone: '', 
    alternate_phone: '',
    position_id: '', 
    current_city: '',
    total_experience: '',
    highest_qualification: '',
    current_salary: '',
    expected_salary_min: '', 
    expected_salary_max: '',
    notice_period: '',
    cover_note: '',
    resume_url: '' 
  });
  const [showCandidateCityDropdown, setShowCandidateCityDropdown] = useState(false);
  const [isRegisteringCandidate, setIsRegisteringCandidate] = useState(false);

  const candidateCitySuggestions = useMemo(() => {
    const q = (newCandidate.current_city || '').trim().toLowerCase();
    if (!q || q.length < 1) return [];
    return MASTER_CITIES.filter(c => c.toLowerCase().includes(q)).slice(0, 8);
  }, [newCandidate.current_city]);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    confirmText: '',
    cancelText: ''
  });

  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingResume(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `resumes/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('recruitment_resumes')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error details:', uploadError);
        alert(`Error uploading resume: ${uploadError.message}\n\nPlease verify that the 'recruitment_resumes' storage bucket exists in your Supabase project and is set to Public.`);
        setUploadingResume(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('recruitment_resumes')
        .getPublicUrl(filePath);

      setNewCandidate(prev => ({ ...prev, resume_url: publicUrlData.publicUrl }));
    } catch (err) {
      console.error('Resume upload error:', err);
      alert('An unexpected error occurred during upload: ' + err.message);
    } finally {
      setUploadingResume(false);
    }
  };


  const [pipelineConfig, setPipelineConfig] = useState(null);

  // Load dynamic pipeline config from Settings > Recruiter Config
  useEffect(() => {
    async function fetchPipelineConfig() {
      try {
        const res = await getRecruiterPipelineConfig(effectiveTenantId, adminCompanyFilter);
        if (res?.success && res.config) {
          setPipelineConfig(res.config);
        }
      } catch (err) {
        console.warn('Failed to load recruiter pipeline config:', err);
      }
    }
    fetchPipelineConfig();

    const handleConfigUpdated = (e) => {
      if (e?.detail?.config) {
        setPipelineConfig(e.detail.config);
      } else {
        fetchPipelineConfig();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('crm_recruiter_config_updated', handleConfigUpdated);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('crm_recruiter_config_updated', handleConfigUpdated);
      }
    };
  }, [effectiveTenantId, adminCompanyFilter]);

  const STAGES = useMemo(() => {
    if (pipelineConfig?.stages && Array.isArray(pipelineConfig.stages)) {
      return pipelineConfig.stages
        .filter(s => s.is_enabled !== false)
        .map(s => ({
          id: s.id,
          label: s.name || `${s.id} — ${s.short_code}`,
          color: s.color || '#cbd5e1',
          textColor: s.textColor || '#334155',
          tat_hours: s.tat_hours || 24,
          status_options: s.status_options || []
        }));
    }
    return [
      { id: 'S02', label: 'S02: Resume Filtered', color: '#cbd5e1', textColor: '#334155', tat_hours: 24, status_options: ['Awaiting Screening', 'Resume Selected', 'Resume Rejected', 'No Response', 'ReSchedule'] },
      { id: 'S03', label: 'S03: Interview Executed', color: '#fef9c3', textColor: '#854d0e', tat_hours: 48, status_options: ['Interview Scheduled', 'Interview Cleared', 'Interview Rejected', 'No Response', 'ReSchedule'] },
      { id: 'S04', label: 'S04: Test Results', color: '#dbeafe', textColor: '#1e40af', tat_hours: 24, status_options: ['Test Pending', 'Test Passed', 'Test Failed', 'No Response', 'ReSchedule'] },
      { id: 'S05', label: 'S05: Final Confirmation', color: '#ffedd5', textColor: '#c2410c', tat_hours: 48, status_options: ['No Response', 'ReSchedule', 'Final Pending', 'Final Rejected', 'Final Confirmed'] },
      { id: 'S06', label: 'S06: Salary Negotiation', color: '#f5d0fe', textColor: '#86198f', tat_hours: 24, status_options: ['Negotiation Pending', 'Salary Agreed', 'Salary Rejected', 'No Response', 'ReSchedule'] },
      { id: 'S07', label: 'S07: Shortlisted', color: '#e0e7ff', textColor: '#3730a3', tat_hours: 24, status_options: ['Shortlisted', 'Dropped', 'No Response', 'ReSchedule'] },
      { id: 'S08', label: 'S08: LOI Released', color: '#e0f2fe', textColor: '#0369a1', tat_hours: 24, status_options: ['LOI Released', 'LOI Accepted', 'LOI Declined', 'No Response', 'ReSchedule'] },
      { id: 'S09', label: 'S09: Joined', color: '#dcfce7', textColor: '#166534', tat_hours: 48, status_options: ['Joining Pending', 'Joined', 'No Show', 'No Response', 'ReSchedule'] },
      { id: 'S10', label: 'S10: Document Collection', color: '#fed7aa', textColor: '#9a3412', tat_hours: 48, status_options: ['Pending Documents', 'Documents Submitted', 'KYC & Verification Completed', 'Discrepancy Found', 'Hold', 'ReSchedule'] },
      { id: 'S11', label: 'S11: Employee ID & Final Mapping', color: '#c7d2fe', textColor: '#312e81', tat_hours: 24, status_options: ['Mapping Pending', 'Employee ID Generated', 'Biometric Enrolled', 'System & Email Created', 'Handover Completed', 'Hold'] },
      { id: 'S12', label: 'S12: Employee Working Rating', color: '#fef08a', textColor: '#713f12', tat_hours: 720, status_options: ['Under Probation', '30-Day Review Completed', '60-Day Review Completed', 'Confirmed (Good)', 'Average (Needs Monitoring)', 'Probation Extended', 'Early Left / Resigned'] }
    ];
  }, [pipelineConfig]);

  // Candidate stages strictly exclude S00 and S01 (which belong only to Job Positions)
  const CANDIDATE_STAGES = useMemo(() => {
    return STAGES.filter(s => s.id !== 'S00' && s.id !== 'S01');
  }, [STAGES]);

  const getStatusOptions = useCallback((stageId) => {
    const found = STAGES.find(s => s.id === stageId);
    if (found?.status_options && Array.isArray(found.status_options) && found.status_options.length > 0) {
      return found.status_options;
    }
    switch (stageId) {
      case 'S00': return ['Pending Review', 'Requirement Verified', 'Hold', 'Cancelled'];
      case 'S01': return ['Drafting JD', 'JD Approved', 'Posted on Job Boards', 'Application Window Open'];
      case 'S02': return ['Awaiting Screening', 'Resume Selected', 'Resume Rejected', 'No Response', 'ReSchedule'];
      case 'S03': return ['Interview Scheduled', 'Interview Cleared', 'Interview Rejected', 'No Response', 'ReSchedule'];
      case 'S04': return ['Test Pending', 'Test Passed', 'Test Failed', 'No Response', 'ReSchedule'];
      case 'S05': return ['No Response', 'ReSchedule', 'Final Pending', 'Final Rejected', 'Final Confirmed'];
      case 'S06': return ['Negotiation Pending', 'Salary Agreed', 'Salary Rejected', 'No Response', 'ReSchedule'];
      case 'S07': return ['Shortlisted', 'Dropped', 'No Response', 'ReSchedule'];
      case 'S08': return ['LOI Released', 'LOI Accepted', 'LOI Declined', 'No Response', 'ReSchedule'];
      case 'S09': return ['Joining Pending', 'Joined', 'No Show', 'No Response', 'ReSchedule'];
      case 'S10': return ['Pending Documents', 'Documents Submitted', 'KYC & Verification Completed', 'Discrepancy Found', 'Hold', 'ReSchedule'];
      case 'S11': return ['Mapping Pending', 'Employee ID Generated', 'Biometric Enrolled', 'System & Email Created', 'Handover Completed', 'Hold'];
      case 'S12': return ['Under Probation', '30-Day Review Completed', '60-Day Review Completed', 'Confirmed (Good)', 'Average (Needs Monitoring)', 'Probation Extended', 'Early Left / Resigned'];
      default: return ['Pending', 'No Response', 'ReSchedule'];
    }
  }, [STAGES]);

  // Load recruiters list using server action (bypasses RLS) with SWR cache
  const loadRecruiters = useCallback(async () => {
    try {
      const data = await getRecruitersList(userCompany);
      if (Array.isArray(data) && data.length > 0) {
        setRecruitersList(data);
        writeLocalCache(RECRUITER_CACHE_KEYS.recruiters(userCompany), data);
      }
    } catch (e) {
      console.error('Failed to load recruiters list:', e);
    }
  }, [userCompany]);

  const fetchDepartments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('name')
        .order('name', { ascending: true });
      if (!error && data && data.length > 0) {
        const names = data.map(d => d.name);
        setDepartments(names);
        writeLocalCache(RECRUITER_CACHE_KEYS.departments, names);
      } else {
        setDepartments(DEFAULT_DEPARTMENTS);
      }
    } catch (e) {
      console.error('Error fetching departments:', e);
      setDepartments(DEFAULT_DEPARTMENTS);
    }
  }, [supabase]);

  useEffect(() => {
    if (!viewerId || navigator.onLine === false) return;
    Promise.resolve().then(() => {
      loadRecruiters();
      fetchDepartments();
    });
    const channel = supabase.channel('recruiter_departments_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, fetchDepartments)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [viewerId, supabase, loadRecruiters, fetchDepartments]);

  // Handle Position Creation
  const handleCreatePosition = async (e) => {
    e.preventDefault();
    if (!newPosition.title || !newPosition.department) return;

    try {

      const selectedBranchCode = newPosition.branch_code || (adminCompanyFilter !== 'All' ? adminCompanyFilter : (availableBranches[0]?.code || 'TNT00002-B0002'));

      const res = await savePosition({
        ...newPosition,
        branch_code: selectedBranchCode,
        deadline_date: newPosition.deadline_date || null,
        salary_min: newPosition.salary_min ? parseInt(newPosition.salary_min) : null,
        salary_max: newPosition.salary_max ? parseInt(newPosition.salary_max) : null,
        status: selectedStage === 'S01' ? 'S01' : 'S00'
      });

      if (!res.success) throw new Error(res.error);
      setNewPosition({ 
        title: '', 
        department: '', 
        branch_code: selectedBranchCode, 
        openings: 1, 
        jd_text: '', 
        deadline_date: '', 
        interviewer_name: '', 
        recruiter_assigned: 'All', 
        salary_min: '', 
        salary_max: '',
        job_type: 'Full Time (Permanent)',
        vacancy_reason: 'New Position',
        experience_required: 'Any Experience',
        min_qualification: 'Any Qualification (No Minimum Bar)',
        urgency: '🟡 Medium Priority',
        work_mode: 'On-Site (Plant / Office)',
        shift_type: 'General Shift (Day)',
        gender_preference: 'No Preference (Any)',
        key_skills: ''
      });
      setIsPositionModalOpen(false);
      loadData();
    } catch (err) {
      alert("Error creating position: " + err.message);
    }
  };

  // Handle Claim Position (S00 'All' positions can be claimed by any recruiter)
  const handleClaimPosition = async (positionId) => {
    try {
      const claimant = userName || 'Recruiter';
      const res = await savePosition({
        id: positionId,
        recruiter_assigned: claimant
      });

      if (!res.success) throw new Error(res.error);
      loadData();
    } catch (err) {
      alert('Error claiming position: ' + err.message);
    }
  };

  // Handle Release Position back to Open Pool with mandatory reason
  const handleReleasePosition = async (positionId, reason) => {
    try {
      const res = await submitChange('position:release', { id: positionId, reason });
      if (!res.success) throw new Error(res.error);
      await loadData();
    } catch (err) {
      alert('Error releasing position: ' + err.message);
    }
  };

  // Open Candidate Modal with Pre-Selected Position
  const handleOpenAddCandidateForPosition = (pos) => {
    setNewCandidate(prev => ({
      ...prev,
      position_id: pos.id
    }));
    setIsCandidateModalOpen(true);
  };

  // Handle Admin Stage Override
  const handleConfirmAdminStageOverride = async () => {
    if (!stageChangeCandidate || !targetStageOverride) return;
    if (!stageOverrideReason.trim()) {
      alert('Mandatory Reason Required: Please enter the reason for overriding candidate stage.');
      return;
    }
    setIsOverridingStage(true);
    try {
      const defaultStatus = getStatusOptions(targetStageOverride)[0];
      const res = await submitChange('candidate:override', {
        id: stageChangeCandidate.id,
        current_stage: targetStageOverride,
        candidate_status: defaultStatus,
        reason: stageOverrideReason.trim()
      });
      if (!res.success) throw new Error(res.error);
      setIsStageChangeModalOpen(false);
      setStageChangeCandidate(null);
      setStageOverrideReason('');
      await loadData();
    } catch (err) {
      alert('Error changing candidate stage: ' + err.message);
    } finally {
      setIsOverridingStage(false);
    }
  };

  // Open Edit Position Modal
  const handleOpenEditPosition = (pos) => {
    setEditingPosition(pos);
    setEditPositionForm({
      title: pos.title || '',
      department: pos.department || '',
      branch_code: pos.branch_code || pos.workspace_branch_code || '',
      openings: pos.openings || 1,
      jd_text: pos.jd_text || '',
      deadline_date: pos.deadline_date ? String(pos.deadline_date).split('T')[0] : '',
      interviewer_name: pos.interviewer_name || '',
      recruiter_assigned: pos.recruiter_assigned || 'All',
      salary_min: pos.salary_min !== null && pos.salary_min !== undefined ? pos.salary_min.toString() : '',
      salary_max: pos.salary_max !== null && pos.salary_max !== undefined ? pos.salary_max.toString() : '',
      job_type: pos.job_type || 'Full Time (Permanent)',
      vacancy_reason: pos.vacancy_reason || 'New Position',
      experience_required: pos.experience_required || 'Any Experience',
      min_qualification: pos.min_qualification || 'Any Qualification (No Minimum Bar)',
      urgency: pos.urgency || '🟡 Medium Priority',
      work_mode: pos.work_mode || 'On-Site (Plant / Office)',
      shift_type: pos.shift_type || 'General Shift (Day)',
      gender_preference: pos.gender_preference || 'No Preference (Any)',
      key_skills: pos.key_skills || '',
      posting_status: pos.posting_status || 'Draft',
      posting_sources: Array.isArray(pos.posting_sources) ? [...pos.posting_sources] : []
    });
  };

  // Save Edited Position
  const handleSaveEditPosition = async (e) => {
    e.preventDefault();
    if (!editPositionForm.title || !editPositionForm.department) return;
    setSavingEditPos(true);
    try {
      const res = await savePosition({
        id: editingPosition.id,
        ...editPositionForm,
        deadline_date: editPositionForm.deadline_date || null,
        salary_min: editPositionForm.salary_min ? parseInt(editPositionForm.salary_min, 10) : null,
        salary_max: editPositionForm.salary_max ? parseInt(editPositionForm.salary_max, 10) : null
      });

      if (!res.success) throw new Error(res.error);
      setEditingPosition(null);
      loadData();
    } catch (err) {
      alert('Error saving position: ' + err.message);
    } finally {
      setSavingEditPos(false);
    }
  };

  // Handle Candidate Registration
  const handleCreateCandidate = async (e) => {
    e.preventDefault();
    if (!newCandidate.name || !newCandidate.position_id) {
      alert('Please enter candidate name and select target job position.');
      return;
    }

    setIsRegisteringCandidate(true);
    try {

      const res = await saveCandidate({
        ...newCandidate,
        current_salary: newCandidate.current_salary ? parseInt(newCandidate.current_salary, 10) : null,
        expected_salary_min: newCandidate.expected_salary_min ? parseInt(newCandidate.expected_salary_min, 10) : null,
        expected_salary_max: newCandidate.expected_salary_max ? parseInt(newCandidate.expected_salary_max, 10) : null
      });

      if (!res.success) throw new Error(res.error);

      

      setNewCandidate({ 
        name: '', 
        email: '', 
        phone: '', 
        alternate_phone: '',
        position_id: '', 
        current_city: '',
        total_experience: '',
        highest_qualification: '',
        current_salary: '',
        expected_salary_min: '', 
        expected_salary_max: '',
        notice_period: '',
        cover_note: '',
        resume_url: '' 
      });
      setIsCandidateModalOpen(false);
      loadData();
    } catch (err) {
      alert("Error creating candidate: " + err.message);
    } finally {
      setIsRegisteringCandidate(false);
    }
  };

  // Update Candidate Stage from table dropdown
  const handleUpdateCandidateStage = async (candidateId, newStage) => {
    try {
      const cand = candidates.find(c => c.id === candidateId);
      const currentStage = cand?.current_stage || 'S02';
      const isDemotion = getStageNumber(newStage) < getStageNumber(currentStage);

      if (isDemotion && !canDecreaseStage) {
        alert(`Stage Demotion Restricted: Only Manager, Admin, or users with 'Demote / Decrease Recruiter Stage Power' can revert a candidate from ${currentStage} back to ${newStage}.`);
        return;
      }

      if (newStage === 'S00' || newStage === 'S01') {
        alert("Invalid Stage: Candidates cannot be placed in S00 or S01 (Job Positions only). Candidate pipeline starts at S02.");
        return;
      }

      const defaultStatus = getStatusOptions(newStage)[0];

      const res = await saveCandidate({
        id: candidateId,
        current_stage: newStage,
        candidate_status: defaultStatus
      }, { candidateId, note: `Stage changed to ${newStage} (Status reset to ${defaultStatus})` });

      if (!res.success) throw new Error(res.error);

      loadData();
    } catch (e) {
      alert("Error updating stage: " + e.message);
    }
  };

  // Update Candidate Status (with audit logging)
  const handleUpdateCandidateStatus = async (candidateId, newStatus) => {
    try {
      const targetCand = candidates.find(c => c.id === candidateId);
      const res = await saveCandidate({
        id: candidateId,
        candidate_status: newStatus
      }, { candidateId, note: `Status set to ${newStatus} in stage ${targetCand?.current_stage || 'S02'}` });

      if (!res.success) throw new Error(res.error);

      loadData();
    } catch (e) {
      alert("Error updating status: " + e.message);
    }
  };


  // Toggle Position Status
  const handleTogglePositionStatus = async (positionId, currentStatus) => {
    const nextStatus = currentStatus === 'S00' ? 'S01' : 'S00';
    try {
      const res = await savePosition({
        id: positionId,
        status: nextStatus
      });

      if (!res.success) throw new Error(res.error);
      loadData();
    } catch (e) {
      alert("Error updating position status: " + e.message);
    }
  };

  // Dashboard Overview Stats & Openings
  const s00Positions = useMemo(() => positions.filter(p => p.status === 'S00'), [positions]);
  const s01Positions = useMemo(() => positions.filter(p => p.status === 'S01'), [positions]);
  const s00Openings = useMemo(() => s00Positions.reduce((sum, p) => sum + (parseInt(p.openings, 10) || 1), 0), [s00Positions]);
  const s01Openings = useMemo(() => s01Positions.reduce((sum, p) => sum + (parseInt(p.openings, 10) || 1), 0), [s01Positions]);
  const s09Candidates = useMemo(() => candidates.filter(c => c.current_stage === 'S09'), [candidates]);

  // Pool of candidates in the active stage for baseline count
  const stageCandidatesPool = useMemo(() => {
    return candidates.filter(c => {
      if (!canAccessStage(c.current_stage)) return false;
      if (selectedStage === 'all_stages') return true;
      return c.current_stage === selectedStage;
    });
  }, [candidates, selectedStage, recruiterAccess, isAdmin]);

  // Pool of positions in the active stage for baseline count
  const stagePositionsPool = useMemo(() => {
    if (!canAccessStage(selectedStage)) return [];
    return positions.filter(pos => !pos.restricted_position && pos.status === selectedStage);
  }, [positions, selectedStage, recruiterAccess, isAdmin]);

  // Filtered Candidates — respects stage-wise access, search, position, status, recruiter, all-stages pill
  const filteredCandidates = useMemo(() => {
    return candidates.filter(c => {
      // Stage access gate: user must have access to this candidate's stage
      if (!canAccessStage(c.current_stage)) return false;

      let matchesStage = false;
      if (selectedStage === 'all_stages') {
        matchesStage = selectedAllStagesPillFilter === 'All' || c.current_stage === selectedAllStagesPillFilter;
      } else {
        matchesStage = c.current_stage === selectedStage;
      }
      if (!matchesStage) return false;
      
      const cleanSearch = searchTerm.toLowerCase().trim();
      const posCode = c.position_id ? `POS-${c.position_id.substring(0, 8).toUpperCase()}` : '';
      const posTitle = c.recruitment_positions?.title || '';

      const matchesSearch = !cleanSearch ||
        c.name.toLowerCase().includes(cleanSearch) ||
        (c.email || '').toLowerCase().includes(cleanSearch) ||
        (c.phone || '').includes(cleanSearch) ||
        posTitle.toLowerCase().includes(cleanSearch) ||
        posCode.toLowerCase().includes(cleanSearch) ||
        (c.candidate_code || '').toLowerCase().includes(cleanSearch);
      if (!matchesSearch) return false;
      
      const matchesPosition = 
        selectedPositionFilter === 'All' || c.position_id === selectedPositionFilter;
      if (!matchesPosition) return false;

      const matchesStatus = 
        selectedStatusFilter === 'All' || c.candidate_status === selectedStatusFilter;
      if (!matchesStatus) return false;

      if (selectedRecruiterFilter && selectedRecruiterFilter !== 'All') {
        const filterLower = selectedRecruiterFilter.toLowerCase();
        const parentPos = positions.find(p => p.id === c.position_id) || c.recruitment_positions;
        const recTarget = (parentPos?.recruiter_assigned || c.recruiter_assigned || c.created_by || '').toLowerCase();
        if (!recTarget.includes(filterLower)) return false;
      }

      return true;
    });
  }, [candidates, selectedStage, searchTerm, selectedPositionFilter, selectedStatusFilter, selectedRecruiterFilter, selectedAllStagesPillFilter, positions, recruiterAccess, isAdmin]);

  // Filtered Positions — respects stage-wise access, search, position, recruiter, urgency/status
  const filteredPositions = useMemo(() => {
    if (!canAccessStage(selectedStage)) return [];
    let list = positions.filter(pos => pos.status === selectedStage);

    const cleanSearch = searchTerm.toLowerCase().trim();
    if (cleanSearch) {
      list = list.filter(pos => {
        const posCode = pos.id ? `POS-${pos.id.substring(0, 8).toUpperCase()}` : '';
        return (
          (pos.title || '').toLowerCase().includes(cleanSearch) ||
          (pos.department || '').toLowerCase().includes(cleanSearch) ||
          posCode.toLowerCase().includes(cleanSearch) ||
          (pos.recruiter_assigned || '').toLowerCase().includes(cleanSearch) ||
          (pos.branch_code || '').toLowerCase().includes(cleanSearch)
        );
      });
    }

    if (selectedPositionFilter && selectedPositionFilter !== 'All') {
      list = list.filter(pos => pos.id === selectedPositionFilter);
    }

    if (selectedRecruiterFilter && selectedRecruiterFilter !== 'All') {
      const filterLower = selectedRecruiterFilter.toLowerCase();
      list = list.filter(pos => (pos.recruiter_assigned || '').toLowerCase().includes(filterLower));
    }

    if (selectedStatusFilter && selectedStatusFilter !== 'All') {
      list = list.filter(pos => {
        if (selectedStatusFilter === 'Assigned') return Boolean(pos.recruiter_assigned && pos.recruiter_assigned !== 'All');
        if (selectedStatusFilter === 'Unassigned') return !pos.recruiter_assigned || pos.recruiter_assigned === 'All';

        if (selectedStage === 'S01') {
          const posJoinedCount = candidates.filter(c => c.position_id === pos.id && (c.current_stage === 'S09' || c.current_stage >= 'S09')).length;
          const posOpenings = parseInt(pos.openings, 10) || 1;
          const isAutoClosed = posJoinedCount >= posOpenings;
          const effectiveStatus = isAutoClosed ? 'Closed' : (pos.posting_status || 'Draft');

          if (['Draft', 'Posted', 'Paused', 'Closed'].includes(selectedStatusFilter)) {
            return effectiveStatus === selectedStatusFilter;
          }
        }

        return (pos.urgency || '') === selectedStatusFilter;
      });
    }

    return list;
  }, [positions, candidates, selectedStage, searchTerm, selectedPositionFilter, selectedRecruiterFilter, selectedStatusFilter, recruiterAccess, isAdmin]);

  const isAnyCandidateFilterActive = Boolean(
    searchTerm || 
    selectedPositionFilter !== 'All' || 
    selectedStatusFilter !== 'All' || 
    selectedRecruiterFilter !== 'All' || 
    selectedAllStagesPillFilter !== 'All'
  );

  const handleClearCandidateFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedPositionFilter('All');
    setSelectedStatusFilter('All');
    setSelectedRecruiterFilter('All');
    setSelectedAllStagesPillFilter('All');
  }, []);

  // S00 & S01 Paginated Positions (Page Navigation Rules)
  const validPositionPage = useMemo(() => {
    const size = (pageSize === 100000 || pageSize === 'All') ? (filteredPositions.length || 1) : (Number(pageSize) || 15);
    const maxPage = Math.max(1, Math.ceil(filteredPositions.length / size));
    return Math.min(Math.max(1, currentPage), maxPage);
  }, [filteredPositions.length, currentPage, pageSize]);

  const paginatedPositions = useMemo(() => {
    if (pageSize === 100000 || pageSize === 'All') return filteredPositions;
    const size = Number(pageSize) || 15;
    const startIndex = (validPositionPage - 1) * size;
    return filteredPositions.slice(startIndex, startIndex + size);
  }, [filteredPositions, validPositionPage, pageSize]);

  // all_stages & S02-S12 Paginated Candidates (Page Navigation Rules)
  const validCandidatePage = useMemo(() => {
    const size = (pageSize === 100000 || pageSize === 'All') ? (filteredCandidates.length || 1) : (Number(pageSize) || 15);
    const maxPage = Math.max(1, Math.ceil(filteredCandidates.length / size));
    return Math.min(Math.max(1, currentPage), maxPage);
  }, [filteredCandidates.length, currentPage, pageSize]);

  const paginatedCandidates = useMemo(() => {
    if (pageSize === 100000 || pageSize === 'All') return filteredCandidates;
    const size = Number(pageSize) || 15;
    const startIndex = (validCandidatePage - 1) * size;
    return filteredCandidates.slice(startIndex, startIndex + size);
  }, [filteredCandidates, validCandidatePage, pageSize]);

  // Dashboard Specific Filtered Positions (Strict IST)
  const dashFilteredPositions = useMemo(() => {
    let list = positions;
    if (dashBranchFilter && dashBranchFilter !== 'All') {
      list = list.filter(p => (p.branch_code || p.workspace_branch_code) === dashBranchFilter || (p.company && p.company === dashBranchFilter));
    }
    if (dashDeptFilter && dashDeptFilter !== 'All') {
      list = list.filter(p => (p.department || '') === dashDeptFilter);
    }
    if (dashRecruiterFilter && dashRecruiterFilter !== 'All') {
      const filterLower = dashRecruiterFilter.toLowerCase();
      const matchedRec = recruitersList.find(r => 
        (r.emp_name && r.emp_name.toLowerCase() === filterLower) ||
        (r.email && r.email.toLowerCase() === filterLower) ||
        (r.name && r.name.toLowerCase() === filterLower)
      );
      const emailLower = matchedRec?.email?.toLowerCase();
      const nameLower = (matchedRec?.emp_name || matchedRec?.name || '').toLowerCase();

      list = list.filter(p => {
        const target = (p.recruiter_assigned || p.created_by || '').toLowerCase();
        return target.includes(filterLower) || 
               (nameLower && target.includes(nameLower)) || 
               (emailLower && target.includes(emailLower));
      });
    }
    if (dashDatePreset !== 'all' && (dashStartDate || dashEndDate)) {
      const start = dashStartDate ? new Date(`${dashStartDate}T00:00:00+05:30`).getTime() : 0;
      const end = dashEndDate ? new Date(`${dashEndDate}T23:59:59+05:30`).getTime() : Infinity;
      list = list.filter(p => {
        const t = p.created_at ? new Date(p.created_at).getTime() : 0;
        return t >= start && t <= end;
      });
    }
    return list;
  }, [positions, dashBranchFilter, dashDeptFilter, dashRecruiterFilter, dashDatePreset, dashStartDate, dashEndDate, recruitersList]);

  // Dashboard Specific Filtered Candidates (Strict IST)
  const dashFilteredCandidates = useMemo(() => {
    let list = candidates;
    if (dashBranchFilter && dashBranchFilter !== 'All') {
      list = list.filter(c => (c.branch_code || c.workspace_branch_code) === dashBranchFilter || (c.company && c.company === dashBranchFilter));
    }
    if (dashDeptFilter && dashDeptFilter !== 'All') {
      list = list.filter(c => (c.recruitment_positions?.department || '') === dashDeptFilter);
    }
    if (dashPosFilter && dashPosFilter !== 'All') {
      list = list.filter(c => c.position_id === dashPosFilter);
    }
    if (dashRecruiterFilter && dashRecruiterFilter !== 'All') {
      const filterLower = dashRecruiterFilter.toLowerCase();
      const matchedRec = recruitersList.find(r => 
        (r.emp_name && r.emp_name.toLowerCase() === filterLower) ||
        (r.email && r.email.toLowerCase() === filterLower) ||
        (r.name && r.name.toLowerCase() === filterLower)
      );
      const emailLower = matchedRec?.email?.toLowerCase();
      const nameLower = (matchedRec?.emp_name || matchedRec?.name || '').toLowerCase();

      list = list.filter(c => {
        const p = positions.find(pos => pos.id === c.position_id);
        const target = (p?.recruiter_assigned || c.created_by || '').toLowerCase();
        return target.includes(filterLower) || 
               (nameLower && target.includes(nameLower)) || 
               (emailLower && target.includes(emailLower));
      });
    }
    if (dashDatePreset !== 'all' && (dashStartDate || dashEndDate)) {
      const start = dashStartDate ? new Date(`${dashStartDate}T00:00:00+05:30`).getTime() : 0;
      const end = dashEndDate ? new Date(`${dashEndDate}T23:59:59+05:30`).getTime() : Infinity;
      list = list.filter(c => {
        const t = c.created_at ? new Date(c.created_at).getTime() : 0;
        return t >= start && t <= end;
      });
    }
    if (dashStatusFilter && dashStatusFilter !== 'All') {
      if (dashStatusFilter === 'active_pipeline') {
        list = list.filter(c => c.current_stage >= 'S02' && c.current_stage <= 'S08');
      } else if (dashStatusFilter === 'delayed') {
        list = list.filter(c => {
          const cCreated = c.created_at ? new Date(c.created_at) : null;
          const sObj = STAGES.find(s => s.id === (c.current_stage || 'S02'));
          const tat = sObj?.tat_hours || 24;
          const planned = cCreated ? new Date(cCreated.getTime() + tat * 3600000) : null;
          const info = getSlaDelayInfo(planned, c.current_stage === 'S09' ? new Date(c.updated_at || c.created_at) : null);
          return info.isDelayed;
        });
      } else if (dashStatusFilter === 'rejected') {
        list = list.filter(c => {
          const s = (c.candidate_status || '').toLowerCase();
          return s.includes('reject') || s.includes('fail') || s.includes('drop') || s.includes('decline');
        });
      } else {
        list = list.filter(c => c.current_stage === dashStatusFilter);
      }
    }
    return list;
  }, [candidates, dashBranchFilter, dashDeptFilter, dashPosFilter, dashRecruiterFilter, dashDatePreset, dashStartDate, dashEndDate, dashStatusFilter, positions, STAGES, recruitersList]);

  // Dynamic S05 Stage Label
  const s05Stage = useMemo(() => STAGES.find(s => s.id === 'S05'), [STAGES]);
  const s05Name = s05Stage?.label || 'S05 — Final Confirmation';

  // Has Active Dash Filters
  const hasActiveDashFilters = useMemo(() => {
    return dashDatePreset !== 'all' ||
      dashBranchFilter !== 'All' ||
      dashDeptFilter !== 'All' ||
      dashPosFilter !== 'All' ||
      dashRecruiterFilter !== 'All' ||
      dashStatusFilter !== 'All';
  }, [dashDatePreset, dashBranchFilter, dashDeptFilter, dashPosFilter, dashRecruiterFilter, dashStatusFilter]);

  // Dashboard Metrics & Scoring Computations
  const dashStats = useMemo(() => {
    const s00Pos = dashFilteredPositions.filter(p => p.status === 'S00');
    const s01Pos = dashFilteredPositions.filter(p => p.status === 'S01');
    const s00Openings = s00Pos.reduce((acc, p) => acc + (p.openings || 1), 0);
    const s01Openings = s01Pos.reduce((acc, p) => acc + (p.openings || 1), 0);
    const activePipeline = dashFilteredCandidates.filter(c => c.current_stage >= 'S02' && c.current_stage <= 'S08');
    const joined = dashFilteredCandidates.filter(c => c.current_stage === 'S09');
    const totalApplicants = dashFilteredCandidates.length;

    const joinRatio = totalApplicants > 0 ? Math.round((joined.length / totalApplicants) * 100) : 0;

    // Interview Scoring Calculation
    const ratedCandidates = dashFilteredCandidates.filter(c => {
      const r = c.interview_rating || c.evaluation?.interview_rating;
      return r !== null && r !== undefined && r !== '' && !isNaN(parseFloat(r));
    });
    const avgInterviewRating = ratedCandidates.length > 0
      ? (ratedCandidates.reduce((acc, c) => acc + parseFloat(c.interview_rating || c.evaluation?.interview_rating), 0) / ratedCandidates.length).toFixed(1)
      : null;

    // Test Scoring Calculation
    const s04Plus = dashFilteredCandidates.filter(c => c.current_stage >= 'S04');
    const testPassedCount = s04Plus.filter(c => {
      const st = (c.candidate_status || '').toLowerCase();
      const tr = (c.test_results || c.technical_score || '').toLowerCase();
      return st.includes('pass') || st.includes('clear') || c.current_stage > 'S04' || tr.includes('pass') || (parseInt(tr) >= 50);
    }).length;
    const testPassRate = s04Plus.length > 0 ? Math.round((testPassedCount / s04Plus.length) * 100) : null;

    // SLA & TAT Health
    const slaInfoList = dashFilteredCandidates.map(c => {
      const cCreated = c.created_at ? new Date(c.created_at) : null;
      const sObj = STAGES.find(s => s.id === (c.current_stage || 'S02'));
      const tat = sObj?.tat_hours || 24;
      const planned = cCreated ? new Date(cCreated.getTime() + tat * 3600000) : null;
      return getSlaDelayInfo(planned, c.current_stage === 'S09' ? new Date(c.updated_at || c.created_at) : null);
    });
    const delayedCount = slaInfoList.filter(s => s.isDelayed).length;
    const onTrackCount = totalApplicants - delayedCount;
    const onTrackPct = totalApplicants > 0 ? Math.round((onTrackCount / totalApplicants) * 100) : 100;

    // Stage-wise Clearance Rates
    const s02Count = dashFilteredCandidates.filter(c => c.current_stage >= 'S02').length;
    const s03Count = dashFilteredCandidates.filter(c => c.current_stage >= 'S03').length;
    const s04Count = s04Plus.length;
    const s05Count = dashFilteredCandidates.filter(c => c.current_stage >= 'S05').length;
    const s06Count = dashFilteredCandidates.filter(c => c.current_stage >= 'S06').length;
    const s08Count = dashFilteredCandidates.filter(c => c.current_stage >= 'S08').length;

    const interviewClearRate = s03Count > 0 ? Math.round((dashFilteredCandidates.filter(c => c.current_stage >= 'S04' || (c.candidate_status || '').toLowerCase().includes('clear')).length / s03Count) * 100) : 0;
    const finalConfirmationRate = s05Count > 0 ? Math.round((dashFilteredCandidates.filter(c => c.current_stage >= 'S06' || c.ed_approval_status === 'Approved').length / s05Count) * 100) : 0;
    const loiAcceptRate = s08Count > 0 ? Math.round((joined.length / s08Count) * 100) : 0;

    // Top Evaluated Candidates
    const topCandidates = [...dashFilteredCandidates].sort((a, b) => {
      const scoreA = parseFloat(a.interview_rating || a.evaluation?.interview_rating || 0);
      const scoreB = parseFloat(b.interview_rating || b.evaluation?.interview_rating || 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    }).slice(0, 5);

    // Department Breakdown
    const deptMap = {};
    positions.forEach(p => {
      const d = p.department || 'General';
      if (!deptMap[d]) deptMap[d] = { openings: 0, candidates: 0, joined: 0 };
      deptMap[d].openings += (p.openings || 1);
    });
    candidates.forEach(c => {
      const d = c.recruitment_positions?.department || 'General';
      if (!deptMap[d]) deptMap[d] = { openings: 0, candidates: 0, joined: 0 };
      deptMap[d].candidates += 1;
      if (c.current_stage === 'S09') deptMap[d].joined += 1;
    });

    return {
      s00Pos, s01Pos, s00Openings, s01Openings,
      activePipeline, joined, totalApplicants, joinRatio,
      avgInterviewRating, testPassRate,
      delayedCount, onTrackCount, onTrackPct,
      interviewClearRate, finalConfirmationRate, loiAcceptRate,
      topCandidates, deptMap
    };
  }, [dashFilteredPositions, dashFilteredCandidates, positions, candidates, STAGES]);

  // Recruiter Performance & Workload Metrics (Direct Cards & Evaluation)
  const recruiterMetrics = useMemo(() => {
    const recMap = new Map();

    // 1. Seed with registered recruiters from recruitersList
    (recruitersList || []).forEach(r => {
      const key = (r.emp_name || r.name || r.email || '').trim().toLowerCase();
      if (!key) return;
      recMap.set(key, {
        key,
        name: r.emp_name || r.name || r.email || 'Recruiter',
        email: r.email || '',
        emp_id: r.emp_id || '',
        branch_code: r.branch_code || r.work_location_name || '',
        positionsCount: 0,
        openingsCount: 0,
        candidatesCount: 0,
        pipelineCount: 0,
        joinedCount: 0,
        delayedCount: 0,
        ratings: [],
        testPassedCount: 0,
        testTotalCount: 0,
        recommendedCount: 0,
        todayActionCount: 0
      });
    });

    // 2. Discover any additional assigned recruiters from positions
    positions.forEach(p => {
      const assigned = (p.recruiter_assigned || '').trim();
      if (assigned && assigned.toLowerCase() !== 'all' && assigned.toLowerCase() !== 'unassigned') {
        const key = assigned.toLowerCase();
        if (!recMap.has(key)) {
          recMap.set(key, {
            key,
            name: assigned,
            email: '',
            emp_id: '',
            branch_code: p.branch_code || '',
            positionsCount: 0,
            openingsCount: 0,
            candidatesCount: 0,
            pipelineCount: 0,
            joinedCount: 0,
            delayedCount: 0,
            ratings: [],
            testPassedCount: 0,
            testTotalCount: 0,
            recommendedCount: 0,
            todayActionCount: 0
          });
        }
      }
    });

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    // 3. Aggregate Positions per recruiter
    positions.forEach(p => {
      const assigned = (p.recruiter_assigned || '').trim().toLowerCase();
      if (!assigned || assigned === 'all' || assigned === 'unassigned') return;
      for (const [k, rec] of recMap.entries()) {
        if (k === assigned || rec.name.toLowerCase() === assigned || (rec.email && rec.email.toLowerCase() === assigned)) {
          rec.positionsCount += 1;
          rec.openingsCount += (parseInt(p.openings, 10) || 1);
        }
      }
    });

    // 4. Aggregate Candidates per recruiter
    candidates.forEach(c => {
      const pos = positions.find(p => p.id === c.position_id);
      const assigned = (pos?.recruiter_assigned || c.created_by || '').trim().toLowerCase();
      let matchedRec = null;

      for (const [k, rec] of recMap.entries()) {
        if (assigned && (k === assigned || rec.name.toLowerCase() === assigned || (rec.email && rec.email.toLowerCase() === assigned))) {
          matchedRec = rec;
          break;
        }
      }

      if (matchedRec) {
        matchedRec.candidatesCount += 1;
        if (c.current_stage >= 'S02' && c.current_stage <= 'S08') {
          matchedRec.pipelineCount += 1;
        }
        if (c.current_stage === 'S09') {
          matchedRec.joinedCount += 1;
        }

        // SLA
        const cCreated = c.created_at ? new Date(c.created_at) : null;
        const sObj = STAGES.find(s => s.id === (c.current_stage || 'S02'));
        const tat = sObj?.tat_hours || 24;
        const planned = cCreated ? new Date(cCreated.getTime() + tat * 3600000) : null;
        const sla = getSlaDelayInfo(planned, c.current_stage === 'S09' ? new Date(c.updated_at || c.created_at) : null);
        if (sla.isDelayed) matchedRec.delayedCount += 1;

        // Rating
        const r = c.interview_rating || c.evaluation?.interview_rating;
        if (r !== null && r !== undefined && r !== '' && !isNaN(parseFloat(r))) {
          matchedRec.ratings.push(parseFloat(r));
        }

        // Test
        if (c.current_stage >= 'S04') {
          matchedRec.testTotalCount += 1;
          const st = (c.candidate_status || '').toLowerCase();
          const tr = (c.test_results || c.technical_score || '').toLowerCase();
          if (st.includes('pass') || st.includes('clear') || c.current_stage > 'S04' || tr.includes('pass') || (parseInt(tr, 10) >= 50)) {
            matchedRec.testPassedCount += 1;
          }
        }

        // Recommendation
        const recTag = (c.evaluation_recommendation || c.evaluation?.recommendation || '').toLowerCase();
        if (recTag.includes('hire') || recTag.includes('strong')) {
          matchedRec.recommendedCount += 1;
        }

        // Today's action in IST
        const cUpdated = c.updated_at ? new Date(c.updated_at) : (c.created_at ? new Date(c.created_at) : null);
        if (cUpdated) {
          const cDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(cUpdated);
          if (cDateStr === todayStr) {
            matchedRec.todayActionCount += 1;
          }
        }
      }
    });

    return Array.from(recMap.values()).map(r => {
      const avgRating = r.ratings.length > 0
        ? (r.ratings.reduce((a, b) => a + b, 0) / r.ratings.length).toFixed(1)
        : null;
      const testPassRate = r.testTotalCount > 0
        ? Math.round((r.testPassedCount / r.testTotalCount) * 100)
        : null;
      const joinRate = r.candidatesCount > 0
        ? Math.round((r.joinedCount / r.candidatesCount) * 100)
        : 0;
      const onTrackPct = r.candidatesCount > 0
        ? Math.round(((r.candidatesCount - r.delayedCount) / r.candidatesCount) * 100)
        : 100;

      let workloadLevel = 'Normal';
      let workloadColor = '#10b981';
      let workloadBg = '#dcfce7';
      if (r.pipelineCount > 8 || r.openingsCount > 10) {
        workloadLevel = 'High Workload';
        workloadColor = '#b45309';
        workloadBg = '#fef3c7';
      }
      if (r.pipelineCount > 15 || r.openingsCount > 20) {
        workloadLevel = 'Overloaded';
        workloadColor = '#991b1b';
        workloadBg = '#fee2e2';
      }

      let badge = 'Active Recruiter';
      if (avgRating && parseFloat(avgRating) >= 4.0 && joinRate >= 30) badge = '🏆 Top Performer';
      else if (onTrackPct >= 90 && r.candidatesCount > 3) badge = '⚡ High Velocity';
      else if (avgRating && parseFloat(avgRating) >= 3.5) badge = '🎯 High Quality';

      return {
        ...r,
        avgRating,
        testPassRate,
        joinRate,
        onTrackPct,
        workloadLevel,
        workloadColor,
        workloadBg,
        badge
      };
    }).sort((a, b) => b.candidatesCount - a.candidatesCount);
  }, [recruitersList, positions, candidates, STAGES]);

  // Daily Activity Computed in Strict IST
  const dailyActivityStats = useMemo(() => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    
    let startMs = 0;
    let endMs = Infinity;

    if (dailyDatePreset === 'today') {
      startMs = new Date(`${todayStr}T00:00:00+05:30`).getTime();
      endMs = new Date(`${todayStr}T23:59:59+05:30`).getTime();
    } else if (dailyDatePreset === 'yesterday') {
      const y = new Date(Date.now() - 86400000);
      const yStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(y);
      startMs = new Date(`${yStr}T00:00:00+05:30`).getTime();
      endMs = new Date(`${yStr}T23:59:59+05:30`).getTime();
    } else if (dailyDatePreset === 'this_week') {
      const now = new Date();
      const day = now.getDay();
      const diffToMon = (day === 0 ? -6 : 1) - day;
      const mon = new Date(now.getTime() + diffToMon * 86400000);
      const monStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(mon);
      startMs = new Date(`${monStr}T00:00:00+05:30`).getTime();
      endMs = new Date(`${todayStr}T23:59:59+05:30`).getTime();
    } else if (dailyDatePreset === 'this_month') {
      const [year, month] = todayStr.split('-');
      startMs = new Date(`${year}-${month}-01T00:00:00+05:30`).getTime();
      endMs = new Date(`${todayStr}T23:59:59+05:30`).getTime();
    } else if (dailyDatePreset === 'custom' && (dailyCustomStart || dailyCustomEnd)) {
      startMs = dailyCustomStart ? new Date(`${dailyCustomStart}T00:00:00+05:30`).getTime() : 0;
      endMs = dailyCustomEnd ? new Date(`${dailyCustomEnd}T23:59:59+05:30`).getTime() : Infinity;
    }

    const sourcedInPeriod = dashFilteredCandidates.filter(c => {
      const t = c.created_at ? new Date(c.created_at).getTime() : 0;
      return t >= startMs && t <= endMs;
    });

    const actionedInPeriod = dashFilteredCandidates.filter(c => {
      const t = c.updated_at ? new Date(c.updated_at).getTime() : (c.created_at ? new Date(c.created_at).getTime() : 0);
      return t >= startMs && t <= endMs;
    });

    const interviewsInPeriod = actionedInPeriod.filter(c => c.current_stage >= 'S03');
    const testsInPeriod = actionedInPeriod.filter(c => c.current_stage >= 'S04');
    const joinsInPeriod = actionedInPeriod.filter(c => c.current_stage === 'S09');

    // Build timeline events
    const timeline = [];
    actionedInPeriod.forEach(c => {
      const pos = positions.find(p => p.id === c.position_id);
      const eventTime = c.updated_at ? new Date(c.updated_at) : (c.created_at ? new Date(c.created_at) : new Date());
      const sObj = STAGES.find(s => s.id === c.current_stage);
      
      timeline.push({
        id: `act-${c.id}-${eventTime.getTime()}`,
        candidate: c,
        candidateName: c.name,
        candidateCode: c.candidate_code,
        positionTitle: pos?.title || 'Unknown Position',
        recruiter: pos?.recruiter_assigned || c.created_by || 'Unassigned',
        stage: c.current_stage,
        stageLabel: sObj?.label || c.current_stage,
        status: c.candidate_status || 'Pending',
        timestamp: eventTime,
        timeFormatted: new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true
        }).format(eventTime)
      });
    });

    timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return {
      sourcedCount: sourcedInPeriod.length,
      actionedCount: actionedInPeriod.length,
      interviewsCount: interviewsInPeriod.length,
      testsCount: testsInPeriod.length,
      joinsCount: joinsInPeriod.length,
      timeline: timeline.slice(0, 50)
    };
  }, [dashFilteredCandidates, positions, dailyDatePreset, dailyCustomStart, dailyCustomEnd, STAGES]);

  // Created Job Requirements Scoring & Fulfillment Leaderboard Data
  const positionScoringData = useMemo(() => {
    const scoredPositions = dashFilteredPositions.map(pos => {
      const openings = parseInt(pos.openings, 10) || 1;
      const posCandidates = dashFilteredCandidates.filter(c => c.position_id === pos.id);
      
      const totalApplicants = posCandidates.length;
      const screenedCount = posCandidates.filter(c => c.current_stage >= 'S02').length;
      const interviewedCount = posCandidates.filter(c => c.current_stage >= 'S03').length;
      const testedCount = posCandidates.filter(c => c.current_stage >= 'S04').length;
      const finalConfirmedCount = posCandidates.filter(c => c.current_stage >= 'S05').length;
      const offeredCount = posCandidates.filter(c => c.current_stage >= 'S08').length;
      const joinedCount = posCandidates.filter(c => c.current_stage === 'S09').length;

      const fulfillmentPct = Math.min(100, Math.round((joinedCount / openings) * 100));
      const isFulfilled = joinedCount >= openings;

      // SLA & Deadline check
      let isOverdue = false;
      let daysRemaining = null;
      let deadlineFormatted = 'No Deadline';

      if (pos.deadline_date) {
        const dDate = new Date(`${pos.deadline_date}T23:59:59+05:30`);
        deadlineFormatted = new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit', month: 'short', year: 'numeric'
        }).format(dDate);

        const now = new Date();
        const diffMs = dDate.getTime() - now.getTime();
        daysRemaining = Math.round(diffMs / (1000 * 60 * 60 * 24));

        if (!isFulfilled && diffMs < 0) {
          isOverdue = true;
        }
      }

      // Requirement Delivery Score (0 to 100)
      const fillScore = (fulfillmentPct / 100) * 50;
      const pipeScore = Math.min(30, (interviewedCount * 10) + (screenedCount * 3));
      const slaScore = isFulfilled ? 20 : isOverdue ? 0 : 20;

      const totalScore = Math.min(100, Math.round(fillScore + pipeScore + slaScore));

      // Grade & Badges
      let grade = 'Grade B';
      let gradeBg = '#dbeafe';
      let gradeColor = '#1e40af';
      let gradeIcon = '⚡';

      if (isFulfilled || totalScore >= 90) {
        grade = 'Grade A+ (Fulfilled)';
        gradeBg = '#dcfce7';
        gradeColor = '#166534';
        gradeIcon = '🏆';
      } else if (totalScore >= 75) {
        grade = 'Grade A (High Velocity)';
        gradeBg = '#e0e7ff';
        gradeColor = '#3730a3';
        gradeIcon = '⚡';
      } else if (totalScore >= 50) {
        grade = 'Grade B (In Progress)';
        gradeBg = '#fef9c3';
        gradeColor = '#854d0e';
        gradeIcon = '🟡';
      } else if (isOverdue || totalScore < 35) {
        grade = 'Grade D (Critical / Delayed)';
        gradeBg = '#fee2e2';
        gradeColor = '#991b1b';
        gradeIcon = '🔴';
      } else {
        grade = 'Grade C (Awaiting Actions)';
        gradeBg = '#f1f5f9';
        gradeColor = '#475569';
        gradeIcon = '⏳';
      }

      return {
        ...pos,
        openings,
        totalApplicants,
        screenedCount,
        interviewedCount,
        testedCount,
        finalConfirmedCount,
        offeredCount,
        joinedCount,
        fulfillmentPct,
        isFulfilled,
        isOverdue,
        daysRemaining,
        deadlineFormatted,
        totalScore,
        grade,
        gradeBg,
        gradeColor,
        gradeIcon
      };
    });

    const totalRequirements = scoredPositions.length;
    const totalOpenings = scoredPositions.reduce((sum, p) => sum + p.openings, 0);
    const totalJoined = scoredPositions.reduce((sum, p) => sum + p.joinedCount, 0);
    const fulfilledRequirementsCount = scoredPositions.filter(p => p.isFulfilled).length;
    const overallFulfillmentRate = totalOpenings > 0 ? Math.round((totalJoined / totalOpenings) * 100) : 0;
    
    const overdueRequirementsCount = scoredPositions.filter(p => p.isOverdue).length;
    const onTimeRequirementsCount = totalRequirements - overdueRequirementsCount;
    const onTimeRate = totalRequirements > 0 ? Math.round((onTimeRequirementsCount / totalRequirements) * 100) : 100;

    let filtered = scoredPositions.filter(p => {
      if (reqSearch.trim()) {
        const q = reqSearch.toLowerCase().trim();
        const code = (p.id || '').toLowerCase();
        const title = (p.title || '').toLowerCase();
        const dept = (p.department || '').toLowerCase();
        const rec = (p.recruiter_assigned || '').toLowerCase();
        if (!code.includes(q) && !title.includes(q) && !dept.includes(q) && !rec.includes(q)) {
          return false;
        }
      }

      if (reqFulfillmentFilter === 'fulfilled' && !p.isFulfilled) return false;
      if (reqFulfillmentFilter === 'in_progress' && (p.isFulfilled || p.isOverdue)) return false;
      if (reqFulfillmentFilter === 'unfilled' && p.joinedCount > 0) return false;
      if (reqFulfillmentFilter === 'overdue' && !p.isOverdue) return false;

      if (reqDeptFilter !== 'All' && p.department !== reqDeptFilter) return false;

      if (reqRecruiterFilter !== 'All') {
        const recLower = reqRecruiterFilter.toLowerCase();
        const pRec = (p.recruiter_assigned || '').toLowerCase();
        if (!pRec.includes(recLower)) return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      if (reqSort === 'score_desc') return b.totalScore - a.totalScore;
      if (reqSort === 'score_asc') return a.totalScore - b.totalScore;
      if (reqSort === 'openings_desc') return b.openings - a.openings;
      if (reqSort === 'deadline_near') {
        const dA = a.deadline_date ? new Date(a.deadline_date).getTime() : Infinity;
        const dB = b.deadline_date ? new Date(b.deadline_date).getTime() : Infinity;
        return dA - dB;
      }
      if (reqSort === 'title_asc') return (a.title || '').localeCompare(b.title || '');
      return b.totalScore - a.totalScore;
    });

    return {
      allScoredPositions: scoredPositions,
      filteredPositions: filtered,
      totalRequirements,
      totalOpenings,
      totalJoined,
      fulfilledRequirementsCount,
      overallFulfillmentRate,
      overdueRequirementsCount,
      onTimeRequirementsCount,
      onTimeRate
    };
  }, [dashFilteredPositions, dashFilteredCandidates, reqSearch, reqFulfillmentFilter, reqDeptFilter, reqRecruiterFilter, reqSort]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem' }}>

      {/* ACCESS DENIED guard for specific stages */}
      {selectedStage !== 'dashboard' && selectedStage !== 'all_stages' && !canAccessStage(selectedStage) ? (
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '1rem', padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem' }}>🔒</div>
          <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>Access Restricted</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: 1.6 }}>
            You do not have permission to view <strong>{selectedStage}</strong>. 
            Please contact your administrator to grant access to this stage.
          </p>
        </div>
      ) : selectedStage === 'dashboard' && !canAccessDashboard ? (
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '1rem', padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem' }}>🔒</div>
          <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>Dashboard Restricted</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: 1.6 }}>
            The Recruiter Dashboard overview requires Full Access or Manager-level permission.
          </p>
        </div>
      ) : selectedStage === 'all_stages' && !canAccessAllStages ? (
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '1rem', padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem' }}>🔒</div>
          <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>All Stages Restricted</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: 1.6 }}>
            Viewing all stages requires Full Access or Manager-level permission.
          </p>
        </div>
      ) : (
      <>
      {/* Sub-Header & Stage Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {selectedStage === 'dashboard' ? (
              <>
                {dashboardSubTab === 'overview' && <ClipboardList size={20} style={{ color: 'var(--accent-color)' }} />}
                {dashboardSubTab === 'daily_activity' && <Activity size={20} style={{ color: 'var(--accent-color)' }} />}
                {dashboardSubTab === 'scoring' && <Award size={20} style={{ color: 'var(--accent-color)' }} />}
                {dashboardSubTab === 'overview' ? 'Recruiter Dashboard Overview' : dashboardSubTab === 'daily_activity' ? 'Recruiter Daily Activity' : 'Recruiter Scoring & Requirements Leaderboard'}
              </>
            ) : selectedStage === 'all_stages' ? (
              <>
                <Users size={20} style={{ color: 'var(--accent-color)' }} /> Recruiter All Stage Pipeline
              </>
            ) : selectedStage === 'S00' || selectedStage === 'S01' ? (
              <>
                <Briefcase size={20} style={{ color: 'var(--accent-color)' }} />{' '}
                {selectedStage === 'S00' ? 'S00: Requirements Received' : 'S01: JDs Prepared & Posted'}
              </>
            ) : (
              <>
                <Users size={20} style={{ color: 'var(--accent-color)' }} /> {STAGES.find(s => s.id === selectedStage)?.label || 'Candidate Pipeline'}
              </>
            )}
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
            {selectedStage === 'dashboard' ? (
              dashboardSubTab === 'overview'
                ? "Overview of requirements, candidate metrics, pipeline funnel and recruiter performance."
                : dashboardSubTab === 'daily_activity'
                ? "Daily candidate movements, interviews, tests, joinings and recruiter workload in Strict IST."
                : "Created job requirements fulfillment, pipeline throughput and delivery health scorecards."
            ) : selectedStage === 'all_stages' ? (
              `View and manage all registered candidates across all pipeline stages (${filteredCandidates.length} candidates).`
            ) : selectedStage === 'S00' || selectedStage === 'S01' ? (
              `Manage department requirements, prepare and track JD postings (${filteredPositions.length} positions).`
            ) : (
              `Manage applicants in this stage (${filteredCandidates.length} candidates).`
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          {selectedStage !== 'dashboard' && (
            <TableViewToggle view={recruiterTableView} onChange={setRecruiterTableView} style={{ marginLeft: 0 }} />
          )}

          <button 
            onClick={() => loadData(true)}
            style={{ 
              padding: '0.5rem', 
              borderRadius: '50%', 
              border: '1px solid var(--border-light)', 
              background: 'var(--bg-surface)', 
              color: isBackgroundSyncing ? 'var(--accent-color, #2563eb)' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            title={isBackgroundSyncing ? "Syncing fresh data from Supabase..." : "Refresh Data"}
          >
            <RefreshCw size={16} style={isBackgroundSyncing ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>

          {selectedStage === 'dashboard' ? null : selectedStage === 'S00' || selectedStage === 'S01' ? (
            <button 
              onClick={() => setIsPositionModalOpen(true)}
              disabled={!canEditStage(selectedStage)}
              className="btn-primary"
              style={{ 
                fontSize: '0.85rem', padding: '0.5rem 1.25rem',
                cursor: !canEditStage(selectedStage) ? 'not-allowed' : 'pointer',
                opacity: !canEditStage(selectedStage) ? 0.6 : 1
              }}
            >
              <Plus size={16} /> Create Position
            </button>
          ) : (
            <button 
              onClick={() => setIsCandidateModalOpen(true)}
              disabled={!canEditStage('S02')}
              className="btn-primary"
              style={{ 
                fontSize: '0.85rem', padding: '0.5rem 1.25rem',
                cursor: !canEditStage('S02') ? 'not-allowed' : 'pointer',
                opacity: !canEditStage('S02') ? 0.6 : 1
              }}
            >
              <UserPlus size={16} /> Add Candidate
            </button>
          )}
        </div>
      </div>

      {syncError && <p role="status" style={{ color: 'var(--text-secondary)' }}>{syncError}</p>}
      {loading && positions.length === 0 && candidates.length === 0 ? (
        <div style={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', height: '300px', color: 'var(--text-secondary)' }}>
          Loading recruiter workspace...
        </div>
      ) : selectedStage === 'dashboard' ? (
        /* ==================== TAB: RECRUITER DASHBOARD ==================== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Universal Multi-Filter Bar (Strict IST) */}
          <div className="card" style={{ padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '0.85rem', backgroundColor: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ padding: '0.35rem', borderRadius: '8px', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-color)' }}>
                  <Filter size={16} />
                </div>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Recruitment Analysis &amp; Filter Options (Strict IST)
                </span>
                {hasActiveDashFilters ? (
                  <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '12px', backgroundColor: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-color)', fontWeight: 700 }}>
                    Active Filters Applied
                  </span>
                ) : (
                  <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '12px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                    Showing All Records
                  </span>
                )}
              </div>

              {hasActiveDashFilters && (
                <button
                  onClick={handleResetDashFilters}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    padding: '0.35rem 0.75rem', borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)', color: 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                    transition: 'all 0.15s ease'
                  }}
                  title="Reset all filters to default"
                >
                  <RotateCcw size={12} /> Reset Filters
                </button>
              )}
            </div>

            {/* Filter Controls Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', alignItems: 'flex-end' }}>
              
              {/* Date Period Preset */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '180px' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Calendar size={12} /> Date Range (IST)
                </label>
                <DateRangePicker
                  preset={dashDatePreset}
                  startDate={dashStartDate}
                  endDate={dashEndDate}
                  onChange={({ preset, startDate, endDate }) => {
                    setDashDatePreset(preset);
                    setDashStartDate(startDate);
                    setDashEndDate(endDate);
                  }}
                  allowAllTime={true}
                  title="Select IST Date Range"
                />
              </div>

              {/* Branch / Plant Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '180px' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Building2 size={12} /> Branch / Plant
                </label>
                <UniversalBranchSelect
                  mode="filter"
                  allValue="All"
                  allLabel="All Branches"
                  value={dashBranchFilter}
                  onChange={(val) => setDashBranchFilter(val || 'All')}
                  branches={availableBranches}
                  placeholder="All Branches"
                  triggerStyle={{ padding: '0.45rem 0.65rem', minHeight: '38px', borderRadius: '8px', fontSize: '0.8rem' }}
                />
              </div>

              {/* Department Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Department
                </label>
                <select
                  value={dashDeptFilter}
                  onChange={(e) => setDashDeptFilter(e.target.value)}
                  style={{ padding: '0.5rem', minHeight: '38px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.8rem', color: 'var(--text-primary)' }}
                >
                  <option value="All">All Departments ({departments.length})</option>
                  {departments.map((d, idx) => (
                    <option key={`dash-dept-${d}-${idx}`} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Position / Role Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Briefcase size={12} /> Position / Role
                </label>
                <select
                  value={dashPosFilter}
                  onChange={(e) => setDashPosFilter(e.target.value)}
                  style={{ padding: '0.5rem', minHeight: '38px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.8rem', color: 'var(--text-primary)' }}
                >
                  <option value="All">All Positions ({positions.length})</option>
                  {positions.map((p, idx) => {
                    const posCode = formatPositionCode(p);
                    return (
                      <option key={p.id || `dash-pos-${idx}`} value={p.id}>
                        {posCode ? `[${posCode}] ` : ''}{p.title} ({p.department})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Recruiter / HR Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Users size={12} /> Recruiter
                </label>
                <select
                  value={dashRecruiterFilter}
                  onChange={(e) => setDashRecruiterFilter(e.target.value)}
                  style={{ padding: '0.5rem', minHeight: '38px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.8rem', color: 'var(--text-primary)' }}
                >
                  <option value="All">All Recruiters ({recruitersList.length})</option>
                  {recruitersList.map((r, idx) => {
                    const displayName = r.emp_name
                      ? (r.emp_id && !r.emp_name.includes(r.emp_id) ? `${r.emp_name} (${r.emp_id})` : r.emp_name)
                      : (r.name || r.email);
                    const recVal = r.emp_name || r.name || r.email;
                    return (
                      <option key={r.id || r.user_id || r.emp_id || `dash-rec-${idx}`} value={recVal}>
                        {displayName}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Candidate Status & Funnel Health Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Target size={12} /> Pipeline Status
                </label>
                <select
                  value={dashStatusFilter}
                  onChange={(e) => setDashStatusFilter(e.target.value)}
                  style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.8rem', color: 'var(--text-primary)' }}
                >
                  <option value="All">All Statuses</option>
                  <option value="active_pipeline">⏳ Active Pipeline (S02–S08)</option>
                  {CANDIDATE_STAGES.map(s => (
                    <option key={s.id} value={s.id}>{s.label || s.id}</option>
                  ))}
                  <option value="delayed">⚠️ SLA Overdue / Delayed</option>
                  <option value="rejected">🔴 Dropped / Rejected</option>
                </select>
              </div>

            </div>
          </div>

          {/* Sub-Tab Navigation Switcher */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.35rem',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            width: 'fit-content',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => handleSwitchSubTab('overview')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: dashboardSubTab === 'overview' ? 'var(--accent-color, #2563eb)' : 'transparent',
                color: dashboardSubTab === 'overview' ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease'
              }}
            >
              <LayoutDashboard size={15} /> Recruiter Dashboard Overview
            </button>

            <button
              onClick={() => handleSwitchSubTab('daily_activity')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: dashboardSubTab === 'daily_activity' ? 'var(--accent-color, #2563eb)' : 'transparent',
                color: dashboardSubTab === 'daily_activity' ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease'
              }}
            >
              <Activity size={15} /> Recruiter Daily Activity
            </button>

            <button
              onClick={() => handleSwitchSubTab('scoring')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: dashboardSubTab === 'scoring' ? 'var(--accent-color, #2563eb)' : 'transparent',
                color: dashboardSubTab === 'scoring' ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease'
              }}
            >
              <Award size={15} /> Recruiter Scoring
            </button>
          </div>

          {/* ========================================================= */}
          {/* SUB-TAB 1: RECRUITER DASHBOARD OVERVIEW                    */}
          {/* ========================================================= */}
          {dashboardSubTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* 6 Executive Reporting KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.15rem' }}>
                
                {/* Card 1: S00 Requirements */}
                <div 
                  className="card" 
                  onClick={() => onSelectStage && onSelectStage('S00')}
                  style={{ 
                    padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.15rem', 
                    borderLeft: '4px solid var(--accent-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', 
                    borderRadius: '12px', cursor: onSelectStage ? 'pointer' : 'default',
                    transition: 'transform 0.15s ease'
                  }}
                >
                  <div style={{ padding: '0.7rem', borderRadius: '12px', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-color)' }}>
                    <Briefcase size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Requirements</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                      {dashStats.s00Pos.length}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                      {dashStats.s00Openings} Openings Pending JD
                    </div>
                  </div>
                </div>

                {/* Card 2: S01 Active JDs */}
                <div 
                  className="card" 
                  onClick={() => onSelectStage && onSelectStage('S01')}
                  style={{ 
                    padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.15rem', 
                    borderLeft: '4px solid #10b981', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', 
                    borderRadius: '12px', cursor: onSelectStage ? 'pointer' : 'default',
                    transition: 'transform 0.15s ease'
                  }}
                >
                  <div style={{ padding: '0.7rem', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                    <FileText size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Active Job JDs (S01)</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                      {dashStats.s01Pos.length}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#10b981', marginTop: '0.1rem', fontWeight: 600 }}>
                      {dashStats.s01Openings} Active Openings Live
                    </div>
                  </div>
                </div>

                {/* Card 3: Active Pipeline */}
                <div 
                  className="card" 
                  onClick={() => onSelectStage && onSelectStage('all_stages')}
                  style={{ 
                    padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.15rem', 
                    borderLeft: '4px solid #3b82f6', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', 
                    borderRadius: '12px', cursor: onSelectStage ? 'pointer' : 'default',
                    transition: 'transform 0.15s ease'
                  }}
                >
                  <div style={{ padding: '0.7rem', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                    <Users size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Active Candidate Pipeline</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                      {dashStats.activePipeline.length}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                      Across S02–S08 Pipeline ({dashStats.totalApplicants} Total)
                    </div>
                  </div>
                </div>

                {/* Card 4: S09 Joined & Conversion */}
                <div 
                  className="card" 
                  onClick={() => onSelectStage && onSelectStage('S09')}
                  style={{ 
                    padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.15rem', 
                    borderLeft: '4px solid #22c55e', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', 
                    borderRadius: '12px', cursor: onSelectStage ? 'pointer' : 'default',
                    transition: 'transform 0.15s ease'
                  }}
                >
                  <div style={{ padding: '0.7rem', borderRadius: '12px', backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Joined (S09)</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                      {dashStats.joined.length}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#22c55e', marginTop: '0.1rem', fontWeight: 600 }}>
                      {dashStats.joinRatio}% Selection &amp; Join Ratio
                    </div>
                  </div>
                </div>

                {/* Card 5: Candidate Scoring Index */}
                <div 
                  className="card" 
                  onClick={() => handleSwitchSubTab('scoring')}
                  style={{ 
                    padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.15rem', 
                    borderLeft: '4px solid #a855f7', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', 
                    borderRadius: '12px', cursor: 'pointer'
                  }}
                  title="Click to open Created Job Requirements Scoring & Fulfillment Leaderboard"
                >
                  <div style={{ padding: '0.7rem', borderRadius: '12px', backgroundColor: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
                    <Star size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Candidate Scoring Index</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                      {dashStats.avgInterviewRating ? `⭐ ${dashStats.avgInterviewRating}` : (dashStats.testPassRate !== null ? `${dashStats.testPassRate}%` : 'N/A')}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#a855f7', marginTop: '0.1rem', fontWeight: 600 }}>
                      {dashStats.testPassRate !== null ? `Test Pass Rate: ${dashStats.testPassRate}%` : (dashStats.avgInterviewRating ? 'Avg Interview Rating' : 'Awaiting Evaluations')}
                    </div>
                  </div>
                </div>

                {/* Card 6: SLA & TAT Compliance */}
                <div 
                  className="card" 
                  style={{ 
                    padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.15rem', 
                    borderLeft: `4px solid ${dashStats.delayedCount > 0 ? '#f59e0b' : '#10b981'}`, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', 
                    borderRadius: '12px'
                  }}
                >
                  <div style={{ padding: '0.7rem', borderRadius: '12px', backgroundColor: dashStats.delayedCount > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: dashStats.delayedCount > 0 ? '#f59e0b' : '#10b981' }}>
                    <Clock size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>SLA &amp; TAT Health</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                      {dashStats.onTrackPct}%
                    </div>
                    <div style={{ fontSize: '0.7rem', color: dashStats.delayedCount > 0 ? '#b45309' : '#166534', marginTop: '0.1rem', fontWeight: 600 }}>
                      {dashStats.delayedCount > 0 ? `⚠️ ${dashStats.delayedCount} Delayed` : '🟢 100% On Track'}
                    </div>
                  </div>
                </div>

              </div>

              {/* Direct Visible Recruiter Performance & Workload Cards Grid */}
              <div className="card" style={{ padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={18} style={{ color: 'var(--accent-color)' }} />
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      Recruiter Workload &amp; Performance Cards
                    </h3>
                    <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '12px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {recruiterMetrics.length} Active Recruiters
                    </span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Directly visible • Click any card to filter dashboard by that recruiter
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                  {recruiterMetrics.map(rec => {
                    const isSelected = dashRecruiterFilter.toLowerCase() === rec.name.toLowerCase() || (rec.email && dashRecruiterFilter.toLowerCase() === rec.email.toLowerCase());
                    return (
                      <div
                        key={rec.key}
                        onClick={() => {
                          if (isSelected) {
                            setDashRecruiterFilter('All');
                          } else {
                            setDashRecruiterFilter(rec.name);
                          }
                        }}
                        style={{
                          padding: '1.15rem',
                          borderRadius: '12px',
                          border: isSelected ? '2px solid var(--accent-color)' : '1px solid var(--border-light)',
                          backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.04)' : 'var(--bg-surface)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.85rem',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? '0 4px 14px rgba(99, 102, 241, 0.15)' : '0 2px 8px rgba(0,0,0,0.03)'
                        }}
                        title={isSelected ? "Click to clear recruiter filter" : `Click to filter dashboard by ${rec.name}`}
                      >
                        {/* Top: Name, Branch, Workload */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <div style={{
                              width: '36px', height: '36px', borderRadius: '50%',
                              backgroundColor: 'var(--accent-color, #2563eb)',
                              color: '#ffffff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 800, fontSize: '0.88rem'
                            }}>
                              {rec.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {rec.name}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                {rec.branch_code || (rec.emp_id ? `ID: ${rec.emp_id}` : 'Recruiter')}
                              </div>
                            </div>
                          </div>

                          <span style={{
                            fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '12px',
                            fontWeight: 700, backgroundColor: rec.workloadBg, color: rec.workloadColor
                          }}>
                            {rec.workloadLevel}
                          </span>
                        </div>

                        {/* Middle: 3 Stat Columns */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', padding: '0.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', textAlign: 'center' }}>
                          <div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Positions</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.1rem' }}>
                              {rec.positionsCount}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{rec.openingsCount} Openings</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Pipeline</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#3b82f6', marginTop: '0.1rem' }}>
                              {rec.pipelineCount}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{rec.candidatesCount} Total</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Joined (S09)</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#166534', marginTop: '0.1rem' }}>
                              {rec.joinedCount}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#166534', fontWeight: 600 }}>{rec.joinRate}% Ratio</div>
                          </div>
                        </div>

                        {/* Bottom: Score & SLA */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontWeight: 700, color: '#b45309' }}>
                              {rec.avgRating ? `⭐ ${rec.avgRating}` : '⭐ Unrated'}
                            </span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.68rem' }}>
                              ({rec.ratings.length} scored)
                            </span>
                          </div>

                          <span style={{
                            fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '10px',
                            fontWeight: 700,
                            backgroundColor: rec.onTrackPct >= 90 ? '#dcfce7' : '#fee2e2',
                            color: rec.onTrackPct >= 90 ? '#166534' : '#991b1b'
                          }}>
                            {rec.onTrackPct}% SLA On-Track
                          </span>
                        </div>

                        {isSelected && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--accent-color)', fontWeight: 700, textAlign: 'center', marginTop: '-0.2rem' }}>
                            ✓ Active Filter Applied • Click to clear
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {recruiterMetrics.length === 0 && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', gridColumn: '1 / -1' }}>
                      No recruiters registered or assigned yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Pipeline Breakdown, Scoring & Conversion Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
                
                {/* Column 1: Funnel & Stage Conversion Rates */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* Funnel Pipeline */}
                  <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <TrendingUp size={18} style={{ color: 'var(--accent-color)' }} />
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Recruitment Funnel Pipeline</h3>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Click stage to view</span>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {STAGES.map(stage => {
                        let countText = '';
                        let pct = 0;
                        if (stage.id === 'S00') {
                          const cnt = dashStats.s00Pos.length;
                          countText = `${cnt} Requirement${cnt === 1 ? '' : 's'} (${dashStats.s00Openings} Openings)`;
                          pct = dashFilteredPositions.length > 0 ? (cnt / dashFilteredPositions.length) * 100 : 0;
                        } else if (stage.id === 'S01') {
                          const cnt = dashStats.s01Pos.length;
                          countText = `${cnt} Active Posting${cnt === 1 ? '' : 's'} (${dashStats.s01Openings} Openings)`;
                          pct = dashFilteredPositions.length > 0 ? (cnt / dashFilteredPositions.length) * 100 : 0;
                        } else {
                          const cnt = dashFilteredCandidates.filter(c => c.current_stage === stage.id).length;
                          countText = `${cnt} Candidate${cnt === 1 ? '' : 's'}`;
                          pct = dashFilteredCandidates.length > 0 ? (cnt / dashFilteredCandidates.length) * 100 : 0;
                        }

                        return (
                          <div 
                            key={stage.id} 
                            onClick={() => onSelectStage && onSelectStage(stage.id)}
                            style={{ 
                              display: 'flex', 
                              flexDirection: 'column', 
                              gap: '0.35rem',
                              cursor: onSelectStage ? 'pointer' : 'default',
                              padding: '0.35rem 0.5rem',
                              borderRadius: '8px',
                              transition: 'background-color 0.15s ease'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                            title={`Open ${stage.label}`}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                              <span style={{ color: 'var(--text-primary)' }}>{stage.label}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{countText}</span>
                            </div>
                            <div style={{ height: '8px', backgroundColor: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, backgroundColor: stage.textColor || 'var(--accent-color)', borderRadius: '4px', transition: 'width 0.5s ease-in-out' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Stage Clearance & Conversion Rates Widget */}
                  <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.15rem', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Award size={18} style={{ color: '#10b981' }} />
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        Stage Clearance &amp; Conversion Rates (%)
                      </h3>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                      
                      {/* S02 Screening */}
                      <div style={{ padding: '0.75rem', borderRadius: '10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)' }}>S02 Screening</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#334155', marginTop: '0.2rem' }}>
                          {dashFilteredCandidates.length > 0 ? '100%' : '0%'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                          {dashFilteredCandidates.length} Screened
                        </div>
                      </div>

                      {/* S03 Interview Clearance */}
                      <div style={{ padding: '0.75rem', borderRadius: '10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)' }}>S03 Interview Clear</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#854d0e', marginTop: '0.2rem' }}>
                          {dashStats.interviewClearRate}%
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                          Passed Interview Round
                        </div>
                      </div>

                      {/* S04 Test Clearance */}
                      <div style={{ padding: '0.75rem', borderRadius: '10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)' }}>S04 Skill Test Pass</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e40af', marginTop: '0.2rem' }}>
                          {dashStats.testPassRate !== null ? `${dashStats.testPassRate}%` : 'N/A'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                          Cleared Assessment
                        </div>
                      </div>

                      {/* S05 Final Confirmation Rate */}
                      <div style={{ padding: '0.75rem', borderRadius: '10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{s05Name} Rate</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#c2410c', marginTop: '0.2rem' }}>
                          {dashStats.finalConfirmationRate}%
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                          Confirmed &amp; Approved
                        </div>
                      </div>

                      {/* S08 LOI Acceptance */}
                      <div style={{ padding: '0.75rem', borderRadius: '10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)' }}>S08 LOI Acceptance</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#166534', marginTop: '0.2rem' }}>
                          {dashStats.loiAcceptRate}%
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                          Offer Accepted &amp; Joined
                        </div>
                      </div>

                    </div>
                  </div>

                </div>

                {/* Column 2: Scoring Leaderboard & Department Tracker */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* Candidate Scoring Leaderboard */}
                  <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Star size={18} style={{ color: '#f59e0b' }} />
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Top Evaluated Candidates</h3>
                      </div>
                      <button 
                        onClick={() => handleSwitchSubTab('scoring')}
                        style={{ fontSize: '0.74rem', color: 'var(--accent-color)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                      >
                        View All Scores <ArrowUpRight size={13} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {dashStats.topCandidates.map(cand => {
                        const rating = cand.interview_rating || cand.evaluation?.interview_rating;
                        const rec = cand.evaluation_recommendation || cand.evaluation?.recommendation;
                        const testScore = cand.technical_score || cand.test_results;

                        return (
                          <div
                            key={cand.id}
                            onClick={() => { setSelectedCandidate(cand); setIsProfileOpen(true); }}
                            style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-light)',
                              cursor: 'pointer', borderRadius: '8px', transition: 'background-color 0.15s'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {cand.name}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                {cand.recruitment_positions?.title || 'Position'} {cand.candidate_code ? `• ${cand.candidate_code}` : ''}
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              {rating ? (
                                <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.45rem', borderRadius: '10px', backgroundColor: '#fef3c7', color: '#b45309', fontWeight: 700 }}>
                                  ⭐ {rating} / 5
                                </span>
                              ) : testScore ? (
                                <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.45rem', borderRadius: '10px', backgroundColor: '#dbeafe', color: '#1e40af', fontWeight: 700 }}>
                                  📝 {testScore}
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem', borderRadius: '10px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                                  In Review
                                </span>
                              )}

                              {rec && (
                                <span style={{
                                  fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '10px', fontWeight: 700,
                                  backgroundColor: rec.includes('Strong') || rec.includes('Hire') ? '#dcfce7' : '#fef9c3',
                                  color: rec.includes('Strong') || rec.includes('Hire') ? '#166534' : '#854d0e'
                                }}>
                                  {rec}
                                </span>
                              )}

                              <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem', borderRadius: '6px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                {cand.current_stage}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {dashStats.topCandidates.length === 0 && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
                          No candidates found matching the selected filters.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Department Hiring Progress */}
                  <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Building2 size={18} style={{ color: 'var(--accent-color)' }} />
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Department Fulfillment Progress</h3>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Openings vs Hired</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {Object.entries(dashStats.deptMap).slice(0, 5).map(([deptName, info]) => {
                        const fillPct = info.openings > 0 ? Math.min(Math.round((info.joined / info.openings) * 100), 100) : 0;
                        return (
                          <div key={deptName} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600 }}>
                              <span style={{ color: 'var(--text-primary)' }}>{deptName}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>
                                {info.joined} / {info.openings} Filled ({info.candidates} in pipe)
                              </span>
                            </div>
                            <div style={{ height: '6px', backgroundColor: 'var(--bg-primary)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${fillPct}%`, backgroundColor: fillPct === 100 ? '#10b981' : 'var(--accent-color)', borderRadius: '3px' }} />
                            </div>
                          </div>
                        );
                      })}

                      {Object.keys(dashStats.deptMap).length === 0 && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
                          No department data available.
                        </p>
                      )}
                    </div>
                  </div>

                </div>

              </div>

              {/* Quick Summary / Recent Entries */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
                
                {/* Recent Requirements */}
                <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Filtered Requirements</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{dashFilteredPositions.length} total</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {dashFilteredPositions.slice(0, 5).map(pos => (
                      <div 
                        key={pos.id} 
                        onClick={() => onSelectStage && onSelectStage(pos.status || 'S00')}
                        style={{ 
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                          padding: '0.5rem 0.4rem', borderBottom: '1px solid var(--border-light)',
                          cursor: onSelectStage ? 'pointer' : 'default',
                          borderRadius: '6px',
                          transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-primary)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{pos.title}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {pos.department} {pos.openings ? `• ${pos.openings} opening${pos.openings > 1 ? 's' : ''}` : ''}
                          </div>
                        </div>
                        <span style={{ 
                          fontSize: '0.65rem', 
                          padding: '0.2rem 0.5rem', 
                          borderRadius: '12px', 
                          fontWeight: 'bold',
                          background: pos.status === 'S00' ? '#fee2e2' : '#dcfce7',
                          color: pos.status === 'S00' ? '#991b1b' : '#166534'
                        }}>
                          {pos.status === 'S00' ? 'S00: Requirement' : 'S01: JD Posted'}
                        </span>
                      </div>
                    ))}
                    {dashFilteredPositions.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>No requirements found matching filters.</p>}
                  </div>
                </div>

                {/* Recent Applicants with Evaluation Badges */}
                <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Recent Filtered Candidates</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{dashFilteredCandidates.length} total</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {dashFilteredCandidates.slice(0, 5).map(cand => {
                      const rating = cand.interview_rating || cand.evaluation?.interview_rating;
                      const cCreated = cand.created_at ? new Date(cand.created_at) : null;
                      const sObj = STAGES.find(s => s.id === (cand.current_stage || 'S02'));
                      const tat = sObj?.tat_hours || 24;
                      const planned = cCreated ? new Date(cCreated.getTime() + tat * 3600000) : null;
                      const sla = getSlaDelayInfo(planned, cand.current_stage === 'S09' ? new Date(cand.updated_at || cand.created_at) : null);

                      return (
                        <div 
                          key={cand.id} 
                          onClick={() => onSelectStage && onSelectStage(cand.current_stage || 'S02')}
                          style={{ 
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                            padding: '0.5rem 0.4rem', borderBottom: '1px solid var(--border-light)',
                            cursor: onSelectStage ? 'pointer' : 'default',
                            borderRadius: '6px',
                            transition: 'background-color 0.15s'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-primary)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{cand.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              {cand.recruitment_positions?.title || 'Unknown Position'} {cand.candidate_code ? `• ${cand.candidate_code}` : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            {rating && (
                              <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem', backgroundColor: '#fef3c7', color: '#b45309', borderRadius: '10px', fontWeight: 700 }}>
                                ⭐ {rating}
                              </span>
                            )}
                            <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              {cand.current_stage}
                            </span>
                            <span style={{ 
                              fontSize: '0.7rem', 
                              padding: '0.2rem 0.4rem', 
                              borderRadius: '12px', 
                              fontWeight: 'bold',
                              background: cand.candidate_status?.includes('Rejected') || cand.candidate_status?.includes('Failed') ? '#fee2e2' : cand.candidate_status?.includes('Cleared') || cand.candidate_status?.includes('Passed') || cand.candidate_status?.includes('Approved') || cand.candidate_status?.includes('Joined') ? '#dcfce7' : '#fef9c3',
                              color: cand.candidate_status?.includes('Rejected') || cand.candidate_status?.includes('Failed') ? '#991b1b' : cand.candidate_status?.includes('Cleared') || cand.candidate_status?.includes('Passed') || cand.candidate_status?.includes('Approved') || cand.candidate_status?.includes('Joined') ? '#166534' : '#854d0e'
                            }}>
                              {cand.candidate_status || 'Pending'}
                            </span>
                            <span style={{
                              fontSize: '0.68rem',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '10px',
                              fontWeight: 700,
                              background: sla.bg,
                              color: sla.color
                            }}>
                              {sla.isDelayed ? '⚠️ SLA Delay' : '🟢 On Track'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {dashFilteredCandidates.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>No candidates found matching filters.</p>}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SUB-TAB 2: RECRUITER DAILY ACTIVITY                        */}
          {/* ========================================================= */}
          {dashboardSubTab === 'daily_activity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Daily Filter Bar (Strict IST) */}
              <div className="card" style={{ padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '0.85rem', backgroundColor: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ padding: '0.35rem', borderRadius: '8px', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-color)' }}>
                      <Activity size={16} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Daily Operations &amp; Team Workload (Strict IST / Asia/Kolkata)
                      </span>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                        Tracking real-time candidate actions, interview throughput, and recruiter capacity.
                      </div>
                    </div>
                  </div>

                  {/* Preset Pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {[
                      { id: 'today', label: 'Today (IST)' },
                      { id: 'yesterday', label: 'Yesterday' },
                      { id: 'this_week', label: 'This Week' },
                      { id: 'this_month', label: 'This Month' },
                      { id: 'all', label: 'All Time' },
                      { id: 'custom', label: 'Custom Range' }
                    ].map(p => (
                      <button
                        key={p.id}
                        onClick={() => setDailyDatePreset(p.id)}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          backgroundColor: dailyDatePreset === p.id ? 'var(--accent-color, #2563eb)' : 'var(--bg-primary)',
                          color: dailyDatePreset === p.id ? '#ffffff' : 'var(--text-secondary)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Date Inputs if 'custom' is active */}
                {dailyDatePreset === 'custom' && (
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Start Date (IST):</label>
                      <input 
                        type="date" 
                        value={dailyCustomStart} 
                        onChange={(e) => setDailyCustomStart(e.target.value)} 
                        style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem', backgroundColor: 'var(--bg-surface)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>End Date (IST):</label>
                      <input 
                        type="date" 
                        value={dailyCustomEnd} 
                        onChange={(e) => setDailyCustomEnd(e.target.value)} 
                        style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem', backgroundColor: 'var(--bg-surface)' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 5 Daily Operational Counters */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                
                {/* 1. Sourced */}
                <div className="card" style={{ padding: '1.15rem', borderRadius: '12px', borderLeft: '4px solid #3b82f6', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ padding: '0.65rem', borderRadius: '10px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                    <UserPlus size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Candidates Sourced</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                      {dailyActivityStats.sourcedCount}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#3b82f6' }}>In selected period</div>
                  </div>
                </div>

                {/* 2. Actions Logged */}
                <div className="card" style={{ padding: '1.15rem', borderRadius: '12px', borderLeft: '4px solid var(--accent-color)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ padding: '0.65rem', borderRadius: '10px', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-color)' }}>
                    <CheckSquare size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Candidate Updates / Actions</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                      {dailyActivityStats.actionedCount}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--accent-color)' }}>Stage movements &amp; notes</div>
                  </div>
                </div>

                {/* 3. Interviews */}
                <div className="card" style={{ padding: '1.15rem', borderRadius: '12px', borderLeft: '4px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ padding: '0.65rem', borderRadius: '10px', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                    <Users size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Interviews Conducted (S03+)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                      {dailyActivityStats.interviewsCount}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#b45309' }}>Interview rounds held</div>
                  </div>
                </div>

                {/* 4. Tests Conducted */}
                <div className="card" style={{ padding: '1.15rem', borderRadius: '12px', borderLeft: '4px solid #a855f7', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ padding: '0.65rem', borderRadius: '10px', backgroundColor: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
                    <FileText size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Skill Tests Evaluated (S04+)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                      {dailyActivityStats.testsCount}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#a855f7' }}>Technical assessments</div>
                  </div>
                </div>

                {/* 5. Joins */}
                <div className="card" style={{ padding: '1.15rem', borderRadius: '12px', borderLeft: '4px solid #10b981', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ padding: '0.65rem', borderRadius: '10px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Candidates Joined (S09)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                      {dailyActivityStats.joinsCount}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#166534' }}>Successful placements</div>
                  </div>
                </div>

              </div>

              {/* Recruiter Daily Workload Grid */}
              <div className="card" style={{ padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={18} style={{ color: 'var(--accent-color)' }} />
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      Recruiter Today's Output &amp; Capacity
                    </h3>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Strict Indian Standard Time (IST)</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                  {recruiterMetrics.map(rec => (
                    <div
                      key={`daily-${rec.key}`}
                      style={{
                        padding: '1rem',
                        borderRadius: '10px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-primary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            backgroundColor: 'var(--accent-color)', color: '#ffffff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: '0.82rem'
                          }}>
                            {rec.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{rec.name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{rec.branch_code || 'General'}</div>
                          </div>
                        </div>

                        <span style={{
                          fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: '10px',
                          fontWeight: 700, backgroundColor: rec.workloadBg, color: rec.workloadColor
                        }}>
                          {rec.workloadLevel}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem', textAlign: 'center', fontSize: '0.72rem', backgroundColor: 'var(--bg-surface)', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>Today's Actions</div>
                          <div style={{ fontWeight: 800, color: 'var(--accent-color)', fontSize: '0.95rem' }}>{rec.todayActionCount}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>Pipeline</div>
                          <div style={{ fontWeight: 800, color: '#3b82f6', fontSize: '0.95rem' }}>{rec.pipelineCount}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>Openings</div>
                          <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{rec.openingsCount}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Realtime Candidate Activity Stream / Movement Timeline */}
              <div className="card" style={{ padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={18} style={{ color: 'var(--accent-color)' }} />
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      Candidate Activity &amp; Movement Stream
                    </h3>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {dailyActivityStats.timeline.length} recent activity events in period
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {dailyActivityStats.timeline.map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem 1rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-primary)',
                        flexWrap: 'wrap',
                        gap: '0.5rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, minWidth: '135px' }}>
                          📅 {ev.timeFormatted}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {ev.candidateName} {ev.candidateCode ? `(${ev.candidateCode})` : ''}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            {ev.positionTitle} • Assigned to: <strong style={{ color: 'var(--text-primary)' }}>{ev.recruiter}</strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                          fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '6px',
                          backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                          fontWeight: 700, color: 'var(--accent-color)'
                        }}>
                          {ev.stageLabel}
                        </span>

                        <span style={{
                          fontSize: '0.68rem', padding: '0.2rem 0.5rem', borderRadius: '12px',
                          fontWeight: 700,
                          backgroundColor: ev.status.includes('Joined') || ev.status.includes('Cleared') || ev.status.includes('Approved') ? '#dcfce7' : ev.status.includes('Rejected') || ev.status.includes('Failed') ? '#fee2e2' : '#fef9c3',
                          color: ev.status.includes('Joined') || ev.status.includes('Cleared') || ev.status.includes('Approved') ? '#166534' : ev.status.includes('Rejected') || ev.status.includes('Failed') ? '#991b1b' : '#854d0e'
                        }}>
                          {ev.status}
                        </span>

                        <button
                          onClick={() => {
                            setSelectedCandidate(ev.candidate);
                            setIsProfileOpen(true);
                          }}
                          style={{
                            padding: '0.25rem 0.6rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border-light)',
                            backgroundColor: 'var(--bg-surface)',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            color: 'var(--text-primary)'
                          }}
                        >
                          View Candidate
                        </button>
                      </div>
                    </div>
                  ))}

                  {dailyActivityStats.timeline.length === 0 && (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      No candidate movements or actions recorded for this date period.
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* SUB-TAB 3: RECRUITER SCORING                               */}
          {/* ========================================================= */}
          {dashboardSubTab === 'scoring' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* 4 Executive Requirement KPI Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                
                {/* 1. Total Job Requirements */}
                <div className="card" style={{ padding: '1.25rem', borderRadius: '12px', borderLeft: '4px solid #6366f1', display: 'flex', alignItems: 'center', gap: '1.15rem' }}>
                  <div style={{ padding: '0.7rem', borderRadius: '12px', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
                    <Briefcase size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Job Requirements</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                      {positionScoringData.totalRequirements}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.1rem', fontWeight: 600 }}>
                      {positionScoringData.totalOpenings} Total Openings Target
                    </div>
                  </div>
                </div>

                {/* 2. Overall Fulfillment Rate */}
                <div className="card" style={{ padding: '1.25rem', borderRadius: '12px', borderLeft: '4px solid #10b981', display: 'flex', alignItems: 'center', gap: '1.15rem' }}>
                  <div style={{ padding: '0.7rem', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Overall Fulfillment Rate</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                      {positionScoringData.overallFulfillmentRate}%
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#166534', marginTop: '0.1rem', fontWeight: 600 }}>
                      {positionScoringData.totalJoined} Hired / {positionScoringData.totalOpenings} Openings
                    </div>
                  </div>
                </div>

                {/* 3. Requirements Closed / Fulfilled */}
                <div className="card" style={{ padding: '1.25rem', borderRadius: '12px', borderLeft: '4px solid #3b82f6', display: 'flex', alignItems: 'center', gap: '1.15rem' }}>
                  <div style={{ padding: '0.7rem', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                    <Award size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>100% Fulfilled Requirements</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                      {positionScoringData.fulfilledRequirementsCount}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#1e40af', marginTop: '0.1rem', fontWeight: 600 }}>
                      Out of {positionScoringData.totalRequirements} Total Positions
                    </div>
                  </div>
                </div>

                {/* 4. On-Time SLA Delivery % */}
                <div className="card" style={{ padding: '1.25rem', borderRadius: '12px', borderLeft: `4px solid ${positionScoringData.overdueRequirementsCount > 0 ? '#f59e0b' : '#22c55e'}`, display: 'flex', alignItems: 'center', gap: '1.15rem' }}>
                  <div style={{ padding: '0.7rem', borderRadius: '12px', backgroundColor: positionScoringData.overdueRequirementsCount > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)', color: positionScoringData.overdueRequirementsCount > 0 ? '#f59e0b' : '#22c55e' }}>
                    <Clock size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>On-Time SLA Delivery</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                      {positionScoringData.onTimeRate}%
                    </div>
                    <div style={{ fontSize: '0.7rem', color: positionScoringData.overdueRequirementsCount > 0 ? '#b45309' : '#166534', marginTop: '0.1rem', fontWeight: 600 }}>
                      {positionScoringData.overdueRequirementsCount > 0 ? `⚠️ ${positionScoringData.overdueRequirementsCount} Overdue Deadline` : '✅ All Positions Within SLA'}
                    </div>
                  </div>
                </div>

              </div>

              {/* Recruiter Requirement Delivery Scorecards Grid */}
              <div className="card" style={{ padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Award size={18} style={{ color: '#6366f1' }} />
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      Recruiter Requirement Delivery &amp; Fulfillment Scorecards
                    </h3>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Assigned Job Requirements • Openings vs Hired • SLA Compliance
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                  {recruiterMetrics.map(rec => {
                    const recPositions = positionScoringData.allScoredPositions.filter(p => {
                      const pRec = (p.recruiter_assigned || '').trim().toLowerCase();
                      return pRec && (pRec === rec.key || pRec === rec.name.toLowerCase() || (rec.email && pRec === rec.email.toLowerCase()));
                    });
                    const recOpenings = recPositions.reduce((s, p) => s + p.openings, 0);
                    const recJoined = recPositions.reduce((s, p) => s + p.joinedCount, 0);
                    const recFulfillment = recOpenings > 0 ? Math.round((recJoined / recOpenings) * 100) : 0;
                    const recAvgScore = recPositions.length > 0 ? Math.round(recPositions.reduce((s, p) => s + p.totalScore, 0) / recPositions.length) : null;

                    return (
                      <div
                        key={`score-rec-${rec.key}`}
                        style={{
                          padding: '1.15rem',
                          borderRadius: '12px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.85rem',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <div style={{
                              width: '36px', height: '36px', borderRadius: '50%',
                              backgroundColor: '#6366f1', color: '#ffffff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 800, fontSize: '0.88rem'
                            }}>
                              {rec.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {rec.name}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                {rec.branch_code || 'General Staff'}
                              </div>
                            </div>
                          </div>

                          <span style={{
                            fontSize: '0.68rem', padding: '0.2rem 0.55rem', borderRadius: '12px',
                            fontWeight: 700, backgroundColor: 'rgba(99, 102, 241, 0.1)', color: '#4338ca'
                          }}>
                            {recPositions.length} Requirements
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', padding: '0.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', textAlign: 'center' }}>
                          <div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Openings Target</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.1rem' }}>
                              {recOpenings}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Hired / Joined</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#166534', marginTop: '0.1rem' }}>
                              {recJoined}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Health Score</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#4338ca', marginTop: '0.1rem' }}>
                              {recAvgScore !== null ? `${recAvgScore}%` : '—'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            Fulfillment: <strong style={{ color: recFulfillment >= 80 ? '#166534' : '#b45309' }}>{recFulfillment}%</strong>
                          </span>
                          <span style={{
                            fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '10px',
                            fontWeight: 700,
                            backgroundColor: rec.onTrackPct >= 90 ? '#dcfce7' : '#fee2e2',
                            color: rec.onTrackPct >= 90 ? '#166534' : '#991b1b'
                          }}>
                            {rec.onTrackPct}% SLA Compliance
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {recruiterMetrics.length === 0 && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', gridColumn: '1 / -1' }}>
                      No recruiters registered or assigned yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Comprehensive Created Job Requirements Scoring & Fulfillment Leaderboard */}
              <div className="card" style={{ padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Briefcase size={18} style={{ color: '#6366f1' }} /> Created Job Requirements Scoring &amp; Fulfillment Leaderboard
                    </h3>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                      Showing {positionScoringData.filteredPositions.length} of {positionScoringData.totalRequirements} created job requirements ranked by fulfillment rate, pipeline velocity &amp; deadline health.
                    </div>
                  </div>

                  {/* Search, Filter & Sort Controls */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                      <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type="text"
                        placeholder="Search requirement, role, dept..."
                        value={reqSearch}
                        onChange={(e) => setReqSearch(e.target.value)}
                        style={{ padding: '0.45rem 0.6rem 0.45rem 2rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.8rem', minWidth: '200px', backgroundColor: 'var(--bg-surface)' }}
                      />
                    </div>

                    {/* Fulfillment Filter */}
                    <select
                      value={reqFulfillmentFilter}
                      onChange={(e) => setReqFulfillmentFilter(e.target.value)}
                      style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.8rem', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                    >
                      <option value="All">All Requirements</option>
                      <option value="fulfilled">🏆 100% Fulfilled</option>
                      <option value="in_progress">🟡 In Progress</option>
                      <option value="unfilled">⏳ Unfilled (0 Joined)</option>
                      <option value="overdue">🔴 Overdue Deadline</option>
                    </select>

                    {/* Department Filter */}
                    <select
                      value={reqDeptFilter}
                      onChange={(e) => setReqDeptFilter(e.target.value)}
                      style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.8rem', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                    >
                      <option value="All">All Departments</option>
                      {departments.map((d, idx) => (
                        <option key={`req-score-dept-${d}-${idx}`} value={d}>{d}</option>
                      ))}
                    </select>

                    {/* Recruiter Filter */}
                    <select
                      value={reqRecruiterFilter}
                      onChange={(e) => setReqRecruiterFilter(e.target.value)}
                      style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.8rem', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                    >
                      <option value="All">All Recruiters</option>
                      {recruiterMetrics.map(r => (
                        <option key={`req-score-rec-${r.key}`} value={r.name}>{r.name}</option>
                      ))}
                    </select>

                    {/* Sort */}
                    <select
                      value={reqSort}
                      onChange={(e) => setReqSort(e.target.value)}
                      style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.8rem', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                    >
                      <option value="score_desc">Highest Health Score (Top)</option>
                      <option value="score_asc">Lowest Health Score</option>
                      <option value="openings_desc">Most Openings Target</option>
                      <option value="deadline_near">Urgent / Nearing Deadline</option>
                      <option value="title_asc">Position Title (A-Z)</option>
                    </select>
                  </div>
                </div>

                {/* Table */}
                <div style={{ width: '100%', overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '10px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)' }}>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Requirement &amp; Code</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Department &amp; Branch</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Assigned Recruiter</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>Openings vs Hired</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>Candidate Pipeline</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>Target Deadline &amp; SLA</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>Health Score &amp; Grade</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>Stage</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positionScoringData.filteredPositions.map((pos, idx) => {
                        return (
                          <tr 
                            key={pos.id || `req-score-row-${idx}`}
                            style={{ 
                              borderBottom: '1px solid var(--border-light)',
                              backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)',
                              transition: 'background-color 0.15s ease'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)'; }}
                          >
                            {/* Requirement & Code */}
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pos.title}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                {pos.position_code || pos.id}
                              </div>
                            </td>

                            {/* Department & Branch */}
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {pos.department || 'General'}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                {pos.workspace_branch_code || pos.branch_code || 'All Branches'}
                              </div>
                            </td>

                            {/* Assigned Recruiter */}
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {pos.recruiter_assigned || 'Unassigned'}
                              </div>
                            </td>

                            {/* Openings vs Hired Progress */}
                            <td style={{ padding: '0.75rem 1rem', minWidth: '150px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.25rem' }}>
                                <span style={{ fontWeight: 700, color: pos.isFulfilled ? '#166534' : 'var(--text-primary)' }}>
                                  {pos.joinedCount} / {pos.openings} Hired
                                </span>
                                <span style={{ fontWeight: 800, color: pos.isFulfilled ? '#166534' : 'var(--accent-color)' }}>
                                  {pos.fulfillmentPct}%
                                </span>
                              </div>
                              <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ 
                                  width: `${pos.fulfillmentPct}%`, 
                                  height: '100%', 
                                  backgroundColor: pos.isFulfilled ? '#22c55e' : (pos.isOverdue ? '#ef4444' : 'var(--accent-color)'),
                                  borderRadius: '3px',
                                  transition: 'width 0.3s ease'
                                }} />
                              </div>
                            </td>

                            {/* Candidate Pipeline Depth */}
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                <span title="Total Candidates" style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                  👥 {pos.totalApplicants}
                                </span>
                                <span title="Interviewed" style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#e0e7ff', color: '#3730a3', fontWeight: 600 }}>
                                  🎤 {pos.interviewedCount}
                                </span>
                                <span title="Joined" style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#dcfce7', color: '#166534', fontWeight: 700 }}>
                                  ✅ {pos.joinedCount}
                                </span>
                              </div>
                            </td>

                            {/* Target Deadline & SLA */}
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {pos.deadlineFormatted}
                              </div>
                              <div style={{ marginTop: '0.2rem' }}>
                                {pos.isFulfilled ? (
                                  <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '10px', backgroundColor: '#dcfce7', color: '#166534', fontWeight: 700 }}>
                                    ✓ Fulfilled
                                  </span>
                                ) : pos.isOverdue ? (
                                  <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '10px', backgroundColor: '#fee2e2', color: '#991b1b', fontWeight: 700 }}>
                                    ⚠️ Overdue ({Math.abs(pos.daysRemaining || 0)}d)
                                  </span>
                                ) : pos.daysRemaining !== null ? (
                                  <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '10px', backgroundColor: '#fef3c7', color: '#b45309', fontWeight: 700 }}>
                                    ⏳ {pos.daysRemaining} days left
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                                    Ongoing
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Health Score & Grade */}
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.55rem', borderRadius: '12px', backgroundColor: pos.gradeBg, color: pos.gradeColor, fontWeight: 700, fontSize: '0.72rem' }}>
                                <span>{pos.gradeIcon}</span>
                                <span>{pos.grade}</span>
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem', fontWeight: 600 }}>
                                Score: {pos.totalScore} / 100
                              </div>
                            </td>

                            {/* Stage */}
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                              <span style={{
                                fontSize: '0.7rem', padding: '0.2rem 0.45rem', borderRadius: '6px',
                                backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', fontWeight: 700
                              }}>
                                {pos.status || 'S01'}
                              </span>
                            </td>

                            {/* Action */}
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                              <button
                                onClick={() => {
                                  setSelectedPositionForDetails(pos);
                                  setIsPositionDetailsOpen(true);
                                }}
                                style={{
                                  padding: '0.35rem 0.75rem',
                                  borderRadius: '6px',
                                  border: '1px solid var(--accent-color)',
                                  backgroundColor: 'rgba(99, 102, 241, 0.08)',
                                  color: 'var(--accent-color)',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                View Requirement
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {positionScoringData.filteredPositions.length === 0 && (
                        <tr>
                          <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            No job requirements found matching the scoring filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </div>
      ) : selectedStage === 'S00' || selectedStage === 'S01' ? (
        /* ==================== TAB: JOB POSITIONS ==================== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
          
          {/* Top Search & Filter Bar with Status & Priority Count Pills */}
          <div className="card" style={{ padding: '0.85rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--bg-surface)' }}>
            
            {/* Top Row: Search & Dropdowns */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input 
                  type="text" 
                  placeholder="Search openings by role, position code (POS-xxxx), department, recruiter..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ padding: '0.45rem 2rem 0.45rem 2rem', borderRadius: '8px', border: '1px solid var(--border-light)', width: '100%', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
                {searchTerm && (
                  <button 
                    type="button"
                    onClick={() => setSearchTerm('')} 
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '180px' }}>
                <Filter size={15} style={{ color: 'var(--text-secondary)' }} />
                <select 
                  value={selectedPositionFilter} 
                  onChange={e => setSelectedPositionFilter(e.target.value)} 
                  style={{ padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', width: '100%', fontSize: '0.83rem', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                >
                  <option value="All">All Job Positions</option>
                  {positions.map(p => {
                    const posCode = formatPositionCode(p);
                    return (
                      <option key={p.id} value={p.id}>
                        {posCode ? `[${posCode}] ` : ''}{p.title} ({p.department})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '170px' }}>
                <Users size={15} style={{ color: 'var(--text-secondary)' }} />
                <select 
                  value={selectedRecruiterFilter} 
                  onChange={e => setSelectedRecruiterFilter(e.target.value)} 
                  style={{ padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', width: '100%', fontSize: '0.83rem', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                >
                  <option value="All">All Recruiters ({recruitersList.length})</option>
                  {recruitersList.map((r, idx) => {
                    const recVal = r.emp_name || r.name || r.email;
                    const displayName = r.emp_name
                      ? (r.emp_id && !r.emp_name.includes(r.emp_id) ? `${r.emp_name} (${r.emp_id})` : r.emp_name)
                      : (r.name || r.email);
                    return (
                      <option key={r.id || r.user_id || `pos-rec-${idx}`} value={recVal}>
                        👤 {displayName}
                      </option>
                    );
                  })}
                </select>
              </div>

              {isAnyCandidateFilterActive && (
                <button 
                  type="button"
                  onClick={handleClearCandidateFilters} 
                  style={{ 
                    padding: '0.45rem 0.85rem', borderRadius: '8px', 
                    border: '1px solid var(--border-light)', background: 'var(--bg-surface-variant)', 
                    color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, 
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' 
                  }}
                  title="Reset all active filters"
                >
                  <RotateCcw size={13} /> Reset
                </button>
              )}

              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                Showing <strong>{filteredPositions.length}</strong> of {stagePositionsPool.length} openings
              </div>
            </div>

            {/* Bottom Row: Status / Urgency Count Pills */}
            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.15rem', alignItems: 'center', scrollbarWidth: 'thin' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                Status / Priority:
              </span>
              
              {/* All Openings / Requirements Pill */}
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('All')}
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: '20px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  border: selectedStatusFilter === 'All' ? '1px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                  background: selectedStatusFilter === 'All' ? 'var(--accent-color, #2563eb)' : 'var(--bg-surface-variant, #f8fafc)',
                  color: selectedStatusFilter === 'All' ? '#ffffff' : 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{selectedStage === 'S00' ? 'All Requirements' : 'All Openings'}</span>
                <span style={{
                  padding: '0.1rem 0.45rem',
                  borderRadius: '10px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  background: selectedStatusFilter === 'All' ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface, #fff)',
                  color: selectedStatusFilter === 'All' ? '#ffffff' : 'var(--text-secondary)'
                }}>
                  {stagePositionsPool.length}
                </span>
              </button>

              {/* S01 Specific Posting Status Pills */}
              {selectedStage === 'S01' ? (
                <>
                  {[
                    { key: 'Posted', label: '🟢 Posted / Live', color: '#16a34a' },
                    { key: 'Draft', label: '🟡 Draft JD', color: '#ca8a04' },
                    { key: 'Paused', label: '🟠 Paused', color: '#ea580c' },
                    { key: 'Closed', label: '🔴 Closed / Fulfilled', color: '#dc2626' }
                  ].map(opt => {
                    const count = stagePositionsPool.filter(pos => {
                      const posJoinedCount = candidates.filter(c => c.position_id === pos.id && (c.current_stage === 'S09' || c.current_stage >= 'S09')).length;
                      const posOpenings = parseInt(pos.openings, 10) || 1;
                      const isAutoClosed = posJoinedCount >= posOpenings;
                      const effectiveStatus = isAutoClosed ? 'Closed' : (pos.posting_status || 'Draft');
                      return effectiveStatus === opt.key;
                    }).length;

                    const isActive = selectedStatusFilter === opt.key;

                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setSelectedStatusFilter(curr => curr === opt.key ? 'All' : opt.key)}
                        style={{
                          padding: '0.3rem 0.75rem',
                          borderRadius: '20px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          border: isActive ? `1px solid ${opt.color}` : '1px solid var(--border-light)',
                          background: isActive ? opt.color : 'var(--bg-surface-variant, #f8fafc)',
                          color: isActive ? '#ffffff' : 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{opt.label}</span>
                        <span style={{
                          padding: '0.1rem 0.45rem',
                          borderRadius: '10px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface, #fff)',
                          color: isActive ? '#ffffff' : 'var(--text-secondary)'
                        }}>
                          {count}
                        </span>
                      </button>
                    );
                  })}

                  <div style={{ width: '1px', height: '16px', background: 'var(--border-light)', margin: '0 0.2rem' }} />

                  {/* S01 Secondary Urgency & Assignment Pills */}
                  {[
                    { key: '🔴 High Urgency', label: 'High Urgency', color: '#ef4444' },
                    { key: 'Assigned', label: '👤 Assigned', color: '#3b82f6' },
                    { key: 'Unassigned', label: '⚠️ Unassigned', color: '#64748b' }
                  ].map(opt => {
                    const count = stagePositionsPool.filter(pos => {
                      if (opt.key === 'Assigned') return Boolean(pos.recruiter_assigned && pos.recruiter_assigned !== 'All');
                      if (opt.key === 'Unassigned') return !pos.recruiter_assigned || pos.recruiter_assigned === 'All';
                      return (pos.urgency || '') === opt.key;
                    }).length;

                    const isActive = selectedStatusFilter === opt.key;

                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setSelectedStatusFilter(curr => curr === opt.key ? 'All' : opt.key)}
                        style={{
                          padding: '0.3rem 0.75rem',
                          borderRadius: '20px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          border: isActive ? `1px solid ${opt.color}` : '1px solid var(--border-light)',
                          background: isActive ? opt.color : 'var(--bg-surface-variant, #f8fafc)',
                          color: isActive ? '#ffffff' : 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{opt.label}</span>
                        <span style={{
                          padding: '0.1rem 0.45rem',
                          borderRadius: '10px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface, #fff)',
                          color: isActive ? '#ffffff' : 'var(--text-secondary)'
                        }}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </>
              ) : (
                /* S00 Specific Priority & Assignment Pills */
                <>
                  {[
                    { key: '🔴 High Urgency', label: 'High Urgency', color: '#ef4444' },
                    { key: '🟡 Medium Priority', label: 'Medium Priority', color: '#f59e0b' },
                    { key: '🟢 Normal', label: 'Normal Priority', color: '#10b981' },
                    { key: 'Assigned', label: '👤 Assigned', color: '#3b82f6' },
                    { key: 'Unassigned', label: '⚠️ Unassigned', color: '#64748b' }
                  ].map(opt => {
                    const count = stagePositionsPool.filter(pos => {
                      if (opt.key === 'Assigned') return Boolean(pos.recruiter_assigned && pos.recruiter_assigned !== 'All');
                      if (opt.key === 'Unassigned') return !pos.recruiter_assigned || pos.recruiter_assigned === 'All';
                      return (pos.urgency || '') === opt.key;
                    }).length;

                    const isActive = selectedStatusFilter === opt.key;

                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setSelectedStatusFilter(curr => curr === opt.key ? 'All' : opt.key)}
                        style={{
                          padding: '0.3rem 0.75rem',
                          borderRadius: '20px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          border: isActive ? `1px solid ${opt.color}` : '1px solid var(--border-light)',
                          background: isActive ? opt.color : 'var(--bg-surface-variant, #f8fafc)',
                          color: isActive ? '#ffffff' : 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{opt.label}</span>
                        <span style={{
                          padding: '0.1rem 0.45rem',
                          borderRadius: '10px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface, #fff)',
                          color: isActive ? '#ffffff' : 'var(--text-secondary)'
                        }}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>

          </div>

          {/* Job Positions Table Wrapper */}
          <div style={{ width: '100%', overflow: 'auto', maxHeight: 'calc(100vh - 310px)', minHeight: '380px', backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', position: 'relative' }}>
          {filteredPositions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <h3>No Job Openings in this stage</h3>
              <p>Either create a new position or shift existing positions to change their status.</p>
            </div>
          ) : (
            <MobileTableView id="Recruiter/RecruiterDashboard-1" hideToggle={true} view={recruiterTableView}><table style={{ width: '100%', minWidth: `${getPosTotalTableWidth()}px`, borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)' }}>
                <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ width: `${posColWidths.actions || 140}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Actions</span>
                    </div>
                    <ColumnResizer colKey="actions" isResizing={posResizingCol === 'actions'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.title}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Job Title</span>
                    </div>
                    <ColumnResizer colKey="title" isResizing={posResizingCol === 'title'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.position_id}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Position Code</span>
                    </div>
                    <ColumnResizer colKey="position_id" isResizing={posResizingCol === 'position_id'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.department}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Department</span>
                    </div>
                    <ColumnResizer colKey="department" isResizing={posResizingCol === 'department'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.branch || 180}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Branch / Plant</span>
                    </div>
                    <ColumnResizer colKey="branch" isResizing={posResizingCol === 'branch'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.openings}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Openings</span>
                    </div>
                    <ColumnResizer colKey="openings" isResizing={posResizingCol === 'openings'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.salary}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Salary Range</span>
                    </div>
                    <ColumnResizer colKey="salary" isResizing={posResizingCol === 'salary'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.status}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Stage</span>
                    </div>
                    <ColumnResizer colKey="status" isResizing={posResizingCol === 'status'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.posting_status || 160}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>{selectedStage === 'S01' ? '📢 Posting Status' : 'Requirement Status'}</span>
                    </div>
                    <ColumnResizer colKey="posting_status" isResizing={posResizingCol === 'posting_status'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.posting_sources || 220}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>{selectedStage === 'S01' ? '🌐 Posting Channels' : 'Stage Details / Remarks'}</span>
                    </div>
                    <ColumnResizer colKey="posting_sources" isResizing={posResizingCol === 'posting_sources'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.jd}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Job Description (JD)</span>
                    </div>
                    <ColumnResizer colKey="jd" isResizing={posResizingCol === 'jd'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  {selectedStage === 'S01' && (
                    <th style={{ width: `${posColWidths.apply_link}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>🔗 Apply Link</span>
                      </div>
                      <ColumnResizer colKey="apply_link" isResizing={posResizingCol === 'apply_link'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                    </th>
                  )}
                  <th style={{ width: `${posColWidths.deadline}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Deadline</span>
                    </div>
                    <ColumnResizer colKey="deadline" isResizing={posResizingCol === 'deadline'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.planned_tat || 155}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>⏱️ Planned Target (IST)</span>
                    </div>
                    <ColumnResizer colKey="planned_tat" isResizing={posResizingCol === 'planned_tat'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.actual_logged || 155}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>📅 Actual Logged (IST)</span>
                    </div>
                    <ColumnResizer colKey="actual_logged" isResizing={posResizingCol === 'actual_logged'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.delay_status || 145}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>⚡ Delay Status</span>
                    </div>
                    <ColumnResizer colKey="delay_status" isResizing={posResizingCol === 'delay_status'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.interviewer}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Interviewer</span>
                    </div>
                    <ColumnResizer colKey="interviewer" isResizing={posResizingCol === 'interviewer'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.recruiter}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>🎯 Recruiter Assigned</span>
                    </div>
                    <ColumnResizer colKey="recruiter" isResizing={posResizingCol === 'recruiter'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                  <th style={{ width: `${posColWidths.created_by}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                      <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Created By</span>
                    </div>
                    <ColumnResizer colKey="created_by" isResizing={posResizingCol === 'created_by'} onResizeStart={handlePosResizeStart} onReset={resetPosColWidth} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedPositions.map(pos => {
                  const posDeadlineObj = pos.deadline_date ? new Date(pos.deadline_date) : null;
                  const posCreatedObj = pos.created_at ? new Date(pos.created_at) : null;
                  const posPlannedObj = posDeadlineObj || (posCreatedObj ? new Date(posCreatedObj.getTime() + (24 * 60 * 60 * 1000)) : null);
                  const posActualObj = pos.updated_at ? new Date(pos.updated_at) : posCreatedObj;
                  const posPlannedStr = formatISTDateTime(posPlannedObj) || (pos.deadline_date ? new Date(pos.deadline_date).toLocaleDateString() : 'N/A');
                  const posActualStr = formatISTDateTime(posActualObj) || 'N/A';
                  const posDelay = getSlaDelayInfo(posPlannedObj, pos.status === 'S01' ? posActualObj : null);

                  return (
                    <tr key={pos.id} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background-color 0.2s' }}>
                      <td style={{ width: `${posColWidths.actions || 140}px`, padding: '0.65rem 0.75rem', textAlign: 'center', boxSizing: 'border-box', verticalAlign: 'top' }}>
                        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem', justifyContent: 'center' }}>
                          {/* 👁️ Position Details */}
                          <button
                            onClick={() => { setSelectedPositionForDetails(pos); setIsPositionDetailsOpen(true); }}
                            title="👁️ View Full Position Specs & Linked Applicants"
                            style={{
                              padding: '0.35rem 0.55rem', borderRadius: '6px',
                              border: '1px solid var(--border-light)', background: 'var(--bg-surface)',
                              cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1
                            }}
                          >
                            👁️
                          </button>

                          {/* 👤+ Add Candidate */}
                          <button
                            onClick={() => handleOpenAddCandidateForPosition(pos)}
                            title="👤+ Add Candidate for this Job Opening"
                            style={{
                              padding: '0.35rem 0.55rem', borderRadius: '6px',
                              border: '1px solid #10b981', background: '#ecfdf5',
                              color: '#065f46', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1
                            }}
                          >
                            👤+
                          </button>

                          {/* ✏️ Edit */}
                          <button
                            onClick={() => handleOpenEditPosition(pos)}
                            disabled={!canEditStage(pos.status)}
                            title="✏️ Edit Position"
                            style={{
                              padding: '0.35rem 0.55rem', borderRadius: '6px',
                              border: '1px solid #6366f1', background: 'var(--bg-surface)',
                              cursor: !canEditStage(pos.status) ? 'not-allowed' : 'pointer',
                              opacity: !canEditStage(pos.status) ? 0.5 : 1,
                              fontSize: '0.85rem', lineHeight: 1
                            }}
                          >
                            ✏️
                          </button>

                          {/* 🙋 Claim / 🔓 Release */}
                          {(!pos.recruiter_assigned || pos.recruiter_assigned === 'All') ? (
                            <button
                              onClick={() => handleClaimPosition(pos.id)}
                              disabled={!canEditStage(pos.status)}
                              title="🙋 Claim this Position"
                              style={{
                                padding: '0.35rem 0.55rem', borderRadius: '6px',
                                border: '1px solid #10b981', background: '#10b981',
                                color: 'white', cursor: !canEditStage(pos.status) ? 'not-allowed' : 'pointer',
                                opacity: !canEditStage(pos.status) ? 0.5 : 1,
                                fontSize: '0.85rem', lineHeight: 1
                              }}
                            >
                              🙋
                            </button>
                          ) : (pos.recruiter_assigned?.toLowerCase().trim() === (userName || '').toLowerCase().trim()) ? (
                            <button
                              onClick={() => { setSelectedPositionForDetails(pos); setIsPositionDetailsOpen(true); }}
                              disabled={!canEditStage(pos.status)}
                              title="🔓 Release Position back to Open Pool"
                              style={{
                                padding: '0.35rem 0.55rem', borderRadius: '6px',
                                border: '1px solid #f97316', background: '#fff7ed',
                                color: '#c2410c', cursor: !canEditStage(pos.status) ? 'not-allowed' : 'pointer',
                                opacity: !canEditStage(pos.status) ? 0.5 : 1,
                                fontSize: '0.85rem', lineHeight: 1
                              }}
                            >
                              🔓
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ width: `${posColWidths.title}px`, padding: '0.85rem 1rem', fontSize: '0.85rem', color: 'var(--text-primary)', boxSizing: 'border-box', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <span style={{ fontWeight: 700 }} title={pos.title}>{pos.title}</span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                            {pos.urgency && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.12rem 0.35rem', borderRadius: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                                {pos.urgency}
                              </span>
                            )}
                            {pos.job_type && (
                              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', padding: '0.12rem 0.35rem', borderRadius: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                                💼 {pos.job_type}
                              </span>
                            )}
                            {pos.vacancy_reason && (
                              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', padding: '0.12rem 0.35rem', borderRadius: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                                🏷️ {pos.vacancy_reason}
                              </span>
                            )}
                            {pos.experience_required && pos.experience_required !== 'Any Experience' && (
                              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', padding: '0.12rem 0.35rem', borderRadius: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                                ⏳ {pos.experience_required}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ width: `${posColWidths.position_id}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-secondary)', boxSizing: 'border-box', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', overflow: 'hidden' }}>
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={`Full ID: ${pos.id}`}>{pos.id ? `POS-${pos.id.substring(0, 8).toUpperCase()}` : 'N/A'}</span>
                          {pos.id && (
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`POS-${pos.id.substring(0, 8).toUpperCase()}`);
                                alert('Position Code copied!');
                              }}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.25rem',
                                color: 'var(--text-secondary)', fontSize: '0.75rem', flexShrink: 0
                              }}
                              title="Copy Position Code"
                            >
                              📋
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ width: `${posColWidths.department}px`, padding: '0.85rem 1rem', fontSize: '0.85rem', color: 'var(--text-primary)', boxSizing: 'border-box', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, verticalAlign: 'top' }} title={pos.department}>{pos.department}</td>
                      <td style={{ width: `${posColWidths.branch || 200}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', boxSizing: 'border-box', whiteSpace: 'normal', wordBreak: 'break-word', verticalAlign: 'top' }}>
                        {(() => {
                          const rawVal = pos.branch_code || pos.workspace_branch_code || pos.company || '';
                          if (!rawVal || rawVal === 'All Branches') {
                            return (
                              <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', fontSize: '0.75rem', fontWeight: 600 }}>
                                All Branches
                              </span>
                            );
                          }
                          const standardStr = formatBranchStandard(rawVal, availableBranches);
                          const parts = standardStr.includes(' — ') ? standardStr.split(' — ') : [standardStr, ''];
                          const branchCode = parts[0];
                          const branchName = parts[1] || branchCode;

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }} title={standardStr}>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.82rem', lineHeight: 1.25, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                {branchName}
                              </span>
                              <span style={{ display: 'inline-block', width: 'fit-content', fontSize: '0.68rem', fontFamily: 'monospace', color: 'var(--text-secondary)', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                                {branchCode}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{ width: `${posColWidths.openings}px`, padding: '0.85rem 1rem', fontSize: '0.85rem', color: 'var(--text-primary)', boxSizing: 'border-box', verticalAlign: 'top' }}>{pos.openings}</td>
                      <td style={{ width: `${posColWidths.salary}px`, padding: '0.85rem 1rem', fontSize: '0.85rem', color: 'var(--text-primary)', boxSizing: 'border-box', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, verticalAlign: 'top' }}>
                        {pos.salary_min || pos.salary_max ? (
                          <span title={`${pos.salary_min ? `₹${pos.salary_min.toLocaleString('en-IN')}` : '0'} - ${pos.salary_max ? `₹${pos.salary_max.toLocaleString('en-IN')}` : 'Any'} / month`}>
                            {pos.salary_min ? `₹${pos.salary_min.toLocaleString('en-IN')}` : '0'} - {pos.salary_max ? `₹${pos.salary_max.toLocaleString('en-IN')}` : 'Any'} / month
                          </span>
                        ) : (
                          <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>Not Disclosed</span>
                        )}
                      </td>
                      {/* 8. Stage */}
                      <td style={{ width: `${posColWidths.status}px`, padding: '0.85rem 1rem', fontSize: '0.85rem', boxSizing: 'border-box', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <span style={{ 
                            fontSize: '0.7rem', 
                            padding: '0.2rem 0.5rem', 
                            borderRadius: '12px', 
                            fontWeight: 'bold',
                            background: pos.status === 'S00' ? '#fee2e2' : '#dcfce7',
                            color: pos.status === 'S00' ? '#991b1b' : '#166534',
                            display: 'inline-block',
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            lineHeight: 1.25,
                            textAlign: 'center'
                          }}>
                            {pos.status === 'S00' ? 'S00: Requirement' : 'S01: Posted & Active'}
                          </span>

                          {/* Live Applicants Funnel Badge */}
                          {(() => {
                            const appCount = candidates.filter(c => c.position_id === pos.id).length;
                            return (
                              <button
                                onClick={() => {
                                  setSelectedPositionForDetails(pos);
                                  setIsPositionDetailsOpen(true);
                                }}
                                title="Click to view applicants in details"
                                style={{
                                  fontSize: '0.68rem', padding: '0.12rem 0.4rem', borderRadius: '8px',
                                  background: appCount > 0 ? '#eff6ff' : 'var(--bg-primary)',
                                  color: appCount > 0 ? '#1d4ed8' : 'var(--text-secondary)',
                                  border: '1px solid var(--border-light)', cursor: 'pointer', fontWeight: 600,
                                  display: 'inline-flex', alignItems: 'center', gap: '0.2rem'
                                }}
                              >
                                👥 {appCount} {appCount === 1 ? 'Applicant' : 'Applicants'}
                              </button>
                            );
                          })()}
                        </div>
                      </td>

                      {/* 9. Stage Status (Posting Status in S01 / Requirement Status in S00) */}
                      <td style={{ width: `${posColWidths.posting_status || 160}px`, padding: '0.75rem 0.85rem', fontSize: '0.8rem', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                        {selectedStage === 'S01' ? (() => {
                          const posJoinedCount = candidates.filter(c => c.position_id === pos.id && (c.current_stage === 'S09' || c.current_stage >= 'S09')).length;
                          const posOpenings = parseInt(pos.openings, 10) || 1;
                          const isAutoClosed = posJoinedCount >= posOpenings;
                          const effectiveStatus = isAutoClosed ? 'Closed' : (pos.posting_status || 'Draft');

                          const bg = effectiveStatus === 'Posted' ? '#f0fdf4' : effectiveStatus === 'Closed' ? '#fef2f2' : effectiveStatus === 'Paused' ? '#fff7ed' : '#fefce8';
                          const border = effectiveStatus === 'Posted' ? '1px solid #86efac' : effectiveStatus === 'Closed' ? '1px solid #fca5a5' : effectiveStatus === 'Paused' ? '1px solid #fed7aa' : '1px solid #fde047';
                          const color = effectiveStatus === 'Posted' ? '#15803d' : effectiveStatus === 'Closed' ? '#b91c1c' : effectiveStatus === 'Paused' ? '#c2410c' : '#a16207';
                          const dotColor = effectiveStatus === 'Posted' ? '#22c55e' : effectiveStatus === 'Closed' ? '#ef4444' : effectiveStatus === 'Paused' ? '#f97316' : '#eab308';
                          const label = effectiveStatus === 'Posted' ? 'Posted' : effectiveStatus === 'Closed' ? 'Closed' : effectiveStatus === 'Paused' ? 'Paused' : 'Draft';

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.25rem 0.65rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: bg,
                                color: color,
                                border: border,
                                width: 'fit-content',
                                whiteSpace: 'nowrap'
                              }}>
                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} />
                                {label}
                              </span>
                              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: isAutoClosed ? '#b91c1c' : 'var(--text-secondary)' }}>
                                {isAutoClosed ? (
                                  <span>🎉 {posJoinedCount}/{posOpenings} Fulfilled (Closed)</span>
                                ) : (
                                  <span>🎯 {posJoinedCount}/{posOpenings} Joined</span>
                                )}
                              </div>
                            </div>
                          );
                        })() : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            whiteSpace: 'nowrap'
                          }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563eb', flexShrink: 0 }} />
                            Requirement Open
                          </span>
                        )}
                      </td>

                      {/* 10. Stage Details / Remarks (Posting Channels in S01 / Vacancy Details in S00) */}
                      <td style={{ width: `${posColWidths.posting_sources || 220}px`, padding: '0.75rem 0.85rem', fontSize: '0.8rem', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                        {selectedStage === 'S01' ? (() => {
                          const sources = Array.isArray(pos.posting_sources) ? pos.posting_sources : [];
                          return (
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              {sources.length > 0 ? (
                                <>
                                  {sources.slice(0, 3).map((src, i) => (
                                    <span key={i} style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#e0e7ff', color: '#3730a3', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                      {src}
                                    </span>
                                  ))}
                                  {sources.length > 3 && (
                                    <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600 }} title={sources.slice(3).join(', ')}>
                                      +{sources.length - 3} more
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                  No channels tagged
                                </span>
                              )}
                            </div>
                          );
                        })() : (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                            <div>🏷️ {pos.vacancy_reason || 'New Position'}</div>
                            <div style={{ fontSize: '0.7rem' }}>💼 {pos.job_type || 'Full Time'}</div>
                          </div>
                        )}
                      </td>

                      {/* 11. Job Description (JD) */}
                      <td style={{ width: `${posColWidths.jd}px`, padding: '0.75rem 0.85rem', fontSize: '0.8rem', color: 'var(--text-secondary)', boxSizing: 'border-box', verticalAlign: 'top', lineHeight: 1.35 }}>
                        {pos.jd_text ? (
                          <div>
                            <div style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxHeight: '4.2em',
                              whiteSpace: 'pre-line',
                              wordBreak: 'break-word',
                              lineHeight: 1.35
                            }} title={pos.jd_text}>
                              {pos.jd_text}
                            </div>
                            {pos.jd_text.length > 70 && (
                              <button
                                onClick={() => setSelectedJdPosition(pos)}
                                style={{
                                  marginTop: '0.35rem',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border-light)',
                                  background: 'var(--bg-primary)',
                                  color: 'var(--accent-color, #2563eb)',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem'
                                }}
                                title="👁️ View Full Job Description"
                              >
                                👁️ View More
                              </button>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontStyle: 'italic', color: '#c2410c' }}>⚠️ No JD logged — please edit.</span>
                        )}
                      </td>

                      {/* 12. Apply Link (S01 only) */}
                      {selectedStage === 'S01' && (
                        <td style={{ width: `${posColWidths.apply_link}px`, padding: '0.85rem 1rem', fontSize: '0.85rem', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <button
                              onClick={() => handleCopyApplyLink(pos.id)}
                              style={{
                                fontSize: '0.72rem', padding: '0.3rem 0.6rem', borderRadius: '6px',
                                border: '1px solid var(--accent-color)',
                                background: copiedPosId === pos.id ? '#10b981' : 'var(--accent-color)',
                                borderColor: copiedPosId === pos.id ? '#10b981' : 'var(--accent-color)',
                                cursor: 'pointer', fontWeight: 600, color: 'white', display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                transition: 'all 0.2s'
                              }}
                              title="Copy application link"
                            >
                              {copiedPosId === pos.id ? 'Copied! ✓' : 'Copy'}
                            </button>
                            <a 
                              href={`/apply/${pos.id}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              style={{ color: 'var(--accent-color)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600 }}
                            >
                              Open ↗
                            </a>
                          </div>
                        </td>
                      )}

                      {/* 13. Deadline */}
                      <td style={{ width: `${posColWidths.deadline}px`, padding: '0.85rem 1rem', fontSize: '0.85rem', color: 'var(--text-primary)', boxSizing: 'border-box', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                        {pos.deadline_date ? new Date(pos.deadline_date).toLocaleDateString() : <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>None</span>}
                      </td>

                      {/* 14. Planned TAT */}
                      <td style={{ width: `${posColWidths.planned_tat || 155}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-primary)', boxSizing: 'border-box', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600 }}>{posPlannedStr}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Target Deadline</div>
                      </td>

                      {/* 15. Actual Logged */}
                      <td style={{ width: `${posColWidths.actual_logged || 155}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-primary)', boxSizing: 'border-box', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600 }}>{posActualStr}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>IST Entry</div>
                      </td>

                      {/* 16. Delay Status */}
                      <td style={{ width: `${posColWidths.delay_status || 145}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', boxSizing: 'border-box', verticalAlign: 'top' }}>
                        <span style={{ 
                          display: 'inline-block', 
                          padding: '0.2rem 0.55rem', 
                          borderRadius: '12px', 
                          fontWeight: 'bold', 
                          fontSize: '0.72rem', 
                          background: posDelay.bg, 
                          color: posDelay.color,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          lineHeight: 1.25
                        }}>
                          {posDelay.badgeText}
                        </span>
                      </td>

                      {/* 17. Interviewer */}
                      <td style={{ width: `${posColWidths.interviewer}px`, padding: '0.85rem 1rem', fontSize: '0.85rem', color: 'var(--text-primary)', boxSizing: 'border-box', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, verticalAlign: 'top' }} title={pos.interviewer_name || 'Not Assigned'}>
                        {pos.interviewer_name || <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>Not Assigned</span>}
                      </td>

                      {/* 18. Recruiter Assigned */}
                      <td style={{ width: `${posColWidths.recruiter}px`, padding: '0.85rem 1rem', fontSize: '0.85rem', boxSizing: 'border-box', verticalAlign: 'top' }}>
                        {pos.recruiter_assigned && pos.recruiter_assigned !== 'All' ? (
                          <span style={{ 
                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                            padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 600,
                            background: '#dbeafe', color: '#1e40af', fontSize: '0.75rem',
                            maxWidth: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25
                          }} title={pos.recruiter_assigned}>👤 {pos.recruiter_assigned}</span>
                        ) : (
                          <span style={{ 
                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                            padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 600,
                            background: '#fef9c3', color: '#854d0e', fontSize: '0.75rem',
                            whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25
                          }}>📢 All Recruiters</span>
                        )}
                      </td>
                    <td style={{ width: `${posColWidths.created_by}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pos.created_by || 'System'}>{pos.created_by || 'System'}</td>
                  </tr>
                );
              })}
              </tbody>
            </table></MobileTableView>
          )}
          </div>

          {/* Standard Bottom Table Pagination for Positions (S00 & S01) */}
          {filteredPositions.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <StandardTablePagination
                currentPage={validPositionPage}
                totalRecords={filteredPositions.length}
                pageSize={pageSize === 'All' ? 100000 : Number(pageSize)}
                onPageChange={(p) => setCurrentPage(p)}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
              />
            </div>
          )}
        </div>
      ) : (
        /* ==================== TAB: CANDIDATE PIPELINE ==================== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
          
          {/* Top Search & Filter Card with Dynamic Status Count Pills */}
          <div className="card" style={{ padding: '0.85rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--bg-surface)' }}>
            
            {/* Top Row: Main Search & Dropdowns */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input 
                  type="text" 
                  placeholder="Search candidate by name, phone, email, candidate code (POS-xxxx-xxx)..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ padding: '0.45rem 2rem 0.45rem 2rem', borderRadius: '8px', border: '1px solid var(--border-light)', width: '100%', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
                {searchTerm && (
                  <button 
                    type="button"
                    onClick={() => setSearchTerm('')} 
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '180px' }}>
                <Filter size={15} style={{ color: 'var(--text-secondary)' }} />
                <select 
                  value={selectedPositionFilter} 
                  onChange={e => setSelectedPositionFilter(e.target.value)} 
                  style={{ padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', width: '100%', fontSize: '0.83rem', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                >
                  <option value="All">All Job Positions</option>
                  {positions.map(p => {
                    const posCode = formatPositionCode(p);
                    return (
                      <option key={p.id} value={p.id}>
                        {posCode ? `[${posCode}] ` : ''}{p.title} ({p.department})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '170px' }}>
                <Users size={15} style={{ color: 'var(--text-secondary)' }} />
                <select 
                  value={selectedRecruiterFilter} 
                  onChange={e => setSelectedRecruiterFilter(e.target.value)} 
                  style={{ padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', width: '100%', fontSize: '0.83rem', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                >
                  <option value="All">All Recruiters ({recruitersList.length})</option>
                  {recruitersList.map((r, idx) => {
                    const recVal = r.emp_name || r.name || r.email;
                    const displayName = r.emp_name
                      ? (r.emp_id && !r.emp_name.includes(r.emp_id) ? `${r.emp_name} (${r.emp_id})` : r.emp_name)
                      : (r.name || r.email);
                    return (
                      <option key={r.id || r.user_id || `cand-rec-${idx}`} value={recVal}>
                        👤 {displayName}
                      </option>
                    );
                  })}
                </select>
              </div>

              {isAnyCandidateFilterActive && (
                <button 
                  type="button"
                  onClick={handleClearCandidateFilters} 
                  style={{ 
                    padding: '0.45rem 0.85rem', borderRadius: '8px', 
                    border: '1px solid var(--border-light)', background: 'var(--bg-surface-variant)', 
                    color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, 
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' 
                  }}
                  title="Reset all active filters"
                >
                  <RotateCcw size={13} /> Reset
                </button>
              )}

              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                Showing <strong>{filteredCandidates.length}</strong> of {stageCandidatesPool.length} applicants
              </div>
            </div>

            {/* Bottom Row: Stage-Wise Status Count Pills (Click-to-Filter) */}
            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.15rem', alignItems: 'center', scrollbarWidth: 'thin' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                {selectedStage === 'all_stages' ? 'Filter By Stage:' : 'Stage Statuses:'}
              </span>

              {selectedStage === 'all_stages' ? (
                <>
                  {/* All Stages Pill */}
                  <button
                    type="button"
                    onClick={() => setSelectedAllStagesPillFilter('All')}
                    style={{
                      padding: '0.3rem 0.75rem',
                      borderRadius: '20px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      border: selectedAllStagesPillFilter === 'All' ? '1px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                      background: selectedAllStagesPillFilter === 'All' ? 'var(--accent-color, #2563eb)' : 'var(--bg-surface-variant, #f8fafc)',
                      color: selectedAllStagesPillFilter === 'All' ? '#ffffff' : 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>All Stages</span>
                    <span style={{
                      padding: '0.1rem 0.45rem',
                      borderRadius: '10px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      background: selectedAllStagesPillFilter === 'All' ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface, #fff)',
                      color: selectedAllStagesPillFilter === 'All' ? '#ffffff' : 'var(--text-secondary)'
                    }}>
                      {stageCandidatesPool.length}
                    </span>
                  </button>

                  {/* Each Stage Pill (S02 - S12) */}
                  {CANDIDATE_STAGES.map(st => {
                    const count = candidates.filter(c => c.current_stage === st.id).length;
                    const isActive = selectedAllStagesPillFilter === st.id;
                    const shortName = st.label ? st.label.replace(/^S\d+\s*[—–-]\s*/, '') : (st.name || st.id);

                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setSelectedAllStagesPillFilter(curr => curr === st.id ? 'All' : st.id)}
                        style={{
                          padding: '0.3rem 0.75rem',
                          borderRadius: '20px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          border: isActive ? '1px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                          background: isActive ? 'var(--accent-color, #2563eb)' : 'var(--bg-surface-variant, #f8fafc)',
                          color: isActive ? '#ffffff' : 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span style={{ opacity: 0.85 }}>{st.id}:</span>
                        <span>{shortName}</span>
                        <span style={{
                          padding: '0.1rem 0.45rem',
                          borderRadius: '10px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface, #fff)',
                          color: isActive ? '#ffffff' : 'var(--text-secondary)'
                        }}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </>
              ) : (
                <>
                  {/* All in Current Stage */}
                  <button
                    type="button"
                    onClick={() => setSelectedStatusFilter('All')}
                    style={{
                      padding: '0.3rem 0.75rem',
                      borderRadius: '20px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      border: selectedStatusFilter === 'All' ? '1px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                      background: selectedStatusFilter === 'All' ? 'var(--accent-color, #2563eb)' : 'var(--bg-surface-variant, #f8fafc)',
                      color: selectedStatusFilter === 'All' ? '#ffffff' : 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>All</span>
                    <span style={{
                      padding: '0.1rem 0.45rem',
                      borderRadius: '10px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      background: selectedStatusFilter === 'All' ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface, #fff)',
                      color: selectedStatusFilter === 'All' ? '#ffffff' : 'var(--text-secondary)'
                    }}>
                      {stageCandidatesPool.length}
                    </span>
                  </button>

                  {/* Stage-Specific Status Options */}
                  {(() => {
                    const standardOpts = getStatusOptions(selectedStage);
                    const existingStatuses = Array.from(new Set(stageCandidatesPool.map(c => c.candidate_status).filter(Boolean)));
                    const combined = Array.from(new Set([...standardOpts, ...existingStatuses]));

                    return combined.map(statusLabel => {
                      const count = stageCandidatesPool.filter(c => c.candidate_status === statusLabel).length;
                      const isActive = selectedStatusFilter === statusLabel;

                      // Status dot color
                      let dotColor = '#64748b';
                      const lower = statusLabel.toLowerCase();
                      if (lower.includes('reject') || lower.includes('drop') || lower.includes('failed') || lower.includes('decline') || lower.includes('no show')) {
                        dotColor = '#ef4444';
                      } else if (lower.includes('selected') || lower.includes('passed') || lower.includes('approved') || lower.includes('agreed') || lower.includes('shortlist') || lower.includes('accepted') || lower.includes('joined') || lower.includes('completed')) {
                        dotColor = '#10b981';
                      } else if (lower.includes('schedule') || lower.includes('pending') || lower.includes('negotiat') || lower.includes('review') || lower.includes('hold')) {
                        dotColor = '#f59e0b';
                      }

                      return (
                        <button
                          key={statusLabel}
                          type="button"
                          onClick={() => setSelectedStatusFilter(curr => curr === statusLabel ? 'All' : statusLabel)}
                          style={{
                            padding: '0.3rem 0.75rem',
                            borderRadius: '20px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            border: isActive ? '1px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                            background: isActive ? 'var(--accent-color, #2563eb)' : 'var(--bg-surface-variant, #f8fafc)',
                            color: isActive ? '#ffffff' : 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: isActive ? '#ffffff' : dotColor, display: 'inline-block' }} />
                          <span>{statusLabel}</span>
                          <span style={{
                            padding: '0.1rem 0.45rem',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface, #fff)',
                            color: isActive ? '#ffffff' : 'var(--text-secondary)'
                          }}>
                            {count}
                          </span>
                        </button>
                      );
                    });
                  })()}
                </>
              )}
            </div>

          </div>

          {/* Candidates Table */}
          {filteredCandidates.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <h3>No Candidates in this Stage</h3>
              <p>Either add a new candidate or update existing candidates' stages to shift them here.</p>
            </div>
          ) : (
            <div style={{ width: '100%', overflow: 'auto', maxHeight: 'calc(100vh - 310px)', minHeight: '380px', backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', position: 'relative' }}>
              <MobileTableView id="Recruiter/RecruiterDashboard-2" hideToggle={true} view={recruiterTableView}><table style={{ width: '100%', minWidth: `${getCandTotalTableWidth()}px`, borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)' }}>
                  <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ width: `${candColWidths.actions || 125}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingRight: '8px' }}>
                        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Actions</span>
                      </div>
                      <ColumnResizer colKey="actions" isResizing={candResizingCol === 'actions'} onResizeStart={handleCandResizeStart} onReset={resetCandColWidth} />
                    </th>
                    <th style={{ width: `${candColWidths.name}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Candidate Name</span>
                      </div>
                      <ColumnResizer colKey="name" isResizing={candResizingCol === 'name'} onResizeStart={handleCandResizeStart} onReset={resetCandColWidth} />
                    </th>
                    <th style={{ width: `${candColWidths.applying_for}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Applying For</span>
                      </div>
                      <ColumnResizer colKey="applying_for" isResizing={candResizingCol === 'applying_for'} onResizeStart={handleCandResizeStart} onReset={resetCandColWidth} />
                    </th>
                    <th style={{ width: `${candColWidths.resume}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingRight: '8px' }}>
                        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Resume</span>
                      </div>
                      <ColumnResizer colKey="resume" isResizing={candResizingCol === 'resume'} onResizeStart={handleCandResizeStart} onReset={resetCandColWidth} />
                    </th>
                    <th style={{ width: `${candColWidths.stage_status || (candColWidths.status ? candColWidths.status + 10 : 195)}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Stage Status</span>
                      </div>
                      <ColumnResizer colKey="stage_status" isResizing={candResizingCol === 'stage_status'} onResizeStart={handleCandResizeStart} onReset={resetCandColWidth} />
                    </th>
                    <th style={{ width: `${candColWidths.details}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Stage Details / Remarks</span>
                      </div>
                      <ColumnResizer colKey="details" isResizing={candResizingCol === 'details'} onResizeStart={handleCandResizeStart} onReset={resetCandColWidth} />
                    </th>
                    <th style={{ width: `${candColWidths.planned_tat || 155}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>⏱️ Planned Target (IST)</span>
                      </div>
                      <ColumnResizer colKey="planned_tat" isResizing={candResizingCol === 'planned_tat'} onResizeStart={handleCandResizeStart} onReset={resetCandColWidth} />
                    </th>
                    <th style={{ width: `${candColWidths.actual_logged || 155}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>📅 Actual Logged (IST)</span>
                      </div>
                      <ColumnResizer colKey="actual_logged" isResizing={candResizingCol === 'actual_logged'} onResizeStart={handleCandResizeStart} onReset={resetCandColWidth} />
                    </th>
                    <th style={{ width: `${candColWidths.delay_status || 145}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>⚡ Delay Status</span>
                      </div>
                      <ColumnResizer colKey="delay_status" isResizing={candResizingCol === 'delay_status'} onResizeStart={handleCandResizeStart} onReset={resetCandColWidth} />
                    </th>
                    <th style={{ width: `${candColWidths.date}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Date Applied</span>
                      </div>
                      <ColumnResizer colKey="date" isResizing={candResizingCol === 'date'} onResizeStart={handleCandResizeStart} onReset={resetCandColWidth} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCandidates.map(cand => {
                    const candCreatedObj = cand.created_at ? new Date(cand.created_at) : null;
                    const candStageObj = STAGES.find(s => s.id === (cand.current_stage || 'S02'));
                    const stageTatHours = candStageObj?.tat_hours || 24;
                    const candPlannedObj = candCreatedObj ? new Date(candCreatedObj.getTime() + (stageTatHours * 60 * 60 * 1000)) : null;
                    const candActualObj = cand.updated_at ? new Date(cand.updated_at) : candCreatedObj;
                    const candPlannedStr = formatISTDateTime(candPlannedObj) || 'N/A';
                    const candActualStr = formatISTDateTime(candActualObj) || 'N/A';
                    const candDelay = getSlaDelayInfo(candPlannedObj, cand.current_stage === 'S09' ? candActualObj : null);

                    // Compute stage details cell
                    let stageDetailsText = <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>No remarks logged.</span>;
                    if (cand.current_stage === 'S02') {
                      stageDetailsText = <span style={{ color: 'var(--text-secondary)' }}>Registered in S02 - Resume Filtered</span>;
                    } else if (cand.current_stage === 'S03') {
                      stageDetailsText = (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <div>🗣️ Interviewer: <strong>{cand.interviewer_name || 'Not assigned'}</strong></div>
                          <div>
                            Feedback: {cand.interview_feedback ? (
                              <span style={{ fontStyle: 'italic' }}>"{cand.interview_feedback}"</span>
                            ) : (
                              <span style={{ color: '#c2410c', fontStyle: 'italic' }}>Pending comments</span>
                            )}
                          </div>
                        </div>
                      );
                    } else if (cand.current_stage === 'S04') {
                      stageDetailsText = cand.test_results ? (
                        <span>📊 Test Score: <strong>{cand.test_results}</strong></span>
                      ) : (
                        <span style={{ color: '#1e40af' }}>Test Results Awaiting Update</span>
                      );
                    } else if (cand.current_stage === 'S05') {
                      stageDetailsText = (
                        <span>
                          🔑 ED Approval:{' '}
                          <strong style={{ color: cand.ed_approval_status === 'Approved' ? '#166534' : cand.ed_approval_status === 'Rejected' ? '#991b1b' : '#c2410c' }}>
                            {cand.ed_approval_status}
                          </strong>
                        </span>
                      );
                    } else if (cand.current_stage === 'S06') {
                      stageDetailsText = (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          {cand.actual_salary && <div style={{ fontWeight: 600, color: '#166534' }}>💵 Actual Salary: ₹{cand.actual_salary.toLocaleString('en-IN')} / month</div>}
                          <div>💰 Structure: {cand.salary_negotiation_details || <span style={{ color: '#86198f', fontStyle: 'italic' }}>Negotiation in progress</span>}</div>
                        </div>
                      );
                    } else if (cand.current_stage === 'S07') {
                      stageDetailsText = <span style={{ color: '#166534', fontWeight: 600 }}>✓ Structure Approved (ED Shortlisted)</span>;
                    } else if (cand.current_stage === 'S08') {
                      stageDetailsText = (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span>✉️ Offer/LOI Status: <strong>{cand.loi_status}</strong></span>
                          {cand.joining_date && <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>📅 Expected Joining: <strong>{cand.joining_date}</strong></span>}
                        </div>
                      );
                    } else if (cand.current_stage === 'S09') {
                      stageDetailsText = (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          {cand.actual_joining_date && <span style={{ color: '#166534', fontSize: '0.75rem', fontWeight: 600 }}>📅 Joined Date: {cand.actual_joining_date}</span>}
                          {cand.joining_details ? (
                            <span>🤝 Details: {cand.joining_details}</span>
                          ) : (
                            <span style={{ color: '#166534' }}>Joined - Awaiting onboarding checklist</span>
                          )}
                        </div>
                      );
                    } else if (cand.current_stage === 'S10') {
                      let s10Data = {};
                      try {
                        const parsed = typeof cand.joining_details === 'string' ? JSON.parse(cand.joining_details) : cand.joining_details;
                        s10Data = parsed?.s10_doc_collection || {};
                      } catch (_) {}
                      const collectedCount = Object.values(s10Data.checklist || {}).filter(Boolean).length;
                      stageDetailsText = (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <div>📁 Docs: <strong>{cand.candidate_status || s10Data.status || 'Pending Documents'}</strong></div>
                          <div style={{ fontSize: '0.75rem', color: collectedCount >= 8 ? '#166534' : '#c2410c' }}>
                            ✓ {collectedCount} / 8 Documents Collected
                          </div>
                        </div>
                      );
                    } else if (cand.current_stage === 'S11') {
                      let s11Data = {};
                      try {
                        const parsed = typeof cand.joining_details === 'string' ? JSON.parse(cand.joining_details) : cand.joining_details;
                        s11Data = parsed?.s11_emp_mapping || {};
                      } catch (_) {}
                      stageDetailsText = (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <div>🆔 Emp ID: <strong style={{ color: '#312e81' }}>{s11Data.employee_id || cand.employee_id || 'Pending Generation'}</strong></div>
                          {s11Data.assigned_branch && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>📍 {s11Data.assigned_branch}</div>}
                          {s11Data.reporting_manager && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>👤 HOD: {s11Data.reporting_manager}</div>}
                        </div>
                      );
                    } else if (cand.current_stage === 'S12') {
                      let s12Data = {};
                      try {
                        const parsed = typeof cand.joining_details === 'string' ? JSON.parse(cand.joining_details) : cand.joining_details;
                        s12Data = parsed?.s12_working_rating || {};
                      } catch (_) {}
                      const ratingVal = s12Data.rating ? Number(s12Data.rating) : null;
                      stageDetailsText = (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <div>
                            ⭐ Rating: {ratingVal ? (
                              <strong style={{ color: '#b45309' }}>{'⭐'.repeat(Math.min(5, Math.max(1, Math.round(ratingVal))))} ({ratingVal.toFixed(1)})</strong>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)' }}>Awaiting Review</span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: s12Data.probation_status?.includes('Confirmed') ? '#166534' : '#4338ca' }}>
                            {s12Data.probation_status || cand.candidate_status || 'Under Probation'}
                          </div>
                          {s12Data.remarks && <div style={{ fontSize: '0.72rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>"{s12Data.remarks}"</div>}
                        </div>
                      );
                    }

                    return (
                      <tr 
                        key={cand.id} 
                        style={{ borderBottom: '1px solid var(--border-light)', transition: 'background-color 0.2s' }}
                      >
                        <td style={{ width: `${candColWidths.actions || 125}px`, padding: '0.65rem 0.75rem', textAlign: 'center', boxSizing: 'border-box' }}>
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem', justifyContent: 'center' }}>
                            {/* 📝 Edit & Profile Details */}
                            <button
                              onClick={() => {
                                setSelectedCandidate(cand);
                                setCandidateProfileInitialView('details');
                                setIsProfileOpen(true);
                              }}
                              title="📝 Edit Candidate Profile & Submit Stage Form"
                              style={{
                                padding: '0.35rem 0.55rem', borderRadius: '6px',
                                border: '1px solid var(--border-light)', background: 'var(--bg-surface)',
                                cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1,
                                transition: 'all 0.15s'
                              }}
                            >
                              📝
                            </button>

                            {/* 📜 Stage History & Audit Table */}
                            <button
                              onClick={() => {
                                setSelectedCandidateForHistory(cand);
                                setIsHistoryModalOpen(true);
                              }}
                              title="📜 View Candidate Stage History & Audit Table"
                              style={{
                                padding: '0.35rem 0.55rem', borderRadius: '6px',
                                border: '1px solid var(--border-light)', background: 'var(--bg-surface)',
                                cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1,
                                transition: 'all 0.15s'
                              }}
                            >
                              📜
                            </button>

                            {/* 🔀 Stage Force-Change (Admin / Manager Only) */}
                            <button
                              onClick={() => {
                                if (!isManagerOrAdmin) {
                                  alert("🔒 Stage Force-Change is restricted to Admin & HR Manager only. Standard recruiters must advance stages by submitting evaluations in Edit (📝).");
                                  return;
                                }
                                setStageChangeCandidate(cand);
                                setTargetStageOverride(cand.current_stage || 'S02');
                                setStageOverrideReason('');
                                setIsStageChangeModalOpen(true);
                              }}
                              title={isManagerOrAdmin ? "🔀 Admin / Manager Force Stage Change" : "🔒 Stage Force-Change (Admin/Manager Only)"}
                              style={{
                                padding: '0.35rem 0.55rem', borderRadius: '6px',
                                border: '1px solid var(--border-light)',
                                background: isManagerOrAdmin ? 'var(--bg-surface)' : 'var(--bg-primary)',
                                cursor: isManagerOrAdmin ? 'pointer' : 'not-allowed',
                                opacity: isManagerOrAdmin ? 1 : 0.45,
                                fontSize: '0.85rem', lineHeight: 1,
                                transition: 'all 0.15s'
                              }}
                            >
                              🔀
                            </button>
                          </div>
                        </td>
                        <td style={{ width: `${candColWidths.name}px`, padding: '0.85rem 1rem', boxSizing: 'border-box' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span 
                              onClick={() => { setSelectedCandidate(cand); setIsProfileOpen(true); }}
                              style={{ fontWeight: 600, color: 'var(--accent-color)', cursor: 'pointer', fontSize: '0.875rem' }}
                              title={cand.name}
                            >
                              {cand.name}
                            </span>
                            {cand.candidate_code && (
                              <span style={{ 
                                fontSize: '0.68rem', fontFamily: 'monospace', 
                                padding: '0.1rem 0.35rem', borderRadius: '4px',
                                background: 'var(--bg-surface-variant)', border: '1px solid var(--border-light)',
                                color: 'var(--text-secondary)'
                              }}>
                                {cand.candidate_code}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                            {cand.phone && <span style={{ marginRight: '0.75rem' }}>📞 {cand.phone}</span>}
                            {cand.email && <span>✉️ {cand.email}</span>}
                          </div>
                          {(cand.total_experience || cand.current_city || cand.highest_qualification || cand.notice_period) && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {cand.total_experience && <span title="Total Experience">💼 {cand.total_experience}</span>}
                              {cand.highest_qualification && <span title="Highest Qualification">🎓 {cand.highest_qualification}</span>}
                              {cand.current_city && <span title="Current City">📍 {cand.current_city}</span>}
                              {cand.notice_period && <span style={{ color: '#0284c7' }} title="Notice Period">⏳ {cand.notice_period}</span>}
                            </div>
                          )}
                          {(cand.expected_salary_min || cand.expected_salary_max) && (
                            <div style={{ fontSize: '0.72rem', color: '#0f766e', marginTop: '0.2rem', fontWeight: 500 }}>
                              💰 Exp: {cand.expected_salary_min ? `₹${cand.expected_salary_min.toLocaleString('en-IN')}` : '0'} - {cand.expected_salary_max ? `₹${cand.expected_salary_max.toLocaleString('en-IN')}` : 'Any'} / month
                            </div>
                          )}
                        </td>
                        <td style={{ width: `${candColWidths.applying_for}px`, padding: '0.85rem 1rem', fontSize: '0.85rem', color: 'var(--text-primary)', boxSizing: 'border-box', verticalAlign: 'top' }}>
                          <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }} title={cand.recruitment_positions?.title || 'Unknown'}>{cand.recruitment_positions?.title || 'Unknown'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                            <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{cand.recruitment_positions?.department}</span>
                            {cand.position_id && (
                              <span style={{ 
                                fontSize: '0.68rem', fontFamily: 'monospace', 
                                padding: '0.1rem 0.35rem', borderRadius: '4px',
                                background: 'var(--bg-surface-variant)', border: '1px solid var(--border-light)',
                                color: 'var(--text-secondary)', flexShrink: 0
                              }} title={`Full Position ID: ${cand.position_id}`}>
                                {`POS-${cand.position_id.substring(0, 8).toUpperCase()}`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ width: `${candColWidths.resume}px`, padding: '0.85rem 1rem', textAlign: 'center', boxSizing: 'border-box' }}>
                          {cand.resume_url ? (
                            <a 
                              href={cand.resume_url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '0.25rem', 
                                padding: '0.25rem 0.5rem', 
                                borderRadius: '6px', 
                                backgroundColor: 'var(--bg-primary)', 
                                border: '1px solid var(--border-light)',
                                fontSize: '0.75rem', 
                                color: 'var(--accent-color)', 
                                textDecoration: 'none',
                                fontWeight: 600
                              }}
                            >
                              <FileText size={12} /> View Resume
                            </a>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No Resume</span>
                          )}
                        </td>

                        {/* Stage Status Cell with Current Stage & Status (Combined Single Column) */}
                        <td style={{ width: `${candColWidths.stage_status || (candColWidths.status ? candColWidths.status + 10 : 195)}px`, padding: '0.85rem 1rem', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                          {(() => {
                            const statusText = cand.candidate_status || getStatusOptions(cand.current_stage || 'S02')[0] || 'Pending';
                            const isNegative = statusText.includes('Rejected') || statusText.includes('Failed') || statusText.includes('Dropped') || statusText.includes('No Show') || statusText.includes('Declined');
                            const isPositive = statusText.includes('Cleared') || statusText.includes('Passed') || statusText.includes('Approved') || statusText.includes('Agreed') || statusText.includes('Shortlisted') || statusText.includes('Joined') || statusText.includes('Selected') || statusText.includes('Accepted');
                            const isNoResponse = statusText === 'No Response';
                            const isReSchedule = statusText === 'ReSchedule';

                            const bg = isNoResponse ? '#fff7ed' : isReSchedule ? '#eef2ff' : isNegative ? '#fee2e2' : isPositive ? '#dcfce7' : '#fef9c3';
                            const color = isNoResponse ? '#c2410c' : isReSchedule ? '#3730a3' : isNegative ? '#991b1b' : isPositive ? '#166534' : '#854d0e';
                            const dotColor = isNoResponse ? '#f97316' : isReSchedule ? '#6366f1' : isNegative ? '#ef4444' : isPositive ? '#22c55e' : '#eab308';
                            const border = isNoResponse ? '1px solid #fed7aa' : isReSchedule ? '1px solid #c7d2fe' : `1px solid ${isNegative ? '#fecaca' : isPositive ? '#bbf7d0' : '#fef08a'}`;

                            let reschedObj = null;
                            let noRespObj = null;
                            if (cand.joining_details) {
                              try {
                                const parsed = typeof cand.joining_details === 'string' ? JSON.parse(cand.joining_details) : cand.joining_details;
                                reschedObj = parsed?.reschedule_details;
                                noRespObj = parsed?.no_response_details;
                              } catch (_) {}
                            }

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-start' }}>
                                {/* Current Stage Badge */}
                                <span style={{
                                  fontSize: '0.72rem',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '6px',
                                  fontWeight: 700,
                                  background: candStageObj?.color || '#cbd5e1',
                                  color: candStageObj?.textColor || '#334155',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  whiteSpace: 'nowrap'
                                }}>
                                  <span>{candStageObj?.id || cand.current_stage || 'S02'}</span>
                                  {candStageObj?.name?.split(' — ')[1] && (
                                    <span style={{ opacity: 0.9 }}>• {candStageObj.name.split(' — ')[1]}</span>
                                  )}
                                </span>

                                {/* Stage Status Badge */}
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  padding: '0.22rem 0.6rem',
                                  borderRadius: '12px',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  background: bg,
                                  color: color,
                                  border: border,
                                  whiteSpace: 'nowrap',
                                  lineHeight: 1.2
                                }}>
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} />
                                  {statusText}
                                </span>

                                {/* Dependent Sub-Status Badge when No Response */}
                                {isNoResponse && (
                                  <span style={{
                                    fontSize: '0.68rem',
                                    color: '#c2410c',
                                    fontWeight: 600,
                                    background: '#fff7ed',
                                    border: '1px solid #fed7aa',
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '4px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    whiteSpace: 'normal',
                                    wordBreak: 'break-word',
                                    lineHeight: 1.25
                                  }} title={noRespObj?.remarks ? `Note: ${noRespObj.remarks}` : (noRespObj?.substatus || 'No Response Reason')}>
                                    📞 {noRespObj?.substatus || 'Call Not Picked / Ringing'}
                                  </span>
                                )}

                                {/* Dependent Rescheduled Date & Time Badge when ReSchedule */}
                                {isReSchedule && (
                                  <span style={{
                                    fontSize: '0.68rem',
                                    color: '#4338ca',
                                    fontWeight: 600,
                                    background: '#e0e7ff',
                                    border: '1px solid #c7d2fe',
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '4px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    whiteSpace: 'normal',
                                    wordBreak: 'break-word',
                                    lineHeight: 1.25
                                  }} title={reschedObj?.reschedule_remarks || 'Rescheduled target'}>
                                    📅 {reschedObj?.reschedule_date ? formatISTDateTime(reschedObj.reschedule_date) : 'Date Not Set (Edit 📝)'}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Stage Details / Remarks Cell */}
                        <td style={{ width: `${candColWidths.details}px`, padding: '0.85rem 1rem', fontSize: '0.82rem', color: 'var(--text-primary)', boxSizing: 'border-box', verticalAlign: 'top' }}>
                          {stageDetailsText}
                        </td>
                        <td style={{ width: `${candColWidths.planned_tat || 155}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-primary)', boxSizing: 'border-box', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 600 }}>{candPlannedStr}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{candStageObj?.id || 'Stage'} Target ({stageTatHours}h)</div>
                        </td>
                        <td style={{ width: `${candColWidths.actual_logged || 155}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-primary)', boxSizing: 'border-box', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 600 }}>{candActualStr}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>IST Entry</div>
                        </td>
                        <td style={{ width: `${candColWidths.delay_status || 145}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', boxSizing: 'border-box', verticalAlign: 'top' }}>
                          <span style={{ 
                            display: 'inline-block', 
                            padding: '0.2rem 0.55rem', 
                            borderRadius: '12px', 
                            fontWeight: 'bold', 
                            fontSize: '0.72rem', 
                            background: candDelay.bg, 
                            color: candDelay.color,
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            lineHeight: 1.25
                          }}>
                            {candDelay.badgeText}
                          </span>
                        </td>
                        <td style={{ width: `${candColWidths.date}px`, padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', boxSizing: 'border-box', whiteSpace: 'nowrap' }}>
                          {new Date(cand.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></MobileTableView>
            </div>
          )}

          {/* Standard Bottom Table Pagination for Candidates (all_stages & S02-S12) */}
          {filteredCandidates.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <StandardTablePagination
                currentPage={validCandidatePage}
                totalRecords={filteredCandidates.length}
                pageSize={pageSize === 'All' ? 100000 : Number(pageSize)}
                onPageChange={(p) => setCurrentPage(p)}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Profile/Detail Slide Panel */}
      {selectedCandidate && (
        <CandidateProfilePanel 
          recruiterScope={recruiterScope}
          candidate={selectedCandidate}
          isOpen={isProfileOpen}
          onClose={() => { setIsProfileOpen(false); setSelectedCandidate(null); }}
          onCandidateUpdate={() => { loadData(); }}
          canEdit={canEditStage(selectedCandidate.current_stage)}
          canDecreaseStage={canDecreaseStage}
          stagesConfig={CANDIDATE_STAGES}
          pipelineConfig={pipelineConfig}
          initialView={candidateProfileInitialView}
        />
      )}

      {/* Candidate Stage History Table Modal */}
      {selectedCandidateForHistory && (
        <CandidateStageHistoryModal 
          recruiterScope={recruiterScope}
          candidate={selectedCandidateForHistory}
          isOpen={isHistoryModalOpen}
          onClose={() => {
            setIsHistoryModalOpen(false);
            setSelectedCandidateForHistory(null);
          }}
          stagesConfig={CANDIDATE_STAGES}
          pipelineConfig={pipelineConfig}
        />
      )}

      {/* Position Details Slide Panel */}
      {selectedPositionForDetails && (
        <PositionDetailsPanel
          position={selectedPositionForDetails}
          isOpen={isPositionDetailsOpen}
          onClose={() => { setIsPositionDetailsOpen(false); setSelectedPositionForDetails(null); }}
          candidates={candidates}
          onSelectCandidate={(cand) => {
            setSelectedCandidate(cand);
            setCandidateProfileInitialView('details');
            setIsProfileOpen(true);
          }}
          userName={userName}
          canEdit={canEditStage(selectedPositionForDetails.status)}
          onAddCandidateForPosition={handleOpenAddCandidateForPosition}
          onOpenEditPosition={handleOpenEditPosition}
          onClaimPosition={handleClaimPosition}
          onReleasePosition={handleReleasePosition}
          branches={availableBranches}
        />
      )}

      {/* Admin / Manager Quick Stage Change Modal */}
      {isStageChangeModalOpen && stageChangeCandidate && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem', backdropFilter: 'blur(3px)' }}>
          <div className="card" style={{ width: '480px', maxWidth: '95vw', padding: '1.5rem', borderRadius: '12px', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                🔀 Admin / Manager Stage Change
              </h3>
              <button onClick={() => setIsStageChangeModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
              Candidate: <strong style={{ color: 'var(--text-primary)' }}>{stageChangeCandidate.name}</strong> • Current Stage: <strong style={{ color: 'var(--accent-color)' }}>{stageChangeCandidate.current_stage || 'S02'}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Target Stage</label>
                <select
                  value={targetStageOverride}
                  onChange={e => setTargetStageOverride(e.target.value)}
                  style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  {CANDIDATE_STAGES.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name || s.id}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Mandatory Override Reason *
                </label>
                <textarea
                  value={stageOverrideReason}
                  onChange={e => setStageOverrideReason(e.target.value)}
                  placeholder="e.g. Direct walk-in approved by MD, Lateral transfer, Candidate verified offline..."
                  rows={3}
                  style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.82rem', resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button
                onClick={() => setIsStageChangeModalOpen(false)}
                style={{ padding: '0.45rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAdminStageOverride}
                disabled={isOverridingStage || !stageOverrideReason.trim()}
                style={{
                  padding: '0.45rem 1.15rem', borderRadius: '6px', border: 'none',
                  background: !stageOverrideReason.trim() ? '#cbd5e1' : 'var(--accent-color)',
                  color: 'white', fontWeight: 700, cursor: !stageOverrideReason.trim() ? 'not-allowed' : 'pointer', fontSize: '0.8rem'
                }}
              >
                {isOverridingStage ? 'Applying...' : 'Apply Stage Change 🔀'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Job Position */}
      {isPositionModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem', backdropFilter: 'blur(3px)' }}>
          <div className="card" style={{ width: '920px', maxWidth: '96vw', maxHeight: '92vh', height: 'auto', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: '14px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.35)', background: 'var(--bg-surface)' }}>
            
            {/* Pinned Sticky Header */}
            <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'var(--accent-color, #3b82f6)15', color: 'var(--accent-color, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Briefcase size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Create Job Requirement</h3>
                  <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Log department requirement, set qualifications, urgency & roles (S00 stage)</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsPositionModalOpen(false)} 
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--text-secondary)', padding: '0.25rem 0.5rem', borderRadius: '6px' }}
                title="Close"
              >✕</button>
            </div>

            {/* Form enclosing Scrollable Body and Pinned Footer */}
            <form onSubmit={handleCreatePosition} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', margin: 0 }}>
              
              {/* Scrollable Form Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.15rem', boxSizing: 'border-box' }}>
                
                {/* Position Title (Full Width) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Position Title *</label>
                  <input required type="text" value={newPosition.title} onChange={e => setNewPosition(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g. Sales Manager, Quality Engineer, CNC Operator" style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }} />
                </div>

                {/* Row 2: Department & Branch / Plant (2-Column Grid) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Department *</label>
                    <select required value={newPosition.department} onChange={e => setNewPosition(prev => ({ ...prev, department: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      <option value="">Select Department</option>
                      {departments.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Branch / Plant *</label>
                    <UniversalBranchSelect
                      mode="form"
                      value={newPosition.branch_code}
                      onChange={(val) => setNewPosition(prev => ({ ...prev, branch_code: val }))}
                      branches={availableBranches}
                      placeholder="Select Branch / Plant"
                    />
                  </div>
                </div>

                {/* Row 3: Job Type & Vacancy Reason (2-Column Grid) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Job Type / Employment Type *</label>
                    <select value={newPosition.job_type} onChange={e => setNewPosition(prev => ({ ...prev, job_type: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      {POSITION_JOB_TYPES.map(jt => <option key={jt} value={jt}>{jt}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Vacancy Reason *</label>
                    <select value={newPosition.vacancy_reason} onChange={e => setNewPosition(prev => ({ ...prev, vacancy_reason: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      {POSITION_VACANCY_REASONS.map(vr => <option key={vr} value={vr}>{vr}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 4: No. of Openings & Required Experience (2-Column Grid) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>No. of Openings *</label>
                    <input required type="number" min="1" value={newPosition.openings} onChange={e => setNewPosition(prev => ({ ...prev, openings: parseInt(e.target.value, 10) || 1 }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Required Experience *</label>
                    <select value={newPosition.experience_required} onChange={e => setNewPosition(prev => ({ ...prev, experience_required: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      {POSITION_EXPERIENCES.map(exp => <option key={exp} value={exp}>{exp}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 5: Minimum Qualification (Full Width) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Minimum Qualification * (Select or Type)</label>
                  <SearchableQualificationSelect
                    value={newPosition.min_qualification}
                    onChange={(val) => setNewPosition(prev => ({ ...prev, min_qualification: val }))}
                    placeholder="Select or type qualification (e.g. Class 8, ITI, Diploma, B.Tech...)"
                  />
                </div>

                {/* Row 6: Salary Min & Salary Max (2-Column Grid) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Salary Range Min (₹/month)</label>
                    <input type="number" value={newPosition.salary_min} onChange={e => setNewPosition(prev => ({ ...prev, salary_min: e.target.value }))} placeholder="e.g. 35000" style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Salary Range Max (₹/month)</label>
                    <input type="number" value={newPosition.salary_max} onChange={e => setNewPosition(prev => ({ ...prev, salary_max: e.target.value }))} placeholder="e.g. 60000" style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }} />
                  </div>
                </div>

                {/* Row 7: Hiring Urgency & Work Mode (2-Column Grid) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Hiring Urgency / Priority</label>
                    <select value={newPosition.urgency} onChange={e => setNewPosition(prev => ({ ...prev, urgency: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      {POSITION_URGENCIES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Work Mode / Location Type</label>
                    <select value={newPosition.work_mode} onChange={e => setNewPosition(prev => ({ ...prev, work_mode: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      {POSITION_WORK_MODES.map(wm => <option key={wm} value={wm}>{wm}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 8: Shift Type & Gender Preference (2-Column Grid) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Shift Type</label>
                    <select value={newPosition.shift_type} onChange={e => setNewPosition(prev => ({ ...prev, shift_type: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      {POSITION_SHIFT_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Gender Preference</label>
                    <select value={newPosition.gender_preference} onChange={e => setNewPosition(prev => ({ ...prev, gender_preference: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      {POSITION_GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 9: Deadline Date & Interviewer Name (2-Column Grid) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Deadline Date</label>
                    <input type="date" value={newPosition.deadline_date || ''} onChange={e => setNewPosition(prev => ({ ...prev, deadline_date: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Interviewer Name</label>
                    <SearchableEmployeeSelect
                      employees={teamMembers}
                      selectedEmail={newPosition.interviewer_name || ''}
                      onSelect={(emp) => setNewPosition(prev => ({ ...prev, interviewer_name: emp ? (emp.emp_name || emp.name || emp.email) : '' }))}
                      placeholder="Search interviewer..."
                    />
                  </div>
                </div>

                {/* Recruiter Assigned (Full Width) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>🎯 Assign Recruiter (HR Recruitment Team)</label>
                  <select 
                    value={newPosition.recruiter_assigned || 'All'} 
                    onChange={e => setNewPosition(prev => ({ ...prev, recruiter_assigned: e.target.value }))} 
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}
                  >
                    <option value="All">📢 All Recruiters (Anyone can Claim)</option>
                    {recruitersList.map(r => (
                      <option key={r.user_id || r.emp_id} value={r.emp_name}>
                        {r.emp_name}{r.emp_id && !r.emp_name.includes(r.emp_id) ? ` (${r.emp_id})` : ''}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Select "All" if unsure — any recruiter can claim it from S00.</span>
                </div>

                {/* Key Skills / Tags (Full Width) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Key Skills / Tags (Type & Auto-Suggest or Click Popular)</label>
                  <InteractiveSkillTagInput
                    value={newPosition.key_skills || ''}
                    onChange={(val) => setNewPosition(prev => ({ ...prev, key_skills: val }))}
                  />
                </div>

                {/* Job Description (Full Width) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Job Description (JD Summary)</label>
                  <textarea rows="3" value={newPosition.jd_text} onChange={e => setNewPosition(prev => ({ ...prev, jd_text: e.target.value }))} placeholder="Key roles and qualifications required..." style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical', fontSize: '0.85rem' }} />
                </div>

              </div>

              {/* Pinned Sticky Footer - NEVER SCROLLS AWAY */}
              <div style={{ 
                padding: '0.9rem 1.5rem', 
                borderTop: '1px solid var(--border-light)', 
                background: 'var(--bg-surface)', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                flexShrink: 0, 
                gap: '1rem', 
                flexWrap: 'wrap' 
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  * Required fields must be completed
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <button 
                    type="button" 
                    onClick={() => setIsPositionModalOpen(false)} 
                    style={{ padding: '0.55rem 1.25rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn-primary" 
                    style={{ padding: '0.55rem 1.5rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem' }}
                  >
                    Create Requirement
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Position */}
      {editingPosition && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem', backdropFilter: 'blur(3px)' }}>
          <div className="card" style={{ width: '920px', maxWidth: '96vw', maxHeight: '92vh', height: 'auto', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: '14px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.35)', background: 'var(--bg-surface)' }}>
            
            {/* Pinned Sticky Header */}
            <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#6366f115', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                  ✏️
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Edit Position — {editingPosition.title}</h3>
                  <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Update requirement details, target experience, skills or assigned recruiter</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setEditingPosition(null)} 
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--text-secondary)', padding: '0.25rem 0.5rem', borderRadius: '6px' }}
                title="Close"
              >✕</button>
            </div>

            <form onSubmit={handleSaveEditPosition} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', margin: 0 }}>
              
              {/* Scrollable Form Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.15rem', boxSizing: 'border-box' }}>
                
                {/* Position Title */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Position Title *</label>
                  <input required type="text" value={editPositionForm.title} onChange={e => setEditPositionForm(prev => ({ ...prev, title: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }} />
                </div>

                {/* Row 2: Department & Branch / Plant (2-Column Grid) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Department *</label>
                    <select value={editPositionForm.department} onChange={e => setEditPositionForm(prev => ({ ...prev, department: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      <option value="">Select Department</option>
                      {departments.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Branch / Plant *</label>
                    <UniversalBranchSelect
                      mode="form"
                      value={editPositionForm.branch_code}
                      onChange={(val) => setEditPositionForm(prev => ({ ...prev, branch_code: val }))}
                      branches={availableBranches}
                      placeholder="Select Branch / Plant"
                    />
                  </div>
                </div>

                {/* Row 3: Job Type & Vacancy Reason (2-Column Grid) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Job Type / Employment Type *</label>
                    <select value={editPositionForm.job_type || 'Full Time (Permanent)'} onChange={e => setEditPositionForm(prev => ({ ...prev, job_type: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      {POSITION_JOB_TYPES.map(jt => <option key={jt} value={jt}>{jt}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Vacancy Reason *</label>
                    <select value={editPositionForm.vacancy_reason || 'New Position'} onChange={e => setEditPositionForm(prev => ({ ...prev, vacancy_reason: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      {POSITION_VACANCY_REASONS.map(vr => <option key={vr} value={vr}>{vr}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 4: No. of Openings & Required Experience (2-Column Grid) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>No. of Openings *</label>
                    <input type="number" min="1" value={editPositionForm.openings} onChange={e => setEditPositionForm(prev => ({ ...prev, openings: parseInt(e.target.value, 10) || 1 }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Required Experience *</label>
                    <select value={editPositionForm.experience_required || 'Any Experience'} onChange={e => setEditPositionForm(prev => ({ ...prev, experience_required: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      {POSITION_EXPERIENCES.map(exp => <option key={exp} value={exp}>{exp}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 5: Minimum Qualification (Full Width) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Minimum Qualification * (Select or Type)</label>
                  <SearchableQualificationSelect
                    value={editPositionForm.min_qualification || ''}
                    onChange={(val) => setEditPositionForm(prev => ({ ...prev, min_qualification: val }))}
                    placeholder="Select or type qualification (e.g. Class 8, ITI, Diploma, B.Tech...)"
                  />
                </div>

                {/* Row 6: Salary Min & Salary Max (2-Column Grid) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Salary Range Min (₹/month)</label>
                    <input type="number" value={editPositionForm.salary_min || ''} onChange={e => setEditPositionForm(prev => ({ ...prev, salary_min: e.target.value }))} placeholder="e.g. 35000" style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Salary Range Max (₹/month)</label>
                    <input type="number" value={editPositionForm.salary_max || ''} onChange={e => setEditPositionForm(prev => ({ ...prev, salary_max: e.target.value }))} placeholder="e.g. 60000" style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }} />
                  </div>
                </div>

                {/* Row 7: Hiring Urgency & Work Mode (2-Column Grid) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Hiring Urgency / Priority</label>
                    <select value={editPositionForm.urgency || '🟡 Medium Priority'} onChange={e => setEditPositionForm(prev => ({ ...prev, urgency: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      {POSITION_URGENCIES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Work Mode / Location Type</label>
                    <select value={editPositionForm.work_mode || 'On-Site (Plant / Office)'} onChange={e => setEditPositionForm(prev => ({ ...prev, work_mode: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      {POSITION_WORK_MODES.map(wm => <option key={wm} value={wm}>{wm}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 8: Shift Type & Gender Preference (2-Column Grid) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Shift Type</label>
                    <select value={editPositionForm.shift_type || 'General Shift (Day)'} onChange={e => setEditPositionForm(prev => ({ ...prev, shift_type: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      {POSITION_SHIFT_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Gender Preference</label>
                    <select value={editPositionForm.gender_preference || 'No Preference (Any)'} onChange={e => setEditPositionForm(prev => ({ ...prev, gender_preference: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}>
                      {POSITION_GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 9: Deadline Date & Interviewer Name (2-Column Grid) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Deadline Date</label>
                    <input type="date" value={editPositionForm.deadline_date || ''} onChange={e => setEditPositionForm(prev => ({ ...prev, deadline_date: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Interviewer Name</label>
                    <SearchableEmployeeSelect
                      employees={teamMembers}
                      selectedEmail={editPositionForm.interviewer_name || ''}
                      onSelect={(emp) => setEditPositionForm(prev => ({ ...prev, interviewer_name: emp ? (emp.emp_name || emp.name || emp.email) : '' }))}
                      placeholder="Search interviewer..."
                    />
                  </div>
                </div>

                {/* Recruiter Assigned */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>🎯 Assign Recruiter (HR Recruitment Team)</label>
                  <select 
                    value={editPositionForm.recruiter_assigned || 'All'} 
                    onChange={e => setEditPositionForm(prev => ({ ...prev, recruiter_assigned: e.target.value }))} 
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}
                  >
                    <option value="All">📢 All Recruiters (Anyone can Claim)</option>
                    {recruitersList.map(r => (
                      <option key={r.user_id || r.emp_id} value={r.emp_name}>
                        {r.emp_name}{r.emp_id && !r.emp_name.includes(r.emp_id) ? ` (${r.emp_id})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Key Skills / Tags */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Key Skills / Tags (Type & Auto-Suggest or Click Popular)</label>
                  <InteractiveSkillTagInput
                    value={editPositionForm.key_skills || ''}
                    onChange={(val) => setEditPositionForm(prev => ({ ...prev, key_skills: val }))}
                  />
                </div>

                {/* S01 Posting Status & Channels Checklist */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', borderRadius: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      📢 S01 Job Posting Status
                    </label>
                    <select
                      value={editPositionForm.posting_status || 'Draft'}
                      onChange={e => setEditPositionForm(prev => ({ ...prev, posting_status: e.target.value }))}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        fontWeight: 700,
                        fontSize: '0.82rem'
                      }}
                    >
                      <option value="Draft">🟡 Draft</option>
                      <option value="Posted">🟢 Posted</option>
                      <option value="Paused">🟠 Paused</option>
                      <option value="Closed">🔴 Closed</option>
                    </select>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        🌐 Job Posting Channels (Where is this position posted?)
                      </label>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          onClick={() => setEditPositionForm(prev => ({ ...prev, posting_sources: [...STANDARD_POSTING_SOURCES] }))}
                          style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: 'pointer' }}
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditPositionForm(prev => ({ ...prev, posting_sources: [] }))}
                          style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: 'pointer', color: '#dc2626' }}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.45rem' }}>
                      {STANDARD_POSTING_SOURCES.map(source => {
                        const isChecked = Array.isArray(editPositionForm.posting_sources) && editPositionForm.posting_sources.includes(source);
                        return (
                          <label
                            key={source}
                            onClick={() => {
                              const curr = Array.isArray(editPositionForm.posting_sources) ? editPositionForm.posting_sources : [];
                              const next = curr.includes(source) ? curr.filter(s => s !== source) : [...curr, source];
                              setEditPositionForm(prev => ({ ...prev, posting_sources: next }));
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.45rem',
                              padding: '0.45rem 0.6rem',
                              borderRadius: '6px',
                              border: isChecked ? '1px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                              backgroundColor: isChecked ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-surface)',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: isChecked ? 700 : 500,
                              color: isChecked ? 'var(--accent-color, #2563eb)' : 'var(--text-primary)',
                              userSelect: 'none'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: 'var(--accent-color, #2563eb)' }}
                            />
                            <span>{source}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* JD */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Job Description (JD Summary)</label>
                  <textarea 
                    rows="4" 
                    value={editPositionForm.jd_text} 
                    onChange={e => setEditPositionForm(prev => ({ ...prev, jd_text: e.target.value }))} 
                    placeholder="Add detailed job roles, skills required, experience, qualifications etc..."
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical', fontSize: '0.85rem' }}
                  />
                </div>

              </div>

              {/* Pinned Sticky Footer - NEVER SCROLLS AWAY */}
              <div style={{ 
                padding: '0.9rem 1.5rem', 
                borderTop: '1px solid var(--border-light)', 
                background: 'var(--bg-surface)', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                flexShrink: 0, 
                gap: '1rem', 
                flexWrap: 'wrap' 
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  ID: {editingPosition.id ? `POS-${editingPosition.id.substring(0, 8).toUpperCase()}` : ''}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <button 
                    type="button" 
                    onClick={() => setEditingPosition(null)} 
                    style={{ padding: '0.55rem 1.25rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={savingEditPos} 
                    className="btn-primary" 
                    style={{ padding: '0.55rem 1.5rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem' }}
                  >
                    {savingEditPos ? 'Saving...' : '💾 Save Changes'}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Candidate (Full ATS Rich Profile matching /apply/[id]) */}
      {isCandidateModalOpen && (
        <div 
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            backgroundColor: 'rgba(9, 13, 22, 0.65)', backdropFilter: 'blur(5px)',
            zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' 
          }}
          onClick={() => setIsCandidateModalOpen(false)}
        >
          <div 
            className="card" 
            onClick={e => e.stopPropagation()}
            style={{ 
              width: '840px', maxWidth: '96vw', maxHeight: '92vh', height: 'auto',
              backgroundColor: 'var(--bg-surface)', borderRadius: '16px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column',
              overflow: 'hidden', padding: 0
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)' }}>
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Register Candidate Profile</h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Direct S02 (Resume Filtered) registration with complete ATS applicant profile</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsCandidateModalOpen(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.35rem', color: 'var(--text-secondary)', borderRadius: '6px' }}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Modal Body */}
            <form onSubmit={handleCreateCandidate} style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              
              {/* Card 1: Job Requirement / Target Position */}
              <div className="card" style={{ padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', background: 'var(--bg-surface-variant, #f8fafc)', border: '1px solid var(--border-light)' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Briefcase size={14} style={{ color: 'var(--accent-color)' }} /> Applying For Job Position *
                </label>
                <select 
                  required 
                  value={newCandidate.position_id} 
                  onChange={e => setNewCandidate({...newCandidate, position_id: e.target.value})} 
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}
                >
                  <option value="">Select Open Job Position...</option>
                  {positions.map(pos => {
                    const posCode = formatPositionCode(pos);
                    return (
                      <option key={pos.id} value={pos.id}>
                        {posCode ? `[${posCode}] ` : ''}{pos.title} — {pos.department} ({pos.openings || 1} Openings) [{pos.branch_code || 'NSMLR'}]
                      </option>
                    );
                  })}
                </select>
                {newCandidate.position_id && (() => {
                  const selectedPos = positions.find(p => p.id === newCandidate.position_id);
                  if (!selectedPos) return null;
                  const posCode = formatPositionCode(selectedPos);
                  return (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.72rem', marginTop: '0.1rem' }}>
                      {posCode && (
                        <span style={{ padding: '0.15rem 0.5rem', borderRadius: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontWeight: 700 }}>
                          {posCode}
                        </span>
                      )}
                      <span style={{ padding: '0.15rem 0.5rem', borderRadius: '6px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                        Dept: <strong>{selectedPos.department}</strong>
                      </span>
                      <span style={{ padding: '0.15rem 0.5rem', borderRadius: '6px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                        Branch: <strong>{formatBranchStandard(selectedPos.branch_code || selectedPos.workspace_branch_code)}</strong>
                      </span>
                      <span style={{ padding: '0.15rem 0.5rem', borderRadius: '6px', background: '#dcfce7', border: '1px solid #bbf7d0', color: '#166534', fontWeight: 600 }}>
                        {selectedPos.openings || 1} Vacancies Open
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Card 2: Candidate Personal & Contact Information */}
              <div className="card" style={{ padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--bg-surface)' }}>
                <h4 style={{ fontSize: '0.82rem', fontWeight: 700, margin: 0, color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Users size={14} /> Candidate Contact &amp; Personal Details
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Candidate Full Name *</label>
                  <input 
                    required 
                    type="text" 
                    value={newCandidate.name} 
                    onChange={e => setNewCandidate({...newCandidate, name: e.target.value})} 
                    placeholder="e.g. Rahul Sharma" 
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} 
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Primary Mobile Number *</label>
                    <input 
                      required 
                      type="tel" 
                      maxLength={10}
                      value={newCandidate.phone} 
                      onChange={e => setNewCandidate({...newCandidate, phone: e.target.value.replace(/[^0-9]/g, '')})} 
                      placeholder="10-digit mobile" 
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Alternate Mobile Number</label>
                    <input 
                      type="tel" 
                      maxLength={10}
                      value={newCandidate.alternate_phone} 
                      onChange={e => setNewCandidate({...newCandidate, alternate_phone: e.target.value.replace(/[^0-9]/g, '')})} 
                      placeholder="Optional 10-digit" 
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} 
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email Address</label>
                    <input 
                      type="email" 
                      value={newCandidate.email} 
                      onChange={e => setNewCandidate({...newCandidate, email: e.target.value})} 
                      placeholder="candidate@gmail.com" 
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} 
                    />
                  </div>
                  
                  {/* Current City with Search Autocomplete */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', position: 'relative' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>City / Location (Search or Type)</label>
                    <input 
                      type="text" 
                      value={newCandidate.current_city} 
                      onChange={e => {
                        setNewCandidate({...newCandidate, current_city: e.target.value});
                        setShowCandidateCityDropdown(true);
                      }} 
                      onFocus={() => setShowCandidateCityDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCandidateCityDropdown(false), 200)}
                      placeholder="e.g. Ludhiana, Raian, Chandigarh..." 
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} 
                    />
                    {showCandidateCityDropdown && candidateCitySuggestions.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                        backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                        borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                        maxHeight: '160px', overflowY: 'auto', marginTop: '4px'
                      }}>
                        {candidateCitySuggestions.map(city => (
                          <div 
                            key={city}
                            onMouseDown={() => {
                              setNewCandidate(prev => ({ ...prev, current_city: city }));
                              setShowCandidateCityDropdown(false);
                            }}
                            style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-surface-variant)'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            📍 {city}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Card 3: Experience & Qualification (Categorized) */}
              <div className="card" style={{ padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--bg-surface)' }}>
                <h4 style={{ fontSize: '0.82rem', fontWeight: 700, margin: 0, color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Award size={14} /> Professional &amp; Educational Background
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', width: '100%' }}>
                  {/* Total Experience */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Experience</label>
                    <select 
                      value={newCandidate.total_experience} 
                      onChange={e => setNewCandidate({...newCandidate, total_experience: e.target.value})}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
                    >
                      <option value="">Select Experience Level...</option>
                      {EXPERIENCE_LEVEL_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>

                  {/* Highest Qualification with Categorized Optgroups */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Highest Qualification</label>
                    <select 
                      value={newCandidate.highest_qualification} 
                      onChange={e => setNewCandidate({...newCandidate, highest_qualification: e.target.value})}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
                    >
                      <option value="">Select Qualification...</option>
                      {QUALIFICATION_CATEGORIES.map(cat => (
                        <optgroup key={cat.category} label={cat.category}>
                          {cat.options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Current Monthly Salary (₹/month)</label>
                    <input 
                      type="number" 
                      value={newCandidate.current_salary} 
                      onChange={e => setNewCandidate({...newCandidate, current_salary: e.target.value})} 
                      placeholder="e.g. 25000" 
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} 
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Expected Salary Min - Max (₹/month)</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input 
                        type="number" 
                        value={newCandidate.expected_salary_min} 
                        onChange={e => setNewCandidate({...newCandidate, expected_salary_min: e.target.value})} 
                        placeholder="Min" 
                        style={{ width: '50%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} 
                      />
                      <input 
                        type="number" 
                        value={newCandidate.expected_salary_max} 
                        onChange={e => setNewCandidate({...newCandidate, expected_salary_max: e.target.value})} 
                        placeholder="Max" 
                        style={{ width: '50%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} 
                      />
                    </div>
                  </div>
                </div>

                {/* Notice Period */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Notice Period / Availability</label>
                  <select 
                    value={newCandidate.notice_period} 
                    onChange={e => setNewCandidate({...newCandidate, notice_period: e.target.value})}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
                  >
                    <option value="">Select Notice Period...</option>
                    {NOTICE_PERIOD_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Card 4: Key Skills, Remarks & Resume Upload */}
              <div className="card" style={{ padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--bg-surface)' }}>
                <h4 style={{ fontSize: '0.82rem', fontWeight: 700, margin: 0, color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <FileText size={14} /> Key Skills, Remarks &amp; Resume
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Key Skills / Candidate Remarks</label>
                  <textarea 
                    rows={2} 
                    value={newCandidate.cover_note} 
                    onChange={e => setNewCandidate({...newCandidate, cover_note: e.target.value})} 
                    placeholder="Enter candidate summary, CNC/VMC machines operated, ERP skills, communication proficiency..." 
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical' }} 
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Resume / CV Link or Upload Document</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%' }}>
                    <input 
                      type="url" 
                      value={newCandidate.resume_url} 
                      onChange={e => setNewCandidate({...newCandidate, resume_url: e.target.value})} 
                      placeholder="Paste resume link (Drive, Dropbox) or click Upload" 
                      style={{ flex: 1, width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', minWidth: 0 }} 
                    />
                    <label className="btn-secondary" style={{ display: 'inline-flex', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-surface-variant)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: uploadingResume ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                      {uploadingResume ? 'Uploading...' : 'Upload File'}
                      <input type="file" accept=".pdf,.doc,.docx,.rtf,.txt" onChange={handleResumeUpload} style={{ display: 'none' }} disabled={uploadingResume} />
                    </label>
                  </div>
                  {newCandidate.resume_url && (
                    <div style={{ fontSize: '0.72rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                      <CheckCircle size={12} /> Resume file attached
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Sticky Footer */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Entry Stage: <strong style={{ color: 'var(--text-primary)' }}>S02 — Resume Filtered</strong>
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    type="button" 
                    onClick={() => setIsCandidateModalOpen(false)} 
                    style={{ padding: '0.5rem 1rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-surface)', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isRegisteringCandidate || uploadingResume}
                    className="btn-primary" 
                    style={{ padding: '0.5rem 1.4rem', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    {isRegisteringCandidate ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Registering...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus size={15} />
                        <span>Register Candidate</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div 
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(9, 13, 22, 0.65)', backdropFilter: 'blur(8px)',
            zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center'
          }}
          onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        >
          <div 
            style={{
              width: '100%', maxWidth: '420px', backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-light)', borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)', padding: '1.5rem 1.75rem',
              display: 'flex', flexDirection: 'column', gap: '1.25rem', zIndex: 10000,
              transform: 'scale(1)', transition: 'transform 0.2s ease', margin: '1rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {confirmModal.title}
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {confirmModal.message}
              </p>
            </div>

            <div style={{ display: 'flex', justifyItems: 'flex-end', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)',
                  backgroundColor: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem',
                  fontWeight: 600, cursor: 'pointer', transition: 'background-color 0.2s'
                }}
              >
                {confirmModal.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (confirmModal.onConfirm) {
                    await confirmModal.onConfirm();
                  }
                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                }}
                style={{
                  padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none',
                  backgroundColor: 'var(--accent-color)', color: 'white', fontSize: '0.85rem',
                  fontWeight: 700, cursor: 'pointer', transition: 'background-color 0.2s',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                }}
              >
                {confirmModal.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Full Job Description (JD) Preview & Copy */}
      {selectedJdPosition && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem', backdropFilter: 'blur(3px)' }}
          onClick={() => setSelectedJdPosition(null)}
        >
          <div 
            className="card" 
            onClick={e => e.stopPropagation()}
            style={{ width: '720px', maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: '14px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.35)', background: 'var(--bg-surface)' }}
          >
            {/* Header */}
            <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#3b82f615', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                  📄
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Job Description — {selectedJdPosition.title}
                  </h3>
                  <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {selectedJdPosition.department} • {selectedJdPosition.openings || 1} Openings • {selectedJdPosition.branch_code || selectedJdPosition.workspace_branch_code || 'All Plants'}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedJdPosition(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.3rem' }} title="Close">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', backgroundColor: 'var(--bg-primary)' }}>
              <div style={{
                backgroundColor: 'var(--bg-surface)',
                padding: '1.25rem',
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.6,
                fontSize: '0.85rem',
                color: 'var(--text-primary)'
              }}>
                {selectedJdPosition.jd_text || 'No Job Description content logged.'}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '0.9rem 1.5rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', flexShrink: 0 }}>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(selectedJdPosition.jd_text || '');
                    alert('Job Description copied to clipboard! ✓');
                  } catch (e) {
                    prompt('Copy JD text below:', selectedJdPosition.jd_text || '');
                  }
                }}
                className="btn-secondary"
                style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                📋 Copy Full JD
              </button>
              <button
                type="button"
                onClick={() => setSelectedJdPosition(null)}
                className="btn-primary"
                style={{ padding: '0.45rem 1.25rem', fontSize: '0.8rem', fontWeight: 600 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Job Posting Channels / Sources Checklist */}
      {editingChannelsPos && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem', backdropFilter: 'blur(3px)' }}
          onClick={() => setEditingChannelsPos(null)}
        >
          <div 
            className="card" 
            onClick={e => e.stopPropagation()}
            style={{ width: '640px', maxWidth: '95vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: '14px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.35)', background: 'var(--bg-surface)' }}
          >
            {/* Header */}
            <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#10b98115', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                  🌐
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Tag Job Posting Channels
                  </h3>
                  <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Mark where this JD is active ({editingChannelsPos.title})
                  </p>
                </div>
              </div>
              <button onClick={() => setEditingChannelsPos(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.3rem' }} title="Close">
                <X size={18} />
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div style={{ padding: '0.65rem 1.5rem', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Active: <strong style={{ color: 'var(--accent-color, #2563eb)' }}>{tempChannels.length}</strong> of {STANDARD_POSTING_SOURCES.length} channels
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleSelectAllChannels}
                  style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: 'pointer', fontWeight: 600 }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearAllChannels}
                  style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: 'pointer', fontWeight: 600, color: '#dc2626' }}
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Checklist Grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
              {STANDARD_POSTING_SOURCES.map(source => {
                const isChecked = tempChannels.includes(source);
                return (
                  <label
                    key={source}
                    onClick={() => handleToggleChannel(source)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      padding: '0.75rem 0.9rem',
                      borderRadius: '8px',
                      border: isChecked ? '1px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                      backgroundColor: isChecked ? 'rgba(37, 99, 235, 0.07)' : 'var(--bg-surface)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      userSelect: 'none'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--accent-color, #2563eb)' }}
                    />
                    <span style={{ fontSize: '0.82rem', fontWeight: isChecked ? 700 : 500, color: isChecked ? 'var(--accent-color, #2563eb)' : 'var(--text-primary)' }}>
                      {source}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: '0.9rem 1.5rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', background: 'var(--bg-surface)', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setEditingChannelsPos(null)}
                style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveChannels}
                disabled={savingChannels}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.82rem' }}
              >
                {savingChannels ? 'Saving...' : '💾 Save Channels'}
              </button>
            </div>
          </div>
        </div>
      )}


      </>
      )}

    </div>
  );
}
