'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getNotificationPresentation, requiresNotificationResponse, resolveNotificationSize } from '@/utils/notificationPresentation';
import styles from './NotificationPresentation.module.css';

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

export default function NotificationPresentation({ notification, children, preview = false, mobile = false, onClose }) {
  const config = getNotificationPresentation(notification);
  const placement = config.placement_style;
  const blocking = ['center_modal', 'right_drawer', 'full_screen'].includes(placement);
  const dismissible = !requiresNotificationResponse(notification);
  const banner = ['top_banner', 'bottom_banner'].includes(placement);
  const [expanded, setExpanded] = useState(false);
  const [insets, setInsets] = useState(null);
  const frameRef = useRef(null);

  // Observe layout only while a live notification is present. Never change shell/widget state.
  useEffect(() => {
    if (preview) return;
    let raf = 0;
    const controls = [...document.querySelectorAll('.react-draggable[data-minimized], [aria-label="Open CRM Softphone"]')];
    const main = document.querySelector('.main-content');
    const header = document.querySelector('.top-header');
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        const width = viewport?.width || window.innerWidth;
        const height = viewport?.height || window.innerHeight;
        const mainRect = main?.getBoundingClientRect();
        const headerBottom = Math.max(0, header?.getBoundingClientRect().bottom || 60);
        const left = Math.max(0, mainRect?.left || 0);
        const availableWidth = width - left;
        let reserveBottom = 16;
        let reserveRight = 16;
        let reserveTop = 16;
        const frameHeight = frameRef.current?.getBoundingClientRect().height || 260;
        for (const control of controls) {
          const rect = control.getBoundingClientRect();
          if (!rect.width || !rect.height || rect.left >= width || rect.top >= height) continue;
          const nearRight = rect.right > width - Math.min(480, availableWidth);
          if (!nearRight) continue;
          const intersectsBottom = rect.bottom > height - frameHeight - 20;
          const intersectsTop = rect.top < headerBottom + frameHeight + 24;
          if ((placement === 'bottom_right' && intersectsBottom) || (placement === 'top_right' && intersectsTop)) {
            if (rect.left - left > Math.min(440, availableWidth) + 24) reserveRight = Math.max(reserveRight, width - rect.left + 12);
            else if (placement === 'bottom_right') reserveBottom = Math.max(reserveBottom, height - rect.top + 12);
            else reserveTop = Math.max(reserveTop, rect.bottom - headerBottom + 12);
          }
          if (placement === 'bottom_banner' && intersectsBottom) reserveBottom = Math.max(reserveBottom, height - rect.top + 12);
        }
        const next = {
          '--nt-live-top': `${headerBottom}px`, '--nt-live-left': `${left}px`,
          '--nt-reserve-bottom': `${Math.min(reserveBottom, Math.max(16, height - headerBottom - 140))}px`,
          '--nt-reserve-right': `${reserveRight}px`,
          '--nt-reserve-top': `${Math.min(reserveTop, Math.max(16, height - headerBottom - 140))}px`
        };
        setInsets(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      });
    };
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    [main, header, frameRef.current, ...controls].filter(Boolean).forEach(node => resizeObserver?.observe(node));
    const mutations = typeof MutationObserver !== 'undefined' ? new MutationObserver(update) : null;
    controls.forEach(node => mutations?.observe(node, { attributes: true, attributeFilter: ['style', 'data-minimized'] }));
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    document.addEventListener('pointerup', update);
    update();
    return () => {
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      mutations?.disconnect();
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      document.removeEventListener('pointerup', update);
    };
  }, [preview, placement]);

  useEffect(() => {
    if (preview || !blocking || !frameRef.current) return;
    const frame = frameRef.current;
    const previous = document.activeElement;
    const focusable = () => [...frame.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0);
    const focusFirst = () => (focusable()[0] || frame).focus({ preventScroll: true });
    focusFirst();
    const keydown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (dismissible) onClose?.();
      }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      if (!nodes.length) { event.preventDefault(); frame.focus(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === frame)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    const focusin = event => { if (!frame.contains(event.target)) focusFirst(); };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      if (previous?.isConnected && typeof previous.focus === 'function') previous.focus({ preventScroll: true });
    };
  }, [preview, blocking, dismissible, onClose]);

  return <div
    className={styles.layer}
    data-preview-placement={preview ? placement : undefined}
    data-notification-placement={placement}
    data-preview={preview}
    data-mobile={mobile}
    data-blocking={blocking}
    data-size={resolveNotificationSize(notification)}
    data-animation={config.entry_animation}
    data-expanded={expanded}
    style={{ ...insets, '--nt-duration': `${config.animation_duration}ms` }}
  >
    {blocking && <div className={styles.backdrop} data-preview-backdrop={preview ? '' : undefined} onClick={() => { if (dismissible) onClose?.(); }} />}
    <div ref={frameRef} className={styles.frame} role={blocking ? placement === 'full_screen' ? 'alertdialog' : 'dialog' : undefined} aria-modal={blocking && !preview ? true : undefined} aria-label={blocking ? notification.title || 'Workspace notification' : undefined} tabIndex={blocking ? -1 : undefined}>
      <div className={styles.content} data-preview-notification={preview ? '' : undefined}>{children}</div>
      {banner && String(notification.message || '').length > 180 && <button className={styles.expandMessage} type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{expanded ? 'Collapse message' : 'Expand message'}</button>}
    </div>
  </div>;
}
