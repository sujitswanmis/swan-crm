import React, { useState, useRef, useEffect } from 'react';
import { Bot, Sparkles, Send, Loader2, MessageSquare, Zap, Mic, MicOff, Camera, Paperclip, Volume2, X, PhoneCall, PhoneOff, Plus, MessageCircle, MoreVertical, Menu, Settings2, Copy, Check, Pencil, AlertCircle, Trash2, RotateCcw } from 'lucide-react';
import html2canvas from 'html2canvas';
import ReactMarkdown from 'react-markdown';
import { PremiumProgressLoader } from '../PremiumProgressLoader';
import remarkGfm from 'remark-gfm';

export default function AiAssistantModule({ userRole, userId, lastScreenCapture }) {
  // Session State
  const [sessions, setSessions] = useState([
    { id: '1', title: 'Welcome Chat', messages: [{ role: 'ai', content: 'Hello! I am New Swan AI. How can I assist you with your tasks today?' }] }
  ]);
  const [currentSessionId, setCurrentSessionId] = useState('1');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState(null);
  const [newTitle, setNewTitle] = useState('');

  // Input & Tool State
  const [prompt, setPrompt] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isVoiceSession, setIsVoiceSession] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('alloy');
  const [attachments, setAttachments] = useState([]);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [errorPopup, setErrorPopup] = useState(null);
  
  const [assignedModels, setAssignedModels] = useState(["gpt-4o-mini"]);
  const [selectedAiModel, setSelectedAiModel] = useState("gpt-4o-mini");
  
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const promptRef = useRef(''); 
  const isVoiceSessionRef = useRef(false);
  const isTypingRef = useRef(false);
  const messagesEndRef = useRef(null);
  const isActuallyListeningRef = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Current session messages
  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];
  const messages = currentSession?.messages || [];

  // Load History from Database
  const loadSessions = async () => {
    try {
      const response = await fetch(`/api/ai/history?userId=${userId || 'guest'}`);
      if (!response.ok) throw new Error('Failed to fetch history');
      const data = await response.json();
      
      let loadedSessions = data.sessions || [];
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      let needsSave = false;

      // Auto-delete chats older than 30 days in the Trash
      loadedSessions = loadedSessions.filter(s => {
        if (s.isDeleted && s.deletedAt) {
          if (now - new Date(s.deletedAt).getTime() > thirtyDaysMs) {
            needsSave = true;
            return false;
          }
        }
        return true;
      });
      
      if (loadedSessions.length > 0) {
        setSessions(loadedSessions);
        const firstActive = loadedSessions.find(s => !s.isDeleted);
        setCurrentSessionId(firstActive ? firstActive.id : null);
      } else {
        // Only create a new session if we successfully fetched and there are no sessions
        const newId = Date.now().toString();
        const newSession = { id: newId, title: 'Welcome Chat', messages: [{ role: 'ai', content: 'Hello! I am New Swan AI. How can I assist you with your tasks today?' }] };
        setSessions([newSession]);
        setCurrentSessionId(newId);
      }

      if (needsSave && loadedSessions.length > 0) {
        saveSessions(loadedSessions);
      }

      setIsHistoryLoaded(true);
    } catch (error) {
      console.error('Error loading history:', error);
      // DO NOT call createNewSession() here, as it would overwrite the DB with default state if network fails!
      setIsHistoryLoaded(true);
    }
  };

  // Save History to Database
  const saveSessions = async (newSessions) => {
    setSessions(newSessions);
    try {
      await fetch('/api/ai/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId || 'guest', sessions: newSessions })
      });
    } catch (error) {
      console.error('Error saving history:', error);
    }
  };

  const fetchMyModels = async () => {
    try {
      const res = await fetch('/api/ai/my-models', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.ai_models && data.ai_models.length > 0) {
          setAssignedModels(data.ai_models);
          setSelectedAiModel(data.ai_models[0]);
        }
      }
    } catch (e) {
      console.error('Error fetching my models:', e);
    }
  };

  useEffect(() => {
    loadSessions();
    fetchMyModels();
  }, [userId]);

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const openFullScreen = (url) => {
    setFullScreenImage(url);
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
  };

  const createNewSession = () => {
    setShowTrash(false);
    const newId = Date.now().toString();
    const newSession = {
      id: newId,
      title: 'New Chat',
      messages: [{ role: 'ai', content: 'How can I help you today?', timestamp: new Date().toISOString() }]
    };
    saveSessions([newSession, ...sessions]);
    setCurrentSessionId(newId);
  };

  const saveTitle = (id) => {
    if (newTitle.trim()) {
      const updatedSessions = sessions.map(s => s.id === id ? { ...s, title: newTitle.trim() } : s);
      saveSessions(updatedSessions);
    }
    setRenamingSessionId(null);
  };

  const softDeleteSession = (e, id) => {
    e.stopPropagation();
    const updatedSessions = sessions.map(s => s.id === id ? { ...s, isDeleted: true, deletedAt: new Date().toISOString() } : s);
    saveSessions(updatedSessions);
    if (currentSessionId === id) {
      const nextActive = updatedSessions.find(s => !s.isDeleted);
      setCurrentSessionId(nextActive ? nextActive.id : null);
    }
  };

  const restoreSession = (e, id) => {
    e.stopPropagation();
    const updatedSessions = sessions.map(s => s.id === id ? { ...s, isDeleted: false, deletedAt: null } : s);
    saveSessions(updatedSessions);
  };

  const hardDeleteSession = (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to permanently delete this chat?')) return;
    const updatedSessions = sessions.filter(s => s.id !== id);
    saveSessions(updatedSessions);
    if (currentSessionId === id) {
      const nextActive = updatedSessions.find(s => !s.isDeleted);
      setCurrentSessionId(nextActive ? nextActive.id : null);
    }
  };

  const updateCurrentSessionMessages = (newMessages) => {
    // Generate title from first user message if it's 'New Chat'
    let title = currentSession.title;
    if (title === 'New Chat' && newMessages.length > 1) {
      const firstUserMsg = newMessages.find(m => m.role === 'user');
      if (firstUserMsg && typeof firstUserMsg.content === 'string') {
        title = firstUserMsg.content.substring(0, 30) + '...';
      }
    }

    const updatedSessions = sessions.map(s => {
      if (s.id === currentSessionId) {
        return { ...s, title, messages: newMessages };
      }
      return s;
    });
    saveSessions(updatedSessions);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(() => {
    isVoiceSessionRef.current = isVoiceSession;
  }, [isVoiceSession]);
  
  const setTypingState = (state) => {
    setIsTyping(state);
    isTypingRef.current = state;
  };

  // Speech Recognition Setup
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false; 
        recognition.interimResults = true; 
        
        recognition.onstart = () => {
          isActuallyListeningRef.current = true;
        };

        recognition.onresult = (event) => {
          let fullTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
            fullTranscript += event.results[i][0].transcript;
          }
          setPrompt(fullTranscript);
          promptRef.current = fullTranscript; 
        };
        
        recognition.onerror = (e) => {
           console.log("Speech Error:", e.error);
           setIsListening(false);
           isActuallyListeningRef.current = false;
        };
        
        recognition.onend = () => {
          setIsListening(false);
          isActuallyListeningRef.current = false;
          const currentText = promptRef.current.trim();
          
          if (isVoiceSessionRef.current) {
            if (currentText && !isTypingRef.current) {
              handleAutoSubmit(currentText);
            } else if (!currentText) {
               try { 
                 isActuallyListeningRef.current = true;
                 recognition.start(); 
                 setIsListening(true); 
               } catch(e){
                 isActuallyListeningRef.current = false;
               }
            }
          }
        };
        
        recognitionRef.current = recognition;
      }
    }
  }, [isTyping]); 

  const toggleVoiceSession = () => {
    if (!isVoiceSession) {
      setIsVoiceSession(true);
      isVoiceSessionRef.current = true;
      toggleListening(true);
    } else {
      setIsVoiceSession(false);
      isVoiceSessionRef.current = false;
      if (isListening) toggleListening(false);
      window.speechSynthesis?.cancel();
    }
  };

  const toggleListening = (forceState = null) => {
    if (!recognitionRef.current) {
      alert("Voice recognition is not supported in this browser.");
      return;
    }
    const shouldListen = forceState !== null ? forceState : !isListening;
    
    if (!shouldListen) {
      if (isActuallyListeningRef.current) {
        try { recognitionRef.current.stop(); } catch(e){}
      }
      setIsListening(false);
      isActuallyListeningRef.current = false;
    } else {
      if (isActuallyListeningRef.current) return; 
      try {
        isActuallyListeningRef.current = true; 
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        isActuallyListeningRef.current = false; 
        if (err.name === 'NotAllowedError') {
          alert("Please allow microphone permissions in your browser's address bar to use Voice features.");
          setIsVoiceSession(false);
          isVoiceSessionRef.current = false;
          setIsListening(false);
        } else if (err.name === 'InvalidStateError') {
          // It's already listening, ignore silently so Next.js doesn't show a red error overlay
          setIsListening(true);
        } else {
          console.warn("Microphone start warning:", err);
        }
      }
    }
  };

  const audioRef = useRef(null);

  const speak = async (text) => {
    // If TTS is already playing, stop it
    if (audioRef.current) {
      audioRef.current.pause();
    }

    // Extract spoken text from <speak> tags if present
    let spokenText = text;
    const speakMatch = text.match(/<speak>([\s\S]*?)<\/speak>/i);
    if (speakMatch) {
      spokenText = speakMatch[1].trim();
    }

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: spokenText, voice: selectedVoice })
      });

      if (!response.ok) throw new Error('TTS Failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onended = () => {
        if (isVoiceSessionRef.current) {
          toggleListening(true);
        }
        URL.revokeObjectURL(url);
      };
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Audio autoplay blocked or failed:", error);
          // If OpenAI audio is blocked by browser, try fallback or just resume mic
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(spokenText);
            utterance.onend = () => {
              if (isVoiceSessionRef.current) toggleListening(true);
            };
            window.speechSynthesis.speak(utterance);
          } else {
            if (isVoiceSessionRef.current) toggleListening(true);
          }
        });
      }
    } catch (err) {
      console.error('Error playing TTS:', err);
      // Fallback to browser TTS if fetch fails
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(spokenText);
        utterance.onend = () => {
          if (isVoiceSessionRef.current) toggleListening(true);
        };
        window.speechSynthesis.speak(utterance);
      } else {
        if (isVoiceSessionRef.current) toggleListening(true);
      }
    }
  };

  const compressImage = (base64Str) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX = 1024;
        if (width > MAX || height > MAX) {
          if (width > height) {
            height = Math.round((height * MAX) / width);
            width = MAX;
          } else {
            width = Math.round((width * MAX) / height);
            height = MAX;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.src = base64Str;
    });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    if (file.type.startsWith('image/')) {
      reader.onload = async (event) => {
        const compressedBase64 = await compressImage(event.target.result);
        setAttachments(prev => [...prev, { type: 'image', url: compressedBase64, name: file.name }]);
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = (event) => {
        setAttachments(prev => [...prev, { type: 'document', content: event.target.result, name: file.name }]);
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    
    Array.from(e.dataTransfer.files).forEach(file => {
      const reader = new FileReader();
      if (file.type.startsWith('image/')) {
        reader.onload = async (event) => {
          const compressedBase64 = await compressImage(event.target.result);
          setAttachments(prev => [...prev, { type: 'image', url: compressedBase64, name: file.name }]);
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = (event) => {
          setAttachments(prev => [...prev, { type: 'document', content: event.target.result, name: file.name }]);
        };
        reader.readAsText(file);
      }
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const takeScreenshot = async () => {
    if (lastScreenCapture) {
      setAttachments(prev => [...prev, { type: 'image', url: lastScreenCapture, name: 'Previous Tab Screenshot' }]);
    } else {
      alert('No previous tab to capture. Navigate to a module (like Leads or Analytics) first, then click on AI Assistant.');
    }
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleAutoSubmit = async (textPrompt) => {
    const currentAttachments = [...attachments];
    await processSubmit(textPrompt, currentAttachments);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await processSubmit(prompt, attachments);
  };

  const processSubmit = async (currentPrompt, currentAttachments) => {
    if (!currentPrompt.trim() && currentAttachments.length === 0) return;
    
    if (isListening) toggleListening(false);

    let userContent = [];
    if (currentPrompt.trim()) {
      userContent.push({ type: 'text', text: currentPrompt });
    } else if (currentAttachments.length > 0) {
      userContent.push({ type: 'text', text: 'Please analyze this uploaded attachment.' });
    }

    currentAttachments.forEach(att => {
      if (att.type === 'document') {
        userContent.push({ type: 'text', text: `\n\n--- Document: ${att.name} ---\n${att.content}\n--- End Document ---\n` });
      } else if (att.type === 'image') {
        userContent.push({ type: 'image_url', image_url: { url: att.url } });
      }
    });

    const uiMessage = { 
      role: 'user', 
      content: currentPrompt || 'Uploaded an attachment',
      apiContent: userContent, 
      hasAttachments: currentAttachments.length > 0,
      attachmentsData: currentAttachments, // Store for UI rendering
      timestamp: new Date().toISOString()
    };
    
    const newMessages = [...messages, uiMessage];
    updateCurrentSessionMessages(newMessages);
    
    setPrompt('');
    promptRef.current = '';
    setAttachments([]);

    await callAI(newMessages);
  };

  const saveEdit = async (index) => {
    const msgToEdit = messages[index];
    const newText = editPrompt;
    
    // Truncate history up to the edited message
    const truncatedMessages = messages.slice(0, index);
    
    setEditingIndex(null);
    
    let userContent = [];
    if (newText.trim()) {
      userContent.push({ type: 'text', text: newText });
    } else if (msgToEdit.hasAttachments) {
      userContent.push({ type: 'text', text: 'Please analyze this uploaded attachment.' });
    }

    if (msgToEdit.hasAttachments && msgToEdit.attachmentsData) {
      msgToEdit.attachmentsData.forEach(att => {
        if (att.type === 'document') {
          userContent.push({ type: 'text', text: `\n\n--- Document: ${att.name} ---\n${att.content}\n--- End Document ---\n` });
        } else if (att.type === 'image') {
          userContent.push({ type: 'image_url', image_url: { url: att.url } });
        }
      });
    }

    const updatedUiMessage = { 
      role: 'user', 
      content: newText || 'Uploaded an attachment',
      apiContent: userContent, 
      hasAttachments: msgToEdit.hasAttachments,
      attachmentsData: msgToEdit.attachmentsData,
      timestamp: new Date().toISOString()
    };

    const newMessages = [...truncatedMessages, updatedUiMessage];
    updateCurrentSessionMessages(newMessages);

    await callAI(newMessages);
  };

  const callAI = async (newMessages) => {
    const apiMessages = newMessages.map((msg, index) => {
      return {
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.apiContent || msg.content
      };
    });

    setTypingState(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, userId: userId || 'guest', selectedAiModel })
      });

      let responseData = null;
      let errorMessage = `API Error: ${response.status}`;
      
      try {
        responseData = await response.json();
        if (responseData && responseData.error) {
          errorMessage = responseData.error;
        }
      } catch (e) {
        // failed to parse json
      }

      if (!response.ok) {
        throw new Error(errorMessage);
      }
      
      updateCurrentSessionMessages([...newMessages, { 
        role: 'ai', 
        content: responseData.content,
        timestamp: new Date().toISOString()
      }]);
      
      if (isVoiceSessionRef.current) {
        speak(responseData.content);
      }
    } catch (error) {
      console.error(error);
      const errorMsg = `Error: ${error.message}.`;
      if (error.message.includes('Token limit exceeded')) {
        setErrorPopup(error.message);
      } else {
        updateCurrentSessionMessages([...newMessages, { role: 'ai', content: errorMsg }]);
      }
      if (isVoiceSessionRef.current) {
        speak(errorMsg);
      }
    } finally {
      setTypingState(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', background: '#ffffff', overflow: 'hidden' }}>
      
      {/* Sidebar - ChatGPT Style */}
      <div style={{ 
        width: isSidebarOpen ? '280px' : '0px', 
        background: '#f9f9f9', 
        borderRight: '1px solid #e5e5e5', 
        display: 'flex', 
        flexDirection: 'column',
        transition: 'width 0.3s ease',
        overflow: 'hidden',
        flexShrink: 0
      }}>
        <div style={{ padding: '1rem' }}>
          <button 
            onClick={createNewSession}
            style={{ 
              width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', 
              padding: '0.75rem 1rem', background: 'white', border: '1px solid #e5e5e5', 
              borderRadius: '8px', cursor: 'pointer', fontWeight: 500, color: '#333',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
            }}
          >
            <Plus size={18} /> New Chat
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 1rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888' }}>
              {showTrash ? 'Recycle Bin' : 'Recent History'}
            </div>
            <button 
              onClick={() => setShowTrash(!showTrash)} 
              style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center' }} 
              title={showTrash ? "Back to Chats" : "Recycle Bin"}
            >
              {showTrash ? <MessageCircle size={14} /> : <Trash2 size={14} />}
            </button>
          </div>
          
          {sessions.filter(s => showTrash ? s.isDeleted : !s.isDeleted).map(session => (
            <div key={session.id} style={{ 
              position: 'relative', display: 'flex', alignItems: 'center', width: '100%', gap: '0.25rem',
              background: (!showTrash && currentSessionId === session.id) ? '#ececec' : 'transparent',
              borderRadius: '8px'
            }}>
              <button 
                onClick={() => !showTrash && setCurrentSessionId(session.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem',
                  flex: 1, background: 'transparent',
                  border: 'none', borderRadius: '8px', cursor: showTrash ? 'default' : 'pointer', textAlign: 'left',
                  color: (!showTrash && currentSessionId === session.id) ? '#000' : '#444'
                }}
              >
                <MessageCircle size={16} style={{ flexShrink: 0 }} />
                {renamingSessionId === session.id ? (
                  <input
                    type="text"
                    value={newTitle}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onBlur={() => saveTitle(session.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveTitle(session.id);
                      if (e.key === 'Escape') setRenamingSessionId(null);
                    }}
                    style={{ flex: 1, border: '1px solid #8b5cf6', borderRadius: '4px', padding: '0.1rem 0.25rem', fontSize: '0.9rem', outline: 'none', background: 'white' }}
                  />
                ) : (
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9rem' }}>
                    {session.title}
                  </span>
                )}
              </button>
              
              {showTrash ? (
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button onClick={(e) => restoreSession(e, session.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10b981', padding: '0.25rem' }} title="Restore">
                    <RotateCcw size={14} />
                  </button>
                  <button onClick={(e) => hardDeleteSession(e, session.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.25rem' }} title="Delete Permanently">
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.1rem' }}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setRenamingSessionId(session.id); setNewTitle(session.title); }} 
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '0.5rem' }} 
                    title="Rename Chat"
                    onMouseEnter={(e) => e.currentTarget.style.color = '#3b82f6'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#888'}
                  >
                    <Pencil size={14} />
                  </button>
                  <button 
                    onClick={(e) => softDeleteSession(e, session.id)} 
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '0.5rem' }} 
                    title="Move to Recycle Bin"
                    onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#888'}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
          
          {showTrash && sessions.filter(s => s.isDeleted).length === 0 && (
            <div style={{ textAlign: 'center', color: '#aaa', fontSize: '0.8rem', padding: '2rem 0' }}>
              Recycle bin is empty
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div 
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', height: '100%', background: isDragging ? '#f0fdf4' : 'transparent', transition: 'background 0.2s' }}
      >
        {!isHistoryLoaded ? (
          <PremiumProgressLoader message="Loading Chat History" active={!isHistoryLoaded} />
        ) : (
          <>
        {isDragging && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.8)', border: '2px dashed #10b981', margin: '1rem', borderRadius: '1rem' }}>
            <div style={{ textAlign: 'center', color: '#10b981' }}>
              <Camera size={48} style={{ marginBottom: '1rem' }} />
              <h2>Drop files here to upload</h2>
            </div>
          </div>
        )}
        
        {/* Header */}
        <div style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: '0.25rem' }}
            >
              <Menu size={20} />
            </button>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: '#333', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bot size={22} color="#8b5cf6" /> New Swan AI
            </h2>
          </div>
          
          {/* Voice Settings & Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <select 
                value={selectedVoice} 
                onChange={(e) => setSelectedVoice(e.target.value)}
                style={{ 
                  appearance: 'none', background: '#f9f9f9', border: '1px solid #ddd', 
                  borderRadius: '20px', padding: '0.4rem 2rem 0.4rem 1rem', fontSize: '0.8rem', 
                  color: '#555', cursor: 'pointer', outline: 'none' 
                }}
              >
                <option value="alloy">Alloy (Neutral)</option>
                <option value="nova">Nova (Female)</option>
                <option value="echo">Echo (Male)</option>
                <option value="onyx">Onyx (Deep Male)</option>
                <option value="fable">Fable (Expressive)</option>
                <option value="shimmer">Shimmer (Clear Female)</option>
              </select>
              <Settings2 size={12} color="#888" style={{ position: 'absolute', right: '0.75rem', pointerEvents: 'none' }} />
            </div>

            {assignedModels.length > 1 && (
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <select 
                  value={selectedAiModel} 
                  onChange={(e) => setSelectedAiModel(e.target.value)}
                  style={{ 
                    appearance: 'none', background: '#eef2ff', border: '1px solid #c7d2fe', 
                    borderRadius: '20px', padding: '0.4rem 2rem 0.4rem 1rem', fontSize: '0.8rem', 
                    color: '#4338ca', cursor: 'pointer', outline: 'none', fontWeight: 500
                  }}
                  title="Select AI Model"
                >
                  {assignedModels.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
                <Bot size={12} color="#4338ca" style={{ position: 'absolute', right: '0.75rem', pointerEvents: 'none' }} />
              </div>
            )}
            
            <button 
              onClick={toggleVoiceSession}
              className={isVoiceSession ? "pulse" : ""}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '20px',
                background: isVoiceSession ? '#ef4444' : '#f0f0f0',
                color: isVoiceSession ? 'white' : '#444', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, transition: 'all 0.2s'
              }}
            >
              {isVoiceSession ? <PhoneOff size={16} /> : <PhoneCall size={16} />}
              {isVoiceSession ? 'Voice Active' : 'Start Voice Mode'}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 1rem', paddingBottom: '140px' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {messages.length === 1 && messages[0].role === 'ai' && (
               <div style={{ textAlign: 'center', padding: '4rem 0', color: '#888' }}>
                  <Sparkles size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 500, color: '#444' }}>How can I help you today?</h3>
               </div>
            )}
            
            {messages.map((msg, index) => (
              <div key={index} style={{ display: 'flex', gap: '1.5rem', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                <div style={{ 
                  width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  background: msg.role === 'user' ? '#e5e5e5' : '#8b5cf6',
                  color: msg.role === 'user' ? '#666' : 'white',
                  marginTop: '0.25rem'
                }}>
                  {msg.role === 'user' ? <MessageSquare size={16} /> : <Bot size={18} />}
                </div>
                
                <div style={{ 
                  maxWidth: msg.role === 'ai' ? '100%' : '85%', fontSize: '1rem', lineHeight: '1.6', color: '#333',
                  background: msg.role === 'user' ? '#f4f4f4' : 'transparent',
                  padding: msg.role === 'user' ? '1rem 1.25rem' : '0.25rem 0',
                  borderRadius: msg.role === 'user' ? '1.5rem' : '0',
                  borderBottomRightRadius: msg.role === 'user' ? '0.5rem' : '1.5rem',
                  overflowX: 'auto', position: 'relative'
                }}>
                  {msg.role === 'ai' ? (
                    (() => {
                      let displayText = msg.content;
                      // Remove <speak> tags from UI rendering
                      displayText = displayText.replace(/<speak>[\s\S]*?<\/speak>/gi, '').trim();
                      
                      return (
                        <div>
                          <div className="markdown-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {displayText}
                            </ReactMarkdown>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                            <button 
                              onClick={() => copyToClipboard(displayText, index)}
                              style={{ 
                                display: 'flex', alignItems: 'center', gap: '0.25rem', 
                                background: 'none', border: 'none', cursor: 'pointer', 
                                color: copiedIndex === index ? '#10b981' : '#888',
                                fontSize: '0.8rem', padding: '0.25rem'
                              }}
                            >
                              {copiedIndex === index ? <Check size={14} /> : <Copy size={14} />}
                              {copiedIndex === index ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      );
                    })()
                  ) : editingIndex === index ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '250px' }}>
                      <textarea 
                        value={editPrompt} 
                        onChange={(e) => setEditPrompt(e.target.value)} 
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #ccc', outline: 'none', resize: 'none', fontFamily: 'inherit' }} 
                        rows={3} 
                      />
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditingIndex(null)} style={{ background: '#e5e5e5', color: '#333', border: 'none', padding: '0.25rem 0.75rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                        <button onClick={() => saveEdit(index)} style={{ background: '#8b5cf6', color: 'white', border: 'none', padding: '0.25rem 0.75rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Save & Resend</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', paddingRight: '20px' }}>
                      {msg.content}
                      <button 
                        onClick={() => { setEditingIndex(index); setEditPrompt(msg.content); }}
                        style={{ position: 'absolute', right: '-5px', top: '-5px', background: 'white', border: '1px solid #ddd', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#666', opacity: 0.7 }}
                        title="Edit Message"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  )}
                  
                  {msg.timestamp && (
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.5rem', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  
                  {/* Render UI Attachments if any */}
                  {msg.hasAttachments && msg.attachmentsData && (
                    <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {msg.attachmentsData.map((att, i) => (
                         <div key={i} style={{ padding: '0.5rem', background: 'white', border: '1px solid #ddd', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                           {att.type === 'image' ? (
                             <>
                               <img 
                                 src={att.url} 
                                 alt={att.name} 
                                 onClick={() => openFullScreen(att.url)}
                                 style={{ maxWidth: '200px', maxHeight: '200px', objectFit: 'contain', borderRadius: '4px', cursor: 'zoom-in' }} 
                               />
                               <span style={{ fontSize: '0.75rem', color: '#666', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={att.name}>{att.name}</span>
                             </>
                           ) : (
                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                               <Paperclip size={14} />
                               <span style={{ fontSize: '0.8rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={att.name}>{att.name}</span>
                             </div>
                           )}
                         </div>
                      ))}
                    </div>
                  )}

                  {msg.role === 'ai' && (
                    <button 
                      onClick={() => speak(msg.content)}
                      style={{ marginTop: '0.5rem', background: 'none', border: 'none', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', padding: '0' }}
                    >
                      <Volume2 size={14} /> Listen
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#8b5cf6', color: 'white' }}>
                  <Bot size={18} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#888' }}>
                  <Loader2 size={16} className="spin" /> Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Floating Input Area */}
        <div style={{ 
          position: 'absolute', bottom: 0, left: 0, right: 0, 
          background: 'linear-gradient(to top, white 80%, rgba(255,255,255,0))', 
          padding: '2rem 1rem 1.5rem 1rem' 
        }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', position: 'relative' }}>
            
            {/* Attachments Preview */}
            {attachments.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap', paddingLeft: '1rem' }}>
                {attachments.map((att, i) => (
                  <div key={i} style={{ position: 'relative', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'white' }}>
                    {att.type === 'image' ? (
                      <img 
                        src={att.url} 
                        alt="upload" 
                        onClick={() => openFullScreen(att.url)}
                        style={{ width: '24px', height: '24px', objectFit: 'cover', borderRadius: '4px', cursor: 'zoom-in' }} 
                      />
                    ) : ( <Paperclip size={16} color="#666" /> )}
                    <span style={{ fontSize: '0.8rem', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                    <button onClick={() => removeAttachment(i)} style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input Pill */}
            <form 
              onSubmit={handleSubmit} 
              style={{ 
                background: '#f4f4f4', borderRadius: '24px', padding: '0.5rem', 
                display: 'flex', alignItems: 'flex-end', gap: '0.5rem',
                border: '1px solid transparent', transition: 'border 0.2s'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#ccc'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'transparent'}
            >
              
              {/* Left Tools */}
              <div style={{ display: 'flex', gap: '0.25rem', paddingBottom: '0.25rem', paddingLeft: '0.25rem' }}>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} accept="image/*,.txt,.csv,.json" />
                <button 
                  type="button" onClick={() => fileInputRef.current?.click()}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'transparent', color: '#666', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Attach File"
                >
                  <Paperclip size={18} />
                </button>
                <button 
                  type="button" onClick={takeScreenshot}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'transparent', color: '#666', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Capture Screen"
                >
                  <Camera size={18} />
                </button>
              </div>

              {/* Textarea */}
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={isVoiceSession ? "Voice Active... Speak now" : "Message New Swan AI..."}
                style={{ 
                  flex: 1, padding: '0.75rem 0.5rem', background: 'transparent', 
                  border: 'none', outline: 'none', fontSize: '1rem', color: '#333',
                  resize: 'none', minHeight: '44px', maxHeight: '150px', fontFamily: 'inherit'
                }}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
                }}
              />
              
              {/* Right Tools */}
              <div style={{ display: 'flex', gap: '0.25rem', paddingBottom: '0.25rem', paddingRight: '0.25rem' }}>
                <button 
                  type="button" onClick={() => toggleListening(null)}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', background: isListening ? '#ef4444' : 'transparent', color: isListening ? 'white' : '#666', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                >
                  {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
                <button 
                  type="submit" 
                  disabled={(!prompt.trim() && attachments.length === 0) || isTyping}
                  style={{ 
                    width: '36px', height: '36px', borderRadius: '50%', 
                    background: (!prompt.trim() && attachments.length === 0) || isTyping ? '#e5e5e5' : '#8b5cf6', 
                    color: 'white', border: 'none', cursor: ((!prompt.trim() && attachments.length === 0) || isTyping) ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s'
                  }}
                >
                  <Send size={16} />
                </button>
              </div>
            </form>
            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#888', marginTop: '0.5rem' }}>
              AI can make mistakes. Check important info.
            </div>
          </div>
        </div>
        </>
        )}
      </div>

      {/* Full Screen Image Viewer / Lightbox */}
      {fullScreenImage && (
        <div 
          onClick={() => setFullScreenImage(null)}
          onWheel={(e) => {
            setZoomLevel(prev => Math.max(0.5, Math.min(prev - e.deltaY * 0.002, 5)));
          }}
          onMouseDown={(e) => {
            if(e.target.tagName === 'IMG') {
               e.stopPropagation();
               setIsDraggingImage(true);
               dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
            }
          }}
          onMouseMove={(e) => {
            if(isDraggingImage) {
               setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
            }
          }}
          onMouseUp={() => setIsDraggingImage(false)}
          onMouseLeave={() => setIsDraggingImage(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: isDraggingImage ? 'grabbing' : 'grab', padding: '2rem',
            overflow: 'hidden'
          }}
        >
          <img 
            src={fullScreenImage} 
            alt="Full screen preview" 
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            style={{ 
              maxWidth: '90%', maxHeight: '90%', 
              objectFit: 'contain', borderRadius: '8px', 
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
              transition: isDraggingImage ? 'none' : 'transform 0.1s'
            }} 
          />
          <button 
            onClick={(e) => { e.stopPropagation(); setFullScreenImage(null); }}
            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.2)', zIndex: 10000 }}
          >
            <X size={24} color="#333" />
          </button>
        </div>
      )}

      {/* Error Popup */}
      {errorPopup && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(2px)'
        }}>
          <div style={{
            background: 'white', padding: '2rem', borderRadius: '12px',
            maxWidth: '400px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center'
          }}>
            <div style={{ color: '#ef4444', marginBottom: '1rem', background: '#fee2e2', padding: '1rem', borderRadius: '50%' }}>
              <AlertCircle size={36} />
            </div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#111827', fontSize: '1.25rem', fontWeight: 600 }}>Token Limit Exceeded</h3>
            <p style={{ color: '#4b5563', marginBottom: '1.5rem', lineHeight: 1.5, fontSize: '0.95rem' }}>
              {errorPopup}
            </p>
            <button 
              onClick={() => setErrorPopup(null)}
              style={{
                background: '#ef4444', color: 'white', border: 'none', padding: '0.75rem 1.5rem',
                borderRadius: '8px', fontWeight: 600, cursor: 'pointer', width: '100%',
                transition: 'background 0.2s', fontSize: '1rem'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = '#dc2626'}
              onMouseOut={(e) => e.currentTarget.style.background = '#ef4444'}
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
