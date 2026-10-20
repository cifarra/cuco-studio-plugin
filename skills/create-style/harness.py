"""Style verification harness — copy to /tmp/{slug}-check/check.py and edit
the CONFIG block. Run from cuco-core/: poetry run python /tmp/{slug}-check/check.py

Captures 5 timestamps per shot so you can judge enter (0.2/0.45), settled
(1.2/2.4) and exit (3.7). READ the JPGs and iterate — at least two rounds.
"""

import asyncio
import subprocess
from pathlib import Path

# ── CONFIG ────────────────────────────────────────────────────────────
STYLE = Path("/Users/ale/gits/cucostudio/desktop-app/webgfx-styles/SLUG")
OUT = Path("/tmp/SLUG-check")
SHOTS = ["a", "b", "c"]                 # shotNames; text-only shots get no media
TEXT_ONLY_SHOTS = {"b"}
RESOLUTION = (1080, 1920)
PALETTE = ["#101010", "#F0F0F0", "#FF4400"]
TRINITY = {"form": 60, "flow": 55, "pressure": 50}
SENTENCE = "Write a real sentence to watch the type behave"
TIMES = [0.2, 0.45, 1.2, 2.4, 3.7]
# ──────────────────────────────────────────────────────────────────────

TEST_IMG = Path("/tmp/webgfx-spike/media/img1.jpg")


def ensure_test_image():
    if TEST_IMG.exists():
        return
    TEST_IMG.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
         "-i", "gradients=s=1440x2560:c0=#2E4057:c1=#F18F01:n=3:d=1",
         "-frames:v", "1", str(TEST_IMG)],
        check=True,
    )


async def main():
    from cuco_core.engine.render.webgfx.capture import ShotCapture

    ensure_test_image()
    cfg = {
        "fps": 30,
        "resolution": list(RESOLUTION),
        "palette": PALETTE,
        **TRINITY,
        "seed": 7,
    }
    words = [
        {"word": w, "start": i * 0.32, "end": i * 0.32 + 0.3}
        for i, w in enumerate(SENTENCE.split())
    ]
    cap = ShotCapture(*RESOLUTION)
    await cap.start()
    try:
        for shot in SHOTS:
            await cap.load_shot(STYLE / "shots" / shot / "shot.html", cfg)
            await cap.set_section({
                "sectionIn": 0, "sectionOut": 4.0, "duration": 4.0,
                "transition": {"tailA": 0.6, "tailB": 3.4, "duration": 0.6},
                "words": words, "subSections": [],
            })
            if shot not in TEXT_ONLY_SHOTS:
                await cap.set_media(TEST_IMG, "image")
            for t in TIMES:
                await cap.seek(t)
                await cap.capture(OUT / f"{shot}_{t:.2f}.jpg")
        print("console errors:", cap.console_errors)
    finally:
        await cap.close()


asyncio.run(main())
