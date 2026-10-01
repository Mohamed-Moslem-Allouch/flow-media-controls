/**
 * Flow — Media Controls for Instagram & Facebook
 * Author: Mohamed Moslem Allouch
 * License: MIT
 * -----------------------------------------------------------
 * Features:
 *  - Native Reels speed button (adaptive light/dark)
 */

(function () {
  'use strict';

  const InstagramCustomFeatures = {
    init() {
      this.setupReelsSpeedButton();
    },

    setupVideoTapHandler() {
      // Intentionally inert: Instagram natively manages video clicks and play/pause.
      // Eliminating window-level capture click listeners prevents any interference
      // with Instagram post modals, dialog close ('X') buttons, backdrops, and navigation.
    },


    /**
     * Injects a native-styled "Speed Up" action button directly attached to the
     * Heart (Like) button in the vertical action column on Instagram Reels.
     * Strictly restricted to /reels and /reel/... and ignores comment likes.
     */
    setupReelsSpeedButton() {
      const PRESET_SPEEDS = [1.0, 1.25, 1.5, 1.75, 2.0];

      const getNextSpeed = (current) => {
        const cur = Math.round(current * 100) / 100;
        for (const s of PRESET_SPEEDS) {
          if (s > cur + 0.05) return s;
        }
        return PRESET_SPEEDS[0];
      };

      const updateAllSpeedLabels = (speedVal) => {
        const speed = speedVal !== undefined ? speedVal : (window.CoreSpeedEngine?.getSpeed?.() || 1.0);
        const text = (Math.round(speed * 100) / 100) + 'x';
        document.querySelectorAll('.vsc-reel-speed-label, .vsc-story-speed-label').forEach((el) => {
          el.textContent = text;
        });
      };

      const checkIsLightMode = (heartEl, container) => {
        // 1. Inspect neutral action buttons in the vertical action bar (Comment, Share, Save)
        // These NEVER change to red when liked, so their computed color represents the true UI tone.
        let neutralTarget = null;
        if (container) {
          neutralTarget = container.querySelector(
            'svg[aria-label*="Comment" i], svg[aria-label*="Share" i], svg[aria-label*="Save" i], ' +
            'button[aria-label*="Comment" i] svg, button[aria-label*="Share" i] svg, ' +
            '[aria-label*="Comment" i] svg, [aria-label*="Share" i] svg'
          );
        }

        const candidateEl = neutralTarget || heartEl;
        if (candidateEl) {
          const svg = candidateEl.tagName === 'SVG' ? candidateEl : candidateEl.querySelector('svg');
          const target = svg || candidateEl;
          const cs = window.getComputedStyle(target);
          const colorVal = cs.color || cs.fill;
          if (colorVal && colorVal.startsWith('rgb')) {
            const m = colorVal.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (m) {
              const r = parseInt(m[1], 10);
              const g = parseInt(m[2], 10);
              const b = parseInt(m[3], 10);

              // Check if color is red / saturated (e.g. liked heart rgb(255, 48, 64) or rgb(237, 73, 86))
              // Saturated red colors must NEVER be treated as dark/black icons!
              const isRedOrColored = r > 160 && (r - g > 50) && (r - b > 50);

              if (!isRedOrColored) {
                const lum = (r * 299 + g * 587 + b * 114) / 1000;
                if (lum < 140) return true;  // dark icon = light background
                if (lum > 180) return false; // light icon = dark background
              }
            }
          }
        }

        // 2. On Instagram Reels views (/reels or /reel/...), the player background is dark by default
        if (
          window.location.pathname.startsWith('/reel') ||
          window.location.pathname.startsWith('/reels') ||
          window.location.href.includes('/reel/') ||
          window.location.href.includes('/reels/')
        ) {
          return false;
        }

        // 3. Check Instagram CSS variable --ig-primary-text
        try {
          const rootStyle = window.getComputedStyle(document.documentElement);
          const igText = rootStyle.getPropertyValue('--ig-primary-text').trim();
          if (igText) {
            const nums = igText.split(',').map((n) => parseInt(n.trim(), 10));
            if (nums.length >= 3 && !isNaN(nums[0])) {
              const lum = (nums[0] * 299 + nums[1] * 587 + nums[2] * 114) / 1000;
              return lum < 140;
            }
          }
        } catch (e) {}

        // 4. Instagram explicit dark class check: _9dls marks dark mode
        const hasIgDarkClass = document.documentElement.classList.contains('_9dls') ||
                               document.body?.classList.contains('_9dls');
        if (hasIgDarkClass) {
          return false;
        }

        // 5. Check body background color
        if (document.body) {
          const bg = window.getComputedStyle(document.body).backgroundColor;
          if (bg && bg.startsWith('rgb')) {
            const m = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (m) {
              const lum = (parseInt(m[1], 10) * 299 + parseInt(m[2], 10) * 587 + parseInt(m[3], 10) * 114) / 1000;
              return lum > 140;
            }
          }
        }

        return false;
      };

      const injectSpeedButtonForHeart = (heartBtn) => {
        if (!heartBtn || !heartBtn.isConnected) return;

        // Traverse up to find the item container in the vertical actions column
        let heartItem = null;
        let el = heartBtn;
        while (el && el.parentElement && el.parentElement !== document.body && el.parentElement.tagName !== 'MAIN') {
          const p = el.parentElement;
          const hasOtherActions = p.querySelector(
            'svg[aria-label*="Comment" i], [aria-label*="Comment" i], svg[aria-label*="Share" i], [aria-label*="Share" i]'
          );
          if (hasOtherActions && !el.contains(hasOtherActions)) {
            heartItem = el;
            break;
          }
          el = p;
        }

        if (!heartItem || !heartItem.parentElement) {
          return;
        }

        const container = heartItem.parentElement;
        if (!container) return;

        // Verify container is indeed the vertical action bar (has comment/share actions and NO comment rows)
        const hasReelActions = container.querySelector(
          'svg[aria-label*="Comment" i], [aria-label*="Comment" i], svg[aria-label*="Share" i], [aria-label*="Share" i]'
        );
        if (!hasReelActions) return;
        if (container.querySelectorAll('li, [data-testid*="comment" i]').length > 0) return;

        const isLight = checkIsLightMode(heartBtn, container);

        // Keep existing speed button's light mode class up to date
        const existingSpeedItem = container.querySelector('.vsc-reel-speed-item');
        if (existingSpeedItem) {
          existingSpeedItem.classList.toggle('vsc-is-light-mode', isLight);
          return;
        }

        const currentSpeed = window.CoreSpeedEngine?.getSpeed?.() || 1.0;
        const speedText = (Math.round(currentSpeed * 100) / 100) + 'x';

        const speedItem = document.createElement('div');
        speedItem.className = 'vsc-reel-speed-item' + (isLight ? ' vsc-is-light-mode' : '');
        speedItem.title = 'Speed Up (Click to cycle, Scroll to adjust)';
        speedItem.innerHTML = `
          <button class="vsc-reel-speed-btn" type="button" aria-label="Speed Up Playback">
            <div class="vsc-reel-speed-icon-box">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.28-10.43zM10.59 15.41a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z"/>
              </svg>
            </div>
          </button>
          <span class="vsc-reel-speed-label">${speedText}</span>
        `;

        const btn = speedItem.querySelector('.vsc-reel-speed-btn');

        // Click to cycle speed
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const cur = window.CoreSpeedEngine?.getSpeed?.() || 1.0;
          const next = getNextSpeed(cur);
          if (window.CoreSpeedEngine?.setSpeed) {
            window.CoreSpeedEngine.setSpeed(next, true);
          }
          updateAllSpeedLabels(next);
        });

        // Mouse wheel for fine adjustment
        speedItem.addEventListener(
          'wheel',
          (e) => {
            e.preventDefault();
            e.stopPropagation();

            const cur = window.CoreSpeedEngine?.getSpeed?.() || 1.0;
            const delta = e.deltaY < 0 ? 0.25 : -0.25;
            let next = Math.round((cur + delta) * 100) / 100;
            if (next < 0.25) next = 0.25;
            if (next > 5.0) next = 5.0;

            if (window.CoreSpeedEngine?.setSpeed) {
              window.CoreSpeedEngine.setSpeed(next, true);
            }
            updateAllSpeedLabels(next);
          },
          { passive: false }
        );

        // Insert right above the Heart item
        container.insertBefore(speedItem, heartItem);
      };

      const scanAndInject = () => {
        // STRICTLY ONLY on /reels and /reel/... (NEVER on home page feed, profile, or explore)
        const isReelsPage = window.location.pathname.startsWith('/reel') || 
                            window.location.pathname.startsWith('/reels') || 
                            window.location.href.includes('/reel/') || 
                            window.location.href.includes('/reels/');
        if (!isReelsPage) {
          const stale = document.querySelectorAll('.vsc-reel-speed-item');
          for (const el of stale) el.remove();
          return;
        }

        const hearts = document.querySelectorAll(
          'button[aria-label*="Like" i], button[aria-label*="Unlike" i], ' +
          'div[role="button"][aria-label*="Like" i], div[role="button"][aria-label*="Unlike" i], ' +
          'svg[aria-label*="Like" i], svg[aria-label*="Unlike" i], ' +
          'svg[aria-label*="J’aime" i], svg[aria-label*="Me gusta" i]'
        );
        for (const h of hearts) {
          // EXCLUDE any comment like buttons (inside comments list, dialog, form, or comments container)
          if (h.closest('ul, li, form, [role="dialog"], [data-testid*="comment" i], [aria-label*="comment" i]')) {
            continue;
          }

          // EXCLUDE small comment like SVG icons
          const svg = h.tagName === 'SVG' ? h : h.querySelector('svg');
          if (svg) {
            const w = svg.getAttribute('width');
            const hAttr = svg.getAttribute('height');
            if ((w && parseInt(w) < 20) || (hAttr && parseInt(hAttr) < 20)) {
              continue;
            }
          }

          injectSpeedButtonForHeart(h);
        }
      };

      // Initial scan
      scanAndInject();

      // Periodic check for infinite-scrolling reels
      setInterval(scanAndInject, 500);

      // Listen for speed changes from storage
      try {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes.speed !== undefined) {
            updateAllSpeedLabels(parseFloat(changes.speed.newValue) || 1.0);
          }
        });
      } catch (e) {}

      this.updateSpeedLabels = updateAllSpeedLabels;
    }
  };

  // Clean up any old story speed buttons
  const staleStoryBtns = document.querySelectorAll('.vsc-ig-story-speed, .vsc-story-speed-item');
  for (const el of staleStoryBtns) el.remove();

    if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => InstagramCustomFeatures.init(), { once: true });
  } else {
    InstagramCustomFeatures.init();
  }

  window.InstagramCustomFeatures = InstagramCustomFeatures;
})();
