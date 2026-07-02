# ─────────────────────────────────────────────────────────────
# backend/detector.py — v7 person-first detection
#
# NEW DETECTION PIPELINE:
#
#   1. Person segmentation / detection first
#      A pretrained COCO person model detects people only and separates each
#      person from surrounding objects/background before any safety scan runs.
#
#   2. Per-person safety scan
#      Each isolated person crop is checked with the trained life-jacket model
#      when best.pt exists. If best.pt is missing or uncertain, the system falls
#      back to HSV colour analysis inside the person mask only.
#
#   3. Frame-level verdict
#      - No person found                         → NO_PERSON
#      - Any isolated person without jacket      → NON_COMPLIANT
#      - All isolated people have jacket         → COMPLIANT
#
# WHY THIS VERSION IS SAFER:
#   The scan no longer treats random objects, walls, buckets, signs, seats,
#   orange/yellow equipment, or background colours as safety clothing. Objects
#   are ignored unless they are inside the detected person mask/crop.
# ─────────────────────────────────────────────────────────────

import base64
import os
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np


# ── Model configuration ──────────────────────────────────────
# PERSON_MODEL_PATH can be a local .pt file or an Ultralytics model name.
# yolo11n-seg.pt is light and gives instance masks. Use yolo11s-seg.pt if you
# want better accuracy and your machine can handle the extra compute.
PERSON_MODEL_PATH = os.getenv("PERSON_MODEL_PATH", "yolo11n-seg.pt")

# Trained safety/PPE model. Keep the existing best.pt beside this file.
# Class mapping expected from your training YAML:
#   0 = life_jacket
#   1 = no_life_jacket
JACKET_MODEL_PATH = os.getenv(
    "JACKET_MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "best.pt"),
)

# Compatibility alias used by main.py and older code.
MODEL_PATH = JACKET_MODEL_PATH

# Person model thresholds.
PERSON_CONF_THRESHOLD = float(os.getenv("PERSON_CONF_THRESHOLD", "0.35"))
PERSON_IOU_THRESHOLD = float(os.getenv("PERSON_IOU_THRESHOLD", "0.50"))
MIN_PERSON_AREA_PCT = float(os.getenv("MIN_PERSON_AREA_PCT", "1.0"))

# Jacket model thresholds.
JACKET_CONF_THRESHOLD = float(os.getenv("JACKET_CONF_THRESHOLD", "0.35"))
JACKET_IOU_THRESHOLD = float(os.getenv("JACKET_IOU_THRESHOLD", "0.50"))

# COCO class id for person.
COCO_PERSON_CLASS_ID = 0

# Cached model instances.
_person_model = None
_person_model_available = False
_person_model_failed = False

_jacket_model = None
_jacket_model_available = False
_jacket_model_failed = False


@dataclass
class PersonCandidate:
    """Internal representation of a detected and isolated person."""

    x1: int
    y1: int
    x2: int
    y2: int
    confidence: float
    mask: np.ndarray
    crop_bgr: np.ndarray
    crop_mask: np.ndarray
    isolated_crop_bgr: np.ndarray


# ── Model loading ────────────────────────────────────────────

def _load_yolo_model(path_or_name: str):
    """Load an Ultralytics YOLO model from either a local path or model name."""
    from ultralytics import YOLO

    return YOLO(path_or_name)


def _load_person_model() -> bool:
    """Load the person segmentation model once."""
    global _person_model, _person_model_available, _person_model_failed

    if _person_model_available:
        return True
    if _person_model_failed:
        return False

    try:
        _person_model = _load_yolo_model(PERSON_MODEL_PATH)
        _person_model_available = True
        print(f"[detector] Person model loaded from {PERSON_MODEL_PATH}")
        return True
    except Exception as e:
        _person_model_failed = True
        print(f"[detector] Person model unavailable ({e})")
        return False


