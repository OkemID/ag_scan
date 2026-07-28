import { useState, useRef, useCallback, useEffect } from 'react';
import { useCameraPermissions } from 'expo-camera';
import {
  initializeDetector,
  scanImageOnDevice,
} from '../utils/onDeviceInference';
import {
  playCompliantAlert,
  playNonCompliantAlert,
  stopAlert,
} from '../utils/audioAlert';

const POST_AUDIO_PAUSE_MS = 1_500;
const MAX_HISTORY = 10;

export function useScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const liveScanActive = useRef(false);

  const [isLiveScanning, setIsLiveScanning] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [modelReady, setModelReady] = useState(false);
  const [modelStatus, setModelStatus] = useState({
    ready: false,
    mode: 'on-device-yolo-wear-notwear',
    message: 'Loading the on-device life-jacket model…',
  });
  const [history, setHistory] = useState([]);
  const [facing, setFacing] = useState('back');
  const [decisionThreshold, setDecisionThreshold] = useState(60);

  useEffect(() => {
    let mounted = true;

    async function loadDetector() {
      try {
        const status = await initializeDetector();
        if (!mounted) return;
        setModelStatus(status);
        setModelReady(Boolean(status?.ready));
      } catch (error) {
        if (!mounted) return;
        setModelStatus({
          ready: false,
          mode: 'on-device-yolo-wear-notwear',
          message: error?.message || 'Could not load the on-device AI model.',
        });
        setModelReady(false);
      }
    }

    loadDetector();
    return () => {
      mounted = false;
      liveScanActive.current = false;
    };
  }, []);

  const flip = useCallback(() => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  }, []);

  const addToHistory = useCallback((result) => {
    setHistory((previous) => [
      {
        verdict: result.verdict,
        time: new Date(),
        confidence: result.confidence,
        people: result.people,
        wearing: result.wearing,
        notWearing: result.not_wearing,
        uncertain: result.uncertain,
        detectionMethod: result.detection_method,
        durationMs: result.duration_ms,
      },
      ...previous,
    ].slice(0, MAX_HISTORY));
  }, []);

  const runOneScan = useCallback(async () => {
    if (!cameraRef.current || !modelReady) return;

    setLastResult((previous) => (
      previous ? { ...previous, boxes: [] } : null
    ));
    setIsScanning(true);

    let result;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: false,
        quality: 0.8,
        skipProcessing: false,
      });

      result = await scanImageOnDevice(photo.uri, decisionThreshold);
    } catch (error) {
      result = {
        verdict: 'UNKNOWN',
        reason: `Scan error: ${error?.message || 'Unknown error'}`,
        confidence: 0,
        coverage: 0,
        compliance_rate: 0,
        vest_type: 'none',
        people: 0,
        wearing: 0,
        not_wearing: 0,
        uncertain: 0,
        boxes: [],
        detection_method: 'error',
        duration_ms: 0,
      };
    } finally {
      setIsScanning(false);
    }

    if (!liveScanActive.current) return;

    setLastResult(result);
    addToHistory(result);

    if (result.verdict === 'LIFE_JACKET_CHECK_PASSED') {
      setIsSpeaking(true);
      await playCompliantAlert();
      setIsSpeaking(false);
    } else if (
      result.verdict === 'LIFE_JACKET_MISSING' ||
      result.verdict === 'MANUAL_CHECK_REQUIRED'
    ) {
      setIsSpeaking(true);
      await playNonCompliantAlert();
      setIsSpeaking(false);
    }
  }, [addToHistory, decisionThreshold, modelReady]);

  const startLiveScan = useCallback(async () => {
    if (liveScanActive.current || !cameraRef.current || !modelReady) return;

    liveScanActive.current = true;
    setIsLiveScanning(true);
    setLastResult(null);

    while (liveScanActive.current) {
      await runOneScan();
      if (liveScanActive.current) {
        await new Promise((resolve) => setTimeout(resolve, POST_AUDIO_PAUSE_MS));
      }
    }

    setIsLiveScanning(false);
    setIsScanning(false);
    setIsSpeaking(false);
  }, [modelReady, runOneScan]);

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
    modelReady,
    modelStatus,
    decisionThreshold,
    setDecisionThreshold,
  };
}
