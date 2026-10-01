/**
 * Flow — Media Controls for Instagram & Facebook
 * Author: Mohamed Moslem Allouch
 * License: MIT
 */

(function () {
  'use strict';

  let currentSpeed = 1.0;
  let showBadge = true;
  let rememberSpeed = true;
  let fastSpeed = 2.0;

  const boundVideos = new WeakSet();

  let saveSpeedTimeout = null;
  function debouncedSaveSpeed(speed) {
    clearTimeout(saveSpeedTimeout);
    saveSpeedTimeout = setTimeout(() => {
      chrome.storage.local.set({ speed }).catch(() => {});
    }, 150);
  }

  // Load settings & Initialize
  chrome.storage.local.get(
    [
      'speed',
      'showBadge',
      'rememberSpeed',
      'fastSpeed',
      'widgetPos',
      'widgetMinimized',
      'showFloatingTimeline',
      'inVideoScrubberIG',
      'inVideoScrubberIGStoriesOnly',
      'inVideoScrubberFB',
      'inVideoScrubberFBAll',
      'showScrubberTime',
      'theme'
    ],
    (items) => {
      if (items.speed !== undefined && items.rememberSpeed !== false) {
        currentSpeed = parseFloat(items.speed) || 1.0;
      }
      if (items.showBadge !== undefined) showBadge = items.showBadge;
      if (items.rememberSpeed !== undefined) rememberSpeed = items.rememberSpeed;
      if (items.fastSpeed !== undefined) fastSpeed = parseFloat(items.fastSpeed) || 2.0;

      // Sync adaptive dark/light appearance
      syncAdaptiveTheme(items.theme || 'auto');

      // Initialize In-Video Live Scrubber
      if (window.InVideoScrubber) {
        window.InVideoScrubber.init({
          inVideoScrubberIG: items.inVideoScrubberIG !== false,
          inVideoScrubberIGStoriesOnly: !!items.inVideoScrubberIGStoriesOnly,
          inVideoScrubberFB: items.inVideoScrubberFB !== false,
          inVideoScrubberFBAll: !!items.inVideoScrubberFBAll,
          showScrubberTime: items.showScrubberTime !== false
        });
      }

      // Initialize Movable Widget
      if (window.MovableWidget) {
        window.MovableWidget.init(currentSpeed, (newSpeed) => {
          setSpeed(newSpeed, false);
        }, {
          visible: showBadge,
          position: items.widgetPos,
          minimized: !!items.widgetMinimized,
          showTimeline: items.showFloatingTimeline !== false
        });
      }

      applySpeedToAllVideos();
    }
  );

  // Adaptive Appearance Detection
  let currentThemeSetting = 'auto';
  function syncAdaptiveTheme(themeSetting) {
    if (themeSetting !== undefined) currentThemeSetting = themeSetting;
    if (currentThemeSetting === 'dark') {
      document.documentElement.classList.add('vsc-theme-dark');
      document.documentElement.classList.remove('vsc-theme-light');
      document.documentElement.setAttribute('data-vsc-theme', 'dark');
      return;
    }
    if (currentThemeSetting === 'light') {
      document.documentElement.classList.remove('vsc-theme-dark');
      document.documentElement.classList.add('vsc-theme-light');
      document.documentElement.setAttribute('data-vsc-theme', 'light');
      return;
    }
    // Auto mode: match platform-specific indicators or system media query
    let isDark;
    if (window.location.hostname.includes('instagram.com')) {
      isDark = document.documentElement.classList.contains('_9dls') ||
               document.body?.classList.contains('_9dls') ||
               document.documentElement.getAttribute('data-color-mode') === 'dark';
    } else if (window.location.hostname.includes('facebook.com')) {
      isDark = document.documentElement.classList.contains('__fb-dark-mode') ||
               document.body?.classList.contains('__fb-dark-mode') ||
               document.documentElement.getAttribute('data-color-mode') === 'dark';
    } else {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches ||
               document.documentElement.classList.contains('dark') ||
               document.documentElement.getAttribute('data-color-mode') === 'dark' ||
               document.body?.classList.contains('dark') ||
               document.body?.classList.contains('system-dark') ||
               document.body?.classList.contains('theme-dark') ||
               document.documentElement.getAttribute('data-theme') === 'dark';
    }
    document.documentElement.classList.toggle('vsc-theme-dark', !!isDark);
    document.documentElement.classList.toggle('vsc-theme-light', !isDark);
    document.documentElement.setAttribute('data-vsc-theme', isDark ? 'dark' : 'light');
  }

  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (currentThemeSetting === 'auto') syncAdaptiveTheme('auto');
    });

    const themeObserver = new MutationObserver(() => {
      if (currentThemeSetting === 'auto') syncAdaptiveTheme('auto');
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-color-mode', 'data-theme'] });
    if (document.body) {
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      });
    }
  } catch (e) {}

  // Sync settings across tabs
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    if (changes.speed && rememberSpeed) {
      currentSpeed = parseFloat(changes.speed.newValue) || 1.0;
      applySpeedToAllVideos();
      if (window.MovableWidget) {
        window.MovableWidget.updateSpeed(currentSpeed);
      }
    }
    if (changes.showBadge !== undefined) {
      showBadge = !!changes.showBadge.newValue;
      if (window.MovableWidget) {
        window.MovableWidget.setVisibility(showBadge);
      }
    }
    if (changes.showFloatingTimeline !== undefined && window.MovableWidget) {
      window.MovableWidget.setTimelineVisibility(changes.showFloatingTimeline.newValue);
    }
    if (changes.theme !== undefined) {
      syncAdaptiveTheme(changes.theme.newValue);
    }
    if (changes.rememberSpeed !== undefined) {
      rememberSpeed = changes.rememberSpeed.newValue;
    }
    if (changes.fastSpeed !== undefined) {
      fastSpeed = parseFloat(changes.fastSpeed.newValue) || 2.0;
    }
    if (changes.widgetPos && window.MovableWidget) {
      const widget = document.getElementById('vsc-movable-widget');
      if (widget) {
        window.MovableWidget.applyPosition(widget, changes.widgetPos.newValue.top, changes.widgetPos.newValue.left);
      }
    }
    if (changes.widgetMinimized !== undefined && window.MovableWidget) {
      window.MovableWidget.setMinimized(changes.widgetMinimized.newValue);
    }

    // In-video scrubber dynamic settings sync
    const scrubberKeys = ['inVideoScrubberIG', 'inVideoScrubberIGStoriesOnly', 'inVideoScrubberFB', 'inVideoScrubberFBAll', 'showScrubberTime'];
    const scrubberChanges = {};
    let hasScrubberChanges = false;
    for (const key of scrubberKeys) {
      if (changes[key] !== undefined) {
        scrubberChanges[key] = changes[key].newValue;
        hasScrubberChanges = true;
      }
    }
    if (hasScrubberChanges && window.InVideoScrubber) {
      window.InVideoScrubber.updateConfig(scrubberChanges);
    }
  });

  // Popup messaging
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SET_SPEED') {
      setSpeed(request.speed);
      sendResponse({ status: 'ok', speed: currentSpeed });
    } else if (request.type === 'GET_SPEED') {
      sendResponse({ speed: currentSpeed, showBadge });
    } else if (request.type === 'SET_OPTIONS') {
      if (request.options) {
        if (request.options.showBadge !== undefined) {
          showBadge = !!request.options.showBadge;
          if (window.MovableWidget) {
            window.MovableWidget.setVisibility(showBadge);
          }
        }
        if (request.options.theme !== undefined) {
          syncAdaptiveTheme(request.options.theme);
        }
      }
      sendResponse({ status: 'ok' });
    }
    return true;
  });

  /**
   * Set new playback speed
   */
  function setSpeed(newSpeed) {
    const clamped = Math.min(5.0, Math.max(0.25, Math.round(newSpeed * 100) / 100));
    currentSpeed = clamped;

    if (rememberSpeed) {
      debouncedSaveSpeed(currentSpeed);
    }

    applySpeedToAllVideos();

    if (window.MovableWidget) {
      window.MovableWidget.updateSpeed(currentSpeed);
    }

    if (window.InstagramCustomFeatures?.updateSpeedLabels) {
      window.InstagramCustomFeatures.updateSpeedLabels(currentSpeed);
    }

    if (window.FacebookCustomFeatures?.updateSpeedLabels) {
      window.FacebookCustomFeatures.updateSpeedLabels(currentSpeed);
    }
  }

  /**
   * Bind video and lock playbackRate
   */
  function bindVideo(video) {
    if (!video || boundVideos.has(video)) return;
    boundVideos.add(video);

    let isEnforcing = false;

    const enforceRate = () => {
      if (isEnforcing) return;
      if (Math.abs(video.playbackRate - currentSpeed) > 0.01) {
        isEnforcing = true;
        try {
          video.playbackRate = currentSpeed;
          video.preservesPitch = true;
          if ('mozPreservesPitch' in video) video.mozPreservesPitch = true;
          if ('webkitPreservesPitch' in video) video.webkitPreservesPitch = true;
        } catch (e) {
          // Video may be detached
        }
        isEnforcing = false;
      }
    };

    enforceRate();

    // Guard against Meta player resets
    video.addEventListener('ratechange', enforceRate, { passive: true });
    video.addEventListener('play', enforceRate, { passive: true });
    video.addEventListener('playing', enforceRate, { passive: true });
    video.addEventListener('loadedmetadata', enforceRate, { passive: true });
    video.addEventListener('loadeddata', enforceRate, { passive: true });
    video.addEventListener('canplay', enforceRate, { passive: true });

    // Notify custom platform module if present
    const isInstagram = window.location.hostname.includes('instagram.com');
    const isFacebook = window.location.hostname.includes('facebook.com');

    if (isInstagram && window.InstagramCustomFeatures?.onVideoDetected) {
      const isStory = window.location.pathname.startsWith('/stories');
      const isReel = window.location.pathname.startsWith('/reel');
      window.InstagramCustomFeatures.onVideoDetected(video, { isStory, isReel });
    } else if (isFacebook && window.FacebookCustomFeatures?.onVideoDetected) {
      const isStory = window.location.pathname.startsWith('/stories');
      const isReel = window.location.pathname.startsWith('/reel');
      const isWatch = window.location.pathname.startsWith('/watch');
      window.FacebookCustomFeatures.onVideoDetected(video, { isStory, isReel, isWatch });
    }

    // Attach In-Video Live Timeline Scrubber
    if (window.InVideoScrubber) {
      window.InVideoScrubber.attach(video);
    }
  }

  /**
   * Apply speed to all videos currently in DOM
   */
  function applySpeedToAllVideos() {
    const videos = document.querySelectorAll('video');
    for (const video of videos) {
      bindVideo(video);
      try {
        if (Math.abs(video.playbackRate - currentSpeed) > 0.01) {
          video.playbackRate = currentSpeed;
          video.preservesPitch = true;
        }
      } catch (e) {}
    }
  }

  /**
   * Dynamic Video Detection
   */
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        if (node.tagName === 'VIDEO') {
          bindVideo(node);
        } else if (node.querySelectorAll) {
          const vids = node.querySelectorAll('video');
          for (const v of vids) {
            bindVideo(v);
          }
        }
      }
    }
  });

  const targetRoot = document.body || document.documentElement;
  if (targetRoot) {
    observer.observe(targetRoot, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      const root = document.body || document.documentElement;
      if (root) observer.observe(root, { childList: true, subtree: true });
    }, { once: true });
  }

  setInterval(applySpeedToAllVideos, 1000);

  // SPA Route Navigation Sync (e.g. stories / reels transitions)
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (window.InVideoScrubber) {
        window.InVideoScrubber.syncAll();
      }
    }
  }, 400);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySpeedToAllVideos);
  } else {
    applySpeedToAllVideos();
  }

  window.CoreSpeedEngine = {
    setSpeed,
    getSpeed: () => currentSpeed,
    applySpeedToAllVideos
  };
})();
