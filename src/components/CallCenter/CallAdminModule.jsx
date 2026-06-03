'use client';
import React, { useState, useEffect } from 'react';
import { Settings, Users, Phone, Loader2, Save } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { getTeamMembers, getCallAdminData, addCallAgentAdmin, updateCallAgentAdmin } from '@/app/actions/team';

export default function CallAdminModule() {
  const [agents, setAgents] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [users, setUsers] = useState([]); // Team members from user_roles
  const [loading, setLoading] = useState(true);
  
  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch team users
      const userData = await getTeamMembers();
      // Filter out users with empty/invalid names to prevent () in dropdown
      if (userData) setUsers(userData.filter(u => u.emp_name && u.emp_name.trim() !== ''));

      // Fetch endpoints and agents via Server Action to bypass RLS
      const adminData = await getCallAdminData();
      setEndpoints(adminData.endpoints);
      setAgents(adminData.agents);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAgent = async (userId) => {
    const user = users.find(u => u.user_id === userId);
    if (!user) return;

    try {
      const res = await addCallAgentAdmin(userId, user.emp_name);
      if (res.success && res.data) {
        setAgents([...agents, res.data]);
      } else {
        alert("Failed to add agent: " + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert("Failed to add agent.");
    }
  };

  const updateAgentEndpoint = async (agentId, endpointKey) => {
    const endpoint = endpoints.find(e => e.endpoint_key === endpointKey);
    
    try {
      const res = await updateCallAgentAdmin(agentId, {
        plivo_endpoint_key: endpointKey,
        plivo_username: endpoint?.username || null,
        plivo_sip_uri: endpoint?.sip_uri || null
      });
      
      if (res.success) {
        setAgents(agents.map(a => a.id === agentId ? { ...a, plivo_endpoint_key: endpointKey, plivo_username: endpoint?.username, plivo_sip_uri: endpoint?.sip_uri } : a));
      } else {
        alert("Failed to assign endpoint: " + res.error);
      }
    } catch (err) {
      alert("Failed to assign endpoint.");
    }
  };

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center' }}><Loader2 className="spin" /> Loading Call Center Settings...</div>;

  const unassignedUsers = users.filter(u => !agents.some(a => a.user_id === u.user_id));

  return (
    <div style={{ padding: '2rem', height: '100%', overflowY: 'auto', background: '#f8fafc' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Settings size={28} color="#3b82f6" /> Call Center Administration
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        
        {/* Assign Agents Panel */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} /> Add User to Call Center
          </h2>
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            <select id="newUserSelect" style={{ flex: 1, padding: '0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
              <option value="">Select Team Member...</option>
              {unassignedUsers.map(u => (
                <option key={u.user_id} value={u.user_id}>{u.emp_name} ({u.emp_department})</option>
              ))}
            </select>
            <button 
              className="btn-primary" 
              onClick={() => {
                const val = document.getElementById('newUserSelect').value;
                if (val) handleAddAgent(val);
              }}
            >
              Authorize User
            </button>
          </div>
        </div>

        {/* Existing Call Agents */}
        <div className="card" style={{ padding: '1.5rem', gridColumn: '1 / -1' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Phone size={18} /> Call Agents & Endpoints
          </h2>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Agent Name</th>
                <th style={{ padding: '0.75rem 1rem' }}>Calling Mode</th>
                <th style={{ padding: '0.75rem 1rem' }}>Plivo SIP Endpoint</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => (
                <tr key={agent.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '1rem', fontWeight: 500 }}>{agent.display_name}</td>
                  <td style={{ padding: '1rem' }}>
                    <select 
                      value={agent.default_calling_mode || 'browser_webrtc'}
                      onChange={async (e) => {
                        const val = e.target.value;
                        const res = await updateCallAgentAdmin(agent.id, { default_calling_mode: val });
                        if (res.success) {
                           setAgents(agents.map(a => a.id === agent.id ? {...a, default_calling_mode: val} : a));
                        }
                      }}
                      style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    >
                      <option value="browser_webrtc">Browser Softphone</option>
                      <option value="mobile">Mobile Number</option>
                      <option value="external_softphone">External Softphone</option>
                    </select>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <select 
                      value={agent.plivo_endpoint_key || ''}
                      onChange={(e) => updateAgentEndpoint(agent.id, e.target.value)}
                      style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', width: '200px' }}
                    >
                      <option value="">No Endpoint Assigned</option>
                      {endpoints.map(ep => (
                        <option key={ep.endpoint_key} value={ep.endpoint_key}>{ep.alias} ({ep.endpoint_key})</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                      background: agent.status === 'available' ? '#dcfce7' : '#f1f5f9',
                      color: agent.status === 'available' ? '#166534' : '#64748b'
                    }}>
                      {agent.status}
                    </span>
                  </td>
                </tr>
              ))}
              {agents.length === 0 && (
                <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No call center agents added yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
