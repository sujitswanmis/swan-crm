import React, { useState, useEffect } from 'react';
import { Clock, Search, Calendar } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function AuditLogsConfig() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
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
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false });
          
        if (dateFrom) {
          query = query.gte('created_at', new Date(dateFrom).toISOString());
        }
        if (dateTo) {
          const endOfDay = new Date(dateTo);
          endOfDay.setHours(23, 59, 59, 999);
          query = query.lte('created_at', endOfDay.toISOString());
        }
        
        // Limit to 500 records max for performance
        query = query.limit(500);

        const { data: auditData, error: auditErr } = await query;

        if (auditErr) {
          throw new Error('Audit DB Error: ' + auditErr.message);
        }

        if (auditData) {
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
          
          setAuditLogs(formattedLogs);
          setFilteredLogs(formattedLogs);
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
    let filtered = auditLogs;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(log => 
        log.user.toLowerCase().includes(q) || 
        log.email.toLowerCase().includes(q) || 
        log.action.toLowerCase().includes(q) ||
        log.target.toLowerCase().includes(q) ||
        log.ip.toLowerCase().includes(q)
      );
    }
    setFilteredLogs(filtered);
  }, [searchQuery, auditLogs]);

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Clock size={24} color="var(--accent-color)" />
          Activity Audit Logs
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Review all system activities, settings changes, and lead modifications.</p>
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
            placeholder="Search by action, user, or target..." 
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
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading audit logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No audit logs found for the selected criteria.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
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
                {filteredLogs.map((log) => (
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
          </div>
        )}
      </div>
    </div>
  );
}
