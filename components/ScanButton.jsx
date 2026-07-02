// ─────────────────────────────────────────────────────────────
// components/ScanButton.jsx
//
// Start / Stop scanning + flip camera.
// No logic changes from v1; minor style refinements only.
// ─────────────────────────────────────────────────────────────

import React, { useRef, useEffect } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../constants/theme';

function PulsingDot() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
    return () => opacity.stopAnimation();
  }, []);
  return <Animated.View style={[styles.pulsingDot, { opacity }]} />;
}

export default function ScanButton({ onStart, onStop, onFlip, isLiveScanning, isScanning, disabled }) {
  const startDisabled = disabled && !isLiveScanning;

  return (
    <View style={styles.container}>

      {isLiveScanning ? (
        <Pressable style={styles.stopBtn} onPress={onStop}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
          <PulsingDot />
          <Text style={styles.stopBtnText}>⏹  End Scanning</Text>
          {isScanning && <Text style={styles.processingLabel}>Analysing…</Text>}
        </Pressable>
      ) : (
        <Pressable
          style={[styles.startBtn, startDisabled && styles.btnDisabled]}
          onPress={onStart}
          disabled={startDisabled}
          android_ripple={{ color: 'rgba(0,0,0,0.15)' }}
        >
          <Text style={styles.startBtnText}>▶  Start Scanning</Text>
        </Pressable>
      )}

      <Pressable style={styles.flipBtn} onPress={onFlip}
        android_ripple={{ color: 'rgba(255,214,0,0.2)', borderless: true }}>
        <Text style={styles.flipIcon}>↺</Text>
      </Pressable>

    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flexDirection: 'row', gap: SIZES.sm, alignItems: 'stretch' },

  startBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: SIZES.lg, backgroundColor: COLORS.yellow, borderRadius: SIZES.radiusLg,
  },
  startBtnText: { fontSize: 18, fontWeight: '800', color: '#000', letterSpacing: 1, textTransform: 'uppercase' },

  stopBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SIZES.sm, paddingVertical: SIZES.lg, backgroundColor: COLORS.red, borderRadius: SIZES.radiusLg,
  },
  stopBtnText:     { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: 1, textTransform: 'uppercase' },
  processingLabel: { position: 'absolute', bottom: 5, fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: '500', letterSpacing: 1 },

  pulsingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  btnDisabled: { opacity: 0.3 },

  flipBtn: {
    width: 52, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  flipIcon: { fontSize: 23, color: COLORS.yellow, fontWeight: '600' },
});