def _load_jacket_model() -> bool:
    """Load the trained life-jacket/no-life-jacket model once."""
    global _jacket_model, _jacket_model_available, _jacket_model_failed

    if _jacket_model_available:
        return True
    if _jacket_model_failed:
        return False

    try:
        if os.path.sep in JACKET_MODEL_PATH and not os.path.exists(JACKET_MODEL_PATH):
            print(f"[detector] Jacket model not found at {JACKET_MODEL_PATH}")
            _jacket_model_failed = True
            return False

        _jacket_model = _load_yolo_model(JACKET_MODEL_PATH)
        _jacket_model_available = True
        print(f"[detector] Jacket model loaded from {JACKET_MODEL_PATH}")
        return True
    except Exception as e:
        _jacket_model_failed = True
        print(f"[detector] Jacket model unavailable ({e})")
        return False


# Backward-compatible loader name for older imports/tests.
def _load_yolo() -> bool:
    """Backward compatibility: load the safety jacket model."""
    return _load_jacket_model()


# ── Image helpers ────────────────────────────────────────────

def decode_image(base64_string: str) -> Optional[np.ndarray]:
    """Convert a base64 string to an OpenCV BGR image."""
    try:
        image_bytes = base64.b64decode(base64_string)
        buffer = np.frombuffer(image_bytes, dtype=np.uint8)
        return cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    except Exception as e:
        print(f"[detector] Decode failed: {e}")
        return None


def is_frame_empty(image_bgr: np.ndarray) -> bool:
    """Return True when the frame is nearly blank/uniform."""
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    std_dev = float(np.std(gray))
    print(f"[detector] Frame std dev: {std_dev:.1f}")
    return std_dev < 15


def _normalised_box(x1: int, y1: int, x2: int, y2: int, img_w: int, img_h: int) -> dict:
    """Convert pixel xyxy coordinates to frontend-friendly normalized x/y/w/h."""
    return {
        "x": round(x1 / img_w, 4),
        "y": round(y1 / img_h, 4),
        "w": round((x2 - x1) / img_w, 4),
        "h": round((y2 - y1) / img_h, 4),
    }


def _clip_box(x1: float, y1: float, x2: float, y2: float, img_w: int, img_h: int) -> tuple[int, int, int, int]:
    """Clamp a floating-point box to valid image bounds."""
    ix1 = max(0, min(img_w - 1, int(round(x1))))
    iy1 = max(0, min(img_h - 1, int(round(y1))))
    ix2 = max(ix1 + 1, min(img_w, int(round(x2))))
    iy2 = max(iy1 + 1, min(img_h, int(round(y2))))
    return ix1, iy1, ix2, iy2


def _apply_mask_to_crop(crop_bgr: np.ndarray, crop_mask: np.ndarray) -> np.ndarray:
    """Keep only the person pixels inside a crop and black out the background."""
    if crop_mask is None or crop_mask.size == 0:
        return crop_bgr
    return cv2.bitwise_and(crop_bgr, crop_bgr, mask=crop_mask)


# ── Person-first extraction ──────────────────────────────────

def _extract_people(image_bgr: np.ndarray) -> Optional[list[PersonCandidate]]:
    """
    Detect people and return isolated person crops.

    Returns:
      - list[PersonCandidate] when the person model ran successfully
      - None when the person model failed/unavailable so caller can fall back
    """
    if not _load_person_model():
        return None

    img_h, img_w = image_bgr.shape[:2]

    try:
        result = _person_model.predict(
            source=image_bgr,
            conf=PERSON_CONF_THRESHOLD,
            iou=PERSON_IOU_THRESHOLD,
            classes=[COCO_PERSON_CLASS_ID],
            retina_masks=True,
            verbose=False,
        )[0]
    except Exception as e:
        print(f"[detector] Person inference failed: {e}")
        return None

    people: list[PersonCandidate] = []
    boxes = result.boxes
    masks = result.masks

    if boxes is None or len(boxes) == 0:
        print("[detector] Person model: 0 person(s)")
        return people

    for i, box in enumerate(boxes):
        conf = float(box.conf[0])
        x1, y1, x2, y2 = _clip_box(*box.xyxy[0].tolist(), img_w, img_h)

        # Ignore tiny false positives. A person taking less than 1% of the
        # frame is usually too far away for reliable PPE scanning.
        area_pct = ((x2 - x1) * (y2 - y1) / float(img_w * img_h)) * 100.0
        if area_pct < MIN_PERSON_AREA_PCT:
            print(f"[detector] Ignored tiny person candidate: {area_pct:.2f}%")
            continue

        full_mask = np.zeros((img_h, img_w), dtype=np.uint8)

        # Prefer true segmentation mask; fall back to rectangular mask when a
        # detect-only model is accidentally supplied.
        if masks is not None and masks.data is not None and i < len(masks.data):
            mask = masks.data[i].detach().cpu().numpy()
            if mask.shape[:2] != (img_h, img_w):
                mask = cv2.resize(mask, (img_w, img_h), interpolation=cv2.INTER_NEAREST)
            full_mask = (mask > 0.5).astype(np.uint8) * 255
        else:
            full_mask[y1:y2, x1:x2] = 255

        crop_bgr = image_bgr[y1:y2, x1:x2].copy()
        crop_mask = full_mask[y1:y2, x1:x2].copy()
        isolated_crop = _apply_mask_to_crop(crop_bgr, crop_mask)

        people.append(
            PersonCandidate(
                x1=x1,
                y1=y1,
                x2=x2,
                y2=y2,
                confidence=conf,
                mask=full_mask,
                crop_bgr=crop_bgr,
                crop_mask=crop_mask,
                isolated_crop_bgr=isolated_crop,
            )
        )

    print(f"[detector] Person model: {len(people)} person(s)")
    return people


