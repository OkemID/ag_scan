// ─────────────────────────────────────────────────────────────
// components/CameraView.jsx
//
// Live camera with bounding box overlay and scan animation.
//
// Changes from v1:
//   - BoundingBox now shows confidence % from YOLO (box.coverage)
//     alongside the compliant/non-compliant label.
//   - ResultFlash uses a 2-second fade (was 3s) to keep the UI snappy.
//   - Scan line is slightly thicker with a stronger glow so it
//     reads clearly against varied backgrounds.
// ─────────────────────────────────────────────────────────────

import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { CameraView } from 'expo-camera';
import { COLORS, SIZES } from '../constants/theme';

// ── BoundingBox ───────────────────────────────────────────────
function BoundingBox({ box, containerW, containerH }) {
  const px = box.x * containerW;
  const py = box.y * containerH;
  const pw = box.w * containerW;
  const ph = box.h * containerH;

  const borderColor = box.compliant ? COLORS.green : COLORS.red;
  const labelBg     = box.compliant ? COLORS.green : COLORS.red;
  const labelText   = box.compliant ? '✓' : '✗';
  const labelColor  = box.compliant ? '#000' : '#fff';

  // Show YOLO confidence percentage if available
  const confLabel = box.coverage > 0
    ? `${box.compliant ? 'HI-VIS' : 'NO VEST'} ${labelText} ${Math.round(box.coverage)}%`
    : `${box.compliant ? 'HI-VIS ✓' : 'NO VEST ✗'}`;

  return (
    <View style={[styles.box, { left: px, top: py, width: pw, height: ph, borderColor }]}>
      <View style={[styles.boxLabel, { backgroundColor: labelBg }]}>
        <Text style={[styles.boxLabelText, { color: labelColor }]}>{confLabel}</Text>
      </View>
    </View>
  );
}

// ── ScanLineAnimation ─────────────────────────────────────────
function ScanLineAnimation({ isScanning, containerH }) {
  const lineY = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.timing(lineY, {
          toValue:         containerH,
          duration:        1400,
          easing:          Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
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

// ── ResultFlash ───────────────────────────────────────────────
function ResultFlash({ verdict }) {
  const opacity = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    opacity.setValue(1);
    Animated.timing(opacity, {
      toValue:         0,
      duration:        2000,
      useNativeDriver: true,
    }).start();
  }, [verdict]);

  const config = {
    COMPLIANT:     { color: COLORS.green,  symbol: '✓', label: 'COMPLIANT' },
    NON_COMPLIANT: { color: COLORS.red,    symbol: '✗', label: 'NON-COMPLIANT' },
    NO_PERSON:     { color: COLORS.orange, symbol: '?', label: 'NO PERSON' },
    UNKNOWN:       { color: COLORS.muted,  symbol: '!', label: 'UNKNOWN' },
  }[verdict] ?? { color: COLORS.muted, symbol: '!', label: 'UNKNOWN' };

  return (
    <Animated.View style={[styles.resultFlash, { backgroundColor: config.color + '28', opacity }]}>
      <View style={[styles.resultIcon, { borderColor: config.color, backgroundColor: config.color + '30' }]}>
        <Text style={[styles.resultSymbol, { color: config.color }]}>{config.symbol}</Text>
      </View>
      <Text style={[styles.resultLabel, { color: config.color }]}>{config.label}</Text>
    </Animated.View>
  );
}

// ── Main export ───────────────────────────────────────────────
export default function CameraViewComponent({ cameraRef, facing, isScanning, lastResult }) {
  const [containerSize, setContainerSize] = React.useState({ w: 1, h: 1 });

  const handleLayout = (e) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ w: width, h: height });
  };

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing} />

      {/* Corner brackets */}
      <View style={[styles.bracket, styles.bracketTL]} />
      <View style={[styles.bracket, styles.bracketTR]} />
      <View style={[styles.bracket, styles.bracketBL]} />
      <View style={[styles.bracket, styles.bracketBR]} />

      {/* Scan animation */}
      <ScanLineAnimation isScanning={isScanning} containerH={containerSize.h} />

      {/* YOLO bounding boxes — populated when model is loaded */}
      {lastResult?.boxes?.map((box, i) => (
        <BoundingBox
          key={i}
          box={box}
          containerW={containerSize.w}
          containerH={containerSize.h}
        />
      ))}

      {/* Flash overlay on result */}
      {!isScanning && lastResult && (
        <ResultFlash verdict={lastResult.verdict} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    borderRadius:    SIZES.radiusLg,
    overflow:        'hidden',
    backgroundColor: '#030405',
    borderWidth:     1,
    borderColor:     COLORS.border,
    position:        'relative',
  },
  camera: { flex: 1 },

  bracket: {
    position:    'absolute',
    width:       26,
    height:      26,
    borderColor: COLORS.yellow,
    opacity:     0.55,
  },
  bracketTL: { top: 12, left: 12,     borderTopWidth: 2,    borderLeftWidth: 2   },
  bracketTR: { top: 12, right: 12,    borderTopWidth: 2,    borderRightWidth: 2  },
  bracketBL: { bottom: 12, left: 12,  borderBottomWidth: 2, borderLeftWidth: 2   },
  bracketBR: { bottom: 12, right: 12, borderBottomWidth: 2, borderRightWidth: 2  },

  scanLine: {
    position:      'absolute',
    left: 0, right: 0,
    height:        3,
    backgroundColor: COLORS.yellow,
    opacity:       0.85,
    shadowColor:   COLORS.yellow,
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius:  8,
  },

  box: {
    position:     'absolute',
    borderWidth:  2.5,
    borderRadius: 5,
  },
  boxLabel: {
    position:          'absolute',
    top:               -22,
    left:              -1,
    paddingHorizontal: 7,
    paddingVertical:   3,
    borderRadius:      4,
  },
  boxLabelText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },

  resultFlash: {
    position:       'absolute',
    inset:          0,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            10,
  },
  resultIcon: {
    width:          64,
    height:         64,
    borderRadius:   32,
    borderWidth:    2.5,
    alignItems:     'center',
    justifyContent: 'center',
  },
  resultSymbol: { fontSize: 30, fontWeight: '800' },
  resultLabel:  { fontSize: 26, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase' },
});
