'use client';

import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import ErrorBoundary from './ErrorBoundary';

const desktopQuery = '(min-width: 769px)';
const subscribeDesktop = (onChange) => {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};
const getDesktopSnapshot = () => window.matchMedia(desktopQuery).matches;
const getServerSnapshot = () => false;

function FloatingSubmenu({ trigger, submenu }) {
  const [position, setPosition] = useState(null);
  const wrapperRef = useRef(null);
  const panelRef = useRef(null);
  const closeTimerRef = useRef(null);
  const skipFocusRef = useRef(false);
  const panelId = useId();
  const label = trigger.props.title || 'Navigation';

  const cancelClose = () => {
    clearTimeout(closeTimerRef.current);
  };

  const close = () => {
    cancelClose();
    setPosition(null);
  };

  const open = () => {
    cancelClose();
    try {
      const button = wrapperRef.current?.querySelector('.nav-item');
      if (!button) return false;
      const rect = button.getBoundingClientRect();
      const width = Math.min(280, window.innerWidth - 24);
      const above = rect.top > window.innerHeight / 2;
      const offset = Math.max(12, above ? window.innerHeight - rect.bottom : rect.top);
      document.dispatchEvent(new CustomEvent('crm-sidebar-submenu-open', { detail: panelId }));
      setPosition({
        left: Math.max(12, Math.min(rect.right + 8, window.innerWidth - width - 12)),
        width,
        top: above ? undefined : offset,
        bottom: above ? offset : undefined,
        maxHeight: Math.min(480, window.innerHeight - offset - 12),
      });
      return true;
    } catch {
      // The original trigger can still expand the sidebar if positioning fails.
      return false;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setPosition(null), 180);
  };

  const containsTarget = (target) => target instanceof Node && (
    wrapperRef.current?.contains(target) || panelRef.current?.contains(target)
  );

  const handleBlur = (event) => {
    if (!containsTarget(event.relatedTarget)) scheduleClose();
  };

  const restoreTriggerFocus = () => {
    const button = wrapperRef.current?.querySelector('.nav-item');
    if (button && document.activeElement !== button) {
      skipFocusRef.current = true;
      button.focus();
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      restoreTriggerFocus();
    } else if (event.key === 'ArrowDown' && event.target.classList.contains('nav-item')) {
      event.preventDefault();
      if (open()) {
        requestAnimationFrame(() => panelRef.current?.querySelector('button')?.focus());
      }
    }
  };

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  useEffect(() => {
    if (!position) return;
    const dismiss = () => setPosition(null);
    const handleOutside = (event) => {
      if (!containsTarget(event.target)) dismiss();
    };
    const handleScroll = (event) => {
      if (!panelRef.current?.contains(event.target)) dismiss();
    };
    const handleOtherMenu = (event) => {
      if (event.detail !== panelId) dismiss();
    };
    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('crm-sidebar-submenu-open', handleOtherMenu);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('crm-sidebar-submenu-open', handleOtherMenu);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [position, panelId]);

  return (
    <div
      ref={wrapperRef}
      className="nav-item-wrapper"
      style={{ position: 'relative' }}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      onFocus={(event) => {
        cancelClose();
        if (skipFocusRef.current) {
          skipFocusRef.current = false;
        } else if (event.target.classList.contains('nav-item')) {
          open();
        }
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <button
        {...trigger.props}
        aria-label={label}
        aria-expanded={Boolean(position)}
        aria-controls={position ? panelId : undefined}
        onClick={(event) => {
          if (!open()) trigger.props.onClick?.(event);
        }}
      />
      {position && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-label={`${label} submenu`}
          className="sidebar-submenu-popover"
          style={position}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onFocus={cancelClose}
          onBlur={handleBlur}
          onClick={(event) => {
            if (event.target.closest('.submenu-item')) close();
          }}
        >
          <div className="sidebar-submenu-title">{label}</div>
          {submenu.props.children}
        </div>,
        document.body,
      )}
    </div>
  );
}

function SidebarSubmenuContent({ collapsed, children }) {
  const desktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getServerSnapshot);
  const items = React.Children.toArray(children);
  const trigger = items.find(item => React.isValidElement(item) && item.type === 'button' && item.props.className === 'nav-item');
  const submenu = items.find(item => React.isValidElement(item) && item.props.className?.split(' ').includes('submenu-list'));

  if (collapsed && desktop && trigger && submenu) {
    return <FloatingSubmenu trigger={trigger} submenu={submenu} />;
  }

  return <div className="nav-item-wrapper" style={{ position: 'relative' }}>{children}</div>;
}

export default function SidebarSubmenu(props) {
  return (
    <ErrorBoundary fallback={<div className="nav-item-wrapper" style={{ position: 'relative' }}>{props.children}</div>}>
      <SidebarSubmenuContent {...props} />
    </ErrorBoundary>
  );
}
