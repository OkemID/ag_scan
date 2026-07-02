// ─────────────────────────────────────────────────────────────
// App.jsx — AG Scan v2 (YOLOv11s)
//
// Changes from v1:
//
//   1. Sensitivity slider
//      A horizontal slider (1–50%) lets the crew set how much
//      hi-vis coverage counts as COMPLIANT. This was available
//      in the UI before but the value was never sent to the
//      backend — now it is (fixed in useScanner + api.js).
//
//   2. healthInfo → Header
//      The /health endpoint now returns yolo_model status.
//      Header displays a YOLO / HSV badge so the crew knows
//      which detection path is active.
//
//   3. scanTime → ResultCard
//      We track when each scan completed and pass it as a prop.
//      ResultCard uses this instead of new Date() at render time,
//      fixing the stale timestamp bug from v1.
//
//   4. Offline banner shows YOLO model status
//      If the server is online but best.pt is missing, a separate
//      warning tells the user the app is in HSV fallback mode.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useScanner }   from './hooks/useScanner';
import Header           from './components/Header';
import CameraViewComp   from './components/CameraView';
import ScanButton       from './components/ScanButton';
import ResultCard       from './components/ResultCard';
import ScanHistory      from './components/ScanHistory';
import HazardStripe     from './components/HazardStripe';
import { COLORS, SIZES } from './constants/theme';
import { initAudio }    from './utils/audioAlert';