# ── Per-person safety scanning ───────────────────────────────

def _scan_person_with_jacket_model(person: PersonCandidate) -> Optional[dict]:
    """
    Run the custom trained jacket/no-jacket model on one isolated person crop.

    Returns None when the model is missing or too uncertain, allowing the HSV
    person-mask fallback to decide instead.
    """
    if not _load_jacket_model():
        return None

    try:
        result = _jacket_model.predict(
            source=person.isolated_crop_bgr,
            conf=JACKET_CONF_THRESHOLD,
            iou=JACKET_IOU_THRESHOLD,
            verbose=False,
        )[0]
    except Exception as e:
        print(f"[detector] Jacket inference failed: {e}")
        return None

    if result.boxes is None or len(result.boxes) == 0:
        return None

    best_life_conf = 0.0
    best_no_conf = 0.0

    for box in result.boxes:
        cls = int(box.cls[0])
        conf = float(box.conf[0])

        if cls == 0:
            best_life_conf = max(best_life_conf, conf)
        elif cls == 1:
            best_no_conf = max(best_no_conf, conf)

    if best_no_conf > 0 and best_no_conf >= best_life_conf:
        return {
            "compliant": False,
            "confidence": min(95, int(best_no_conf * 100)),
            "coverage": round(best_no_conf * 100, 1),
            "vest_type": "none",
            "method": "person-seg+jacket-yolo",
        }

    if best_life_conf > 0:
        return {
            "compliant": True,
            "confidence": min(99, int(best_life_conf * 100)),
            "coverage": round(best_life_conf * 100, 1),
            "vest_type": "life_jacket",
            "method": "person-seg+jacket-yolo",
        }

    return None


def analyse_vest_colours(image_hsv: np.ndarray) -> tuple[float, str]:
    """
    Full-frame HSV scan kept for legacy fallback when no person model is usable.
    Prefer analyse_vest_colours_in_person() in the new person-first path.
    """
    h, w = image_hsv.shape[:2]
    x1, x2 = int(w * 0.10), int(w * 0.90)
    y1, y2 = int(h * 0.05), int(h * 0.95)
    region = image_hsv[y1:y2, x1:x2]

    if region.size == 0:
        return 0.0, "none"

    full_mask = np.ones(region.shape[:2], dtype=np.uint8) * 255
    return _analyse_vest_hsv_region(region, full_mask)


def analyse_vest_colours_in_person(person: PersonCandidate) -> tuple[float, str]:
    """Analyse safety colours only inside the isolated person mask."""
    if person.crop_bgr.size == 0 or person.crop_mask.size == 0:
        return 0.0, "none"

    hsv_crop = cv2.cvtColor(person.crop_bgr, cv2.COLOR_BGR2HSV)
    return _analyse_vest_hsv_region(hsv_crop, person.crop_mask)


