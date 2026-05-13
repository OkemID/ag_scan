// ─────────────────────────────────────────────────────────────
// App.jsx — Root component for AG Scan
//
// Changed in v2:
//   - Passes startLiveScan / stopLiveScan / isLiveScanning
//     to ScanButton instead of the old single `scan` function
// ─────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useScanner }  from './hooks/useScanner';
import Header          from './components/Header';
import CameraView      from './components/CameraView';
import ScanButton      from './components/ScanButton';
import ResultCard      from './components/ResultCard';
import ScanHistory     from './components/ScanHistory';
import HazardStripe    from './components/HazardStripe';
import { COLORS, SIZES } from './constants/theme';
import { initAudio } from './utils/audioAlert';

function InnerApp() {
  // Load both audio files into memory as soon as the app opens.
  // This runs once — sounds stay loaded the whole session.
  useEffect(() => { initAudio(); }, []);

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
  } = useScanner();

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <HazardStripe />
        <Header serverOnline={serverOnline} />
        <View style={styles.permissionScreen}>
          <Text style={styles.permissionIcon}>📷</Text>
          <Text style={styles.permissionTitle}>Camera Access Needed</Text>
          <Text style={styles.permissionBody}>
            AG Scan needs your camera to check whether people are
            wearing safety vests. Your camera feed is never stored or sent anywhere.
          </Text>
          <Pressable style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Allow Camera</Text>
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
      <Header serverOnline={serverOnline} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Camera with bounding box overlay */}
        <View style={styles.cameraContainer}>
          <CameraView
            cameraRef={cameraRef}
            facing={facing}
            isScanning={isScanning}
            lastResult={lastResult}
          />
        </View>

        {/* Start / End Scanning buttons */}
        <ScanButton
          onStart={startLiveScan}
          onStop={stopLiveScan}
          onFlip={flip}
          isLiveScanning={isLiveScanning}
          isScanning={isScanning}
          disabled={!serverOnline}
        />

        {/* Server offline warning */}
        {!serverOnline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>
              ⚠ Backend server offline — start it with{' '}
              <Text style={styles.offlineCode}>uvicorn main:app --reload</Text>
            </Text>
          </View>
        )}

        {/* Live scanning status bar */}
        {isLiveScanning && (
          <View style={styles.liveBar}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBarText}>
              {isScanning ? 'Analysing frame…' : isSpeaking ? 'Speaking…' : 'Scanning — tap End Scanning to stop'}
            </Text>
          </View>
        )}

        <ResultCard result={lastResult} />
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
  root:            { flex: 1, backgroundColor: COLORS.bg },
  scroll:          { flex: 1 },
  scrollContent:   { padding: SIZES.lg, gap: SIZES.md },
  cameraContainer: { aspectRatio: 3 / 4, width: '100%' },

  // Live scanning status bar
  liveBar: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SIZES.sm,
    backgroundColor: 'rgba(0,230,118,0.08)',
    borderWidth:     1,
    borderColor:     'rgba(0,230,118,0.2)',
    borderRadius:    SIZES.radiusSm,
    padding:         SIZES.sm,
  },
  liveDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.green,
  },
  liveBarText: { fontSize: 13, color: COLORS.green, fontWeight: '500' },

  // Offline banner
  offlineBanner: {
    backgroundColor: 'rgba(255,107,0,0.10)',
    borderWidth:     1,
    borderColor:     'rgba(255,107,0,0.25)',
    borderRadius:    SIZES.radiusSm,
    padding:         SIZES.sm,
  },
  offlineBannerText: { fontSize: 12, color: COLORS.orange, lineHeight: 18 },
  offlineCode:       { fontFamily: 'monospace', backgroundColor: 'rgba(255,107,0,0.15)' },

  // Permission screen
  permissionScreen: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SIZES.xxl, gap: SIZES.md,
  },
  permissionIcon:    { fontSize: 52 },
  permissionTitle:   { fontSize: 22, fontWeight: '800', color: COLORS.yellow, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 },
  permissionBody:    { fontSize: 14, color: COLORS.muted, textAlign: 'center', lineHeight: 22 },
  permissionBtn:     { backgroundColor: COLORS.yellow, borderRadius: SIZES.radiusLg, paddingVertical: SIZES.md, paddingHorizontal: SIZES.xxl, marginTop: SIZES.sm },
  permissionBtnText: { fontSize: 17, fontWeight: '800', color: '#000', textTransform: 'uppercase', letterSpacing: 1 },
});
