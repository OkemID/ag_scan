import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../constants/theme';

const VERDICT_CONFIG = {
  COLOUR_CHECK_PASSED: {
    label: 'COLOUR CHECK PASSED',
    textColor: COLORS.green,
    bgColor: 'rgba(0, 230, 118, 0.10)',
    borderColor: 'rgba(0, 230, 118, 0.22)',
  },
  MANUAL_CHECK_REQUIRED: {
    label: 'MANUAL CHECK REQUIRED',
    textColor: COLORS.red,
    bgColor: 'rgba(255, 23, 68, 0.10)',
    borderColor: 'rgba(255, 23, 68, 0.22)',
  },
  NO_PERSON: {
    label: 'NO PERSON',
    textColor: COLORS.orange,
    bgColor: 'rgba(255, 109, 0, 0.10)',
    borderColor: 'rgba(255, 109, 0, 0.22)',
  },
  UNKNOWN: {
    label: 'UNKNOWN',
    textColor: COLORS.muted,
    bgColor: 'rgba(90, 96, 112, 0.10)',
    borderColor: 'rgba(90, 96, 112, 0.20)',
  },
};

function MetricBar({ label, value, color }) {
  const clamped = Math.min(100, Math.max(0, value || 0));
  return (
    <View style={bar.row}>
      <Text style={bar.label}>{label}</Text>
      <View style={bar.track}>
        <View style={[bar.fill, { width: `${clamped}%`, backgroundColor: color }]} />
      </View>
      <Text style={[bar.value, { color }]}>{clamped.toFixed(1)}%</Text>
    </View>
  );
}

const bar = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, marginTop: SIZES.sm },
  label: { fontSize: 10, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, width: 78 },
  track: { flex: 1, height: 4, backgroundColor: COLORS.surface2, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  value: { fontSize: 12, fontWeight: '600', minWidth: 38, textAlign: 'right' },
});

function DetectionBadge({ method }) {
  if (!method || method === 'error') return null;
  return (
    <View style={badge.pill}>
      <Text style={badge.text}>DEVICE AI + HSV</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  pill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    borderColor: COLORS.purple + '55',
    backgroundColor: COLORS.purple + '18',
  },
  text: { fontSize: 8, fontWeight: '700', letterSpacing: 1, color: COLORS.purple },
});

export default function ResultCard({ result, scanTime }) {
  if (!result) return null;

  const config = VERDICT_CONFIG[result.verdict] ?? VERDICT_CONFIG.UNKNOWN;
  const confidenceColor = (result.confidence || 0) >= 75
    ? COLORS.green
    : (result.confidence || 0) >= 45
      ? COLORS.yellow
      : COLORS.orange;
  const timeLabel = scanTime instanceof Date
    ? scanTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';
  const vestLabel = result.vest_type && result.vest_type !== 'none'
    ? result.vest_type.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
    : '—';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.pill, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}>
          <Text style={[styles.pillText, { color: config.textColor }]}>{config.label}</Text>
        </View>
        <View style={styles.headerRight}>
          <DetectionBadge method={result.detection_method} />
          <Text style={styles.time}>{timeLabel}</Text>
        </View>
      </View>

      <Text style={styles.reason}>{result.reason || '—'}</Text>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>People</Text>
          <Text style={[styles.statValue, { color: COLORS.blue }]}>{result.people ?? '—'}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Coverage</Text>
          <Text style={[styles.statValue, { color: COLORS.yellow }]}>
            {result.coverage != null ? `${result.coverage.toFixed(1)}%` : '—'}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Colour</Text>
          <Text style={[styles.statValue, { color: COLORS.textDim, fontSize: 11 }]}>{vestLabel}</Text>
        </View>
      </View>

      <MetricBar label="Confidence" value={result.confidence} color={confidenceColor} />
      <MetricBar label="Hi-Vis" value={result.coverage} color={COLORS.yellow} />

      {result.duration_ms != null && (
        <Text style={styles.duration}>Processed on device in {result.duration_ms} ms</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SIZES.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SIZES.sm,
    gap: SIZES.sm,
  },
  pill: {
    paddingHorizontal: SIZES.sm,
    paddingVertical: 3,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    flexShrink: 1,
  },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  time: { fontSize: 11, color: COLORS.muted },
  reason: { fontSize: 13, color: COLORS.textDim, lineHeight: 19, marginBottom: SIZES.sm },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface2,
    borderRadius: SIZES.radiusSm,
    overflow: 'hidden',
    marginBottom: SIZES.xs,
  },
  statBox: { flex: 1, padding: SIZES.sm, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: COLORS.borderDim },
  statLabel: { fontSize: 9, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 3 },
  statValue: { fontSize: 18, fontWeight: '700' },
  duration: { color: COLORS.muted, fontSize: 10, textAlign: 'right', marginTop: SIZES.sm },
});
