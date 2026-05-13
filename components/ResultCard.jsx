// ─────────────────────────────────────────────────────────────
// components/ResultCard.jsx
//
// Displays the result of the most recent scan in a card below
// the camera. Shows:
//   - Verdict pill (COMPLIANT / NON-COMPLIANT / etc.)
//   - Human-readable reason from the backend
//   - Confidence and hi-vis coverage metrics
//   - Timestamp of the scan
//
// Props:
//   result  — the scan result object from the backend, or null
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../constants/theme';

// ── Configuration for each verdict type ──────────────────────
// Keeps all the colour/label logic in one tidy lookup table
// instead of scattered if/else statements.
const VERDICT_CONFIG = {
  COMPLIANT: {
    label:      'COMPLIANT',
    textColor:  COLORS.green,
    bgColor:    'rgba(0, 230, 118, 0.12)',
    borderColor:'rgba(0, 230, 118, 0.25)',
  },
  NON_COMPLIANT: {
    label:      'NON-COMPLIANT',
    textColor:  COLORS.red,
    bgColor:    'rgba(255, 23, 68, 0.10)',
    borderColor:'rgba(255, 23, 68, 0.22)',
  },
  NO_PERSON: {
    label:      'NO PERSON',
    textColor:  COLORS.orange,
    bgColor:    'rgba(255, 107, 0, 0.10)',
    borderColor:'rgba(255, 107, 0, 0.22)',
  },
  UNKNOWN: {
    label:      'UNKNOWN',
    textColor:  COLORS.muted,
    bgColor:    'rgba(122, 128, 144, 0.10)',
    borderColor:'rgba(122, 128, 144, 0.20)',
  },
};

// ── ConfidenceBar ─────────────────────────────────────────────
// A small horizontal progress bar showing 0–100%.
// Used for both Confidence and Hi-Vis Coverage metrics.
function ConfidenceBar({ label, value, color }) {
  // Clamp the value between 0 and 100 just in case
  const clampedValue = Math.min(100, Math.max(0, value || 0));

  return (
    <View style={barStyles.container}>
      <Text style={barStyles.label}>{label}</Text>
      {/* Grey track */}
      <View style={barStyles.track}>
        {/* Coloured fill, width is a percentage string e.g. "72%" */}
        <View
          style={[
            barStyles.fill,
            { width: `${clampedValue}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={[barStyles.value, { color }]}>{clampedValue.toFixed(1)}%</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SIZES.sm,
    marginTop:     SIZES.sm,
  },
  label: {
    fontSize:      10,
    fontWeight:    '600',
    color:         COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    width:         75,          // Fixed width so bars align nicely
  },
  track: {
    flex:            1,
    height:          4,
    backgroundColor: COLORS.surface2,
    borderRadius:    2,
    overflow:        'hidden',
  },
  fill: {
    height:       '100%',
    borderRadius: 2,
  },
  value: {
    fontSize:   12,
    fontWeight: '600',
    minWidth:   36,
    textAlign:  'right',
  },
});

// ── ResultCard (main export) ───────────────────────────────────
export default function ResultCard({ result }) {

  // Don't render anything if there's no result yet
  if (!result) return null;

  // Look up the display config for this verdict
  const config = VERDICT_CONFIG[result.verdict] || VERDICT_CONFIG.UNKNOWN;

  // Choose a bar colour based on confidence level:
  // high = green, medium = yellow, low = orange
  const confidenceColor = (result.confidence || 0) >= 75
    ? COLORS.green
    : (result.confidence || 0) >= 45
      ? COLORS.yellow
      : COLORS.orange;

  // Format the current time as HH:MM:SS
  const timeLabel = new Date().toLocaleTimeString([], {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <View style={styles.card}>

      {/* ── Top row: verdict pill + timestamp ──────────── */}
      <View style={styles.headerRow}>

        {/* Coloured pill showing the verdict word */}
        <View style={[styles.pill, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}>
          <Text style={[styles.pillText, { color: config.textColor }]}>
            {config.label}
          </Text>
        </View>

        {/* Timestamp pushed to the right */}
        <Text style={styles.time}>{timeLabel}</Text>

      </View>

      {/* ── Reason text ─────────────────────────────────── */}
      <Text style={styles.reason}>{result.reason || '—'}</Text>

      {/* ── Quick stats row ──────────────────────────────── */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>People</Text>
          <Text style={[styles.statValue, { color: COLORS.blue }]}>
            {result.people ?? '—'}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Coverage</Text>
          <Text style={[styles.statValue, { color: COLORS.yellow }]}>
            {result.coverage != null ? result.coverage.toFixed(1) + '%' : '—'}
          </Text>
        </View>
      </View>

      {/* ── Progress bars ────────────────────────────────── */}
      <ConfidenceBar
        label="Confidence"
        value={result.confidence}
        color={confidenceColor}
      />
      <ConfidenceBar
        label="Hi-Vis Cover"
        value={result.coverage}
        color={COLORS.yellow}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius:    SIZES.radiusMd,
    borderWidth:     1,
    borderColor:     COLORS.border,
    padding:         SIZES.md,
  },

  // ── Header ────────────────────────────────────────────────
  headerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   SIZES.sm,
  },
  pill: {
    paddingHorizontal: SIZES.sm,
    paddingVertical:   3,
    borderRadius:      SIZES.radiusSm,
    borderWidth:       1,
  },
  pillText: {
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  time: {
    fontSize: 12,
    color:    COLORS.muted,
  },

  // ── Reason ────────────────────────────────────────────────
  reason: {
    fontSize:    13,
    color:       'rgba(240, 238, 224, 0.68)',
    lineHeight:  19,
    marginBottom: SIZES.sm,
  },

  // ── Stats ─────────────────────────────────────────────────
  statsRow: {
    flexDirection:   'row',
    backgroundColor: COLORS.surface2,
    borderRadius:    SIZES.radiusSm,
    overflow:        'hidden',
    marginBottom:    SIZES.xs,
  },
  statBox: {
    flex:           1,
    padding:        SIZES.sm,
    alignItems:     'center',
  },
  statDivider: {
    width:           1,
    backgroundColor: COLORS.border,
  },
  statLabel: {
    fontSize:      9,
    fontWeight:    '600',
    color:         COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom:  3,
  },
  statValue: {
    fontSize:   18,
    fontWeight: '700',
  },
});
// Note: vest_type is now available in result.vest_type
// The ResultCard already shows reason which includes vest type in the text from the backend
