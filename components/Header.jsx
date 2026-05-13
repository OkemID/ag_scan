// ─────────────────────────────────────────────────────────────
// components/Header.jsx
//
// The top bar of the app. Shows:
//   - The "AG Scan" logo and subtitle
//   - A coloured dot showing whether the backend server is online
//
// Props:
//   serverOnline  — boolean, true = green dot, false = grey dot
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../constants/theme';

export default function Header({ serverOnline }) {
  return (
    <View style={styles.container}>

      {/* ── Left side: Logo ─────────────────────────────── */}
      <View style={styles.logoRow}>

        {/* Yellow square icon with a layer/stack symbol */}
        <View style={styles.logoIcon}>
          <Text style={styles.logoIconText}>◈</Text>
        </View>

        {/* App name and subtitle stacked vertically */}
        <View>
          <Text style={styles.logoText}>AG Scan</Text>
          <Text style={styles.logoSub}>Hi-Vis Safety Scanner</Text>
        </View>

      </View>

      {/* ── Right side: Server status indicator ─────────── */}
      <View style={styles.statusRow}>

        {/*
          The dot changes colour based on serverOnline.
          Green = connected, grey = disconnected.
          We use a conditional style: [styles.dot, serverOnline && styles.dotOnline]
          This applies dotOnline styles only when serverOnline is true.
        */}
        <View style={[styles.dot, serverOnline ? styles.dotOnline : styles.dotOffline]} />

        <Text style={styles.statusText}>
          {serverOnline ? 'Server Online' : 'Server Offline'}
        </Text>

      </View>

    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// StyleSheet.create() is React Native's way of writing CSS.
// All sizes are in density-independent pixels (dp).
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flexDirection:    'row',          // Lay children left-to-right
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: SIZES.lg,
    paddingVertical:   SIZES.md,
    backgroundColor:  COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  // ── Logo ──────────────────────────────────────────────────
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
  logoIconText: {
    fontSize:   18,
    color:      '#000',
    fontWeight: '800',
  },
  logoText: {
    fontSize:    20,
    fontWeight:  '800',
    color:       COLORS.yellow,
    letterSpacing: 1,
    textTransform: 'uppercase',
    lineHeight:   20,
  },
  logoSub: {
    fontSize:      9,
    fontWeight:    '600',
    color:         COLORS.muted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop:     2,
  },

  // ── Status dot ────────────────────────────────────────────
  statusRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  dot: {
    width:        8,
    height:       8,
    borderRadius: 4,             // Makes it a circle
  },
  dotOnline: {
    backgroundColor: COLORS.green,
  },
  dotOffline: {
    backgroundColor: COLORS.muted,
  },
  statusText: {
    fontSize:  11,
    color:     COLORS.muted,
    fontWeight: '500',
  },
});
