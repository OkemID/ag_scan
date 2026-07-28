import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../constants/theme';

export default function Header({ modelReady }) {
  return (
    <View style={styles.container}>
      <View style={styles.logoRow}>
        <View style={styles.logoIcon}>
          <Text style={styles.logoIconText}>◈</Text>
        </View>
        <View>
          <Text style={styles.logoText}>AG SCAN</Text>
          <Text style={styles.logoSub}>OFFLINE LIFE JACKET SCANNER</Text>
        </View>
      </View>

      <View style={styles.right}>
        <View style={styles.detBadge}>
          <Text style={styles.detBadgeText}>ON-DEVICE</Text>
        </View>
        <View style={styles.statusRow}>
          <View style={[
            styles.dot,
            { backgroundColor: modelReady ? COLORS.green : COLORS.orange },
          ]} />
          <Text style={styles.statusText}>
            {modelReady ? 'Ready' : 'Loading'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.lg,
    paddingVertical: SIZES.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    flexShrink: 1,
  },
  logoIcon: {
    width: 34,
    height: 34,
    backgroundColor: COLORS.yellow,
    borderRadius: SIZES.radiusSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIconText: { fontSize: 18, color: '#000', fontWeight: '800' },
  logoText: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.yellow,
    letterSpacing: 2,
    lineHeight: 20,
  },
  logoSub: {
    fontSize: 7,
    fontWeight: '600',
    color: COLORS.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
  },
  detBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    borderColor: COLORS.purple + '55',
    backgroundColor: COLORS.purple + '18',
  },
  detBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: COLORS.purple,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: 11, color: COLORS.muted, fontWeight: '500' },
});
