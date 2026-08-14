import React, { useState, useEffect, useRef } from 'react';
import { Bot, Save, Users, Zap, AlertTriangle, CheckCircle2, Edit2, X, FileText, Trash2, Loader2, ChevronDown, Search, Plus, Sparkles, Check } from 'lucide-react';
import { PremiumProgressLoader } from '../PremiumProgressLoader';

export default function AiAdminModule() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLimit, setEditingLimit] = useState(null);
  const [newLimitValue, setNewLimitValue] = useState("");
  const [newPremiumLimitValue, setNewPremiumLimitValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Dynamic AI Models State
  const [availableModels, setAvailableModels] = useState([]);
  const [liveSynced, setLiveSynced] = useState(false);
  const [openDropdownUserId, setOpenDropdownUserId] = useState(null);
  const [modelSearch, setModelSearch] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [customModelInput, setCustomModelInput] = useState("");

  // Knowledge Base State
  const [documents, setDocuments] = useState([]);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const dropdownRef = useRef(null);

  useEffect(() => {
    fetchUsers();
    fetchDocuments();
    fetchModels();

    // Close dropdown on click outside
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdownUserId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/ai/models');
      if (res.ok) {
        const data = await res.json();
        setAvailableModels(data.models || []);
        setLiveSynced(!!data.liveSynced);
      }
    } catch (e) {
      console.error("Failed to fetch AI models:", e);
    }
  };

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
      const res = await fetch('/api/ai/admin', { cache: 'no-store' });
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
        body: JSON.stringify({ 
          userId, 
          tokenLimit: parseInt(newLimitValue),
          premiumLimit: newPremiumLimitValue ? parseInt(newPremiumLimitValue) : 10000 
        })
      });
      if (res.ok) {
        await fetchUsers();
        setEditingLimit(null);
        setNewLimitValue("");
        setNewPremiumLimitValue("");
      } else {
        alert("Failed to update limit.");
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleModelChange = async (userId, newModels) => {
    // Optimistic UI Update
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, ai_models: newModels } : u));

    try {
      const res = await fetch('/api/ai/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, aiModels: newModels })
      });
      if (!res.ok) {
        alert("Failed to update AI Model.");
        await fetchUsers(); // Revert on failure
      }
    } catch (e) {
      alert(e.message);
      await fetchUsers(); // Revert on failure
    }
  };

  const handleAddCustomModel = (userId, currentSelected) => {
    const trimmed = customModelInput.trim();
    if (!trimmed) return;
    
    // Add to availableModels list if not already present
    if (!availableModels.includes(trimmed)) {
      setAvailableModels(prev => [trimmed, ...prev]);
    }
    
    // Select this model for the current user
    const updated = Array.from(new Set([...currentSelected, trimmed]));
    handleModelChange(userId, updated);
    setCustomModelInput("");
  };

  // Filter users by search query
  const filteredUsers = users.filter(user => {
    if (!userSearchQuery.trim()) return true;
    const q = userSearchQuery.toLowerCase();
    const name = (user.name || '').toLowerCase();
    const email = (user.email || '').toLowerCase();
    const role = (user.role || '').toLowerCase();
    return name.includes(q) || email.includes(q) || role.includes(q);
  });

  if (loading) {
    return <PremiumProgressLoader message="Loading AI Stats" active={loading} />;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <Bot size={24} />
          </div>
          <div>
            <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>AI Admin Dashboard</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>Monitor and manage AI token usage & model access across your team</p>
          </div>
        </div>

        {/* Live Sync Status Badge */}
        <div style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          padding: '0.4rem 0.8rem', 
          borderRadius: '20px', 
          background: liveSynced ? '#ecfdf5' : '#fef3c7', 
          border: `1px solid ${liveSynced ? '#a7f3d0' : '#fde68a'}`,
          fontSize: '0.8rem',
          fontWeight: 600,
          color: liveSynced ? '#047857' : '#b45309'
        }}>
          <Sparkles size={14} />
          {liveSynced ? `Auto-Synced with OpenAI (${availableModels.length} models)` : `Loaded Models (${availableModels.length})`}
        </div>
      </div>

      {/* User Search Bar Container */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ position: 'relative', flex: '1', maxWidth: '380px' }}>
          <Search size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', zIndex: 5, pointerEvents: 'none' }} />
          <input 
            type="text" 
            placeholder="Search by name, email, or role..." 
            value={userSearchQuery}
            onChange={(e) => setUserSearchQuery(e.target.value)}
            className="search-input-field"
            style={{
              width: '100%',
              paddingLeft: '2.85rem',
              paddingRight: '2.5rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.88rem',
              outline: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}
          />
          {userSearchQuery && (
            <button 
              onClick={() => setUserSearchQuery('')}
              style={{
                position: 'absolute',
                right: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
          Showing {filteredUsers.length} of {users.length} users
        </div>
      </div>

      <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'auto', maxHeight: 'calc(100vh - 240px)' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
          <thead style={{ backgroundColor: 'var(--th-bg)' }}>
            <tr>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Employee</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Role</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Token Usage</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Token Limit</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Premium Limit</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>AI Models</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => {
              const usagePercent = Math.min(100, Math.round((user.total_tokens / user.token_limit) * 100)) || 0;
              const isDanger = usagePercent >= 90;
              const isWarning = usagePercent >= 75 && usagePercent < 90;
              const selectedModels = user.ai_models || ['gpt-4o-mini'];
              const isDropdownOpen = openDropdownUserId === user.id;

              // Filtered models for dropdown search
              const filteredModels = availableModels.filter(m => 
                m.toLowerCase().includes(modelSearch.toLowerCase())
              );

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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '180px' }}>
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
                      <input 
                        type="number" 
                        value={newLimitValue} 
                        onChange={(e) => setNewLimitValue(e.target.value)}
                        style={{ width: '80px', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--accent-color)', outline: 'none' }}
                      />
                    ) : (
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.token_limit.toLocaleString()}</span>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {editingLimit === user.id ? (
                      <input 
                        type="number" 
                        value={newPremiumLimitValue} 
                        onChange={(e) => setNewPremiumLimitValue(e.target.value)}
                        placeholder="Premium limit"
                        style={{ width: '80px', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--accent-color)', outline: 'none' }}
                      />
                    ) : (
                      <span style={{ fontWeight: 600, color: '#8b5cf6' }}>{user.premium_limit ? user.premium_limit.toLocaleString() : 'N/A'}</span>
                    )}
                  </td>
                  
                  {/* Multi-Select Dropdown Column */}
                  <td style={{ padding: '1rem', position: 'relative' }}>
                    <div 
                      onClick={() => {
                        setModelSearch("");
                        setOpenDropdownUserId(isDropdownOpen ? null : user.id);
                      }}
                      style={{
                        padding: '0.45rem 0.75rem',
                        borderRadius: '8px',
                        border: isDropdownOpen ? '1px solid var(--accent-color)' : '1px solid var(--border-light)',
                        background: 'var(--bg-surface)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justify: 'space-between',
                        gap: '0.5rem',
                        minWidth: '200px',
                        maxWidth: '240px',
                        boxShadow: isDropdownOpen ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', overflow: 'hidden', maxHeight: '28px' }}>
                        {selectedModels.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Select Models...</span>}
                        {selectedModels.slice(0, 2).map(m => (
                          <span key={m} style={{
                            fontSize: '0.72rem',
                            background: '#e0e7ff',
                            color: '#3730a3',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap'
                          }}>
                            {m}
                          </span>
                        ))}
                        {selectedModels.length > 2 && (
                          <span style={{
                            fontSize: '0.72rem',
                            background: '#f3f4f6',
                            color: '#4b5563',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            fontWeight: 600
                          }}>
                            +{selectedModels.length - 2} more
                          </span>
                        )}
                      </div>
                      <ChevronDown size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0, transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </div>

                    {/* Popover Dropdown Menu */}
                    {isDropdownOpen && (
                      <div 
                        ref={dropdownRef}
                        style={{
                          position: 'absolute',
                          top: 'calc(100% - 0.5rem)',
                          left: '1rem',
                          width: '280px',
                          background: 'var(--bg-primary, #ffffff)',
                          border: '1px solid var(--border-light, #e5e7eb)',
                          borderRadius: '10px',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                          zIndex: 9999,
                          padding: '0.75rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.6rem'
                        }}
                      >
                        {/* Search Header */}
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <Search size={14} style={{ position: 'absolute', left: '0.6rem', color: '#9ca3af' }} />
                          <input 
                            type="text" 
                            placeholder="Search AI models..." 
                            value={modelSearch} 
                            onChange={(e) => setModelSearch(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.4rem 0.5rem 0.4rem 2rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-light, #d1d5db)',
                              fontSize: '0.8rem',
                              outline: 'none',
                              background: 'var(--bg-surface, #f9fafb)'
                            }}
                          />
                        </div>

                        {/* Quick Selection Actions */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', padding: '0 0.1rem' }}>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                            {selectedModels.length} of {availableModels.length} selected
                          </span>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button 
                              onClick={() => handleModelChange(user.id, [...availableModels])}
                              style={{ border: 'none', background: 'transparent', color: '#4f46e5', cursor: 'pointer', fontWeight: 600 }}
                            >
                              Select All
                            </button>
                            <button 
                              onClick={() => handleModelChange(user.id, ['gpt-4o-mini'])}
                              style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}
                            >
                              Reset
                            </button>
                          </div>
                        </div>

                        {/* Scrollable Model Checkbox List */}
                        <div style={{
                          maxHeight: '180px',
                          overflowY: 'auto',
                          border: '1px solid var(--border-light, #f3f4f6)',
                          borderRadius: '6px',
                          padding: '0.25rem',
                          background: 'var(--bg-surface, #f9fafb)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.15rem'
                        }}>
                          {filteredModels.map(model => {
                            const checked = selectedModels.includes(model);
                            return (
                              <label key={model} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.35rem 0.5rem',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                background: checked ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                color: checked ? '#4338ca' : 'var(--text-primary)',
                                fontWeight: checked ? 600 : 400,
                                transition: 'background 0.1s'
                              }}>
                                <input 
                                  type="checkbox" 
                                  checked={checked}
                                  onChange={(e) => {
                                    let newModels;
                                    if (e.target.checked) {
                                      newModels = [...selectedModels, model];
                                    } else {
                                      newModels = selectedModels.filter(m => m !== model);
                                    }
                                    if (newModels.length === 0) newModels = ['gpt-4o-mini'];
                                    handleModelChange(user.id, newModels);
                                  }}
                                  style={{ cursor: 'pointer', accentColor: '#4f46e5' }}
                                />
                                {model}
                              </label>
                            );
                          })}
                          {filteredModels.length === 0 && (
                            <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                              No matching models found.
                            </div>
                          )}
                        </div>

                        {/* Add Custom Model Field */}
                        <div style={{ display: 'flex', gap: '0.4rem', borderTop: '1px solid var(--border-light, #eee)', paddingTop: '0.5rem' }}>
                          <input 
                            type="text" 
                            placeholder="+ Add model name (e.g. gpt-4.1)"
                            value={customModelInput}
                            onChange={(e) => setCustomModelInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddCustomModel(user.id, selectedModels);
                            }}
                            style={{
                              flex: 1,
                              padding: '0.35rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px solid var(--border-light, #d1d5db)',
                              fontSize: '0.75rem',
                              outline: 'none'
                            }}
                          />
                          <button 
                            onClick={() => handleAddCustomModel(user.id, selectedModels)}
                            style={{
                              background: '#4f46e5',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '0.35rem 0.6rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem'
                            }}
                          >
                            <Plus size={12} /> Add
                          </button>
                        </div>
                      </div>
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
                          onClick={() => { setEditingLimit(null); setNewLimitValue(""); setNewPremiumLimitValue(""); }}
                          disabled={saving}
                          style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '0.4rem 0.6rem', cursor: saving ? 'not-allowed' : 'pointer' }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => { setEditingLimit(user.id); setNewLimitValue(user.token_limit.toString()); setNewPremiumLimitValue(user.premium_limit ? user.premium_limit.toString() : "10000"); }}
                        style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}
                      >
                        <Edit2 size={14} /> Edit Limits
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan="7" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {userSearchQuery ? `No users found matching "${userSearchQuery}"` : "No users found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}

