import React, { useState, useEffect } from 'react';
import { Monitor, LogOut, Search, Calendar } from 'lucide-react';
import { forceLogoutSession, forceLogoutAllOtherSessions } from '@/app/actions/audit';
import { createClient } from '@/utils/supabase/client';

export default function ActiveSessionsConfig() {
  const [activeSessions, setActiveSessions] = useState([]);
  const [filteredSessions, setFilteredSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const supabase = createClient();
        
        let query = supabase
          .from('user_sessions')
          .select('*')
          .eq('is_active', true)
          .order('last_active', { ascending: false });
          
        if (dateFrom) {
          query = query.gte('last_active', new Date(dateFrom).toISOString());
        }
        if (dateTo) {
          const endOfDay = new Date(dateTo);
          endOfDay.setHours(23, 59, 59, 999);
          query = query.lte('last_active', endOfDay.toISOString());
        }

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
            current: false
          }));
          
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const mySession = formattedSessions.find(s => s.email === user.email);
            if (mySession) mySession.current = true;
          }
          
          setActiveSessions(formattedSessions);
          setFilteredSessions(formattedSessions);
        }
      } catch (e) {
        console.error(e);
        setError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [dateFrom, dateTo]);

  useEffect(() => {
    // Client-side search filtering
    let filtered = activeSessions;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        s.user.toLowerCase().includes(q) || 
        s.email.toLowerCase().includes(q) || 
        s.device.toLowerCase().includes(q) ||
        s.ip.toLowerCase().includes(q)
      );
    }
    setFilteredSessions(filtered);
  }, [searchQuery, activeSessions]);

  return (
    <div style={{ padding: '2rem', maxWidth: '900px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Monitor size={24} color="var(--accent-color)" />
          Monitor Active Sessions
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>View and manage currently logged-in devices across your team.</p>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', flex: 1, minWidth: '250px' }}>
          <Search size={18} color="var(--text-secondary)" />
          <input 
            type="text" 
            placeholder="Search user, email, IP..." 
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

      <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading sessions...</div>
        ) : filteredSessions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No active sessions found.</div>
        ) : (
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
            {filteredSessions.map((session, i) => (
              <div key={session.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: session.current ? 'var(--th-filtered-bg)' : 'var(--bg-surface)', borderBottom: i < filteredSessions.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {session.user}
                    {session.current && <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: '#10b981', color: 'white', borderRadius: '10px' }}>Current Device</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {session.email} • {session.device} • IP: {session.ip} • Last Active: {session.lastActive}
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
        )}
        
        {filteredSessions.length > 0 && (
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
        )}
      </div>
    </div>
  );
}
