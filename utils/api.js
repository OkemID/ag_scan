// ─────────────────────────────────────────────────────────────
// utils/api.js
//
// This file handles ALL communication with our Python backend.
// Every function here sends data to the server and returns the
// result. Keeping this separate means:
//   - The rest of the app never worries about URLs or headers
//   - If you change the server address, you only edit this file
// ─────────────────────────────────────────────────────────────

// The address of our FastAPI server.
// When running locally: http://localhost:8000
// On a real network: replace with your machine's IP address,
// e.g. http://192.168.1.42:8000  (find it with ipconfig/ifconfig)
const SERVER_URL = "http://10.199.73.230:8000";


// How long (in milliseconds) to wait before giving up on a request.
// 15 seconds is generous — detection should be much faster.
const REQUEST_TIMEOUT_MS = 15000;

// ─────────────────────────────────────────────────────────────
// pingServer()
//
// Sends a simple "are you there?" request to the backend.
// Returns true if the server replied, false if it didn't.
//
// We call this when the app starts so we can show a green/red
// connection indicator in the header.
// ─────────────────────────────────────────────────────────────
export async function pingServer() {
  try {
    const response = await fetch(`${SERVER_URL}/health`, {
      method: 'GET',
    });
    // If the server responds with HTTP 200 OK, we're connected
    return response.ok;
  } catch (error) {
    // Network error = server is not reachable
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// scanImage(base64Image)
//
// Sends a photo to the backend for hi-vis detection.
//
// What it does step by step:
//   1. Wraps the base64 image in a JSON object
//   2. POSTs it to /scan on our FastAPI server
//   3. Waits for the result (with a timeout so we don't hang)
//   4. Returns the result object, or an error object if it failed
//
// The result object looks like this:
//   {
//     verdict:   "COMPLIANT" | "NON_COMPLIANT" | "NO_PERSON" | "UNKNOWN",
//     reason:    "Human-readable explanation",
//     confidence: 85,          // 0–100 percent
//     coverage:  14.3,         // % of torso pixels that are hi-vis
//     people:    1,            // how many people were detected
//     boxes:     [             // bounding boxes as 0–1 ratios
//       { x: 0.1, y: 0.05, w: 0.4, h: 0.8, compliant: true }
//     ]
//   }
// ─────────────────────────────────────────────────────────────
export async function scanImage(base64Image) {
  // AbortController lets us cancel the fetch if it takes too long
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${SERVER_URL}/scan`, {
      method: 'POST',
      headers: {
        // Tell the server we're sending JSON
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // The backend expects the image as a base64 string
        image: base64Image,
      }),
      signal: controller.signal,  // Attach the timeout signal
    });

    // Clear the timeout — we got a response in time
    clearTimeout(timeoutId);

    // If the server returned an error status (e.g. 500), throw it
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }

    // Parse and return the JSON result from the server
    return await response.json();

  } catch (error) {
    clearTimeout(timeoutId);

    // Give back a structured error so the UI can show something sensible
    if (error.name === 'AbortError') {
      return { verdict: 'UNKNOWN', reason: 'Request timed out. Is the server running?', confidence: 0, coverage: 0, people: 0, boxes: [] };
    }

    if (error.message.includes('Network request failed') || error.message.includes('fetch')) {
      return { verdict: 'UNKNOWN', reason: `Cannot reach server at ${SERVER_URL}. Check it is running.`, confidence: 0, coverage: 0, people: 0, boxes: [] };
    }

    return { verdict: 'UNKNOWN', reason: error.message, confidence: 0, coverage: 0, people: 0, boxes: [] };
  }
}
