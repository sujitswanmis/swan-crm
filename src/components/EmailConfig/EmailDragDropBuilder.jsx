'use client';

import React, { useState, useEffect } from 'react';
import { 
  MoveUp, MoveDown, Copy, Trash2, Plus, Image as ImageIcon, 
  Type, MousePointer, Tag, Columns, Calendar, Minus, 
  Share2, Building2, AlignLeft, AlignCenter, AlignRight, 
  Sliders, Link, Sparkles, Check, RefreshCw, Eye
} from 'lucide-react';

export const DEFAULT_DRAG_DROP_BLOCKS = [
  {
    id: 'block_header_1',
    type: 'header',
    title: 'New Swan Group',
    subtitle: 'Industrial Excellence & Engineering Solutions',
    logoUrl: '',
    logoWidth: 140,
    bgColor: '#1e293b',
    textColor: '#ffffff',
    align: 'center'
  },
  {
    id: 'block_image_1',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&auto=format&fit=crop&q=80',
    width: 100,
    maxWidth: 560,
    borderRadius: 8,
    align: 'center',
    alt: 'Industrial Manufacturing Technology',
    linkUrl: 'https://newswangroup.com',
    caption: 'Leading innovation in automotive and agricultural components'
  },
  {
    id: 'block_text_1',
    type: 'text',
    headingLevel: 'h2',
    heading: 'Welcome, {{name}}!',
    body: 'We are thrilled to present our latest precision manufacturing catalogue and partnership opportunities tailored to your enterprise requirements.\n\nOur specialized facilities at {{branch}} are fully equipped to deliver high-volume custom production with zero-defect quality standards.',
    fontSize: 15,
    color: '#334155',
    align: 'left'
  },
  {
    id: 'block_coupon_1',
    type: 'coupon',
    code: 'SWAN-PRIVILEGE-25',
    title: 'Special Corporate Partner Discount',
    description: 'Get an exclusive 25% pricing benefit on bulk seasonal production orders.',
    expiry: 'Valid for next 15 business days'
  },
  {
    id: 'block_button_1',
    type: 'button',
    text: 'Schedule Plant Tour & Discussion →',
    url: 'https://newswangroup.com/contact',
    bgColor: '#2563eb',
    textColor: '#ffffff',
    borderRadius: 8,
    align: 'center',
    fullWidth: false
  },
  {
    id: 'block_divider_1',
    type: 'divider',
    style: 'solid',
    color: '#e2e8f0',
    thickness: 1,
    gap: 20
  },
  {
    id: 'block_social_1',
    type: 'social',
    website: 'https://newswangroup.com',
    linkedin: 'https://linkedin.com/company/newswangroup',
    twitter: '',
    align: 'center'
  },
  {
    id: 'block_footer_1',
    type: 'footer',
    company: 'New Swan Group',
    branch: '{{branch}}',
    address: 'Ludhiana, Punjab, India',
    copyright: '© 2026 New Swan Group. All rights reserved.',
    unsubscribeText: 'You received this email because of your professional association with New Swan Group.'
  }
];

export const BLOCK_PALETTE = [
  { type: 'image', label: 'Image (Resizable)', icon: ImageIcon, desc: 'Image with width slider, alignment & link' },
  { type: 'text', label: 'Rich Text / Heading', icon: Type, desc: 'Paragraphs, H1-H3 headings & tags' },
  { type: 'button', label: 'CTA Button', icon: MousePointer, desc: 'Clickable button with tracking' },
  { type: 'coupon', label: 'Voucher / Coupon', icon: Tag, desc: 'Promo deal box with copyable code' },
  { type: 'columns', label: '2-Column Grid', icon: Columns, desc: 'Side-by-side features or products' },
  { type: 'interview_card', label: 'Schedule / Meeting', icon: Calendar, desc: 'Date, time IST, venue & panel' },
  { type: 'divider', label: 'Divider & Gap', icon: Minus, desc: 'Horizontal line & vertical spacer' },
  { type: 'header', label: 'Header Masthead', icon: Building2, desc: 'Logo, brand banner & tagline' },
  { type: 'social', label: 'Social Channels', icon: Share2, desc: 'Website, LinkedIn, Social links' },
  { type: 'footer', label: 'Footer & Legal', icon: AlignCenter, desc: 'Address, copyright & unsubscribe' }
];

