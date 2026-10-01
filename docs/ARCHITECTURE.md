# Flow — Technical Architecture & Component Specification

This document details the internal design, runtime lifecycle, and event-handling architecture of **Flow — Media Controls for Instagram & Facebook**.

---

## 🏛️ System Architecture

Flow is structured as a Chrome Extension (Manifest V3) adhering to strict separation of concerns across background service workers, content script execution layers, and isolated popup views.

```
┌─────────────────────────────────────────────────────────────┐
│                      Chrome Browser                         │
│                                                             │
│   ┌────────────────────────┐    ┌───────────────────────┐   │
│   │   Background Worker    │◄───┤    Extension Popup    │   │
│   │  (service-worker.js)   │    │  (popup.html / .js)   │   │
│   └───────────┬────────────┘    └───────────────────────┘   │
│               │ (chrome.storage.local)                      │
│               ▼                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │               Social Webpage DOM                    │   │
│   │          (Instagram.com / Facebook.com)             │   │
│   │                                                     │   │
│   │   ┌─────────────────────────────────────────────┐   │   │
│   │   │            Core Speed Engine                │   │   │
│   │   │    - Rate Enforcement (Anti-Reset Lock)     │   │   │
│   │   │    - Dynamic Video Observer & Pitch Sync    │   │   │
│   │   │    - Adaptive Platform Theme Observer       │   │   │
│   │   └──────────────────────┬──────────────────────┘   │   │
│   │                          │                          │   │
│   │     ┌────────────────────┼────────────────────┐     │   │
│   │     ▼                    ▼                    ▼     │   │
│   │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │   │
│   │ │   In-Video   │ │  Instagram   │ │   Facebook   │  │   │
│   │ │   Scrubber   │ │ Custom Reels │ │ Story Volume │  │   │
│   │ │  & Play/Mute │ │ Speed Button │ │   Capsule    │  │   │
│   │ └──────────────┘ └──────────────┘ └──────────────┘  │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧩 Core Subsystems

### 1. Core Speed Engine (`content/core-speed-engine.js`)
- **Meta Anti-Reset Engine**: Meta's video players (Shaka / React Native Web) continuously reset `video.playbackRate = 1.0` during stream rendition switches, buffering events, or story advancing. Flow hooks `ratechange`, `play`, `playing`, `loadedmetadata`, `loadeddata`, and `canplay` listeners to enforce the user's desired speed lock without audible pitch warping (`preservesPitch = true`).
- **Dynamic DOM Discovery**: Observes incoming media nodes via `MutationObserver` on `document.body` or `document.documentElement`, ensuring zero missed videos across infinite-scrolling feeds and AJAX route transitions.
- **Adaptive Theme Engine**: Reads native platform color attributes (`_9dls`, `__fb-dark-mode`, `data-color-mode`) and listens to OS media queries (`prefers-color-scheme`) to toggle `.vsc-theme-dark` and `.vsc-theme-light` tokens dynamically.

### 2. In-Video Scrubber & Timeline (`content/in-video-scrubber.js`)
- **Real-Time Progress Tracking**: Employs a low-overhead ticker via `requestAnimationFrame` while videos are playing, decoupling timeline visual tracking from DOM reflows.
- **Micro-Interaction Scrubbing**: Users can click or drag anywhere along the timeline track to seek (`video.currentTime = targetTime`). A floating timestamp bubble (`0:14 / 0:45`) previews seek targets smoothly.
- **Integrated Play/Pause**: Direct toggle embedded into the left edge of the bottom bar with state synchronization.

### 3. Coordinate Hit-Testing & Link-Hijack Defense
Social media platforms frequently overlay transparent clickable cards or links (such as Facebook Stories displaying shared Instagram posts using `<div class="storiesCardOverlay/root"><a href="...">`).

To ensure that media controls remain 100% responsive and never trigger unwanted profile navigations:
1. **Window-Level Capture Handlers**:
   - `handleCaptureDown` and `handleCaptureMove` intercept `pointerdown`, `mousedown`, `touchstart`, `pointermove`, and `click` in the **capture phase** (`{ capture: true }`) directly on `window`.
2. **Screen Coordinate Hit-Testing**:
   - `findPlayBtnAtPoint(x, y)`, `findVolBtnAtPoint(x, y)`, `findVolPopupAtPoint(x, y)`, and `findScrubberAtPoint(x, y)` compute geometric bounding boxes (`getBoundingClientRect()`) with generous hit margins.
   - If an interaction lands within any extension control boundary, Flow calls:
     ```javascript
     e.preventDefault();
     e.stopPropagation();
     e.stopImmediatePropagation();
     ```
     This neutralizes underlying `<a>` tags before the browser can initiate navigation.
3. **CSS Hit-Box Clipping**:
   - `div[class*="storiesCardOverlay"]` is styled with `clip-path: inset(0 0 54px 0) !important;` in `content/overlay.css`. This physically removes the bottom 54px region from the overlay's hit testing area.

### 4. Zero-Jitter Volume Controls
- **60fps DOM Isolation**: No DOM re-parenting (`appendChild`) or style display resets occur inside the continuous animation ticker, preserving active mouse hover states and preventing CSS transition restarts.
- **Tabular Numeric Stability**: Timestamp text `.vsc-invideo-time-display` uses `font-variant-numeric: tabular-nums` and a fixed `min-width: 68px`, ensuring width changes between single- and double-digit seconds never cause flex row layout shifts.
- **Zero-Lag Dragging**: While dragging the vertical volume slider, `.vsc-vol-dragging` disables CSS transitions (`transition: none !important;`) on popup, thumb, and fill, providing instant, 1:1 hardware-accelerated responsiveness.

### 5. Instagram Reels Speed Cycling (`content/instagram-features.js`)
- **Native Alignment**: Injected directly into Instagram's vertical right-hand action column, positioned immediately above the Heart (Like) button.
- **Appearance Adaptation**: Seamlessly flips between Dark Mode (`rgba(255, 255, 255, 0.15)`) and Light Mode (`#18191a` text / icon) using CSS custom properties.
- **Interactivity**: Clicking cycles speed presets (`1.0x` → `1.25x` → `1.5x` → `1.75x` → `2.0x`); scrolling mouse wheel over the button micro-adjusts playback speed by `±0.25x`.

