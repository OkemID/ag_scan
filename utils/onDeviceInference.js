import AGScanInference from '../modules/ag-scan-inference';

export async function initializeDetector() {
  return AGScanInference.initialize();
}

export async function scanImageOnDevice(imageUri, sensitivity = 12) {
  if (!imageUri) {
    throw new Error('The camera did not return an image URI.');
  }

  // The native module deletes temporary camera files after decoding them.
  return AGScanInference.scan(imageUri, Number(sensitivity), true);
}

export function getDetectorStatus() {
  return AGScanInference.getStatus();
}
