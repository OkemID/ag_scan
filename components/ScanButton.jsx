// ─────────────────────────────────────────────────────────────
// components/ScanButton.jsx
//
// The action buttons at the bottom of the screen.
// Now has two modes:
//
//   IDLE mode:
//     [▶ Start Scanning]  [↺]
//
//   LIVE SCANNING mode:
//     [⏹ End Scanning]    [↺]
//     (button turns red, pulses to show it's active)
//
// Props:
//   onStart        — call this when Start is tapped
//   onStop         — call this when End is tapped
//   onFlip         — call this to flip the camera
//   isLiveScanning — bool, true = currently scanning
//   isScanning     — bool, true = a frame is being processed
//   disabled       — bool, true = grey out (server offline)
// ─────────────────────────────────────────────────────────────

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
} from 'react-native';
import { COLORS, SIZES } from '../constants/theme';

// ── PulsingDot ────────────────────────────────────────────────
// A small animated dot shown while live scanning is active.
// It fades in and out repeatedly to signal "recording/active".
function PulsingDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Repeat: fade to 0.2 then back to 1, forever
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
    return () => opacity.stopAnimation();
  }, []);

  return (
    <Animated.View style={[styles.pulsingDot, { opacity }]} />
  );
}

export default function ScanButton({
  onStart,
  onStop,
  onFlip,
  isLiveScanning,
  isScanning,
  disabled,
}) {

  // The big button is disabled only when the server is offline
  // AND we haven't started scanning yet
  const startDisabled = disabled && !isLiveScanning;

  return (
    <View style={styles.container}>

      {/* ── Main action button ───────────────────────────── */}
      {isLiveScanning ? (

        // ── END SCANNING button (red) ─────────────────────
        <Pressable
          style={styles.stopBtn}
          onPress={onStop}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
        >
          {/* Pulsing dot shows we're actively scanning */}
          <PulsingDot />
          <Text style={styles.stopBtnText}>⏹  End Scanning</Text>

          {/* Small "processing" label shown while a frame is being analysed */}
          {isScanning && (
            <Text style={styles.processingLabel}>Analysing…</Text>
          )}
        </Pressable>

      ) : (

        // ── START SCANNING button (yellow) ────────────────
        <Pressable
          style={[styles.startBtn, startDisabled && styles.btnDisabled]}
          onPress={onStart}
          disabled={startDisabled}
          android_ripple={{ color: 'rgba(0,0,0,0.15)' }}
        >
          <Text style={styles.startBtnText}>▶  Start Scanning</Text>
        </Pressable>

      )}

      {/* ── Flip camera button ───────────────────────────── */}
      <Pressable
        style={styles.flipBtn}
        onPress={onFlip}
        android_ripple={{ color: 'rgba(255,214,0,0.2)', borderless: true }}
      >
        <Text style={styles.flipIcon}>↺</Text>
      </Pressable>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap:           SIZES.sm,
    alignItems:    'stretch',
  },

  // ── Start button (yellow) ─────────────────────────────────
  startBtn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical: SIZES.lg,
    backgroundColor: COLORS.yellow,
    borderRadius:   SIZES.radiusLg,
  },
  startBtnText: {
    fontSize:      19,
    fontWeight:    '800',
    color:         '#000',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // ── Stop button (red) ─────────────────────────────────────
  stopBtn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SIZES.sm,
    paddingVertical: SIZES.lg,
    backgroundColor: COLORS.red,
    borderRadius:   SIZES.radiusLg,
  },
  stopBtnText: {
    fontSize:      19,
    fontWeight:    '800',
    color:         '#fff',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  processingLabel: {
    position:   'absolute',
    bottom:     6,
    fontSize:   10,
    color:      'rgba(255,255,255,0.7)',
    fontWeight: '500',
    letterSpacing: 1,
  },

  // ── Pulsing dot ───────────────────────────────────────────
  pulsingDot: {
    width:           10,
    height:          10,
    borderRadius:    5,
    backgroundColor: '#fff',
  },

  // ── Disabled state ────────────────────────────────────────
  btnDisabled: {
    opacity: 0.32,
  },

  // ── Flip button ───────────────────────────────────────────
  flipBtn: {
    width:           52,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: COLORS.surface,
    borderRadius:    SIZES.radiusLg,
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  flipIcon: {
    fontSize:   24,
    color:      COLORS.yellow,
    fontWeight: '600',
  },
});
