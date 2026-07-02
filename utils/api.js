// ─────────────────────────────────────────────────────────────
// utils/api.js
//
// All HTTP communication with the FastAPI backend.
//
// Changes from v1:
//   - sensitivity is now included in every scan request so the
//     UI slider actually affects detection (was always ignored).
//   - detection_method is preserved in error objects so the
//     UI badge always has something to show.
//   - pingServer() now returns the full health payload so the
//     header can show which detector is active (YOLO vs HSV).
// ─────────────────────────────────────────────────────────────

// ── Server address ────────────────────────────────────────────
// Change this to your machine's local IP address when running
// on a physical device (phone + computer on the same Wi-Fi).
// Example: 'http://192.168.1.42:8000'
// Find your IP:  ifconfig (Mac/Linux)  or  ipconfig (Windows)
const SERVER_URL = "http://10.250.2.230:8000";

const REQUEST_TIMEOUT_MS = 15_000;


// ─────────────────────────────────────────────────────────────
// pingServer()
//
// Returns the health payload { status, yolo_model } on success,
// or null on failure. The header component uses yolo_model to
// show which detection path is active.
// ─────────────────────────────────────────────────────────────
export async function pingServer() {
  try {
    const response = await fetch(`${SERVER_URL}/health`, { method: 'GET' });
    if (!response.ok) return null;
    return await response.json();   // { status, service, yolo_model }
  } catch {
    return null;
  }
}


// ─────────────────────────────────────────────────────────────
// scanImage(base64Image, sensitivity)
//
// Posts the image and sensitivity to /scan.
// sensitivity (number, 1–50) is now forwarded to the backend
// so the slider in the UI changes detection behaviour.
// ─────────────────────────────────────────────────────────────
export async function scanImage(base64Image, sensitivity = 10) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${SERVER_URL}/scan`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        image:       base64Image,
        sensitivity: sensitivity,   // ← fixed: was never sent in v1
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Server error: ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    clearTimeout(timeoutId);

    const base = {
      verdict:          'UNKNOWN',
      confidence:       0,
      coverage:         0,
      people:           0,
      boxes:            [],
      vest_type:        'none',
      detection_method: 'error',
    };

    if (error.name === 'AbortError') {
      return { ...base, reason: 'Request timed out. Is the server running?' };
    }
    if (error.message.includes('Network request failed') ||
        error.message.includes('fetch')) {
      return { ...base, reason: `Cannot reach server at ${SERVER_URL}.` };
    }
    return { ...base, reason: error.message };
  }
}
