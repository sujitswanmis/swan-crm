import React, { useState, useEffect, useRef } from 'react';
import { getInstances, getInstanceAuths, getChats, getMessages, sendLiveMessage } from '@/app/actions/whatsappUnofficialDb';
import { createClient } from '@/utils/supabase/client';
import { Search, Send, Paperclip, Loader2, Check, CheckCheck, Clock, MessageSquare } from 'lucide-react';
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

    const { success, data, error, status, message } = await sendLiveMessage(selectedInstance.id, selectedChat.id, textToSend);
    
    if (success && data) {
      // Optimistically add to list (might be duplicated by realtime, but UI handles it or we let realtime do it)
      // Actually, relying on realtime is safer to prevent duplicates.
    } else {
      alert(error || message || "Failed to send message.");
    }
    
    setSending(false);
  };

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* Top Bar for Instance Selection */}
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', background: '#fff', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h3 style={{ margin: 0 }}>Live Chat</h3>
        <select 
          className="input-field" 
          style={{ width: 'auto', padding: '0.5rem' }}
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
          <div style={{ padding: '0.4rem 0.8rem', background: '#fef2f2', color: '#ef4444', borderRadius: '4px', fontSize: '0.875rem' }}>
            Offline - {selectedInstance.status}
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* Left Panel: Chat List */}
        <div style={{ width: '320px', borderRight: '1px solid var(--border-light)', background: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)' }}>
            <div className="search-box" style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '0.5rem' }}>
              <Search size={16} color="var(--text-secondary)" />
              <input type="text" placeholder="Search chats..." style={{ border: 'none', outline: 'none', background: 'transparent', marginLeft: '0.5rem', width: '100%' }} />
            </div>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {chats.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No chats found</div>
            ) : (
              chats.map(chat => (
                <div 
                  key={chat.id}
                  onClick={() => handleChatSelect(chat)}
                  style={{ 
                    padding: '1rem', 
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
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{chat.contact_name || chat.contact_number}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatTime(chat.last_message_at)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
                      {chat.last_message}
                    </span>
                    {chat.unread_count > 0 && (
                      <span style={{ background: '#3b82f6', color: '#fff', fontSize: '0.75rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 600 }}>
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
    </div>
  );
}
