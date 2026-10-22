'use client';

import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Bot, User, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ViewChatModal({
  isOpen,
  onClose,
  user
}) {
  const [loadingChat, setLoadingChat] = useState(false);
  const [userSessions, setUserSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [chatMessages, setChatMessages] = useState([]);

  useEffect(() => {
    if (!isOpen || !user || !user.user_id) {
      setUserSessions([]);
      setSelectedSessionId('');
      setChatMessages([]);
      return;
    }

    let isMounted = true;
    setLoadingChat(true);
    setUserSessions([]);
    setSelectedSessionId('');
    setChatMessages([]);

    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/ai/history?userId=${encodeURIComponent(user.user_id)}`);
        if (res.ok) {
          const data = await res.json();
          if (!isMounted) return;
          const sessions = data.sessions || [];
          setUserSessions(sessions);
          if (sessions.length > 0) {
            const latestSession = sessions[sessions.length - 1];
            setSelectedSessionId(latestSession.id);
            setChatMessages(latestSession.messages || []);
          }
        }
      } catch (e) {
        console.error('Failed to load chat history:', e);
      } finally {
        if (isMounted) setLoadingChat(false);
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const handleSessionChange = (sessionId) => {
    setSelectedSessionId(sessionId);
    const targetSession = userSessions.find(s => String(s.id) === String(sessionId));
    if (targetSession) {
      setChatMessages(targetSession.messages || []);
    } else {
      setChatMessages([]);
    }
  };

  const formatISTDate = (isoDate) => {
    if (!isoDate) return '';
    try {
      return new Date(isoDate).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return '';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div className="card" style={{
        padding: '1.75rem',
        width: '100%',
        maxWidth: '680px',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '88vh',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '14px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-light)',
          paddingBottom: '0.85rem',
          marginBottom: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#dcfce7',
              color: '#15803d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <MessageSquare size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                User AI Chatbot History
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '0.15rem 0 0 0' }}>
                Employee: <strong>{user.emp_name || user.email}</strong> ({user.emp_id || user.emp_code || '-'})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '0.35rem',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Session Selector */}
        {!loadingChat && userSessions.length > 0 && (
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Chat Session:
            </span>
            <select
              value={selectedSessionId}
              onChange={(e) => handleSessionChange(e.target.value)}
              style={{
                flex: 1,
                minWidth: '220px',
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-primary, #f8fafc)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {userSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || `Session ${s.id}`} {s.updated_at ? `(${formatISTDate(s.updated_at)})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Chat History Messages Container */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          paddingRight: '0.5rem',
          minHeight: '340px',
          maxHeight: '52vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
          marginBottom: '1rem',
          padding: '0.5rem'
        }}>
          {loadingChat ? (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '300px', color: 'var(--text-secondary)', gap: '0.5rem' }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-color)' }} />
              <span style={{ fontSize: '0.85rem' }}>Loading chatbot logs...</span>
            </div>
          ) : chatMessages.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '300px', color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
              No chat history recorded yet for this team member.
            </div>
          ) : (
            chatMessages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div key={idx} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '85%',
                    padding: '0.75rem 1rem',
                    borderRadius: '12px',
                    fontSize: '0.85rem',
                    lineHeight: 1.45,
                    backgroundColor: isUser ? '#1e3a8a' : 'var(--th-bg, #f1f5f9)',
                    color: isUser ? '#ffffff' : 'var(--text-primary)',
                    border: isUser ? 'none' : '1px solid var(--border-light)',
                    textAlign: 'left',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                  }}>
                    <div style={{
                      fontSize: '0.7rem',
                      color: isUser ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)',
                      marginBottom: '0.35rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}>
                      {isUser ? <User size={12} /> : <Bot size={12} />}
                      <span>{isUser ? (user.emp_name || 'User') : 'Swan AI Assistant'}</span>
                    </div>
                    <div className="markdown-body" style={{ color: isUser ? '#ffffff' : 'inherit', fontSize: '0.85rem' }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          borderTop: '1px solid var(--border-light)',
          paddingTop: '0.85rem'
        }}>
          <button
            type="button"
            onClick={onClose}
            className="btn-primary"
            style={{ padding: '0.45rem 1.4rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.82rem' }}
          >
            Close View
          </button>
        </div>
      </div>
    </div>
  );
}
