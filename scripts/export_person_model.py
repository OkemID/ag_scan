from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def choose_tflite(export_result: str | Path) -> Path:
    exported = Path(export_result).resolve()
    candidates: list[Path]

    if exported.is_file() and exported.suffix.lower() == ".tflite":
        candidates = [exported]
    else:
        search_root = exported if exported.is_dir() else exported.parent
        candidates = sorted(search_root.rglob("*.tflite"))

    if not candidates:
        raise FileNotFoundError(
            f"Ultralytics completed but no .tflite file was found under {exported}."
        )

    # V1 native preprocessing is FLOAT32. Prefer the ordinary float model.
    preferred = [
        path
        for path in candidates
        if "float32" in path.name.lower()
        and "int8" not in path.name.lower()
        and "uint8" not in path.name.lower()
    ]
    if preferred:
        return preferred[0]

    non_quantized = [
        path
        for path in candidates
        if "int8" not in path.name.lower()
        and "uint8" not in path.name.lower()
        and "float16" not in path.name.lower()
    ]
    if non_quantized:
        return non_quantized[0]

    raise RuntimeError(
        "Only quantized/float16 models were found. Re-export without int8, half, "
        "or quantization because AG Scan V1 expects FLOAT32 tensors."
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export yolo11n.pt to a FLOAT32 LiteRT/TFLite Android asset."
    )
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--image-size", default=640, type=int)
    args = parser.parse_args()

    if not args.model.exists():
        raise FileNotFoundError(f"Model not found: {args.model}")

    from ultralytics import YOLO

    model = YOLO(str(args.model.resolve()))
    exported = model.export(
        format="litert",
        imgsz=args.image_size,
        batch=1,
        int8=False,
        half=False,
        nms=False,
    )

    source = choose_tflite(exported)
    destination = args.output.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)

    print(f"Source model: {args.model.resolve()}")
    print(f"Exported model: {source}")
    print(f"Android asset: {destination}")
    print(f"Size: {destination.stat().st_size / (1024 * 1024):.2f} MB")


if __name__ == "__main__":
    main()
