'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Trash2, Check, Image } from 'lucide-react';

const PRESETS = [
  { id: 'none', label: 'Default', style: 'var(--bg-secondary, #f8fafc)', preview: '#f8fafc', isDefault: true },
  { id: 'sunrise', label: 'Sunrise', style: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', preview: 'linear-gradient(135deg, #ffecd2, #fcb69f)' },
  { id: 'ocean', label: 'Ocean', style: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', preview: 'linear-gradient(135deg, #a8edea, #fed6e3)' },
  { id: 'forest', label: 'Forest', style: 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)', preview: 'linear-gradient(135deg, #d4fc79, #96e6a1)' },
  { id: 'midnight', label: 'Midnight', style: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)', preview: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' },
  { id: 'purple', label: 'Purple Haze', style: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', preview: 'linear-gradient(135deg, #667eea, #764ba2)' },
  { id: 'peach', label: 'Peach', style: 'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)', preview: 'linear-gradient(135deg, #fccb90, #d57eeb)' },
  { id: 'steel', label: 'Steel Blue', style: 'linear-gradient(135deg, #2c3e50 0%, #4ca1af 100%)', preview: 'linear-gradient(135deg, #2c3e50, #4ca1af)' },
  { id: 'ember', label: 'Ember', style: 'linear-gradient(135deg, #f83600 0%, #f9d423 100%)', preview: 'linear-gradient(135deg, #f83600, #f9d423)' },
  { id: 'arctic', label: 'Arctic', style: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 50%, #e0e7ff 100%)', preview: 'linear-gradient(135deg, #e0f2fe, #bae6fd, #e0e7ff)' },
];

const LS_KEY = 'crm_home_wallpaper';
const LS_TYPE = 'crm_home_wallpaper_type';
const LS_OPACITY = 'crm_home_wallpaper_opacity';

export default function WallpaperModal({ isOpen, onClose, onApply }) {
  const [selected, setSelected] = useState('none');
  const [opacity, setOpacity] = useState(0.18);
  const [customImg, setCustomImg] = useState(null); // base64
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  // Load current saved state on open
  useEffect(() => {
    if (!isOpen) return;
    try {
      const type = localStorage.getItem(LS_TYPE) || 'none';
      const savedOpacity = parseFloat(localStorage.getItem(LS_OPACITY) || '0.18');
      setOpacity(isNaN(savedOpacity) ? 0.18 : savedOpacity);
      if (type === 'custom') {
        const img = localStorage.getItem(LS_KEY);
        setCustomImg(img || null);
        setSelected('custom');
      } else if (type === 'preset') {
        setSelected(localStorage.getItem(LS_KEY) || 'none');
        setCustomImg(null);
      } else {
        setSelected('none');
        setCustomImg(null);
      }
    } catch {}
  }, [isOpen]);

  const handleFileUpload = (e) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Sirf image files allowed hain (JPG, PNG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image 5MB se choti honi chahiye');
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCustomImg(ev.target.result);
      setSelected('custom');
      setUploading(false);
    };
    reader.onerror = () => {
      setError('Image load nahi hui, dobara try karo');
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleApply = () => {
    try {
      if (selected === 'none') {
        localStorage.removeItem(LS_KEY);
        localStorage.setItem(LS_TYPE, 'none');
        localStorage.setItem(LS_OPACITY, String(opacity));
      } else if (selected === 'custom' && customImg) {
        localStorage.setItem(LS_KEY, customImg);
        localStorage.setItem(LS_TYPE, 'custom');
        localStorage.setItem(LS_OPACITY, String(opacity));
      } else {
        localStorage.setItem(LS_KEY, selected);
        localStorage.setItem(LS_TYPE, 'preset');
        localStorage.setItem(LS_OPACITY, String(opacity));
      }
      window.dispatchEvent(new CustomEvent('crm_wallpaper_updated'));
      if (onApply) onApply({ type: selected === 'none' ? 'none' : selected === 'custom' ? 'custom' : 'preset', value: selected === 'custom' ? customImg : selected, opacity });
      onClose();
    } catch {
      setError('Wallpaper save nahi hua. localStorage check karo.');
    }
  };

  const handleRemove = () => {
    setSelected('none');
    setCustomImg(null);
    localStorage.removeItem(LS_KEY);
    localStorage.setItem(LS_TYPE, 'none');
    window.dispatchEvent(new CustomEvent('crm_wallpaper_updated'));
    if (onApply) onApply({ type: 'none', value: null, opacity });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15, 23, 42, 0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
      padding: '1rem'
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-surface, #ffffff)',
        borderRadius: '18px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-light, #e2e8f0)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: 34, height: 34, borderRadius: '9px',
              background: 'linear-gradient(135deg, #667eea22, #764ba222)',
              border: '1px solid #667eea33',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Image size={17} color="#667eea" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 750, color: 'var(--text-primary, #0f172a)' }}>
                Home Wallpaper
              </h2>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                Preset ya apni image choose karo
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', color: 'var(--text-secondary, #64748b)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Preset Grid */}
          <div>
            <p style={{ margin: '0 0 0.65rem 0', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🎨 Preset Themes
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.55rem' }}>
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelected(p.id); setCustomImg(null); }}
                  title={p.label}
                  style={{
                    position: 'relative',
                    height: '54px',
                    borderRadius: '10px',
                    background: p.preview,
                    border: selected === p.id ? '2.5px solid #3b82f6' : '2px solid var(--border-light, #e2e8f0)',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    transition: 'all 0.15s',
                    boxShadow: selected === p.id ? '0 0 0 3px rgba(59,130,246,0.2)' : 'none'
                  }}
                >
                  {p.isDefault && (
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      Default
                    </span>
                  )}
                  {selected === p.id && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.18)' }}>
                      <Check size={16} color="#fff" strokeWidth={3} />
                    </div>
                  )}
                </button>
              ))}
            </div>
            {/* Preset labels */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.55rem', marginTop: '0.3rem' }}>
              {PRESETS.map(p => (
                <span key={p.id} style={{ fontSize: '0.63rem', textAlign: 'center', color: selected === p.id ? '#3b82f6' : 'var(--text-secondary, #94a3b8)', fontWeight: selected === p.id ? 700 : 500 }}>
                  {p.label}
                </span>
              ))}
            </div>
          </div>

          {/* Custom Upload */}
          <div>
            <p style={{ margin: '0 0 0.65rem 0', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📸 Custom Image
            </p>
            <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
              {/* Upload Button */}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.55rem 1rem',
                  borderRadius: '9px',
                  background: selected === 'custom' ? '#eff6ff' : 'var(--bg-secondary, #f8fafc)',
                  border: selected === 'custom' ? '1.5px solid #93c5fd' : '1.5px dashed var(--border-light, #cbd5e1)',
                  color: selected === 'custom' ? '#2563eb' : 'var(--text-secondary, #64748b)',
                  fontWeight: 650, fontSize: '0.82rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <Upload size={14} />
                {uploading ? 'Uploading...' : customImg ? 'Change Image' : 'Upload Image'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />

              {/* Preview thumbnail */}
              {customImg && (
                <div style={{ position: 'relative', width: '64px', height: '40px', borderRadius: '7px', overflow: 'hidden', border: selected === 'custom' ? '2px solid #3b82f6' : '2px solid #e2e8f0', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={customImg} alt="wallpaper preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {selected === 'custom' && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                      <Check size={14} color="#fff" strokeWidth={3} />
                    </div>
                  )}
                </div>
              )}
            </div>
            {error && <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.76rem', color: '#dc2626' }}>{error}</p>}
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.72rem', color: 'var(--text-secondary, #94a3b8)' }}>
              JPG, PNG, WebP — max 5MB. Image localStorage mein save hoti hai.
            </p>
          </div>

          {/* Opacity Slider */}
          {selected !== 'none' && (
            <div>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🔆 Wallpaper Opacity — {Math.round(opacity * 100)}%
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Faint</span>
                <input
                  type="range"
                  min={0.05} max={1} step={0.05}
                  value={opacity}
                  onChange={e => setOpacity(parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: '#3b82f6', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Full</span>
              </div>
              {/* Live mini-preview */}
              <div style={{
                marginTop: '0.65rem',
                height: '36px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid #e2e8f0',
                position: 'relative',
                background: '#f8fafc'
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: selected === 'custom' && customImg
                    ? `url(${customImg}) center/cover no-repeat`
                    : (PRESETS.find(p => p.id === selected)?.style || '#f8fafc'),
                  opacity
                }} />
                <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '0.72rem', fontWeight: 600, color: '#1e293b' }}>
                  Preview
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div style={{
          display: 'flex', gap: '0.65rem', justifyContent: 'space-between',
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--border-light, #e2e8f0)'
        }}>
          <button
            onClick={handleRemove}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.55rem 1rem',
              borderRadius: '9px',
              background: 'none',
              border: '1px solid #fca5a5',
              color: '#dc2626',
              fontWeight: 650, fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            <Trash2 size={14} />
            Remove Wallpaper
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={onClose}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: '9px',
                background: 'none',
                border: '1px solid var(--border-light, #e2e8f0)',
                color: 'var(--text-secondary, #64748b)',
                fontWeight: 650, fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.55rem 1.15rem',
                borderRadius: '9px',
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                border: 'none',
                color: '#fff',
                fontWeight: 700, fontSize: '0.82rem',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(59,130,246,0.3)'
              }}
            >
              <Check size={14} />
              Apply Wallpaper
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
