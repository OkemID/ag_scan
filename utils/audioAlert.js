// ─────────────────────────────────────────────────────────────
// utils/audioAlert.js
//
// expo-audio wrapper (SDK 54+).
// Keeps two persistent players pre-loaded so there's no
// latency when a scan result arrives.
//
// API summary (expo-audio vs old expo-av):
//   createAudioPlayer(source)          — replaces Sound.createAsync
//   player.seekTo(seconds)             — replaces setPositionAsync(ms)
//   player.addListener('playbackStatusUpdate', cb)
//   setAudioModeAsync({ ... })
// ─────────────────────────────────────────────────────────────

import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

let alertPlayer = null; // NON_COMPLIANT audio
let welcomePlayer = null; // COMPLIANT audio
let isInitialised = false;

// ── initAudio() ───────────────────────────────────────────────
// Call once from App.jsx at startup.
export async function initAudio() {
  if (isInitialised) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true, // Play on iOS even with ring switch off
      shouldDuckAndroid: false, // Don't lower other app volumes
    });
    alertPlayer = createAudioPlayer(require("../assets/alert.mp3"), {}, {});
    welcomePlayer = createAudioPlayer(require("../assets/welcome.mp3"), {}, {});
    isInitialised = true;
    console.log("[audio] Ready");
  } catch (e) {
    console.error("[audio] Init failed:", e.message);
  }
}

// ── _play(player, label) ──────────────────────────────────────
// Rewinds and plays. Returns a Promise that resolves when done.
// A 10-second safety timeout prevents isSpeaking getting stuck.
function _play(player, label) {
  return new Promise((resolve) => {
    if (!player) {
      resolve();
      return;
    }

    const safetyTimer = setTimeout(() => {
      console.warn("[audio] Safety timeout:", label);
      subscription.remove();
      resolve();
    }, 10_000);

    const done = () => {
      clearTimeout(safetyTimer);
      subscription.remove();
      resolve();
    };

    // Attach listener BEFORE play so we never miss didJustFinish
    const subscription = player.addListener("playbackStatusUpdate", (s) => {
      if (s.didJustFinish) done();
    });

    try {
      player.seekTo(0);
      player.play();
    } catch (e) {
      console.error("[audio] Play failed:", label, e.message);
      done();
    }
  });
}

export const playCompliantAlert = () => _play(welcomePlayer, "Welcome aboard");
export const playNonCompliantAlert = () =>
  _play(alertPlayer, "Put on a life jacket");

export function stopAlert() {
  try {
    alertPlayer?.pause();
    welcomePlayer?.pause();
  } catch (e) {
    console.warn("[audio] Stop failed:", e.message);
  }
}
