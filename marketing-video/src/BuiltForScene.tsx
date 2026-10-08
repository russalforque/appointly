import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "./theme";
import { Stage } from "./ui";

const WHO = [
  "salons.",
  "barbershops.",
  "spas.",
  "clinics.",
  "pet groomers.",
  "tutors.",
  "personal trainers.",
  "you.",
];

export const WHO_FRAMES = 14;

export const BuiltForScene: React.FC = () => {
  const frame = useCurrentFrame();
  const i = Math.min(WHO.length - 1, Math.floor(frame / WHO_FRAMES));
  const local = frame - i * WHO_FRAMES;
  const y = interpolate(local, [0, 6], [30, 0], { extrapolateRight: "clamp" });
  const last = i === WHO.length - 1;
  return (
    <Stage>
      <div
        style={{
          fontSize: 120,
          fontWeight: 800,
          letterSpacing: "-0.035em",
          lineHeight: 1.15,
        }}
      >
        <div style={{ color: C.muted }}>Built for</div>
        <div
          style={{
            color: last ? C.brand : C.ink,
            transform: `translateY(${y}px)`,
            opacity: interpolate(local, [0, 4], [0, 1], {
              extrapolateRight: "clamp",
            }),
          }}
        >
          {WHO[i]}
        </div>
      </div>
    </Stage>
  );
};
