// ─────────────────────────────────────────────────────────────
// utils/audioAlert.js
//
// Migrated from expo-av → expo-audio (required for SDK 54+).
//
// expo-av was deprecated and removed in SDK 54.
// expo-audio is the direct replacement with a cleaner API.
//
// Key API differences from expo-av:
//   OLD (expo-av):  Audio.Sound.createAsync(source)
//   NEW (expo-audio): createAudioPlayer(source)
//
//   OLD: sound.setPositionAsync(milliseconds)
//   NEW: player.seekTo(seconds)  ← note: SECONDS not milliseconds
//
//   OLD: sound.setOnPlaybackStatusUpdate(cb)
//   NEW: player.addListener('playbackStatusUpdate', cb)
//        returns a subscription object with .remove()
//
//   OLD: Audio.setAudioModeAsync({ playThroughEarpieceAndroid: false })
//   NEW: setAudioModeAsync({ shouldDuckAndroid: false })
//        expo-audio routes to loudspeaker by default on Android
//
// Install: npx expo install expo-audio
// ─────────────────────────────────────────────────────────────

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

// The two persistent player instances — created once, reused forever
let alertPlayer   = null;   // "Put on a life jacket to access this vessel"
let welcomePlayer = null;   // "Welcome aboard"
let isInitialised = false;

// ─────────────────────────────────────────────────────────────
// initAudio()
// Call once from App.jsx on startup to pre-load both sounds.
// ─────────────────────────────────────────────────────────────
export async function initAudio() {
  if (isInitialised) return;

  try {
    console.log('[audioAlert] Initialising sounds...');

    // Configure audio session:
    // playsInSilentMode: true  → plays on iOS even when ring switch is off
    // shouldDuckAndroid: false → don't lower other app volumes
    // expo-audio routes to loudspeaker by default on Android
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldDuckAndroid: false,
    });

    // createAudioPlayer loads the file and keeps it ready to play.
    // Unlike expo-av's Sound.createAsync, this is synchronous-style
    // and doesn't need to be awaited — the player buffers in the background.
    alertPlayer   = createAudioPlayer(require('../assets/alert.mp3'));
    welcomePlayer = createAudioPlayer(require('../assets/welcome.mp3'));

    isInitialised = true;
    console.log('[audioAlert] Both sounds loaded and ready');

  } catch (error) {
    console.error('[audioAlert] Init failed:', error.message);
  }
}

// ─────────────────────────────────────────────────────────────
// _play(player, label)
// Rewinds the player to 0 seconds and plays it.
// Returns a Promise that resolves when playback finishes.
//
// IMPORTANT: listener is attached BEFORE seekTo/play so we
// never miss the didJustFinish event on short sounds.
// ─────────────────────────────────────────────────────────────
function _play(player, label) {
  return new Promise((resolve) => {
    if (!player) {
      console.warn('[audioAlert] Player not ready for:', label);
      resolve();
      return;
    }

    // Safety net — if didJustFinish never fires (e.g. audio focus lost),
    // this resolves after 10 seconds so isSpeaking can't stay stuck
    const safetyTimer = setTimeout(() => {
      console.warn('[audioAlert] Safety timeout fired for:', label);
      subscription.remove();
      resolve();
    }, 10000);

    const done = () => {
      clearTimeout(safetyTimer);
      subscription.remove();
      resolve();
    };

    // Register listener BEFORE playing — never miss didJustFinish
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        done();
      }
    });

    try {
      // seekTo takes SECONDS in expo-audio (not milliseconds like expo-av)
      player.seekTo(0);
      player.play();
      console.log('[audioAlert] Playing:', label);
    } catch (error) {
      console.error('[audioAlert] Play failed for', label, ':', error.message);
      done();
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function playCompliantAlert() {
  return _play(welcomePlayer, 'Welcome aboard');
}

export function playNonCompliantAlert() {
  return _play(alertPlayer, 'Put on a life jacket');
}

export function stopAlert() {
  try {
    // pause() stops playback without destroying the player
    if (alertPlayer)   alertPlayer.pause();
    if (welcomePlayer) welcomePlayer.pause();
  } catch (error) {
    console.warn('[audioAlert] Stop failed:', error.message);
  }
}
