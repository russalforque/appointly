import { Composition, Folder } from "remotion";
import { AppointlyPromo, PROMO_FRAMES } from "./AppointlyPromo";
import { BuiltForScene } from "./BuiltForScene";
import { CtaScene } from "./CtaScene";
import { FeaturesScene } from "./FeaturesScene";
import { HookScene } from "./HookScene";
import { IntroScene } from "./IntroScene";
import { ProblemScene } from "./ProblemScene";
import { StepsScene } from "./StepsScene";
import { FPS } from "./theme";
import { AppointlyReel, REEL_FRAMES, REEL_SCENES } from "./reel/AppointlyReel";
import { BEAT } from "./reel/kit";

const size = { width: 1920, height: 1080, fps: FPS };

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="AppointlyPromo"
      component={AppointlyPromo}
      durationInFrames={PROMO_FRAMES}
      {...size}
    />
    <Composition
      id="AppointlyReel"
      component={AppointlyReel}
      durationInFrames={REEL_FRAMES}
      width={1080}
      height={1920}
      fps={FPS}
    />
    <Folder name="Reel-Scenes">
      {REEL_SCENES.map((s) => (
        <Composition
          key={s.name}
          id={`Reel-${s.name}`}
          component={s.component}
          durationInFrames={s.beats * BEAT}
          width={1080}
          height={1920}
          fps={FPS}
        />
      ))}
    </Folder>
    <Folder name="Scenes">
      <Composition id="Hook" component={HookScene} durationInFrames={120} {...size} />
      <Composition id="Problem" component={ProblemScene} durationInFrames={90} {...size} />
      <Composition id="Intro" component={IntroScene} durationInFrames={90} {...size} />
      <Composition id="Features" component={FeaturesScene} durationInFrames={230} {...size} />
      <Composition id="Steps" component={StepsScene} durationInFrames={110} {...size} />
      <Composition id="BuiltFor" component={BuiltForScene} durationInFrames={130} {...size} />
      <Composition id="CTA" component={CtaScene} durationInFrames={120} {...size} />
    </Folder>
  </>
);
