# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2025-09-30

### Added
- **New Brand Identity**: Complete redesign and rebrand to **Flow — Media Controls for Instagram & Facebook**.
- **Modern Brand Icon**: 3D geometric ribbon wave and media play mark exported across 128px, 48px, and 16px.
- **Adaptive White (Light) Mode Support**: Automatic luminance-based contrast detection for Instagram Reels speed button (`#18191a` high-contrast dark text/icon on white mode).
- **Facebook Stories Vertical Sound Capsule**: Instagram-matched vertical slider with drag seek, click-to-mute, and wheel adjustments.
- **Theme Switcher**: Segmented Auto / Light / Dark selector with real-time DOM mutation tracking.

### Changed
- **Lowest Radiance Controls**: Eliminated all radiant halo blooms and neon spreads (`box-shadow: 0 0 Xpx ...`) across all video players and timeline widgets.
- **Refined In-Video Player Controls**: Switched play/pause button and volume capsule to sleek, low-profile dark translucent obsidian glass (`rgba(18, 20, 26, 0.82)`).
- **Slim Timeline Scrubber**: Track height streamlined to 3px (hover 5px) with clean `#6366f1` accent fill.
- **Popup Architecture**: Cleaned out legacy speed box and redundant display toggles.

### Fixed
- Fixed speed button visibility on Instagram desktop Reels white/light theme.
- Fixed operating system `prefers-color-scheme` incorrectly overriding Instagram native appearance.

---

## [1.0.0] - 2025-09-14

### Added
- Initial Manifest V3 release.
- Core video speed engine with anti-reset lock for Meta video players.
- In-video live timeline scrubber for Instagram & Facebook.
- Movable floating on-screen controller HUD.
