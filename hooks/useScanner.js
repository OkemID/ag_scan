// ─────────────────────────────────────────────────────────────
// hooks/useScanner.js
//
// All scanning state and logic. Changes from v1:
//
//   - sensitivity state (default 10%) lives here and is passed
//     to scanImage() so the UI slider now actually does something.
//
//   - pingServer() now returns a health payload, not just a bool.
//     serverOnline remains a bool; healthInfo carries the detail
//     (including yolo_model status) for the Header to display.
//
//   - history entries now include detection_method and
//     vestType so ScanHistory can show richer rows.
//
//   - runOneScan clears stale boxes immediately before capture
//     (carried forward from v1 — this behaviour is correct).
// ─────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from 'react';
import { useCameraPermissions }                       from 'expo-camera';
import { pingServer, scanImage }                      from '../utils/api';
import {
  playCompliantAlert,
  playNonCompliantAlert,
  stopAlert,
}                                                     from '../utils/audioAlert';

const POST_AUDIO_PAUSE_MS = 1_500;
const MAX_HISTORY         = 10;
const HEALTH_INTERVAL_MS  = 10_000;

export function useScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef      = useRef(null);
  const liveScanActive = useRef(false);

  const [isLiveScanning, setIsLiveScanning] = useState(false);
  const [isScanning,     setIsScanning]     = useState(false);
  const [isSpeaking,     setIsSpeaking]     = useState(false);
  const [lastResult,     setLastResult]     = useState(null);
  const [serverOnline,   setServerOnline]   = useState(false);
  const [healthInfo,     setHealthInfo]     = useState(null);   // full /health payload
  const [history,        setHistory]        = useState([]);
  const [facing,         setFacing]         = useState('back');
  const [sensitivity,    setSensitivity]    = useState(10);     // 1–50, default 10%

  // ── Server health poll ───────────────────────────────────
  useEffect(() => {
    async function checkServer() {
      const payload = await pingServer();
      setServerOnline(!!payload);
      setHealthInfo(payload);
    }
    checkServer();
    const id = setInterval(checkServer, HEALTH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const flip = useCallback(() => {
    setFacing(f => f === 'back' ? 'front' : 'back');
  }, []);

  const addToHistory = useCallback((result) => {
    setHistory(prev => [
      {
        verdict:         result.verdict,
        time:            new Date(),
        coverage:        result.coverage,
        vestType:        result.vest_type,
        detectionMethod: result.detection_method,
        people:          result.people,
      },
      ...prev,
    ].slice(0, MAX_HISTORY));
  }, []);

  // ── runOneScan ─────────────────────────────────────────
  const runOneScan = async () => {
    if (!cameraRef.current) return;

    // Clear stale bounding boxes immediately so the overlay
    // doesn't show boxes from the previous frame while we wait
    setLastResult(prev => prev ? { ...prev, boxes: [] } : null);

    setIsScanning(true);
    let result = null;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64:         true,
        quality:        0.8,     // Slightly higher quality for YOLO
        skipProcessing: true,
      });
      result = await scanImage(photo.base64, sensitivity);
    } catch (error) {
      result = {
        verdict:          'UNKNOWN',
        reason:           'Scan error: ' + error.message,
        confidence:       0,
        coverage:         0,
        vest_type:        'none',
        people:           0,
        boxes:            [],
        detection_method: 'error',
      };
    } finally {
      setIsScanning(false);
    }

    if (!liveScanActive.current) return;

    setLastResult(result);
    addToHistory(result);

    if (result.verdict === 'COMPLIANT') {
      setIsSpeaking(true);
      await playCompliantAlert();
      setIsSpeaking(false);
    } else if (result.verdict === 'NON_COMPLIANT') {
      setIsSpeaking(true);
      await playNonCompliantAlert();
      setIsSpeaking(false);
    }
  };

  // ── startLiveScan ──────────────────────────────────────
  const startLiveScan = useCallback(async () => {
    if (liveScanActive.current) return;
    if (!cameraRef.current)     return;

    liveScanActive.current = true;
    setIsLiveScanning(true);
    setLastResult(null);

    while (liveScanActive.current) {
      await runOneScan();
      if (liveScanActive.current) {
        await new Promise(r => setTimeout(r, POST_AUDIO_PAUSE_MS));
      }
    }

    setIsLiveScanning(false);
    setIsScanning(false);
    setIsSpeaking(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addToHistory, sensitivity]);

  // ── stopLiveScan ───────────────────────────────────────
  const stopLiveScan = useCallback(() => {
    liveScanActive.current = false;
    setIsLiveScanning(false);
    setIsScanning(false);
    setIsSpeaking(false);
    stopAlert();
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
    isSpeaking,
    lastResult,
    history,
    serverOnline,
    healthInfo,
    sensitivity,
    setSensitivity,
  };
}
