// ─────────────────────────────────────────────────────────────
// hooks/useScanner.js
//
// KEY CHANGE in this version:
//   After each scan result, the loop now AWAITS the voice alert
//   before starting the pause timer. This means:
//
//     1. Frame captured & analysed
//     2. Result shown on screen
//     3. Voice plays fully ("Welcome aboard" OR "Put on a life jacket")
//     4. 2.5 second pause
//     5. Next scan begins
//
//   Previously step 3 and 4 happened at the same time, so the
//   next scan could fire while the voice was still talking.
// ─────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from 'react';
import { useCameraPermissions } from 'expo-camera';
import { pingServer, scanImage } from '../utils/api';
import { playCompliantAlert, playNonCompliantAlert, stopAlert } from '../utils/audioAlert';

// Gap between scans AFTER the voice finishes (milliseconds)
const POST_AUDIO_PAUSE_MS = 1500;

// Maximum scans to keep in history
const MAX_HISTORY = 10;

export function useScanner() {

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef      = useRef(null);
  const liveScanActive = useRef(false);  // Loop keep-going flag

  const [isLiveScanning, setIsLiveScanning] = useState(false);
  const [isScanning,     setIsScanning]     = useState(false);
  const [isSpeaking,     setIsSpeaking]     = useState(false);  // Voice playing?
  const [lastResult,     setLastResult]     = useState(null);
  const [serverOnline,   setServerOnline]   = useState(false);
  const [history,        setHistory]        = useState([]);
  const [facing,         setFacing]         = useState('back');

  // Server health check every 10 seconds
  useEffect(() => {
    async function checkServer() {
      const online = await pingServer();
      setServerOnline(online);
    }
    checkServer();
    const interval = setInterval(checkServer, 10000);
    return () => clearInterval(interval);
  }, []);

  const flip = useCallback(() => {
    setFacing(current => current === 'back' ? 'front' : 'back');
  }, []);

  const addToHistory = useCallback((result) => {
    setHistory(prev => [
      {
        verdict:  result.verdict,
        time:     new Date(),
        coverage: result.coverage,
        vestType: result.vest_type,
      },
      ...prev
    ].slice(0, MAX_HISTORY));
  }, []);

  // ── runOneScan() ──────────────────────────────────────────
  // Captures one frame, analyses it, plays the right voice,
  // then returns. The loop awaits this whole sequence before
  // starting the next scan.
  const runOneScan = async () => {
    if (!cameraRef.current) return;

    // ── Clear previous bounding boxes immediately ─────────────
    // Without this, the coloured boxes and labels from the last
    // scan stay drawn on the camera until the new result arrives
    // — which looks wrong, especially if the person has moved.
    // We keep the last verdict text in the result card (so the
    // user can still read it) but wipe the camera overlay clean.
    setLastResult(prev => prev ? { ...prev, boxes: [] } : null);

    // ── Phase 1: Capture & analyse ────────────────────────────
    setIsScanning(true);
    let result = null;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64:         true,
        quality:        0.7,
        skipProcessing: true,
      });
      result = await scanImage(photo.base64);
    } catch (error) {
      result = {
        verdict:    'UNKNOWN',
        reason:     'Scan error: ' + error.message,
        confidence: 0,
        coverage:   0,
        vest_type:  'none',
        people:     0,
        boxes:      [],
      };
    } finally {
      setIsScanning(false);
    }

    // Stop here if user tapped End Scanning while we were processing
    if (!liveScanActive.current) return;

    // Show the result on screen
    setLastResult(result);
    addToHistory(result);

    // ── Phase 2: Play the appropriate voice alert ─────────────
    // We AWAIT this so the loop waits for the voice to finish
    // before starting the pause timer or the next scan.
    if (result.verdict === 'COMPLIANT') {
      setIsSpeaking(true);
      await playCompliantAlert();      // "Welcome aboard"
      setIsSpeaking(false);

    } else if (result.verdict === 'NON_COMPLIANT') {
      setIsSpeaking(true);
      await playNonCompliantAlert();   // "Put on a life jacket..."
      setIsSpeaking(false);
    }
    // NO_PERSON and UNKNOWN play no audio — scan silently continues
  };

  // ── startLiveScan() ───────────────────────────────────────
  const startLiveScan = useCallback(async () => {
    if (liveScanActive.current) return;
    if (!cameraRef.current)     return;

    liveScanActive.current = true;
    setIsLiveScanning(true);
    setLastResult(null);

    while (liveScanActive.current) {
      // Run one full scan + wait for voice to finish
      await runOneScan();

      // Short pause after audio ends before next scan
      if (liveScanActive.current) {
        await new Promise(resolve => setTimeout(resolve, POST_AUDIO_PAUSE_MS));
      }
    }

    setIsLiveScanning(false);
    setIsScanning(false);
    setIsSpeaking(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addToHistory]);

  // ── stopLiveScan() ────────────────────────────────────────
  const stopLiveScan = useCallback(() => {
    liveScanActive.current = false;
    setIsLiveScanning(false);
    setIsScanning(false);
    setIsSpeaking(false);
    stopAlert();   // Cut the voice immediately
  }, []);

  return {
    cameraRef,
    facing,
    flip,
    permission,
    requestPermission,
    startLiveScan,
    stopLiveScan,
    isLiveScanning,
    isScanning,
    isSpeaking,     // New — lets the UI show "Speaking..." status
    lastResult,
    history,
    serverOnline,
  };
}
