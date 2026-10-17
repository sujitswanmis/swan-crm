import React, { useState, useEffect, useRef } from 'react';
import { getInstances, getInstanceAuths, getChats, getMessages, sendLiveMessage, startNewChat } from '@/app/actions/whatsappUnofficialDb';
import { createClient } from '@/utils/supabase/client';
import { Search, Send, Paperclip, Loader2, Check, CheckCheck, Clock, MessageSquare, Plus, X, Phone, User, Sparkles, RefreshCw } from 'lucide-react';
import { PremiumProgressLoader } from '../PremiumProgressLoader';

export default function LiveChat({ userId, isAdmin }) {
  const [instances, setInstances] = useState([]);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [userPermission, setUserPermission] = useState(null);
  
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  // New Chat Modal & Search State
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatNumber, setNewChatNumber] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [newChatFirstMsg, setNewChatFirstMsg] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const messagesEndRef = useRef(null);
  const supabase = createClient();

  useEffect(() => {
    loadInstances();
  }, []);

  const loadInstances = async () => {
    setLoading(true);
    const { success, data } = await getInstances();
    if (success && data) {
      if (isAdmin) {
        setInstances(data);
        if (data.length > 0) handleInstanceSelect(data[0]);
      } else {
        // Find instances assigned to this user
        const assigned = [];
        for (const inst of data) {
          const authRes = await getInstanceAuths(inst.id);
          if (authRes.success) {
            const myAuth = authRes.data.find(a => a.user_id === userId);
            if (myAuth) {
              assigned.push({ ...inst, permission: myAuth });
            }
          }
        }
        setInstances(assigned);
        if (assigned.length > 0) handleInstanceSelect(assigned[0]);
      }
    }
    setLoading(false);
  };

  const handleInstanceSelect = (inst) => {
    setSelectedInstance(inst);
    setUserPermission(inst.permission || { can_reply: isAdmin, can_send_media: isAdmin });
    loadChats(inst.id);
    setSelectedChat(null);
    setMessages([]);
  };

  const loadChats = async (instanceId) => {
    const { success, data } = await getChats(instanceId);
    if (success) {
      setChats(data || []);
    }
  };

  const handleChatSelect = async (chat) => {
    setSelectedChat(chat);
    const { success, data } = await getMessages(chat.id);
    if (success) {
      setMessages(data || []);
      scrollToBottom();
    }
    
    // Clear unread count locally for UI (should be cleared in DB ideally)
    setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unread_count: 0 } : c));
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Setup Realtime Subscriptions
  useEffect(() => {
    if (!selectedInstance) return;

    const channel = supabase.channel(`wa_live_${selectedInstance.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_chats', filter: `instance_id=eq.${selectedInstance.id}` }, (payload) => {
        loadChats(selectedInstance.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_messages', filter: `instance_id=eq.${selectedInstance.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          if (selectedChat && payload.new.chat_id === selectedChat.id) {
            setMessages(prev => [...prev, payload.new]);
            scrollToBottom();
          }
        } else if (payload.eventType === 'UPDATE') {
          if (selectedChat && payload.new.chat_id === selectedChat.id) {
            setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedInstance, selectedChat]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!newMessage.trim() || !selectedChat || !selectedInstance) return;

    if (!userPermission?.can_reply) {
      alert("You have view-only access.");
      return;
    }

    if (selectedInstance.status !== 'CONNECTED') {
      alert("WhatsApp account is logged out. Please scan QR again in Instance Management.");
      return;
    }

    const textToSend = newMessage;
    setNewMessage('');
    setSending(true);

    try {
      const res = await sendLiveMessage(selectedInstance.id, selectedChat.id, textToSend);
      if (res?.success && res.data) {
        // Optimistically add to message list if not already present
        setMessages(prev => {
          if (prev.some(m => m.id === res.data.id)) return prev;
          return [...prev, res.data];
        });
        scrollToBottom();
      } else {
        setNewMessage(textToSend); // Restore text so user does not lose their draft
        alert(res?.error || res?.message || "Failed to send message.");
      }
    } catch (err) {
      setNewMessage(textToSend);
      alert(err.message || "Network error while sending message.");
    } finally {
      setSending(false);
    }
  };

  const cleanNewChatNum = String(newChatNumber || '').replace(/[^0-9]/g, '');
  const isTenDigit = cleanNewChatNum.length === 10 && /^[6-9]/.test(cleanNewChatNum);
  const formattedPreview = isTenDigit ? `91${cleanNewChatNum}` : cleanNewChatNum;

  const handleCreateChat = async (e) => {
    if (e) e.preventDefault();
    if (!selectedInstance) {
      alert("Please select a WhatsApp instance first.");
      return;
    }

    if (!cleanNewChatNum || cleanNewChatNum.length < 10) {
      alert("Please enter a valid mobile number (at least 10 digits).");
      return;
    }

    setCreatingChat(true);
    try {
      const res = await startNewChat({
        instanceId: selectedInstance.id,
        contactNumber: formattedPreview,
        contactName: newChatName.trim() || undefined,
        initialMessage: newChatFirstMsg.trim() || undefined
      });

      if (res?.success && res.chat) {
        setIsNewChatModalOpen(false);
        setNewChatNumber('');
        setNewChatName('');
        setNewChatFirstMsg('');
        await loadChats(selectedInstance.id);
        handleChatSelect(res.chat);
        if (res.warning) {
          alert(res.warning);
        }
      } else {
        alert(res?.error || "Failed to initiate chat.");
      }
    } catch (err) {
      alert(err.message || "Error creating chat.");
    } finally {
      setCreatingChat(false);
    }
  };

  const filteredChats = chats.filter(chat => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (chat.contact_name && chat.contact_name.toLowerCase().includes(q)) ||
      (chat.contact_number && chat.contact_number.includes(q)) ||
      (chat.last_message && chat.last_message.toLowerCase().includes(q))
    );
  });

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessageStatus = (status) => {
    switch (status) {
      case 'PENDING': return <Clock size={12} color="#9ca3af" />;
      case 'SENT': return <Check size={12} color="#9ca3af" />;
      case 'DELIVERED': return <CheckCheck size={12} color="#9ca3af" />;
      case 'READ': return <CheckCheck size={12} color="#3b82f6" />;
      case 'FAILED': return <span style={{ color: '#ef4444', fontSize: '10px' }}>Failed</span>;
      default: return null;
    }
  };

  if (loading) return <PremiumProgressLoader message="Loading Chat Interface" active={loading} />;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      
      {/* Top Bar for Instance Selection */}
      <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border-light)', background: '#fff', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Live WhatsApp Chat</h3>
        <select 
          className="input-field" 
          style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
          value={selectedInstance?.id || ''}
          onChange={(e) => {
            const inst = instances.find(i => i.id === e.target.value);
            if (inst) handleInstanceSelect(inst);
          }}
        >
          {instances.length === 0 && <option value="">No instances assigned</option>}
          {instances.map(inst => (
            <option key={inst.id} value={inst.id}>{inst.instance_name} ({inst.status})</option>
          ))}
        </select>
        
        {selectedInstance && selectedInstance.status !== 'CONNECTED' && (
          <div style={{ padding: '0.35rem 0.75rem', background: '#fef2f2', color: '#ef4444', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
            Offline - {selectedInstance.status}
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* Left Panel: Chat List */}
        <div style={{ width: '330px', borderRight: '1px solid var(--border-light)', background: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border-light)', background: '#fff', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Chats</span>
                <span style={{ fontSize: '0.75rem', background: '#e2e8f0', color: '#475569', padding: '2px 7px', borderRadius: '10px', fontWeight: 600 }}>{filteredChats.length}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <button 
                  type="button"
                  onClick={() => selectedInstance && loadChats(selectedInstance.id)}
                  title="Refresh Chats"
                  style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.35rem 0.45rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <RefreshCw size={14} color="#64748b" />
                </button>
                <button 
                  type="button"
                  onClick={() => setIsNewChatModalOpen(true)}
                  disabled={!selectedInstance}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.3rem', 
                    background: '#00a884', 
                    color: '#fff', 
                    border: 'none', 
                    borderRadius: '6px', 
                    padding: '0.35rem 0.7rem', 
                    fontSize: '0.8rem', 
                    fontWeight: 600, 
                    cursor: selectedInstance ? 'pointer' : 'not-allowed',
                    opacity: selectedInstance ? 1 : 0.6
                  }}
                >
                  <Plus size={15} /> New Chat
                </button>
              </div>
            </div>

            <div className="search-box" style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '0.45rem 0.65rem' }}>
              <Search size={15} color="var(--text-secondary)" />
              <input 
                type="text" 
                placeholder="Search chats by name or number..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', background: 'transparent', marginLeft: '0.5rem', width: '100%', fontSize: '0.82rem' }} 
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <X size={14} color="var(--text-secondary)" />
                </button>
              )}
            </div>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredChats.length === 0 ? (
              <div style={{ padding: '2.5rem 1.25rem', textAlign: 'center', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageSquare size={22} color="#94a3b8" />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>No conversations found</div>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Start a direct WhatsApp chat with any customer or lead.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewChatModalOpen(true)}
                  disabled={!selectedInstance}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    background: '#00a884',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.45rem 0.9rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={15} /> Start First Chat
                </button>
              </div>
            ) : (
              filteredChats.map(chat => (
                <div 
                  key={chat.id}
                  onClick={() => handleChatSelect(chat)}
                  style={{ 
                    padding: '0.85rem 1rem', 
                    borderBottom: '1px solid var(--border-light)', 
                    cursor: 'pointer',
                    background: selectedChat?.id === chat.id ? '#e0f2fe' : 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem'
                  }}
                  onMouseOver={(e) => { if (selectedChat?.id !== chat.id) e.currentTarget.style.background = '#f3f4f6' }}
                  onMouseOut={(e) => { if (selectedChat?.id !== chat.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{chat.contact_name || chat.contact_number}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{formatTime(chat.last_message_at)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '230px' }}>
                      {chat.last_message || <em style={{ color: '#94a3b8' }}>No messages yet</em>}
                    </span>
                    {chat.unread_count > 0 && (
                      <span style={{ background: '#3b82f6', color: '#fff', fontSize: '0.72rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 600 }}>
                        {chat.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Messages */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#efeae2' /* standard wa web background color */ }}>
          {selectedChat ? (
            <>
              {/* Chat Header */}
              <div style={{ padding: '1rem', background: '#f0f2f5', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ccc', marginRight: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>
                  {selectedChat.contact_name ? selectedChat.contact_name[0] : '#'}
                </div>
                <div>
                  <h4 style={{ margin: 0 }}>{selectedChat.contact_name || selectedChat.contact_number}</h4>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selectedChat.contact_number}</span>
                </div>
              </div>

              {/* Messages Area */}
              <div style={{ flex: 1, padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {messages.map((msg, idx) => {
                  const isOut = msg.direction === 'OUTGOING';
                  return (
                    <div key={msg.id || idx} style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start' }}>
                      <div style={{ 
                        background: isOut ? '#d9fdd3' : '#ffffff', 
                        padding: '0.5rem 0.75rem', 
                        borderRadius: '8px', 
                        maxWidth: '65%',
                        boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                        position: 'relative'
                      }}>
                        {msg.media_url && (
                          <div style={{ marginBottom: '0.5rem' }}>
                            <img src={msg.media_url} alt="media" style={{ maxWidth: '100%', borderRadius: '8px' }} />
                          </div>
                        )}
                        <div style={{ fontSize: '0.95rem', color: '#111b21', wordBreak: 'break-word' }}>
                          {msg.message_text}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                          <span style={{ fontSize: '0.65rem', color: '#667781' }}>{formatTime(msg.created_at)}</span>
                          {isOut && renderMessageStatus(msg.status)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div style={{ padding: '1rem', background: '#f0f2f5', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button 
                  disabled={!userPermission?.can_send_media}
                  style={{ background: 'none', border: 'none', cursor: userPermission?.can_send_media ? 'pointer' : 'not-allowed', color: '#54656f', padding: '0.5rem' }}
                  title={userPermission?.can_send_media ? "Attach Media" : "No permission to send media"}
                >
                  <Paperclip size={24} />
                </button>
                <form onSubmit={handleSend} style={{ flex: 1, display: 'flex', gap: '1rem' }}>
                  <input 
                    type="text" 
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={userPermission?.can_reply ? "Type a message" : "You have view-only access"}
                    disabled={!userPermission?.can_reply || selectedInstance?.status !== 'CONNECTED'}
                    style={{ flex: 1, padding: '0.75rem 1rem', border: 'none', borderRadius: '8px', outline: 'none' }}
                  />
                  <button 
                    type="submit" 
                    disabled={!newMessage.trim() || sending || !userPermission?.can_reply || selectedInstance?.status !== 'CONNECTED'}
                    style={{ background: 'none', border: 'none', cursor: (newMessage.trim() && !sending && userPermission?.can_reply) ? 'pointer' : 'not-allowed', color: (newMessage.trim() && userPermission?.can_reply) ? '#00a884' : '#54656f', padding: '0.5rem' }}
                  >
                    {sending ? <Loader2 size={24} className="spin" /> : <Send size={24} />}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '2rem', background: '#fff', borderRadius: '50%', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                <MessageSquare size={48} color="#cbd5e1" />
              </div>
              <p>Select a chat to start messaging</p>
            </div>
          )}
        </div>
      </div>

      {/* Start New Chat Modal */}
      {isNewChatModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Start New WhatsApp Chat
                </h4>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Active Instance: <strong>{selectedInstance?.instance_name || 'Selected Account'}</strong>
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setIsNewChatModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateChat} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Recipient Phone */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                  Recipient Mobile Number *
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Phone size={16} color="#64748b" style={{ position: 'absolute', left: '0.85rem' }} />
                  <input 
                    type="text"
                    required
                    placeholder="e.g. 9876543210 or 919876543210"
                    value={newChatNumber}
                    onChange={(e) => setNewChatNumber(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem 0.65rem 2.4rem',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                  />
                </div>
                {isTenDigit && (
                  <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}>
                    <Check size={14} /> Auto-prefixed: +91 {cleanNewChatNum} ({formattedPreview})
                  </div>
                )}
              </div>

              {/* Contact Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                  Contact Name (Optional)
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <User size={16} color="#64748b" style={{ position: 'absolute', left: '0.85rem' }} />
                  <input 
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={newChatName}
                    onChange={(e) => setNewChatName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem 0.65rem 2.4rem',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Initial Message */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                  Initial Message (Optional)
                </label>
                <textarea 
                  rows={3}
                  placeholder="Type an opening message to dispatch immediately, or leave empty to just open the thread..."
                  value={newChatFirstMsg}
                  onChange={(e) => setNewChatFirstMsg(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    border: '1px solid var(--border-light)',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsNewChatModalOpen(false)}
                  style={{
                    padding: '0.6rem 1.1rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: '#f8fafc',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingChat || !cleanNewChatNum}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#00a884',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: (creatingChat || !cleanNewChatNum) ? 'not-allowed' : 'pointer',
                    opacity: (creatingChat || !cleanNewChatNum) ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  {creatingChat ? <Loader2 size={16} className="spin" /> : <Send size={15} />}
                  {newChatFirstMsg.trim() ? 'Send & Start Chat' : 'Create Chat Thread'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
