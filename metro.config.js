// ─────────────────────────────────────────────────────────────
// metro.config.js
//
// Metro is the JavaScript bundler that Expo uses to package
// your app. By default it only bundles a specific list of
// file types as assets.
//
// The problem: .m4a is NOT in Metro's default asset list,
// so it ignores the audio files and Expo Go can't find them.
//
// The fix: we add 'm4a' to the assetExts list so Metro
// treats .m4a files the same as .mp3 or .wav files —
// bundling them into the app and making them accessible
// via require('../assets/alert.m4a').
// ─────────────────────────────────────────────────────────────

const { getDefaultConfig } = require('expo/metro-config');

// Get Expo's default Metro configuration
const config = getDefaultConfig(__dirname);

// Add 'm4a' to the list of file extensions Metro treats as assets.
// assetExts already includes: mp3, wav, mp4, png, jpg, etc.
// We're just adding m4a to that existing list.
config.resolver.assetExts.push('m4a');

module.exports = config;