export default function EmailDragDropBuilder({
  initialBlocks = null,
  onChange,
  companyName = 'New Swan Group',
  branchName = 'All Branches',
  targetPipeline = 'sales'
}) {
  const [blocks, setBlocks] = useState(() => {
    if (Array.isArray(initialBlocks) && initialBlocks.length > 0) {
      return initialBlocks;
    }
    return DEFAULT_DRAG_DROP_BLOCKS.map(b => ({
      ...b,
      id: `blk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    }));
  });

  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [copiedTag, setCopiedTag] = useState(null);
  const [previewViewport, setPreviewViewport] = useState('desktop');

  // Trigger parent onChange whenever blocks change
  useEffect(() => {
    if (typeof onChange === 'function') {
      onChange(blocks);
    }
  }, [blocks, onChange]);

  const selectedBlock = blocks.find(b => b.id === selectedBlockId) || null;

  // Add block from palette
  const handleAddBlock = (type) => {
    const newId = `blk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let newBlock = { id: newId, type };

    switch (type) {
      case 'image':
        newBlock = {
          ...newBlock,
          url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80',
          width: 90,
          maxWidth: 560,
          borderRadius: 8,
          align: 'center',
          alt: 'Corporate Banner',
          linkUrl: '',
          caption: ''
        };
        break;
      case 'text':
        newBlock = {
          ...newBlock,
          headingLevel: 'p',
          heading: '',
          body: 'Hello {{name}},\n\nEnter your personalized email message here. Use dynamic tags to customize for each recipient.',
          fontSize: 15,
          color: '#334155',
          align: 'left'
        };
        break;
      case 'button':
        newBlock = {
          ...newBlock,
          text: 'Click Here to Learn More →',
          url: 'https://example.com',
          bgColor: '#2563eb',
          textColor: '#ffffff',
          borderRadius: 8,
          align: 'center',
          fullWidth: false
        };
        break;
      case 'coupon':
        newBlock = {
          ...newBlock,
          code: 'PROMO-2026',
          title: 'Special Privileged Offer',
          description: 'Apply this coupon code to unlock exclusive partnership pricing.',
          expiry: 'Limited time validity'
        };
        break;
      case 'columns':
        newBlock = {
          ...newBlock,
          col1Title: 'High Precision Quality',
          col1Text: 'Engineered with IATF 16949 certified quality management protocols.',
          col1Img: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=300&auto=format&fit=crop&q=60',
          col2Title: 'Global Export Delivery',
          col2Text: 'Reliable supply chain delivery to over 20+ countries worldwide.',
          col2Img: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=300&auto=format&fit=crop&q=60'
        };
        break;
      case 'interview_card':
        newBlock = {
          ...newBlock,
          title: 'Technical Interview Discussion',
          date: 'Monday, 20th October 2026',
          timeIST: '03:00 PM - 03:45 PM IST',
          venue: 'Google Meet (Virtual Round)',
          meetUrl: 'https://meet.google.com/abc-defg-hij',
          panel: 'Engineering Director & HR Panel'
        };
        break;
      case 'divider':
        newBlock = {
          ...newBlock,
          style: 'solid',
          color: '#e2e8f0',
          thickness: 1,
          gap: 20
        };
        break;
      case 'header':
        newBlock = {
          ...newBlock,
          title: companyName,
          subtitle: 'Official Communication',
          logoUrl: '',
          logoWidth: 140,
          bgColor: '#1e293b',
          textColor: '#ffffff',
          align: 'center'
        };
        break;
      case 'social':
        newBlock = {
          ...newBlock,
          website: 'https://example.com',
          linkedin: '',
          twitter: '',
          align: 'center'
        };
        break;
      case 'footer':
        newBlock = {
          ...newBlock,
          company: companyName,
          branch: branchName,
          address: 'India',
          copyright: `© ${new Date().getFullYear()} ${companyName}. All rights reserved.`,
          unsubscribeText: 'You received this notification based on your account activity.'
        };
        break;
      default:
        break;
    }

    setBlocks(prev => [...prev, newBlock]);
    setSelectedBlockId(newId);
  };

  // Move block up
  const handleMoveUp = (index, e) => {
    e.stopPropagation();
    if (index === 0) return;
    setBlocks(prev => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  // Move block down
  const handleMoveDown = (index, e) => {
    e.stopPropagation();
    if (index === blocks.length - 1) return;
    setBlocks(prev => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  // Duplicate block
  const handleDuplicateBlock = (index, e) => {
    e.stopPropagation();
    const source = blocks[index];
    const clone = {
      ...source,
      id: `blk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
    setBlocks(prev => {
      const copy = [...prev];
      copy.splice(index + 1, 0, clone);
      return copy;
    });
    setSelectedBlockId(clone.id);
  };

  // Delete block
  const handleDeleteBlock = (id, e) => {
    e.stopPropagation();
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (selectedBlockId === id) {
      setSelectedBlockId(null);
    }
  };

  // Update specific block property
  const updateBlockProp = (prop, value) => {
    if (!selectedBlockId) return;
    setBlocks(prev => prev.map(b => {
      if (b.id === selectedBlockId) {
        return { ...b, [prop]: value };
      }
      return b;
    }));
  };

  // Copy dynamic tag to clipboard
  const handleCopyTag = (tag) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  // Quick preset sample images
  const SAMPLE_IMAGES = [
    { label: 'Factory / Engineering', url: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&auto=format&fit=crop&q=80' },
    { label: 'Corporate HQ', url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80' },
    { label: 'Quality Inspection', url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80' },
    { label: 'Logistics & Warehouse', url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&auto=format&fit=crop&q=80' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      
      {/* TOP CONTROLS & PALETTE BAR */}
      <div style={{
        padding: '0.85rem 1rem',
        borderRadius: '10px',
        backgroundColor: 'var(--bg-primary)',
        border: '1.5px solid var(--border-light)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Sparkles size={16} color="#6366f1" />
            <span>Add Elements to Email:</span>
          </span>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {BLOCK_PALETTE.map(tool => {
              const IconComponent = tool.icon;
              return (
                <button
                  key={tool.type}
                  type="button"
                  onClick={() => handleAddBlock(tool.type)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.32rem 0.65rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.12s'
                  }}
                  title={tool.desc}
                >
                  <IconComponent size={13} color="#4f46e5" />
                  <span>{tool.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <strong>{blocks.length}</strong> Block(s) on Canvas
          </span>
          <button
            type="button"
            onClick={() => {
              if (confirm('Reset canvas to default responsive template blocks?')) {
                setBlocks(DEFAULT_DRAG_DROP_BLOCKS.map(b => ({
                  ...b,
                  id: `blk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
                })));
                setSelectedBlockId(null);
              }
            }}
            style={{
              padding: '0.3rem 0.6rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              fontSize: '0.72rem',
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}
            title="Reset to default starter template"
          >
            <RefreshCw size={12} />
            <span>Reset Canvas</span>
          </button>
        </div>
      </div>

      {/* DYNAMIC PLACEHOLDERS QUICK BAR */}
      <div style={{
        padding: '0.65rem 0.9rem',
        borderRadius: '8px',
        backgroundColor: '#f8fafc',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap'
      }}>
        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155' }}>
          💡 Click to Copy Dynamic Tags:
        </span>
        {(targetPipeline === 'recruiter' ? [
          '{{candidate_name}}', '{{candidate_email}}', '{{job_title}}', '{{recruiter_name}}', '{{branch}}'
        ] : [
          '{{name}}', '{{company}}', '{{phone}}', '{{branch}}', '{{stage}}', '{{rep_name}}'
        ]).map(tag => (
          <button
            key={tag}
            type="button"
            onClick={() => handleCopyTag(tag)}
            style={{
              fontSize: '0.7rem',
              fontFamily: 'monospace',
              fontWeight: 600,
              padding: '0.15rem 0.45rem',
              borderRadius: '4px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: copiedTag === tag ? '#16a34a' : '#4338ca',
              cursor: 'pointer'
            }}
          >
            {tag} {copiedTag === tag ? '✓' : ''}
          </button>
        ))}
      </div>

      {/* MAIN TWO-COLUMN WORKSPACE: LEFT CANVAS (60%) + RIGHT INSPECTOR (40%) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(300px, 360px)', gap: '1rem', alignItems: 'start' }}>
        
        {/* ========================================================================= */}
        {/* LEFT CANVAS: EMAIL PREVIEW & INTERACTIVE BLOCKS REORDERING                */}
        {/* ========================================================================= */}
        <div style={{
          backgroundColor: '#f1f5f9',
          padding: '1.25rem',
          borderRadius: '12px',
          border: '1px solid var(--border-light)',
          minHeight: '540px',
          maxHeight: '75vh',
          overflowY: 'auto'
        }}>
          
          <div style={{
            maxWidth: '560px',
            margin: '0 auto',
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            overflow: 'hidden',
            border: '1px solid #cbd5e1'
          }}>
            {blocks.map((block, index) => {
              const isSelected = block.id === selectedBlockId;

              return (
                <div
                  key={block.id}
                  onClick={() => setSelectedBlockId(block.id)}
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                    outline: isSelected ? '2px solid #6366f1' : '1px solid transparent',
                    outlineOffset: '-2px',
                    transition: 'all 0.12s'
                  }}
                >
                  {/* Floating Action Controls on Hover / Selected */}
                  <div style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    zIndex: 10,
                    display: isSelected ? 'flex' : 'none',
                    alignItems: 'center',
                    gap: '0.25rem',
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    backdropFilter: 'blur(4px)',
                    padding: '0.2rem 0.4rem',
                    borderRadius: '6px'
                  }}>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={(e) => handleMoveUp(index, e)}
                      style={{ background: 'none', border: 'none', color: index === 0 ? '#64748b' : '#fff', cursor: index === 0 ? 'default' : 'pointer', padding: '2px', display: 'flex' }}
                      title="Move Up"
                    >
                      <MoveUp size={13} />
                    </button>
                    <button
                      type="button"
                      disabled={index === blocks.length - 1}
                      onClick={(e) => handleMoveDown(index, e)}
                      style={{ background: 'none', border: 'none', color: index === blocks.length - 1 ? '#64748b' : '#fff', cursor: index === blocks.length - 1 ? 'default' : 'pointer', padding: '2px', display: 'flex' }}
                      title="Move Down"
                    >
                      <MoveDown size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDuplicateBlock(index, e)}
                      style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px', display: 'flex' }}
                      title="Duplicate Block"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteBlock(block.id, e)}
                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '2px', display: 'flex' }}
                      title="Delete Block"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* BLOCK RENDERING */}
                  
                  {/* 1. Header Block */}
                  {block.type === 'header' && (
                    <div style={{
                      backgroundColor: block.bgColor || '#1e293b',
                      color: block.textColor || '#ffffff',
                      padding: '24px 20px',
                      textAlign: block.align || 'center'
                    }}>
                      {block.logoUrl && (
                        <div style={{ marginBottom: '10px' }}>
                          <img
                            src={block.logoUrl}
                            alt="Logo"
                            style={{ maxWidth: `${block.logoWidth || 140}px`, maxHeight: '60px', objectFit: 'contain' }}
                          />
                        </div>
                      )}
                      <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.3px', color: block.textColor || '#ffffff' }}>
                        {block.title || companyName}
                      </h2>
                      {block.subtitle && (
                        <div style={{ fontSize: '0.8rem', opacity: 0.85, marginTop: '4px' }}>
                          {block.subtitle}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2. Image Block (With Live Resize & Alignment) */}
                  {block.type === 'image' && (
                    <div style={{ padding: '16px 20px', textAlign: block.align || 'center' }}>
                      <div style={{ display: 'inline-block', width: `${block.width || 100}%`, maxWidth: `${block.maxWidth || 560}px` }}>
                        <img
                          src={block.url || 'https://via.placeholder.com/600x300?text=Select+Image'}
                          alt={block.alt || 'Template Image'}
                          style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                            borderRadius: `${block.borderRadius ?? 8}px`,
                            border: '1px solid #e2e8f0'
                          }}
                        />
                        {block.caption && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px', textAlign: 'center', fontStyle: 'italic' }}>
                            {block.caption}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 3. Text Block */}
                  {block.type === 'text' && (
                    <div style={{ padding: '16px 24px', textAlign: block.align || 'left' }}>
                      {block.heading && (
                        <h3 style={{
                          margin: '0 0 8px 0',
                          fontSize: block.headingLevel === 'h1' ? '1.4rem' : (block.headingLevel === 'h2' ? '1.2rem' : '1.05rem'),
                          fontWeight: 700,
                          color: '#0f172a'
                        }}>
                          {block.heading}
                        </h3>
                      )}
                      <div style={{
                        fontSize: `${block.fontSize || 15}px`,
                        color: block.color || '#334155',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap'
                      }}>
                        {block.body}
                      </div>
                    </div>
                  )}

                  {/* 4. CTA Action Button */}
                  {block.type === 'button' && (
                    <div style={{ padding: '14px 24px', textAlign: block.align || 'center' }}>
                      <span style={{
                        display: block.fullWidth ? 'block' : 'inline-block',
                        backgroundColor: block.bgColor || '#2563eb',
                        color: block.textColor || '#ffffff',
                        padding: '12px 28px',
                        borderRadius: `${block.borderRadius ?? 8}px`,
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                      }}>
                        {block.text || 'Action Button'}
                      </span>
                    </div>
                  )}

                  {/* 5. Coupon / Promo Card */}
                  {block.type === 'coupon' && (
                    <div style={{ padding: '12px 24px' }}>
                      <div style={{
                        backgroundColor: '#fffbeb',
                        border: '2px dashed #d97706',
                        borderRadius: '10px',
                        padding: '16px 20px',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#b45309', textTransform: 'uppercase', letterSpacing: '1px' }}>
                          PROMOTIONAL VOUCHER
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#78350f', margin: '4px 0' }}>
                          {block.title || 'Special Discount Offer'}
                        </div>
                        <div style={{
                          display: 'inline-block',
                          backgroundColor: '#ffffff',
                          border: '1.5px solid #d97706',
                          color: '#b45309',
                          fontFamily: 'monospace',
                          fontSize: '1.15rem',
                          fontWeight: 800,
                          padding: '6px 18px',
                          borderRadius: '6px',
                          letterSpacing: '2px',
                          margin: '8px 0'
                        }}>
                          {block.code || 'SAVE2026'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#92400e' }}>
                          {block.description}
                        </div>
                        {block.expiry && (
                          <div style={{ fontSize: '0.7rem', color: '#b45309', marginTop: '4px', fontStyle: 'italic' }}>
                            ⏳ {block.expiry}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 6. 2-Column Grid */}
                  {block.type === 'columns' && (
                    <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        {block.col1Img && (
                          <img src={block.col1Img} alt="" style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '6px', marginBottom: '8px' }} />
                        )}
                        <strong style={{ fontSize: '0.85rem', color: '#0f172a', display: 'block', marginBottom: '4px' }}>{block.col1Title}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4 }}>{block.col1Text}</div>
                      </div>
                      <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        {block.col2Img && (
                          <img src={block.col2Img} alt="" style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '6px', marginBottom: '8px' }} />
                        )}
                        <strong style={{ fontSize: '0.85rem', color: '#0f172a', display: 'block', marginBottom: '4px' }}>{block.col2Title}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4 }}>{block.col2Text}</div>
                      </div>
                    </div>
                  )}

                  {/* 7. Schedule / Interview Card */}
                  {block.type === 'interview_card' && (
                    <div style={{ padding: '12px 24px' }}>
                      <div style={{
                        backgroundColor: '#f5f3ff',
                        border: '1.5px solid #c7d2fe',
                        borderRadius: '10px',
                        padding: '16px 20px'
                      }}>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#3730a3', marginBottom: '8px' }}>
                          📅 {block.title || 'Schedule Details'}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#4338ca', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div><strong>Date:</strong> {block.date}</div>
                          <div><strong>Time (IST):</strong> {block.timeIST}</div>
                          <div><strong>Venue / Mode:</strong> {block.venue}</div>
                          {block.panel && <div><strong>Panel:</strong> {block.panel}</div>}
                        </div>
                        {block.meetUrl && (
                          <div style={{ marginTop: '10px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4f46e5', textDecoration: 'underline' }}>
                              🔗 Join Link: {block.meetUrl}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 8. Divider */}
                  {block.type === 'divider' && (
                    <div style={{ padding: `${block.gap || 20}px 24px` }}>
                      <hr style={{
                        border: 'none',
                        borderTop: `${block.thickness || 1}px ${block.style || 'solid'} ${block.color || '#e2e8f0'}`,
                        margin: 0
                      }} />
                    </div>
                  )}

                  {/* 9. Social Channels */}
                  {block.type === 'social' && (
                    <div style={{ padding: '12px 24px', textAlign: block.align || 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
                        {block.website && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4f46e5' }}>🌐 Website</span>
                        )}
                        {block.linkedin && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0a66c2' }}>🔗 LinkedIn</span>
                        )}
                        {block.twitter && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1da1f2' }}>🐦 Twitter</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 10. Footer Block */}
                  {block.type === 'footer' && (
                    <div style={{
                      backgroundColor: '#f8fafc',
                      padding: '18px 24px',
                      borderTop: '1px solid #e2e8f0',
                      textAlign: 'center',
                      fontSize: '0.72rem',
                      color: '#94a3b8',
                      lineHeight: 1.5
                    }}>
                      <div style={{ fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                        {block.company || companyName} • {block.branch || branchName}
                      </div>
                      <div>{block.address}</div>
                      <div style={{ marginTop: '4px' }}>{block.copyright}</div>
                      <div style={{ marginTop: '6px', fontSize: '0.68rem', color: '#cbd5e1' }}>
                        {block.unsubscribeText}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>

          <div style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
            👆 Click on any block above to select it and adjust its visual properties in the Inspector panel.
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT INSPECTOR: PROPERTY CONTROLS (IMAGE RESIZER, FONTS, COLORS, BUTTON) */}
        {/* ========================================================================= */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          padding: '1.25rem',
          borderRadius: '12px',
          border: '1px solid var(--border-light)',
          minHeight: '540px',
          maxHeight: '75vh',
          overflowY: 'auto'
        }}>
          
          {selectedBlock ? (
            <div>
              {/* Header with Type & ID */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.65rem', borderBottom: '1px solid var(--border-light)' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    ⚙️ Edit {selectedBlock.type.replace('_', ' ')}
                  </h4>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    ID: {selectedBlock.id}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedBlockId(null)}
                  style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', fontSize: '0.72rem', cursor: 'pointer' }}
                >
                  Done
                </button>
              </div>

              {/* SPECIFIC BLOCK INSPECTOR CONTROLS */}

              {/* A. IMAGE BLOCK INSPECTOR (ADVANCED RESIZING TOOLS) */}
              {selectedBlock.type === 'image' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  
                  {/* Image URL Input */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Image URL *
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.url || ''}
                      onChange={(e) => updateBlockProp('url', e.target.value)}
                      placeholder="https://example.com/banner.jpg"
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.82rem' }}
                    />
                  </div>

                  {/* 1-Click Preset Samples */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                      Quick Sample Presets:
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {SAMPLE_IMAGES.map((sample, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => updateBlockProp('url', sample.url)}
                          style={{
                            padding: '0.2rem 0.45rem',
                            borderRadius: '4px',
                            border: '1px solid #cbd5e1',
                            background: '#f8fafc',
                            fontSize: '0.7rem',
                            cursor: 'pointer'
                          }}
                        >
                          {sample.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Interactive Width Slider (Live Resize) */}
                  <div style={{ padding: '0.75rem', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e40af' }}>
                        📏 Image Width Resize ({selectedBlock.width || 100}%)
                      </label>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb' }}>
                        {selectedBlock.width || 100}%
                      </span>
                    </div>

                    <input
                      type="range"
                      min={20}
                      max={100}
                      step={5}
                      value={selectedBlock.width || 100}
                      onChange={(e) => updateBlockProp('width', Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
                    />

                    {/* Quick Width Buttons */}
                    <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem' }}>
                      {[30, 50, 75, 100].map(w => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => updateBlockProp('width', w)}
                          style={{
                            flex: 1,
                            padding: '0.2rem',
                            borderRadius: '4px',
                            border: selectedBlock.width === w ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                            background: selectedBlock.width === w ? '#2563eb' : '#fff',
                            color: selectedBlock.width === w ? '#fff' : '#1e293b',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {w}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Alignment Control */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Image Alignment
                    </label>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {[
                        { align: 'left', label: 'Left', icon: AlignLeft },
                        { align: 'center', label: 'Center', icon: AlignCenter },
                        { align: 'right', label: 'Right', icon: AlignRight }
                      ].map(a => {
                        const Icon = a.icon;
                        const isA = (selectedBlock.align || 'center') === a.align;
                        return (
                          <button
                            key={a.align}
                            type="button"
                            onClick={() => updateBlockProp('align', a.align)}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.25rem',
                              padding: '0.35rem',
                              borderRadius: '6px',
                              border: isA ? '1.5px solid #6366f1' : '1px solid var(--border-light)',
                              background: isA ? 'var(--nav-active-bg)' : '#fff',
                              color: isA ? '#4f46e5' : '#475569',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            <Icon size={13} />
                            <span>{a.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Corner Radius Slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Corner Rounding</label>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{selectedBlock.borderRadius ?? 8}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={30}
                      value={selectedBlock.borderRadius ?? 8}
                      onChange={(e) => updateBlockProp('borderRadius', Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#6366f1' }}
                    />
                  </div>

                  {/* Click URL Link */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Click Action Link (Optional URL)
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.linkUrl || ''}
                      onChange={(e) => updateBlockProp('linkUrl', e.target.value)}
                      placeholder="https://newswangroup.com/products"
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.82rem' }}
                    />
                  </div>

                  {/* Alt Text & Caption */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Caption Note (Optional)
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.caption || ''}
                      onChange={(e) => updateBlockProp('caption', e.target.value)}
                      placeholder="e.g. ISO 9001 Certified Manufacturing Line"
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.82rem' }}
                    />
                  </div>

                </div>
              )}

              {/* B. TEXT BLOCK INSPECTOR */}
              {selectedBlock.type === 'text' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  
                  {/* Heading Level */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Heading Title (Optional)
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.heading || ''}
                      onChange={(e) => updateBlockProp('heading', e.target.value)}
                      placeholder="e.g. Welcome, {{name}}!"
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.82rem', marginBottom: '0.35rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      {['h1', 'h2', 'h3', 'p'].map(lvl => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => updateBlockProp('headingLevel', lvl)}
                          style={{
                            flex: 1,
                            padding: '0.2rem',
                            borderRadius: '4px',
                            border: selectedBlock.headingLevel === lvl ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
                            background: selectedBlock.headingLevel === lvl ? '#6366f1' : '#fff',
                            color: selectedBlock.headingLevel === lvl ? '#fff' : '#1e293b',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {lvl.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Body Textarea */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Paragraph Content *
                    </label>
                    <textarea
                      rows={6}
                      value={selectedBlock.body || ''}
                      onChange={(e) => updateBlockProp('body', e.target.value)}
                      placeholder="Write your email paragraph..."
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.82rem', lineHeight: 1.5 }}
                    />
                  </div>

                  {/* Font Size & Alignment */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Font Size ({selectedBlock.fontSize || 15}px)
                      </label>
                      <input
                        type="range"
                        min={12}
                        max={24}
                        value={selectedBlock.fontSize || 15}
                        onChange={(e) => updateBlockProp('fontSize', Number(e.target.value))}
                        style={{ width: '100%', accentColor: '#6366f1' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Text Color
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <input
                          type="color"
                          value={selectedBlock.color || '#334155'}
                          onChange={(e) => updateBlockProp('color', e.target.value)}
                          style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                        />
                        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{selectedBlock.color || '#334155'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Alignment */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Alignment
                    </label>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      {['left', 'center', 'right'].map(al => (
                        <button
                          key={al}
                          type="button"
                          onClick={() => updateBlockProp('align', al)}
                          style={{
                            flex: 1,
                            padding: '0.3rem',
                            borderRadius: '4px',
                            border: (selectedBlock.align || 'left') === al ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
                            background: (selectedBlock.align || 'left') === al ? '#6366f1' : '#fff',
                            color: (selectedBlock.align || 'left') === al ? '#fff' : '#1e293b',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            textTransform: 'capitalize',
                            cursor: 'pointer'
                          }}
                        >
                          {al}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* C. BUTTON BLOCK INSPECTOR */}
              {selectedBlock.type === 'button' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Button Text *
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.text || ''}
                      onChange={(e) => updateBlockProp('text', e.target.value)}
                      placeholder="e.g. Schedule Live Demo →"
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.82rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Destination URL *
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.url || ''}
                      onChange={(e) => updateBlockProp('url', e.target.value)}
                      placeholder="https://yourwebsite.com/page"
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.82rem' }}
                    />
                  </div>

                  {/* Color Swatches */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Button Background Color
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {['#2563eb', '#16a34a', '#4f46e5', '#ea580c', '#0f172a'].map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => updateBlockProp('bgColor', c)}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: c,
                            border: selectedBlock.bgColor === c ? '2px solid #000' : '1px solid #cbd5e1',
                            cursor: 'pointer'
                          }}
                        />
                      ))}
                      <input
                        type="color"
                        value={selectedBlock.bgColor || '#2563eb'}
                        onChange={(e) => updateBlockProp('bgColor', e.target.value)}
                        style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                      />
                    </div>
                  </div>

                  {/* Corner Radius & Width */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Shape
                      </label>
                      <select
                        value={selectedBlock.borderRadius || 8}
                        onChange={(e) => updateBlockProp('borderRadius', Number(e.target.value))}
                        style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                      >
                        <option value={0}>Square (0px)</option>
                        <option value={6}>Rounded (6px)</option>
                        <option value={12}>Large (12px)</option>
                        <option value={999}>Pill Shape (999px)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Width
                      </label>
                      <button
                        type="button"
                        onClick={() => updateBlockProp('fullWidth', !selectedBlock.fullWidth)}
                        style={{
                          width: '100%',
                          padding: '0.4rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          background: selectedBlock.fullWidth ? '#6366f1' : '#fff',
                          color: selectedBlock.fullWidth ? '#fff' : '#1e293b',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {selectedBlock.fullWidth ? 'Full Width' : 'Auto Content'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* D. COUPON BLOCK INSPECTOR */}
              {selectedBlock.type === 'coupon' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Coupon / Voucher Code *
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.code || ''}
                      onChange={(e) => updateBlockProp('code', e.target.value.toUpperCase())}
                      placeholder="e.g. FESTIVE-30"
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid #d97706', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Title
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.title || ''}
                      onChange={(e) => updateBlockProp('title', e.target.value)}
                      placeholder="e.g. 25% Off Commercial Pricing"
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.82rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Description & Terms
                    </label>
                    <textarea
                      rows={3}
                      value={selectedBlock.description || ''}
                      onChange={(e) => updateBlockProp('description', e.target.value)}
                      placeholder="Terms and benefits..."
                      style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Validity Note
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.expiry || ''}
                      onChange={(e) => updateBlockProp('expiry', e.target.value)}
                      placeholder="e.g. Valid until end of month"
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.82rem' }}
                    />
                  </div>
                </div>
              )}

              {/* E. 2-COLUMN BLOCK INSPECTOR */}
              {selectedBlock.type === 'columns' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ padding: '0.6rem', borderRadius: '6px', background: '#f8fafc', border: '1px solid #cbd5e1' }}>
                    <strong style={{ fontSize: '0.78rem', color: '#1e293b' }}>Left Column:</strong>
                    <input
                      type="text"
                      value={selectedBlock.col1Title || ''}
                      onChange={(e) => updateBlockProp('col1Title', e.target.value)}
                      placeholder="Col 1 Title"
                      style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.78rem', margin: '4px 0' }}
                    />
                    <textarea
                      rows={2}
                      value={selectedBlock.col1Text || ''}
                      onChange={(e) => updateBlockProp('col1Text', e.target.value)}
                      placeholder="Col 1 Text"
                      style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.78rem' }}
                    />
                    <input
                      type="text"
                      value={selectedBlock.col1Img || ''}
                      onChange={(e) => updateBlockProp('col1Img', e.target.value)}
                      placeholder="Col 1 Image URL"
                      style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.78rem', marginTop: '4px' }}
                    />
                  </div>

                  <div style={{ padding: '0.6rem', borderRadius: '6px', background: '#f8fafc', border: '1px solid #cbd5e1' }}>
                    <strong style={{ fontSize: '0.78rem', color: '#1e293b' }}>Right Column:</strong>
                    <input
                      type="text"
                      value={selectedBlock.col2Title || ''}
                      onChange={(e) => updateBlockProp('col2Title', e.target.value)}
                      placeholder="Col 2 Title"
                      style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.78rem', margin: '4px 0' }}
                    />
                    <textarea
                      rows={2}
                      value={selectedBlock.col2Text || ''}
                      onChange={(e) => updateBlockProp('col2Text', e.target.value)}
                      placeholder="Col 2 Text"
                      style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.78rem' }}
                    />
                    <input
                      type="text"
                      value={selectedBlock.col2Img || ''}
                      onChange={(e) => updateBlockProp('col2Img', e.target.value)}
                      placeholder="Col 2 Image URL"
                      style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.78rem', marginTop: '4px' }}
                    />
                  </div>
                </div>
              )}

              {/* F. SCHEDULE / INTERVIEW INSPECTOR */}
              {selectedBlock.type === 'interview_card' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Meeting Title</label>
                    <input
                      type="text"
                      value={selectedBlock.title || ''}
                      onChange={(e) => updateBlockProp('title', e.target.value)}
                      placeholder="Interview Call"
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Date</label>
                    <input
                      type="text"
                      value={selectedBlock.date || ''}
                      onChange={(e) => updateBlockProp('date', e.target.value)}
                      placeholder="e.g. 25 Oct 2026"
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Time (IST)</label>
                    <input
                      type="text"
                      value={selectedBlock.timeIST || ''}
                      onChange={(e) => updateBlockProp('timeIST', e.target.value)}
                      placeholder="e.g. 03:00 PM IST"
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Venue / Google Meet</label>
                    <input
                      type="text"
                      value={selectedBlock.venue || ''}
                      onChange={(e) => updateBlockProp('venue', e.target.value)}
                      placeholder="e.g. Google Meet or Conference Room"
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Meeting Link URL</label>
                    <input
                      type="text"
                      value={selectedBlock.meetUrl || ''}
                      onChange={(e) => updateBlockProp('meetUrl', e.target.value)}
                      placeholder="https://meet.google.com/..."
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                    />
                  </div>
                </div>
              )}

              {/* G. HEADER BLOCK INSPECTOR */}
              {selectedBlock.type === 'header' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Company / Title</label>
                    <input
                      type="text"
                      value={selectedBlock.title || ''}
                      onChange={(e) => updateBlockProp('title', e.target.value)}
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Subtitle</label>
                    <input
                      type="text"
                      value={selectedBlock.subtitle || ''}
                      onChange={(e) => updateBlockProp('subtitle', e.target.value)}
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Logo Image URL (Optional)</label>
                    <input
                      type="text"
                      value={selectedBlock.logoUrl || ''}
                      onChange={(e) => updateBlockProp('logoUrl', e.target.value)}
                      placeholder="https://..."
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Header Background Color</label>
                    <input
                      type="color"
                      value={selectedBlock.bgColor || '#1e293b'}
                      onChange={(e) => updateBlockProp('bgColor', e.target.value)}
                      style={{ width: '36px', height: '32px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                    />
                  </div>
                </div>
              )}

              {/* H. FOOTER BLOCK INSPECTOR */}
              {selectedBlock.type === 'footer' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Office Address</label>
                    <input
                      type="text"
                      value={selectedBlock.address || ''}
                      onChange={(e) => updateBlockProp('address', e.target.value)}
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Copyright Text</label>
                    <input
                      type="text"
                      value={selectedBlock.copyright || ''}
                      onChange={(e) => updateBlockProp('copyright', e.target.value)}
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                    />
                  </div>
                </div>
              )}

              {/* I. DIVIDER INSPECTOR */}
              {selectedBlock.type === 'divider' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Vertical Gap Spacing ({selectedBlock.gap || 20}px)</label>
                    <input
                      type="range"
                      min={10}
                      max={60}
                      value={selectedBlock.gap || 20}
                      onChange={(e) => updateBlockProp('gap', Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#6366f1' }}
                    />
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              minHeight: '360px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              padding: '1rem'
            }}>
              <Sliders size={36} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                Block Properties Inspector
              </div>
              <div style={{ fontSize: '0.8rem', lineHeight: 1.5, maxWidth: '240px' }}>
                Click any element on the left email canvas to adjust its image size, colors, typography, or links.
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
