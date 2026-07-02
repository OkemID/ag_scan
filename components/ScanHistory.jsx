// ─────────────────────────────────────────────────────────────
// components/ScanHistory.jsx
//
// Recent scans list. Changes from v1:
//   - Each row now shows a YOLO/HSV method badge.
//   - People count shown alongside coverage.
//   - Vest type shown when available.
//
// Props:
//   history — array of { verdict, time, coverage, vestType,
//                        detectionMethod, people }
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../constants/theme';

const DOT_COLORS = {
  COMPLIANT:     COLORS.green,
  NON_COMPLIANT: COLORS.red,
  NO_PERSON:     COLORS.orange,
  UNKNOWN:       COLORS.muted,
};

function HistoryItem({ item }) {
  const dotColor = DOT_COLORS[item.verdict] ?? COLORS.muted;

  const timeLabel = item.time instanceof Date
    ? item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  const isYolo   = item.detectionMethod?.startsWith('yolo');
  const methColor = isYolo ? COLORS.blue : COLORS.purple;
  const methLabel = isYolo ? 'Y' : 'H';

  return (
    <View style={styles.item}>
      {/* Status dot */}
      <View style={[styles.dot, { backgroundColor: dotColor }]} />

      {/* Verdict */}
      <Text style={styles.verdict}>{item.verdict.replace(/_/g, ' ')}</Text>

      {/* Coverage */}
      {item.coverage != null && item.coverage > 0 && (
        <Text style={styles.coverage}>{item.coverage.toFixed(0)}%</Text>
      )}

      {/* People count */}
      {item.people != null && (
        <Text style={styles.people}>{item.people}👤</Text>
      )}

      {/* Detection method mini-badge */}
      {item.detectionMethod && item.detectionMethod !== 'error' && (
        <View style={[styles.methBadge, { borderColor: methColor + '50', backgroundColor: methColor + '15' }]}>
          <Text style={[styles.methText, { color: methColor }]}>{methLabel}</Text>
        </View>
      )}

      <Text style={styles.time}>{timeLabel}</Text>
    </View>
  );
}

export default function ScanHistory({ history }) {
  if (!history?.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Recent Scans</Text>
      <FlatList
        data={history}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item }) => <HistoryItem item={item} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { gap: SIZES.sm },
  sectionTitle: { fontSize: 10, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 3 },

  item: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               SIZES.sm,
    paddingHorizontal: SIZES.md,
    paddingVertical:   SIZES.sm,
    backgroundColor:   COLORS.surface,
    borderRadius:      SIZES.radiusSm,
    borderWidth:       1,
    borderColor:       COLORS.borderDim,
  },
  dot:      { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  verdict:  { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: '500' },
  coverage: { fontSize: 12, color: COLORS.yellow, fontWeight: '600' },
  people:   { fontSize: 11, color: COLORS.textDim },
  methBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },
  methText:  { fontSize: 9, fontWeight: '700' },
  time:     { fontSize: 11, color: COLORS.muted },
  sep:      { height: 4 },
});