function InnerApp() {
  useEffect(() => { initAudio(); }, []);

  // Track when the last result arrived so ResultCard has an accurate timestamp
  const [scanTime, setScanTime] = useState(null);

  const {
    cameraRef,
    facing,
    flip,
    permission,
    requestPermission,
    startLiveScan,
    stopLiveScan,
    isLiveScanning,
    isScanning,
    isSpeaking,
    lastResult,
    history,
    serverOnline,
    healthInfo,
    sensitivity,
    setSensitivity,
  } = useScanner();

  // Record the exact moment a new result arrives
  useEffect(() => {
    if (lastResult) setScanTime(new Date());
  }, [lastResult]);

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <HazardStripe />
        <Header serverOnline={serverOnline} healthInfo={healthInfo} />
        <View style={styles.permissionScreen}>
          <Text style={styles.permIcon}>📷</Text>
          <Text style={styles.permTitle}>Camera Access Needed</Text>
          <Text style={styles.permBody}>
            AG Scan needs your camera to check whether people are wearing life jackets.
            Your camera feed is never stored or sent anywhere.
          </Text>
          <Pressable style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </Pressable>
        </View>
        <HazardStripe />
      </SafeAreaView>
    );
  }

  const yoloMissing = serverOnline && healthInfo?.yolo_model !== 'ready';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <HazardStripe />
      <Header serverOnline={serverOnline} healthInfo={healthInfo} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Camera ───────────────────────────────────── */}
        <View style={styles.cameraContainer}>
          <CameraViewComp
            cameraRef={cameraRef}
            facing={facing}
            isScanning={isScanning}
            lastResult={lastResult}
          />
        </View>

        {/* ── Scan controls ────────────────────────────── */}
        <ScanButton
          onStart={startLiveScan}
          onStop={stopLiveScan}
          onFlip={flip}
          isLiveScanning={isLiveScanning}
          isScanning={isScanning}
          disabled={!serverOnline}
        />

        {/* ── Server offline warning ───────────────────── */}
        {!serverOnline && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              ⚠  Backend offline — run{' '}
              <Text style={styles.bannerCode}>uvicorn main:app --reload</Text>
            </Text>
          </View>
        )}

        {/* ── YOLO model missing warning ───────────────── */}
        {yoloMissing && (
          <View style={[styles.banner, styles.bannerInfo]}>
            <Text style={[styles.bannerText, { color: COLORS.purple }]}>
              ℹ  best.pt not found — running HSV colour fallback.
              Copy your YOLOv11s weights to backend/best.pt for full detection.
            </Text>
          </View>
        )}

        {/* ── Live scanning status bar ─────────────────── */}
        {isLiveScanning && (
          <View style={styles.liveBar}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBarText}>
              {isScanning ? 'Analysing frame…' : isSpeaking ? 'Speaking…' : 'Live — tap End Scanning to stop'}
            </Text>
          </View>
        )}

        {/* ── Sensitivity slider ───────────────────────── */}
        {/* Only relevant for the HSV fallback path, but shown
            always so users understand the sensitivity concept. */}
        <View style={styles.sliderCard}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>SENSITIVITY</Text>
            <Text style={styles.sliderValue}>{sensitivity.toFixed(0)}%</Text>
          </View>
          <Text style={styles.sliderSub}>
            Minimum hi-vis coverage required to mark someone COMPLIANT
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={3}
            maximumValue={25}
            step={1}
            value={sensitivity}
            onValueChange={setSensitivity}
            minimumTrackTintColor={COLORS.yellow}
            maximumTrackTintColor={COLORS.surface2}
            thumbTintColor={COLORS.yellow}
          />
          <View style={styles.sliderTicks}>
            <Text style={styles.sliderTick}>3%</Text>
            <Text style={styles.sliderTick}>14%</Text>
            <Text style={styles.sliderTick}>25%</Text>
          </View>
        </View>

        {/* ── Result ───────────────────────────────────── */}
        <ResultCard result={lastResult} scanTime={scanTime} />

        {/* ── History ──────────────────────────────────── */}
        <ScanHistory history={history} />

      </ScrollView>

      <HazardStripe />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <InnerApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: COLORS.bg },
  scroll:        { flex: 1 },
  scrollContent: { padding: SIZES.lg, gap: SIZES.md },
  cameraContainer: { aspectRatio: 3 / 4, width: '100%' },

  // Live bar
  liveBar: {
    flexDirection: 'row', alignItems: 'center', gap: SIZES.sm,
    backgroundColor: 'rgba(0,230,118,0.07)',
    borderWidth: 1, borderColor: 'rgba(0,230,118,0.18)',
    borderRadius: SIZES.radiusSm, padding: SIZES.sm,
  },
  liveDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.green },
  liveBarText: { fontSize: 13, color: COLORS.green, fontWeight: '500' },

  // Banners
  banner: {
    backgroundColor: 'rgba(255,109,0,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,109,0,0.22)',
    borderRadius: SIZES.radiusSm, padding: SIZES.sm,
  },
  bannerInfo: {
    backgroundColor: 'rgba(206,147,216,0.07)',
    borderColor:     'rgba(206,147,216,0.22)',
  },
  bannerText: { fontSize: 12, color: COLORS.orange, lineHeight: 18 },
  bannerCode: { fontFamily: 'monospace', backgroundColor: 'rgba(255,109,0,0.15)' },

  // Sensitivity slider card
  sliderCard: {
    backgroundColor: COLORS.surface,
    borderRadius:    SIZES.radiusMd,
    borderWidth:     1,
    borderColor:     COLORS.border,
    padding:         SIZES.md,
  },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderLabel:  { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 2.5, textTransform: 'uppercase' },
  sliderValue:  { fontSize: 18, fontWeight: '800', color: COLORS.yellow },
  sliderSub:    { fontSize: 11, color: COLORS.muted, marginTop: 2, marginBottom: SIZES.xs },
  slider:       { width: '100%', height: 36 },
  sliderTicks:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  sliderTick:   { fontSize: 10, color: COLORS.muted },

  // Permission screen
  permissionScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SIZES.xxl, gap: SIZES.md },
  permIcon:    { fontSize: 50 },
  permTitle:   { fontSize: 22, fontWeight: '800', color: COLORS.yellow, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 },
  permBody:    { fontSize: 14, color: COLORS.muted, textAlign: 'center', lineHeight: 22 },
  permBtn:     { backgroundColor: COLORS.yellow, borderRadius: SIZES.radiusLg, paddingVertical: SIZES.md, paddingHorizontal: SIZES.xxl, marginTop: SIZES.sm },
  permBtnText: { fontSize: 17, fontWeight: '800', color: '#000', textTransform: 'uppercase', letterSpacing: 1 },
});
