// ─────────────────────────────────────────────────────────────
// components/CameraView.jsx
//
// Displays the live camera feed and draws coloured bounding
// boxes around each detected person after a scan.
//
// Props:
//   cameraRef   — the ref from useScanner, attached to the camera
//   facing      — 'back' or 'front'
//   isScanning  — bool, true = show scanning animation
//   lastResult  — the scan result object (contains bounding boxes)
// ─────────────────────────────────────────────────────────────

import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { CameraView } from 'expo-camera';
import { COLORS, SIZES } from '../constants/theme';

// ── BoundingBox ───────────────────────────────────────────────
// A small helper component that draws one coloured rectangle
// around a detected person.
//
// Props:
//   box        — { x, y, w, h, compliant } where x/y/w/h are 0–1 ratios
//   containerW — actual pixel width of the camera view
//   containerH — actual pixel height of the camera view
function BoundingBox({ box, containerW, containerH }) {

  // Convert the 0–1 ratios from the backend into real pixel positions.
  // e.g. if containerW = 350 and box.x = 0.1, pixelX = 35
  const pixelX = box.x * containerW;
  const pixelY = box.y * containerH;
  const pixelW = box.w * containerW;
  const pixelH = box.h * containerH;

  // Green box = compliant (wearing hi-vis), red = not compliant
  const boxColor = box.compliant ? COLORS.green : COLORS.red;
  const label    = box.compliant ? 'HI-VIS ✓' : 'NO VEST ✗';

  return (
    // The outer View is positioned absolutely over the camera feed
    <View
      style={[
        styles.box,
        {
          left:         pixelX,
          top:          pixelY,
          width:        pixelW,
          height:       pixelH,
          borderColor:  boxColor,
        },
      ]}
    >
      {/* Small label tag at the top-left of the box */}
      <View style={[styles.boxLabel, { backgroundColor: boxColor }]}>
        <Text style={[styles.boxLabelText, { color: box.compliant ? '#000' : '#fff' }]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

// ── ScanLineAnimation ─────────────────────────────────────────
// A yellow line that sweeps down the screen while scanning.
// This gives visual feedback that something is happening.
function ScanLineAnimation({ isScanning, containerH }) {

  // Animated.Value is React Native's way of animating numbers smoothly
  const lineY = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (isScanning) {
      // Loop the line from top to bottom, over and over, while scanning
      Animated.loop(
        Animated.timing(lineY, {
          toValue:         containerH,    // Move from 0 to bottom
          duration:        1600,          // Takes 1.6 seconds
          easing:          Easing.linear, // Constant speed
          useNativeDriver: true,          // Use GPU for smooth animation
        })
      ).start();
    } else {
      // Stop animating and reset to top when not scanning
      lineY.stopAnimation();
      lineY.setValue(0);
    }
  }, [isScanning]);

  if (!isScanning) return null;

  return (
    <Animated.View
      style={[styles.scanLine, { transform: [{ translateY: lineY }] }]}
    />
  );
}

// ── Main CameraView component ─────────────────────────────────
export default function CameraViewComponent({
  cameraRef,
  facing,
  isScanning,
  lastResult,
}) {

  // We measure the actual pixel size of the camera container
  // so we can scale bounding boxes correctly
  const [containerSize, setContainerSize] = React.useState({ w: 1, h: 1 });

  // onLayout fires when the View is first drawn and gives us its size
  const handleLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize({ w: width, h: height });
  };

  return (
    // The outer View is the camera's "frame" on screen
    <View style={styles.container} onLayout={handleLayout}>

      {/* ── Live Camera Feed ─────────────────────────────── */}
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
      />

      {/* ── Corner Brackets ──────────────────────────────── */}
      {/* These four Views create the corner-bracket look     */}
      <View style={[styles.bracket, styles.bracketTL]} />
      <View style={[styles.bracket, styles.bracketTR]} />
      <View style={[styles.bracket, styles.bracketBL]} />
      <View style={[styles.bracket, styles.bracketBR]} />

      {/* ── Scanning Animation ───────────────────────────── */}
      <ScanLineAnimation isScanning={isScanning} containerH={containerSize.h} />

      {/* ── Bounding Boxes ───────────────────────────────── */}
      {/*
        Only draw boxes if we have a result with boxes in it.
        lastResult?.boxes uses optional chaining — if lastResult
        is null, this safely returns undefined instead of crashing.
      */}
      {lastResult?.boxes?.map((box, index) => (
        <BoundingBox
          key={index}
          box={box}
          containerW={containerSize.w}
          containerH={containerSize.h}
        />
      ))}

      {/* ── Result Flash Overlay ─────────────────────────── */}
      {/*
        When a result comes in, briefly tint the whole camera
        green or red. We only show this right after a scan
        (isScanning just turned false and we have a result).
      */}
      {!isScanning && lastResult && (
        <ResultFlash verdict={lastResult.verdict} />
      )}

    </View>
  );
}

