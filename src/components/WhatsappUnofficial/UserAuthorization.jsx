import React, { useState, useEffect } from 'react';
import { getInstances, getInstanceAuths, saveInstanceAuth, removeInstanceAuth } from '@/app/actions/whatsappUnofficialDb';
import { getTeamMembers } from '@/app/actions/team';
import { Shield, Save, Trash2, CheckSquare, Square } from 'lucide-react';

export default function UserAuthorization() {
  const [instances, setInstances] = useState([]);
  const [selectedInstance, setSelectedInstance] = useState('');
  
  const [teamMembers, setTeamMembers] = useState([]);
  const [auths, setAuths] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInitial() {
      const [instRes, teamRes] = await Promise.all([
        getInstances(),
        getTeamMembers()
      ]);
      if (instRes.success) setInstances(instRes.data || []);
      if (teamRes) setTeamMembers(teamRes || []);
      setLoading(false);
    }
    loadInitial();
  }, []);

  useEffect(() => {
    if (selectedInstance) {
      loadAuths(selectedInstance);
    } else {
      setAuths([]);
    }
  }, [selectedInstance]);

  const loadAuths = async (instanceId) => {
    setLoading(true);
    const { success, data } = await getInstanceAuths(instanceId);
    if (success) {
      setAuths(data || []);
    }
    setLoading(false);
  };

  const handleToggleAuth = async (userId, field, currentValue) => {
    if (!selectedInstance) return;
    
    // Check if auth exists
    let authRecord = auths.find(a => a.user_id === userId);
    
    const payload = {
      instance_id: selectedInstance,
      user_id: userId,
      role: 'agent',
      can_view_chat: authRecord ? authRecord.can_view_chat : true,
      can_reply: authRecord ? authRecord.can_reply : false,
      can_send_media: authRecord ? authRecord.can_send_media : false,
      can_create_campaign: authRecord ? authRecord.can_create_campaign : false,
      can_view_logs: authRecord ? authRecord.can_view_logs : false,
    };

    payload[field] = !currentValue;

    // Save to DB
    const { success } = await saveInstanceAuth(payload);
    if (success) {
      await loadAuths(selectedInstance);
    } else {
      alert('Failed to update permission');
    }
  };

  const handleRemoveAuth = async (id) => {
    if (!window.confirm('Remove access for this user?')) return;
    const { success } = await removeInstanceAuth(id);
    if (success) {
      await loadAuths(selectedInstance);
    }
  };

  return (
    <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2>User Authorization</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Assign CRM users to specific WhatsApp instances and control their permissions.</p>
      </div>

      <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Select Instance to Manage</label>
        <select 
          className="input-field" 
          value={selectedInstance} 
          onChange={(e) => setSelectedInstance(e.target.value)}
          style={{ maxWidth: '400px' }}
        >
          <option value="">-- Select Instance --</option>
          {instances.map(inst => (
            <option key={inst.id} value={inst.id}>{inst.instance_name} ({inst.phone_number || 'No Phone'})</option>
          ))}
        </select>
      </div>

      {selectedInstance && (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--th-filtered-bg)' }}>
              <tr>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>User</th>
                <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '1px solid var(--border-light)' }}>View Chats</th>
                <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '1px solid var(--border-light)' }}>Reply</th>
                <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '1px solid var(--border-light)' }}>Send Media</th>
                <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && teamMembers.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</td></tr>
              ) : (
                teamMembers.filter(t => t.role !== 'admin').map(member => {
                  const auth = auths.find(a => a.user_id === member.user_id);
                  const hasAccess = !!auth;

                  return (
                    <tr key={member.user_id} style={{ borderBottom: '1px solid var(--border-light)', background: hasAccess ? 'transparent' : '#fafafa' }}>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 500 }}>{member.emp_name || member.email}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{member.email}</div>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <button 
                          onClick={() => handleToggleAuth(member.user_id, 'can_view_chat', auth?.can_view_chat)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: auth?.can_view_chat ? '#10b981' : '#9ca3af' }}
                        >
                          {auth?.can_view_chat ? <CheckSquare /> : <Square />}
                        </button>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <button 
                          onClick={() => handleToggleAuth(member.user_id, 'can_reply', auth?.can_reply)}
                          disabled={!hasAccess}
                          style={{ background: 'none', border: 'none', cursor: hasAccess ? 'pointer' : 'not-allowed', color: auth?.can_reply ? '#10b981' : '#9ca3af', opacity: hasAccess ? 1 : 0.5 }}
                        >
                          {auth?.can_reply ? <CheckSquare /> : <Square />}
                        </button>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <button 
                          onClick={() => handleToggleAuth(member.user_id, 'can_send_media', auth?.can_send_media)}
                          disabled={!hasAccess}
                          style={{ background: 'none', border: 'none', cursor: hasAccess ? 'pointer' : 'not-allowed', color: auth?.can_send_media ? '#10b981' : '#9ca3af', opacity: hasAccess ? 1 : 0.5 }}
                        >
                          {auth?.can_send_media ? <CheckSquare /> : <Square />}
                        </button>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        {hasAccess && (
                          <button 
                            onClick={() => handleRemoveAuth(auth.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                            title="Remove Access"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                        {!hasAccess && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No Access</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
