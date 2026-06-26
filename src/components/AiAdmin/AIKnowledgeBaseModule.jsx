import React, { useState, useEffect } from 'react';
import { BookOpen, Upload, FileText, Link as LinkIcon, Trash2, Edit3, Plus, Search, File, Database, Check, Loader2, Globe, Eye } from 'lucide-react';
import { PremiumProgressLoader } from '../PremiumProgressLoader';

const loadPdfJs = () => {
  return new Promise((resolve, reject) => {
    const lib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
    if (lib) return resolve(lib);
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    script.onload = () => {
      const loadedLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
      if (!loadedLib) return reject(new Error('PDF.js library loaded but global object not found.'));
      loadedLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      resolve(loadedLib);
    };
    script.onerror = () => reject(new Error('Failed to load PDF processing library from CDN'));
    document.head.appendChild(script);
  });
};

const extractTextFromPdf = async (file) => {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    text += strings.join(' ') + '\n';
  }
  return text.trim();
};

export default function AIKnowledgeBaseModule() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  
  const [docType, setDocType] = useState('text'); // text, url, pdf
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [docFile, setDocFile] = useState(null);
  const [docVisibility, setDocVisibility] = useState('internal');
  
  const [viewingDoc, setViewingDoc] = useState(null);
  const [savingDoc, setSavingDoc] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/knowledge');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleSaveDocument = async () => {
    if (!docTitle) return alert('Please enter a title');
    
    if (docType === 'text' && !docContent) return alert('Please enter some text');
    if (docType === 'url' && !docUrl) return alert('Please enter a valid URL');
    if (docType === 'pdf' && !docFile) return alert('Please select a PDF file');
    
    setSavingDoc(true);
    try {
      let content = docContent;
      
      // Extract text from PDF in the browser
      if (docType === 'pdf') {
        try {
          content = await extractTextFromPdf(docFile);
          if (!content) {
            throw new Error("Extracted text is empty. PDF might be scanned/image-only.");
          }
        } catch (err) {
          console.warn("Client-side PDF extraction failed, will fallback to server-side parser:", err);
        }
      }

      if (viewingDoc && viewingDoc.id) {
        // Since there is no UPDATE endpoint yet, we can delete and re-insert for now
        await fetch(`/api/ai/knowledge?id=${viewingDoc.id}`, { method: 'DELETE' });
      }

      const formData = new FormData();
      formData.append('title', docTitle);
      formData.append('type', docType);
      formData.append('visibility', docVisibility);
      
      if (docType === 'text') {
        formData.append('content', docContent);
      } else if (docType === 'url') {
        formData.append('url', docUrl);
      } else if (docType === 'pdf') {
        if (content) {
          formData.append('content', content); // Send extracted text directly
        } else {
          formData.append('file', docFile); // Fallback to raw file upload
        }
      }

      const res = await fetch('/api/ai/knowledge', {
        method: 'POST',
        body: formData
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        setIsViewModalOpen(false);
        resetForm();
        fetchDocuments();
      } else {
        let errorMsg = "Failed to save";
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch (e) {
          const rawText = await res.text();
          if (rawText.includes("Payload Too Large") || rawText.includes("Request Entity Too Large") || res.status === 413) {
            errorMsg = "This PDF file is too large to process. Please optimize the PDF or copy its text content manually.";
          } else {
            errorMsg = rawText || errorMsg;
          }
        }
        alert(errorMsg);
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
    setSavingDoc(false);
  };

  const handleDelete = async (id) => {
    if(!confirm("Are you sure you want to delete this document? The AI will no longer be able to use it.")) return;
    try {
      const res = await fetch(`/api/ai/knowledge?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchFullDocument = async (id) => {
    // Current GET returns only title, id, created_at. We need full content to edit.
    // However, if the API doesn't return content, we might need to fetch it from Supabase directly here for viewing.
    // For now, let's fetch directly from Supabase for View/Edit since we just need the text.
    return fetch(`/api/ai/knowledge/content?id=${id}`).then(res => res.json()); // Will create this endpoint next
  };

  const openViewModal = async (doc) => {
    setViewingDoc(doc);
    setIsViewModalOpen(true);
    // Fetch content if missing
    if (!doc.content) {
      const data = await fetchFullDocument(doc.id);
      setViewingDoc({ ...doc, content: data.content });
    }
  };

  const openEditModal = async (doc) => {
    setDocTitle(doc.title);
    setDocType(doc.type || 'text');
    setDocVisibility(doc.visibility || 'internal');
    setIsModalOpen(true);
    
    if (!doc.content) {
      const data = await fetchFullDocument(doc.id);
      setDocContent(data.content || '');
      setViewingDoc({ ...doc, content: data.content });
    } else {
      setDocContent(doc.content);
      setViewingDoc(doc);
    }
  };

  const resetForm = () => {
    setDocTitle('');
    setDocContent('');
    setDocUrl('');
    setDocFile(null);
    setDocType('text');
    setDocVisibility('internal');
    setViewingDoc(null);
  };

  // Modern UI states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilterTab, setActiveFilterTab] = useState('all');

  // Stats calculation
  const totalCount = documents.length;
  const textCount = documents.filter(d => d.type === 'text').length;
  const urlCount = documents.filter(d => d.type === 'url').length;
  const pdfCount = documents.filter(d => d.type === 'pdf').length;

  // Search & Filter execution
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = activeFilterTab === 'all' || doc.type === activeFilterTab;
    return matchesSearch && matchesType;
  });

  return (
    <div style={{ padding: '2rem', width: '100%' }}>
      <style>{`
        .kb-stat-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-light);
          border-radius: 14px;
          padding: 1.25rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          transition: all 0.25s ease;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
        }
        .kb-stat-card:hover {
          border-color: var(--accent-color);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
          transform: translateY(-2px);
        }
        .kb-stat-icon {
          padding: 0.65rem;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .kb-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-light);
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.04);
        }
        .kb-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 32px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04);
          border-color: var(--accent-color);
        }
        .kb-icon-container {
          padding: 0.6rem;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .kb-icon-container.text {
          background: rgba(37, 99, 235, 0.08);
          color: #2563eb;
        }
        .kb-icon-container.url {
          background: rgba(6, 182, 212, 0.08);
          color: #06b6d4;
        }
        .kb-icon-container.pdf {
          background: rgba(139, 92, 246, 0.08);
          color: #8b5cf6;
        }
        .kb-badge {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .kb-badge.text {
          background: rgba(37, 99, 235, 0.08);
          color: #2563eb;
        }
        .kb-badge.url {
          background: rgba(6, 182, 212, 0.08);
          color: #06b6d4;
        }
        .kb-badge.pdf {
          background: rgba(139, 92, 246, 0.08);
          color: #8b5cf6;
        }
        .kb-pulse-dot {
          width: 8px;
          height: 8px;
          background-color: #10b981;
          border-radius: 50%;
          display: inline-block;
          position: relative;
        }
        .kb-pulse-dot::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background-color: #10b981;
          animation: kb-pulse 2s infinite ease-in-out;
        }
        @keyframes kb-pulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        .kb-filter-tab {
          background: none;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .kb-filter-tab:hover {
          color: var(--text-primary);
        }
        .kb-filter-tab.active {
          background-color: var(--accent-color);
          color: #ffffff !important;
        }
        .kb-action-btn {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.45rem 0.85rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.2s ease;
          background: transparent;
        }
        .kb-action-btn.view {
          color: var(--text-secondary);
          background: var(--bg-surface);
          border-color: var(--border-light);
        }
        .kb-action-btn.view:hover {
          color: var(--text-primary);
          background: var(--bg-primary);
          border-color: var(--text-secondary);
        }
        .kb-action-btn.edit {
          color: #2563eb;
          background: rgba(37, 99, 235, 0.05);
        }
        .kb-action-btn.edit:hover {
          color: #ffffff;
          background: #2563eb;
        }
        .kb-action-btn.delete {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.05);
          padding: 0.45rem 0.65rem;
        }
        .kb-action-btn.delete:hover {
          color: #ffffff;
          background: #ef4444;
        }
        .kb-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 2rem;
          animation: kb-fadeIn 0.2s ease-out;
        }
        .kb-modal-content {
          background: var(--bg-surface);
          border: 1px solid var(--border-light);
          border-radius: 16px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          padding: 2rem;
          width: 100%;
          animation: kb-slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .kb-selector-card {
          border: 1.5px solid var(--border-light);
          border-radius: 12px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          background: var(--bg-surface);
        }
        .kb-selector-card:hover {
          border-color: var(--accent-color);
          background: rgba(0, 0, 0, 0.01);
          transform: translateY(-2px);
        }
        .kb-selector-card.active {
          border-color: var(--accent-color);
          background: rgba(37, 99, 235, 0.03);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }
        @keyframes kb-fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes kb-slideUp {
          from { transform: translateY(16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* Header Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            <BookOpen size={32} color="var(--accent-color)" />
            AI Knowledge Base (RAG)
          </h1>
          <p style={{ margin: '0.4rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Upload documents, rules, and data that the Swan AI assistant should learn from.
          </p>
        </div>
        
        <button 
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="btn-primary" 
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.4rem', borderRadius: '10px', fontSize: '0.95rem', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)' }}
        >
          <Plus size={20} /> Add Knowledge
        </button>
      </div>

      {/* Stats Dashboard */}
      {!loading && documents.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
          <div className="kb-stat-card">
            <div className="kb-stat-icon" style={{ background: 'rgba(37, 99, 235, 0.08)', color: '#2563eb' }}>
              <Database size={24} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{totalCount}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Documents</div>
            </div>
          </div>

          <div className="kb-stat-card">
            <div className="kb-stat-icon" style={{ background: 'rgba(37, 99, 235, 0.08)', color: '#2563eb' }}>
              <FileText size={24} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{textCount}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Manual Text Blocks</div>
            </div>
          </div>

          <div className="kb-stat-card">
            <div className="kb-stat-icon" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#06b6d4' }}>
              <Globe size={24} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{urlCount}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Website Links</div>
            </div>
          </div>

          <div className="kb-stat-card">
            <div className="kb-stat-icon" style={{ background: 'rgba(139, 92, 246, 0.08)', color: '#8b5cf6' }}>
              <File size={24} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{pdfCount}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>PDF Documents</div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar: Search and Filter */}
      {!loading && documents.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
            <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
              <Search size={18} />
            </span>
            <input 
              type="text"
              placeholder="Search documents by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '0.65rem 1rem 0.65rem 2.5rem', borderRadius: '10px', fontSize: '0.9rem', border: '1px solid var(--border-light)', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-surface)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
            <button 
              onClick={() => setActiveFilterTab('all')}
              className={`kb-filter-tab ${activeFilterTab === 'all' ? 'active' : ''}`}
            >
              All
            </button>
            <button 
              onClick={() => setActiveFilterTab('text')}
              className={`kb-filter-tab ${activeFilterTab === 'text' ? 'active' : ''}`}
            >
              Manual Text
            </button>
            <button 
              onClick={() => setActiveFilterTab('url')}
              className={`kb-filter-tab ${activeFilterTab === 'url' ? 'active' : ''}`}
            >
              Links
            </button>
            <button 
              onClick={() => setActiveFilterTab('pdf')}
              className={`kb-filter-tab ${activeFilterTab === 'pdf' ? 'active' : ''}`}
            >
              PDFs
            </button>
          </div>
        </div>
      )}

      {/* Documents Grid / Main Section */}
      {loading ? (
        <PremiumProgressLoader message="Loading Knowledge Base" active={loading} />
      ) : documents.length === 0 ? (
        <div style={{ background: 'var(--bg-surface)', padding: '5rem 2rem', textAlign: 'center', borderRadius: '16px', border: '2px dashed var(--border-light)' }}>
          <div style={{ background: 'rgba(37, 99, 235, 0.05)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: 'var(--accent-color)' }}>
            <Database size={40} />
          </div>
          <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.4rem', fontWeight: 600 }}>Knowledge Base is Empty</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: '460px', margin: '0 auto 2rem', fontSize: '0.95rem', lineHeight: 1.5 }}>
            Add PDFs, manuals, text rules, or website URLs to train your AI assistant on your business data.
          </p>
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="btn-primary" 
            style={{ padding: '0.65rem 1.5rem', borderRadius: '8px', margin: '0 auto' }}
          >
            Add First Document
          </button>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div style={{ background: 'var(--bg-surface)', padding: '4rem 2rem', textAlign: 'center', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
          <Search size={36} color="var(--text-secondary)" style={{ marginBottom: '1rem' }} />
          <h4 style={{ color: 'var(--text-primary)', margin: '0 0 0.25rem 0' }}>No results found</h4>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>We couldn't find any documents matching your criteria.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {filteredDocuments.map(doc => (
            <div key={doc.id} className="kb-card">
              <div style={{ padding: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <div className={`kb-icon-container ${doc.type}`}>
                  {doc.type === 'url' ? <Globe size={20} /> : doc.type === 'pdf' ? <File size={20} /> : <FileText size={20} />}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                      <span className={`kb-badge ${doc.type}`}>
                        {doc.type === 'url' ? 'Link' : doc.type === 'pdf' ? 'PDF' : 'Text'}
                      </span>
                      <span className={`kb-badge`} style={{ 
                        background: doc.visibility === 'public' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(107, 114, 128, 0.08)',
                        color: doc.visibility === 'public' ? '#10b981' : '#6b7280'
                      }}>
                        {doc.visibility === 'public' ? 'Public' : 'Internal'}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {new Date(doc.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={doc.title}>
                    {doc.title}
                  </h4>
                </div>
              </div>
              
              <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                  {doc.type === 'url' 
                    ? "Scraped web page content. Useful for product info, company history, and online FAQs." 
                    : doc.type === 'pdf' 
                      ? "Extracted PDF text document. Ideal for manuals, catalogs, and extensive company brochures." 
                      : "Contains manual instructions & custom rules defined by admin."}
                </p>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: '#10b981', fontWeight: 500 }}>
                    <span className="kb-pulse-dot"></span> Indexed & Active
                  </div>
                </div>
              </div>

              <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', background: 'rgba(0,0,0,0.01)' }}>
                <button 
                  onClick={() => openViewModal(doc)}
                  className="kb-action-btn view"
                  title="View Content"
                >
                  <Eye size={14} /> View
                </button>
                <button 
                  onClick={() => openEditModal(doc)}
                  className="kb-action-btn edit"
                  title="Edit"
                >
                  <Edit3 size={14} /> Edit
                </button>
                <button 
                  onClick={() => handleDelete(doc.id)}
                  className="kb-action-btn delete"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Modal */}
      {isViewModalOpen && viewingDoc && (
        <div className="kb-modal-overlay">
          <div className="kb-modal-content" style={{ maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className={`kb-icon-container ${viewingDoc.type}`} style={{ padding: '0.5rem' }}>
                  {viewingDoc.type === 'url' ? <Globe size={18} /> : viewingDoc.type === 'pdf' ? <File size={18} /> : <FileText size={18} />}
                </div>
                <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)' }}>{viewingDoc.title}</h3>
              </div>
              <button onClick={() => setIsViewModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1, padding: '1.25rem', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)', whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: '1.55', color: 'var(--text-primary)' }}>
              {viewingDoc.content ? viewingDoc.content : <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)'}}><Loader2 size={16} className="spin"/> Loading content...</div>}
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-light)' }}>
              <button 
                onClick={() => setIsViewModalOpen(false)} 
                style={{ padding: '0.5rem 1.25rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-primary)' }}
              >
                Close
              </button>
              <button 
                onClick={() => { setIsViewModalOpen(false); openEditModal(viewingDoc); }} 
                className="btn-primary" 
                style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', fontSize: '0.9rem' }}
              >
                Edit Content
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="kb-modal-overlay">
          <div className="kb-modal-content" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', pb: '1rem', borderBottom: '1px solid var(--border-light)' }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {viewingDoc ? 'Edit Document' : 'Add Knowledge Document'}
              </h3>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Document Title</label>
                <input 
                  type="text" 
                  value={docTitle} 
                  onChange={e => setDocTitle(e.target.value)}
                  placeholder="e.g. Sales Script 2026, Company Policy"
                  style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', outline: 'none', fontSize: '0.9rem' }} 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Document Visibility</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div 
                    onClick={() => setDocVisibility('internal')}
                    className={`kb-selector-card ${docVisibility === 'internal' ? 'active' : ''}`}
                    style={{ padding: '0.75rem', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}
                  >
                    <Eye size={18} style={{ color: 'var(--text-secondary)' }} />
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Internal</div>
                  </div>
                  <div 
                    onClick={() => setDocVisibility('public')}
                    className={`kb-selector-card ${docVisibility === 'public' ? 'active' : ''}`}
                    style={{ padding: '0.75rem', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}
                  >
                    <Globe size={18} style={{ color: '#10b981' }} />
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Public</div>
                  </div>
                </div>
              </div>

              {!viewingDoc && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Source Type</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                    <div 
                      onClick={() => setDocType('text')}
                      className={`kb-selector-card ${docType === 'text' ? 'active' : ''}`}
                    >
                      <FileText size={24} style={{ color: '#2563eb', marginBottom: '0.5rem' }} />
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Manual Text</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Paste rules directly</div>
                    </div>
                    <div 
                      onClick={() => setDocType('url')}
                      className={`kb-selector-card ${docType === 'url' ? 'active' : ''}`}
                    >
                      <Globe size={24} style={{ color: '#06b6d4', marginBottom: '0.5rem' }} />
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Website URL</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Scrape web content</div>
                    </div>
                    <div 
                      onClick={() => setDocType('pdf')}
                      className={`kb-selector-card ${docType === 'pdf' ? 'active' : ''}`}
                    >
                      <File size={24} style={{ color: '#8b5cf6', marginBottom: '0.5rem' }} />
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>PDF Upload</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Extract PDF content</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Notice when editing documents */}
              {viewingDoc && (
                <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={16} />
                  <span>
                    Editing <strong>{docType.toUpperCase()}</strong> type document. Edit the title and actual text contents below.
                  </span>
                </div>
              )}

              {/* Type specific fields */}
              {(docType === 'text' || viewingDoc) && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Knowledge Text / Rules</label>
                  <textarea 
                    value={docContent} 
                    onChange={e => setDocContent(e.target.value)}
                    placeholder="Paste your text content here. The AI will read this to answer queries..."
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', minHeight: '200px', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.5, outline: 'none' }} 
                  />
                </div>
              )}

              {!viewingDoc && docType === 'url' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Website URL</label>
                  <input 
                    type="url" 
                    value={docUrl} 
                    onChange={e => setDocUrl(e.target.value)}
                    placeholder="https://example.com/about-us"
                    style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', outline: 'none', fontSize: '0.9rem' }} 
                  />
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: 1.3 }}>The system will automatically scrape text from this URL and index it for your AI assistant.</p>
                </div>
              )}

              {!viewingDoc && docType === 'pdf' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Upload PDF File</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="file" 
                      accept=".pdf"
                      onChange={e => setDocFile(e.target.files[0])}
                      style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', outline: 'none', fontSize: '0.9rem' }} 
                    />
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: 1.3 }}>Upload a PDF containing your company rules, catalog descriptions or pamphlets.</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-light)' }}>
              <button 
                onClick={() => { setIsModalOpen(false); resetForm(); }}
                disabled={savingDoc}
                style={{ padding: '0.55rem 1.25rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-primary)' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveDocument}
                disabled={savingDoc}
                className="btn-primary"
                style={{ padding: '0.55rem 1.5rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}
              >
                {savingDoc ? <><Loader2 size={16} className="spin"/> Saving...</> : viewingDoc ? 'Update Knowledge' : 'Save Knowledge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