def _analyse_vest_hsv_region(image_hsv: np.ndarray, mask: np.ndarray) -> tuple[float, str]:
    """Shared HSV safety-colour logic constrained by a supplied mask."""
    if image_hsv.size == 0 or mask.size == 0:
        return 0.0, "none"

    h_ch = image_hsv[:, :, 0]
    s_ch = image_hsv[:, :, 1]
    v_ch = image_hsv[:, :, 2]
    valid = mask > 0

    vivid = valid & (s_ch >= 85) & (v_ch >= 65)

    yellow_land = vivid & (h_ch >= 22) & (h_ch <= 55)
    orange_land = vivid & (h_ch >= 8) & (h_ch <= 22) & (s_ch >= 110)
    green_land = vivid & (h_ch >= 55) & (h_ch <= 80) & (s_ch >= 100)
    solas_orange = vivid & (h_ch >= 5) & (h_ch <= 18) & (s_ch >= 140)
    marine_orange = vivid & (h_ch >= 8) & (h_ch <= 20) & (s_ch >= 120) & (v_ch >= 90)
    rescue_red = vivid & ((h_ch <= 8) | (h_ch >= 165)) & (s_ch >= 140) & (v_ch >= 85)
    marine_yellow = vivid & (h_ch >= 20) & (h_ch <= 50) & (s_ch >= 130) & (v_ch >= 110)

    any_safety = (
        yellow_land
        | orange_land
        | green_land
        | solas_orange
        | marine_orange
        | rescue_red
        | marine_yellow
    )

    total = int(np.sum(valid))
    if total == 0:
        return 0.0, "none"

    count = int(np.sum(any_safety))
    coverage = (count / total) * 100.0

    counts = {
        "hi-vis yellow": int(np.sum(yellow_land)),
        "hi-vis orange": int(np.sum(orange_land)),
        "safety green": int(np.sum(green_land)),
        "SOLAS orange": int(np.sum(solas_orange)),
        "marine orange": int(np.sum(marine_orange)),
        "rescue red": int(np.sum(rescue_red)),
        "marine yellow": int(np.sum(marine_yellow)),
    }
    dominant = max(counts, key=counts.get) if count > 0 else "none"

    print(f"[detector] Person-mask vest coverage: {coverage:.1f}% type: {dominant}")
    return round(coverage, 1), dominant


def _scan_person_with_hsv(person: PersonCandidate, sensitivity: float) -> dict:
    """Fallback PPE decision using safety colours inside the person only."""
    coverage, vest_type = analyse_vest_colours_in_person(person)

    if coverage >= sensitivity:
        return {
            "compliant": True,
            "confidence": min(90, 55 + int(coverage * 2)),
            "coverage": coverage,
            "vest_type": vest_type,
            "method": "person-seg+hsv-mask",
        }

    return {
        "compliant": False,
        "confidence": min(90, 50 + int(max(0, sensitivity - coverage) * 3)),
        "coverage": coverage,
        "vest_type": "none",
        "method": "person-seg+hsv-mask",
    }


def _scan_person_first(image_bgr: np.ndarray, sensitivity: float) -> Optional[dict]:
    """
    New main path: isolate each person first, then run PPE scans per person.

    Returns None only when the person model is unavailable/failed so legacy
    fallback can keep the app usable during development.
    """
    people = _extract_people(image_bgr)
    if people is None:
        return None

    if len(people) == 0:
        return _no_person("No person detected — objects or background only.", method="person-seg")

    img_h, img_w = image_bgr.shape[:2]
    boxes_out = []
    compliant_count = 0
    non_compliant_count = 0
    best_confidence = 0
    best_coverage = 0.0
    dominant_vest_type = "none"
    methods_used = set()

    for person in people:
        person_result = _scan_person_with_jacket_model(person)
        if person_result is None:
            person_result = _scan_person_with_hsv(person, sensitivity)

        methods_used.add(person_result["method"])
        best_confidence = max(best_confidence, int(person_result["confidence"]))
        best_coverage = max(best_coverage, float(person_result["coverage"]))

        if person_result["vest_type"] != "none":
            dominant_vest_type = person_result["vest_type"]

        if person_result["compliant"]:
            compliant_count += 1
        else:
            non_compliant_count += 1

        box_data = _normalised_box(person.x1, person.y1, person.x2, person.y2, img_w, img_h)
        boxes_out.append(
            {
                **box_data,
                "compliant": bool(person_result["compliant"]),
                "coverage": round(float(person_result["coverage"]), 1),
            }
        )

    total_people = len(people)
    method_label = "+".join(sorted(methods_used)) if methods_used else "person-seg"

    if non_compliant_count > 0:
        return {
            "verdict": "NON_COMPLIANT",
            "reason": (
                f"{non_compliant_count} of {total_people} detected person(s) "
                "do not have a confirmed life jacket."
            ),
            "confidence": max(50, best_confidence),
            "coverage": round(best_coverage, 1),
            "vest_type": dominant_vest_type if compliant_count > 0 else "none",
            "people": total_people,
            "boxes": boxes_out,
            "detection_method": method_label,
        }

    return {
        "verdict": "COMPLIANT",
        "reason": f"{total_people} person(s) detected — life jacket confirmed on each person.",
        "confidence": max(60, best_confidence),
        "coverage": round(best_coverage, 1),
        "vest_type": dominant_vest_type,
        "people": total_people,
        "boxes": boxes_out,
        "detection_method": method_label,
    }


