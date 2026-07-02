# ─────────────────────────────────────────────────────────────
# backend/main.py
#
# FastAPI server for AG Scan v3 person-first detection.
#
# Routes:
#   GET  /health  → liveness + reports active detector configuration
#   POST /scan    → receives image + sensitivity, returns scan result
# ─────────────────────────────────────────────────────────────

import os
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import detector


app = FastAPI(
    title="AG Scan Backend",
    description="Person-first safety jacket detection backend",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ── Request / Response models ────────────────────────────────

class ScanRequest(BaseModel):
    image: str = Field(..., description="Base64-encoded JPEG image")
    sensitivity: float = Field(
        10.0,
        ge=1.0,
        le=50.0,
        description="Minimum safety-colour coverage percentage for HSV fallback",
    )


class BoundingBox(BaseModel):
    x: float
    y: float
    w: float
    h: float
    compliant: bool
    coverage: float


class ScanResponse(BaseModel):
    verdict: str
    reason: str
    confidence: int
    coverage: float
    people: int
    vest_type: str
    boxes: list[BoundingBox]
    duration_ms: float
    detection_method: str


# ── Routes ──────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    status = detector.detector_status()

    return {
        "status": "ok",
        "service": "AG Scan Backend v3",

        # Keep yolo_model for the existing Header.jsx badge, so the frontend
        # does not break after the backend upgrade.
        "yolo_model": status["jacket_model_file"],

        # New, clearer status fields for the person-first pipeline.
        "person_model": status["person_model"],
        "person_model_loaded": status["person_model_loaded"],
        "person_model_failed": status["person_model_failed"],
        "jacket_model": status["jacket_model_file"],
        "pipeline": status["pipeline"],
    }


@app.post("/scan", response_model=ScanResponse)
async def scan_image(request: ScanRequest):
    if not request.image or len(request.image) < 100:
        raise HTTPException(status_code=400, detail="Image data is missing or too short.")

    start_time = time.time()

    try:
        result = detector.scan(
            base64_image=request.image,
            sensitivity=request.sensitivity,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")

    duration_ms = round((time.time() - start_time) * 1000, 1)

    print(
        f"[scan] verdict={result['verdict']} "
        f"people={result['people']} "
        f"method={result.get('detection_method', '?')} "
        f"took={duration_ms}ms"
    )

    return ScanResponse(
        verdict=result["verdict"],
        reason=result["reason"],
        confidence=result["confidence"],
        coverage=result["coverage"],
        vest_type=result.get("vest_type", "none"),
        people=result["people"],
        boxes=result["boxes"],
        duration_ms=duration_ms,
        detection_method=result.get("detection_method", "unknown"),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
