import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { CameraView } from 'expo-camera';
import { COLORS, SIZES } from '../constants/theme';

function BoundingBox({ box, containerW, containerH }) {
  const px = box.x * containerW;
  const py = box.y * containerH;
  const pw = box.w * containerW;
  const ph = box.h * containerH;

  const decision = box.decision || (box.compliant ? 'wear' : 'notwear');
  const confidence = Number(box.confidence ?? box.coverage ?? 0);

  const config = {
    wear: {
      borderColor: COLORS.green,
      labelBg: COLORS.green,
      labelColor: '#000',
      label: 'LIFE JACKET ✓',
    },
    notwear: {
      borderColor: COLORS.red,
      labelBg: COLORS.red,
      labelColor: '#fff',
      label: 'NO JACKET ✗',
    },
    uncertain: {
      borderColor: COLORS.orange,
      labelBg: COLORS.orange,
      labelColor: '#000',
      label: 'UNCERTAIN !',
    },
  }[decision] ?? {
    borderColor: COLORS.orange,
    labelBg: COLORS.orange,
    labelColor: '#000',
    label: 'CHECK !',
  };

  const confidenceLabel = confidence > 0
    ? `${config.label} ${Math.round(confidence)}%`
    : config.label;

  return (
    <View style={[
      styles.box,
      {
        left: px,
        top: py,
        width: pw,
        height: ph,
        borderColor: config.borderColor,
      },
    ]}>
      <View style={[styles.boxLabel, { backgroundColor: config.labelBg }]}>
        <Text style={[styles.boxLabelText, { color: config.labelColor }]}>
          {confidenceLabel}
        </Text>
      </View>
    </View>
  );
}

function ScanLineAnimation({ isScanning, containerH }) {
  const lineY = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.timing(lineY, {
          toValue: containerH,
          duration: 1400,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      lineY.stopAnimation();
      lineY.setValue(0);
    }
  }, [containerH, isScanning, lineY]);

  if (!isScanning) return null;

  return (
    <Animated.View
      style={[styles.scanLine, { transform: [{ translateY: lineY }] }]}
    />
  );
}

function ResultFlash({ verdict }) {
  const opacity = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    opacity.setValue(1);
    Animated.timing(opacity, {
      toValue: 0,
      duration: 2000,
      useNativeDriver: true,
    }).start();
  }, [opacity, verdict]);

  const config = {
    LIFE_JACKET_CHECK_PASSED: {
      color: COLORS.green,
      symbol: '✓',
      label: 'JACKET DETECTED',
    },
    LIFE_JACKET_MISSING: {
      color: COLORS.red,
      symbol: '✗',
      label: 'NO JACKET',
    },
    MANUAL_CHECK_REQUIRED: {
      color: COLORS.orange,
      symbol: '!',
      label: 'MANUAL CHECK',
    },
    NO_PERSON: {
      color: COLORS.orange,
      symbol: '?',
      label: 'NO PERSON',
    },
    UNKNOWN: {
      color: COLORS.muted,
      symbol: '!',
      label: 'UNKNOWN',
    },
  }[verdict] ?? { color: COLORS.muted, symbol: '!', label: 'UNKNOWN' };

  return (
    <Animated.View style={[
      styles.resultFlash,
      { backgroundColor: config.color + '28', opacity },
    ]}>
      <View style={[
        styles.resultIcon,
        {
          borderColor: config.color,
          backgroundColor: config.color + '30',
        },
      ]}>
        <Text style={[styles.resultSymbol, { color: config.color }]}>
          {config.symbol}
        </Text>
      </View>
      <Text style={[styles.resultLabel, { color: config.color }]}>
        {config.label}
      </Text>
    </Animated.View>
  );
}

export default function CameraViewComponent({ cameraRef, facing, isScanning, lastResult }) {
  const [containerSize, setContainerSize] = React.useState({ w: 1, h: 1 });

  const handleLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize({ w: width, h: height });
  };

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing} />

      <View style={[styles.bracket, styles.bracketTL]} />
      <View style={[styles.bracket, styles.bracketTR]} />
      <View style={[styles.bracket, styles.bracketBL]} />
      <View style={[styles.bracket, styles.bracketBR]} />

      <ScanLineAnimation isScanning={isScanning} containerH={containerSize.h} />

      {lastResult?.boxes?.map((box, index) => (
        <BoundingBox
          key={`${index}-${box.decision || box.class_name || 'box'}`}
          box={box}
          containerW={containerSize.w}
          containerH={containerSize.h}
        />
      ))}

      {!isScanning && lastResult && (
        <ResultFlash verdict={lastResult.verdict} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: SIZES.radiusLg,
    overflow: 'hidden',
    backgroundColor: '#030405',
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
  },
  camera: { flex: 1 },

  bracket: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: COLORS.yellow,
    opacity: 0.55,
  },
  bracketTL: { top: 12, left: 12, borderTopWidth: 2, borderLeftWidth: 2 },
  bracketTR: { top: 12, right: 12, borderTopWidth: 2, borderRightWidth: 2 },
  bracketBL: { bottom: 12, left: 12, borderBottomWidth: 2, borderLeftWidth: 2 },
  bracketBR: { bottom: 12, right: 12, borderBottomWidth: 2, borderRightWidth: 2 },

  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: COLORS.yellow,
    opacity: 0.85,
    shadowColor: COLORS.yellow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },

  box: {
    position: 'absolute',
    borderWidth: 2.5,
    borderRadius: 5,
  },
  boxLabel: {
    position: 'absolute',
    top: -22,
    left: -1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  boxLabelText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },

  resultFlash: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  resultIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultSymbol: { fontSize: 30, fontWeight: '800' },
  resultLabel: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
