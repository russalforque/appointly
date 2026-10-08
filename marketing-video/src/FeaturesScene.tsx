import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C } from "./theme";
import { Eyebrow, Stage } from "./ui";

const FEATURES = [
  ["Your own booking page.", "Share the link anywhere."],
  ["Customers book themselves.", "Straight onto your calendar."],
  ["One shared calendar.", "Nothing gets double-booked."],
  ["Staff & services.", "Control who can be booked."],
  ["Availability you control.", "Hours, buffers, lead time."],
];

export const FEATURE_FRAMES = 42;

export const FeaturesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Stage>
      <Eyebrow>Everything in one place</Eyebrow>
      <div style={{ position: "relative", width: "100%", height: 300 }}>
        {FEATURES.map(([title, sub], i) => {
          const start = i * FEATURE_FRAMES;
          const local = frame - start;
          const isLast = i === FEATURES.length - 1;
          const inP = spring({ frame: local, fps, config: { damping: 200 } });
          const out = isLast
            ? 0
            : interpolate(local, [FEATURE_FRAMES - 8, FEATURE_FRAMES], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
          return (
            <div
              key={title}
              style={{
                position: "absolute",
                inset: 0,
                opacity: inP * (1 - out),
                transform: `translateY(${(1 - inP) * 60 - out * 60}px)`,
              }}
            >
              <div
                style={{
                  fontSize: 120,
                  fontWeight: 800,
                  letterSpacing: "-0.035em",
                }}
              >
                {title}
              </div>
              <div style={{ fontSize: 52, color: C.muted, marginTop: 24 }}>
                {sub}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 70 }}>
        {FEATURES.map((_, i) => (
          <div
            key={i}
            style={{
              width: 64,
              height: 10,
              borderRadius: 5,
              background:
                frame >= i * FEATURE_FRAMES ? C.brand : "#e2e8f0",
            }}
          />
        ))}
      </div>
    </Stage>
  );
};
