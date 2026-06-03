import React from 'react';

export default function MessageLogs({ userId, isAdmin }) {
  return (
    <div className="card" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
      <h2>Message Logs</h2>
      <p>View webhook events and send logs here.</p>
    </div>
  );
}
