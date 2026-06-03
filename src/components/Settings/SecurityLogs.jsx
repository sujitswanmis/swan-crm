import React, { useState, useEffect } from 'react';
import { Lock, ShieldAlert, Monitor, Clock, LogOut, X } from 'lucide-react';
import { getTeamMembers } from '@/app/actions/team';

export default function SecurityLogs() {
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [activeSessions, setActiveSessions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [allAuditLogs, setAllAuditLogs] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const teamData = await getTeamMembers();
        let team = [];
        if (teamData && teamData.length > 0) {
          team = teamData.map(t => ({
            name: t.emp_name || t.email?.split('@')[0] || 'Unknown User',
            email: t.emp_official_mail_id || t.email || 'No email'
          }));
        }
        
        if (team.length === 0) {
          team = [
            { name: 'No Team Found', email: 'none@company.com' }
          ];
        }

        const sessions = [
          { id: 1, user: 'Admin (You)', email: 'admin@company.com', device: 'Chrome on Windows', ip: '192.168.1.10', current: true },
          ...team.slice(0, 3).map((member, i) => ({
            id: i + 2,
            user: member.name,
            email: member.email,
            device: i % 2 === 0 ? 'Safari on iPhone' : 'Chrome on Mac',
            ip: `192.168.1.${50 + i}`,
            current: false
          }))
        ];
        setActiveSessions(sessions);

        const generatedLogs = [
          { id: 1, user: team[0]?.name || 'User', email: team[0]?.email || '', action: 'Deleted Lead', target: 'Lead #20260529', time: '10 mins ago', ip: '192.168.1.50' },
          { id: 2, user: 'Admin (You)', email: 'admin@company.com', action: 'Changed Settings', target: 'CRM Stages', time: '1 hour ago', ip: '192.168.1.10' },
          { id: 3, user: team[1]?.name || 'User 2', email: team[1]?.email || '', action: 'Exported CSV', target: 'All Leads', time: '2 hours ago', ip: '192.168.1.51' },
          { id: 4, user: team[0]?.name || 'User', email: team[0]?.email || '', action: 'Updated Stage', target: 'Lead #20260528', time: '5 hours ago', ip: '192.168.1.50' },
          { id: 5, user: 'Admin (You)', email: 'admin@company.com', action: 'Logged In', target: 'System', time: '1 day ago', ip: '192.168.1.10' },
          { id: 6, user: team[1]?.name || 'User 2', email: team[1]?.email || '', action: 'Created Lead', target: 'Lead #20260530', time: '1 day ago', ip: '192.168.1.51' },
          { id: 7, user: 'Admin (You)', email: 'admin@company.com', action: 'Updated Settings', target: 'Notifications', time: '2 days ago', ip: '192.168.1.10' },
          { id: 8, user: team[0]?.name || 'User', email: team[0]?.email || '', action: 'Logged In', target: 'System', time: '2 days ago', ip: '192.168.1.50' },
        ];
        setAuditLogs(generatedLogs.slice(0, 4));
        setAllAuditLogs(generatedLogs);
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
                  <button style={{ background: 'none', border: 'none', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500 }}>
                    <LogOut size={16} /> Force Logout
                  </button>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: '1rem', textAlign: 'right' }}>
            <button 
              onClick={() => {
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
