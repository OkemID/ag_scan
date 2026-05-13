// ─────────────────────────────────────────────────────────────
// components/HazardStripe.jsx
//
// The yellow-and-black diagonal stripe you see at the top and
// bottom of the app — purely decorative, inspired by real
// construction site hazard tape.
//
// Props:
//   style  — optional extra StyleSheet styles to override defaults
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { View, StyleSheet } from 'react-native';

// We import MaskedView and LinearGradient to create the diagonal
// stripe pattern. Each stripe is a thin rotated rectangle.
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

export default function HazardStripe({ style }) {
  return (
    // The outer View controls the height and any extra styles passed in
    <View style={[styles.container, style]}>
      {/*
        We use an SVG pattern to draw the repeating diagonal stripes.
        This is the simplest cross-platform way to do it in React Native.
      */}
      <Svg width="100%" height="100%">
        <Defs>
          {/*
            A <Pattern> tiles itself across the SVG.
            patternUnits="userSpaceOnUse" means we use pixel units.
            Our tile is 16px wide × 8px tall.
          */}
          <Pattern
            id="hazard"
            patternUnits="userSpaceOnUse"
            width="16"
            height="8"
            patternTransform="rotate(-45)"
          >
            {/* Yellow stripe */}
            <Rect x="0" y="0" width="8" height="8" fill="#FFD600" opacity="0.7" />
            {/* Black stripe */}
            <Rect x="8" y="0" width="8" height="8" fill="#000000" opacity="0.7" />
          </Pattern>
        </Defs>

        {/* Fill the whole SVG with our repeating pattern */}
        <Rect width="100%" height="100%" fill="url(#hazard)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 6,        // Thin stripe
    width: '100%',
    overflow: 'hidden',
  },
});
