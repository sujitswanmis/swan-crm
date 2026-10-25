'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Check, X, MapPin, Phone, Building2, ChevronDown } from 'lucide-react';

function maskPhoneNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 4) {
    return `xxxxxx${digits.slice(-4)}`;
  }
  return String(phone);
}

export default function SearchablePartySelect({
  parties = [],
  selectedId = '',
  onChange = () => {},
  placeholder = 'Type to search by firm name, code, district, mobile...',
  label = 'Select Channel Partner',
  required = false,
  color = '#ef4444',
  emptyNotice = 'No matching channel partner found',
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Find currently selected party
  const selectedParty = useMemo(() => {
    if (!selectedId) return null;
    return parties.find(p => String(p.id) === String(selectedId)) || null;
  }, [parties, selectedId]);

  // Filter parties based on search term
  const filteredParties = useMemo(() => {
    if (!searchTerm.trim()) {
      return parties.slice(0, 50);
    }
    const q = searchTerm.trim().toLowerCase();
    const matches = parties.filter(p => {
      const firm = (p.firm_name || '').toLowerCase();
      const code = (
        p.party_universal_code ||
        p.distributor_code ||
        p.dealer_code ||
        p.sub_dealer_code ||
        p.external_sap_code ||
        ''
      ).toLowerCase();
      const location = (
        p.district_name ||
        p.district ||
        p.city_village ||
        p.city ||
        p.state_name ||
        p.state ||
        ''
      ).toLowerCase();
      const mobile = (
        p.primary_mobile ||
        p.biz_contact_no_1 ||
        p.contact_mobile_1_1 ||
        p.phone ||
        ''
      ).toLowerCase();

      return firm.includes(q) || code.includes(q) || location.includes(q) || mobile.includes(q);
    });

    return matches.slice(0, 50);
  }, [parties, searchTerm]);

  const handleSelect = (party) => {
    onChange(party ? party.id : '');
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {label && (
        <label style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.82rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          marginBottom: '0.35rem'
        }}>
          <span>{label} {required && <span style={{ color: color }}>*</span>}</span>
          {selectedParty && (
            <span style={{ fontSize: '0.74rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <Check size={12} /> Partner Selected
            </span>
          )}
        </label>
      )}

      {/* Selected Card View (When not actively searching) */}
      {selectedParty && !isOpen ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 0.85rem',
          borderRadius: '8px',
          border: `1.5px solid ${color}40`,
          background: 'var(--bg-primary)',
          gap: '0.75rem',
          transition: 'all 0.15s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            <span style={{
              fontSize: '0.74rem',
              fontWeight: 800,
              padding: '0.15rem 0.45rem',
              borderRadius: '4px',
              background: 'rgba(239,68,68,0.12)',
              color: color,
              fontFamily: 'monospace',
              letterSpacing: '0.3px',
              flexShrink: 0
            }}>
              {selectedParty.party_universal_code || selectedParty.distributor_code || selectedParty.dealer_code || 'CODE'}
            </span>

            <span style={{
              fontWeight: 700,
              color: 'var(--text-primary)',
              fontSize: '0.88rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {selectedParty.firm_name}
            </span>

            {(selectedParty.district_name || selectedParty.district || selectedParty.state_name) && (
              <span style={{
                fontSize: '0.76rem',
                color: 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem',
                flexShrink: 0
              }}>
                <MapPin size={12} style={{ opacity: 0.7 }} />
                {[selectedParty.district_name || selectedParty.district, selectedParty.state_name || selectedParty.state].filter(Boolean).join(', ')}
              </span>
            )}

            {(selectedParty.primary_mobile || selectedParty.biz_contact_no_1) && (
              <span style={{
                fontSize: '0.76rem',
                color: 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem',
                flexShrink: 0
              }}>
                <Phone size={12} style={{ opacity: 0.7 }} />
                {maskPhoneNumber(selectedParty.primary_mobile || selectedParty.biz_contact_no_1)}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setIsOpen(true);
                setSearchTerm('');
              }}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-light)',
                color: 'var(--text-primary)',
                padding: '0.3rem 0.65rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <Search size={12} />
              Change
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={handleClear}
              title="Clear selection"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>
      ) : (
        /* Search Box & Trigger */
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '0.8rem',
                color: 'var(--text-secondary)',
                pointerEvents: 'none'
              }}
            />
            <input
              ref={inputRef}
              type="text"
              disabled={disabled}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (!isOpen) setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder={placeholder}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem 0.6rem 2.3rem',
                paddingRight: selectedParty ? '6.5rem' : '2rem',
                background: 'var(--bg-primary)',
                border: `1.5px solid ${isOpen ? color : 'var(--border-light)'}`,
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.88rem',
                outline: 'none',
                boxShadow: isOpen ? `0 0 0 3px ${color}20` : 'none',
                boxSizing: 'border-box'
              }}
            />

            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: selectedParty ? '5.2rem' : '0.65rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '0.2rem',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={13} />
              </button>
            )}

            {selectedParty && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setSearchTerm('');
                }}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  padding: '0.25rem 0.5rem',
                  background: 'rgba(100,116,139,0.12)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                Keep Current
              </button>
            )}

            {!selectedParty && !searchTerm && (
              <ChevronDown
                size={14}
                style={{
                  position: 'absolute',
                  right: '0.8rem',
                  color: 'var(--text-secondary)',
                  pointerEvents: 'none'
                }}
              />
            )}
          </div>

          {/* Floating Dropdown Results */}
          {isOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              maxHeight: '260px',
              overflowY: 'auto',
              background: 'var(--bg-surface, #ffffff)',
              border: '1px solid var(--border-light, #cbd5e1)',
              borderRadius: '8px',
              boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.28)',
              zIndex: 99999,
              padding: '0.3rem 0'
            }}>
              <div style={{
                padding: '0.4rem 0.85rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                borderBottom: '1px solid var(--border-light)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-primary)'
              }}>
                <span>
                  {parties.length === 0
                    ? 'No channel partners loaded'
                    : searchTerm
                    ? `Matching ${filteredParties.length} partner(s)`
                    : `Showing first ${filteredParties.length} of ${parties.length} partners`}
                </span>
                <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>Type to search</span>
              </div>

              {filteredParties.length === 0 ? (
                <div style={{
                  padding: '1.2rem 1rem',
                  fontSize: '0.84rem',
                  color: 'var(--text-secondary)',
                  textAlign: 'center'
                }}>
                  {emptyNotice} {searchTerm ? `for "${searchTerm}"` : ''}
                </div>
              ) : (
                filteredParties.map(p => {
                  const isCurrent = String(p.id) === String(selectedId);
                  const code = p.party_universal_code || p.distributor_code || p.dealer_code || 'CODE';
                  const loc = [p.district_name || p.district, p.state_name || p.state].filter(Boolean).join(', ');
                  const phone = p.primary_mobile || p.biz_contact_no_1 || p.phone;

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelect(p)}
                      style={{
                        padding: '0.55rem 0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.6rem',
                        background: isCurrent ? `${color}14` : 'transparent',
                        borderBottom: '1px solid var(--border-light)',
                        transition: 'background 0.12s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isCurrent ? `${color}20` : 'rgba(100,116,139,0.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isCurrent ? `${color}14` : 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '0.1rem 0.35rem',
                            borderRadius: '4px',
                            background: isCurrent ? color : 'rgba(100, 116, 139, 0.14)',
                            color: isCurrent ? '#ffffff' : 'var(--text-primary)',
                            fontFamily: 'monospace'
                          }}>
                            {code}
                          </span>
                          <span style={{
                            fontWeight: 700,
                            fontSize: '0.86rem',
                            color: 'var(--text-primary)'
                          }}>
                            {p.firm_name}
                          </span>
                          {p.external_sap_code && (
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '0.05rem 0.3rem',
                              borderRadius: '3px',
                              background: 'rgba(99, 102, 241, 0.12)',
                              color: '#6366f1'
                            }}>
                              ERP: {p.external_sap_code}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {loc && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                              <MapPin size={11} style={{ opacity: 0.7 }} />
                              {loc}
                            </span>
                          )}
                          {phone && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                              <Phone size={11} style={{ opacity: 0.7 }} />
                              {maskPhoneNumber(phone)}
                            </span>
                          )}
                        </div>
                      </div>

                      {isCurrent && (
                        <div style={{
                          color: color,
                          display: 'flex',
                          alignItems: 'center',
                          flexShrink: 0
                        }}>
                          <Check size={16} />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
