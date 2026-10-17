import MobileTableView from '@/components/common/MobileTableView';
import React, { useState, useEffect } from 'react';
import { 
  getInstances, 
  createNewInstance, 
  regenerateInstanceQr, 
  logoutInstance, 
  rebootInstanceDb, 
  reconnectInstanceDb, 
  syncInstanceStatus, 
  getInstanceLimitInfo 
} from '@/app/actions/whatsappUnofficialDb';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Plus, RefreshCw, QrCode, LogOut, Loader2, 
  CheckCircle2, Copy, Check, RotateCcw, AlertTriangle, Shield 
} from 'lucide-react';

export default function InstanceManagement({ userId }) {
  const [instances, setInstances] = useState([]);
  const [limitInfo, setLimitInfo] = useState({ connectedCount: 0, maxLimit: 5, isLimitReached: false });
  const [loading, setLoading] = useState(true);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInstanceForQr, setSelectedInstanceForQr] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchInstancesAndLimits = async () => {
    setLoading(true);
    const [instRes, limRes] = await Promise.all([
      getInstances(),
      getInstanceLimitInfo()
    ]);

    if (instRes.success) {
      setInstances(instRes.data || []);
    }
    if (limRes.success) {
      setLimitInfo(limRes);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInstancesAndLimits();
  }, []);

  // Poll status while QR modal is open
  useEffect(() => {
    if (selectedInstanceForQr && selectedInstanceForQr.status !== 'CONNECTED') {
      const interval = setInterval(async () => {
        const { success, status } = await syncInstanceStatus(selectedInstanceForQr.id);
        if (success && status) {
          setSelectedInstanceForQr(prev => prev ? { ...prev, status } : null);
          if (status === 'CONNECTED') {
            await fetchInstancesAndLimits();
          }
        }
      }, 3000);

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
      await fetchInstancesAndLimits();
      // Immediately open QR for the new instance
      handleShowQr(data);
    } else {
      alert(error || 'Failed to create instance');
    }
    setLoading(false);
  };

  const handleShowQr = async (instance) => {
    setActionLoadingId(instance.id);
    const { success, data, error, status, alreadyConnected } = await regenerateInstanceQr(instance.id);
    setActionLoadingId(null);
    
    if (success) {
      if (alreadyConnected || status === 'CONNECTED') {
        setSelectedInstanceForQr({
          id: instance.id,
          name: instance.instance_name,
          qrCode: null,
          status: 'CONNECTED'
        });
      } else if (data) {
        setSelectedInstanceForQr({
          id: instance.id,
          name: instance.instance_name,
          qrCode: data.qr_code,
          status: data.status || 'QR_PENDING'
        });
      }
      fetchInstancesAndLimits();
    } else {
      alert(error || 'Failed to generate QR code');
    }
  };

  const handleReconnect = async (instanceId) => {
    setActionLoadingId(instanceId);
    const res = await reconnectInstanceDb(instanceId);
    setActionLoadingId(null);
    if (res.success) {
      alert('Reconnect command dispatched to WhatsApp gateway!');
      await fetchInstancesAndLimits();
    } else {
      alert(res.error || 'Failed to reconnect instance');
    }
  };

  const handleReboot = async (instanceId) => {
    if (!window.confirm('Reboot will log out the session and generate a fresh QR scan. Do you want to continue?')) return;
    setActionLoadingId(instanceId);
    const res = await rebootInstanceDb(instanceId);
    setActionLoadingId(null);
    if (res.success) {
      await fetchInstancesAndLimits();
      alert('Instance rebooted. You can now do a fresh scan.');
    } else {
      alert(res.error || 'Failed to reboot instance');
    }
  };

  const handleLogout = async (id) => {
    if (!window.confirm('Are you sure you want to log out this WhatsApp account?')) return;
    setActionLoadingId(id);
    await logoutInstance(id);
    setActionLoadingId(null);
    await fetchInstancesAndLimits();
  };

  const handleCopyKey = (key) => {
    if (!key) return;
    navigator.clipboard.writeText(key);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'CONNECTED': 
        return <span style={{ padding: '4px 10px', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', borderRadius: '12px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={12} /> Connected</span>;
      case 'QR_REQUIRED': 
        return <span style={{ padding: '4px 10px', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>QR Required</span>;
      case 'QR_PENDING':
        return <span style={{ padding: '4px 10px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>Awaiting Scan</span>;
      case 'LOGGED_OUT': 
        return <span style={{ padding: '4px 10px', background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>Logged Out</span>;
      case 'FAILED': 
        return <span style={{ padding: '4px 10px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>Failed</span>;
      default: 
        return <span style={{ padding: '4px 10px', background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>{status}</span>;
    }
  };

  return (
    <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
      
      {/* Header with Title and Capacity Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>Instance Management</h2>
            
            {/* Master Admin Capacity Limit Badge */}
            <span style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.35rem',
              padding: '4px 12px', 
              borderRadius: '20px', 
              fontSize: '0.75rem', 
              fontWeight: 700,
              background: limitInfo.isLimitReached ? '#fef2f2' : '#f0fdf4',
              color: limitInfo.isLimitReached ? '#b91c1c' : '#15803d',
              border: `1px solid ${limitInfo.isLimitReached ? '#fca5a5' : '#86efac'}`
            }}>
              <Shield size={13} />
              Master Limit: {limitInfo.connectedCount} / {limitInfo.maxLimit > 0 ? limitInfo.maxLimit : '∞'} Connected
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0.3rem 0 0 0' }}>
            Manage linked WhatsApp accounts, scan QR codes, and monitor live gateway connection status.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            onClick={fetchInstancesAndLimits} 
            className="btn-secondary" 
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem 1rem', borderRadius: '6px' }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          
          <button 
            onClick={() => {
              if (limitInfo.isLimitReached) {
                alert(`Master Admin scan limit reached (${limitInfo.connectedCount}/${limitInfo.maxLimit}). Please disconnect an unused instance or request Master Admin to increase capacity.`);
                return;
              }
              setShowCreateModal(true);
            }} 
            className="btn-primary" 
            style={{ 
              display: 'flex', 
              gap: '0.5rem', 
              alignItems: 'center', 
              padding: '0.5rem 1.15rem', 
              borderRadius: '6px',
              backgroundColor: limitInfo.isLimitReached ? '#94a3b8' : 'var(--accent-color)'
            }}
          >
            <Plus size={16} /> New Instance
          </button>
        </div>
      </div>

      {/* Warning Alert if Limit Reached */}
      {limitInfo.isLimitReached && (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          color: '#92400e',
          fontSize: '0.85rem'
        }}>
          <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0 }} />
          <div>
            <strong>Scan Limit Reached:</strong> You have reached the maximum allowed limit of {limitInfo.maxLimit} active WhatsApp account(s) set by Master Admin. To connect a different account, log out of an existing account or update the limit in Master Admin &gt; Config Master Studio &gt; Platform Messaging.
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="card" style={{ borderRadius: '10px', overflow: 'hidden' }}>
        <MobileTableView id="WhatsappUnofficial/InstanceManagement-1">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--th-filtered-bg)' }}>
              <tr>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'left', borderBottom: '1px solid var(--border-light)', fontSize: '0.85rem' }}>Instance Name</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'left', borderBottom: '1px solid var(--border-light)', fontSize: '0.85rem' }}>Instance ID / Key</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'left', borderBottom: '1px solid var(--border-light)', fontSize: '0.85rem' }}>Phone Number</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'left', borderBottom: '1px solid var(--border-light)', fontSize: '0.85rem' }}>Status</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'left', borderBottom: '1px solid var(--border-light)', fontSize: '0.85rem' }}>Last Connected</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right', borderBottom: '1px solid var(--border-light)', fontSize: '0.85rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && instances.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading WhatsApp instances...</td></tr>
              ) : instances.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No WhatsApp instances found. Click &quot;New Instance&quot; to link your WhatsApp account.</td></tr>
              ) : instances.map(inst => (
                <tr key={inst.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{inst.instance_name}</div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'var(--th-filtered-bg)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                      <span>{inst.instance_key}</span>
                      <button 
                        onClick={() => handleCopyKey(inst.instance_key)}
                        title="Copy Instance ID"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)' }}
                      >
                        {copiedId === inst.instance_key ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {inst.phone_number || 'N/A'}
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    {getStatusBadge(inst.status)}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                    {inst.last_connected_at 
                      ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }).format(new Date(inst.last_connected_at))
                      : 'Never'}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                      {actionLoadingId === inst.id ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Loader2 size={14} className="animate-spin" /> Processing...
                        </span>
                      ) : (
                        <>
                          {inst.status !== 'CONNECTED' && (
                            <button 
                              onClick={() => handleShowQr(inst)} 
                              className="btn-primary" 
                              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', display: 'flex', gap: '0.3rem', alignItems: 'center', borderRadius: '4px', backgroundColor: '#059669' }}
                            >
                              <QrCode size={14} /> Scan QR
                            </button>
                          )}

                          {inst.status === 'CONNECTED' && (
                            <button 
                              onClick={() => handleReconnect(inst.id)} 
                              className="btn-secondary" 
                              title="Reconnect session"
                              style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem', display: 'flex', gap: '0.3rem', alignItems: 'center', borderRadius: '4px' }}
                            >
                              <RotateCcw size={13} /> Reconnect
                            </button>
                          )}

                          <button 
                            onClick={() => handleReboot(inst.id)} 
                            className="btn-secondary" 
                            title="Reboot session and do fresh scan"
                            style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem', display: 'flex', gap: '0.3rem', alignItems: 'center', borderRadius: '4px' }}
                          >
                            <RefreshCw size={13} /> Reboot
                          </button>

                          {inst.status === 'CONNECTED' && (
                            <button 
                              onClick={() => handleLogout(inst.id)} 
                              style={{ 
                                padding: '0.3rem 0.65rem', 
                                fontSize: '0.8rem', 
                                background: '#fef2f2', 
                                color: '#ef4444', 
                                border: '1px solid #fca5a5', 
                                borderRadius: '4px', 
                                cursor: 'pointer', 
                                display: 'flex', 
                                gap: '0.3rem', 
                                alignItems: 'center' 
                              }}
                            >
                              <LogOut size={13} /> Logout
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </MobileTableView>
      </div>

      {/* Create Instance Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(3px)' }}>
          <div className="card" style={{ width: '420px', padding: '1.75rem', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.2rem', fontWeight: 700 }}>Create New WhatsApp Instance</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: '1.4' }}>
              A new instance creates a unique identifier on the WhatsApp Gateway. Once created, you can immediately scan the QR code to link your phone.
            </p>
            
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem' }}>Instance Name *</label>
              <input 
                type="text" 
                className="input-field" 
                value={newInstanceName} 
                onChange={(e) => setNewInstanceName(e.target.value)} 
                placeholder="e.g. Sales WhatsApp or Support Desk" 
                autoFocus
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary" style={{ padding: '0.5rem 1rem', borderRadius: '6px' }}>Cancel</button>
              <button 
                onClick={handleCreate} 
                disabled={!newInstanceName.trim() || loading} 
                className="btn-primary"
                style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', backgroundColor: '#059669' }}
              >
                {loading ? 'Creating...' : 'Create &amp; Get QR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Scan Modal */}
      {selectedInstanceForQr && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ width: '380px', padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', borderRadius: '14px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 700 }}>
              {selectedInstanceForQr.status === 'CONNECTED' ? 'WhatsApp Connected' : 'Scan WhatsApp QR Code'}
            </h3>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '1.5rem' }}>
              {selectedInstanceForQr.status === 'CONNECTED' 
                ? 'Your WhatsApp session is active and ready to dispatch messages.' 
                : 'Open WhatsApp on your phone &gt; Linked Devices &gt; Link a Device &gt; Scan this code.'}
            </p>
            
            {selectedInstanceForQr.status === 'CONNECTED' ? (
              <div style={{ padding: '2rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={48} color="#10b981" />
                </div>
                <div>
                  <h4 style={{ margin: 0, color: '#10b981', fontSize: '1.15rem' }}>Connected Successfully!</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.35rem 0 0 0' }}>
                    Instance is now active for {selectedInstanceForQr.name}
                  </p>
                </div>
              </div>
            ) : selectedInstanceForQr.qrCode ? (
              <div style={{ background: '#fff', padding: '1rem', borderRadius: '10px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', display: 'inline-block' }}>
                {selectedInstanceForQr.qrCode.startsWith('data:image') || selectedInstanceForQr.qrCode.startsWith('http') ? (
                  <img 
                    src={selectedInstanceForQr.qrCode} 
                    alt="WhatsApp QR Code" 
                    style={{ width: 220, height: 220, display: 'block', margin: '0 auto', borderRadius: '6px' }} 
                  />
                ) : (
                  <QRCodeSVG value={selectedInstanceForQr.qrCode} size={220} />
                )}
              </div>
            ) : (
              <div style={{ padding: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)' }}>
                <Loader2 size={32} className="animate-spin" style={{ color: '#059669' }} />
                <span>Generating live QR code...</span>
              </div>
            )}

            <div style={{ marginTop: '1.25rem', width: '100%' }}>
              {selectedInstanceForQr.status !== 'CONNECTED' && (
                <p style={{ fontSize: '0.8rem', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', margin: '0 0 1rem 0', fontWeight: 600 }}>
                  <Loader2 size={14} className="animate-spin" /> Waiting for WhatsApp phone scan...
                </p>
              )}
            </div>

            <button 
              onClick={() => setSelectedInstanceForQr(null)} 
              className="btn-secondary" 
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', fontWeight: 600 }}
            >
              {selectedInstanceForQr.status === 'CONNECTED' ? 'Close &amp; Continue' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
