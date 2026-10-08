import React from "react";
import { useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Frame, useBeatPulse, useSpring } from "./kit";

export const ReelCtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const big = useSpring(0, 10, 220);
  const free = useSpring(8, 10, 220);
  const card = useSpring(22, 200);
  const url = useSpring(34, 12, 180);
  const pulse = useBeatPulse();
  const shimmer = ((frame * 3) % 200) - 50;
  return (
    <Frame bg={`radial-gradient(circle at 50% 110%, ${C.brand} 0%, ${C.brandDark} 70%)`} color="#fff">
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 250,
            fontWeight: 900,
            letterSpacing: "-0.06em",
            lineHeight: 0.92,
            transform: `scale(${big})`,
          }}
        >
          14 days
        </div>
        <div
          style={{
            fontSize: 250,
            fontWeight: 900,
            letterSpacing: "-0.06em",
            lineHeight: 0.92,
            color: C.brandLight,
            transform: `scale(${free})`,
          }}
        >
          free.
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 600,
            marginTop: 50,
            color: C.brandLight,
            opacity: card,
          }}
        >
          No card required.
        </div>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            display: "inline-block",
            marginTop: 90,
            background: "#fff",
            color: C.brand,
            fontSize: 52,
            fontWeight: 900,
            padding: "36px 60px",
            borderRadius: 999,
            transform: `scale(${url * (1 + 0.04 * pulse)})`,
            boxShadow: `0 0 ${40 + 40 * pulse}px ${C.brandLight}`,
          }}
        >
          appointly-blond.vercel.app
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${shimmer}%`,
              width: "18%",
              background:
                "linear-gradient(90deg, transparent, rgba(99,102,241,0.25), transparent)",
              transform: "skewX(-20deg)",
            }}
          />
        </div>
        <div style={{ fontSize: 44, fontWeight: 600, marginTop: 40, opacity: url }}>
          Link in bio
        </div>
      </div>
    </Frame>
  );
};
