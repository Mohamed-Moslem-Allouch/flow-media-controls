/**
 * Flow — Media Controls for Instagram & Facebook
 * Author: Mohamed Moslem Allouch
 * License: MIT
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation Tabs & Panels
  const tabInstagram = document.getElementById('tabInstagram');
  const tabFacebook = document.getElementById('tabFacebook');
  const tabGeneral = document.getElementById('tabGeneral');
  const panelInstagram = document.getElementById('panelInstagram');
  const panelFacebook = document.getElementById('panelFacebook');
  const panelGeneral = document.getElementById('panelGeneral');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = statusBadge ? statusBadge.querySelector('.status-text') : null;

  // Instagram Toggles
  const toggleScrubberIG = document.getElementById('toggleScrubberIG');
  const toggleScrubberIGStoriesOnly = document.getElementById('toggleScrubberIGStoriesOnly');
  const subRowIGStoriesOnly = document.getElementById('subRowIGStoriesOnly');
  const toggleAutoUnmute = document.getElementById('toggleAutoUnmute');

  // Facebook Toggles
  const toggleScrubberFB = document.getElementById('toggleScrubberFB');

  // Preferences & Floating HUD Toggles
  const toggleBadge = document.getElementById('toggleBadge');
  const toggleMinimized = document.getElementById('toggleMinimized');
  const toggleFloatingTimeline = document.getElementById('toggleFloatingTimeline');

  // Appearance Theme Segmented Buttons
  const themeSegBtns = document.querySelectorAll('.theme-seg-btn');
  let currentTheme = 'auto';

  // Action Buttons
  const btnResetDefaults = document.getElementById('btnResetDefaults');
  const btnResetPos = document.getElementById('btnResetPos');

  /**
   * Theme Application & Immediate Tab Sync
   */
  function applyTheme(theme) {
    currentTheme = theme || 'auto';
    document.documentElement.setAttribute('data-theme', currentTheme);
    themeSegBtns.forEach((btn) => {
      const isActive = btn.dataset.theme === currentTheme;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
  }

  themeSegBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const selectedTheme = btn.dataset.theme;
      applyTheme(selectedTheme);
      chrome.storage.local.set({ theme: selectedTheme }).catch(() => {});
      notifyContentScriptOptions({ theme: selectedTheme });
    });
  });

  /**
   * Accessible Tab Switching
   */
  function switchCategoryTab(platform) {
    const tabs = [
      { btn: tabInstagram, panel: panelInstagram, id: 'instagram' },
      { btn: tabFacebook, panel: panelFacebook, id: 'facebook' },
      { btn: tabGeneral, panel: panelGeneral, id: 'general' }
    ];

    tabs.forEach(({ btn, panel, id }) => {
      const match = id === platform;
      if (btn) {
        btn.classList.toggle('active', match);
        btn.setAttribute('aria-selected', match ? 'true' : 'false');
      }
      if (panel) {
        panel.classList.toggle('active', match);
      }
    });
  }

  if (tabInstagram) tabInstagram.addEventListener('click', () => switchCategoryTab('instagram'));
  if (tabFacebook) tabFacebook.addEventListener('click', () => switchCategoryTab('facebook'));
  if (tabGeneral) tabGeneral.addEventListener('click', () => switchCategoryTab('general'));

  /**
   * Active Tab Context Detection
   */
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.url) {
      if (activeTab.url.includes('instagram.com')) {
        if (statusBadge) statusBadge.className = 'status-indicator instagram';
        if (statusText) statusText.textContent = 'Instagram Active';
        switchCategoryTab('instagram');
      } else if (activeTab.url.includes('facebook.com')) {
        if (statusBadge) statusBadge.className = 'status-indicator facebook';
        if (statusText) statusText.textContent = 'Facebook Active';
        switchCategoryTab('facebook');
      } else {
        if (statusBadge) statusBadge.className = 'status-indicator';
        if (statusText) statusText.textContent = 'Standby';
      }
    }
  } catch (err) {
    if (statusText) statusText.textContent = 'Standby';
  }

  /**
   * Sub-row Visibility & Disabled State
   */
  function updateIGSubRowVisibility() {
    if (subRowIGStoriesOnly && toggleScrubberIG) {
      const isEnabled = toggleScrubberIG.checked;
      subRowIGStoriesOnly.style.opacity = isEnabled ? '1' : '0.4';
      subRowIGStoriesOnly.style.pointerEvents = isEnabled ? 'auto' : 'none';
      if (toggleScrubberIGStoriesOnly) {
        toggleScrubberIGStoriesOnly.disabled = !isEnabled;
      }
    }
  }

  /**
   * Notify Active Content Scripts
   */
  async function notifyContentScriptOptions(options) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'SET_OPTIONS', options });
      }
    } catch (e) {
      // Script not loaded on current origin
    }
  }

  /**
   * Load Saved Preferences
   */
  try {
    const settings = await chrome.storage.local.get([
      'showBadge',
      'widgetMinimized',
      'showFloatingTimeline',
      'showScrubberTime',
      'inVideoScrubberIG',
      'inVideoScrubberIGStoriesOnly',
      'inVideoScrubberFB',
      'rememberSpeed',
      'autoUnmuteStories',
      'theme'
    ]);

    applyTheme(settings.theme || 'auto');

    // Instagram settings
    if (toggleScrubberIG) toggleScrubberIG.checked = settings.inVideoScrubberIG !== false;
    if (toggleScrubberIGStoriesOnly) toggleScrubberIGStoriesOnly.checked = !!settings.inVideoScrubberIGStoriesOnly;
    if (toggleAutoUnmute) toggleAutoUnmute.checked = !!settings.autoUnmuteStories;

    // Facebook settings
    if (toggleScrubberFB) toggleScrubberFB.checked = settings.inVideoScrubberFB !== false;

    // Preferences & Floating HUD settings
    if (toggleBadge) toggleBadge.checked = settings.showBadge !== false;
    if (toggleMinimized) toggleMinimized.checked = !!settings.widgetMinimized;
    if (toggleFloatingTimeline) toggleFloatingTimeline.checked = settings.showFloatingTimeline !== false;

    updateIGSubRowVisibility();
  } catch (err) {
    console.warn('Preferences load error:', err);
  }

  /**
   * Toggle Listeners
   */
  if (toggleScrubberIG) {
    toggleScrubberIG.addEventListener('change', (e) => {
      chrome.storage.local.set({ inVideoScrubberIG: e.target.checked }).catch(() => {});
      updateIGSubRowVisibility();
    });
  }

  if (toggleScrubberIGStoriesOnly) {
    toggleScrubberIGStoriesOnly.addEventListener('change', (e) => {
      chrome.storage.local.set({ inVideoScrubberIGStoriesOnly: e.target.checked }).catch(() => {});
    });
  }

  if (toggleAutoUnmute) {
    toggleAutoUnmute.addEventListener('change', (e) => {
      chrome.storage.local.set({ autoUnmuteStories: e.target.checked }).catch(() => {});
    });
  }

  if (toggleScrubberFB) {
    toggleScrubberFB.addEventListener('change', (e) => {
      chrome.storage.local.set({ inVideoScrubberFB: e.target.checked }).catch(() => {});
    });
  }

  if (toggleBadge) {
    toggleBadge.addEventListener('change', (e) => {
      const val = e.target.checked;
      chrome.storage.local.set({ showBadge: val }).catch(() => {});
      notifyContentScriptOptions({ showBadge: val });
    });
  }

  if (toggleMinimized) {
    toggleMinimized.addEventListener('change', (e) => {
      chrome.storage.local.set({ widgetMinimized: e.target.checked }).catch(() => {});
    });
  }

  if (toggleFloatingTimeline) {
    toggleFloatingTimeline.addEventListener('change', (e) => {
      chrome.storage.local.set({ showFloatingTimeline: e.target.checked }).catch(() => {});
    });
  }

  /**
   * Action Handlers
   */
  if (btnResetDefaults) {
    btnResetDefaults.addEventListener('click', async () => {
      const defaults = {
        showBadge: true,
        widgetMinimized: false,
        showFloatingTimeline: true,
        inVideoScrubberIG: true,
        inVideoScrubberIGStoriesOnly: false,
        inVideoScrubberFB: true,
        autoUnmuteStories: false,
        theme: 'auto'
      };

      await chrome.storage.local.set(defaults);

      if (toggleScrubberIG) toggleScrubberIG.checked = true;
      if (toggleScrubberIGStoriesOnly) toggleScrubberIGStoriesOnly.checked = false;
      if (toggleAutoUnmute) toggleAutoUnmute.checked = false;
      if (toggleScrubberFB) toggleScrubberFB.checked = true;
      if (toggleBadge) toggleBadge.checked = true;
      if (toggleMinimized) toggleMinimized.checked = false;
      if (toggleFloatingTimeline) toggleFloatingTimeline.checked = true;

      applyTheme('auto');
      notifyContentScriptOptions({ theme: 'auto', showBadge: true });
      updateIGSubRowVisibility();

      const span = btnResetDefaults.querySelector('span');
      if (span) {
        const original = span.textContent;
        span.textContent = 'Restored';
        setTimeout(() => { span.textContent = original; }, 1400);
      }
    });
  }

  if (btnResetPos) {
    btnResetPos.addEventListener('click', () => {
      const defaultPos = { top: 90, left: 30 };
      chrome.storage.local.set({ widgetPos: defaultPos }).catch(() => {});
      const span = btnResetPos.querySelector('span');
      if (span) {
        const original = span.textContent;
        span.textContent = 'Centered';
        setTimeout(() => { span.textContent = original; }, 1400);
      }
    });
  }
});
