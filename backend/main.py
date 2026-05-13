# ─────────────────────────────────────────────────────────────
# backend/main.py
#
# The FastAPI web server for AG Scan.
#
# This file's only job is HTTP routing:
#   GET  /health  → tells the app the server is running
#   POST /scan    → receives an image, returns a detection result
#
# All the actual detection logic lives in detector.py.
# Keeping routing separate from logic is a clean pattern that
# makes both files easier to understand and test independently.
#
# To run this server:
#   cd backend
#   pip install -r requirements.txt
#   uvicorn main:app --reload --host 0.0.0.0 --port 8000
#
# Then on your phone, change SERVER_URL in utils/api.js to:
#   http://<your-computer-ip>:8000
# (Find your IP with: ipconfig on Windows, ifconfig on Mac/Linux)
# ─────────────────────────────────────────────────────────────

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import time

# Our detection module — all the OpenCV + colour analysis logic
import detector


# ── Create the FastAPI app ────────────────────────────────────
# This one line creates the whole web server.
app = FastAPI(
    title="AG Scan API",
    description="Hi-Vis Safety Vest Detection Backend",
    version="1.0.0",
)


# ── CORS Middleware ───────────────────────────────────────────
# CORS (Cross-Origin Resource Sharing) is a browser/app security
# rule. Without this, your React Native app would be blocked from
# calling our server because they're on different ports/origins.
#
# allow_origins=["*"] means "accept requests from any address".
# In production you'd lock this down to your app's exact address.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],           # Accept all origins
    allow_methods=["GET", "POST"], # Allow GET and POST requests
    allow_headers=["*"],           # Allow all headers
)


# ── Request/Response models ───────────────────────────────────
# Pydantic models define the shape of JSON data we expect.
# FastAPI uses these to automatically validate incoming requests
# and produce helpful error messages if data is missing or wrong.

class ScanRequest(BaseModel):
    """What the app sends us when requesting a scan."""
    image:       str   = Field(..., description="Base64-encoded JPEG image")
    sensitivity: float = Field(10.0, ge=1.0, le=50.0,
                               description="Minimum hi-vis coverage % to be COMPLIANT")

class BoundingBox(BaseModel):
    """One detected person's bounding box (as 0–1 ratios)."""
    x:         float
    y:         float
    w:         float
    h:         float
    compliant: bool
    coverage:  float

class ScanResponse(BaseModel):
    """What we send back after analysing an image."""
    verdict:    str            # COMPLIANT | NON_COMPLIANT | NO_PERSON | UNKNOWN
    reason:     str            # Human-readable explanation
    confidence: int            # 0–100 how certain we are
    coverage:   float          # Max hi-vis coverage % among detected people
    people:     int            # Number of people detected
    boxes:      list[BoundingBox]  # Bounding boxes for the app to draw
    duration_ms: float         # How long detection took (useful for debugging)


# ─────────────────────────────────────────────────────────────
# GET /health
#
# A simple "ping" endpoint. The app calls this every 10 seconds
# to check if the server is reachable.
#
# Returns HTTP 200 with {"status": "ok"} if everything is fine.
# ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "AG Scan Backend"}


# ─────────────────────────────────────────────────────────────
# POST /scan
#
# The main detection endpoint. The app sends a base64 image,
# we run HOG person detection + HSL colour analysis on it,
# and we return a structured result.
# ─────────────────────────────────────────────────────────────
@app.post("/scan", response_model=ScanResponse)
async def scan_image(request: ScanRequest):
    """
    Receive a base64 image from the app and detect whether
    people in it are wearing hi-vis safety vests.
    """

    # Validate the image string isn't empty
    if not request.image or len(request.image) < 100:
        raise HTTPException(
            status_code=400,
            detail="Image data is missing or too short."
        )

    # Time the detection so we can return duration_ms
    start_time = time.time()

    # ── Run detection ─────────────────────────────────────────
    # We call the scan() function from detector.py.
    # If something goes wrong inside (e.g. corrupt image),
    # it returns an UNKNOWN result rather than crashing.
    try:
        result = detector.scan(
            base64_image=request.image,
            sensitivity=request.sensitivity,
        )
    except Exception as e:
        # Catch any unexpected errors and return a safe response
        raise HTTPException(
            status_code=500,
            detail=f"Detection failed: {str(e)}"
        )

    duration_ms = round((time.time() - start_time) * 1000, 1)

    # ── Log the result to the terminal ────────────────────────
    # This is just for our own debugging — we can see every
    # scan result printed in the terminal where uvicorn runs.
    print(
        f"[scan] verdict={result['verdict']} "
        f"people={result['people']} "
        f"coverage={result['coverage']}% "
        f"took={duration_ms}ms"
    )

    # ── Return the result ─────────────────────────────────────
    return ScanResponse(
        verdict=     result["verdict"],
        reason=      result["reason"],
        confidence=  result["confidence"],
        coverage=    result["coverage"],
        people=      result["people"],
        boxes=       result["boxes"],
        duration_ms= duration_ms,
    )


# ─────────────────────────────────────────────────────────────
# Run directly (python main.py) — useful during development.
# In production you'd use: uvicorn main:app
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
