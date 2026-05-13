# ─────────────────────────────────────────────────────────────
# backend/detector.py  — v5
#
# THREE-SIGNAL DETECTION:
#
#   Signal 1 — Safety vest colour (HSV analysis)
#     Checks for fluorescent yellow, orange, green, SOLAS red/orange
#     across the full frame. Fast and reliable.
#
#   Signal 2 — Skin tone detection (YCrCb colour space)
#     YCrCb separates luminance (brightness) from chrominance
#     (colour), making skin tone detection robust across ALL skin
#     tones regardless of lighting. Chairs, tables, clothes, and
#     walls don't contain skin tones — people do (face, hands,
#     forearms are usually visible even in full PPE).
#
#   Signal 3 — Frame variance
#     Fast pre-check. If the image is nearly uniform (pointing
#     at a blank wall or the sky), skip everything and return
#     NO_PERSON immediately.
#
# DECISION LOGIC:
#   coverage >= sensitivity           → COMPLIANT
#   coverage <  sensitivity
#     AND skin tones detected         → NON_COMPLIANT (person, no vest)
#     AND no skin tones               → NO_PERSON (object / empty frame)
# ─────────────────────────────────────────────────────────────

import base64
import numpy as np
import cv2
from typing import Optional


def decode_image(base64_string: str) -> Optional[np.ndarray]:
    """Convert base64 string to OpenCV BGR image."""
    try:
        image_bytes = base64.b64decode(base64_string)
        buffer      = np.frombuffer(image_bytes, dtype=np.uint8)
        return cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    except Exception as e:
        print(f"[detector] Decode failed: {e}")
        return None


# ─────────────────────────────────────────────────────────────
# is_frame_empty(image_bgr) → bool
#
# Quick pre-check using pixel brightness variance.
# A blank wall / sky / floor → nearly uniform → low std dev.
# Any real-world scene with objects or people → higher std dev.
# Threshold 15 is conservative — only catches truly blank frames.
# ─────────────────────────────────────────────────────────────
def is_frame_empty(image_bgr: np.ndarray) -> bool:
    gray    = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    std_dev = float(np.std(gray))
    print(f"[detector] Frame std dev: {std_dev:.1f}")
    return std_dev < 15


# ─────────────────────────────────────────────────────────────
# has_person(image_bgr) → bool
#
# Detects human presence using skin tone detection in YCrCb
# colour space.
#
# Why YCrCb and not HSV for skin?
#   HSV skin detection fails on dark skin tones because dark skin
#   has very different Hue/Saturation values from light skin.
#   YCrCb separates brightness (Y) from colour (Cr, Cb), making
#   the skin colour range consistent across ALL ethnicities.
#
# The Cr (red chrominance) and Cb (blue chrominance) ranges
# below cover the full human skin tone spectrum from very light
# to very dark:
#   Cr: 133–173
#   Cb:  77–127
#
# Threshold: if ≥ 1.5% of the frame is skin-toned, a person
# is likely present. 1.5% ≈ a face or pair of hands in frame.
# Chairs, tables, clothing racks, ropes — none of these fall
# in this YCrCb range.
# ─────────────────────────────────────────────────────────────
def has_person(image_bgr: np.ndarray) -> bool:
    # Resize to 320px wide for speed — skin detection doesn't need full res
    h, w   = image_bgr.shape[:2]
    scale  = min(1.0, 320 / w)
    small  = cv2.resize(image_bgr, (int(w * scale), int(h * scale)))

    ycrcb  = cv2.cvtColor(small, cv2.COLOR_BGR2YCrCb)

    # YCrCb skin tone range — valid for all skin tones
    lower  = np.array([0,   133,  77], dtype=np.uint8)
    upper  = np.array([255, 173, 127], dtype=np.uint8)

    mask         = cv2.inRange(ycrcb, lower, upper)
    skin_pixels  = int(np.sum(mask > 0))
    total_pixels = small.shape[0] * small.shape[1]
    skin_pct     = (skin_pixels / total_pixels) * 100.0

    print(f"[detector] Skin coverage: {skin_pct:.2f}%")
    return skin_pct >= 1.5


