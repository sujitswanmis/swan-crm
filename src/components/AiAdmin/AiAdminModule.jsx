import React, { useState, useEffect } from 'react';
import { Bot, Save, Users, Zap, AlertTriangle, CheckCircle2, Edit2, X, FileText, Trash2, Loader2 } from 'lucide-react';

export default function AiAdminModule() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLimit, setEditingLimit] = useState(null);
  const [newLimitValue, setNewLimitValue] = useState("");
  const [saving, setSaving] = useState(false);

  const AI_MODELS = [
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4-turbo",
    "gpt-5.5",
    "gpt-5.5-pro"
  ];

  // Knowledge Base State
  const [documents, setDocuments] = useState([]);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [uploadingDoc, setUploadingDoc] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/ai/knowledge');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUploadDocument = async () => {
    if (!docTitle.trim() || !docContent.trim()) return alert("Title and content are required.");
    setUploadingDoc(true);
    try {
      const res = await fetch('/api/ai/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: docTitle, content: docContent })
      });
      if (res.ok) {
        setDocTitle("");
        setDocContent("");
        await fetchDocuments();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to upload document");
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (id) => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      const res = await fetch(`/api/ai/knowledge?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/ai/admin');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLimit = async (userId) => {
    if (!newLimitValue || isNaN(newLimitValue)) return;
    setSaving(true);
    try {
      const res = await fetch('/api/ai/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tokenLimit: parseInt(newLimitValue) })
      });
      if (res.ok) {
        await fetchUsers();
        setEditingLimit(null);
        setNewLimitValue("");
      } else {
        alert("Failed to update limit.");
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleModelChange = async (userId, newModel) => {
    try {
      const res = await fetch('/api/ai/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, aiModel: newModel })
      });
      if (res.ok) {
        await fetchUsers();
      } else {
        alert("Failed to update AI Model.");
      }
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Loading AI Stats...</div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
          <Bot size={24} />
        </div>
        <div>
          <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>AI Admin Dashboard</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>Monitor and manage AI token usage across your team</p>
        </div>
      </div>

      <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: 'var(--th-filtered-bg)' }}>
            <tr>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Employee</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Role</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Token Usage</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Token Limit</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>AI Model</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => {
              const usagePercent = Math.min(100, Math.round((user.total_tokens / user.token_limit) * 100)) || 0;
              const isDanger = usagePercent >= 90;
              const isWarning = usagePercent >= 75 && usagePercent < 90;

              return (
                <tr key={user.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.name || 'Unknown User'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{user.email}</div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ padding: '0.25rem 0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '4px', fontSize: '0.8rem', textTransform: 'capitalize' }}>
                      {user.role}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '200px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: 600, color: isDanger ? '#ef4444' : 'var(--text-primary)' }}>{user.total_tokens.toLocaleString()}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{usagePercent}%</span>
                      </div>
                      <div style={{ height: '6px', width: '100%', background: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${usagePercent}%`, background: isDanger ? '#ef4444' : isWarning ? '#f59e0b' : 'var(--accent-color)', borderRadius: '3px' }}></div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {editingLimit === user.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input 
                          type="number" 
                          value={newLimitValue} 
                          onChange={(e) => setNewLimitValue(e.target.value)}
                          style={{ width: '100px', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--accent-color)', outline: 'none' }}
                          autoFocus
                        />
                      </div>
                    ) : (
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.token_limit.toLocaleString()}</span>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <select
                      value={user.ai_model || 'gpt-4o-mini'}
                      onChange={(e) => handleModelChange(user.id, e.target.value)}
                      style={{
                        padding: '0.4rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      {AI_MODELS.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {editingLimit === user.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button 
                          onClick={() => handleSaveLimit(user.id)}
                          disabled={saving}
                          style={{ background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', padding: '0.4rem 0.6rem', cursor: saving ? 'not-allowed' : 'pointer' }}
                        >
                          <CheckCircle2 size={16} />
                        </button>
                        <button 
                          onClick={() => { setEditingLimit(null); setNewLimitValue(""); }}
                          disabled={saving}
                          style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '0.4rem 0.6rem', cursor: saving ? 'not-allowed' : 'pointer' }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => { setEditingLimit(user.id); setNewLimitValue(user.token_limit.toString()); }}
                        style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}
                      >
                        <Edit2 size={14} /> Edit Limit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
