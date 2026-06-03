import React, { useState, useEffect } from 'react';
import { getInstances, createNewInstance, regenerateInstanceQr, logoutInstance, syncInstanceStatus } from '@/app/actions/whatsappUnofficialDb';
import { QRCodeSVG } from 'qrcode.react';
import { Plus, RefreshCw, QrCode, LogOut, Loader2, CheckCircle2 } from 'lucide-react';

export default function InstanceManagement({ userId }) {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInstanceForQr, setSelectedInstanceForQr] = useState(null); // stores { id, qrCode, name, status }
  const [qrPollingInterval, setQrPollingInterval] = useState(null);

  const fetchInstances = async () => {
    const { success, data } = await getInstances();
    if (success) {
      setInstances(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInstances();
  }, []);

  // Poll status while QR modal is open
  useEffect(() => {
    if (selectedInstanceForQr) {
      const interval = setInterval(async () => {
        const { success, status } = await syncInstanceStatus(selectedInstanceForQr.id);
        if (success && status) {
          setSelectedInstanceForQr(prev => ({ ...prev, status }));
          if (status === 'CONNECTED') {
            fetchInstances(); // refresh list
          }
        }
      }, 3000);
      setQrPollingInterval(interval);

      return () => clearInterval(interval);
    }
  }, [selectedInstanceForQr]);

  const handleCreate = async () => {
    if (!newInstanceName.trim()) return;
    setLoading(true);
    const { success, data, error } = await createNewInstance(newInstanceName);
    if (success && data) {
      setShowCreateModal(false);
      setNewInstanceName('');
      await fetchInstances();
      // Immediately open QR for the new instance
      handleShowQr(data);
    } else {
      alert(error || 'Failed to create instance');
    }
    setLoading(false);
  };

  const handleShowQr = async (instance) => {
    if (instance.status === 'CONNECTED') return; // no need
    
    setLoading(true);
    // Request new QR if required or pending
    const { success, data, error } = await regenerateInstanceQr(instance.id);
    setLoading(false);
    
    if (success && data) {
      setSelectedInstanceForQr({
        id: instance.id,
        name: instance.instance_name,
        qrCode: data.qr_code,
        status: data.status
      });
      fetchInstances();
    } else {
      alert(error || 'Failed to generate QR');
    }
  };

  const handleLogout = async (id) => {
    if (!window.confirm('Are you sure you want to log out this WhatsApp account? The data will remain, but it will need to be re-scanned.')) return;
    setLoading(true);
    await logoutInstance(id);
    await fetchInstances();
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'CONNECTED': return <span style={{ padding: '4px 8px', background: '#ecfdf5', color: '#10b981', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>Connected</span>;
      case 'QR_REQUIRED': return <span style={{ padding: '4px 8px', background: '#fffbeb', color: '#f59e0b', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>QR Required</span>;
      case 'LOGGED_OUT': return <span style={{ padding: '4px 8px', background: '#f3f4f6', color: '#6b7280', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>Logged Out</span>;
      case 'FAILED': return <span style={{ padding: '4px 8px', background: '#fef2f2', color: '#ef4444', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>Failed</span>;
      default: return <span style={{ padding: '4px 8px', background: '#eff6ff', color: '#3b82f6', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>{status}</span>;
    }
  };

  return (
    <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>Instance Management</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={fetchInstances} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Plus size={16} /> New Instance
          </button>
        </div>
      </div>

      <div className="card">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--th-filtered-bg)' }}>
            <tr>
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>Instance Name</th>
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>Phone Number</th>
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>Status</th>
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>Last Connected</th>
              <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && instances.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading instances...</td></tr>
            ) : instances.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No instances found. Create one to get started.</td></tr>
            ) : instances.map(inst => (
              <tr key={inst.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                <td style={{ padding: '1rem' }}>
                  <div style={{ fontWeight: 500 }}>{inst.instance_name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ID: {inst.id.substring(0,8)}...</div>
                </td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{inst.phone_number || 'N/A'}</td>
                <td style={{ padding: '1rem' }}>{getStatusBadge(inst.status)}</td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  {inst.last_connected_at ? new Date(inst.last_connected_at).toLocaleString() : 'Never'}
                </td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    {inst.status !== 'CONNECTED' && (
                      <button onClick={() => handleShowQr(inst)} className="btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        <QrCode size={14} /> Scan QR
                      </button>
                    )}
                    {inst.status === 'CONNECTED' && (
                      <button onClick={() => handleLogout(inst.id)} style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        <LogOut size={14} /> Logout
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '400px', padding: '1.5rem' }}>
            <h3 style={{ marginTop: 0 }}>Create New Instance</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>A new instance will allow you to link a separate WhatsApp account.</p>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label>Instance Name</label>
              <input type="text" className="input-field" value={newInstanceName} onChange={(e) => setNewInstanceName(e.target.value)} placeholder="e.g. Sales Team WhatsApp" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleCreate} disabled={!newInstanceName.trim() || loading} className="btn-primary">
                {loading ? 'Creating...' : 'Create Instance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {selectedInstanceForQr && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '350px', padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Scan QR Code</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Open WhatsApp on your phone {"->"} Linked Devices {"->"} Link a Device
            </p>
            
            {selectedInstanceForQr.status === 'CONNECTED' ? (
              <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <CheckCircle2 size={48} color="#10b981" />
                <h4 style={{ margin: 0, color: '#10b981' }}>Connected Successfully!</h4>
              </div>
            ) : selectedInstanceForQr.qrCode ? (
              <div style={{ background: '#fff', padding: '1rem', borderRadius: '8px', display: 'inline-block' }}>
                <QRCodeSVG value={selectedInstanceForQr.qrCode} size={200} />
              </div>
            ) : (
              <div style={{ padding: '3rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                <Loader2 size={24} className="spin" /> Generating QR...
              </div>
            )}

            <div style={{ marginTop: '1.5rem' }}>
              {selectedInstanceForQr.status !== 'CONNECTED' && (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <Loader2 size={16} className="spin" /> Waiting for connection...
                </p>
              )}
            </div>

            <button onClick={() => setSelectedInstanceForQr(null)} className="btn-secondary" style={{ marginTop: '1rem', width: '100%' }}>
              {selectedInstanceForQr.status === 'CONNECTED' ? 'Close' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
