"""Generates the reel voiceovers with Kokoro (https://github.com/thewh1teagle/kokoro-onnx),
an open-weight (Apache-2.0) TTS model that runs locally.

    pip install kokoro-onnx soundfile
    # kokoro-v1.0.int8.onnx + voices-v1.0.bin from the kokoro-onnx GitHub release "model-files-v1.0"
    python3 scripts/make-voiceover.py <dir with the model files>

Writes public/vo/<cut>/<scene>.wav and src/reel/voiceover.json, which says how long each line is.
Each line starts shortly after its scene does, and is sped up if needed to end before the scene does.
"""
import json
import os
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

FPS = 30
BEAT_S = 0.5
VOICE = "af_heart"
LEAD_IN_S = 0.12  # gap between the cut and the first word
TAIL_S = 0.2  # gap between the last word and the next cut

# (scene, beats the scene lasts in that cut, line)
SCRIPT = {
    "AppointlyReel45": [
        ("DMs", 4, "Still taking bookings in your DMs?"),
        ("Slam", 4, "Stop chasing them."),
        ("Logo", 4, "Meet Appointly."),
        ("Steps", 8, "Sign up free. Add your services and staff. Share your link. Get booked."),
        ("Share", 6, "One link, for your bio, your page, everywhere."),
        ("Booking", 12, "Customers pick a service, a staff member, and a time that's actually free. Done."),
        ("NoApp", 6, "No app to download. It works on any phone."),
        ("BeforeAfter", 8, "Ditch the notebook and the group chats. Run it all from one dashboard."),
        ("Calendar", 10, "One shared calendar for your whole team, so nothing gets double-booked."),
        ("Toasts", 6, "Bookings keep coming in, even while you sleep."),
        ("Rules", 6, "Your hours. Your rules."),
        ("Marquee", 4, "Built for anyone who books time."),
        ("CTA", 12, "Try Appointly free for fourteen days. No card required. Link in bio."),
    ],
    "AppointlyReel": [
        ("DMs", 4, "Still taking bookings in your DMs?"),
        ("Slam", 4, "Stop chasing them."),
        ("Logo", 4, "Meet Appointly."),
        ("Booking", 10, "Customers book themselves, into times that are actually free."),
        ("Toasts", 6, "Even while you sleep."),
        ("Marquee", 4, "Built for anyone who books time."),
        ("CTA", 7, "Fourteen days free. Link in bio."),
    ],
    "AppointlyAd10": [
        ("Slam", 4, "Stop chasing bookings in your DMs."),
        ("Logo", 4, "Meet Appointly."),
        ("Booking", 8, "Customers book themselves, any time."),
        ("CTA", 4, "Start free. Link in bio."),
    ],
}


def trim(x, sr, thresh=0.01):
    idx = np.where(np.abs(x) > thresh)[0]
    if len(idx) == 0:
        return x
    pad = int(sr * 0.03)
    return x[max(0, idx[0] - pad) : idx[-1] + pad]


def main(model_dir):
    kokoro = Kokoro(
        os.path.join(model_dir, "kokoro-v1.0.int8.onnx"),
        os.path.join(model_dir, "voices-v1.0.bin"),
    )
    timings = {}
    for cut, lines in SCRIPT.items():
        os.makedirs(f"public/vo/{cut}", exist_ok=True)
        timings[cut] = {}
        for scene, beats, text in lines:
            room = beats * BEAT_S - LEAD_IN_S - TAIL_S
            speed = 1.05
            while True:
                audio, sr = kokoro.create(text, voice=VOICE, speed=speed, lang="en-us")
                audio = trim(audio, sr)
                length = len(audio) / sr
                if length <= room or speed >= 1.5:
                    break
                speed = min(1.5, speed * length / room + 0.02)
            if length > room:
                print(f"WARNING {cut}/{scene}: {length:.2f}s > {room:.2f}s", file=sys.stderr)
            sf.write(f"public/vo/{cut}/{scene}.wav", audio, sr)
            timings[cut][scene] = {
                "file": f"vo/{cut}/{scene}.wav",
                "offset": round(LEAD_IN_S * FPS),
                "durationInFrames": int(np.ceil(length * FPS)),
                "text": text,
            }
            print(f"{cut:16} {scene:12} {length:5.2f}s / {room:5.2f}s  speed {speed:.2f}")
    with open("src/reel/voiceover.json", "w") as f:
        json.dump(timings, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main(sys.argv[1])
