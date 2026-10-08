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

const size = { width: 1920, height: 1080, fps: FPS };

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="AppointlyPromo"
      component={AppointlyPromo}
      durationInFrames={PROMO_FRAMES}
      {...size}
    />
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
