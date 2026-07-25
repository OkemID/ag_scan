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

import { useScanner } from './hooks/useScanner';
import Header from './components/Header';
import CameraViewComp from './components/CameraView';
import ScanButton from './components/ScanButton';
import ResultCard from './components/ResultCard';
import ScanHistory from './components/ScanHistory';
import HazardStripe from './components/HazardStripe';
import { COLORS, SIZES } from './constants/theme';
import { initAudio } from './utils/audioAlert';

function InnerApp() {
  useEffect(() => {
    initAudio();
  }, []);

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
    modelReady,
    modelStatus,
    sensitivity,
    setSensitivity,
  } = useScanner();

  useEffect(() => {
    if (lastResult) setScanTime(new Date());
  }, [lastResult]);

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <HazardStripe />
        <Header modelReady={modelReady} />
        <View style={styles.permissionScreen}>
          <Text style={styles.permIcon}>📷</Text>
          <Text style={styles.permTitle}>Camera Access Needed</Text>
          <Text style={styles.permBody}>
            AG Scan uses the camera to detect people and check recognised safety
            colours. Images are analysed on this phone and are not uploaded.
          </Text>
          <Pressable style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </Pressable>
        </View>
        <HazardStripe />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <HazardStripe />
      <Header modelReady={modelReady} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cameraContainer}>
          <CameraViewComp
            cameraRef={cameraRef}
            facing={facing}
            isScanning={isScanning}
            lastResult={lastResult}
          />
        </View>

        <ScanButton
          onStart={startLiveScan}
          onStop={stopLiveScan}
          onFlip={flip}
          isLiveScanning={isLiveScanning}
          isScanning={isScanning}
          disabled={!modelReady}
        />

        {!modelReady && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              ⚠ On-device AI unavailable: {modelStatus?.message || 'Model is loading.'}
            </Text>
          </View>
        )}

        <View style={styles.offlineCard}>
          <Text style={styles.offlineTitle}>OFFLINE MODE</Text>
          <Text style={styles.offlineBody}>
            Person detection and colour analysis run entirely on this device.
            No backend, Wi-Fi or mobile data is required.
          </Text>
        </View>

        {isLiveScanning && (
          <View style={styles.liveBar}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBarText}>
              {isScanning
                ? 'Analysing on device…'
                : isSpeaking
                  ? 'Playing alert…'
                  : 'Live — tap End Scanning to stop'}
            </Text>
          </View>
        )}

        <View style={styles.sliderCard}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>COLOUR THRESHOLD</Text>
            <Text style={styles.sliderValue}>{sensitivity.toFixed(0)}%</Text>
          </View>
          <Text style={styles.sliderSub}>
            Minimum recognised safety-colour coverage in each detected torso.
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

        <ResultCard result={lastResult} scanTime={scanTime} />
        <ScanHistory history={history} />

        <View style={styles.disclaimerCard}>
          <Text style={styles.disclaimerTitle}>IMPORTANT</Text>
          <Text style={styles.disclaimerText}>
            This first release checks safety colours; it does not confirm that an
            item is a certified life jacket. Always perform a physical inspection.
          </Text>
        </View>
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
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: SIZES.lg, gap: SIZES.md },
  cameraContainer: { aspectRatio: 3 / 4, width: '100%' },

  liveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    backgroundColor: 'rgba(0,230,118,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(0,230,118,0.18)',
    borderRadius: SIZES.radiusSm,
    padding: SIZES.sm,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.green },
  liveBarText: { fontSize: 13, color: COLORS.green, fontWeight: '500' },

  banner: {
    backgroundColor: 'rgba(255,109,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,109,0,0.22)',
    borderRadius: SIZES.radiusSm,
    padding: SIZES.sm,
  },
  bannerText: { fontSize: 12, color: COLORS.orange, lineHeight: 18 },

  offlineCard: {
    backgroundColor: 'rgba(206,147,216,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(206,147,216,0.22)',
    borderRadius: SIZES.radiusSm,
    padding: SIZES.sm,
  },
  offlineTitle: {
    color: COLORS.purple,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 3,
  },
  offlineBody: { color: COLORS.textDim, fontSize: 12, lineHeight: 18 },

  sliderCard: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SIZES.md,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 2.2,
  },
  sliderValue: { fontSize: 18, fontWeight: '800', color: COLORS.yellow },
  sliderSub: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
    marginBottom: SIZES.xs,
  },
  slider: { width: '100%', height: 36 },
  sliderTicks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  sliderTick: { fontSize: 10, color: COLORS.muted },

  disclaimerCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,193,7,0.22)',
    backgroundColor: 'rgba(255,193,7,0.05)',
    borderRadius: SIZES.radiusSm,
    padding: SIZES.sm,
  },
  disclaimerTitle: {
    color: COLORS.yellow,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  disclaimerText: { color: COLORS.textDim, fontSize: 11, lineHeight: 17 },

  permissionScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SIZES.xxl,
    gap: SIZES.md,
  },
  permIcon: { fontSize: 50 },
  permTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.yellow,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  permBody: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
  permBtn: {
    backgroundColor: COLORS.yellow,
    borderRadius: SIZES.radiusLg,
    paddingVertical: SIZES.md,
    paddingHorizontal: SIZES.xxl,
    marginTop: SIZES.sm,
  },
  permBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#000',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
