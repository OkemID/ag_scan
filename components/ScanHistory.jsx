// ─────────────────────────────────────────────────────────────
// components/ScanHistory.jsx
//
// Shows the last 5 scan verdicts in a scrollable list.
// Each row shows a coloured dot, the verdict, and the time.
//
// Props:
//   history  — array of { verdict, time, coverage } objects
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../constants/theme';

// Colour for each verdict's dot indicator
const DOT_COLORS = {
  COMPLIANT:     COLORS.green,
  NON_COMPLIANT: COLORS.red,
  NO_PERSON:     COLORS.orange,
  UNKNOWN:       COLORS.muted,
};

// ── HistoryItem ───────────────────────────────────────────────
// One row in the history list. A pure presentational component
// — it just displays whatever data it receives, no logic here.
function HistoryItem({ item }) {

  const dotColor = DOT_COLORS[item.verdict] || COLORS.muted;

  // Format timestamp as e.g. "14:32:09"
  const timeLabel = item.time instanceof Date
    ? item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <View style={styles.item}>
      {/* Coloured dot on the left */}
      <View style={[styles.dot, { backgroundColor: dotColor }]} />

      {/* Verdict text */}
      <Text style={styles.verdict}>
        {item.verdict.replace(/_/g, ' ')}
      </Text>

      {/* Coverage percentage if available */}
      {item.coverage != null && (
        <Text style={styles.coverage}>{item.coverage.toFixed(1)}%</Text>
      )}

      {/* Timestamp pushed to the right */}
      <Text style={styles.time}>{timeLabel}</Text>
    </View>
  );
}

// ── ScanHistory (main export) ─────────────────────────────────
export default function ScanHistory({ history }) {

  // Don't show the section at all if there are no scans yet
  if (!history || history.length === 0) return null;

  return (
    <View style={styles.container}>

      {/* Section title */}
      <Text style={styles.sectionTitle}>Recent Scans</Text>

      {/*
        FlatList is the React Native equivalent of a scrollable list.
        It's more efficient than mapping over an array because it
        only renders the items currently visible on screen.

        data         — the array to display
        keyExtractor — a unique key for each item (React needs this)
        renderItem   — a function that returns a component for each item
        scrollEnabled={false} — we don't need to scroll this short list
      */}
      <FlatList
        data={history}
        keyExtractor={(_, index) => index.toString()}
        renderItem={({ item }) => <HistoryItem item={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        scrollEnabled={false}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SIZES.sm,
  },
  sectionTitle: {
    fontSize:      10,
    fontWeight:    '600',
    color:         COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 3,
  },

  // ── History item ──────────────────────────────────────────
  item: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SIZES.sm,
    paddingHorizontal: SIZES.md,
    paddingVertical:   SIZES.sm,
    backgroundColor: COLORS.surface,
    borderRadius:    SIZES.radiusSm,
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  dot: {
    width:        7,
    height:       7,
    borderRadius: 3.5,    // Circle
    flexShrink:   0,      // Don't let it shrink
  },
  verdict: {
    flex:       1,        // Takes up remaining space, pushing time to the right
    fontSize:   13,
    color:      COLORS.text,
    fontWeight: '500',
  },
  coverage: {
    fontSize: 12,
    color:    COLORS.yellow,
    fontWeight: '600',
  },
  time: {
    fontSize: 11,
    color:    COLORS.muted,
  },
  separator: {
    height: 5,            // Small gap between items
  },
});
