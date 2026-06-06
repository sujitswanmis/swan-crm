import React, { useState, useEffect } from 'react';
import { Bot, Save, Users, Zap, AlertTriangle, CheckCircle2, Edit2, X, FileText, Trash2, Loader2 } from 'lucide-react';

export default function AiAdminModule() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLimit, setEditingLimit] = useState(null);
  const [newLimitValue, setNewLimitValue] = useState("");
  const [saving, setSaving] = useState(false);

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

      <div style={{ marginTop: '3rem', borderTop: '1px solid var(--border-light)', paddingTop: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <FileText size={20} />
          </div>
          <div>
            <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '1.2rem' }}>AI Knowledge Base (RAG)</h3>
            <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>Train AI on your company policies, FAQs, and product details</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* Upload Form */}
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>Add New Document</h4>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Document Title</label>
              <input 
                type="text" 
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="e.g., Leave Policy, Pricing Guide"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none' }}
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Document Content</label>
              <textarea 
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                placeholder="Paste the full text here. The AI will read and remember this."
                rows={8}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical' }}
              />
            </div>
            <button 
              onClick={handleUploadDocument}
              disabled={uploadingDoc}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: uploadingDoc ? 'not-allowed' : 'pointer', opacity: uploadingDoc ? 0.7 : 1 }}
            >
              {uploadingDoc ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
              {uploadingDoc ? 'Saving to AI Memory...' : 'Save Document'}
            </button>
          </div>

          {/* Document List */}
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)', overflowY: 'auto', maxHeight: '450px' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>Saved Documents ({documents.length})</h4>
            {documents.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>No documents uploaded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {documents.map(doc => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-surface)' }}>
                    <div>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{doc.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        {new Date(doc.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDeleteDocument(doc.id)}
                      style={{ background: '#fef2f2', color: '#ef4444', border: 'none', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer' }}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
