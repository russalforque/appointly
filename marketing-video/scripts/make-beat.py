"""Synthesizes the reel's soundtrack: 120 BPM (one beat = 15 frames at 30 fps).

    python3 scripts/make-beat.py public/reel-beat.wav                 # 19.5s reel
    python3 scripts/make-beat.py public/reel-45-beat.wav 45 8,52 52   # 45s reel

Args: output path, length in seconds, beats that get a riser + impact ("drops"),
and beats from which the clap switches to a double-time pattern ("lifts").
"""
import sys
import wave

import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM
SECONDS = float(sys.argv[2]) if len(sys.argv) > 2 else 19.5
DROPS = [int(b) for b in sys.argv[3].split(",")] if len(sys.argv) > 3 else [8]
LIFT = int(sys.argv[4]) if len(sys.argv) > 4 else 10**9
N = int(SR * SECONDS)
out = np.zeros(N)
rng = np.random.default_rng(7)


def place(sig, t, gain=1.0):
    i = int(t * SR)
    j = min(N, i + len(sig))
    if i < N:
        out[i:j] += sig[: j - i] * gain


def env(n, decay):
    return np.exp(-np.arange(n) / (SR * decay))


def kick():
    n = int(SR * 0.35)
    t = np.arange(n) / SR
    freq = 50 + 110 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR) * env(n, 0.12)


def clap():
    n = int(SR * 0.2)
    noise = rng.uniform(-1, 1, n)
    # Cheap band-pass: difference of two moving averages.
    hp = noise - np.convolve(noise, np.ones(12) / 12, mode="same")
    return hp * env(n, 0.05)


def hat(open_=False):
    n = int(SR * (0.15 if open_ else 0.05))
    noise = rng.uniform(-1, 1, n)
    return (noise - np.convolve(noise, np.ones(3) / 3, mode="same")) * env(
        n, 0.05 if open_ else 0.012
    )


def bass(freq, length):
    n = int(SR * length)
    t = np.arange(n) / SR
    saw = 2 * ((t * freq) % 1) - 1
    smooth = np.convolve(saw, np.ones(40) / 40, mode="same")
    a = np.minimum(1, np.arange(n) / (SR * 0.005))
    return smooth * a * env(n, length * 0.6)


def riser(length):
    n = int(SR * length)
    noise = rng.uniform(-1, 1, n)
    return noise * np.linspace(0, 1, n) ** 2


def impact():
    n = int(SR * 1.2)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * (40 + 60 * np.exp(-t * 8)) * t) + 0.3 * rng.uniform(-1, 1, n) * np.exp(-t * 12)) * env(n, 0.4)


# Bars: A-minor-ish bass roots per bar (4 beats).
roots = [55.0, 55.0, 43.65, 49.0]
beats = int(SECONDS / BEAT)
DROP = DROPS[0]  # the first drop is where the bass comes in
for b in range(beats):
    t = b * BEAT
    intro = b < 4
    if b + 1 in DROPS:
        continue  # a breath before each drop
    place(kick(), t, 0.9 if not intro else 0.6)
    if b % 2 == 1 and not intro:
        place(clap(), t, 0.45)
    if b >= LIFT:
        place(clap(), t + BEAT * 0.75, 0.2)
        place(hat(open_=True), t + BEAT * 0.5, 0.12)
    for k in range(2):
        place(hat(open_=(k == 1 and b % 4 == 3)), t + k * BEAT / 2, 0.18)
    if b >= DROP:
        root = roots[(b // 4) % 4]
        place(bass(root, BEAT * 0.45), t, 0.35)
        place(bass(root * 2, BEAT * 0.2), t + BEAT * 0.5, 0.2)

for d in DROPS:
    place(riser(BEAT * 3), (d - 3) * BEAT, 0.25)
    place(impact(), d * BEAT, 0.8)

# Fade out the last second.
fade = int(SR * 1.0)
out[-fade:] *= np.linspace(1, 0, fade)
out = np.tanh(out * 1.2)
out /= np.max(np.abs(out)) * 1.05

pcm = (out * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
