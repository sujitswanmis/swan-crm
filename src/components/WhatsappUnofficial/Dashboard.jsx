import React, { useState, useEffect } from 'react';
import { getInstances } from '@/app/actions/whatsappUnofficialDb';
import { Smartphone, CheckCircle, AlertTriangle, LogOut, XCircle, RefreshCw } from 'lucide-react';

export default function Dashboard({ userId, isAdmin }) {
  const [metrics, setMetrics] = useState({ total: 0, connected: 0, qrRequired: 0, loggedOut: 0, failed: 0 });
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    setLoading(true);
    const { success, data } = await getInstances();
    if (success && data) {
      let total = data.length;
      let connected = 0, qrRequired = 0, loggedOut = 0, failed = 0;
      data.forEach(inst => {
        if (inst.status === 'CONNECTED') connected++;
        else if (inst.status === 'QR_REQUIRED' || inst.status === 'QR_PENDING') qrRequired++;
        else if (inst.status === 'LOGGED_OUT') loggedOut++;
        else if (inst.status === 'FAILED') failed++;
      });
      setMetrics({ total, connected, qrRequired, loggedOut, failed });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>WhatsApp Dashboard</h2>
        <button onClick={fetchMetrics} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        
        <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ padding: '1rem', background: '#eff6ff', color: '#3b82f6', borderRadius: '12px' }}>
            <Smartphone size={24} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{metrics.total}</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Total Instances</p>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid #10b981' }}>
          <div style={{ padding: '1rem', background: '#ecfdf5', color: '#10b981', borderRadius: '12px' }}>
            <CheckCircle size={24} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{metrics.connected}</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Connected</p>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ padding: '1rem', background: '#fffbeb', color: '#f59e0b', borderRadius: '12px' }}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{metrics.qrRequired}</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>QR Required</p>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid #6b7280' }}>
          <div style={{ padding: '1rem', background: '#f3f4f6', color: '#6b7280', borderRadius: '12px' }}>
            <LogOut size={24} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{metrics.loggedOut}</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Logged Out</p>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid #ef4444' }}>
          <div style={{ padding: '1rem', background: '#fef2f2', color: '#ef4444', borderRadius: '12px' }}>
            <XCircle size={24} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{metrics.failed}</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Failed</p>
          </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
