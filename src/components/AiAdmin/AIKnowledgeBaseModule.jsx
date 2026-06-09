import React, { useState, useEffect } from 'react';
import { BookOpen, Upload, FileText, Link as LinkIcon, Trash2, Edit3, Plus, Search, File, Database, Check, Loader2 } from 'lucide-react';

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
      if (viewingDoc && viewingDoc.id) {
        // Since there is no UPDATE endpoint yet, we can delete and re-insert for now
        await fetch(`/api/ai/knowledge?id=${viewingDoc.id}`, { method: 'DELETE' });
      }

      const formData = new FormData();
      formData.append('title', docTitle);
      formData.append('type', docType);
      
      if (docType === 'text') formData.append('content', docContent);
      if (docType === 'url') formData.append('url', docUrl);
      if (docType === 'pdf') formData.append('file', docFile);

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
        const data = await res.json();
        alert("Failed to save: " + data.error);
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
    setDocType('text');
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
    setViewingDoc(null);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.8rem', color: 'var(--text-primary)' }}>
            <BookOpen size={30} color="var(--accent-color)" />
            AI Knowledge Base (RAG)
          </h1>
          <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)' }}>
            Upload documents, rules, and data that the Swan AI assistant should learn from.
          </p>
        </div>
        
        <button 
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="btn-primary" 
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px' }}
        >
          <Plus size={18} /> Add Knowledge
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Loader2 size={32} className="spin" style={{ marginBottom: '1rem', color: 'var(--accent-color)' }} />
          <div>Loading knowledge base...</div>
        </div>
      ) : documents.length === 0 ? (
        <div style={{ background: 'var(--bg-surface)', padding: '4rem 2rem', textAlign: 'center', borderRadius: '12px', border: '1px dashed var(--border-light)' }}>
          <Database size={48} color="var(--border-light)" style={{ marginBottom: '1rem' }} />
          <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Knowledge Base is Empty</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            Add PDFs, text rules, or website URLs to train your AI assistant on your business data.
          </p>
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="btn-primary" 
            style={{ padding: '0.5rem 1rem', borderRadius: '6px' }}
          >
            Add First Document
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {documents.map(doc => (
            <div key={doc.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', background: 'var(--bg-surface)', borderRadius: '8px', color: 'var(--accent-color)' }}>
                  <FileText size={24} />
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title}</h4>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Type: TEXT</div>
                </div>
              </div>
              <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-surface)', flex: 1 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  Added: {new Date(doc.created_at).toLocaleDateString()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#10b981' }}>
                  <Check size={14} /> Indexed & Active
                </div>
              </div>
              <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button 
                  onClick={() => openViewModal(doc)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <Search size={14} /> View
                </button>
                <button 
                  onClick={() => openEditModal(doc)}
                  style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <Edit3 size={14} /> Edit
                </button>
                <button 
                  onClick={() => handleDelete(doc.id)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Modal */}
      {isViewModalOpen && viewingDoc && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '2rem' }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.4rem' }}>{viewingDoc.title}</h3>
              <button onClick={() => setIsViewModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1, padding: '1rem', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)', whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: '1.5' }}>
              {viewingDoc.content ? viewingDoc.content : <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}><Loader2 size={16} className="spin"/> Loading content...</div>}
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button onClick={() => { setIsViewModalOpen(false); openEditModal(viewingDoc); }} className="btn-primary" style={{ padding: '0.5rem 1.5rem', borderRadius: '6px' }}>Edit Content</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '2rem' }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.4rem' }}>{viewingDoc ? 'Edit Document' : 'Add Knowledge Document'}</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Document Title</label>
                <input 
                  type="text" 
                  value={docTitle} 
                  onChange={e => setDocTitle(e.target.value)}
                  placeholder="e.g. Sales Script 2026, Company Policy"
                  style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Source Type</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input type="radio" name="type" checked={docType === 'text'} onChange={() => setDocType('text')} /> Manual Text
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input type="radio" name="type" checked={docType === 'url'} onChange={() => setDocType('url')} /> Website URL
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input type="radio" name="type" checked={docType === 'pdf'} onChange={() => setDocType('pdf')} /> PDF Upload
                  </label>
                </div>
              </div>

              {docType === 'text' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Knowledge Text / Rules</label>
                  <textarea 
                    value={docContent} 
                    onChange={e => setDocContent(e.target.value)}
                    placeholder="Paste your text content here. The AI will read this to answer queries..."
                    style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)', minHeight: '200px', resize: 'vertical', fontFamily: 'inherit' }} 
                  />
                </div>
              )}

              {docType === 'url' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Website URL</label>
                  <input 
                    type="url" 
                    value={docUrl} 
                    onChange={e => setDocUrl(e.target.value)}
                    placeholder="https://example.com/about-us"
                    style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>The system will automatically scrape text from this URL and save it.</p>
                </div>
              )}

              {docType === 'pdf' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Upload PDF File</label>
                  <input 
                    type="file" 
                    accept=".pdf"
                    onChange={e => setDocFile(e.target.files[0])}
                    style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Upload a PDF containing your company rules or brochures.</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-light)' }}>
              <button 
                onClick={() => { setIsModalOpen(false); resetForm(); }}
                disabled={savingDoc}
                style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveDocument}
                disabled={savingDoc}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
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
