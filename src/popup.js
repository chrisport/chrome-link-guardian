// popup.js — lists current allowlist and lets the user remove custom entries
(function () {
  'use strict';

  const STORAGE_KEY = 'linkGuardianAllowlist';
  const DEFAULT_ALLOWLIST = [
    'mail.google.com',
    'docs.google.com',
    'calendar.google.com',
    'reddit.com',
    'instagram.com',
    'paypal.de',
  ];

  const statusEl = document.getElementById('status');
  const listEl = document.getElementById('allowlist');
  const clearBtn = document.getElementById('clearAll');
  const closeBtn = document.getElementById('close');

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function loadStored() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        try {
          chrome.storage.sync.get([STORAGE_KEY], (result) => {
            if (chrome.runtime && chrome.runtime.lastError) {
              setStatus('Error reading storage: ' + chrome.runtime.lastError.message);
              resolve([]);
            } else {
              const arr = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
              resolve(arr);
            }
          });
          return;
        } catch (e) {
          setStatus('Storage unavailable');
        }
      } else {
        setStatus('chrome.storage is unavailable in this environment');
      }
      resolve([]);
    });
  }

  function saveStored(arr) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      try {
        const payload = {};
        payload[STORAGE_KEY] = arr;
        chrome.storage.sync.set(payload, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            setStatus('Error saving: ' + chrome.runtime.lastError.message);
          }
        });
        return;
      } catch (e) {
        setStatus('Error saving storage');
      }
    } else {
      setStatus('chrome.storage is unavailable; changes will not persist');
    }
  }

  function renderList(userArr) {
    // merged list: defaults first, then user-added (unique)
    const merged = Array.from(new Set([...DEFAULT_ALLOWLIST, ...userArr]));
    listEl.innerHTML = '';

    if (merged.length === 0) {
      setStatus('No allowed hostnames.');
      return;
    }

    setStatus('Showing ' + merged.length + ' hostnames');

    merged.forEach(host => {
      const li = document.createElement('li');
      const hostSpan = document.createElement('span');
      hostSpan.className = 'hostname';
      hostSpan.textContent = host;

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.gap = '8px';
      right.style.alignItems = 'center';

      if (DEFAULT_ALLOWLIST.includes(host)) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'built-in';
        right.appendChild(badge);
      } else {
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', async () => {
          removeHost(host);
        });
        right.appendChild(removeBtn);
      }

      li.appendChild(hostSpan);
      li.appendChild(right);
      listEl.appendChild(li);
    });
  }

  async function refresh() {
    setStatus('Loading…');
    const userArr = await loadStored();
    renderList(userArr || []);
  }

  async function removeHost(host) {
    const userArr = await loadStored();
    const filtered = (userArr || []).filter(h => h !== host);
    saveStored(filtered);
    // update UI immediately
    renderList(filtered);
  }

  async function clearCustom() {
    saveStored([]);
    renderList([]);
  }

  // Listen for storage changes (e.g., other popup or content script)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if ((area === 'sync' || area === 'local') && changes[STORAGE_KEY]) {
          const newArr = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
          renderList(newArr);
        }
      });
    } catch (e) {
      // ignore
    }
  }

  clearBtn.addEventListener('click', () => {
    if (!confirm('Remove all custom allowlist entries?')) return;
    clearCustom();
  });

  closeBtn.addEventListener('click', () => window.close());

  // initial load
  refresh();

})();
