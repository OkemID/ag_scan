import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../constants/theme';

const DOT_COLORS = {
  LIFE_JACKET_CHECK_PASSED: COLORS.green,
  LIFE_JACKET_MISSING: COLORS.red,
  MANUAL_CHECK_REQUIRED: COLORS.orange,
  NO_PERSON: COLORS.orange,
  UNKNOWN: COLORS.muted,
};

function HistoryItem({ item }) {
  const dotColor = DOT_COLORS[item.verdict] ?? COLORS.muted;
  const timeLabel = item.time instanceof Date
    ? item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <View style={styles.item}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={styles.verdict}>{item.verdict.replace(/_/g, ' ')}</Text>
      {item.confidence != null && item.confidence > 0 && (
        <Text style={styles.confidence}>{Math.round(item.confidence)}%</Text>
      )}
      {item.people != null && <Text style={styles.people}>{item.people}👤</Text>}
      <View style={styles.methBadge}>
        <Text style={styles.methText}>AI</Text>
      </View>
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
        keyExtractor={(_, index) => index.toString()}
        renderItem={({ item }) => <HistoryItem item={item} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SIZES.sm },
  sectionTitle: { fontSize: 10, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 3 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    borderColor: COLORS.borderDim,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  verdict: { flex: 1, fontSize: 11, color: COLORS.text, fontWeight: '500' },
  confidence: { fontSize: 12, color: COLORS.yellow, fontWeight: '600' },
  people: { fontSize: 11, color: COLORS.textDim },
  methBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.purple + '50',
    backgroundColor: COLORS.purple + '15',
  },
  methText: { fontSize: 8, fontWeight: '700', color: COLORS.purple },
  time: { fontSize: 11, color: COLORS.muted },
  sep: { height: 4 },
});
