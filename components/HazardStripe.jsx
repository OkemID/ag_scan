// ─────────────────────────────────────────────────────────────
// components/HazardStripe.jsx
//
// Decorative yellow/black diagonal hazard stripe.
// Unchanged from v1.
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

export default function HazardStripe({ style }) {
  return (
    <View style={[styles.container, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="hazard" patternUnits="userSpaceOnUse" width="16" height="8" patternTransform="rotate(-45)">
            <Rect x="0" y="0" width="8" height="8" fill="#FFD600" opacity="0.7" />
            <Rect x="8" y="0" width="8" height="8" fill="#000000" opacity="0.7" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#hazard)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 6, width: '100%', overflow: 'hidden' },
});
