import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "./theme";
import { Rise, Stage } from "./ui";

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12 } });
  return (
    <Stage dark>
      <Rise>
        <div style={{ fontSize: 48, fontWeight: 600, color: C.brandLight }}>
          Meet
        </div>
      </Rise>
      <div
        style={{
          fontSize: 220,
          fontWeight: 800,
          letterSpacing: "-0.05em",
          transform: `scale(${0.6 + 0.4 * pop})`,
          opacity: pop,
        }}
      >
        Appointly<span style={{ color: C.brandLight }}>.</span>
      </div>
      <Rise delay={22}>
        <div style={{ fontSize: 54, color: C.brandLight, marginTop: 12 }}>
          Online booking for service businesses.
        </div>
      </Rise>
    </Stage>
  );
};
