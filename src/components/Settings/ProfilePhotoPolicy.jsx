'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import NextImage from 'next/image';
import { getProfilePhotoPolicy, saveProfilePhotoPolicy } from '@/app/actions/userProfile';

const fieldStyle = { width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)',
  background: 'var(--bg-surface)', color: 'var(--text-primary)' };

async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error('Select a JPG, PNG or WEBP image smaller than 10MB.');
  }
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read this photo.'));
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not open this photo.'));
    img.src = source;
  });
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo preview is unavailable. Please try another browser.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 256, 256);
  const size = Math.min(image.width, image.height);
  context.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 256, 256);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export default function ProfilePhotoPolicy() {
  const [scope, setScope] = useState({ tenantCode: '', branchCode: '' });
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({ mode: 'individual', inherit: false, base64: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const requestRef = useRef(0);
  const uploadRef = useRef(null);
  const pendingRef = useRef(false);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const result = await getProfilePhotoPolicy(scope);
      if (request !== requestRef.current) return;
      if (!result.success) {
        if (result.error === 'Only an administrator can change profile photo policy.') { setHidden(true); return; }
        throw new Error(result.error || 'Could not load photo settings.');
      }
      setData(result);
      setDraft({ ...result.policy, base64: '' });
      if (uploadRef.current) uploadRef.current.value = '';
    } catch (err) {
      if (request === requestRef.current) { setData(null); setError(err.message || 'Could not load photo settings.'); }
    } finally { if (request === requestRef.current) setLoading(false); }
  }, [scope]);

  useEffect(() => {
    // Defer this secondary settings request until the initial screen has painted.
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); requestRef.current += 1; };
  }, [load]);

  const selectScope = next => {
    requestRef.current += 1;
    setLoading(true);
    setError('');
    setMessage('');
    setDraft({ mode: 'individual', inherit: false, base64: '' });
    if (uploadRef.current) uploadRef.current.value = '';
    setScope(next);
  };

  const reload = () => { setLoading(true); setError(''); setMessage(''); void load(); };

  const selectPhoto = async event => {
    const file = event.target.files?.[0];
    if (!file || pendingRef.current) return;
    const request = requestRef.current;
    setPreparing(true);
    setError('');
    try {
      const base64 = await preparePhoto(file);
      if (request === requestRef.current) setDraft(previous => ({ ...previous, base64 }));
    } catch (err) { if (request === requestRef.current) setError(err.message || 'Could not prepare photo.'); }
    finally { setPreparing(false); }
  };

  const save = async () => {
    if (!data?.ready || loading || preparing || pendingRef.current) return;
    pendingRef.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await saveProfilePhotoPolicy({ tenantCode: data.tenantCode, branchCode: data.branchCode,
        mode: draft.mode, inherit: draft.inherit, base64: draft.base64, revision: data.revision });
      if (!result.success) throw new Error(result.error || 'Could not save photo settings.');
      await load();
      setMessage('Profile photo policy saved. Personal photos have been preserved.');
      window.dispatchEvent(new CustomEvent('crm-profile-photo-policy-updated'));
    } catch (err) { setError(err.message || 'Could not save photo settings.'); }
    finally { pendingRef.current = false; setSaving(false); }
  };

  if (hidden) return null;
  const disabled = loading || saving || preparing || !data?.ready;
  const inherit = Boolean(data?.branchCode && draft.inherit);
  const preview = inherit ? data?.companyDefault?.avatarUrl : draft.base64 || draft.avatarUrl || data?.companyDefault?.avatarUrl;

  return (
    <section aria-label="Profile photo policy" style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
      <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Profile Photo / DP Policy</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Choose a common DP or allow personal photos for each company and branch.</p>
      {loading && <p role="status">Loading photo settings…</p>}
      {error && <p role="alert" style={{ color: '#dc2626' }}>{error} <button type="button" disabled={saving || loading} onClick={reload}>Reload settings</button></p>}
      {message && <p role="status" style={{ color: '#15803d' }}>{message}</p>}
      {data && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <label>Company / Tenant
            <select aria-label="DP company" value={data.tenantCode} disabled={loading || saving || preparing} style={fieldStyle}
              onChange={event => selectScope({ tenantCode: event.target.value, branchCode: '' })}>
              {data.tenants.map(tenant => <option key={tenant.code} value={tenant.code}>{tenant.code} — {tenant.name}</option>)}
            </select>
          </label>
          <label>Branch / Plant
            <select aria-label="DP branch" value={data.branchCode} disabled={loading || saving || preparing} style={fieldStyle}
              onChange={event => selectScope({ tenantCode: data.tenantCode, branchCode: event.target.value })}>
              <option value="">All Branches (company default)</option>
              {data.branches.map(branch => <option key={branch.code} value={branch.code}>{branch.code} — {branch.name}</option>)}
            </select>
          </label>
        </div>
        {!data.ready && <p role="status" style={{ color: '#b45309' }}>DP policy setup is pending. Apply the scoped profile photos database migration to enable these controls.</p>}
        {data.branchCode && <label style={{ display: 'block', marginBottom: '0.8rem' }}>
          <input type="checkbox" checked={draft.inherit} disabled={disabled} onChange={event => setDraft(previous => ({ ...previous, inherit: event.target.checked }))} /> Use company default
        </label>}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 600 }}>
          <input type="checkbox" role="switch" aria-label="Same DP for everyone" checked={(inherit ? data.companyDefault.mode : draft.mode) === 'shared'}
            disabled={disabled || inherit} onChange={event => setDraft(previous => ({ ...previous, mode: event.target.checked ? 'shared' : 'individual' }))} />
          Same DP for everyone
        </label>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
          {inherit ? 'This branch follows the company default.' : draft.mode === 'shared'
            ? 'Users in this scope will see the common DP. Personal photo changes will be locked.'
            : 'Each user can change their own DP. The common photo is a fallback for users without a personal photo.'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {preview && <NextImage unoptimized src={preview} alt="Common profile photo preview" width={64} height={64} style={{ borderRadius: '50%', objectFit: 'cover' }} />}
          <label>Common DP
            <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || inherit} onChange={selectPhoto} style={{ display: 'block', marginTop: '0.4rem', maxWidth: '100%' }} />
          </label>
          <button type="button" disabled={disabled} onClick={save}
            style={{ padding: '0.6rem 1rem', background: 'var(--accent-color)', color: '#fff', border: 0, borderRadius: '6px', cursor: disabled ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : preparing ? 'Preparing photo…' : 'Save DP Policy'}
          </button>
        </div>
      </>}
    </section>
  );
}