// ── ResultFlash ───────────────────────────────────────────────
// Briefly flashes a coloured overlay + icon over the camera
// after a scan completes.
function ResultFlash({ verdict }) {

  // Opacity starts at 1 and fades to 0 over 3 seconds
  const opacity = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    opacity.setValue(1);  // Reset to fully visible
    Animated.timing(opacity, {
      toValue:         0,
      duration:        3000,
      useNativeDriver: true,
    }).start();
  }, [verdict]);

  // Choose colour and symbol based on the verdict
  const config = {
    COMPLIANT:     { color: COLORS.green,  symbol: '✓', label: 'COMPLIANT' },
    NON_COMPLIANT: { color: COLORS.red,    symbol: '✗', label: 'NON-COMPLIANT' },
    NO_PERSON:     { color: COLORS.orange, symbol: '?', label: 'NO PERSON' },
    UNKNOWN:       { color: COLORS.muted,  symbol: '!', label: 'UNKNOWN' },
  }[verdict] || { color: COLORS.muted, symbol: '!', label: 'UNKNOWN' };

  return (
    <Animated.View
      style={[
        styles.resultFlash,
        { backgroundColor: config.color + '30', opacity },  // '30' = 19% opacity hex
      ]}
    >
      {/* Big symbol */}
      <View style={[styles.resultIcon, { borderColor: config.color, backgroundColor: config.color + '33' }]}>
        <Text style={[styles.resultSymbol, { color: config.color }]}>{config.symbol}</Text>
      </View>
      {/* Verdict label */}
      <Text style={[styles.resultFlashLabel, { color: config.color }]}>{config.label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:         1,
    borderRadius: SIZES.radiusLg,
    overflow:     'hidden',       // Clips camera to the rounded corners
    backgroundColor: '#050708',
    borderWidth:  1,
    borderColor:  COLORS.border,
    position:     'relative',    // Needed so absolute children position correctly
  },

  camera: {
    flex: 1,
  },

  // ── Corner brackets ───────────────────────────────────────
  // Each bracket is a square View with only 2 of its borders visible
  bracket: {
    position:    'absolute',
    width:       28,
    height:      28,
    borderColor: COLORS.yellow,
    borderStyle: 'solid',
    opacity:     0.6,
  },
  bracketTL: { top: 12, left: 12,  borderTopWidth: 2,    borderLeftWidth: 2  },
  bracketTR: { top: 12, right: 12, borderTopWidth: 2,    borderRightWidth: 2 },
  bracketBL: { bottom: 12, left: 12,  borderBottomWidth: 2, borderLeftWidth: 2  },
  bracketBR: { bottom: 12, right: 12, borderBottomWidth: 2, borderRightWidth: 2 },

  // ── Scan line ────────────────────────────────────────────
  scanLine: {
    position:        'absolute',
    left:            0,
    right:           0,
    height:          2,
    backgroundColor: COLORS.yellow,
    opacity:         0.8,
    // The shadow creates the "glow" effect
    shadowColor:     COLORS.yellow,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   1,
    shadowRadius:    6,
  },

  // ── Bounding boxes ────────────────────────────────────────
  box: {
    position:    'absolute',
    borderWidth: 2.5,
    borderRadius: 4,
  },
  boxLabel: {
    position:     'absolute',
    top:          -22,
    left:         -1,
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius: 4,
  },
  boxLabelText: {
    fontSize:    12,
    fontWeight:  '700',
    letterSpacing: 0.5,
  },

  // ── Result flash overlay ──────────────────────────────────
  resultFlash: {
    position:       'absolute',
    inset:          0,           // Covers the whole camera
    alignItems:     'center',
    justifyContent: 'center',
    gap:            10,
  },
  resultIcon: {
    width:        68,
    height:       68,
    borderRadius: 34,
    borderWidth:  2.5,
    alignItems:   'center',
    justifyContent: 'center',
  },
  resultSymbol: {
    fontSize:   32,
    fontWeight: '800',
  },
  resultFlashLabel: {
    fontSize:      28,
    fontWeight:    '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
});
