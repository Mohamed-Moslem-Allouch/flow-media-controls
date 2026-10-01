/**
 * Flow — Media Controls for Instagram & Facebook
 * Author: Mohamed Moslem Allouch
 * License: MIT
 */

const DEFAULT_SETTINGS = {
  speed: 1.0,
  showBadge: true,
  widgetMinimized: false,
  showFloatingTimeline: true,
  inVideoScrubberIG: true,
  inVideoScrubberIGStoriesOnly: false,
  inVideoScrubberFB: true,
  inVideoScrubberFBAll: false,
  showScrubberTime: true,
  enableHotkeys: true,
  rememberSpeed: true,
  autoUnmuteStories: false,
  fastSpeed: 2.0,
  widgetPos: { top: 90, left: 30 }
};

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const current = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
    const toSet = {};
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (current[key] === undefined) {
        toSet[key] = value;
      }
    }
    if (Object.keys(toSet).length > 0) {
      await chrome.storage.local.set(toSet);
    }
  } catch (err) {
    console.error('Failed to initialize settings in local storage:', err);
  }
});
