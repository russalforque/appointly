import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { clamp, Frame, NIGHT, useSpring } from "./kit";

const MESSAGES: { text: string; at: number; lost?: boolean }[] = [
  { text: "hi! available tmrw?", at: 6 },
  { text: "how much for a cut?", at: 14 },
  { text: "do u have 3pm??", at: 22 },
  { text: "hello?", at: 29 },
  { text: "nvm, booked somewhere else", at: 40, lost: true },
];

const Bubble: React.FC<{ text: string; at: number; lost?: boolean }> = ({
  text,
  at,
  lost,
}) => {
  const p = useSpring(at, 12, 220);
  return (
    <div
      style={{
        alignSelf: "flex-start",
        background: lost ? C.red : "#1f1d3a",
        color: "#fff",
        fontSize: 54,
        fontWeight: 600,
        padding: "30px 44px",
        borderRadius: "48px 48px 48px 12px",
        transform: `scale(${p}) translateY(${(1 - p) * 40}px)`,
        transformOrigin: "left bottom",
        opacity: Math.min(1, p * 2),
      }}
    >
      {text}
    </div>
  );
};

export const DmScene: React.FC = () => {
  const frame = useCurrentFrame();
  const shake = interpolate(frame, [40, 54], [1, 0], clamp);
  const dx = Math.sin(frame * 2.7) * 22 * shake * (frame >= 40 ? 1 : 0);
  const title = useSpring(0, 200);
  return (
    <Frame bg={NIGHT} color="#fff">
      <div
        style={{
          width: 900,
          display: "flex",
          flexDirection: "column",
          gap: 30,
          transform: `translateX(${dx}px)`,
        }}
      >
        <div
          style={{
            fontSize: 88,
            fontWeight: 800,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
            marginBottom: 40,
            opacity: title,
          }}
        >
          Your DMs
          <br />
          <span style={{ color: C.brandLight }}>at 11 PM:</span>
        </div>
        {MESSAGES.map((m) => (
          <Bubble key={m.text} {...m} />
        ))}
      </div>
    </Frame>
  );
};