# ── Legacy fallback path ─────────────────────────────────────

def has_person(image_bgr: np.ndarray) -> bool:
    """
    Legacy skin-tone person check used only when person model is unavailable.
    This is intentionally no longer the primary person detector.
    """
    h, w = image_bgr.shape[:2]
    scale = min(1.0, 320 / w)
    small = cv2.resize(image_bgr, (int(w * scale), int(h * scale)))

    ycrcb = cv2.cvtColor(small, cv2.COLOR_BGR2YCrCb)
    lower = np.array([0, 133, 77], dtype=np.uint8)
    upper = np.array([255, 173, 127], dtype=np.uint8)

    mask = cv2.inRange(ycrcb, lower, upper)
    skin_pixels = int(np.sum(mask > 0))
    total_pixels = small.shape[0] * small.shape[1]
    skin_pct = (skin_pixels / total_pixels) * 100.0

    print(f"[detector] Skin coverage: {skin_pct:.2f}%")
    return skin_pct >= 1.5


def _scan_yolo(image_bgr: np.ndarray, sensitivity: float) -> Optional[dict]:
    """Legacy direct whole-frame jacket/no-jacket YOLO path."""
    if not _load_jacket_model():
        return None

    try:
        results = _jacket_model.predict(
            source=image_bgr,
            conf=JACKET_CONF_THRESHOLD,
            iou=JACKET_IOU_THRESHOLD,
            verbose=False,
        )[0]
    except Exception as e:
        print(f"[detector] Legacy jacket YOLO inference failed: {e}")
        return None

    img_h, img_w = image_bgr.shape[:2]
    boxes_out = []
    life_jacket_count = 0
    no_jacket_count = 0
    best_jacket_conf = 0.0
    best_no_jacket_conf = 0.0

    for box in results.boxes:
        cls = int(box.cls[0])
        conf = float(box.conf[0])
        x1, y1, x2, y2 = _clip_box(*box.xyxy[0].tolist(), img_w, img_h)
        is_compliant = cls == 0

        boxes_out.append(
            {
                **_normalised_box(x1, y1, x2, y2, img_w, img_h),
                "compliant": is_compliant,
                "coverage": round(conf * 100.0, 1),
            }
        )

        if is_compliant:
            life_jacket_count += 1
            best_jacket_conf = max(best_jacket_conf, conf)
        else:
            no_jacket_count += 1
            best_no_jacket_conf = max(best_no_jacket_conf, conf)

    total_people = life_jacket_count + no_jacket_count
    print(
        f"[detector] Legacy YOLO: {total_people} person(s), "
        f"{life_jacket_count} with jacket, {no_jacket_count} without"
    )

    if total_people == 0:
        if has_person(image_bgr):
            return {
                "verdict": "NON_COMPLIANT",
                "reason": "Person detected but no life jacket visible.",
                "confidence": 45,
                "coverage": 0.0,
                "vest_type": "none",
                "people": 1,
                "boxes": [],
                "detection_method": "legacy-yolo+skin",
            }
        return _no_person("No person detected — objects or background only.", method="legacy-yolo")

    if no_jacket_count > 0:
        confidence = min(95, int(best_no_jacket_conf * 100))
        return {
            "verdict": "NON_COMPLIANT",
            "reason": (
                f"{no_jacket_count} person(s) without a life jacket detected. "
                "Compliance required before boarding."
            ),
            "confidence": confidence,
            "coverage": round(best_no_jacket_conf * 100, 1),
            "vest_type": "none",
            "people": total_people,
            "boxes": boxes_out,
            "detection_method": "legacy-yolo",
        }

    confidence = min(99, int(best_jacket_conf * 100))
    return {
        "verdict": "COMPLIANT",
        "reason": f"{life_jacket_count} person(s) detected — life jacket confirmed.",
        "confidence": confidence,
        "coverage": round(best_jacket_conf * 100, 1),
        "vest_type": "life_jacket",
        "people": total_people,
        "boxes": boxes_out,
        "detection_method": "legacy-yolo",
    }


