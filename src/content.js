function openlink(element, event, url) {
    if (element.target === '_blank' || event.ctrlKey || event.metaKey) {
        window.open(url, '_blank');
    } else {
        window.location.href = url;
    }
}

(function () {
    'use strict';

    let activeTooltip = null;

    // In-memory allowlist (Set for fast lookup)
    let allowlistSet = new Set();

    // Storage key for fallbacks
    const STORAGE_KEY = 'linkGuardianAllowlist';

    // Try to load allowlist from chrome.storage (sync), fall back to localStorage
    function loadAllowlist() {
        // If chrome.storage is available (extension context)
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            try {
                chrome.storage.sync.get([STORAGE_KEY], (result) => {
                    if (chrome.runtime.lastError) {
                        // fallback to localStorage on error
                        loadAllowlistFromLocalStorage();
                        return;
                    }
                    const arr = result[STORAGE_KEY];
                    if (Array.isArray(arr)) {
                        allowlistSet = new Set([...DEFAULT_ALLOWLIST, ...arr]);
                    } else {
                        allowlistSet = new Set(DEFAULT_ALLOWLIST);
                    }
                });
                return;
            } catch (e) {
                // fallthrough to localStorage fallback
            }
        }

        loadAllowlistFromLocalStorage();
    }

    function loadAllowlistFromLocalStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    allowlistSet = new Set([...DEFAULT_ALLOWLIST, ...arr]);
                    return;
                }
            }
        } catch (e) {
            // ignore parse errors
        }
        allowlistSet = new Set(DEFAULT_ALLOWLIST);
    }

    // Persist allowlist entries (only the user-added ones) to storage
    function saveAllowlist(userAddedArray) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            try {
                const payload = {};
                payload[STORAGE_KEY] = userAddedArray;
                chrome.storage.sync.set(payload, () => {
                    // ignore errors; runtime.lastError would indicate issues
                });
                return;
            } catch (e) {
                // fall through to localStorage
            }
        }

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userAddedArray));
        } catch (e) {
            // ignore localStorage errors
        }
    }

    // Helper to check if hostname is in allowlist (including subdomains)
    function isAllowed(hostname) {
        // Exact match or allow if it ends with '.' + allowed
        for (const allowed of allowlistSet) {
            if (hostname === allowed || hostname.endsWith('.' + allowed)) {
                return true;
            }
        }
        return false;
    }

    // Add a hostname (including subdomain) to the allowlist and persist it
    function addToAllowlist(hostname) {
        if (!hostname) return;
        // If hostname already allowed, do nothing
        if (isAllowed(hostname)) return;

        // Persist the user-added values separately (we store only additions, not defaults)
        // Read existing user-added list from storage, append if missing, then save
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            try {
                chrome.storage.sync.get([STORAGE_KEY], (result) => {
                    const arr = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY].slice() : [];
                    if (!arr.includes(hostname)) {
                        arr.push(hostname);
                        saveAllowlist(arr);
                        // Update in-memory set
                        allowlistSet.add(hostname);
                    }
                });
                return;
            } catch (e) {
                // fall through to localStorage flow
            }
        }

        // LocalStorage flow
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            if (!arr.includes(hostname)) {
                arr.push(hostname);
                saveAllowlist(arr);
                allowlistSet.add(hostname);
            }
        } catch (e) {
            // ignore
            allowlistSet.add(hostname);
        }
    }

    // Function to extract hostname from URL
    function getHostname(url) {
        try {
            const link = new URL(url, window.location.href);
            return link.hostname;
        } catch (e) {
            return url;
        }
    }

    // Function to create and show tooltip
    function showTooltip(element, url, event) {
        // Remove any existing tooltip
        removeTooltip();

        const hostname = getHostname(url);
        const currentHost = window.location.hostname;

        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'link-guardian-tooltip';
        tooltip.innerHTML = `
            <div class="tooltip-header">Link Destination</div>
            <div class="tooltip-url">${hostname}</div>
            <div class="tooltip-warning" style="display:none;">⚠️ Unverified link ⚠️</div>
            <div class="tooltip-buttons">
                <button class="tooltip-btn proceed">Visit Site</button>
                <button class="tooltip-btn allow">Allow domain</button>
                <button class="tooltip-btn cancel">Cancel</button>
            </div>
        `;

        // Add warning for external links
        if (
            hostname !== currentHost &&
            !isAllowed(hostname)
        ) {
            tooltip.classList.add('external-link');
            const warning = tooltip.querySelector('.tooltip-warning');
            if (warning) {
                warning.style.display = 'block';
            }

            document.body.appendChild(tooltip);

            // Position tooltip above the clicked element
            const rect = element.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();

            let top = rect.top + window.scrollY - tooltipRect.height - 10;
            let left = rect.left + window.scrollX + (rect.width / 2) - (tooltipRect.width / 2);

            // Adjust position if tooltip would go off screen
            if (top < window.scrollY) {
                top = rect.bottom + window.scrollY + 10;
            }
            if (left < 0) {
                left = 10;
            }
            if (left + tooltipRect.width > window.innerWidth) {
                left = window.innerWidth - tooltipRect.width - 10;
            }

            tooltip.style.top = top + 'px';
            tooltip.style.left = left + 'px';

            activeTooltip = tooltip;

            // Add event listeners to buttons
            const proceedBtn = tooltip.querySelector('.proceed');
            const cancelBtn = tooltip.querySelector('.cancel');
            const allowBtn = tooltip.querySelector('.allow');

            proceedBtn.addEventListener('click', () => {
                removeTooltip();
                // Navigate to the URL
                openlink(element, event, url);
            });

            cancelBtn.addEventListener('click', () => {
                removeTooltip();
            });

            allowBtn.addEventListener('click', () => {
                // Add hostname (including subdomain) to allowlist and persist
                addToAllowlist(hostname);
                removeTooltip();
                // After allowing, navigate
                openlink(element, event, url);
            });

            // Close tooltip when clicking outside
            setTimeout(() => {
                document.addEventListener('click', outsideClickHandler);
            }, 0);

        } else {
            openlink(element, event, url);
        }
    }

    // Function to remove tooltip
    function removeTooltip() {
        if (activeTooltip) {
            activeTooltip.remove();
            activeTooltip = null;
            document.removeEventListener('click', outsideClickHandler);
        }
    }

    // Handle clicks outside tooltip
    function outsideClickHandler(event) {
        if (activeTooltip && !activeTooltip.contains(event.target)) {
            removeTooltip();
        }
    }

    // Function to handle link clicks
    function handleLinkClick(event) {
        const element = event.target.closest('a');
        if (!element) return;

        // Only process links within Gmail email content
        const emailBody = element.closest('[role="listitem"]') ||
            element.closest('.ii.gt') ||
            element.closest('[data-message-id]') ||
            element.closest('.adn.ads'); // Gmail email content selectors

        if (!emailBody) {
            return; // Allow normal behavior for Gmail UI links
        }

        const href = element.href;
        if (!href || href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:')) {
            return; // Allow normal behavior for these types of links
        }

        // Prevent default navigation
        event.preventDefault();
        event.stopPropagation();

        // Show tooltip
        showTooltip(element, href, event);
    }

    // Wait for Gmail to load before attaching listeners
    function initializeExtension() {
        // Check if we're actually in Gmail
        if (!window.location.hostname.includes('mail.google.com')) {
            return;
        }

        // Load allowlist from storage
        loadAllowlist();

        // Listen for changes to storage so allowlist updates dynamically when popup modifies it
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            try {
                chrome.storage.onChanged.addListener((changes, area) => {
                    if ((area === 'sync' || area === 'local') && changes[STORAGE_KEY]) {
                        const newArr = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
                        allowlistSet = new Set([...DEFAULT_ALLOWLIST, ...newArr]);
                    }
                });
            } catch (e) {
                // ignore
            }
        }

        // Add click event listener to document
        document.addEventListener('click', handleLinkClick, true);

        // Handle keyboard shortcuts (Escape to close tooltip)
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && activeTooltip) {
                removeTooltip();
            }
        });

        // Clean up when page is unloaded
        window.addEventListener('beforeunload', () => {
            removeTooltip();
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeExtension);
    } else {
        initializeExtension();
    }

})();