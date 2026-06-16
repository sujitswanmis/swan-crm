'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { registerEmployeeDetails } from '@/app/actions/team';
import { 
  Send, Sparkles, MessageSquare, Shield, Lock, 
  User, Mail, Phone, ArrowRight, Eye, EyeOff, Loader2 
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const supabase = createClient();

export default function PublicChatPage() {
  const [messages, setMessages] = useState([
    { 
      role: 'assistant', 
      content: "### Welcome to New Swan! \n\nI am your virtual assistant. Ask me anything about our products, services, policies, or general inquiries. \n\nHow can I help you today?" 
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [profileName, setProfileName] = useState('');
  const [profileRole, setProfileRole] = useState('');

  // Paywall & Auth states
  const [messageCount, setMessageCount] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [authMode, setAuthMode] = useState('signup'); // signup, login
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authMobile, setAuthMobile] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccessMsg, setAuthSuccessMsg] = useState('');
  const [chatId, setChatId] = useState('');
  const [allSessions, setAllSessions] = useState([]);

  const chatMessagesRef = useRef(null);

  // Save Chat History Helper
  const saveChatHistoryToDb = async (currUserId, currChatId, currentMsgs) => {
    try {
      const historyRes = await fetch(`/api/ai/history?userId=${currUserId}`);
      let dbSessions = [];
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        dbSessions = historyData.sessions || [];
      }

      const sanitizedMsgs = currentMsgs.map(m => ({
        role: m.role === 'ai' ? 'assistant' : m.role,
        content: m.content
      }));

      const newSessionObj = {
        id: currChatId,
        title: sanitizedMsgs.length > 1 ? (sanitizedMsgs[1].content.substring(0, 30) + (sanitizedMsgs[1].content.length > 30 ? '...' : '')) : 'Public Chat',
        messages: sanitizedMsgs,
        updated_at: new Date().toISOString()
      };

      const existingIndex = dbSessions.findIndex(s => s.id === currChatId);
      if (existingIndex > -1) {
        dbSessions[existingIndex] = newSessionObj;
      } else {
        dbSessions.push(newSessionObj);
      }

      await fetch('/api/ai/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currUserId, sessions: dbSessions })
      });

      setAllSessions(dbSessions);
    } catch (e) {
      console.error('Failed to save chat history to database:', e);
    }
  };

  const handleStartNewChat = () => {
    const newChatId = 'CHAT-' + Math.random().toString(36).substring(2, 11).toUpperCase();
    setChatId(newChatId);
    
    const defaultMessages = [
      { 
        role: 'assistant', 
        content: "### Welcome to New Swan! \n\nI am your virtual assistant. Ask me anything about our products, services, policies, or general inquiries. \n\nHow can I help you today?" 
      }
    ];
    setMessages(defaultMessages);

    if (!user) {
      localStorage.setItem('swan_public_chat_id', newChatId);
      localStorage.setItem('swan_public_messages', JSON.stringify(defaultMessages));
    }
  };

  const handleDeleteSession = async (e, sessionIdToDelete) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this chat session?")) return;

    try {
      if (user) {
        const updated = allSessions.filter(s => s.id !== sessionIdToDelete);
        await fetch('/api/ai/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, sessions: updated })
        });
        setAllSessions(updated);
        
        if (chatId === sessionIdToDelete) {
          if (updated.length > 0) {
            const nextSession = updated[updated.length - 1];
            setChatId(nextSession.id);
            setMessages(nextSession.messages || []);
          } else {
            handleStartNewChat();
          }
        }
      } else {
        localStorage.removeItem('swan_public_messages');
        localStorage.removeItem('swan_public_chat_id');
        handleStartNewChat();
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  // Load session & LocalStorage message count
  useEffect(() => {
    const initPage = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoadingSession(false);

      if (user) {
        try {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('emp_name, role')
            .eq('user_id', user.id)
            .single();
          if (roleData) {
            setProfileName(roleData.emp_name || '');
            setProfileRole(roleData.role || '');
          } else {
            setProfileName(user.email.split('@')[0]);
            setProfileRole('customer');
          }

          // Fetch chat history for logged in customer user
          const historyRes = await fetch(`/api/ai/history?userId=${user.id}`);
          if (historyRes.ok) {
            const historyData = await historyRes.json();
            const sessionsList = historyData.sessions || [];
            setAllSessions(sessionsList);
            if (sessionsList.length > 0) {
              const activeSession = sessionsList[sessionsList.length - 1];
              setChatId(activeSession.id);
              if (activeSession.messages && activeSession.messages.length > 0) {
                const mappedMsgs = activeSession.messages.map(m => ({
                  ...m,
                  role: m.role === 'ai' ? 'assistant' : m.role
                }));
                setMessages(mappedMsgs);
              }
              // Clear guest local storage
              localStorage.removeItem('swan_public_messages');
              localStorage.removeItem('swan_public_chat_id');
            } else {
              // No DB history yet! Let's migrate guest local storage to DB
              let currentChatId = localStorage.getItem('swan_public_chat_id');
              if (!currentChatId) {
                currentChatId = 'CHAT-' + Math.random().toString(36).substring(2, 11).toUpperCase();
              }
              setChatId(currentChatId);
              
              const guestMsgs = localStorage.getItem('swan_public_messages');
              let msgsToSave = messages;
              if (guestMsgs) {
                try {
                  const parsed = JSON.parse(guestMsgs);
                  if (parsed && parsed.length > 0) {
                    msgsToSave = parsed.map(m => ({
                      ...m,
                      role: m.role === 'ai' ? 'assistant' : m.role
                    }));
                    setMessages(msgsToSave);
                  }
                } catch(err){}
              }
              
              // Save to database
              await saveChatHistoryToDb(user.id, currentChatId, msgsToSave);
              
              // Clear guest local storage
              localStorage.removeItem('swan_public_messages');
              localStorage.removeItem('swan_public_chat_id');
            }
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        // Load or generate guest Chat ID
        let currentChatId = localStorage.getItem('swan_public_chat_id');
        if (!currentChatId) {
          currentChatId = 'CHAT-' + Math.random().toString(36).substring(2, 11).toUpperCase();
          localStorage.setItem('swan_public_chat_id', currentChatId);
        }
        setChatId(currentChatId);

        // Load guest chat messages
        const guestMsgs = localStorage.getItem('swan_public_messages');
        if (guestMsgs) {
          try {
            const parsed = JSON.parse(guestMsgs);
            if (parsed && parsed.length > 0) {
              setMessages(parsed);
            }
          } catch(err){}
        }
      }

      // Load anonymous message count
      const storedCount = localStorage.getItem('swan_public_msg_count');
      if (storedCount) {
        const parsed = parseInt(storedCount, 10);
        setMessageCount(parsed);
        if (parsed >= 5 && !user) {
          setShowPaywall(true);
        }
      }
    };
    initPage();
    window.scrollTo(0, 0);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTo({
        top: chatMessagesRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  // Save guest messages to local storage
  useEffect(() => {
    if (!loadingSession && !user && messages.length > 1) {
      localStorage.setItem('swan_public_messages', JSON.stringify(messages));
    }
  }, [messages, user, loadingSession]);

  const handleSendMessage = async (textToSend = null) => {
    const query = (textToSend || input || '').trim();
    if (!query) return;

    // Check message limit for anonymous users
    if (!user && messageCount >= 5) {
      setShowPaywall(true);
      return;
    }

    if (!textToSend) setInput('');
    const newMessages = [...messages, { role: 'user', content: query }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch('/api/public/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      });

      if (!res.ok) {
        throw new Error("Failed to get response");
      }

      const data = await res.json();
      const newMessagesList = [...newMessages, { role: 'assistant', content: data.content }];
      setMessages(newMessagesList);

      if (user) {
        // Save to DB
        await saveChatHistoryToDb(user.id, chatId, newMessagesList);
      }

      // Increment count for anonymous user
      if (!user) {
        const nextCount = messageCount + 1;
        setMessageCount(nextCount);
        localStorage.setItem('swan_public_msg_count', nextCount.toString());
        if (nextCount >= 5) {
          setShowPaywall(true);
        }
      }
    } catch (e) {
      setMessages([...newMessages, { role: 'assistant', content: "⚠️ Sorry, I encountered an issue processing your request. Please try again." }]);
    }
    setLoading(false);
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    setAuthSuccessMsg('');

    try {
      if (authMode === 'signup') {
        if (!authName || !authMobile || !authEmail || !authPassword) {
          throw new Error("All fields are required.");
        }

        const result = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (result.data?.user?.identities?.length === 0) {
          throw new Error("User already exists. Please sign in instead.");
        }

        if (result.error) throw result.error;

        if (result.data?.user) {
          // Register user details on server as role: customer
          const details = {
            role: 'customer',
            emp_name: authName,
            emp_mobile: authMobile,
          };
          const reg = await registerEmployeeDetails(result.data.user.id, authEmail, details);
          if (!reg.success) {
            console.error("Failed registration save:", reg.error);
          }
        }

        if (result.data?.session) {
          // Log Session if auto-logged in
          try {
            const { logUserSession } = await import('@/app/actions/audit');
            await logUserSession(navigator.userAgent);
          } catch (err) {}
          window.location.href = '/chat';
        } else {
          setAuthSuccessMsg("Account created successfully! Please click the 'Log In' tab above to sign in directly.");
          setAuthMode('login');
        }
      } else {
        // Login Mode
        if (!authEmail || !authPassword) {
          throw new Error("Please fill in email and password.");
        }

        const result = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword
        });

        if (result.error) throw result.error;

        // Log session
        try {
          const { logUserSession } = await import('@/app/actions/audit');
          await logUserSession(navigator.userAgent);
        } catch (err) {}

        window.location.href = '/chat';
      }
    } catch (err) {
      setAuthError(err.message || "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const suggestedPrompts = [
    "What agricultural products does Swan Agro offer?",
    "Tell me about Rotary Tillers (Rotavators)",
    "What is Swan Agro's head office address?",
    "How can I contact the Sales & Marketing team?",
    "Do you manufacture Potato Planters & Harvesters?",
    "How can I apply for a dealership or distributor?",
    "What company quality certifications do you have?"
  ];

  return (
    <div className="chat-container">
      {/* Dynamic styles to ensure wow aesthetics */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        
        html, body {
          height: 100vh !important;
          max-height: 100vh !important;
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        
        .chat-container {
          font-family: 'Outfit', sans-serif;
          height: 100vh;
          max-height: 100vh;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          color: #0f172a;
          display: flex;
          overflow: hidden;
          position: relative;
        }

        /* Ambient Glow Blobs */
        .glow-blob-1 {
          position: absolute;
          top: -10%;
          left: -10%;
          width: 45%;
          height: 45%;
          background: radial-gradient(circle, rgba(245, 158, 11, 0.06) 0%, rgba(0, 0, 0, 0) 70%);
          z-index: 1;
          pointer-events: none;
        }
        .glow-blob-2 {
          position: absolute;
          bottom: -10%;
          right: -10%;
          width: 50%;
          height: 50%;
          background: radial-gradient(circle, rgba(30, 58, 138, 0.05) 0%, rgba(0, 0, 0, 0) 70%);
          z-index: 1;
          pointer-events: none;
        }

        /* Sidebar styling */
        .chat-sidebar {
          width: 300px;
          background: #ffffff;
          backdrop-filter: blur(16px);
          border-right: 1px solid #e2e8f0;
          padding: 2rem 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 2rem;
          z-index: 10;
          height: 100%;
          overflow-y: auto;
        }

        @media (max-width: 768px) {
          .chat-sidebar {
            display: none;
          }
        }

        /* Main Chat Workspace */
        .chat-workspace {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100vh;
          position: relative;
          z-index: 10;
        }

        /* Top Header */
        .chat-header {
          padding: 1.25rem 2rem;
          background: #ffffff;
          backdrop-filter: blur(12px);
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #0f172a;
        }

        /* Messages Area */
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .chat-messages::-webkit-scrollbar {
          width: 6px;
        }
        .chat-messages::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.2);
          border-radius: 4px;
        }

        /* Message Bubble Container */
        .message-row {
          display: flex;
          width: 100%;
          animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .message-row.user {
          justify-content: flex-end;
        }

        .message-row.assistant {
          justify-content: flex-start;
        }

        .message-bubble {
          max-width: 70%;
          padding: 1.2rem;
          border-radius: 18px;
          line-height: 1.6;
          font-size: 0.95rem;
        }

        .message-row.user .message-bubble {
          background: linear-gradient(135deg, #1e3a8a 0%, #0d1b2a 100%);
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(30, 58, 138, 0.12);
          border-bottom-right-radius: 4px;
        }

        .message-row.assistant .message-bubble {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          color: #1e293b;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
          border-bottom-left-radius: 4px;
        }

        /* Markdown tables and styling in public chat */
        .message-bubble table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0;
          font-size: 0.85rem;
        }
        .message-bubble th, .message-bubble td {
          border: 1px solid #e2e8f0;
          padding: 0.5rem 0.75rem;
          text-align: left;
        }
        .message-bubble th {
          background: rgba(245, 158, 11, 0.05);
          color: #d97706;
          font-weight: 600;
        }
        
        /* User Bubble Text override */
        .message-row.user .message-bubble p, 
        .message-row.user .message-bubble li, 
        .message-row.user .message-bubble td, 
        .message-row.user .message-bubble span {
          color: #ffffff !important;
        }
        .message-row.user .message-bubble h1, 
        .message-row.user .message-bubble h2, 
        .message-row.user .message-bubble h3, 
        .message-row.user .message-bubble h4, 
        .message-row.user .message-bubble strong {
          color: #fef08a !important;
          font-weight: 700;
        }

        /* Assistant Bubble Text override */
        .message-row.assistant .message-bubble p, 
        .message-row.assistant .message-bubble li, 
        .message-row.assistant .message-bubble td, 
        .message-row.assistant .message-bubble span {
          color: #1e293b !important;
        }
        .message-row.assistant .message-bubble h1, 
        .message-row.assistant .message-bubble h2, 
        .message-row.assistant .message-bubble h3, 
        .message-row.assistant .message-bubble h4, 
        .message-row.assistant .message-bubble strong {
          color: #b45309 !important;
          font-weight: 700;
        }
        
        .message-bubble ul, .message-bubble ol {
          padding-left: 1.25rem;
          margin-bottom: 0.5rem;
        }

        /* Chat Input area */
        .chat-input-area {
          padding: 1.5rem 2rem;
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
        }

        .chat-input-wrapper {
          display: flex;
          gap: 0.75rem;
          max-width: 900px;
          margin: 0 auto;
          position: relative;
        }

        .chat-input {
          flex: 1;
          background: #f8fafc !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 14px !important;
          padding: 1rem 1.5rem !important;
          color: #0f172a !important;
          font-size: 0.95rem;
          outline: none;
          transition: all 0.3s ease;
        }

        .chat-input:focus {
          border-color: #d97706 !important;
          box-shadow: 0 0 10px rgba(217, 119, 6, 0.15) !important;
        }

        .chat-send-btn {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #ffffff;
          border: none;
          border-radius: 14px;
          width: 52px;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
          transition: all 0.25s ease;
        }

        .chat-send-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(245, 158, 11, 0.3);
        }

        .chat-send-btn:active {
          transform: translateY(1px);
        }

        /* Paywall Modal */
        .paywall-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 2rem;
          animation: fadeIn 0.3s ease;
        }

        .paywall-modal {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 24px;
          width: 100%;
          max-width: 480px;
          padding: 2.5rem;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          position: relative;
          overflow: hidden;
          color: #0f172a;
        }

        .paywall-modal::before {
          content: '';
          position: absolute;
          top: -20%;
          left: -20%;
          width: 50%;
          height: 50%;
          background: radial-gradient(circle, rgba(245, 158, 11, 0.1) 0%, rgba(0, 0, 0, 0) 70%);
          pointer-events: none;
        }

        .paywall-tab-btn {
          flex: 1;
          background: none;
          border: none;
          padding: 0.75rem;
          color: #64748b;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }

        .paywall-tab-btn.active {
          color: #d97706;
          border-bottom-color: #d97706;
        }

        /* Form Inputs */
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          margin-bottom: 1.25rem;
        }

        .form-input-container {
          position: relative;
        }

        .form-input-icon {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
        }

        .form-input {
          width: 100%;
          background: #ffffff !important;
          border: 1px solid #cbd5e1 !important;
          padding: 0.75rem 1rem 0.75rem 2.75rem !important;
          border-radius: 10px !important;
          font-size: 0.9rem;
          color: #0f172a !important;
        }

        .form-input:focus {
          border-color: #d97706 !important;
          box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.15) !important;
        }

        .paywall-submit-btn {
          width: 100%;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #ffffff;
          padding: 0.85rem;
          border-radius: 10px;
          border: none;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          box-shadow: 0 4px 15px rgba(217, 119, 6, 0.2);
        }

        .paywall-submit-btn:hover {
          transform: translateY(-1px);
        }

        .prompt-chip {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 0.75rem 1rem;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #475569;
        }

        .prompt-chip:hover {
          background: #f8fafc;
          border-color: rgba(245, 158, 11, 0.5);
          transform: translateY(-1px);
          color: #b45309;
        }

        /* Animations */
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        @keyframes slideUp {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .session-history-list::-webkit-scrollbar {
          width: 4px;
        }
        .session-history-list::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.15);
          border-radius: 4px;
        }
        .session-item:hover {
          background-color: rgba(30, 58, 138, 0.04) !important;
          border-color: rgba(30, 58, 138, 0.08) !important;
        }
      `}</style>

      {/* Glow Blobs */}
      <div className="glow-blob-1"></div>
      <div className="glow-blob-2"></div>

      {/* Sidebar - Customer info & quick prompts */}
      <div className="chat-sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ background: 'rgba(37, 99, 235, 0.1)', padding: '0.5rem', borderRadius: '10px', color: '#3b82f6' }}>
            <Sparkles size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Swan Agro Assistant</h2>
            <div style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.1rem' }}>
              <span style={{ width: '6px', height: '6px', background: '#10b981', borderRadius: '50%' }}></span>
              Online & Ready
            </div>
          </div>
        </div>

        {/* New Chat Button in Sidebar */}
        <div style={{ marginTop: '0.5rem' }}>
          <button 
            onClick={handleStartNewChat}
            style={{ 
              width: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: '0.5rem', 
              padding: '0.75rem 1rem', 
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', 
              border: 'none', 
              borderRadius: '10px', 
              cursor: 'pointer', 
              fontWeight: 600, 
              color: '#ffffff',
              fontSize: '0.9rem',
              boxShadow: '0 4px 10px rgba(217, 119, 6, 0.15)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 6px 15px rgba(217, 119, 6, 0.25)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'none';
              e.target.style.boxShadow = '0 4px 10px rgba(217, 119, 6, 0.15)';
            }}
          >
            + New Chat
          </button>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em', marginBottom: '0.75rem', fontWeight: 700 }}>Quick Inquiries</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {suggestedPrompts.map((p, idx) => (
              <div key={idx} className="prompt-chip" onClick={() => handleSendMessage(p)}>
                <span>{p}</span>
                <ArrowRight size={14} style={{ opacity: 0.6 }} />
              </div>
            ))}
          </div>
        </div>

        {user && allSessions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', flex: 1, overflow: 'hidden' }}>
            <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em', margin: 0, fontWeight: 700 }}>Chat History</h3>
            <div className="session-history-list" style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '0.5rem', 
              overflowY: 'auto', 
              paddingRight: '4px' 
            }}>
              {allSessions.map((s) => (
                <div 
                  key={s.id} 
                  onClick={() => {
                    setChatId(s.id);
                    setMessages(s.messages || []);
                  }}
                  style={{ 
                    padding: '0.6rem 0.75rem', 
                    borderRadius: '8px', 
                    fontSize: '0.8rem', 
                    cursor: 'pointer', 
                    backgroundColor: chatId === s.id ? 'rgba(30, 58, 138, 0.08)' : 'transparent',
                    border: chatId === s.id ? '1px solid rgba(30, 58, 138, 0.15)' : '1px solid transparent',
                    color: chatId === s.id ? '#1e3a8a' : '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                  className="session-item"
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px', fontWeight: chatId === s.id ? 600 : 400 }}>
                    {s.title || s.id}
                  </span>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                      {s.updated_at ? new Date(s.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}
                    </span>
                    <button 
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: '#ef4444', 
                        cursor: 'pointer', 
                        padding: '2px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        opacity: 0.6,
                        transition: 'opacity 0.2s',
                        fontSize: '1.1rem',
                        lineHeight: 1
                      }}
                      onMouseEnter={(e) => e.target.style.opacity = 1}
                      onMouseLeave={(e) => e.target.style.opacity = 0.6}
                      title="Delete Session"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.45 }}>
            <Shield size={24} style={{ color: '#3b82f6', flexShrink: 0 }} />
            <div>
              <strong>Secure Access</strong>
              <p style={{ marginTop: '0.25rem' }}>This session is end-to-end encrypted. We strictly filter customer and product queries.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="chat-workspace">
        <header className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <MessageSquare size={20} style={{ color: '#3b82f6' }} />
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Swan Chat Lounge</span>
            {chatId && (
              <span style={{ 
                fontSize: '0.75rem', 
                backgroundColor: 'rgba(30, 58, 138, 0.08)', 
                color: '#1e3a8a', 
                padding: '0.25rem 0.5rem', 
                borderRadius: '6px', 
                fontWeight: 600,
                border: '1px solid rgba(30, 58, 138, 0.15)' 
              }}>
                ID: {chatId}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {!user ? (
              <button 
                onClick={() => { setAuthMode('login'); setShowPaywall(true); }}
                style={{ 
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', 
                  border: 'none', 
                  padding: '0.6rem 1.25rem', 
                  borderRadius: '10px', 
                  color: '#ffffff', 
                  cursor: 'pointer', 
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  boxShadow: '0 4px 10px rgba(217, 119, 6, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <Lock size={14} /> Log In / Sign Up
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                {/* Profile Section */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ 
                    width: '34px', 
                    height: '34px', 
                    borderRadius: '50%', 
                    backgroundColor: '#1e3a8a', 
                    color: '#ffffff', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontWeight: 'bold', 
                    fontSize: '0.9rem',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                  }}>
                    {profileName ? profileName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>
                      {profileName || user.email.split('@')[0]}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'capitalize' }}>
                      {profileRole || 'Customer'}
                    </span>
                  </div>
                </div>

                {/* Dashboard Button */}
                {profileRole !== 'customer' && (
                  <button 
                    onClick={() => window.location.href = '/'}
                    style={{ 
                      background: 'rgba(30, 58, 138, 0.08)', 
                      border: '1.5px solid rgba(30, 58, 138, 0.15)', 
                      padding: '0.5rem 1rem', 
                      borderRadius: '8px', 
                      color: '#1e3a8a', 
                      cursor: 'pointer', 
                      fontSize: '0.8rem',
                      fontWeight: 600
                    }}
                  >
                    Dashboard
                  </button>
                )}

                {/* Logout Button */}
                <button 
                  onClick={async () => {
                    localStorage.removeItem('swan_public_messages');
                    localStorage.removeItem('swan_public_chat_id');
                    localStorage.removeItem('swan_public_msg_count');
                    await supabase.auth.signOut();
                    window.location.reload();
                  }}
                  style={{ 
                    background: 'rgba(239, 68, 68, 0.08)', 
                    border: '1px solid rgba(239, 68, 68, 0.2)', 
                    padding: '0.5rem 0.75rem', 
                    borderRadius: '8px', 
                    color: '#ef4444', 
                    cursor: 'pointer', 
                    fontSize: '0.8rem',
                    fontWeight: 500
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Message Thread */}
        <div className="chat-messages" ref={chatMessagesRef}>
          {messages.map((msg, index) => (
            <div key={index} className={`message-row ${msg.role}`}>
              <div className="message-bubble">
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="message-row assistant">
              <div className="message-bubble" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Loader2 size={16} className="spin" style={{ color: '#3b82f6' }} />
                <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Typing response...</span>
              </div>
            </div>
          )}
        </div>

        {/* Chat Input Bar */}
        <div className="chat-input-area">
          <div className="chat-input-wrapper">
            <input 
              type="text"
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={!user && messageCount >= 5 ? "Message limit reached. Please register." : "Type your message..."}
              disabled={loading || (!user && messageCount >= 5)}
            />
            <button 
              className="chat-send-btn" 
              onClick={() => handleSendMessage()}
              disabled={loading || (!user && messageCount >= 5)}
            >
              <Send size={18} />
            </button>
          </div>
          {!user && (
            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#64748b', marginTop: '0.75rem' }}>
              Free Trial: {messageCount}/5 queries used. Sign up for unlimited queries and chat history.
            </p>
          )}
        </div>
      </div>

      {/* Paywall & Registration Modal */}
      {showPaywall && (
        <div className="paywall-overlay">
          <div className="paywall-modal">
            {/* If anonymous visitor just hit the message limit, explain why */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: '#3b82f6' }}>
                <Lock size={28} />
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                {messageCount >= 5 ? 'Free Limit Reached' : 'Unlock Swan AI'}
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: '1.4' }}>
                Create a free account to unlock unlimited messaging, personalized recommendations, and save your chat details.
              </p>
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '1.5rem' }}>
              <button 
                className={`paywall-tab-btn ${authMode === 'signup' ? 'active' : ''}`}
                onClick={() => { setAuthMode('signup'); setAuthError(''); }}
              >
                Sign Up
              </button>
              <button 
                className={`paywall-tab-btn ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => { setAuthMode('login'); setAuthError(''); }}
              >
                Log In
              </button>
            </div>

            {authError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '0.65rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.8rem', textAlign: 'center' }}>
                {authError}
              </div>
            )}

            {authSuccessMsg && (
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '0.65rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.8rem', textAlign: 'center' }}>
                {authSuccessMsg}
              </div>
            )}

            <form onSubmit={handleAuthSubmit}>
              {authMode === 'signup' && (
                <>
                  <div className="form-group">
                    <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500 }}>Full Name</label>
                    <div className="form-input-container">
                      <User size={16} className="form-input-icon" />
                      <input 
                        type="text" 
                        className="form-input" 
                        value={authName}
                        onChange={(e) => setAuthName(e.target.value)}
                        placeholder="John Doe" 
                        required 
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500 }}>Mobile Number</label>
                    <div className="form-input-container">
                      <Phone size={16} className="form-input-icon" />
                      <input 
                        type="tel" 
                        className="form-input" 
                        value={authMobile}
                        onChange={(e) => setAuthMobile(e.target.value)}
                        placeholder="10-digit mobile number" 
                        required 
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="form-group">
                <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500 }}>Email Address</label>
                <div className="form-input-container">
                  <Mail size={16} className="form-input-icon" />
                  <input 
                    type="email" 
                    className="form-input" 
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="john@example.com" 
                    required 
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.75rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500 }}>Password</label>
                <div className="form-input-container">
                  <Lock size={16} className="form-input-icon" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    className="form-input" 
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••" 
                    minLength={6}
                    required 
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="paywall-submit-btn" disabled={authLoading}>
                {authLoading ? (
                  <Loader2 size={18} className="spin" />
                ) : (
                  <>
                    {authMode === 'signup' ? 'Create Free Account' : 'Sign In'}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <button 
              onClick={() => {
                if (messageCount < 3) {
                  setShowPaywall(false);
                } else {
                  alert("Please sign up or sign in to continue chatting with the assistant.");
                }
              }}
              style={{ width: '100%', padding: '0.75rem', fontSize: '0.85rem', background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', marginTop: '0.5rem', fontWeight: 500 }}
            >
              {messageCount >= 3 ? 'Back' : 'Continue Free Trial'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