# ─────────────────────────────────────────────────────────────
# analyse_vest_colours(image_hsv) → (coverage_percent, vest_type)
#
# Scans the centre 80% of the frame for all known safety vest
# and life jacket colours.
#
# Land:   fluorescent yellow, orange, safety green
# Marine: SOLAS orange-red, rescue red, immersion suit orange,
#         marine hi-vis yellow
# ─────────────────────────────────────────────────────────────
def analyse_vest_colours(image_hsv: np.ndarray) -> tuple[float, str]:
    h, w  = image_hsv.shape[:2]

    # Centre 80% of frame
    x1, x2 = int(w * 0.10), int(w * 0.90)
    y1, y2 = int(h * 0.05), int(h * 0.95)
    region  = image_hsv[y1:y2, x1:x2]

    if region.size == 0:
        return 0.0, 'none'

    h_ch = region[:, :, 0]
    s_ch = region[:, :, 1]
    v_ch = region[:, :, 2]

    vivid = (s_ch >= 85) & (v_ch >= 65)

    # Land vests
    yellow_land   = vivid & (h_ch >= 22) & (h_ch <= 55)
    orange_land   = vivid & (h_ch >= 8)  & (h_ch <= 22) & (s_ch >= 110)
    green_land    = vivid & (h_ch >= 55) & (h_ch <= 80) & (s_ch >= 100)

    # Marine vests
    solas_orange  = vivid & (h_ch >= 5)  & (h_ch <= 18) & (s_ch >= 140)
    marine_orange = vivid & (h_ch >= 8)  & (h_ch <= 20) & (s_ch >= 120) & (v_ch >= 90)
    rescue_red    = vivid & ((h_ch <= 8) | (h_ch >= 165)) & (s_ch >= 140) & (v_ch >= 85)
    marine_yellow = vivid & (h_ch >= 20) & (h_ch <= 50) & (s_ch >= 130) & (v_ch >= 110)

    any_safety = (yellow_land | orange_land | green_land |
                  solas_orange | marine_orange | rescue_red | marine_yellow)

    total    = region.shape[0] * region.shape[1]
    count    = int(np.sum(any_safety))
    coverage = (count / total * 100.0) if total > 0 else 0.0

    counts = {
        'hi-vis yellow': int(np.sum(yellow_land)),
        'hi-vis orange': int(np.sum(orange_land)),
        'safety green':  int(np.sum(green_land)),
        'SOLAS orange':  int(np.sum(solas_orange)),
        'marine orange': int(np.sum(marine_orange)),
        'rescue red':    int(np.sum(rescue_red)),
        'marine yellow': int(np.sum(marine_yellow)),
    }
    dominant = max(counts, key=counts.get) if count > 0 else 'none'

    print(f"[detector] Vest coverage: {coverage:.1f}% type: {dominant}")
    return round(coverage, 1), dominant


# ─────────────────────────────────────────────────────────────
# scan(base64_image, sensitivity) → dict
# ─────────────────────────────────────────────────────────────
def scan(base64_image: str, sensitivity: float = 8.0) -> dict:

    image_bgr = decode_image(base64_image)
    if image_bgr is None:
        return _error_result("Could not decode the image.")

    # ── Signal 1: Frame empty check ───────────────────────────
    if is_frame_empty(image_bgr):
        return _no_person("Frame appears empty.")

    # ── Signal 2: Vest colour analysis ───────────────────────
    image_hsv           = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    coverage, vest_type = analyse_vest_colours(image_hsv)

    if coverage >= sensitivity:
        # Safety vest clearly visible — compliant
        return {
            "verdict":    "COMPLIANT",
            "reason":     f"Safety vest detected — {vest_type} ({coverage:.1f}% coverage).",
            "confidence": min(99, 60 + int(coverage * 2)),
            "coverage":   coverage,
            "vest_type":  vest_type,
            "people":     1,
            "boxes":      [],
        }

    # ── Signal 3: Skin tone check ─────────────────────────────
    # Vest not found — is there actually a person here,
    # or is it just an object / empty background?
    if has_person(image_bgr):
        # Person is present but not wearing a vest
        return {
            "verdict":    "NON_COMPLIANT",
            "reason":     "Put on a life jacket to access this vessel.",
            "confidence": min(95, 50 + int((sensitivity - coverage) * 3)),
            "coverage":   coverage,
            "vest_type":  "none",
            "people":     1,
            "boxes":      [],
        }

    # No vest, no skin tones — must be an object or empty frame
    return _no_person("No person detected — objects or background only.")


def _no_person(reason: str) -> dict:
    return {
        "verdict":    "NO_PERSON",
        "reason":     reason,
        "confidence": 80,
        "coverage":   0.0,
        "vest_type":  "none",
        "people":     0,
        "boxes":      [],
    }

def _error_result(message: str) -> dict:
    return {
        "verdict":    "UNKNOWN",
        "reason":     message,
        "confidence": 0,
        "coverage":   0.0,
        "vest_type":  "none",
        "people":     0,
        "boxes":      [],
    }
