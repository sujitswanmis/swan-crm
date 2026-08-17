'use client';

import React, { useState } from 'react';
import { 
  FileSpreadsheet, Cpu, Globe, Link2, GitBranch, Factory, 
  MapPin, MessageSquare, BarChart3, FileText, CheckCircle2, 
  Sparkles, ArrowRight, ExternalLink, ShieldCheck, Clock, 
  Layers, Users, Smartphone, Send, Mail, Phone, Building2,
  ChevronRight, Award, Database, Terminal, ArrowUpRight, Zap, Check
} from 'lucide-react';
import { submitPortfolioInquiry } from '@/app/actions/portfolioInquiry';

export default function PortfolioWebsite() {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedProject, setSelectedProject] = useState(null);
  
  // Inquiry Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    service: 'Google Sheets & MIS Automation',
    message: ''
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [formError, setFormError] = useState('');

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError('');
    setFormSuccess(false);

    try {
      const res = await submitPortfolioInquiry(formData);
      if (res.success) {
        setFormSuccess(true);
        setFormData({
          name: '',
          phone: '',
          email: '',
          company: '',
          service: 'Google Sheets & MIS Automation',
          message: ''
        });
      } else {
        setFormError(res.error || 'Failed to submit inquiry.');
      }
    } catch (err) {
      setFormError('An unexpected error occurred. Please reach out on WhatsApp directly.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const services = [
    {
      id: 'mis',
      title: 'Google Sheets & MIS Automation',
      icon: <FileSpreadsheet className="text-emerald-400" size={28} />,
      desc: 'Automated executive reporting, multi-sheet data consolidation, advanced formulas (QUERY, ARRAYFORMULA, XLOOKUP), data cleaning, duplicate removal, and dynamic master data architectures.',
      tags: ['QUERY', 'ARRAYFORMULA', 'Data Cleaning', 'Master Data', 'Consolidation']
    },
    {
      id: 'gas',
      title: 'Google Apps Script Development',
      icon: <Cpu className="text-amber-400" size={28} />,
      desc: 'Custom enterprise scripts, time-driven triggers, automated batch data sync, dynamic email & WhatsApp dispatch, error handling queues, custom UI menus, and Drive file indexing.',
      tags: ['Time Triggers', 'Batch Processing', 'Error Logging', 'Drive Indexing', 'Event Triggers']
    },
    {
      id: 'forms',
      title: 'Custom Web Forms & Apps',
      icon: <Globe className="text-blue-400" size={28} />,
      desc: 'Mobile-responsive HTML/JS web forms with dynamic row additions, dependent dropdowns, autocomplete, LocalStorage draft recovery, instant PDF generation, and live backend submission.',
      tags: ['HTML5/CSS3/JS', 'Dynamic Rows', 'Draft Recovery', 'PDF Export', 'Live Validation']
    },
    {
      id: 'api',
      title: 'API & Webhook Integration',
      icon: <Link2 className="text-indigo-400" size={28} />,
      desc: 'REST API, Webhook Automation, JSON Data Processing, and Third-Party System Connectivity (TrackOlap, ESSL Attendance, AiSensy WhatsApp, Insprl URL Shortener, Zenscale).',
      tags: ['REST API', 'Webhooks', 'JSON Processing', 'Authentication Headers', 'Retry Queues']
    },
    {
      id: 'fms',
      title: 'Business Workflow & FMS Systems',
      icon: <GitBranch className="text-cyan-400" size={28} />,
      desc: 'Converting manual chaos into step-by-step digital workflows (S00..S85). Turnaround time (TAT) calculation, responsible person definition, escalation logic, and live pending-task tracking.',
      tags: ['Step Mapping (S00-S85)', 'TAT & Escalations', 'Purchase FMS', 'Sales FMS', 'Order-to-Delivery']
    },
    {
      id: 'manufacturing',
      title: 'Manufacturing Process Digitization',
      icon: <Factory className="text-rose-400" size={28} />,
      desc: 'Deep operational mapping for multi-step machinery & implement manufacturing (22-step & 85-step rotavator production), BOM tracking, material issue, WIP stages, job-work, and dispatch.',
      tags: ['Multi-Stage Tracking', 'BOM Workflows', 'Job-Work Monitoring', 'Rotavator Line', 'SOP Implementation']
    },
    {
      id: 'attendance',
      title: 'Smart Attendance & GPS Tracking',
      icon: <MapPin className="text-teal-400" size={28} />,
      desc: 'Smart attendance systems with live GPS geofencing, distance calculation, camera photo capture, mirrored preview, single check-in/out restrictions, and TrackOlap/ESSL sync.',
      tags: ['GPS Geofencing', 'Live Photo Capture', 'One In/Out Rule', 'TrackOlap Sync', 'Distance Matrix']
    },
    {
      id: 'messaging',
      title: 'WhatsApp & Email Automation',
      icon: <MessageSquare className="text-emerald-400" size={28} />,
      desc: 'Personalized dealer & customer communication, batch broadcast campaigns, dynamic variable substitution, short-URL click tracking, duplicate-send prevention, and failed message retry.',
      tags: ['Personalized Batching', 'Duplicate Prevention', 'Dynamic Variables', 'Campaign Logging', 'Retry Queues']
    },
    {
      id: 'dashboards',
      title: 'Executive Dashboards & KPI Reporting',
      icon: <BarChart3 className="text-purple-400" size={28} />,
      desc: 'Interactive KPI dashboards in Google Sheets and Looker Studio. Real-time employee performance, sales pipelines, production bottlenecks, attendance summaries, and management reviews.',
      tags: ['Looker Studio', 'KPI Dashboards', 'Sales Performance', 'Bottleneck Tracking', 'Executive Summaries']
    }
  ];

  const projects = [
    {
      id: 'proj-1',
      category: 'hardware',
      title: 'GPS-Based Smart Attendance System',
      subtitle: 'Geofenced Mobile Attendance with Photo Capture & Sheet Backend',
      challenge: 'Manual attendance suffered from proxy punches, lack of location verification, and delayed compilation into payroll.',
      solution: 'Engineered an interactive web-based attendance terminal featuring live GPS geofencing (distance calculation vs office coordinates), front camera photo capture with mirrored preview, strict 1-Check-in/1-Check-out per day logic, and direct Google Sheets live logging.',
      stack: ['HTML5/JS', 'GPS Geolocation API', 'WebRTC Camera', 'Google Apps Script', 'Google Sheets DB'],
      impact: '100% proxy elimination, real-time employee tracking, and zero manual consolidation time.'
    },
    {
      id: 'proj-2',
      category: 'fms',
      title: 'Automated 85-Step Manufacturing & Purchase FMS',
      subtitle: 'Multi-Stage Production Workflow & Bottleneck Escalation System',
      challenge: 'A heavy machinery manufacturing plant faced severe delivery delays, untracked component shortages, and zero visibility into job-work stages.',
      solution: 'Mapped and digitized an 85-step multi-stage manufacturing & procurement FMS (S00 to S85) covering raw material requisition, BOM breakdown, machine shop stages, vendor job-work, assembly, testing, paint shop, and final dispatch with automated Turnaround Time (TAT) and escalation alerts.',
      stack: ['Google Sheets Advanced', 'Google Apps Script', 'SOP Documentation', 'Automated Email Triggers', 'Status Dashboard'],
      impact: 'Reduced production turnaround time by 32% and provided management with instant visibility into pending bottleneck stages.'
    },
    {
      id: 'proj-3',
      category: 'api',
      title: 'TrackOlap Attendance REST API Integration',
      subtitle: 'Automated Daily Sync & Employee Attendance Transformation',
      challenge: 'Attendance data trapped inside TrackOlap portal required daily manual exports and tedious formatting for reporting.',
      solution: 'Developed an automated Google Apps Script pipeline that executes scheduled GET requests to TrackOlap REST APIs, parses nested JSON responses with pagination, processes check-in/out timestamps, and synchronizes clean employee attendance records directly into master sheets.',
      stack: ['REST API', 'OAuth / Auth Headers', 'JSON Parsing', 'Time Triggers', 'Error Logging'],
      impact: 'Saved 2+ hours of daily manual MIS effort with 100% automated scheduled synchronization.'
    },
    {
      id: 'proj-4',
      category: 'automation',
      title: 'WhatsApp Marketing & Dealer Notification Engine',
      subtitle: 'Personalized Batch Broadcast with Duplicate Prevention & Retry',
      challenge: 'Broadcasting operational notices, payment reminders, and marketing updates to 500+ dealers manually on WhatsApp was error-prone and time-consuming.',
      solution: 'Built a custom WhatsApp automation engine utilizing AiSensy / Meta Webhook APIs. Features include personalized contact variables, short URL tracking, duplicate message guards, failed delivery auto-retry queues, and detailed transmission status logging.',
      stack: ['AiSensy API', 'Google Apps Script', 'Insprl URL Shortener', 'JSON Webhooks', 'Batch Queue Manager'],
      impact: 'Enabled 1-click personalized dispatches to 500+ dealers with complete delivery and click verification.'
    },
    {
      id: 'proj-5',
      category: 'web',
      title: 'Dynamic Purchase Order & O2D Web Forms',
      subtitle: 'Responsive Multi-Item Entry with LocalStorage Draft Recovery',
      challenge: 'Sales reps and purchase officers made frequent formatting errors when submitting multi-line orders from mobile devices.',
      solution: 'Created a responsive web app with dynamic line-item addition/removal, searchable vendor dropdowns, auto-calculated totals, LocalStorage draft preservation (recovering unsaved work on browser reload), print preview, and instant PDF generation upon backend submission.',
      stack: ['Vanilla HTML/CSS/JS', 'LocalStorage API', 'PDF Generation', 'Google Apps Script Web App', 'Google Sheets'],
      impact: 'Zero data loss during field orders, standardized PO formats, and direct real-time database recording.'
    },
    {
      id: 'proj-6',
      category: 'automation',
      title: 'Google Drive File Management & Cataloging System',
      subtitle: 'Automated Folder Scanning, Metadata Indexing & Playback Links',
      challenge: 'Thousands of technical drawings, customer voice logs, and product videos scattered across Drive without unified indexing.',
      solution: 'Engineered a recursive Google Apps Script scanner that traverses deep Drive folder hierarchies, extracts metadata (file size, mime type, last modified, owner), generates direct playback/preview URLs, and maintains a clean, searchable sheet catalog with duplicate elimination.',
      stack: ['Google Drive API', 'Google Apps Script', 'MIME Type Filtering', 'Recursive Directory Traversal'],
      impact: 'Instant searchability across 10,000+ files and automated catalog maintenance.'
    },
    {
      id: 'proj-7',
      category: 'api',
      title: 'Custom URL Shortener & Click Tracking Gateway',
      subtitle: 'API-Driven Custom Domain Links for WhatsApp & SMS Campaigns',
      challenge: 'Long spreadsheet links caused high SMS character costs and looked unprofessional in dealer communications.',
      solution: 'Integrated the Insprl URL Shortener API into automated dispatch workflows. Generates branded short links dynamically, logs short codes with destination mapping, and implements fallback handling if the API is momentarily unavailable.',
      stack: ['Insprl REST API', 'POST Request Automation', 'Fallback Handlers', 'Campaign Analytics'],
      impact: 'Reduced SMS character consumption by 45% and enabled granular click-through tracking on dealer broadcasts.'
    },
    {
      id: 'proj-8',
      category: 'dashboards',
      title: 'Employee KPI, Task Delegation & Compliance Dashboard',
      subtitle: 'Real-Time Task Monitoring, Checklist Compliance & Executive Review',
      challenge: 'Management lacked a single pane of glass to review daily delegated tasks, pending checklist submissions, and team performance.',
      solution: 'Designed an executive KPI dashboard in Google Sheets & Looker Studio. Aggregates live task delegation data, tracks planned vs actual completion dates, calculates compliance percentages, and highlights overdue tasks by department.',
      stack: ['Looker Studio', 'Advanced Pivot Tables', 'QUERY / IMPORTRANGE', 'Conditional Visual Alerts'],
      impact: 'Increased on-time task completion rate from 68% to 94% across cross-functional departments.'
    }
  ];

  const filteredProjects = activeTab === 'all' 
    ? projects 
    : projects.filter(p => p.category === activeTab);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0f1d',
      color: '#f1f5f9',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Outfit', 'Inter', sans-serif",
      lineHeight: 1.6,
      overflowX: 'hidden'
    }}>
      {/* Global CSS Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        * { box-sizing: border-box; }
        ::selection { background: #3b82f6; color: #ffffff; }
        
        .nav-link {
          color: #94a3b8;
          text-decoration: none;
          font-size: 0.92rem;
          font-weight: 500;
          transition: all 0.2s ease;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
        }
        .nav-link:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.05);
        }

        .btn-primary {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 0.75rem 1.6rem;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          text-decoration: none;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
          transition: all 0.25s ease;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(37, 99, 235, 0.5);
        }

        .btn-secondary {
          background: rgba(30, 41, 59, 0.8);
          color: #e2e8f0;
          border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 0.75rem 1.6rem;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          text-decoration: none;
          backdrop-filter: blur(10px);
          transition: all 0.25s ease;
        }
        .btn-secondary:hover {
          background: rgba(51, 65, 85, 0.9);
          border-color: rgba(255, 255, 255, 0.25);
          color: #ffffff;
          transform: translateY(-2px);
        }

        .glass-card {
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          backdrop-filter: blur(12px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .glass-card:hover {
          border-color: rgba(59, 130, 246, 0.4);
          transform: translateY(-4px);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
        }

        .filter-btn {
          background: rgba(30, 41, 59, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          padding: 0.55rem 1.15rem;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .filter-btn:hover, .filter-btn.active {
          background: #2563eb;
          color: #ffffff;
          border-color: #3b82f6;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
        }

        .code-tag {
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #38bdf8;
          padding: 0.2rem 0.55rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-family: monospace;
        }

        .formula-pill {
          background: rgba(15, 23, 42, 0.9);
          border: 1px solid rgba(56, 189, 248, 0.25);
          color: #7dd3fc;
          padding: 0.45rem 0.9rem;
          border-radius: 8px;
          font-size: 0.82rem;
          font-family: monospace;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          transition: all 0.2s;
        }
        .formula-pill:hover {
          background: rgba(56, 189, 248, 0.12);
          border-color: #38bdf8;
          transform: translateY(-2px);
        }

        .fms-step {
          position: relative;
          padding: 1.25rem;
          border-radius: 12px;
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: all 0.2s;
        }
        .fms-step:hover {
          background: rgba(30, 41, 59, 0.9);
          border-color: #38bdf8;
        }

        .form-input {
          width: 100%;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 10px;
          padding: 0.85rem 1.1rem;
          color: #ffffff;
          font-size: 0.92rem;
          outline: none;
          transition: all 0.2s;
        }
        .form-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
        }

        /* Ambient Glow Blobs */
        .ambient-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          pointer-events: none;
          z-index: 0;
        }
      `}} />

      {/* BACKGROUND DECORATIVE GLOWS */}
      <div className="ambient-glow" style={{ top: '5%', left: '10%', width: '400px', height: '400px', background: 'rgba(37, 99, 235, 0.12)' }} />
      <div className="ambient-glow" style={{ top: '35%', right: '5%', width: '450px', height: '450px', background: 'rgba(14, 165, 233, 0.09)' }} />
      <div className="ambient-glow" style={{ bottom: '15%', left: '15%', width: '500px', height: '500px', background: 'rgba(99, 102, 241, 0.1)' }} />

      {/* TOP NAVIGATION BAR */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(10, 15, 29, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '1rem 2rem'
      }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          
          {/* Brand Logo */}
          <a href="#" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '1.2rem',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)'
            }}>
              SG
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                SuPuja Creations
                <span style={{ fontSize: '0.65rem', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '0.1rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 700 }}>
                  Automation
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Sujit Kumar Gupta • Senior MIS Specialist
              </div>
            </div>
          </a>

          {/* Desktop Nav Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <a href="#about" className="nav-link">About</a>
            <a href="#services" className="nav-link">Services</a>
            <a href="#fms" className="nav-link">FMS & Workflows</a>
            <a href="#projects" className="nav-link">Case Studies</a>
            <a href="#skills" className="nav-link">Skills</a>
            <a href="#contact" className="nav-link">Contact</a>
          </nav>

          {/* Action CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <a href="/login" className="btn-secondary" style={{ padding: '0.55rem 1.1rem', fontSize: '0.88rem' }}>
              <Building2 size={16} />
              CRM Workplace
            </a>
            <a href="#contact" className="btn-primary" style={{ padding: '0.55rem 1.25rem', fontSize: '0.88rem' }}>
              <Send size={15} />
              Hire / Consult
            </a>
          </div>

        </div>
      </header>

      {/* HERO SECTION */}
      <section style={{ position: 'relative', zIndex: 1, padding: '5.5rem 1.5rem 4rem 1.5rem', maxWidth: '1240px', margin: '0 auto' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxWidth: '900px', margin: '0 auto' }}>
          
          {/* Status Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(37, 99, 235, 0.12)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            padding: '0.4rem 1rem',
            borderRadius: '30px',
            fontSize: '0.85rem',
            color: '#93c5fd',
            marginBottom: '1.75rem'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 8px #22c55e' }} />
            Available for Business Automation, FMS & MIS Architecture
          </div>

          {/* Name & Title */}
          <h1 style={{
            fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            margin: '0 0 1rem 0',
            color: '#ffffff'
          }}>
            Sujit Kumar Gupta
          </h1>

          <div style={{
            fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)',
            fontWeight: 600,
            color: '#38bdf8',
            marginBottom: '1.5rem',
            letterSpacing: '-0.01em'
          }}>
            Senior MIS & Business Automation Specialist
          </div>

          {/* Main Headline */}
          <p style={{
            fontSize: 'clamp(1.05rem, 2vw, 1.25rem)',
            color: '#cbd5e1',
            lineHeight: 1.65,
            margin: '0 0 1rem 0',
            maxWidth: '780px',
            fontWeight: 400
          }}>
            I build practical business automation systems using <strong style={{ color: '#ffffff' }}>Google Sheets</strong>, <strong style={{ color: '#ffffff' }}>Google Apps Script</strong>, <strong style={{ color: '#ffffff' }}>REST APIs</strong>, <strong style={{ color: '#ffffff' }}>interactive dashboards</strong>, and modern web applications.
          </p>

          <p style={{
            fontSize: '0.98rem',
            color: '#94a3b8',
            margin: '0 0 2.5rem 0',
            maxWidth: '700px'
          }}>
            Helping organizations digitize sales, purchase, production, attendance, reporting, and complex operational workflows without disruption.
          </p>

          {/* Hero CTAs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center', marginBottom: '3.5rem' }}>
            <a href="#services" className="btn-primary">
              <Zap size={18} />
              Explore My Services
            </a>
            <a href="#projects" className="btn-secondary">
              <Layers size={18} />
              View Case Studies
            </a>
            <a href="#contact" className="btn-secondary" style={{ background: 'rgba(15, 23, 42, 0.9)' }}>
              <MessageSquare size={18} />
              Discuss a Project
            </a>
          </div>

          {/* Quick Stats Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1.25rem',
            width: '100%',
            maxWidth: '1000px'
          }}>
            <div className="glass-card" style={{ padding: '1.5rem 1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#38bdf8', lineHeight: 1 }}>10+</div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.5rem', fontWeight: 500 }}>Years of Practical MIS & Operations Experience</div>
            </div>

            <div className="glass-card" style={{ padding: '1.5rem 1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#4ade80', lineHeight: 1 }}>85-Step</div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.5rem', fontWeight: 500 }}>Complex Manufacturing FMS Workflows Digitized</div>
            </div>

            <div className="glass-card" style={{ padding: '1.5rem 1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#fbbf24', lineHeight: 1 }}>6,500+</div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.5rem', fontWeight: 500 }}>Govt Skill Portal Candidate Data Operations</div>
            </div>

            <div className="glass-card" style={{ padding: '1.5rem 1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#c084fc', lineHeight: 1 }}>50+</div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.5rem', fontWeight: 500 }}>Custom Automations, APIs & Web Applications</div>
            </div>
          </div>

        </div>

      </section>

      {/* CORE PHILOSOPHY / STRONG POSITIONING BANNER */}
      <section style={{ position: 'relative', zIndex: 1, padding: '3rem 1.5rem', background: 'linear-gradient(90deg, rgba(30, 58, 138, 0.25) 0%, rgba(15, 23, 42, 0.8) 50%, rgba(14, 116, 144, 0.25) 100%)', borderTop: '1px solid rgba(255, 255, 255, 0.08)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', textAlign: 'center' }}>
          
          <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#38bdf8', fontWeight: 700, marginBottom: '0.75rem' }}>
            Core Philosophy & Differentiator
          </div>

          <blockquote style={{
            fontSize: 'clamp(1.3rem, 3vw, 1.9rem)',
            fontWeight: 700,
            color: '#f8fafc',
            margin: '0 0 1rem 0',
            lineHeight: 1.35
          }}>
            &ldquo;I do not just prepare MIS reports. I design and automate complete business processes.&rdquo;
          </blockquote>

          <p style={{ fontSize: '1.05rem', color: '#94a3b8', margin: '0 0 2rem 0', fontStyle: 'italic' }}>
            (Main sirf reports nahi banata; main manual business processes ko structured digital systems mein convert karta hoon.)
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e2e8f0', fontSize: '0.92rem' }}>
              <CheckCircle2 size={18} color="#22c55e" />
              <span>Zero Fluff, 100% Practical</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e2e8f0', fontSize: '0.92rem' }}>
              <CheckCircle2 size={18} color="#22c55e" />
              <span>Scalable Architecture</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e2e8f0', fontSize: '0.92rem' }}>
              <CheckCircle2 size={18} color="#22c55e" />
              <span>Non-Disruptive Upgrades</span>
            </div>
          </div>

        </div>
      </section>

      {/* ABOUT ME SECTION */}
      <section id="about" style={{ position: 'relative', zIndex: 1, padding: '5rem 1.5rem', maxWidth: '1240px', margin: '0 auto' }}>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '3.5rem', alignItems: 'center' }}>
          
          {/* Left: Bio & Experience */}
          <div>
            <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#38bdf8', fontWeight: 700, marginBottom: '0.5rem' }}>
              About Me
            </div>
            <h2 style={{ fontSize: '2.3rem', fontWeight: 700, color: '#ffffff', margin: '0 0 1.5rem 0', lineHeight: 1.25 }}>
              10+ Years of Transforming Manual Business Operations into Digital Reality
            </h2>

            <p style={{ color: '#cbd5e1', fontSize: '1.02rem', lineHeight: 1.7, marginBottom: '1.25rem' }}>
              I am a Senior MIS and Business Automation Specialist with over 10 years of hands-on experience in data management, process digitization, executive reporting, and workflow development.
            </p>

            <p style={{ color: '#94a3b8', fontSize: '0.96rem', lineHeight: 1.7, marginBottom: '1.25rem' }}>
              I specialize in building practical automation solutions using <strong>Google Sheets, Google Apps Script, REST APIs, HTML, CSS, JavaScript, and Looker Studio</strong>. I have architected and deployed systems across diverse verticals including Sales, Purchase, Production, Attendance, Inventory, Vendor Development, Marketing, Employee Performance, and Customer Complaint Management.
            </p>

            <p style={{ color: '#94a3b8', fontSize: '0.96rem', lineHeight: 1.7, marginBottom: '2rem' }}>
              My core strength is taking a messy, uncoordinated manual process, mapping it into a strict step-by-step framework (S00..S85), assigning responsible persons, defining Turnaround Times (TAT), and engineering an automated system that alerts bottlenecks in real time.
            </p>

            {/* Special Callout: Govt Portals */}
            <div className="glass-card" style={{ padding: '1.25rem', borderLeft: '4px solid #38bdf8' }}>
              <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.95rem', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Award size={18} color="#38bdf8" />
                Large-Scale Education & Government MIS Experience
              </div>
              <div style={{ fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.6 }}>
                Managed candidate registration, batch tracking, OJT records, assessment, placement, finance, and invoice reconciliations for over <strong>6,500+ candidates</strong> across portals like <strong>Skill India, HPKVN, Kaushal Bharat, Pragati, and Panjee</strong>.
              </div>
            </div>

          </div>

          {/* Right: Operational Competencies Card */}
          <div className="glass-card" style={{ padding: '2.5rem 2rem', background: 'rgba(15, 23, 42, 0.85)' }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <ShieldCheck size={22} color="#22c55e" />
              Operational Competencies
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ background: 'rgba(56, 189, 248, 0.1)', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#38bdf8' }}>
                  <FileSpreadsheet size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.95rem' }}>Master Data Architecture</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Unified single-source-of-truth structures for employees, dealers, vendors, customers, and BOM items.</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ background: 'rgba(251, 191, 36, 0.1)', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fbbf24' }}>
                  <Clock size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.95rem' }}>Turnaround Time (TAT) & Escalations</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Dynamic delay identification, automated email/WhatsApp alerts, and managerial escalation matrices.</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ background: 'rgba(34, 197, 94, 0.1)', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#22c55e' }}>
                  <Factory size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.95rem' }}>Manufacturing & Job-Work Tracking</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Multi-stage rotavator & agricultural implement workflows, stage-wise status calculation, and scrap reduction.</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ background: 'rgba(192, 132, 252, 0.1)', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#c084fc' }}>
                  <FileText size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.95rem' }}>SOP & Process Documentation</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Gemba observation points, audit checklists, weak-point analysis, and team training manuals.</div>
                </div>
              </div>

            </div>
          </div>

        </div>

      </section>

      {/* SERVICES SECTION */}
      <section id="services" style={{ position: 'relative', zIndex: 1, padding: '5rem 1.5rem', background: 'rgba(15, 23, 42, 0.5)', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          
          <div style={{ textAlign: 'center', maxWidth: '750px', margin: '0 auto 3.5rem auto' }}>
            <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#38bdf8', fontWeight: 700, marginBottom: '0.5rem' }}>
              What I Offer
            </div>
            <h2 style={{ fontSize: '2.3rem', fontWeight: 700, color: '#ffffff', margin: '0 0 1rem 0' }}>
              Specialized Automation & Digitization Services
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
              Practical, battle-tested solutions tailored to solve specific operational bottlenecks and save hundreds of man-hours each month.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '1.75rem'
          }}>
            {services.map((srv) => (
              <div key={srv.id} className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '1.25rem' }}>{srv.icon}</div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', margin: '0 0 0.75rem 0' }}>
                  {srv.title}
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: '1.5rem', flexGrow: 1 }}>
                  {srv.desc}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {srv.tags.map((tag, idx) => (
                    <span key={idx} className="code-tag">{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* MANUFACTURING & FMS SPECIALIZATION SECTION */}
      <section id="fms" style={{ position: 'relative', zIndex: 1, padding: '5rem 1.5rem', maxWidth: '1240px', margin: '0 auto' }}>
        
        <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto 3.5rem auto' }}>
          <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#38bdf8', fontWeight: 700, marginBottom: '0.5rem' }}>
            Unique Engineering Differentiator
          </div>
          <h2 style={{ fontSize: '2.3rem', fontWeight: 700, color: '#ffffff', margin: '0 0 1rem 0' }}>
            Manufacturing Process Digitization & Flow Control
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
            Specialized capability in mapping multi-step manufacturing pipelines (e.g. 22-Step & 85-Step Rotavator & Agri Implements Production) from Raw Material to Dispatch.
          </p>
        </div>

        {/* Visual Workflow Steps */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.5rem',
          marginBottom: '3rem'
        }}>
          
          <div className="fms-step">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>STAGE S01-S10</span>
              <Cpu size={16} color="#38bdf8" />
            </div>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#ffffff', fontSize: '1.05rem' }}>Requisition & Material Issue</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5 }}>
              Bill of Materials (BOM) validation, raw steel allocation, store issue slips, and stock reservation.
            </p>
          </div>

          <div className="fms-step">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24', background: 'rgba(251, 191, 36, 0.15)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>STAGE S11-S35</span>
              <Factory size={16} color="#fbbf24" />
            </div>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#ffffff', fontSize: '1.05rem' }}>Machining & Fabrication</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5 }}>
              Laser cutting, CNC bending, side plate welding, rotor shaft machining, and flange alignment.
            </p>
          </div>

          <div className="fms-step">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c084fc', background: 'rgba(192, 132, 252, 0.15)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>STAGE S36-S60</span>
              <Link2 size={16} color="#c084fc" />
            </div>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#ffffff', fontSize: '1.05rem' }}>Vendor Job-Work & Heat Treat</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5 }}>
              Outward challan generation, external heat treatment, gear hardening, vendor TAT tracking, and inward QC.
            </p>
          </div>

          <div className="fms-step">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#22c55e', background: 'rgba(34, 197, 94, 0.15)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>STAGE S61-S85</span>
              <CheckCircle2 size={16} color="#22c55e" />
            </div>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#ffffff', fontSize: '1.05rem' }}>Assembly, Paint & Dispatch</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5 }}>
              Gearbox fitment, blade mounting, powder coating, final quality inspection, serial numbering, and invoice dispatch.
            </p>
          </div>

        </div>

        {/* Key FMS Pillars Box */}
        <div className="glass-card" style={{ padding: '2rem 2.5rem', background: 'rgba(15, 23, 42, 0.85)' }}>
          <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', margin: '0 0 1rem 0' }}>
            How the FMS Architecture Enforces Accountability:
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#38bdf8', fontSize: '0.95rem', marginBottom: '0.25rem' }}>1. Strict Step Ownership</div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Every single step (e.g. S04) has a designated responsible owner; no anonymous or untracked actions.</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#38bdf8', fontSize: '0.95rem', marginBottom: '0.25rem' }}>2. Planned vs Actual TAT</div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Auto-computes Turnaround Time down to the minute, identifying process bottlenecks before delays impact clients.</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#38bdf8', fontSize: '0.95rem', marginBottom: '0.25rem' }}>3. Escalation Triggers</div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>If a step breaches standard SLA, automated alerts are dispatched to department heads and directors.</div>
            </div>
          </div>
        </div>

      </section>

      {/* FEATURED PROJECTS / CASE STUDIES */}
      <section id="projects" style={{ position: 'relative', zIndex: 1, padding: '5rem 1.5rem', background: 'rgba(15, 23, 42, 0.5)', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          
          <div style={{ textAlign: 'center', maxWidth: '750px', margin: '0 auto 2.5rem auto' }}>
            <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#38bdf8', fontWeight: 700, marginBottom: '0.5rem' }}>
              Proven Track Record
            </div>
            <h2 style={{ fontSize: '2.3rem', fontWeight: 700, color: '#ffffff', margin: '0 0 1rem 0' }}>
              Featured Projects & Case Studies
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
              Real-world systems engineered to eliminate operational friction, reduce costs, and enforce automated accountability.
            </p>
          </div>

          {/* Filter Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', marginBottom: '3rem' }}>
            <button className={`filter-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All Systems (8)</button>
            <button className={`filter-btn ${activeTab === 'fms' ? 'active' : ''}`} onClick={() => setActiveTab('fms')}>Workflow & FMS</button>
            <button className={`filter-btn ${activeTab === 'api' ? 'active' : ''}`} onClick={() => setActiveTab('api')}>API Integration</button>
            <button className={`filter-btn ${activeTab === 'automation' ? 'active' : ''}`} onClick={() => setActiveTab('automation')}>Apps Script & Messaging</button>
            <button className={`filter-btn ${activeTab === 'hardware' ? 'active' : ''}`} onClick={() => setActiveTab('hardware')}>Attendance & GPS</button>
            <button className={`filter-btn ${activeTab === 'web' ? 'active' : ''}`} onClick={() => setActiveTab('web')}>Web Forms</button>
            <button className={`filter-btn ${activeTab === 'dashboards' ? 'active' : ''}`} onClick={() => setActiveTab('dashboards')}>Dashboards & KPIs</button>
          </div>

          {/* Project Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
            gap: '2rem'
          }}>
            {filteredProjects.map((p) => (
              <div key={p.id} className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Case Study
                  </span>
                  <ArrowUpRight size={18} color="#64748b" />
                </div>

                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', margin: '0 0 0.35rem 0' }}>
                  {p.title}
                </h3>
                <div style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 500, marginBottom: '1.25rem' }}>
                  {p.subtitle}
                </div>

                {/* Challenge & Solution */}
                <div style={{ marginBottom: '1.25rem', flexGrow: 1 }}>
                  <div style={{ fontSize: '0.82rem', color: '#f87171', fontWeight: 600, marginBottom: '0.25rem' }}>Challenge:</div>
                  <div style={{ fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '0.85rem' }}>{p.challenge}</div>

                  <div style={{ fontSize: '0.82rem', color: '#4ade80', fontWeight: 600, marginBottom: '0.25rem' }}>Solution:</div>
                  <div style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.5 }}>{p.solution}</div>
                </div>

                {/* Key Impact */}
                <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.78rem', color: '#22c55e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Measurable Impact</div>
                  <div style={{ fontSize: '0.85rem', color: '#f0fdf4', fontWeight: 500 }}>{p.impact}</div>
                </div>

                {/* Tech Stack Tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: 'auto' }}>
                  {p.stack.map((tech, idx) => (
                    <span key={idx} className="code-tag">{tech}</span>
                  ))}
                </div>

              </div>
            ))}
          </div>

        </div>
      </section>

      {/* SKILLS & FORMULAS MASTERY SECTION */}
      <section id="skills" style={{ position: 'relative', zIndex: 1, padding: '5rem 1.5rem', maxWidth: '1240px', margin: '0 auto' }}>
        
        <div style={{ textAlign: 'center', maxWidth: '750px', margin: '0 auto 3.5rem auto' }}>
          <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#38bdf8', fontWeight: 700, marginBottom: '0.5rem' }}>
            Technical Capabilities
          </div>
          <h2 style={{ fontSize: '2.3rem', fontWeight: 700, color: '#ffffff', margin: '0 0 1rem 0' }}>
            Honest & Verified Skills Matrix
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
            A grounded breakdown of production-ready skills, formulas, and active working proficiencies.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '2rem', marginBottom: '3.5rem' }}>
          
          {/* Category 1: Strong / Advanced Skills */}
          <div className="glass-card" style={{ padding: '2rem', borderTop: '4px solid #22c55e' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <CheckCircle2 size={20} color="#22c55e" />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                Strong / Advanced Skills
              </h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              Core everyday specializations backed by a decade of enterprise production usage.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {[
                'Google Sheets', 'Microsoft Excel', 'Google Apps Script', 'MIS Reporting',
                'Business Process Automation', 'Workflow / FMS Development', 'Data Management',
                'API Integration', 'Google Workspace Automation', 'Web Form Development',
                'Looker Studio Dashboards', 'SOP & Process Mapping', 'Manufacturing Digitization'
              ].map((skill, idx) => (
                <span key={idx} style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#86efac', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 500 }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Category 2: Intermediate / Working Skills */}
          <div className="glass-card" style={{ padding: '2rem', borderTop: '4px solid #38bdf8' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <Zap size={20} color="#38bdf8" />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                Practical Working Skills
              </h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              Practical technologies used for system connectivity, frontends, and automation pipelines.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {[
                'HTML5', 'CSS3', 'JavaScript (ES6+)', 'REST APIs', 'JSON Data Handling',
                'Webhooks', 'Looker Studio', 'Google Drive Automation', 'Email Automation',
                'WhatsApp API Automation', 'GPS Geolocation', 'Camera WebRTC Integration'
              ].map((skill, idx) => (
                <span key={idx} style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#bae6fd', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 500 }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Category 3: Currently Developing / Exploring */}
          <div className="glass-card" style={{ padding: '2rem', borderTop: '4px solid #fbbf24' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <Clock size={20} color="#fbbf24" />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                Active Working Knowledge
              </h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              Modern stack tools actively deployed in production and continually upgraded.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {[
                'Supabase (PostgreSQL / RLS)', 'Vercel Deployment', 'GitHub & Version Control',
                'Node.js Server Actions', 'Android Studio (Basic)', 'Full-Stack Architecture',
                'AI Chatbots & RAG', 'Voice AI Integration', 'Face Recognition Workflows'
              ].map((skill, idx) => (
                <span key={idx} style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', color: '#fde68a', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 500 }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>

        </div>

        {/* Formulas & Functions Mastery Bar */}
        <div className="glass-card" style={{ padding: '2rem 2.5rem', background: 'rgba(15, 23, 42, 0.85)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Terminal size={20} color="#38bdf8" />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Formulas & Query Functions Mastered
            </h3>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
            {[
              '=QUERY()', '=IMPORTRANGE()', '=ARRAYFORMULA()', '=FILTER()',
              '=UNIQUE()', '=SORT()', '=XLOOKUP()', '=INDEX(MATCH())',
              '=WORKDAY.INTL()', '=LAMBDA()', '=MAP()', '=CHOOSEROWS()',
              '=REGEXEXTRACT()', '=SPARKLINE()', '=COUNTIFS()', '=SUMIFS()'
            ].map((f, idx) => (
              <span key={idx} className="formula-pill">{f}</span>
            ))}
          </div>
        </div>

      </section>

      {/* CONTACT & PROJECT INQUIRY SECTION */}
      <section id="contact" style={{ position: 'relative', zIndex: 1, padding: '5.5rem 1.5rem', background: 'rgba(15, 23, 42, 0.7)', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          
          <div style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto 3.5rem auto' }}>
            <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#38bdf8', fontWeight: 700, marginBottom: '0.5rem' }}>
              Let's Connect
            </div>
            <h2 style={{ fontSize: '2.4rem', fontWeight: 700, color: '#ffffff', margin: '0 0 1rem 0' }}>
              Have a Process to Digitize or Automate?
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
              Whether you need complex Google Sheets automation, a custom web form, manufacturing FMS, or full MIS architecture — let's build something practical.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '3rem', alignItems: 'flex-start' }}>
            
            {/* Left: Contact Info & Quick WhatsApp CTA */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              <div className="glass-card" style={{ padding: '2rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', margin: '0 0 1.25rem 0' }}>
                  Direct Contact Details
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(37, 99, 235, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                      <Mail size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Official Email</div>
                      <a href="mailto:sales@supujacreations.com" style={{ color: '#ffffff', textDecoration: 'none', fontWeight: 600, fontSize: '0.95rem' }}>
                        sales@supujacreations.com
                      </a>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e' }}>
                      <MessageSquare size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>WhatsApp Quick Connect</div>
                      <div style={{ color: '#ffffff', fontWeight: 600, fontSize: '0.95rem' }}>Available for Project Chat</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(192, 132, 252, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc' }}>
                      <MapPin size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Location & Availability</div>
                      <div style={{ color: '#ffffff', fontWeight: 500, fontSize: '0.95rem' }}>India (Remote & On-Site Consulting)</div>
                    </div>
                  </div>

                </div>

                <div style={{ marginTop: '2rem' }}>
                  <a 
                    href="https://wa.me/919999999999?text=Hello%20Sujit,%20I%20am%20interested%20in%20your%20MIS%20and%20Business%20Automation%20services." 
                    target="_blank" 
                    rel="noreferrer"
                    className="btn-primary" 
                    style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)' }}
                  >
                    <MessageSquare size={18} />
                    Chat Directly on WhatsApp
                  </a>
                </div>

              </div>

              {/* Portal Access Card */}
              <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.95rem', marginBottom: '0.35rem' }}>
                  Looking for Team CRM & Assistant?
                </div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1rem' }}>
                  Access our enterprise workplace dashboard or chat with the smart AI assistant.
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <a href="/login" className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>Workplace Login</a>
                  <a href="/chat" className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>AI Assistant</a>
                </div>
              </div>

            </div>

            {/* Right: Interactive Inquiry Form */}
            <div className="glass-card" style={{ padding: '2.5rem 2rem' }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#ffffff', margin: '0 0 0.5rem 0' }}>
                Send a Project Inquiry
              </h3>
              <p style={{ fontSize: '0.88rem', color: '#94a3b8', margin: '0 0 1.75rem 0' }}>
                Fill in your requirements below; inquiries are directly recorded in our system.
              </p>

              {formSuccess && (
                <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', color: '#86efac', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={20} color="#22c55e" />
                  Thank you! Your inquiry has been submitted successfully. We will reach out shortly.
                </div>
              )}

              {formError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                  {formError}
                </div>
              )}

              <form onSubmit={handleFormSubmit}>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>Your Name *</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. Rahul Sharma"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="form-input" 
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>Phone / WhatsApp *</label>
                    <input 
                      type="tel" 
                      required 
                      placeholder="e.g. +91 98765 43210"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="form-input" 
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>Email Address</label>
                    <input 
                      type="email" 
                      placeholder="e.g. rahul@company.com"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="form-input" 
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>Company / Organization</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Swan Agro / Tech Corp"
                      value={formData.company}
                      onChange={(e) => setFormData({...formData, company: e.target.value})}
                      className="form-input" 
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>Service Required</label>
                  <select 
                    value={formData.service}
                    onChange={(e) => setFormData({...formData, service: e.target.value})}
                    className="form-input"
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="Google Sheets & MIS Automation">Google Sheets & MIS Automation</option>
                    <option value="Google Apps Script Development">Google Apps Script Development</option>
                    <option value="Custom Web Forms & Apps">Custom Web Forms & Apps</option>
                    <option value="API & Webhook Integration">API & Webhook Integration</option>
                    <option value="Business Workflow & FMS Systems">Business Workflow & FMS Systems</option>
                    <option value="Manufacturing Process Digitization">Manufacturing Process Digitization</option>
                    <option value="Smart Attendance & GPS Tracking">Smart Attendance & GPS Tracking</option>
                    <option value="WhatsApp & Email Automation">WhatsApp & Email Automation</option>
                    <option value="Executive Dashboards & KPI Reporting">Executive Dashboards & KPI Reporting</option>
                  </select>
                </div>

                <div style={{ marginBottom: '1.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>Project Details / Brief Description</label>
                  <textarea 
                    rows={4}
                    placeholder="Tell me about your current manual process, pain points, or automation requirements..."
                    value={formData.message}
                    onChange={(e) => setFormData({...formData, message: e.target.value})}
                    className="form-input"
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={formSubmitting}
                  className="btn-primary" 
                  style={{ width: '100%', justifyContent: 'center', opacity: formSubmitting ? 0.7 : 1, cursor: formSubmitting ? 'not-allowed' : 'pointer' }}
                >
                  <Send size={18} />
                  {formSubmitting ? 'Submitting Inquiry...' : 'Submit Project Inquiry'}
                </button>

              </form>

            </div>

          </div>

        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        background: '#070b14',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '3rem 2rem 2rem 2rem',
        color: '#94a3b8',
        fontSize: '0.88rem'
      }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '1rem'
              }}>
                SG
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '1rem' }}>SuPuja Creations</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Sujit Kumar Gupta • Senior MIS & Automation Specialist</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
              <a href="#about" style={{ color: '#94a3b8', textDecoration: 'none' }}>About</a>
              <a href="#services" style={{ color: '#94a3b8', textDecoration: 'none' }}>Services</a>
              <a href="#fms" style={{ color: '#94a3b8', textDecoration: 'none' }}>FMS Workflows</a>
              <a href="#projects" style={{ color: '#94a3b8', textDecoration: 'none' }}>Projects</a>
              <a href="#skills" style={{ color: '#94a3b8', textDecoration: 'none' }}>Skills</a>
              <a href="/login" style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 600 }}>CRM Workplace</a>
            </div>

          </div>

          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '1.5rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', fontSize: '0.8rem', color: '#64748b' }}>
            <div>
              &copy; {new Date().getFullYear()} SuPuja Creations (supujacreations.com). All rights reserved.
            </div>
            <div>
              Practical Automation Systems • Google Workspace • REST APIs
            </div>
          </div>

        </div>
      </footer>

    </div>
  );
}
