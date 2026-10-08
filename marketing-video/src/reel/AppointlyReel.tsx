import React from "react";
import { AbsoluteFill, Html5Audio, interpolate, Sequence, staticFile } from "remotion";
import { BeforeAfterScene } from "./BeforeAfterScene";
import { BookingScene } from "./BookingScene";
import { CalendarScene } from "./CalendarScene";
import { ReelCtaScene } from "./CtaScene";
import { DmScene } from "./DmScene";
import { BEAT } from "./kit";
import { LogoScene } from "./LogoScene";
import { MarqueeScene } from "./MarqueeScene";
import { NoAppScene } from "./NoAppScene";
import { RulesScene } from "./RulesScene";
import { ShareScene } from "./ShareScene";
import { SlamScene } from "./SlamScene";
import { StepsScene } from "./StepsScene";
import { ToastScene } from "./ToastScene";

type Scene = { name: string; beats: number; component: React.FC };

type Cut = {
  scenes: Scene[];
  /** A beat track in public/, made by scripts/make-beat.py. */
  audio: string;
  /** Frames to skip at the start of the audio, to line its drops up with the cut. */
  audioTrim?: number;
};

const framesOf = (scenes: Scene[]) => scenes.reduce((n, s) => n + s.beats * BEAT, 0);

const Reel: React.FC<Cut> = ({ scenes, audio, audioTrim = 0 }) => {
  const total = framesOf(scenes);
  let from = 0;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {scenes.map(({ name, beats, component: Scene }) => {
        const start = from;
        from += beats * BEAT;
        return (
          <Sequence key={name} name={name} from={start} durationInFrames={beats * BEAT}>
            <Scene />
          </Sequence>
        );
      })}
      <Html5Audio
        src={staticFile(audio)}
        trimBefore={audioTrim}
        volume={(f) =>
          interpolate(f, [total - 20, total], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
    </AbsoluteFill>
  );
};

const S = {
  DMs: { name: "DMs", component: DmScene },
  Slam: { name: "Slam", component: SlamScene },
  Logo: { name: "Logo", component: LogoScene },
  Steps: { name: "Steps", component: StepsScene },
  Share: { name: "Share", component: ShareScene },
  Booking: { name: "Booking", component: BookingScene },
  NoApp: { name: "NoApp", component: NoAppScene },
  BeforeAfter: { name: "BeforeAfter", component: BeforeAfterScene },
  Calendar: { name: "Calendar", component: CalendarScene },
  Toasts: { name: "Toasts", component: ToastScene },
  Rules: { name: "Rules", component: RulesScene },
  Marquee: { name: "Marquee", component: MarqueeScene },
  CTA: { name: "CTA", component: ReelCtaScene },
};

// Every cut lands on a beat. The logo hits the drop at beat 8 in every version.
export const CUTS = {
  // 19.5s
  AppointlyReel: {
    audio: "reel-beat.wav",
    scenes: [
      { ...S.DMs, beats: 4 },
      { ...S.Slam, beats: 4 },
      { ...S.Logo, beats: 4 },
      { ...S.Booking, beats: 10 },
      { ...S.Toasts, beats: 6 },
      { ...S.Marquee, beats: 4 },
      { ...S.CTA, beats: 7 },
    ],
  },
  // 45s. Second drop (beat 52) lands on the calendar.
  AppointlyReel45: {
    audio: "reel-45-beat.wav",
    scenes: [
      { ...S.DMs, beats: 4 },
      { ...S.Slam, beats: 4 },
      { ...S.Logo, beats: 4 },
      { ...S.Steps, beats: 8 },
      { ...S.Share, beats: 6 },
      { ...S.Booking, beats: 12 },
      { ...S.NoApp, beats: 6 },
      { ...S.BeforeAfter, beats: 8 },
      { ...S.Calendar, beats: 10 },
      { ...S.Toasts, beats: 6 },
      { ...S.Rules, beats: 6 },
      { ...S.Marquee, beats: 4 },
      { ...S.CTA, beats: 12 },
    ],
  },
  // 10s ad. Starts at the slam, so the 19.5s track is trimmed by its 4-beat DM intro.
  AppointlyAd10: {
    audio: "reel-beat.wav",
    audioTrim: 4 * BEAT,
    scenes: [
      { ...S.Slam, beats: 4 },
      { ...S.Logo, beats: 4 },
      { ...S.Booking, beats: 8 },
      { ...S.CTA, beats: 4 },
    ],
  },
} satisfies Record<string, Cut>;

export const ALL_SCENES = Object.values(S);

export const cutFrames = (cut: Cut) => framesOf(cut.scenes);

export const ReelCut: React.FC<{ cut: keyof typeof CUTS }> = ({ cut }) => (
  <Reel {...CUTS[cut]} />
);
