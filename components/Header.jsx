// ─────────────────────────────────────────────────────────────
// components/Header.jsx
//
// Top bar — logo, server status, and detector mode badge.
//
// Props:
//   serverOnline — bool
//   healthInfo   — full /health payload (may be null)
//                  { status, service, yolo_model }
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../constants/theme';

export default function Header({ serverOnline, healthInfo }) {
  // Derive detector label from health payload
  const yoloReady  = healthInfo?.yolo_model === 'ready';
  const detLabel   = !serverOnline   ? null
                   : yoloReady       ? 'YOLO'
                                     : 'HSV';
  const detColor   = yoloReady ? COLORS.blue : COLORS.purple;

  return (
    <View style={styles.container}>

      {/* ── Logo ───────────────────────────────────────── */}
      <View style={styles.logoRow}>
        <View style={styles.logoIcon}>
          <Text style={styles.logoIconText}>◈</Text>
        </View>
        <View>
          <Text style={styles.logoText}>AG SCAN</Text>
          <Text style={styles.logoSub}>LIFE JACKET SCANNER</Text>
        </View>
      </View>

      {/* ── Right side: detector badge + status dot ─────── */}
      <View style={styles.right}>

        {/* Detector mode pill — only visible when online */}
        {detLabel && (
          <View style={[styles.detBadge, { borderColor: detColor + '55', backgroundColor: detColor + '18' }]}>
            <Text style={[styles.detBadgeText, { color: detColor }]}>{detLabel}</Text>
          </View>
        )}

        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: serverOnline ? COLORS.green : COLORS.muted }]} />
          <Text style={styles.statusText}>
            {serverOnline ? 'Online' : 'Offline'}
          </Text>
        </View>

      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SIZES.lg,
    paddingVertical:   SIZES.md,
    backgroundColor:   COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  logoRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SIZES.sm,
  },
  logoIcon: {
    width:           34,
    height:          34,
    backgroundColor: COLORS.yellow,
    borderRadius:    SIZES.radiusSm,
    alignItems:      'center',
    justifyContent:  'center',
  },
  logoIconText: { fontSize: 18, color: '#000', fontWeight: '800' },
  logoText: {
    fontSize:      19,
    fontWeight:    '800',
    color:         COLORS.yellow,
    letterSpacing: 2,
    lineHeight:    20,
  },
  logoSub: {
    fontSize:      8,
    fontWeight:    '600',
    color:         COLORS.muted,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginTop:     2,
  },

  right: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SIZES.sm,
  },
  detBadge: {
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      SIZES.radiusSm,
    borderWidth:       1,
  },
  detBadgeText: {
    fontSize:      10,
    fontWeight:    '700',
    letterSpacing: 1.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: 11, color: COLORS.muted, fontWeight: '500' },
});