### 6. Facebook Stories Sound Capsule (`content/facebook-features.js`)
- **Instagram-Matched Capsule**: Circular sound button located in the bottom timeline row that expands vertically on hover to reveal a precision volume slider.
- **Global Volume Persistence**: Audio level is synced across sessions using `localStorage` and `chrome.storage.local`.

---

## 🎨 Design Tokens & Theming (`content/overlay.css` & `popup/popup.css`)

All components share a consistent design token system:

| Token / Role | Light Mode Value | Dark Mode Value |
| :--- | :--- | :--- |
| **Surface Background** | `#ffffff` / `rgba(255,255,255,0.94)` | `#161b22` / `rgba(24,24,24,0.94)` |
| **Border / Stroke** | `rgba(0, 0, 0, 0.08)` | `rgba(255, 255, 255, 0.16)` |
| **Primary Text** | `#0f172a` | `#f0f6fc` |
| **Secondary Text** | `#64748b` | `#8b949e` |
| **Accent / Brand** | `#6366f1` (Indigo) | `#818cf8` |
| **Shadow Token** | `0 4px 16px rgba(0,0,0,0.12)` | `0 4px 16px rgba(0,0,0,0.50)` |

---

## 🛠️ Verification & Linting

Run automated syntax validation:
```bash
npm run lint
```
Checks all JavaScript entry points (`background/`, `content/`, and `popup/`) using Node.js AST parsing.
