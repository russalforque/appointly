import React from "react";
import { AbsoluteFill, Html5Audio, interpolate, Sequence, staticFile } from "remotion";
import { BookingScene } from "./BookingScene";
import { ReelCtaScene } from "./CtaScene";
import { DmScene } from "./DmScene";
import { BEAT } from "./kit";
import { LogoScene } from "./LogoScene";
import { MarqueeScene } from "./MarqueeScene";
import { SlamScene } from "./SlamScene";
import { ToastScene } from "./ToastScene";

// Every cut lands on a beat of public/reel-beat.wav (scripts/make-beat.py).
export const REEL_SCENES = [
  { name: "DMs", beats: 4, component: DmScene },
  { name: "Slam", beats: 4, component: SlamScene },
  { name: "Logo", beats: 4, component: LogoScene },
  { name: "Booking", beats: 10, component: BookingScene },
  { name: "Toasts", beats: 6, component: ToastScene },
  { name: "Marquee", beats: 4, component: MarqueeScene },
  { name: "CTA", beats: 7, component: ReelCtaScene },
] as const;

export const REEL_FRAMES = REEL_SCENES.reduce((n, s) => n + s.beats * BEAT, 0);

export const AppointlyReel: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {REEL_SCENES.map(({ name, beats, component: Scene }) => {
        const start = from;
        from += beats * BEAT;
        return (
          <Sequence key={name} name={name} from={start} durationInFrames={beats * BEAT}>
            <Scene />
          </Sequence>
        );
      })}
      <Html5Audio
        src={staticFile("reel-beat.wav")}
        volume={(f) => interpolate(f, [REEL_FRAMES - 20, REEL_FRAMES], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
    </AbsoluteFill>
  );
};
