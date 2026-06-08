import React, { useState, useEffect } from 'react';
import { Lock, ShieldAlert, Monitor, Clock, LogOut, X } from 'lucide-react';
import { getTeamMembers } from '@/app/actions/team';
import { forceLogoutSession, forceLogoutAllOtherSessions } from '@/app/actions/audit';

export default function SecurityLogs() {
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [activeSessions, setActiveSessions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [allAuditLogs, setAllAuditLogs] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { createClient } = await import('@/utils/supabase/client');
        const supabase = createClient();
        
        // 1. Fetch Active Sessions
        const { data: sessionsData, error: sessionErr } = await supabase
          .from('user_sessions')
          .select('*')
          .eq('is_active', true)
          .order('last_active', { ascending: false });

        if (!sessionErr && sessionsData) {
          const formattedSessions = sessionsData.map(s => ({
            id: s.id,
            user: s.emp_name || 'System User',
            email: s.email,
            device: s.device || 'Unknown Device',
            ip: s.ip_address || 'Unknown IP',
            current: false // We will set this in CRMContainer or based on a local flag if needed
          }));
          
          // Let's mark the most recently active session for the current user as "Current"
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const mySession = formattedSessions.find(s => s.email === user.email);
            if (mySession) mySession.current = true;
          }
          
          setActiveSessions(formattedSessions);
        }

        // 2. Fetch Audit Logs
        const { data: auditData, error: auditErr } = await supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50); // Get latest 50 for the full modal

        if (!auditErr && auditData) {
          const formattedLogs = auditData.map(log => {
            const d = new Date(log.created_at);
            return {
              id: log.id,
              user: log.emp_name || 'System User',
              email: log.email,
              action: log.action,
              target: log.target,
              ip: log.ip_address || 'Logged via Web App',
              time: `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
            };
          });
          
          setAllAuditLogs(formattedLogs);
          setAuditLogs(formattedLogs.slice(0, 5));
        }

      } catch (e) {
        console.error(e);
      }
    };
    
    fetchData();
  }, []);

  return (
    <div style={{ padding: '2rem', maxWidth: '900px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Lock size={24} color="var(--accent-color)" />
          Security & Activity Logs
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Monitor team activity and secure your CRM access.</p>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexDirection: 'column' }}>
        
        {/* IP Whitelisting */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <ShieldAlert size={20} color="var(--text-primary)" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>IP Whitelisting (Office Network)</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Restrict CRM access so employees can only log in from specified office IP addresses. Leave empty to allow access from anywhere.
          </p>
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            <input 
              type="text" 
              placeholder="e.g. 117.20.55.12, 192.168.1.1" 
              style={{ flex: 1, maxWidth: '400px', padding: '0.75rem 1rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            />
            <button style={{ padding: '0.75rem 1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500 }}>
              Update Whitelist
            </button>
          </div>
        </div>

        {/* Active Sessions */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <Monitor size={20} color="var(--text-primary)" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Active Sessions</h3>
          </div>
          
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
            {activeSessions.map((session, i) => (
              <div key={session.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: session.current ? 'var(--th-filtered-bg)' : 'var(--bg-surface)', borderBottom: i < activeSessions.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {session.user}
                    {session.current && <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: '#10b981', color: 'white', borderRadius: '10px' }}>Current Device</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {session.email} • {session.device} • IP: {session.ip}
                  </div>
                </div>
                {!session.current && (
                  <button 
                    onClick={async () => {
                      await forceLogoutSession(session.id);
                      setActiveSessions(activeSessions.filter(s => s.id !== session.id));
                    }}
                    style={{ background: 'none', border: 'none', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500 }}
                  >
                    <LogOut size={16} /> Force Logout
                  </button>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: '1rem', textAlign: 'right' }}>
            <button 
              onClick={async () => {
                await forceLogoutAllOtherSessions();
                setActiveSessions(activeSessions.filter(s => s.current));
                alert('All other devices have been logged out.');
              }}
              style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Force Logout All Devices
            </button>
          </div>
        </div>

        {/* Audit Logs */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <Clock size={20} color="var(--text-primary)" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Activity Audit Logs</h3>
          </div>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--th-filtered-bg)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>User</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Action</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Target</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>IP Address</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--border-light)', background: 'var(--bg-surface)' }}>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    <div>{log.user}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{log.email}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)' }}>{log.action}</td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)' }}>{log.target}</td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{log.ip}</td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{log.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button 
              onClick={() => setShowAuditModal(true)}
              style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500 }}
            >
              View Full Audit History →
            </button>
          </div>
        </div>

      </div>

      {/* Full Audit History Modal */}
      {showAuditModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'var(--bg-primary, #ffffff)',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '800px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-primary)' }}>
                <Clock size={24} color="var(--accent-color)" />
                Full Audit History
              </h2>
              <button onClick={() => setShowAuditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: 'var(--th-filtered-bg)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>User</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Action</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Target</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>IP Address</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {allAuditLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '1rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                        <div>{log.user}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{log.email}</div>
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-primary)' }}>{log.action}</td>
                      <td style={{ padding: '1rem', color: 'var(--text-primary)' }}>{log.target}</td>
                      <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{log.ip}</td>
                      <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{log.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                End of history. (Mock Data)
              </div>
            </div>
          </div>
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
