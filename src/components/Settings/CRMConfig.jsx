import React, { useState, useEffect } from 'react';
import { Settings2, Plus, Trash2, Save, ChevronUp, ChevronDown, PlayCircle } from 'lucide-react';

export default function CRMConfig() {
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('stages');
  
  const [sources, setSources] = useState(['Website', 'Facebook', 'Google Ads', 'IndiaMART', 'TradeIndia', 'WhatsApp', 'Phone Call', 'Field Visit', 'Dealer Reference', 'Customer Reference', 'Exhibition', 'Other']);
  const [newSource, setNewSource] = useState('');
  
  const [stages, setStages] = useState([
    { name: '01 - New Stage', substages: ['New Lead', 'Assigned', 'Contact Pending'] },
    { name: '02 - Contact Stage', substages: ['Contacted', 'Wrong Number', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '03 - Qualification Stage', substages: ['Interested', 'Qualified', 'Unqualified', 'Need Identified', 'Budget Confirmed', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '04 - Follow Up Stage', substages: ['Catalog Shared', 'Follow Up Required', 'Next Follow Up Set', 'Follow Up Done', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '05 - Sales Process Stage', substages: ['Visit Require Sales Person', 'Before Visit Conference Call Pending', 'Before Visit Conference Call Done', 'Visit Confirmation Date', 'Task Assigned in TrackWick', 'Meeting Pending', 'Meeting Done', 'Negotiation Pending', 'Negotiation Done', 'Client Documentation Pending', 'Client Documentation Done', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '06 - Conversion Stage', substages: ['Token Amount Pending', 'Token Amount Deposited', 'Client Details Pending', 'Client Details Received', 'Billing 1st Quotation Pending', 'Billing 1st Quotation Sent', 'Quotation Revision Required', 'Quotation Approved by Client', 'Billing 1st Advance Payment Pending', 'Billing 1st Advance Paid', 'Payment Verification Pending', 'Payment Verified', 'Order Confirmed', 'Stock Availability Check', 'Stock Not Available', 'Production Planning Required', 'Delivery Date Confirmed', 'Final Billing 1st Pending', 'Final Billing 1st Done', 'Ready for Dispatch', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '07 - Final Stage', substages: ['Converted - Out for Delivery', 'Converted - Order Received', 'Converted - Final Feedback From Client', 'Won', 'Lost After Quotation', 'Lost Due to Price Issue', 'Lost Due to Payment Issue', 'Lost Due to Stock Issue', 'Hold - Client Side', 'Hold - Company Side', 'Duplicate Lead', 'Call not connected', 'No Response', 'ReSchedule'] }
  ]);
  const [expandedStage, setExpandedStage] = useState(null);
  
  const [clientStatuses, setClientStatuses] = useState(['None', 'Hot', 'Warm', 'Cold', 'Active', 'InActive', 'Hold', 'In-Progress']);
  const [newClientStatus, setNewClientStatus] = useState('');
  
  const [priorities, setPriorities] = useState([
    'LP00: None', 'LP01: Immediate', 'LP02: High', 'LP03: Medium', 
    'LP04: Low', 'LP05: Cold', 'LP06: Disqualified', 'LP07: Irrelevant', 
    'LP08: Invalid', 'LP09: Spam', 'LP10: Archive', 'LP11: Competitor Dealer', 'LP12: Competitor Distributor'
  ]);
  const [newPriority, setNewPriority] = useState('');

  const [assignmentRule, setAssignmentRule] = useState('round_robin');
  const [leadSyncChunkSize, setLeadSyncChunkSize] = useState('500');

  // Load from LocalStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('crm_config');
    let needsForceUpdate = false;
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.stages) {
          // Force update if the old stages are still present (Conversion stage < 20 substages)
          if (parsed.stages[5] && parsed.stages[5].substages && parsed.stages[5].substages.length < 20) {
            needsForceUpdate = true;
          } else {
            setStages(parsed.stages);
          }
        }
        if (parsed.sources) setSources(parsed.sources);
        if (parsed.clientStatuses) setClientStatuses(parsed.clientStatuses);
        if (parsed.priorities) setPriorities(parsed.priorities);
        if (parsed.assignmentRule) setAssignmentRule(parsed.assignmentRule);
        if (parsed.leadSyncChunkSize) setLeadSyncChunkSize(parsed.leadSyncChunkSize);
      } catch (e) { console.error(e); }
    }
    
    if (needsForceUpdate || !saved) {
      handleSave(stages);
    }
  }, []);

  const handleSave = () => {
    setLoading(true);
    const config = { sources, stages, clientStatuses, priorities, assignmentRule, leadSyncChunkSize };
    
    // Preserve existing alertSound/Duration if present
    const saved = localStorage.getItem('crm_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.alertSound) config.alertSound = parsed.alertSound;
      if (parsed.alertDuration) config.alertDuration = parsed.alertDuration;
    }
    
    localStorage.setItem('crm_config', JSON.stringify(config));
    
    // Dispatch event so other components know to update immediately
    window.dispatchEvent(new Event('crm_config_updated'));

    setTimeout(() => setLoading(false), 500);
  };

  const moveItem = (array, setArray, index, direction) => {
    if ((direction === -1 && index === 0) || (direction === 1 && index === array.length - 1)) return;
    const newArray = [...array];
    const temp = newArray[index];
    newArray[index] = newArray[index + direction];
    newArray[index + direction] = temp;
    setArray(newArray);
  };

  const DraggableItem = ({ item, index, array, setArray, onRemove, editable = false }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <button onClick={() => moveItem(array, setArray, index, -1)} disabled={index === 0} style={{ padding: 0, background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', color: index === 0 ? '#cbd5e1' : 'var(--text-secondary)' }}><ChevronUp size={18} /></button>
        <button onClick={() => moveItem(array, setArray, index, 1)} disabled={index === array.length - 1} style={{ padding: 0, background: 'none', border: 'none', cursor: index === array.length - 1 ? 'default' : 'pointer', color: index === array.length - 1 ? '#cbd5e1' : 'var(--text-secondary)' }}><ChevronDown size={18} /></button>
      </div>
      
      {editable ? (
        <input 
          type="text" 
          value={item}
          onChange={(e) => {
            const newArray = [...array];
            newArray[index] = e.target.value;
            setArray(newArray);
          }}
          style={{ flex: 1, padding: '0.5rem', border: '1px solid transparent', background: 'transparent', color: 'var(--text-primary)', outline: 'none' }}
          onFocus={(e) => e.target.style.borderBottom = '1px solid var(--accent-color)'}
          onBlur={(e) => e.target.style.borderBottom = '1px solid transparent'}
        />
      ) : (
        <span style={{ flex: 1 }}>{item}</span>
      )}

      {onRemove && (
        <button onClick={() => onRemove(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#ef4444', display: 'flex' }}>
          <Trash2 size={18} />
        </button>
      )}
    </div>
  );

  const subTabs = [
    { id: 'stages', label: 'Pipeline Stages' },
    { id: 'sources', label: 'Lead Sources' },
    { id: 'client_status', label: 'Client Statuses' },
    { id: 'priority', label: 'Priority Types' },
    { id: 'assignment', label: 'Auto-Assignment' },
    { id: 'sync', label: 'Lead Sync Settings' },
  ];

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Settings2 size={24} color="var(--accent-color)" />
            CRM & Lead Configurations
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Customize how leads flow into and move through your CRM.</p>
        </div>
        <button 
          onClick={handleSave} disabled={loading}
          style={{ padding: '0.75rem 2rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
        >
          <Save size={18} /> {loading ? 'Saving...' : 'Save & Update'}
        </button>
      </div>

      {/* Submenu Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)' }}>
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            style={{
              padding: '0.6rem 1.25rem',
              background: activeSubTab === tab.id ? 'var(--accent-color)' : 'transparent',
              color: activeSubTab === tab.id ? 'white' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '20px',
              cursor: 'pointer',
              fontWeight: activeSubTab === tab.id ? 600 : 500,
              whiteSpace: 'nowrap',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
        
        {/* TAB: PIPELINE STAGES */}
        {activeSubTab === 'stages' && (
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Pipeline Stages & Substages</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Click on any stage to edit its substages.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {stages.map((stageObj, i) => (
                <div key={`stage-${i}`} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
                  
                  {/* Main Stage Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button onClick={() => moveItem(stages, setStages, i, -1)} disabled={i === 0} style={{ padding: 0, background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#cbd5e1' : 'var(--text-secondary)' }}><ChevronUp size={18} /></button>
                      <button onClick={() => moveItem(stages, setStages, i, 1)} disabled={i === stages.length - 1} style={{ padding: 0, background: 'none', border: 'none', cursor: i === stages.length - 1 ? 'default' : 'pointer', color: i === stages.length - 1 ? '#cbd5e1' : 'var(--text-secondary)' }}><ChevronDown size={18} /></button>
                    </div>
                    
                    <input 
                      type="text" 
                      value={stageObj.name}
                      onChange={(e) => {
                        const newStages = [...stages];
                        newStages[i].name = e.target.value;
                        setStages(newStages);
                      }}
                      style={{ flex: 1, padding: '0.5rem', border: '1px solid transparent', background: 'transparent', color: 'var(--text-primary)', outline: 'none', fontWeight: 600, fontSize: '1rem' }}
                      onFocus={(e) => e.target.style.borderBottom = '1px solid var(--accent-color)'}
                      onBlur={(e) => e.target.style.borderBottom = '1px solid transparent'}
                    />

                    <button 
                      onClick={() => setExpandedStage(expandedStage === i ? null : i)}
                      style={{ padding: '0.5rem 1rem', background: expandedStage === i ? 'var(--th-filtered-bg)' : 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500 }}
                    >
                      {expandedStage === i ? 'Close' : `${stageObj.substages.length} Substages`}
                    </button>
                  </div>

                  {/* Expanded Substages */}
                  {expandedStage === i && (
                    <div style={{ padding: '1.25rem', background: '#f8fafc', borderTop: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem' }}>Substages for {stageObj.name}</div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                        {stageObj.substages.map((sub, j) => {
                          const stageNum = i + 1;
                          const subNum = String(j + 1).padStart(2, '0');
                          const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
                          const prefix = `${stageNum};${subNum}>${cleanStageName}>`;
                          
                          // If they already manually typed the prefix, clean it up for the input
                          const cleanSubName = sub.startsWith(prefix) ? sub.replace(prefix, '') : (sub.includes('>') ? sub.split('>').pop() : sub);
                          
                          return (
                            <div key={`sub-${j}`} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'white', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <button onClick={() => {
                                  if(j === 0) return;
                                  const newStages = [...stages];
                                  const temp = newStages[i].substages[j];
                                  newStages[i].substages[j] = newStages[i].substages[j-1];
                                  newStages[i].substages[j-1] = temp;
                                  setStages(newStages);
                                }} disabled={j === 0} style={{ padding: 0, background: 'none', border: 'none', cursor: j === 0 ? 'default' : 'pointer', color: j === 0 ? '#cbd5e1' : 'var(--text-secondary)' }}><ChevronUp size={14} /></button>
                                <button onClick={() => {
                                  if(j === stageObj.substages.length - 1) return;
                                  const newStages = [...stages];
                                  const temp = newStages[i].substages[j];
                                  newStages[i].substages[j] = newStages[i].substages[j+1];
                                  newStages[i].substages[j+1] = temp;
                                  setStages(newStages);
                                }} disabled={j === stageObj.substages.length - 1} style={{ padding: 0, background: 'none', border: 'none', cursor: j === stageObj.substages.length - 1 ? 'default' : 'pointer', color: j === stageObj.substages.length - 1 ? '#cbd5e1' : 'var(--text-secondary)' }}><ChevronDown size={14} /></button>
                              </div>
                              
                              <div style={{ display: 'flex', flex: 1, alignItems: 'center', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden', border: '1px solid transparent' }} onFocus={(e) => e.currentTarget.style.border = '1px solid var(--accent-color)'} onBlur={(e) => e.currentTarget.style.border = '1px solid transparent'}>
                                <span style={{ padding: '0.25rem 0.5rem', color: '#94a3b8', fontSize: '0.85rem', userSelect: 'none', borderRight: '1px solid #e2e8f0' }}>{prefix}</span>
                                <input 
                                  type="text" 
                                  value={cleanSubName}
                                  onChange={(e) => {
                                    const newStages = [...stages];
                                    newStages[i].substages[j] = e.target.value; // Store just the short name
                                    setStages(newStages);
                                  }}
                                  style={{ flex: 1, padding: '0.35rem 0.5rem', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.9rem', color: '#334155' }}
                                />
                              </div>
                              <button onClick={() => {
                                const newStages = [...stages];
                                newStages[i].substages = newStages[i].substages.filter((_, idx) => idx !== j);
                                setStages(newStages);
                              }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <input 
                          type="text" placeholder="Type short name (e.g. New Lead)" id={`new-sub-${i}`}
                          onKeyDown={(e) => {
                            if(e.key === 'Enter' && e.target.value.trim()) {
                              const newStages = [...stages];
                              newStages[i].substages.push(e.target.value.trim());
                              setStages(newStages);
                              e.target.value = '';
                            }
                          }}
                          style={{ flex: 1, padding: '0.6rem 1rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
                        />
                        <button onClick={() => {
                          const input = document.getElementById(`new-sub-${i}`);
                          if(input && input.value.trim()) {
                            const newStages = [...stages];
                            newStages[i].substages.push(input.value.trim());
                            setStages(newStages);
                            input.value = '';
                          }
                        }} style={{ padding: '0.6rem 1.25rem', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}><Plus size={16} /> Add</button>
                      </div>
                    </div>
                  )}

                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: SOURCES */}
        {activeSubTab === 'sources' && (
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1.5rem' }}>Lead Sources</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {sources.map((src, i) => (
                <DraggableItem key={`src-${i}`} item={src} index={i} array={sources} setArray={setSources} onRemove={(val) => setSources(sources.filter(s => s !== val))} editable />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input 
                type="text" placeholder="Add Source..." value={newSource} onChange={(e) => setNewSource(e.target.value)}
                onKeyDown={(e) => { if(e.key==='Enter' && newSource.trim()) { setSources([...sources, newSource.trim()]); setNewSource(''); } }}
                style={{ flex: 1, padding: '0.75rem 1rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.95rem' }}
              />
              <button onClick={() => { if(newSource.trim()) { setSources([...sources, newSource.trim()]); setNewSource(''); } }} style={{ padding: '0.75rem 1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Plus size={18} /> Add</button>
            </div>
          </div>
        )}

        {/* TAB: CLIENT STATUSES */}
        {activeSubTab === 'client_status' && (
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1.5rem' }}>Client Statuses</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {clientStatuses.map((src, i) => (
                <DraggableItem key={`cstatus-${i}`} item={src} index={i} array={clientStatuses} setArray={setClientStatuses} onRemove={(val) => setClientStatuses(clientStatuses.filter(s => s !== val))} editable />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input 
                type="text" placeholder="Add Status..." value={newClientStatus} onChange={(e) => setNewClientStatus(e.target.value)}
                onKeyDown={(e) => { if(e.key==='Enter' && newClientStatus.trim()) { setClientStatuses([...clientStatuses, newClientStatus.trim()]); setNewClientStatus(''); } }}
                style={{ flex: 1, padding: '0.75rem 1rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.95rem' }}
              />
              <button onClick={() => { if(newClientStatus.trim()) { setClientStatuses([...clientStatuses, newClientStatus.trim()]); setNewClientStatus(''); } }} style={{ padding: '0.75rem 1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Plus size={18} /> Add</button>
            </div>
          </div>
        )}

        {/* TAB: PRIORITIES */}
        {activeSubTab === 'priority' && (
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1.5rem' }}>Lead Priority Types</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {priorities.map((src, i) => (
                <DraggableItem key={`prio-${i}`} item={src} index={i} array={priorities} setArray={setPriorities} onRemove={(val) => setPriorities(priorities.filter(s => s !== val))} editable />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input 
                type="text" placeholder="Add Priority..." value={newPriority} onChange={(e) => setNewPriority(e.target.value)}
                onKeyDown={(e) => { if(e.key==='Enter' && newPriority.trim()) { setPriorities([...priorities, newPriority.trim()]); setNewPriority(''); } }}
                style={{ flex: 1, padding: '0.75rem 1rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.95rem' }}
              />
              <button onClick={() => { if(newPriority.trim()) { setPriorities([...priorities, newPriority.trim()]); setNewPriority(''); } }} style={{ padding: '0.75rem 1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Plus size={18} /> Add</button>
            </div>
          </div>
        )}



        {/* TAB: ASSIGNMENT */}
        {activeSubTab === 'assignment' && (
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>Lead Auto-Assignment Rule</h3>
            <select 
              value={assignmentRule}
              onChange={(e) => setAssignmentRule(e.target.value)}
              style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.95rem' }}
            >
              <option value="none">None / Unassigned (Keep new leads in open unassigned pool)</option>
              <option value="round_robin">Round Robin (Equal distribution to all active sales team)</option>
              <option value="equal_distribution">Equal Distribution (Divide batch equally among active agents)</option>
              <option value="workload_based">Workload Based (Assign to employee with lowest active leads)</option>
              <option value="territory_based">Territory Based (Auto-route based on State/District/PIN)</option>
              <option value="designation_based">Designation Based (Route by deal size & employee level)</option>
              <option value="manual">Manual (Admin assigns every new lead)</option>
              <option value="weighted">Weighted (Based on individual target goals)</option>
            </select>
          </div>
        )}

        {/* TAB: SYNC SETTINGS */}
        {activeSubTab === 'sync' && (
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>Lead Synchronization Chunk Size</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Choose how many leads are fetched in each step when refreshing/syncing. Larger chunks mean fewer requests but might slow down the initial render.
            </p>
            <select 
              value={leadSyncChunkSize}
              onChange={(e) => setLeadSyncChunkSize(e.target.value)}
              style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }}
            >
              <option value="500">500 Leads per chunk (Default)</option>
              <option value="1000">1000 Leads per chunk</option>
              <option value="2000">2000 Leads per chunk</option>
              <option value="all">Load All at Once (One single request)</option>
            </select>
          </div>
        )}

      </div>
    </div>
  );
}
