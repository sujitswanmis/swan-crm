'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Send } from 'lucide-react';

export default function LeadProfilePanel({ lead, isOpen, mode, onClose, onLeadUpdate }) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    if (!lead || !isOpen) return;

    // Set initial mode
    setIsEditing(mode === 'edit');
    
    // Set follow up date if exists
    if (lead.follow_up_date) {
      // Convert to local datetime string format for input type="datetime-local"
      const date = new Date(lead.follow_up_date);
      const tzOffset = date.getTimezoneOffset() * 60000;
      const localISOTime = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
      setFollowUpDate(localISOTime);
    } else {
      setFollowUpDate('');
    }

    // Initialize edit form
    setEditForm({
      name: lead.name,
      company: lead.company || '',
      email: lead.email || '',
      phone: lead.phone || '',
      deal_value: lead.deal_value || 0,
      source: lead.source || 'Website'
    });

    // Fetch existing notes
    const fetchNotes = async () => {
      const { data } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false });
      if (data) setNotes(data);
    };
    fetchNotes();

    // Subscribe to new notes
    const channel = supabase
      .channel(`notes-${lead.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_notes', filter: `lead_id=eq.${lead.id}` }, (payload) => {
        setNotes((prev) => {
          if (prev.some(note => note.id === payload.new.id)) return prev;
          return [payload.new, ...prev];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lead, isOpen]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    const actor = user?.email?.split('@')[0] || 'Agent';

    const { error } = await supabase
      .from('lead_notes')
      .insert([{ lead_id: lead.id, note_text: newNote, created_by: actor }]);

    if (!error) {
      setNewNote('');
    }
  };

  const handleFollowUpChange = async (e) => {
    const newDate = e.target.value;
    setFollowUpDate(newDate);

    const isoDateStr = new Date(newDate).toISOString();

    // Update lead
    await supabase.from('leads').update({ follow_up_date: isoDateStr }).eq('id', lead.id);

    const { data: { user } } = await supabase.auth.getUser();
    const actor = user?.email?.split('@')[0] || 'System';

    if (onLeadUpdate) {
      onLeadUpdate({ ...lead, follow_up_date: isoDateStr });
    }

    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date(newDate);
    const formattedDate = `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

    // Log history
    await supabase.from('lead_notes').insert([{
      lead_id: lead.id,
      note_text: `Follow-up scheduled for: ${formattedDate}`,
      created_by: actor
    }]);
  };

  const handleEditChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const handleSaveEdit = async () => {
    await supabase.from('leads').update(editForm).eq('id', lead.id);
    
    const { data: { user } } = await supabase.auth.getUser();
    const actor = user?.email?.split('@')[0] || 'System';
    
    // Log history
    await supabase.from('lead_notes').insert([{
      lead_id: lead.id,
      note_text: `Profile updated`,
      created_by: actor
    }]);

    if (onLeadUpdate) {
      onLeadUpdate({ ...lead, ...editForm });
    }
    
    setIsEditing(false);
  };

  if (!isOpen || !lead) return null;

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 999 }} onClick={onClose} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px', backgroundColor: 'var(--bg-surface)', zIndex: 1000, boxShadow: '-4px 0 15px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, marginRight: '1rem' }}>
              <input name="name" value={editForm.name} onChange={handleEditChange} style={{ fontSize: '1.25rem', fontWeight: 600, padding: '0.25rem' }} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input name="company" value={editForm.company} onChange={handleEditChange} placeholder="Company" style={{ padding: '0.25rem', width: '50%' }} />
                <input name="phone" value={editForm.phone} onChange={handleEditChange} placeholder="Phone" style={{ padding: '0.25rem', width: '50%' }} />
              </div>
              <input name="email" value={editForm.email} onChange={handleEditChange} placeholder="Email" style={{ padding: '0.25rem', width: '100%' }} />
            </div>
          ) : (
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {lead.name}
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{lead.company} | {lead.phone}</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{lead.email}</p>
            </div>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}><X size={20} color="var(--text-secondary)" /></button>
        </div>

        {/* Lead Info Details */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', fontSize: '0.85rem' }}>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            {isEditing ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => { setIsEditing(false); if(mode==='edit') onClose(); }} style={{ padding: '0.25rem 0.75rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleSaveEdit} style={{ padding: '0.25rem 0.75rem', border: 'none', background: 'var(--accent-color)', color: 'white', borderRadius: '4px', cursor: 'pointer' }}>Save Changes</button>
              </div>
            ) : mode === 'history' ? null : (
              <button onClick={() => setIsEditing(true)} style={{ padding: '0.25rem 0.75rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                ✏️ Edit Details
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div><span style={{ color: 'var(--text-secondary)' }}>Status:</span> <b>{lead.status}</b></div>
            <div><span style={{ color: 'var(--text-secondary)' }}>Priority:</span> <b>{lead.priority}</b></div>
            
            {isEditing ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Value (₹):</span>
                  <input type="number" name="deal_value" value={editForm.deal_value} onChange={handleEditChange} style={{ padding: '0.25rem' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Source:</span>
                  <select name="source" value={editForm.source} onChange={handleEditChange} style={{ padding: '0.25rem' }}>
                    <option value="Website">Website</option>
                    <option value="Google Ads">Google Ads</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Referral">Referral</option>
                    <option value="Cold Call">Cold Call</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Our Company:</span>
                  <select name="our_company" value={editForm.our_company || ''} onChange={handleEditChange} style={{ padding: '0.25rem' }}>
                    <option value="">None</option>
                    <option value="NSMLR">NSMLR</option>
                    <option value="NSTLP">NSTLP</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div><span style={{ color: 'var(--text-secondary)' }}>Value:</span> <b>₹{lead.deal_value || 0}</b></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Source:</span> <b>{lead.source}</b></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Our Company:</span> <b>{lead.our_company || 'Unassigned'}</b></div>
              </>
            )}
          </div>
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontWeight: 600, color: 'var(--accent-color)' }}>🗓️ Next Follow-up Date</label>
            <input 
              type="datetime-local" 
              value={followUpDate} 
              onChange={handleFollowUpChange}
              style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
            />
          </div>
        </div>

        {/* Show Notes Section only if mode is history or not editing */}
        {(!isEditing || mode === 'history') && (
          <>
            {/* Notes Section */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Interaction History</h3>
              
              {notes.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No notes yet.</p>
              ) : (
                notes.map(note => (
                  <div key={note.id} style={{ padding: '1rem', backgroundColor: 'var(--th-bg)', borderRadius: '8px', fontSize: '0.9rem' }}>
                    <p style={{ marginBottom: '0.5rem' }}>{note.note_text}</p>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{note.created_by}</span>
                      <span>{new Date(note.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add Note Input */}
            <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-light)' }}>
              <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  value={newNote} 
                  onChange={e => setNewNote(e.target.value)} 
                  placeholder="Add a note..." 
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                />
                <button type="submit" style={{ background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', padding: '0 1rem', cursor: 'pointer' }}>
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </>
  );
}
