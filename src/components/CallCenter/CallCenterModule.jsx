'use client';
import React, { useState, useEffect } from 'react';
import { PhoneCall, Users, Clock, Database, Loader2, ShieldAlert } from 'lucide-react';
import { getAgentProfile, getRecentCalls, updateCallAgentAdmin } from '@/app/actions/team';


export default function CallCenterModule({ userId }) {
  const [agentData, setAgentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [customerNumber, setCustomerNumber] = useState('');
  const [callingMode, setCallingMode] = useState('browser_webrtc'); // browser_webrtc, mobile
  const [recentCalls, setRecentCalls] = useState([]);
  const [agentStatus, setAgentStatus] = useState('offline');
  const [activeSession, setActiveSession] = useState(null);

  useEffect(() => {
    fetchAgentProfile();
  }, [userId]);

  const fetchAgentProfile = async () => {
    try {
      const { data, error } = await getAgentProfile(userId);
        
      if (data) {
        setAgentData(data);
        if (data.default_calling_mode) {
           setCallingMode(data.default_calling_mode);
        }
        fetchRecent(data.id);
      }
    } catch (err) {
      console.error('Error fetching agent profile', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecent = async (agentId) => {
    const { data } = await getRecentCalls(agentId);
    if (data) {
      setRecentCalls(data);
      // Check if there is an active session
      const active = data.find(c => ['initiated', 'ringing', 'agent_answered', 'connected'].includes(c.status));
      setActiveSession(active || null);
    }
  };

  const updateAgentStatus = async (status) => {
    setAgentStatus(status);
    if (agentData) {
      await updateCallAgentAdmin(agentData.id, { status });
    }
  };

  const handleStartCall = async (e) => {
    e.preventDefault();
    if (!customerNumber) return;

    try {
      const res = await fetch('/api/plivo/start-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerNumber: `+91${customerNumber}`,
          callingMode,
          agentEndpoint: agentData?.plivo_sip_uri,
          agentMobile: agentData?.mobile_number
        })
      });
      const result = await res.json();
      if (result.error) {
        alert("Call Error: " + result.error);
      } else {
        setCustomerNumber('');
        // Refresh call history after a short delay
        setTimeout(() => { if (agentData) fetchRecent(agentData.id); }, 2000);
      }
    } catch (err) {
      alert("Failed to start call");
    }
  };

  const handleCallEnded = () => {
    setActiveSession(null);
    if (agentData) fetchRecent(agentData.id);
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#666' }}><Loader2 className="spin" size={24} /> Loading Call Center...</div>;
  }

  if (!agentData) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#666' }}>
        <ShieldAlert size={48} style={{ margin: '0 auto 1rem', color: '#ef4444' }} />
        <h2>Call Center Access Denied</h2>
        <p>You have not been assigned as a Call Center Agent. Please contact the administrator.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', height: '100%', overflowY: 'auto', background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PhoneCall size={28} color="#3b82f6" /> Telecalling Dashboard
          </h1>
          <p style={{ color: '#64748b', marginTop: '0.25rem' }}>SIP: {agentData.plivo_sip_uri || 'Not Assigned'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'white', padding: '0.5rem 1rem', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: agentStatus === 'available' ? '#10b981' : '#cbd5e1' }} />
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>
            {agentStatus === 'available' ? 'Agent Ready' : 'Offline'}
          </span>
        </div>
      </div>

      <div>
        
        {/* Call Logs */}
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={18} color="#64748b" /> My Recent Calls
            </h3>
          </div>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead style={{ backgroundColor: 'var(--th-bg)' }}>
                <tr style={{ color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 1.5rem', fontWeight: 600 }}>Date & Time</th>
                  <th style={{ padding: '0.75rem 1.5rem', fontWeight: 600 }}>Customer</th>
                  <th style={{ padding: '0.75rem 1.5rem', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '0.75rem 1.5rem', fontWeight: 600 }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No recent calls found.</td>
                  </tr>
                ) : (
                  recentCalls.map(call => (
                    <tr key={call.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '1rem 1.5rem', color: '#475569' }}>
                        {new Date(call.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '1rem 1.5rem', fontWeight: 500, color: '#0f172a' }}>{call.customer_number}</td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <span style={{ 
                          padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                          background: call.status === 'connected' ? '#dcfce7' : call.status === 'ended' ? '#f1f5f9' : '#fee2e2',
                          color: call.status === 'connected' ? '#166534' : call.status === 'ended' ? '#475569' : '#991b1b'
                        }}>
                          {call.status}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', color: '#475569' }}>
                        {call.talk_duration_sec ? `${call.talk_duration_sec} sec` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
