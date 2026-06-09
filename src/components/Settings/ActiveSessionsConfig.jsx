import React, { useState, useEffect } from 'react';
import { Monitor, LogOut, Search, Calendar, History, ShieldOff } from 'lucide-react';
import { forceLogoutSession, forceLogoutAllOtherSessions } from '@/app/actions/audit';
import { createClient } from '@/utils/supabase/client';

export default function ActiveSessionsConfig() {
  const [allSessions, setAllSessions] = useState([]);
  const [filteredActive, setFilteredActive] = useState([]);
  const [filteredInactive, setFilteredInactive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      
      let query = supabase
        .from('user_sessions')
        .select('*')
        .order('last_active', { ascending: false });
        
      if (dateFrom) {
        query = query.gte('last_active', new Date(dateFrom).toISOString());
      }
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('last_active', endOfDay.toISOString());
      }

      // Limit to 500 records overall for performance
      query = query.limit(500);

      const { data: sessionsData, error: sessionErr } = await query;

      if (sessionErr) {
        throw new Error('Session DB Error: ' + sessionErr.message);
      }

      if (sessionsData) {
        const formattedSessions = sessionsData.map(s => ({
          id: s.id,
          user: s.emp_name || 'System User',
          email: s.email,
          device: s.device || 'Unknown Device',
          ip: s.ip_address || 'Unknown IP',
          lastActive: new Date(s.last_active).toLocaleString(),
          isActive: s.is_active,
          current: false
        }));
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const mySession = formattedSessions.find(s => s.email === user.email && s.isActive);
          if (mySession) mySession.current = true;
        }
        
        setAllSessions(formattedSessions);
      }
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [dateFrom, dateTo]);

  useEffect(() => {
    // Client-side search filtering
    let filtered = allSessions;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        s.user.toLowerCase().includes(q) || 
        s.email.toLowerCase().includes(q) || 
        s.device.toLowerCase().includes(q) ||
        s.ip.toLowerCase().includes(q)
      );
    }
    
    // Split into Active and Inactive
    setFilteredActive(filtered.filter(s => s.isActive));
    setFilteredInactive(filtered.filter(s => !s.isActive));
    
  }, [searchQuery, allSessions]);

  const handleForceLogout = async (sessionId) => {
    await forceLogoutSession(sessionId);
    // Refresh the list immediately
    fetchSessions();
  };

  const handleForceLogoutAll = async () => {
    const currentDevice = typeof navigator !== 'undefined' ? navigator.userAgent : null;
    await forceLogoutAllOtherSessions(currentDevice);
    alert('All other devices have been logged out.');
    fetchSessions();
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Monitor size={24} color="var(--accent-color)" />
          Monitor User Sessions
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>View currently active users and the history of old logouts.</p>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      {/* Global Filters */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', flex: 1, minWidth: '250px' }}>
          <Search size={18} color="var(--text-secondary)" />
          <input 
            type="text" 
            placeholder="Search user, email, IP, device..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', width: '100%' }}
          />
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
          <Calendar size={18} color="var(--text-secondary)" />
          <input 
            type="date" 
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)' }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>to</span>
          <input 
            type="date" 
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {loading && allSessions.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading sessions...</div>
      ) : (
        <>
          {/* Section 1: Active User Sessions */}
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <Monitor size={20} color="#10b981" />
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Active User Sessions ({filteredActive.length})</h3>
            </div>
            
            {filteredActive.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px dashed var(--border-light)' }}>
                No active sessions found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--th-filtered-bg)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Emp Name & Email</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Device Info</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>IP Address</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Last Active</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActive.map((session, i) => (
                      <tr key={session.id} style={{ borderBottom: i < filteredActive.length - 1 ? '1px solid var(--border-light)' : 'none', background: session.current ? 'var(--th-filtered-bg)' : 'var(--bg-surface)' }}>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {session.user}
                            {session.current && <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: '#10b981', color: 'white', borderRadius: '10px', fontWeight: 500 }}>Current Device</span>}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{session.email}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={session.device}>
                          {session.device}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{session.ip}</td>
                        <td style={{ padding: '0.75rem 1rem', color: '#10b981', fontWeight: 500 }}>{session.lastActive}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          {!session.current && (
                            <button 
                              onClick={() => handleForceLogout(session.id)}
                              style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 500, padding: '0.4rem 0.6rem', borderRadius: '6px', transition: 'all 0.2s' }}
                            >
                              <LogOut size={14} /> Force Logout
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {filteredActive.length > 1 && (
              <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
                <button 
                  onClick={handleForceLogoutAll}
                  style={{ padding: '0.6rem 1.25rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
                >
                  Force Logout All Other Devices
                </button>
              </div>
            )}
          </div>

          {/* Section 2: User Session Logs (Inactive) */}
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <History size={20} color="var(--text-secondary)" />
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>User Session Logs ({filteredInactive.length})</h3>
            </div>
            
            {filteredInactive.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px dashed var(--border-light)' }}>
                No past session logs found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--th-filtered-bg)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>User & Email</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Device Info</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>IP Address</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Last Active (Logout)</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInactive.map((session) => (
                      <tr key={session.id} style={{ borderBottom: '1px solid var(--border-light)', background: 'var(--bg-surface)' }}>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                          <div>{session.user}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{session.email}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={session.device}>
                          {session.device}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{session.ip}</td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{session.lastActive}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
                            <ShieldOff size={12} /> Logged Out
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
