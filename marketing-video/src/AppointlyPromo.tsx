import React from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { BuiltForScene } from "./BuiltForScene";
import { CtaScene } from "./CtaScene";
import { FeaturesScene } from "./FeaturesScene";
import { HookScene } from "./HookScene";
import { IntroScene } from "./IntroScene";
import { ProblemScene } from "./ProblemScene";
import { StepsScene } from "./StepsScene";

const T = 12;
const t = linearTiming({ durationInFrames: T });

export const AppointlyPromo: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence name="Hook" durationInFrames={120}>
      <HookScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={t} />
    <TransitionSeries.Sequence name="Problem" durationInFrames={90}>
      <ProblemScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={slide({ direction: "from-bottom" })}
      timing={t}
    />
    <TransitionSeries.Sequence name="Intro" durationInFrames={90}>
      <IntroScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={slide({ direction: "from-right" })}
      timing={t}
    />
    <TransitionSeries.Sequence name="Features" durationInFrames={230}>
      <FeaturesScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={t} />
    <TransitionSeries.Sequence name="Steps" durationInFrames={110}>
      <StepsScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={t} />
    <TransitionSeries.Sequence name="BuiltFor" durationInFrames={130}>
      <BuiltForScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={slide({ direction: "from-bottom" })}
      timing={t}
    />
    <TransitionSeries.Sequence name="CTA" durationInFrames={120}>
      <CtaScene />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);

// 890 frames of scenes minus 6 transitions × 12 overlap
export const PROMO_FRAMES = 120 + 90 + 90 + 230 + 110 + 130 + 120 - 6 * T;
