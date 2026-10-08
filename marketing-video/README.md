# Remotion video

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i --loglevel=error
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).

## Appointly promo

`AppointlyPromo` is a ~27s, 1920×1080 text-only marketing video (scenes live in `src/*Scene.tsx`).

```bash
npm i
npx remotion studio          # preview / edit
npx remotion render AppointlyPromo out/appointly-promo.mp4
```

## Appointly Reels (9:16)

1080×1920 motion videos for Instagram Reels / TikTok / Shorts. Scenes live in `src/reel/`; each
cut is a list of scenes in `src/reel/AppointlyReel.tsx` (`CUTS`). Every cut lands on a beat of an
original 120 BPM track synthesized by `scripts/make-beat.py` (one beat = 15 frames).

| Composition | Length | Track |
| --- | --- | --- |
| `AppointlyReel45` | 45s | `public/reel-45-beat.wav` |
| `AppointlyReel` | 19.5s | `public/reel-beat.wav` |
| `AppointlyAd10` | 10s | `public/reel-beat.wav`, trimmed |

```bash
npx remotion render AppointlyReel45 out/appointly-reel-45s.mp4

# Regenerate the music (needs numpy)
python3 scripts/make-beat.py public/reel-beat.wav
python3 scripts/make-beat.py public/reel-45-beat.wav 45 8,52 52

# Regenerate the voiceover (Kokoro TTS, runs locally; see the script's docstring for setup).
# Edit the lines in SCRIPT, run, then re-render.
python3 scripts/make-voiceover.py <dir with kokoro-v1.0.int8.onnx + voices-v1.0.bin>
```

The voice is Kokoro's `af_heart`. The music ducks under each voiceover line automatically.