def _scan_hsv(image_bgr: np.ndarray, sensitivity: float) -> dict:
    """Legacy full-frame HSV fallback used only when models are unavailable."""
    if is_frame_empty(image_bgr):
        return _no_person("Frame appears empty.", method="legacy-hsv")

    image_hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    coverage, vest_type = analyse_vest_colours(image_hsv)

    if coverage >= sensitivity:
        return {
            "verdict": "COMPLIANT",
            "reason": f"Safety vest detected — {vest_type} ({coverage:.1f}% coverage).",
            "confidence": min(99, 60 + int(coverage * 2)),
            "coverage": coverage,
            "vest_type": vest_type,
            "people": 1,
            "boxes": [],
            "detection_method": "legacy-hsv",
        }

    if has_person(image_bgr):
        return {
            "verdict": "NON_COMPLIANT",
            "reason": "Put on a life jacket to access this vessel.",
            "confidence": min(95, 50 + int((sensitivity - coverage) * 3)),
            "coverage": coverage,
            "vest_type": "none",
            "people": 1,
            "boxes": [],
            "detection_method": "legacy-hsv",
        }

    return _no_person("No person detected — objects or background only.", method="legacy-hsv")


# ── Public API ───────────────────────────────────────────────

def scan(base64_image: str, sensitivity: float = 8.0) -> dict:
    """
    Main entry point.

    Preferred path:
      person segmentation → isolated person crop → jacket scan

    Fallback path:
      legacy jacket YOLO → legacy HSV
    """
    image_bgr = decode_image(base64_image)
    if image_bgr is None:
        return _error_result("Could not decode the image.")

    if is_frame_empty(image_bgr):
        return _no_person("Frame appears empty.", method="quality-check")

    person_first_result = _scan_person_first(image_bgr, sensitivity)
    if person_first_result is not None:
        return person_first_result

    legacy_yolo_result = _scan_yolo(image_bgr, sensitivity)
    if legacy_yolo_result is not None:
        return legacy_yolo_result

    return _scan_hsv(image_bgr, sensitivity)


# ── Health/status helpers ────────────────────────────────────

def detector_status() -> dict:
    """Small status payload for /health without forcing slow inference."""
    jacket_local_exists = os.path.exists(JACKET_MODEL_PATH) if os.path.sep in JACKET_MODEL_PATH else True

    return {
        "person_model": PERSON_MODEL_PATH,
        "person_model_loaded": _person_model_available,
        "person_model_failed": _person_model_failed,
        "jacket_model": JACKET_MODEL_PATH,
        "jacket_model_file": "ready" if jacket_local_exists else "missing",
        "jacket_model_loaded": _jacket_model_available,
        "jacket_model_failed": _jacket_model_failed,
        "pipeline": "person-first segmentation → isolated PPE scan → legacy fallback",
    }


# ── Shared result constructors ───────────────────────────────

def _no_person(reason: str, method: str = "unknown") -> dict:
    return {
        "verdict": "NO_PERSON",
        "reason": reason,
        "confidence": 80,
        "coverage": 0.0,
        "vest_type": "none",
        "people": 0,
        "boxes": [],
        "detection_method": method,
    }


def _error_result(message: str) -> dict:
    return {
        "verdict": "UNKNOWN",
        "reason": message,
        "confidence": 0,
        "coverage": 0.0,
        "vest_type": "none",
        "people": 0,
        "boxes": [],
        "detection_method": "error",
    }
