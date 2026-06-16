"use client";

import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      copied: false 
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleCopyReport = () => {
    const errorStr = this.state.error ? this.state.error.toString() : 'Unknown Error';
    const componentStack = this.state.errorInfo ? this.state.errorInfo.componentStack : 'No component stack trace available';
    
    const report = `### 🚨 CRM CRASH REPORT
- **Error:** ${errorStr}
- **URL:** ${window.location.href}
- **Timestamp:** ${new Date().toLocaleString()}
- **User Agent:** ${navigator.userAgent}

#### 📋 Component Stack Trace:
\`\`\`javascript
${componentStack.trim()}
\`\`\`
`;

    navigator.clipboard.writeText(report).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 3000);
    }).catch(err => {
      console.error('Failed to copy report to clipboard:', err);
      alert('Failed to copy report. Please copy the error details below manually.');
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2.5rem 2rem',
          borderRadius: '16px',
          backgroundColor: '#ffffff',
          border: '1.5px solid #fee2e2',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          margin: '2rem 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          minHeight: '320px',
        }} className="error-boundary-card">
          
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: '#fef2f2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.25rem',
            color: '#ef4444',
            boxShadow: '0 0 0 8px #fff, 0 0 0 10px #fee2e2'
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: '32px', height: '32px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          
          <h3 style={{
            fontSize: '1.35rem',
            fontWeight: '700',
            color: '#0f172a',
            marginBottom: '0.5rem'
          }}>
            This section failed to load
          </h3>
          
          <p style={{
            fontSize: '0.925rem',
            color: '#475569',
            maxWidth: '450px',
            marginBottom: '1.75rem',
            lineHeight: '1.6'
          }}>
            An error occurred while rendering this component. You can reload this section or copy the error report for quick debugging.
          </p>

          {this.state.error && (
            <details style={{
              width: '100%',
              maxWidth: '550px',
              textAlign: 'left',
              marginBottom: '2rem',
              fontSize: '0.825rem',
              backgroundColor: '#f8fafc',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.02)'
            }}>
              <summary style={{ cursor: 'pointer', color: '#475569', fontWeight: '600', outline: 'none', select: 'none' }}>
                🔍 View Technical Error Details
              </summary>
              <pre style={{
                marginTop: '0.75rem',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: '#dc2626',
                backgroundColor: '#fff',
                padding: '0.75rem',
                borderRadius: '6px',
                border: '1px solid #f1f5f9',
                fontFamily: 'Consolas, Monaco, Lucida Console, monospace',
                lineHeight: '1.4'
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo && (
                  <div style={{ marginTop: '0.75rem', borderTop: '1px dashed #e2e8f0', paddingTop: '0.75rem', color: '#64748b' }}>
                    <strong>Component Stack:</strong>
                    <div style={{ maxHeight: '150px', overflowY: 'auto', marginTop: '0.25rem', fontSize: '0.75rem' }}>
                      {this.state.errorInfo.componentStack}
                    </div>
                  </div>
                )}
              </pre>
            </details>
          )}
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              onClick={this.handleCopyReport}
              style={{
                padding: '0.6rem 1.25rem',
                fontSize: '0.875rem',
                borderRadius: '8px',
                backgroundColor: this.state.copied ? '#10b981' : '#0f172a',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease',
                boxShadow: this.state.copied ? '0 4px 12px rgba(16, 185, 129, 0.2)' : '0 4px 12px rgba(15, 23, 42, 0.15)'
              }}
              className="error-btn-copy"
            >
              {this.state.copied ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Copied Report!
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a3.375 3.375 0 00-3.375 3.375v1.875m7.5 0H9m1.5-12h-.008v-.008H10.5v.008zm5.25 9.75h-.008v-.008H15.75v.008zm0-3h-.008v-.008H15.75v.008zm0-3h-.008v-.008H15.75v.008zm-9-4.5h.008v.008H6.75V6.75z" />
                  </svg>
                  Copy Report for AI
                </>
              )}
            </button>

            <button 
              onClick={this.handleRetry}
              style={{
                padding: '0.6rem 1.25rem',
                fontSize: '0.875rem',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                border: '1.5px solid #cbd5e1',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease'
              }}
              className="error-btn-retry"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
