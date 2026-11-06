const { contextBridge, ipcRenderer } = require('electron');

// Expose Desktop API Bridge
contextBridge.exposeInMainWorld('desktopApp', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  getZoom: () => ipcRenderer.invoke('get-zoom-factor'),
  setZoom: (percent) => ipcRenderer.send('set-zoom-factor', percent),
  onZoomChanged: (callback) => {
    ipcRenderer.on('zoom-changed', (_event, percent) => callback(percent));
  }
});

// React-compatible Native Input Setter (used by password managers like Bitwarden)
function setReactInputValue(input, val) {
  if (!input || val === undefined || val === null) return;
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(input, val);
  } else {
    input.value = val;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Native Desktop Auto-Fill & Credential Persistence Engine
window.addEventListener('DOMContentLoaded', () => {
  let hasAutofilled = false;

  function runAutofill() {
    const emailInput = document.querySelector('input[type="email"]') ||
      document.querySelector('input[placeholder*="company.com"]') ||
      document.querySelector('input[placeholder*="employee@"]') ||
      document.getElementById('login-email');

    const passwordInput = document.querySelector('input[type="password"]') ||
      document.getElementById('login-password');

    if (!emailInput || !passwordInput) return;

    // 1. Try to auto-fill saved credentials once inputs are available
    if (!hasAutofilled) {
      try {
        const saved = localStorage.getItem('spc_saved_credentials');
        if (saved) {
          const { email, password } = JSON.parse(saved);
          if (email && !emailInput.value) {
            setReactInputValue(emailInput, email);
          }
          if (password && !passwordInput.value) {
            setReactInputValue(passwordInput, password);
          }
          if (email && password) {
            hasAutofilled = true;
          }
        }
      } catch (_e) {}
    }

    // 2. Intercept submit / click to automatically save credentials
    const saveCredentialsNow = () => {
      const emailVal = (emailInput.value || '').trim();
      const passVal = passwordInput.value || '';
      if (emailVal && passVal) {
        try {
          localStorage.setItem('spc_saved_credentials', JSON.stringify({
            email: emailVal,
            password: passVal
          }));
        } catch (_e) {}
      }
    };

    if (!emailInput._spcBound) {
      emailInput._spcBound = true;
      const form = emailInput.closest('form');
      if (form) {
        form.addEventListener('submit', saveCredentialsNow);
      }
      passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveCredentialsNow();
      });

      // Also listen on any primary sign-in button
      const buttons = document.querySelectorAll('button');
      buttons.forEach((btn) => {
        const txt = (btn.textContent || '').toLowerCase();
        if (txt.includes('sign in') || txt.includes('login')) {
          btn.addEventListener('click', saveCredentialsNow);
        }
      });
    }
  }

  // Initial check
  runAutofill();

  // Re-check as React renders components dynamically
  const observer = new MutationObserver(() => {
    runAutofill();
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
});
