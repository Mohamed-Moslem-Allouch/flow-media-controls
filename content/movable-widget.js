/**
 * Flow — Media Controls for Instagram & Facebook
 * Author: Mohamed Moslem Allouch
 * License: MIT
 */

(function () {
  'use strict';

  let widgetEl = null;
  let speedValueEl = null;
  let speedTextEl = null;
  let timelineRowEl = null;
  let timelineFillEl = null;
  let timelineThumbEl = null;
  let timeCurrentEl = null;
  let timeDurationEl = null;
  let timelineTrackEl = null;
  let toggleMinBtnEl = null;
  let onSpeedChangeCallback = null;
  let currentSpeed = 1.0;
  let isSeeking = false;
  let isMinimized = false;
  let showTimeline = true;

  // Crisp Modern SVG Icons
  const ICONS = {
    drag: `<svg class="vsc-icon-drag" width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
      <circle cx="3" cy="3" r="1"/>
      <circle cx="7" cy="3" r="1"/>
      <circle cx="3" cy="7" r="1"/>
      <circle cx="7" cy="7" r="1"/>
      <circle cx="3" cy="11" r="1"/>
      <circle cx="7" cy="11" r="1"/>
    </svg>`,
    minus: `<svg width="10" height="2" viewBox="0 0 10 2" fill="currentColor">
      <rect width="10" height="2" rx="1"/>
    </svg>`,
    plus: `<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <path d="M4 1a1 1 0 0 1 2 0v3h3a1 1 0 1 1 0 2H6v3a1 1 0 1 1-2 0V6H1a1 1 0 1 1 0-2h3V1z"/>
    </svg>`,
    minimize: `<svg class="vsc-icon-min" width="10" height="2" viewBox="0 0 10 2" fill="currentColor">
      <rect width="10" height="2" rx="1"/>
    </svg>`,
    expand: `<svg class="vsc-icon-expand" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <polyline points="6 1 9 1 9 4"></polyline>
      <polyline points="4 9 1 9 1 6"></polyline>
      <line x1="9" y1="1" x2="5.5" y2="4.5"></line>
      <line x1="1" y1="9" x2="4.5" y2="5.5"></line>
    </svg>`,
    bolt: `<svg class="vsc-icon-bolt" width="10" height="12" viewBox="0 0 24 24" fill="url(#vsc-bolt-grad)" stroke="none">
      <defs>
        <linearGradient id="vsc-bolt-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#6366f1"/>
          <stop offset="100%" stop-color="#ec4899"/>
        </linearGradient>
      </defs>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
    </svg>`
  };

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function getActiveVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;

    const playing = videos.find((v) => !v.paused && v.readyState > 1);
    if (playing) return playing;

    let maxArea = 0;
    let best = null;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    for (const v of videos) {
      const rect = v.getBoundingClientRect();
      const visibleW = Math.max(0, Math.min(rect.right, viewW) - Math.max(rect.left, 0));
      const visibleH = Math.max(0, Math.min(rect.bottom, viewH) - Math.max(rect.top, 0));
      const area = visibleW * visibleH;
      if (area > maxArea) {
        maxArea = area;
        best = v;
      }
    }
    return best || videos[0];
  }

  const MovableWidget = {
    init(speed, onSpeedChange, options = {}) {
      currentSpeed = speed;
      onSpeedChangeCallback = onSpeedChange;
      isMinimized = !!options.minimized;
      showTimeline = options.showTimeline !== false;

      if (document.getElementById('vsc-movable-widget')) {
        this.updateSpeed(speed);
        this.setMinimized(isMinimized);
        this.setTimelineVisibility(showTimeline);
        return;
      }

      const widget = document.createElement('div');
      widget.id = 'vsc-movable-widget';
      const isVisible = options.visible !== false;
      widget.className = 'vsc-movable-widget' + 
                         (isMinimized ? ' vsc-minimized' : '') + 
                         (!showTimeline ? ' vsc-no-timeline' : '') +
                         (!isVisible ? ' vsc-hidden' : '');
      widget.style.setProperty('display', isVisible ? 'inline-flex' : 'none', 'important');

      // Load saved position
      const savedPos = options.position || { top: 90, left: 30 };
      this.applyPosition(widget, savedPos.top, savedPos.left);

      // Construct Streamlined Modern Architecture
      widget.innerHTML = `
        <div class="vsc-bar-row">
          <!-- Tactile Drag Grip -->
          <div class="vsc-drag-handle" title="Drag to reposition controller">${ICONS.drag}</div>

          <!-- Stepper Minus -->
          <button class="vsc-icon-btn vsc-btn-minus" title="Decrease speed (−0.1x / Shift: −0.25x)">${ICONS.minus}</button>

          <!-- Core Speed Display Badge -->
          <div class="vsc-speed-badge" title="Click: Reset 1.00x | Drag left/right: Fine scrub | Wheel: Adjust | Double-click: Minimize">
            <span class="vsc-speed-dot"></span>
            <span class="vsc-speed-text">${speed.toFixed(2)}x</span>
          </div>

          <!-- Stepper Plus -->
          <button class="vsc-icon-btn vsc-btn-plus" title="Increase speed (+0.1x / Shift: +0.25x)">${ICONS.plus}</button>

          <!-- Minimize / Expand Toggle Button -->
          <button class="vsc-icon-btn vsc-btn-toggle-min" title="${isMinimized ? 'Expand controller' : 'Minimize to compact pill'}">
            ${isMinimized ? ICONS.expand : ICONS.minimize}
          </button>
        </div>

        <!-- Optional Micro Timeline (compact & clean) -->
        <div class="vsc-timeline-row" title="Timeline (Click/drag to seek)">
          <span class="vsc-time-current">0:00</span>
          <div class="vsc-timeline-track">
            <div class="vsc-timeline-fill"></div>
            <div class="vsc-timeline-thumb"></div>
          </div>
          <span class="vsc-time-duration">0:00</span>
        </div>
      `;

      widgetEl = widget;
      speedValueEl = widget.querySelector('.vsc-speed-badge');
      speedTextEl = widget.querySelector('.vsc-speed-text');
      timelineRowEl = widget.querySelector('.vsc-timeline-row');
      timelineTrackEl = widget.querySelector('.vsc-timeline-track');
      timelineFillEl = widget.querySelector('.vsc-timeline-fill');
      timelineThumbEl = widget.querySelector('.vsc-timeline-thumb');
      timeCurrentEl = widget.querySelector('.vsc-time-current');
      timeDurationEl = widget.querySelector('.vsc-time-duration');
      toggleMinBtnEl = widget.querySelector('.vsc-btn-toggle-min');

      this.bindDrag(widget);
      this.bindSpeedEvents(widget);
      this.bindTimelineEvents();
      this.startProgressTicker();

      const mountTarget = document.body || document.documentElement;
      if (mountTarget) {
        mountTarget.appendChild(widget);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          const target = document.body || document.documentElement;
          if (target && !widget.isConnected) target.appendChild(widget);
        }, { once: true });
      }
    },

    applyPosition(el, top, left) {
      const maxLeft = Math.max(10, window.innerWidth - 240);
      const maxTop = Math.max(10, window.innerHeight - 70);
      const clampedLeft = Math.max(10, Math.min(left, maxLeft));
      const clampedTop = Math.max(10, Math.min(top, maxTop));

      el.style.top = `${clampedTop}px`;
      el.style.left = `${clampedLeft}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    },

    bindDrag(widget) {
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;

      const onPointerDown = (e) => {
        if (e.button && e.button !== 0) return;

        isDragging = true;
        widget.classList.add('vsc-dragging');

        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        startX = clientX;
        startY = clientY;

        const rect = widget.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        document.addEventListener('mousemove', onPointerMove, { passive: false });
        document.addEventListener('mouseup', onPointerUp);
        document.addEventListener('touchmove', onPointerMove, { passive: false });
        document.addEventListener('touchend', onPointerUp);

        e.preventDefault();
      };

      const onPointerMove = (e) => {
        if (!isDragging) return;

        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        const deltaX = clientX - startX;
        const deltaY = clientY - startY;

        let newLeft = initialLeft + deltaX;
        let newTop = initialTop + deltaY;

        const maxLeft = Math.max(0, window.innerWidth - widget.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - widget.offsetHeight);

        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        widget.style.left = `${newLeft}px`;
        widget.style.top = `${newTop}px`;

        e.preventDefault();
      };

      const onPointerUp = () => {
        if (!isDragging) return;
        isDragging = false;
        widget.classList.remove('vsc-dragging');

        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('mouseup', onPointerUp);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('touchend', onPointerUp);

        const rect = widget.getBoundingClientRect();
        chrome.storage.local.set({
          widgetPos: { top: Math.round(rect.top), left: Math.round(rect.left) }
        }).catch(() => {});
      };

      // Drag from handle or anywhere on widget background
      widget.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, .vsc-speed-badge, .vsc-timeline-track')) {
          return;
        }
        onPointerDown(e);
      });

      widget.addEventListener('touchstart', (e) => {
        if (e.target.closest('button, .vsc-speed-badge, .vsc-timeline-track')) {
          return;
        }
        onPointerDown(e);
      }, { passive: false });
    },

    bindSpeedEvents(widget) {
      const btnMinus = widget.querySelector('.vsc-btn-minus');
      const btnPlus = widget.querySelector('.vsc-btn-plus');

      // Steppers
      btnMinus.addEventListener('click', (e) => {
        e.stopPropagation();
        const step = e.shiftKey ? 0.25 : 0.1;
        this.triggerSpeedChange(currentSpeed - step);
      });

      btnPlus.addEventListener('click', (e) => {
        e.stopPropagation();
        const step = e.shiftKey ? 0.25 : 0.1;
        this.triggerSpeedChange(currentSpeed + step);
      });

      // Horizontal Drag-to-Scrub Speed Gesture
      let isScrubbing = false;
      let startX = 0;
      let startSpeed = currentSpeed;
      let hasDragged = false;

      const onScrubDown = (e) => {
        if (e.button && e.button !== 0) return;
        e.stopPropagation();

        isScrubbing = true;
        hasDragged = false;
        startX = e.clientX || (e.touches && e.touches[0].clientX);
        startSpeed = currentSpeed;

        speedValueEl.classList.add('vsc-scrubbing');
        document.body.style.cursor = 'ew-resize';

        document.addEventListener('mousemove', onScrubMove, { passive: false });
        document.addEventListener('mouseup', onScrubUp);
        document.addEventListener('touchmove', onScrubMove, { passive: false });
        document.addEventListener('touchend', onScrubUp);
      };

      const onScrubMove = (e) => {
        if (!isScrubbing) return;
        const currentX = e.clientX || (e.touches && e.touches[0].clientX);
        const deltaX = currentX - startX;

        if (Math.abs(deltaX) > 2) {
          hasDragged = true;
          const stepSize = e.shiftKey ? 0.02 : 0.05;
          const steps = Math.round(deltaX / 10);
          const newSpeed = Math.min(5.0, Math.max(0.25, Math.round((startSpeed + steps * stepSize) * 100) / 100));

          if (Math.abs(newSpeed - currentSpeed) > 0.01) {
            this.triggerSpeedChange(newSpeed);
          }
        }
        e.preventDefault();
      };

      const onScrubUp = () => {
        if (!isScrubbing) return;
        isScrubbing = false;
        speedValueEl.classList.remove('vsc-scrubbing');
        document.body.style.cursor = '';

        document.removeEventListener('mousemove', onScrubMove);
        document.removeEventListener('mouseup', onScrubUp);
        document.removeEventListener('touchmove', onScrubMove);
        document.removeEventListener('touchend', onScrubUp);
      };

      speedValueEl.addEventListener('mousedown', onScrubDown);
      speedValueEl.addEventListener('touchstart', onScrubDown, { passive: false });

      // Click Speed Readout to Reset to 1.0x (if not dragged)
      speedValueEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!hasDragged) {
          this.triggerSpeedChange(1.0);
        }
      });

      // Mouse Wheel over Speed Badge to fine-adjust speed
      speedValueEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        this.triggerSpeedChange(currentSpeed + delta);
      }, { passive: false });

      // Double-click speed badge to toggle minimize mode
      speedValueEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.setMinimized(!isMinimized);
      });

      // Toggle Minimize / Expand Button
      if (toggleMinBtnEl) {
        toggleMinBtnEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.setMinimized(!isMinimized);
        });
      }
    },

    bindTimelineEvents() {
      if (!timelineTrackEl) return;

      const seekTo = (e) => {
        const video = getActiveVideo();
        if (!video || !video.duration) return;

        const rect = timelineTrackEl.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

        video.currentTime = percent * video.duration;
        this.updateTimelineUI(video.currentTime, video.duration);
      };

      const onSeekDown = (e) => {
        e.stopPropagation();
        isSeeking = true;
        seekTo(e);

        const onSeekMove = (ev) => {
          if (isSeeking) seekTo(ev);
        };

        const onSeekUp = () => {
          isSeeking = false;
          document.removeEventListener('mousemove', onSeekMove);
          document.removeEventListener('mouseup', onSeekUp);
          document.removeEventListener('touchmove', onSeekMove);
          document.removeEventListener('touchend', onSeekUp);
        };

        document.addEventListener('mousemove', onSeekMove);
        document.addEventListener('mouseup', onSeekUp);
        document.addEventListener('touchmove', onSeekMove);
        document.addEventListener('touchend', onSeekUp);
      };

      timelineTrackEl.addEventListener('mousedown', onSeekDown);
      timelineTrackEl.addEventListener('touchstart', onSeekDown, { passive: false });
    },

    startProgressTicker() {
      const tick = () => {
        if (!isSeeking && showTimeline && !isMinimized) {
          const video = getActiveVideo();
          if (video && video.duration && !isNaN(video.duration)) {
            this.updateTimelineUI(video.currentTime, video.duration);
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },

    updateTimelineUI(current, duration) {
      if (!timelineFillEl || !timelineThumbEl) return;
      if (!duration || duration <= 0) {
        timelineFillEl.style.setProperty('width', '0%', 'important');
        timelineThumbEl.style.setProperty('left', '0%', 'important');
        if (timeCurrentEl) timeCurrentEl.textContent = '0:00';
        if (timeDurationEl) timeDurationEl.textContent = '0:00';
        return;
      }

      const percent = Math.min(100, Math.max(0, (current / duration) * 100));
      timelineFillEl.style.setProperty('width', `${percent}%`, 'important');
      timelineThumbEl.style.setProperty('left', `${percent}%`, 'important');
      if (timeCurrentEl) timeCurrentEl.textContent = formatTime(current);
      if (timeDurationEl) timeDurationEl.textContent = formatTime(duration);
    },

    triggerSpeedChange(newSpeed) {
      const clamped = Math.min(5.0, Math.max(0.25, Math.round(newSpeed * 100) / 100));
      currentSpeed = clamped;
      this.updateSpeed(currentSpeed);
      if (typeof onSpeedChangeCallback === 'function') {
        onSpeedChangeCallback(currentSpeed);
      }
    },

    updateSpeed(speed) {
      currentSpeed = speed;
      if (speedTextEl) {
        speedTextEl.textContent = `${speed.toFixed(2)}x`;
      }
    },

    setMinimized(minimized) {
      isMinimized = !!minimized;
      if (widgetEl) {
        widgetEl.classList.toggle('vsc-minimized', isMinimized);
      }
      if (toggleMinBtnEl) {
        toggleMinBtnEl.innerHTML = isMinimized ? ICONS.expand : ICONS.minimize;
        toggleMinBtnEl.title = isMinimized ? 'Expand controller' : 'Minimize to compact pill';
      }
      if (speedValueEl) {
        speedValueEl.title = isMinimized
          ? 'Drag left/right to scrub speed | Double-click: Expand | Click: 1.00x'
          : 'Drag left/right to scrub speed | Double-click: Minimize | Click: 1.00x';
      }
      chrome.storage.local.set({ widgetMinimized: isMinimized }).catch(() => {});
    },

    setVisibility(visible) {
      if (widgetEl) {
        widgetEl.classList.toggle('vsc-hidden', !visible);
        widgetEl.style.setProperty('display', visible ? 'inline-flex' : 'none', 'important');
      }
    },

    setTimelineVisibility(show) {
      showTimeline = show !== false;
      if (widgetEl) {
        widgetEl.classList.toggle('vsc-no-timeline', !showTimeline);
      }
    }
  };

  window.MovableWidget = MovableWidget;
})();
