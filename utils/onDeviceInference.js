import AGScanInference from '../modules/ag-scan-inference';

export async function initializeDetector() {
  return AGScanInference.initialize();
}

export async function scanImageOnDevice(imageUri, confidenceThreshold = 60) {
  if (!imageUri) {
    throw new Error('The camera did not return an image URI.');
  }

  // The native module deletes temporary camera files after decoding them.
  return AGScanInference.scan(imageUri, Number(confidenceThreshold), true);
}

export function getDetectorStatus() {
  return AGScanInference.getStatus();
}
