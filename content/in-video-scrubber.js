/**
 * Flow — Media Controls for Instagram & Facebook
 * Author: Mohamed Moslem Allouch
 * License: MIT
 * ---------------------------------------------------------
 * Injects a sleek, interactive live timeline scrubber bar directly
 * inside videos across Instagram (Stories, Reels, Feed) and Facebook (Stories).
 *
 * Features:
 * - Real-time continuous progress tracking with video playback.
 * - 100% Unblockable click & horizontal drag scrubbing via window capture handlers.
 * - Bypasses all Instagram transparent tap/pressable overlays and link navigations.
 * - Hover and drag timestamp preview bubble (e.g. "0:14 / 0:45").
 * - Dynamic time display (elapsed / total duration).
 * - Context-aware positioning (above story bottom message bar in stories).
 * - Multi-scrubber prevention and anchor pinning to video frame bottom.
 */

(function () {
  'use strict';

  // Active instances mapped by HTMLVideoElement
  const scrubbers = new Map();

  // Active drag state
  let activeDraggingInstance = null;
  let activeVolDraggingInstance = null;
  let wasDraggingJustNow = false;
  let dragResetTimer = null;

  // Saved Global Audio Volume (0.0 to 1.0) and Mute State
  let savedAudioVolume = 0.8;
  let savedIsMuted = false;

  try {
    const localVal = parseFloat(localStorage.getItem('vsc_saved_audio_volume'));
    if (!isNaN(localVal) && localVal > 0) {
      savedAudioVolume = Math.max(0.01, Math.min(1, Math.round(localVal * 100) / 100));
    }
    const localMuted = localStorage.getItem('vsc_saved_audio_muted');
    if (localMuted === '1') {
      savedIsMuted = true;
    }
  } catch (e) {}

  try {
    chrome.storage.local.get(['savedAudioVolume', 'savedIsMuted'], (res) => {
      if (res) {
        if (typeof res.savedAudioVolume === 'number' && res.savedAudioVolume > 0) {
          savedAudioVolume = Math.max(0.01, Math.min(1, res.savedAudioVolume));
        }
        if (typeof res.savedIsMuted === 'boolean') {
          savedIsMuted = res.savedIsMuted;
        }
        for (const [video, inst] of scrubbers.entries()) {
          inst.applySavedVolume();
        }
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.savedAudioVolume && typeof changes.savedAudioVolume.newValue === 'number') {
          savedAudioVolume = Math.max(0.01, Math.min(1, changes.savedAudioVolume.newValue));
        }
        if (changes.savedIsMuted && typeof changes.savedIsMuted.newValue === 'boolean') {
          savedIsMuted = changes.savedIsMuted.newValue;
        }
        for (const [video, inst] of scrubbers.entries()) {
          if (!inst.isVolDragging) {
            inst.applySavedVolume();
          }
        }
      }
    });
  } catch (e) {}

  function saveGlobalVolume(val, isMuted = false) {
    if (typeof val === 'number' && !isNaN(val)) {
      savedAudioVolume = Math.max(0.01, Math.min(1, Math.round(val * 100) / 100));
    }
    savedIsMuted = !!isMuted;
    try {
      localStorage.setItem('vsc_saved_audio_volume', String(savedAudioVolume));
      localStorage.setItem('vsc_saved_audio_muted', savedIsMuted ? '1' : '0');
      chrome.storage.local.set({ savedAudioVolume, savedIsMuted });
    } catch (e) {}
  }

  // Default configuration
  let config = {
    inVideoScrubberIG: true,
    inVideoScrubberIGStoriesOnly: false,
    inVideoScrubberFB: true,
    inVideoScrubberFBAll: false,
    showScrubberTime: true
  };

  /**
   * Format seconds into M:SS or H:MM:SS
   */
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return '0:00';
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const remSec = s % 60;
    const padSec = remSec < 10 ? '0' + remSec : remSec;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remM = m % 60;
      const padM = remM < 10 ? '0' + remM : remM;
      return `${h}:${padM}:${padSec}`;
    }
    return `${m}:${padSec}`;
  }

  /**
   * Safe duration helper for MSE / blob streams
   */
  function getVideoDuration(video) {
    if (!video) return 0;
    const dur = video.duration;
    if (typeof dur === 'number' && isFinite(dur) && dur > 0) {
      return dur;
    }
    try {
      if (video.seekable && video.seekable.length > 0) {
        const end = video.seekable.end(video.seekable.length - 1);
        if (isFinite(end) && end > 0) return end;
      }
    } catch (e) {}
    try {
      if (video.buffered && video.buffered.length > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        if (isFinite(end) && end > 0) return end;
      }
    } catch (e) {}
    return 0;
  }

  /**
   * Check if video is inside an Instagram or Facebook Story
   */
  function isStoryVideo(video) {
    const host = window.location.hostname;
    const path = window.location.pathname;
    const href = window.location.href;
    const isStoriesUrl = path.startsWith('/stories') || path.includes('/stories/') || href.includes('/stories/');

    const isFacebook = host.includes('facebook.com');
    const isInstagram = host.includes('instagram.com');

    if (isFacebook) {
      if (isStoriesUrl) return true;
      if (video) {
        if (video.closest('[data-pagelet*="StoryViewer"]') || video.closest('[data-pagelet*="StoriesStoryViewer"]')) {
          return true;
        }
      }
      return false;
    }

    if (isInstagram) {
      if (isStoriesUrl) return true;
      if (video) {
        if (video.closest('section._ac0q') || video.closest('div._ac0q')) return true;
        const dialog = video.closest('div[role="dialog"]');
        if (dialog && dialog.querySelector('section[aria-label*="Story"]')) return true;
      }
      return false;
    }

    return isStoriesUrl;
  }

  /**
   * Check if video is an Instagram or Facebook Reel (including reels watched from feed)
   */
  function isReelVideo(video) {
    const path = window.location.pathname;
    const href = window.location.href;

    if (path.startsWith('/reel') || path.includes('/reel/') || path.startsWith('/reels')) {
      return true;
    }
    if (href.includes('/reel/') || href.includes('/reels/')) {
      return true;
    }

    if (video) {
      if (
        video.closest(
          'a[href*="/reel/"], div[data-pagelet*="Reels"], section[data-pagelet*="Reels"], .PolarisPostVideoPlayerWrapper'
        )
      ) {
        if (!isStoryVideo(video)) {
          return true;
        }
      }
      const post = video.closest('article, div[role="presentation"]');
      if (post && post.querySelector('a[href*="/reel/"], [aria-label*="Reel" i]')) {
        if (!isStoryVideo(video)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Detect current platform and context
   */
  function getContext(video) {
    const host = window.location.hostname;
    const path = window.location.pathname;
    const isInstagram = host.includes('instagram.com');
    const isFacebook = host.includes('facebook.com');
    const isStory = isStoryVideo(video);
    const isReel = isReelVideo(video);
    const isWatch = path.startsWith('/watch') || path.includes('/watch/');

    return { isInstagram, isFacebook, isStory, isReel, isWatch };
  }

  /**
   * Check if in-video scrubber should be active for this video
   */
  function shouldEnable(context) {
    if (context.isInstagram) {
      if (!config.inVideoScrubberIG) return false;
      if (config.inVideoScrubberIGStoriesOnly && !context.isStory) return false;
      return true;
    }

    if (context.isFacebook) {
      if (!config.inVideoScrubberFB) return false;
      return context.isStory;
    }

    return false;
  }

  function ensurePositioned(el) {
    if (!el) return;
    try {
      const pos = window.getComputedStyle(el).position;
      if (pos === 'static') {
        el.style.position = 'relative';
      }
    } catch (e) {}
  }

  /**
   * Find direct DOM parent container for the video overlay.
   * On Stories: directly returns video.parentElement.
   * On Reels: resolves the complete video stage container (the parent of both the
   * video wrapper and the dark scrim/caption overlays, distinct from the heart action bar),
   * mounts the scrubber as the last child in front of all overlays, and lifts scrims
   * above the 32px bottom scrubber zone.
   */
  function findVideoContainer(video) {
    if (!video || !video.isConnected) return null;
    const parent = video.parentElement;
    if (!parent) return null;

    if (isStoryVideo(video)) {
      ensurePositioned(parent);
      return parent;
    }

    // On Reels / Feed:
    // We want the highest video container (the "video stage") that directly contains
    // both the video wrapper and all bottom/top gradient scrims, but NOT the side action bar.
    let videoStage = null;

    // Method 1: Walk UP from video. Check if the parent element contains
    // reel action buttons (Like/Heart, Comment, Share, More) that are outside current.
    let current = parent;
    while (current && current !== document.body && current.tagName !== 'MAIN') {
      const p = current.parentElement;
      if (!p) break;

      const hasActionSibling = p.querySelector(
        'button[aria-label="Like"], button[aria-label="Unlike"], svg[aria-label="Like"], svg[aria-label="Unlike"], [aria-label*="Like" i], [aria-label*="Unlike" i], [aria-label*="Comment" i], [aria-label*="Share" i]'
      );

      if (hasActionSibling && !current.contains(hasActionSibling)) {
        // 'current' is the complete video stage column! 'p' holds current + the action column.
        videoStage = current;
        break;
      }
      current = p;
    }

    // Method 2 (Fallback if no action buttons yet e.g. modal or desktop feed):
    if (!videoStage) {
      const card = video.closest('article, div[data-pagelet*="Reels"], div[role="dialog"]') ||
                   video.closest('main');
      if (card) {
        let c = parent;
        while (c && c.parentElement && c.parentElement !== card && c.parentElement !== document.body) {
          if (c.parentElement.children.length > 1) {
            videoStage = c;
            break;
          }
          c = c.parentElement;
        }
      }
    }

    const targetContainer = videoStage || parent;
    ensurePositioned(targetContainer);

    return targetContainer;
  }

  /**
   * Scrubber Instance Class
   */
  class VideoScrubberInstance {
    constructor(video, context) {
      this.video = video;
      this.context = context;
      this.containerEl = null;
      this.overlayEl = null;
      this.playBtnEl = null;
      this.barWrapEl = null;
      this.trackEl = null;
      this.progressEl = null;
      this.thumbEl = null;
      this.timeBubbleEl = null;
      this.timeDisplayEl = null;
      this.volWrapEl = null;
      this.volPopupEl = null;
      this.volTrackEl = null;
      this.volFillEl = null;
      this.volThumbEl = null;
      this.volBtnEl = null;
      this.isDragging = false;
      this.isVolDragging = false;
      this._lastUserVolInteraction = 0;
      this.animFrameId = null;

      this.onTimeUpdate = this.onTimeUpdate.bind(this);
      this.onPlay = this.onPlay.bind(this);
      this.onPause = this.onPause.bind(this);
      this.onSeeked = this.onSeeked.bind(this);
      this.onVolumeChange = this.onVolumeChange.bind(this);
      this.updatePlayState = this.updatePlayState.bind(this);
      this.togglePlay = this.togglePlay.bind(this);
      this.toggleMute = this.toggleMute.bind(this);
      this.handleVolumeWheel = this.handleVolumeWheel.bind(this);

      this.init();
    }

    init() {
      if (!this.video || !this.video.isConnected) return;
      this.containerEl = findVideoContainer(this.video);
      if (!this.containerEl) return;

      // Clean up any existing orphan controls in this container
      const existing = this.containerEl.querySelectorAll(
        '.vsc-invideo-container, .vsc-invideo-action-bar, .vsc-invideo-top-cluster, .vsc-invideo-quality-badge'
      );
      for (const el of existing) el.remove();

      this.buildDOM();
      this.bindEvents();
      this.updateProgress();

      if (!this.video.paused) {
        this.startTicker();
      }
    }

    buildDOM() {
      const isStory = isStoryVideo(this.video) || this.context.isStory;
      const isReel = this.context.isReel;
      const isFacebook = this.context.isFacebook;
      let extraClass = '';
      if (isStory) {
        extraClass = isFacebook ? ' vsc-is-story vsc-is-fb-story' : ' vsc-is-story vsc-is-ig-story';
      } else if (isReel) {
        extraClass = ' vsc-is-reel';
      } else {
        extraClass = ' vsc-is-feed';
      }

      const overlay = document.createElement('div');
      overlay.className = 'vsc-invideo-container' + extraClass;
      overlay.setAttribute('data-vsc-invideo', 'true');
      overlay._vscInstance = this;

      // Vertical Volume Slider Capsule ONLY on Facebook (per user request)
      const volumeMarkup = isFacebook ? `
          <div class="vsc-invideo-volume-wrap" title="Audio Volume">
            <div class="vsc-invideo-volume-popup">
              <div class="vsc-invideo-volume-slider">
                <div class="vsc-invideo-volume-track">
                  <div class="vsc-invideo-volume-fill"></div>
                  <div class="vsc-invideo-volume-thumb"></div>
                </div>
              </div>
            </div>
            <button class="vsc-invideo-volume-btn" type="button" aria-label="Volume / Mute" title="Volume / Mute">
              <svg class="vsc-invideo-icon-vol-high" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
              <svg class="vsc-invideo-icon-vol-mute" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            </button>
          </div>
      ` : '';

      overlay.innerHTML = `
        <div class="vsc-invideo-row">
          <button class="vsc-invideo-play-btn" type="button" title="Play" aria-label="Play">
            <svg class="vsc-invideo-icon-play" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            <svg class="vsc-invideo-icon-pause" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          </button>
          <div class="vsc-invideo-bar-wrap">
            <div class="vsc-invideo-time-bubble">0:00 / 0:00</div>
            <div class="vsc-invideo-track">
              <div class="vsc-invideo-progress"></div>
              <div class="vsc-invideo-thumb"></div>
            </div>
          </div>
          <div class="vsc-invideo-time-display" title="Playback Time (Elapsed / Total)">0:00 / 0:00</div>
          ${volumeMarkup}
        </div>
      `;

      this.overlayEl = overlay;
      this.playBtnEl = overlay.querySelector('.vsc-invideo-play-btn');
      this.barWrapEl = overlay.querySelector('.vsc-invideo-bar-wrap');
      this.trackEl = overlay.querySelector('.vsc-invideo-track');
      this.progressEl = overlay.querySelector('.vsc-invideo-progress');
      this.thumbEl = overlay.querySelector('.vsc-invideo-thumb');
      this.timeBubbleEl = overlay.querySelector('.vsc-invideo-time-bubble');
      this.timeDisplayEl = overlay.querySelector('.vsc-invideo-time-display');
      this.volWrapEl = overlay.querySelector('.vsc-invideo-volume-wrap');
      this.volPopupEl = overlay.querySelector('.vsc-invideo-volume-popup');
      this.volTrackEl = overlay.querySelector('.vsc-invideo-volume-track');
      this.volFillEl = overlay.querySelector('.vsc-invideo-volume-fill');
      this.volThumbEl = overlay.querySelector('.vsc-invideo-volume-thumb');
      this.volBtnEl = overlay.querySelector('.vsc-invideo-volume-btn');

      this.containerEl.appendChild(overlay);
      this.updateTimeDisplay();
      this.updatePlayState();

      this._lastSrc = this.video.currentSrc || this.video.src;
      if (this.context.isFacebook) {
        this.applySavedVolume(true);
      }
    }

    updateTimeDisplay() {
      if (!this.timeDisplayEl) return;
      this.timeDisplayEl.style.display = config.showScrubberTime !== false ? 'inline-flex' : 'none';
    }

    bindEvents() {
      this.video.addEventListener('timeupdate', this.onTimeUpdate, { passive: true });
      this.video.addEventListener('play', this.onPlay, { passive: true });
      this.video.addEventListener('playing', this.onPlay, { passive: true });
      this.video.addEventListener('pause', this.onPause, { passive: true });
      this.video.addEventListener('ended', this.onPause, { passive: true });
      this.video.addEventListener('loadedmetadata', () => {
        this.onTimeUpdate();
        if (this.context.isFacebook) this.applySavedVolume(true);
      }, { passive: true });
      this.video.addEventListener('seeked', this.onSeeked, { passive: true });
      this.video.addEventListener('resize', this.onTimeUpdate, { passive: true });
      this.video.addEventListener('loadeddata', () => {
        this.onTimeUpdate();
        if (this.context.isFacebook) this.applySavedVolume(true);
      }, { passive: true });
      this.video.addEventListener('canplay', () => {
        this.onTimeUpdate();
        if (this.context.isFacebook) this.applySavedVolume(true);
      }, { passive: true });
      this.video.addEventListener('volumechange', this.onVolumeChange, { passive: true });

      // Isolate click events directly on the overlay element
      const stopCapture = (e) => {
        if (e.target && e.target.closest('.vsc-invideo-play-btn, .vsc-invideo-volume-btn, .vsc-invideo-volume-popup')) {
          return;
        }
        e.stopPropagation();
        e.stopImmediatePropagation();
      };
      ['click', 'dblclick', 'contextmenu'].forEach((evt) => {
        this.overlayEl.addEventListener(evt, stopCapture, { capture: true });
      });

      if (this.playBtnEl) {
        const handlePlayClick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          this.togglePlay();
        };
        this.playBtnEl.addEventListener('click', handlePlayClick);
      }

      if (this.volWrapEl) {
        // Prevent Facebook Story viewer from seeing clicks/contextmenu on volume controls
        ['click', 'dblclick', 'contextmenu'].forEach((evt) => {
          this.volWrapEl.addEventListener(evt, (e) => {
            e.stopPropagation();
          });
        });

        // Hover intent timer: Keeps capsule open when cursor travels from speaker button to slider
        this.volWrapEl.addEventListener('mouseenter', () => {
          this.openVolPopup();
        });

        this.volWrapEl.addEventListener('mouseleave', () => {
          this.closeVolPopup(350);
        });

        this.volWrapEl.addEventListener(
          'wheel',
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.handleVolumeWheel(e);
          },
          { passive: false }
        );
      }

      if (this.volBtnEl) {
        this.volBtnEl.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          this.toggleMute();
        });
      }
    }

    openVolPopup() {
      if (this._volCloseTimer) {
        clearTimeout(this._volCloseTimer);
        this._volCloseTimer = null;
      }
      if (this.volWrapEl) {
        this.volWrapEl.classList.add('vsc-volume-active');
      }
    }

    closeVolPopup(delay = 350) {
      if (this.isVolDragging) return;
      if (this._volCloseTimer) {
        clearTimeout(this._volCloseTimer);
      }
      this._volCloseTimer = setTimeout(() => {
        if (!this.isVolDragging && this.volWrapEl) {
          this.volWrapEl.classList.remove('vsc-volume-active');
        }
      }, delay);
    }

    /**
     * Volume dragging handlers (invoked via window capture handlers)
     */
    startVolDragging(clientY) {
      this.isVolDragging = true;
      this._lastUserVolInteraction = Date.now();
      if (this.overlayEl) {
        this.overlayEl.classList.add('vsc-vol-dragging');
      }
      if (this.volWrapEl) {
        this.openVolPopup();
        this.volWrapEl.classList.add('vsc-vol-dragging');
      }
      this.setVolumeFromClientY(clientY);
    }

    stopVolDragging(upEvt) {
      this.isVolDragging = false;
      this._lastUserVolInteraction = Date.now();
      if (this.overlayEl) {
        this.overlayEl.classList.remove('vsc-vol-dragging');
      }
      if (this.volWrapEl) {
        this.volWrapEl.classList.remove('vsc-vol-dragging');
      }
      this.updateVolumeUI();
      if (this.volWrapEl && upEvt && typeof upEvt.clientX === 'number') {
        const inWrap = !!findVolBtnAtPoint(upEvt.clientX, upEvt.clientY) || !!findVolPopupAtPoint(upEvt.clientX, upEvt.clientY);
        if (!inWrap) {
          this.closeVolPopup(300);
        }
      }
    }

    /**
     * Called when a pointerdown/mousedown/touchstart lands on this scrubber's hit box
     */
    startDragging(clientX) {
      this.isDragging = true;
      if (this.overlayEl) {
        this.overlayEl.classList.add('vsc-scrubbing-active');
      }
      this.seekToPoint(clientX);
    }

    /**
     * Smoothly seeks video and visually updates track at 60fps
     */
    seekToPoint(clientX) {
      if (!this.trackEl || !this.video) return;
      const rect = this.trackEl.getBoundingClientRect();
      if (!rect.width || rect.width <= 0) return;

      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const duration = getVideoDuration(this.video);

      // Instant 60fps visual update
      const percent = Math.min(100, Math.max(0, ratio * 100));
      if (this.progressEl) this.progressEl.style.setProperty('width', `${percent}%`, 'important');
      if (this.thumbEl) this.thumbEl.style.setProperty('left', `${percent}%`, 'important');

      if (duration > 0) {
        const targetTime = Math.min(duration, Math.max(0, ratio * duration));
        if (this.timeDisplayEl && config.showScrubberTime) {
          this.timeDisplayEl.textContent = `${formatTime(targetTime)} / ${formatTime(duration)}`;
        }
        if (this.timeBubbleEl) {
          this.timeBubbleEl.textContent = `${formatTime(targetTime)} / ${formatTime(duration)}`;
          const bubblePct = Math.max(8, Math.min(92, percent));
          this.timeBubbleEl.style.setProperty('left', `${bubblePct}%`, 'important');
          this.timeBubbleEl.style.setProperty('opacity', '1', 'important');
        }
        try {
          this.video.currentTime = targetTime;
        } catch (err) {}
      }
    }

    stopDragging() {
      this.isDragging = false;
      if (this.overlayEl) {
        this.overlayEl.classList.remove('vsc-scrubbing-active');
      }
      if (this.timeBubbleEl) {
        this.timeBubbleEl.style.setProperty('opacity', '0', 'important');
      }
      this.updateProgress();
    }

    showHoverAt(clientX) {
      if (this.isDragging || !this.trackEl || !this.timeBubbleEl) return;
      const rect = this.trackEl.getBoundingClientRect();
      if (!rect.width || rect.width <= 0) return;

      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const duration = getVideoDuration(this.video);
      if (duration <= 0) return;

      const targetTime = ratio * duration;
      this.timeBubbleEl.textContent = `${formatTime(targetTime)} / ${formatTime(duration)}`;
      const percent = Math.max(8, Math.min(92, ratio * 100));
      this.timeBubbleEl.style.setProperty('left', `${percent}%`, 'important');
      this.timeBubbleEl.style.setProperty('opacity', '1', 'important');
    }

    hideHover() {
      if (!this.isDragging && this.timeBubbleEl) {
        this.timeBubbleEl.style.setProperty('opacity', '0', 'important');
      }
    }

    onTimeUpdate() {
      if (this.playBtnEl && this.video) {
        const isPlaying = !this.video.paused && !this.video.ended;
        if (this.playBtnEl.classList.contains('vsc-playing') !== isPlaying) {
          this.updatePlayState();
        }
      }

      // Detect story card change on Facebook (src change)
      if (this.context.isFacebook && this.video) {
        const curSrc = this.video.currentSrc || this.video.src;
        if (this._lastSrc && curSrc && this._lastSrc !== curSrc) {
          this._lastSrc = curSrc;
          this.applySavedVolume(true);
        } else if (!this._lastSrc && curSrc) {
          this._lastSrc = curSrc;
        }
      }

      if (this.isDragging) return;
      this.updateProgress();
    }

    onSeeked() {
      if (!this.isDragging) {
        this.updateProgress();
      }
    }

    updatePlayState() {
      if (!this.playBtnEl || !this.video) return;
      const isPlaying = !this.video.paused && !this.video.ended;
      this.playBtnEl.classList.toggle('vsc-playing', isPlaying);
      this.playBtnEl.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
      this.playBtnEl.title = isPlaying ? 'Pause' : 'Play';
    }

    togglePlay() {
      if (!this.video) return;
      const now = Date.now();
      if (this._lastToggle && now - this._lastToggle < 100) return;
      this._lastToggle = now;

      if (this.video.paused) {
        if (this.playBtnEl) {
          this.playBtnEl.classList.add('vsc-playing');
          this.playBtnEl.setAttribute('aria-label', 'Pause');
          this.playBtnEl.title = 'Pause';
        }
        const playPromise = this.video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            this.updatePlayState();
          });
        }
      } else {
        if (this.playBtnEl) {
          this.playBtnEl.classList.remove('vsc-playing');
          this.playBtnEl.setAttribute('aria-label', 'Play');
          this.playBtnEl.title = 'Play';
        }
        this.video.pause();
      }
    }

    onPlay() {
      this.updatePlayState();
      this.startTicker();
      if (this.context.isFacebook) {
        this.applySavedVolume(true);
        setTimeout(() => {
          if (this.video && !this.video.paused) {
            this.applySavedVolume(true);
          }
        }, 100);
      }
    }

    onPause() {
      this.updatePlayState();
      this.stopTicker();
      if (!this.isDragging) {
        this.updateProgress();
      }
    }

    startTicker() {
      this.stopTicker();
      const tick = () => {
        if (!this.video || this.video.paused) return;
        if (!this.isDragging) {
          this.updateProgress();
        }
        this.animFrameId = requestAnimationFrame(tick);
      };
      this.animFrameId = requestAnimationFrame(tick);
    }

    stopTicker() {
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
    }

    updateProgress() {
      if (!this.video || !this.progressEl || this.isDragging) return;

      const current = this.video.currentTime || 0;
      const duration = getVideoDuration(this.video);

      if (!duration || isNaN(duration) || duration <= 0) {
        this.progressEl.style.setProperty('width', '0%', 'important');
        if (this.thumbEl) this.thumbEl.style.setProperty('left', '0%', 'important');
        if (this.timeDisplayEl) {
          this.timeDisplayEl.textContent = '0:00 / 0:00';
        }
        return;
      }

      const percent = Math.min(100, Math.max(0, (current / duration) * 100));
      this.progressEl.style.setProperty('width', `${percent}%`, 'important');
      if (this.thumbEl) this.thumbEl.style.setProperty('left', `${percent}%`, 'important');
      if (this.timeDisplayEl) {
        this.timeDisplayEl.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
      }
    }

    updateContext() {
      const ctx = getContext(this.video);
      const isStory = isStoryVideo(this.video) || ctx.isStory;
      const isReel = ctx.isReel;
      const isFacebook = ctx.isFacebook;
      this.context.isStory = isStory;
      this.context.isReel = isReel;
      this.context.isFacebook = isFacebook;

      const idealContainer = findVideoContainer(this.video);
      if (idealContainer && idealContainer !== this.containerEl && this.overlayEl) {
        this.containerEl = idealContainer;
        this.containerEl.appendChild(this.overlayEl);
      }

      if (this.overlayEl) {
        this.overlayEl.classList.toggle('vsc-is-story', isStory);
        this.overlayEl.classList.toggle('vsc-is-fb-story', isStory && isFacebook);
        this.overlayEl.classList.toggle('vsc-is-ig-story', isStory && !isFacebook);
        this.overlayEl.classList.toggle('vsc-is-reel', !isStory && isReel);
        this.overlayEl.classList.toggle('vsc-is-feed', !isStory && !isReel);
      }
      if (!isFacebook && this.volWrapEl) {
        this.volWrapEl.remove();
        this.volWrapEl = null;
        this.volPopupEl = null;
        this.volBtnEl = null;
      }
      if (isFacebook) {
        this.applySavedVolume(true);
      }
      this.updateTimeDisplay();
    }

    applySavedVolume(forceUnmute = false) {
      if (!this.video || this.isVolDragging) return;
      if (!this.volWrapEl && !this.context.isFacebook) return;

      try {
        const targetVol = typeof savedAudioVolume === 'number' && savedAudioVolume > 0 ? savedAudioVolume : 0.8;
        this._internalVolumeChange = true;

        if (Math.abs(this.video.volume - targetVol) > 0.02) {
          this.video.volume = targetVol;
        }

        if (!savedIsMuted) {
          if (this.video.muted || forceUnmute) {
            this.video.muted = false;
          }
        } else {
          this.video.muted = true;
        }
      } catch (e) {}

      this.updateVolumeUI();
    }

    applyVolume(vol) {
      if (!this.video || typeof vol !== 'number') return;
      try {
        this._internalVolumeChange = true;
        this.video.volume = vol;
        if (!savedIsMuted) this.video.muted = false;
      } catch (e) {}
      this.updateVolumeUI();
    }

    updateVolumeUI() {
      if (!this.video || !this.volWrapEl) return;
      const isMuted = this.video.muted || this.video.volume === 0;
      const vol = isMuted ? 0 : this.video.volume;
      const pct = Math.max(0, Math.min(100, Math.round(vol * 100)));

      this.volWrapEl.classList.toggle('vsc-muted', isMuted);
      if (this.volFillEl) this.volFillEl.style.setProperty('height', `${pct}%`, 'important');
      if (this.volThumbEl) this.volThumbEl.style.setProperty('bottom', `${pct}%`, 'important');
    }

    onVolumeChange() {
      if (this._internalVolumeChange) {
        this._internalVolumeChange = false;
        this.updateVolumeUI();
        return;
      }

      if (this.isVolDragging) return;

      const now = Date.now();
      if (this._lastUserVolInteraction && now - this._lastUserVolInteraction < 800) {
        this.updateVolumeUI();
        return;
      }

      // On Facebook stories:
      // Facebook's story player resets video.muted = true or resets volume when advancing to a new story card.
      // If the user did NOT explicitly mute and didn't just adjust volume, restore saved level:
      if (this.context.isFacebook && (this.context.isStory || isStoryVideo(this.video))) {
        if (!savedIsMuted && (this.video.muted || Math.abs(this.video.volume - savedAudioVolume) > 0.05)) {
          this.applySavedVolume(true);
          return;
        }
      }

      this.updateVolumeUI();
    }

    setVolumeFromClientY(clientY) {
      if (!this.video) return;
      this._lastUserVolInteraction = Date.now();
      let ratio = 0.8;
      if (this.volTrackEl) {
        const rect = this.volTrackEl.getBoundingClientRect();
        const trackHeight = rect.height > 0 ? rect.height : 96;
        ratio = Math.max(0, Math.min(1, (rect.bottom - clientY) / trackHeight));
      } else if (this.volPopupEl) {
        const rect = this.volPopupEl.getBoundingClientRect();
        const popupHeight = rect.height > 0 ? rect.height : 124;
        ratio = Math.max(0, Math.min(1, (rect.bottom - clientY) / popupHeight));
      }
      const rounded = Math.round(ratio * 100) / 100;

      this._internalVolumeChange = true;
      try {
        this.video.volume = rounded;
        if (rounded > 0) {
          this.video.muted = false;
        } else {
          this.video.muted = true;
        }
      } catch (e) {}

      saveGlobalVolume(rounded, rounded === 0);
      this.updateVolumeUI();
    }

    toggleMute() {
      if (!this.video) return;
      const now = Date.now();
      if (this._lastMuteToggle && now - this._lastMuteToggle < 150) return;
      this._lastMuteToggle = now;
      this._lastUserVolInteraction = now;

      const willMute = !this.video.muted && this.video.volume > 0;
      this._internalVolumeChange = true;
      try {
        if (willMute) {
          this.video.muted = true;
          saveGlobalVolume(savedAudioVolume, true);
        } else {
          this.video.muted = false;
          if (this.video.volume === 0) {
            this.video.volume = savedAudioVolume > 0 ? savedAudioVolume : 0.8;
          }
          saveGlobalVolume(this.video.volume, false);
        }
      } catch (err) {}
      this.updateVolumeUI();
    }

    handleVolumeWheel(e) {
      if (!this.video) return;
      this._lastUserVolInteraction = Date.now();
      const current = this.video.muted ? 0 : this.video.volume;
      const step = e.deltaY < 0 ? 0.05 : -0.05;
      const newVol = Math.max(0, Math.min(1, Math.round((current + step) * 100) / 100));

      this._internalVolumeChange = true;
      try {
        this.video.volume = newVol;
        if (newVol > 0) {
          this.video.muted = false;
        } else {
          this.video.muted = true;
        }
      } catch (err) {}

      saveGlobalVolume(newVol, newVol === 0);
      this.openVolPopup();
      this.updateVolumeUI();
      this.closeVolPopup(1000);
    }

    destroy() {
      this.stopTicker();
      if (this._volCloseTimer) {
        clearTimeout(this._volCloseTimer);
        this._volCloseTimer = null;
      }
      if (activeVolDraggingInstance === this) {
        activeVolDraggingInstance = null;
      }
      if (activeDraggingInstance === this) {
        activeDraggingInstance = null;
      }
      if (this.video) {
        this.video.removeEventListener('timeupdate', this.onTimeUpdate);
        this.video.removeEventListener('play', this.onPlay);
        this.video.removeEventListener('playing', this.onPlay);
        this.video.removeEventListener('pause', this.onPause);
        this.video.removeEventListener('ended', this.onPause);
        this.video.removeEventListener('loadedmetadata', this.onTimeUpdate);
        this.video.removeEventListener('seeked', this.onSeeked);
        this.video.removeEventListener('resize', this.onTimeUpdate);
        this.video.removeEventListener('loadeddata', this.onTimeUpdate);
        this.video.removeEventListener('canplay', this.onTimeUpdate);
        this.video.removeEventListener('volumechange', this.onVolumeChange);
        delete this.video._vscScrubber;
      }
      if (this.overlayEl) {
        delete this.overlayEl._vscInstance;
        this.overlayEl.remove();
        this.overlayEl = null;
        this.playBtnEl = null;
        this.volWrapEl = null;
        this.volPopupEl = null;
        this.volBtnEl = null;
        this.volTrackEl = null;
        this.volFillEl = null;
        this.volThumbEl = null;
      }
    }
  }

  /**
   * Find if a coordinate (clientX, clientY) is over any active scrubber bar hit area
   */
  /**
   * Checks if screen coordinates are covered by an external UI layer
   * (such as a modal dialog, backdrop, close button, or header menu)
   * so the in-video controls never steal clicks or pointer events from host UI.
   */
  function isPointBlockedByExternalLayer(clientX, clientY, inst) {
    if (typeof clientX !== 'number' || typeof clientY !== 'number') return true;
    try {
      const topEl = document.elementFromPoint(clientX, clientY);
      if (!topEl) return false;

      // If topEl is a close, dismiss, back, or navigation button, NEVER claim
      if (
        topEl.closest(
          '[aria-label*="Close" i], [aria-label*="Fermer" i], [aria-label*="Schließen" i], [aria-label*="Chiudi" i], [aria-label*="Cerrar" i], [aria-label*="Dismiss" i], [aria-label*="Back" i], [aria-label*="Retour" i], [data-testid*="close" i], [data-testid*="dismiss" i]'
        )
      ) {
        return true;
      }

      // If an active modal is in the DOM, but our video is NOT inside that modal, don't claim
      const activeModal = document.querySelector('div[role="dialog"], [aria-modal="true"]');
      if (activeModal && !activeModal.contains(inst.video)) {
        return true;
      }

      // If topEl is outside our video overlay and outside the video's parent container
      // (meaning a modal backdrop, external menu, header, etc. covers the point)
      if (
        !inst.overlayEl.contains(topEl) &&
        !inst.video.contains(topEl) &&
        !inst.video.parentElement?.contains(topEl)
      ) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function findScrubberAtPoint(clientX, clientY) {
    if (typeof clientX !== 'number' || typeof clientY !== 'number') return null;

    for (const [video, inst] of scrubbers.entries()) {
      if (!video.isConnected || video.offsetWidth === 0 || video.offsetHeight === 0) continue;
      if (!inst.overlayEl || !inst.overlayEl.isConnected) continue;

      const targetEl = inst.barWrapEl;
      if (!targetEl) continue;
      const rect = targetEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      // Generous vertical hit target (+14px top and bottom) for effortless touch/click
      const top = rect.top - 14;
      const bottom = rect.bottom + 14;
      const left = rect.left;
      const right = rect.right;

      if (clientX >= left && clientX <= right && clientY >= top && clientY <= bottom) {
        if (isPointBlockedByExternalLayer(clientX, clientY, inst)) continue;
        return inst;
      }
    }
    return null;
  }

  function findPlayBtnAtPoint(clientX, clientY) {
    if (typeof clientX !== 'number' || typeof clientY !== 'number') return null;

    for (const [video, inst] of scrubbers.entries()) {
      if (!video.isConnected || video.offsetWidth === 0 || video.offsetHeight === 0) continue;
      if (!inst.overlayEl || !inst.overlayEl.isConnected || !inst.playBtnEl) continue;

      const rect = inst.playBtnEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      // Hit area around the button (+6px padding for easy touch/click)
      const top = rect.top - 6;
      const bottom = rect.bottom + 6;
      const left = rect.left - 6;
      const right = rect.right + 6;

      if (clientX >= left && clientX <= right && clientY >= top && clientY <= bottom) {
        if (isPointBlockedByExternalLayer(clientX, clientY, inst)) continue;
        return inst;
      }
    }
    return null;
  }

  function findVolBtnAtPoint(clientX, clientY) {
    if (typeof clientX !== 'number' || typeof clientY !== 'number') return null;

    for (const [video, inst] of scrubbers.entries()) {
      if (!video.isConnected || video.offsetWidth === 0 || video.offsetHeight === 0) continue;
      if (!inst.overlayEl || !inst.overlayEl.isConnected || !inst.volBtnEl) continue;

      const rect = inst.volBtnEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      // Hit area around the volume speaker button (+8px padding for easy touch/click)
      const top = rect.top - 8;
      const bottom = rect.bottom + 8;
      const left = rect.left - 8;
      const right = rect.right + 8;

      if (clientX >= left && clientX <= right && clientY >= top && clientY <= bottom) {
        if (isPointBlockedByExternalLayer(clientX, clientY, inst)) continue;
        return inst;
      }
    }
    return null;
  }

  function findVolPopupAtPoint(clientX, clientY) {
    if (typeof clientX !== 'number' || typeof clientY !== 'number') return null;

    for (const [video, inst] of scrubbers.entries()) {
      if (!video.isConnected || video.offsetWidth === 0 || video.offsetHeight === 0) continue;
      if (!inst.overlayEl || !inst.overlayEl.isConnected || !inst.volWrapEl) continue;

      const targetEl = (inst.volWrapEl.classList.contains('vsc-volume-active') || inst.isVolDragging) && inst.volPopupEl
        ? inst.volPopupEl
        : inst.volWrapEl;
      if (!targetEl) continue;

      const rect = targetEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      // Hit area around vertical slider popup (+10px padding)
      const top = rect.top - 10;
      const bottom = rect.bottom + 10;
      const left = rect.left - 10;
      const right = rect.right + 10;

      if (clientX >= left && clientX <= right && clientY >= top && clientY <= bottom) {
        if (isPointBlockedByExternalLayer(clientX, clientY, inst)) continue;
        return inst;
      }
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Global Window-Level Capture Event Handlers (100% Unblockable Interactions)
  // --------------------------------------------------------------------------

  function handleCaptureDown(e) {
    if (e.button && e.button !== 0) return;

    let clientX = e.clientX;
    let clientY = e.clientY;
    if (clientX === undefined && e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }

    const directOverlay = e.target?.closest?.('.vsc-invideo-container');

    // NEVER intercept close, dismiss, back, dialog, stories, or header controls
    if (!directOverlay) {
      if (
        e.target?.closest?.(
          '[aria-label*="Close" i], [aria-label*="Fermer" i], [aria-label*="Schließen" i], [aria-label*="Chiudi" i], [aria-label*="Cerrar" i], [aria-label*="Dismiss" i], [aria-label*="Back" i], [aria-label*="Retour" i], [data-testid*="close" i], [data-testid*="dismiss" i], a[href*="/stories/"], section[aria-label*="Stories" i], div[role="menu"], header, .vsc-fb-volume-capsule'
        )
      ) {
        return;
      }
    }

    // 1. Direct hit or coordinate hit on Play/Pause button
    const playBtnHit = e.target?.closest?.('.vsc-invideo-play-btn') ? directOverlay?._vscInstance : findPlayBtnAtPoint(clientX, clientY);
    if (playBtnHit) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      playBtnHit.togglePlay();
      return;
    }

    // 2. Direct hit or coordinate hit on Volume slider popup / track (Initiate unblockable volume dragging)
    const volSliderTarget = e.target?.closest?.(
      '.vsc-invideo-volume-wrap, .vsc-invideo-volume-popup, .vsc-invideo-volume-slider, .vsc-invideo-volume-track, .vsc-invideo-volume-thumb, .vsc-invideo-volume-fill'
    );
    const volSliderHit = volSliderTarget ? volSliderTarget.closest('.vsc-invideo-container')?._vscInstance : findVolPopupAtPoint(clientX, clientY);
    if (volSliderHit) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      activeVolDraggingInstance = volSliderHit;
      volSliderHit.startVolDragging(clientY);
      return;
    }

    // 3. Direct hit or coordinate hit on Volume speaker button
    const volBtnHit = e.target?.closest?.('.vsc-invideo-volume-btn') ? directOverlay?._vscInstance : findVolBtnAtPoint(clientX, clientY);
    if (volBtnHit) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      volBtnHit.openVolPopup();
      volBtnHit.toggleMute();
      return;
    }

    // 4. Scrubber timeline hit
    const inst = directOverlay?._vscInstance || findScrubberAtPoint(clientX, clientY);
    if (inst) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      activeDraggingInstance = inst;
      wasDraggingJustNow = true;
      clearTimeout(dragResetTimer);

      inst.startDragging(clientX);
      return;
    }

    // NEVER intercept Stories button or Stories tray interactions on feed/header
    if (!directOverlay) {
      if (
        e.target?.closest?.(
          'a[href*="/stories/"], section[aria-label*="Stories" i], div[role="menu"], header, .vsc-fb-volume-capsule'
        )
      ) {
        return;
      }
    }
  }

  function handleCaptureMove(e) {
    let clientX = e.clientX;
    let clientY = e.clientY;
    if (clientX === undefined && e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }

    if (activeVolDraggingInstance) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      activeVolDraggingInstance.setVolumeFromClientY(clientY);
      return;
    }

    if (activeDraggingInstance) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      activeDraggingInstance.seekToPoint(clientX);
      return;
    }

    // Hover volume detection (coordinates-based so transparent link overlays can't block hover)
    if (typeof clientX === 'number' && typeof clientY === 'number') {
      const volHoverInst = findVolBtnAtPoint(clientX, clientY) || findVolPopupAtPoint(clientX, clientY);
      if (volHoverInst) {
        volHoverInst.openVolPopup();
        volHoverInst.hideHover();
        return;
      } else {
        for (const [vid, scrubber] of scrubbers.entries()) {
          if (scrubber.volWrapEl?.classList.contains('vsc-volume-active') && !scrubber.isVolDragging) {
            scrubber.closeVolPopup(300);
          }
        }
      }

      // Hover timestamp bubble tracking
      const isButton =
        e.target?.closest?.('.vsc-invideo-play-btn, .vsc-invideo-volume-wrap, .vsc-invideo-volume-popup, .vsc-invideo-volume-btn') ||
        findPlayBtnAtPoint(clientX, clientY) ||
        findVolBtnAtPoint(clientX, clientY) ||
        findVolPopupAtPoint(clientX, clientY);

      if (isButton) {
        for (const [vid, scrubber] of scrubbers.entries()) {
          scrubber.hideHover();
        }
        return;
      }

      const directOverlay = e.target?.closest?.('.vsc-invideo-container');
      const hoveredInst = directOverlay?._vscInstance || findScrubberAtPoint(clientX, clientY);
      for (const [vid, scrubber] of scrubbers.entries()) {
        if (scrubber === hoveredInst) {
          scrubber.showHoverAt(clientX);
        } else {
          scrubber.hideHover();
        }
      }
    }
  }

  function handleCaptureUp(e) {
    if (activeVolDraggingInstance) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      activeVolDraggingInstance.stopVolDragging(e);
      activeVolDraggingInstance = null;
    }

    if (activeDraggingInstance) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      activeDraggingInstance.stopDragging();
      activeDraggingInstance = null;

      clearTimeout(dragResetTimer);
      dragResetTimer = setTimeout(() => {
        wasDraggingJustNow = false;
      }, 150);
    }
  }

  window.addEventListener('blur', () => {
    if (activeVolDraggingInstance) {
      activeVolDraggingInstance.stopVolDragging();
      activeVolDraggingInstance = null;
    }
    if (activeDraggingInstance) {
      activeDraggingInstance.stopDragging();
      activeDraggingInstance = null;
    }
    wasDraggingJustNow = false;
  });

  // Register window-level capture listeners
  ['pointerdown', 'mousedown', 'touchstart'].forEach((evt) => {
    window.addEventListener(evt, handleCaptureDown, { capture: true, passive: false });
  });

  ['pointermove', 'mousemove', 'touchmove'].forEach((evt) => {
    window.addEventListener(evt, handleCaptureMove, { capture: true, passive: false });
  });

  ['pointerup', 'pointercancel', 'mouseup', 'touchend', 'touchcancel'].forEach((evt) => {
    window.addEventListener(evt, handleCaptureUp, { capture: true, passive: false });
  });

  // Block clicks on any extension control area so underlying links (like Instagram profile) never navigate
  window.addEventListener(
    'click',
    (e) => {
      let clientX = e.clientX;
      let clientY = e.clientY;
      if (clientX === undefined && e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }

      const directOverlay = e.target?.closest?.('.vsc-invideo-container');

      // NEVER intercept close, dismiss, back, dialog, stories, or header controls
      if (!directOverlay) {
        if (
          e.target?.closest?.(
            '[aria-label*="Close" i], [aria-label*="Fermer" i], [aria-label*="Schließen" i], [aria-label*="Chiudi" i], [aria-label*="Cerrar" i], [aria-label*="Dismiss" i], [aria-label*="Back" i], [aria-label*="Retour" i], [data-testid*="close" i], [data-testid*="dismiss" i], a[href*="/stories/"], section[aria-label*="Stories" i], div[role="menu"], header, .vsc-fb-volume-capsule'
          )
        ) {
          return;
        }
      }

      // Check if click is on or over Volume button (element target OR screen coordinates)
      const volBtn = e.target?.closest?.('.vsc-invideo-volume-btn');
      const volBtnInst = (volBtn ? volBtn.closest('.vsc-invideo-container')?._vscInstance : null) || findVolBtnAtPoint(clientX, clientY);
      if (volBtnInst) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }

      // Check if click is inside Volume slider popup/wrap (element target OR screen coordinates)
      const volPopup = e.target?.closest?.('.vsc-invideo-volume-wrap, .vsc-invideo-volume-popup');
      const volPopupInst = (volPopup ? volPopup.closest('.vsc-invideo-container')?._vscInstance : null) || findVolPopupAtPoint(clientX, clientY);
      if (volPopupInst) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }

      // Check if click is on Play/Pause button (element target OR screen coordinates)
      const playBtn = e.target?.closest?.('.vsc-invideo-play-btn');
      const playInst = (playBtn ? playBtn.closest('.vsc-invideo-container')?._vscInstance : null) || findPlayBtnAtPoint(clientX, clientY);
      if (playInst) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }

      // Check if click is on Scrubber timeline
      if (wasDraggingJustNow || directOverlay || findScrubberAtPoint(clientX, clientY)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }
    },
    { capture: true }
  );

  // Mouse wheel support for volume and timeline scrubbing
  window.addEventListener(
    'wheel',
    (e) => {
      const volWrap = e.target?.closest?.('.vsc-invideo-volume-wrap, .vsc-invideo-volume-popup');
      const volInst = (volWrap ? volWrap.closest('.vsc-invideo-container')?._vscInstance : null) || findVolBtnAtPoint(e.clientX, e.clientY) || findVolPopupAtPoint(e.clientX, e.clientY);
      if (volInst) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        volInst.handleVolumeWheel(e);
        return;
      }

      const directOverlay = e.target?.closest?.('.vsc-invideo-container');
      const inst = directOverlay?._vscInstance || findScrubberAtPoint(e.clientX, e.clientY);
      if (!inst) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const duration = getVideoDuration(inst.video);
      if (!duration) return;

      const step = e.deltaY < 0 ? 1.5 : -1.5;
      const targetTime = Math.min(duration, Math.max(0, (inst.video.currentTime || 0) + step));
      try {
        inst.video.currentTime = targetTime;
      } catch (err) {}

      const ratio = targetTime / duration;
      const pct = Math.min(100, Math.max(0, ratio * 100));
      if (inst.progressEl) inst.progressEl.style.setProperty('width', `${pct}%`, 'important');
      if (inst.thumbEl) inst.thumbEl.style.setProperty('left', `${pct}%`, 'important');
      if (inst.timeDisplayEl && config.showScrubberTime) {
        inst.timeDisplayEl.textContent = `${formatTime(targetTime)} / ${formatTime(duration)}`;
      }
    },
    { capture: true, passive: false }
  );

  /**
   * In-Video Scrubber Controller Manager
   */
  const InVideoScrubber = {
    init(savedConfig) {
      if (savedConfig) {
        this.updateConfig(savedConfig);
      }

      // Periodically scan for Facebook Stories volume continuity and clean up detached videos
      setInterval(() => {
        for (const [video, instance] of scrubbers.entries()) {
          if (!video.isConnected) {
            instance.destroy();
            scrubbers.delete(video);
          } else if (instance.context.isFacebook && !video.paused) {
            // Guarantee story-to-story volume continuity on Facebook Stories
            if (!savedIsMuted && (video.muted || Math.abs(video.volume - savedAudioVolume) > 0.05)) {
              instance.applySavedVolume(true);
            }
          }
        }
      }, 500);
    },

    updateConfig(newConfig) {
      config = { ...config, ...newConfig };
      for (const [video, instance] of scrubbers.entries()) {
        instance.updateTimeDisplay();
      }
      this.syncAll();
    },

    attach(video) {
      if (!video || !video.isConnected) return;

      const context = getContext(video);
      const enabled = shouldEnable(context);

      if (!enabled) {
        if (scrubbers.has(video)) {
          scrubbers.get(video).destroy();
          scrubbers.delete(video);
        }
        return;
      }

      // Ignore zero-size, hidden, avatar, or thumbnail videos (< 80px)
      const vRect = video.getBoundingClientRect();
      if (vRect.width < 80 || vRect.height < 80) {
        return;
      }

      // Never attach to videos inside stories tray, header, or menu if not on /stories/ page
      if (!window.location.pathname.startsWith('/stories/')) {
        if (
          video.closest(
            'header, [role="menu"], section[aria-label*="Stories" i], div[aria-label*="Stories" i]'
          )
        ) {
          return;
        }
      }

      // If already attached to this video and still connected, update context, re-assert volume and return
      if (scrubbers.has(video)) {
        const inst = scrubbers.get(video);
        if (inst.overlayEl && inst.overlayEl.isConnected) {
          inst.updateContext();
          if (inst.context.isFacebook) {
            inst.applySavedVolume(true);
          }
          return;
        }
        inst.destroy();
        scrubbers.delete(video);
      }

      const container = findVideoContainer(video);
      if (!container) return;

      // Ensure NO duplicate scrubbers exist in this container
      const existing = container.querySelectorAll('.vsc-invideo-container');
      for (const el of existing) {
        el.remove();
      }

      // Also clean up any orphan scrubbers whose video is detached or sharing container
      for (const [otherVideo, otherInst] of scrubbers.entries()) {
        if (!otherVideo.isConnected || otherVideo === video || otherInst.containerEl === container) {
          otherInst.destroy();
          scrubbers.delete(otherVideo);
        }
      }

      // Create new scrubber instance
      const instance = new VideoScrubberInstance(video, context);
      video._vscScrubber = instance;
      scrubbers.set(video, instance);
    },

    syncAll() {
      const context = getContext();
      const enabled = shouldEnable(context);
      const videos = document.querySelectorAll('video');

      if (!enabled) {
        for (const [video, instance] of scrubbers.entries()) {
          instance.destroy();
        }
        scrubbers.clear();
        return;
      }

      for (const [video, instance] of scrubbers.entries()) {
        instance.updateContext();
      }

      for (const video of videos) {
        this.attach(video);
      }
    },

    isPlayBtnAtPoint(clientX, clientY) {
      return !!findPlayBtnAtPoint(clientX, clientY);
    },

    isScrubberAtPoint(clientX, clientY) {
      return !!findScrubberAtPoint(clientX, clientY);
    },

    isVolBtnAtPoint(clientX, clientY) {
      return !!findVolBtnAtPoint(clientX, clientY);
    },

    isVolPopupAtPoint(clientX, clientY) {
      return !!findVolPopupAtPoint(clientX, clientY);
    }
  };

  // Expose to window
  window.InVideoScrubber = InVideoScrubber;
})();
