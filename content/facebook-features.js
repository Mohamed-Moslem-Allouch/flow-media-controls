/**
 * Flow — Media Controls for Instagram & Facebook
 * Author: Mohamed Moslem Allouch
 * License: MIT
 * -----------------------------------------------------------
 * Features:
 *  - Facebook Stories Vertical Audio Volume Controller (Exact Instagram Match)
 *    * Hover reveals vertical volume slider with circular thumb
 *    * Drag & click to increase / decrease volume (0% - 100%)
 *    * Speaker icon click toggles Mute / Unmute
 *    * Mouse wheel adjusts volume
 *    * Real-time sync with video audio state
 */

(function () {
  'use strict';

  /**
   * Facebook Stories Volume Capsule Instance
   */
  class FacebookVolumeCapsuleInstance {
    constructor(video, container, initialVolume, onVolumeSaved) {
      this.video = video;
      this.container = container;
      this.onVolumeSaved = onVolumeSaved;
      this.isDragging = false;
      this.capsuleEl = null;
      this.sliderWrapEl = null;
      this.trackEl = null;
      this.fillEl = null;
      this.thumbEl = null;
      this.btnEl = null;

      this.onVolumeChange = this.onVolumeChange.bind(this);
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerUp = this.onPointerUp.bind(this);
      this.onWheel = this.onWheel.bind(this);
      this.onBtnClick = this.onBtnClick.bind(this);

      this.init(initialVolume);
    }

    init(initialVolume) {
      const capsule = document.createElement('div');
      capsule.className = 'vsc-fb-volume-capsule';
      capsule.title = 'Volume';
      capsule.innerHTML = `
        <div class="vsc-fb-volume-slider-wrap">
          <div class="vsc-fb-volume-track">
            <div class="vsc-fb-volume-fill"></div>
            <div class="vsc-fb-volume-thumb"></div>
          </div>
        </div>
        <button class="vsc-fb-volume-btn" type="button" aria-label="Mute / Unmute" title="Mute / Unmute">
          <svg class="vsc-fb-icon-volume-high" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          </svg>
          <svg class="vsc-fb-icon-volume-mute" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
          </svg>
        </button>
      `;

      this.capsuleEl = capsule;
      this.sliderWrapEl = capsule.querySelector('.vsc-fb-volume-slider-wrap');
      this.trackEl = capsule.querySelector('.vsc-fb-volume-track');
      this.fillEl = capsule.querySelector('.vsc-fb-volume-fill');
      this.thumbEl = capsule.querySelector('.vsc-fb-volume-thumb');
      this.btnEl = capsule.querySelector('.vsc-fb-volume-btn');

      // Prevent Story skip / pause click events from firing on Facebook
      const stopAll = (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      };
      ['click', 'dblclick', 'pointerdown', 'mousedown', 'touchstart'].forEach((evt) => {
        this.capsuleEl.addEventListener(evt, stopAll);
      });

      this.sliderWrapEl.addEventListener('pointerdown', this.onPointerDown);
      this.btnEl.addEventListener('click', this.onBtnClick);
      this.capsuleEl.addEventListener('wheel', this.onWheel, { passive: false });
      this.video.addEventListener('volumechange', this.onVolumeChange, { passive: true });

      this.container.appendChild(capsule);

      // Apply initial volume
      if (typeof initialVolume === 'number' && initialVolume > 0) {
        try {
          this.video.volume = initialVolume;
        } catch (e) {}
      }
      this.updateUI();
    }

    updateUI() {
      if (!this.video || !this.capsuleEl) return;
      const isMuted = this.video.muted || this.video.volume === 0;
      const vol = isMuted ? 0 : this.video.volume;
      const pct = Math.max(0, Math.min(100, Math.round(vol * 100)));

      this.capsuleEl.classList.toggle('vsc-muted', isMuted);
      if (this.fillEl) this.fillEl.style.height = `${pct}%`;
      if (this.thumbEl) this.thumbEl.style.bottom = `${pct}%`;
    }

    onVolumeChange() {
      if (!this.isDragging) {
        this.updateUI();
      }
    }

    setVolumeFromClientY(clientY) {
      if (!this.trackEl || !this.video) return;
      const rect = this.trackEl.getBoundingClientRect();
      if (rect.height <= 0) return;

      // 0 at rect.bottom, 1 at rect.top
      const ratio = Math.max(0, Math.min(1, (rect.bottom - clientY) / rect.height));
      const rounded = Math.round(ratio * 100) / 100;

      try {
        this.video.volume = rounded;
        if (rounded > 0 && this.video.muted) {
          this.video.muted = false;
        } else if (rounded === 0 && !this.video.muted) {
          this.video.muted = true;
        }
      } catch (e) {}

      if (this.onVolumeSaved && rounded > 0) {
        this.onVolumeSaved(rounded);
      }
      this.updateUI();
    }

    onPointerDown(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      this.isDragging = true;
      this.capsuleEl.classList.add('vsc-dragging');
      this.setVolumeFromClientY(e.clientY);

      window.addEventListener('pointermove', this.onPointerMove, { capture: true, passive: false });
      window.addEventListener('pointerup', this.onPointerUp, { capture: true, passive: false });
      window.addEventListener('pointercancel', this.onPointerUp, { capture: true, passive: false });
    }

    onPointerMove(e) {
      if (!this.isDragging) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.setVolumeFromClientY(e.clientY);
    }

    onPointerUp(e) {
      if (this.isDragging) {
        this.isDragging = false;
        if (this.capsuleEl) this.capsuleEl.classList.remove('vsc-dragging');
        window.removeEventListener('pointermove', this.onPointerMove, { capture: true });
        window.removeEventListener('pointerup', this.onPointerUp, { capture: true });
        window.removeEventListener('pointercancel', this.onPointerUp, { capture: true });
        this.updateUI();
      }
    }

    onWheel(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (!this.video) return;
      const current = this.video.muted ? 0 : this.video.volume;
      const step = e.deltaY < 0 ? 0.05 : -0.05;
      const newVol = Math.max(0, Math.min(1, Math.round((current + step) * 100) / 100));

      try {
        this.video.volume = newVol;
        if (newVol > 0 && this.video.muted) {
          this.video.muted = false;
        } else if (newVol === 0 && !this.video.muted) {
          this.video.muted = true;
        }
      } catch (err) {}

      if (this.onVolumeSaved && newVol > 0) {
        this.onVolumeSaved(newVol);
      }
      this.updateUI();
    }

    onBtnClick(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (!this.video) return;
      const willMute = !this.video.muted && this.video.volume > 0;
      try {
        if (willMute) {
          this.video.muted = true;
        } else {
          this.video.muted = false;
          if (this.video.volume === 0) {
            this.video.volume = 0.8;
          }
        }
      } catch (err) {}

      this.updateUI();
    }

    destroy() {
      if (this.sliderWrapEl) {
        this.sliderWrapEl.removeEventListener('pointerdown', this.onPointerDown);
      }
      if (this.btnEl) {
        this.btnEl.removeEventListener('click', this.onBtnClick);
      }
      if (this.capsuleEl) {
        this.capsuleEl.removeEventListener('wheel', this.onWheel);
        this.capsuleEl.remove();
        this.capsuleEl = null;
      }
      if (this.video) {
        this.video.removeEventListener('volumechange', this.onVolumeChange);
      }
    }
  }

  /**
   * Facebook Story Volume Controller Manager
   */
  const FacebookStoryVolume = {
    activeInstances: new WeakMap(),
    savedVolume: 0.8,

    init() {
      try {
        const localVal = parseFloat(localStorage.getItem('vsc_saved_audio_volume'));
        if (!isNaN(localVal) && localVal > 0) {
          this.savedVolume = Math.max(0.01, Math.min(1, Math.round(localVal * 100) / 100));
        }

        chrome.storage.local.get(['savedAudioVolume', 'fbStoryVolume'], (res) => {
          if (res && typeof res.savedAudioVolume === 'number') {
            this.savedVolume = Math.max(0.01, Math.min(1, res.savedAudioVolume));
          } else if (res && typeof res.fbStoryVolume === 'number') {
            this.savedVolume = Math.max(0.01, Math.min(1, res.fbStoryVolume));
          }
        });

        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes.savedAudioVolume) {
            const val = changes.savedAudioVolume.newValue;
            if (typeof val === 'number') {
              this.savedVolume = Math.max(0.01, Math.min(1, val));
            }
          }
        });
      } catch (e) {}

      // Periodic check for story video mount/transition
      setInterval(() => {
        if (!window.location.hostname.includes('facebook.com')) return;
        const isStoriesUrl =
          window.location.pathname.startsWith('/stories') ||
          window.location.pathname.includes('/stories/');
        if (!isStoriesUrl) return;

        const videos = document.querySelectorAll('video');
        for (const video of videos) {
          if (video.isConnected && video.offsetWidth > 100 && video.offsetHeight > 100) {
            this.attach(video);
          }
        }
      }, 1000);
    },

    attach(video) {
      if (!video || !video.isConnected) return;

      // If In-Video Scrubber is active with its own volume controller beside time display, don't duplicate
      if (window.InVideoScrubber || video._vscScrubber || video.parentElement?.querySelector('.vsc-invideo-container') || video.closest?.('.vsc-invideo-container')) {
        const existingTop = document.querySelectorAll('.vsc-fb-volume-capsule');
        for (const el of existingTop) el.remove();
        return;
      }

      if (this.activeInstances.has(video)) {
        const inst = this.activeInstances.get(video);
        if (inst.capsuleEl && inst.capsuleEl.isConnected) {
          return;
        }
        inst.destroy();
        this.activeInstances.delete(video);
      }

      const container = video.parentElement;
      if (!container) return;

      try {
        const pos = window.getComputedStyle(container).position;
        if (pos === 'static') {
          container.style.position = 'relative';
        }
        container.style.setProperty('z-index', '99999', 'important');
      } catch (e) {}

      // Ensure no duplicate capsule exists
      const existing = container.querySelectorAll('.vsc-fb-volume-capsule');
      for (const el of existing) el.remove();

      const instance = new FacebookVolumeCapsuleInstance(
        video,
        container,
        this.savedVolume,
        (vol) => {
          this.savedVolume = vol;
          try {
            chrome.storage.local.set({ savedAudioVolume: vol, fbStoryVolume: vol });
          } catch (e) {}
        }
      );

      this.activeInstances.set(video, instance);
    }
  };

  /**
   * Main Facebook Custom Features Module
   */
  const FacebookCustomFeatures = {
    config: {},

    init() {
      FacebookStoryVolume.init();
    },

    /**
     * Triggered when a new video is found on Facebook
     */
    onVideoDetected(video, context) {
      if (!video) return;
      const isStory = context?.isStory || window.location.pathname.includes('/stories');
      if (isStory) {
        FacebookStoryVolume.attach(video);
      }
    }
  };

  // Clean up any old story speed buttons
  const staleFbStoryBtns = document.querySelectorAll('.vsc-fb-story-speed, .vsc-story-speed-item');
  for (const el of staleFbStoryBtns) el.remove();

    if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FacebookCustomFeatures.init(), { once: true });
  } else {
    FacebookCustomFeatures.init();
  }

  window.FacebookCustomFeatures = FacebookCustomFeatures;
})();
