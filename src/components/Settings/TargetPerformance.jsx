import React, { useState } from 'react';
import { Target, Trophy, Save, User } from 'lucide-react';

export default function TargetPerformance() {
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState([
    { id: 1, name: 'Sagar Rajput', target: 50, closed: 12 },
    { id: 2, name: 'Tanu Sharma', target: 40, closed: 35 },
    { id: 3, name: 'Monika', target: 30, closed: 30 }
  ]);

  const handleTargetChange = (id, newTarget) => {
    setTargets(targets.map(t => t.id === id ? { ...t, target: parseInt(newTarget) || 0 } : t));
  };

  const handleSave = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1000);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Target size={24} color="var(--accent-color)" />
          Targets & Performance Metrics
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Set monthly lead closure targets for your sales team.</p>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexDirection: 'column' }}>
        
        {/* Targets Setup */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <Trophy size={20} color="#eab308" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Monthly Goals (Current Month)</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {targets.map((employee) => {
              const progress = Math.min(100, Math.round((employee.closed / employee.target) * 100)) || 0;
              const isGoalMet = employee.closed >= employee.target;
              
              return (
                <div key={employee.id} style={{ padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--th-filtered-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)' }}>
                        <User size={16} />
                      </div>
                      {employee.name}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Target:
                      </div>
                      <input 
                        type="number" 
                        value={employee.target}
                        onChange={(e) => handleTargetChange(employee.id, e.target.value)}
                        style={{ width: '80px', padding: '0.5rem', border: '1px solid var(--border-light)', borderRadius: '4px', background: 'var(--bg-primary)', color: 'var(--text-primary)', textAlign: 'center' }}
                      />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                      <span>Closed: {employee.closed} / {employee.target}</span>
                      <span style={{ color: isGoalMet ? '#10b981' : 'var(--text-primary)', fontWeight: isGoalMet ? 'bold' : 'normal' }}>{progress}%</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'var(--th-filtered-bg)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${progress}%`, height: '100%', background: isGoalMet ? '#10b981' : 'var(--accent-color)', borderRadius: '4px', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button 
            onClick={handleSave}
            disabled={loading}
            style={{ 
              padding: '0.75rem 2rem', background: 'var(--accent-color)', color: 'white', 
              border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', 
              fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              boxShadow: '0 4px 10px rgba(0,0,0,0.1)', opacity: loading ? 0.7 : 1
            }}
          >
            <Save size={18} />
            {loading ? 'Saving...' : 'Save Targets'}
          </button>
        </div>

      </div>
    </div>
  );
}
