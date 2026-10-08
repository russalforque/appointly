import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { clamp, Frame, NIGHT, useSpring } from "./kit";

const NAME = "Appointly";

const Letter: React.FC<{ ch: string; i: number }> = ({ ch, i }) => {
  const p = useSpring(4 + i * 2, 10, 200);
  return (
    <span
      style={{
        display: "inline-block",
        transform: `translateY(${(1 - p) * 140}px) rotate(${(1 - p) * 20}deg)`,
        opacity: Math.min(1, p * 2),
      }}
    >
      {ch}
    </span>
  );
};

export const LogoScene: React.FC = () => {
  const frame = useCurrentFrame();
  // The indigo circle bursts out of the dark frame on the drop.
  const r = interpolate(frame, [0, 12], [0, 1500], {
    ...clamp,
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const tag = useSpring(26, 200);
  const ring = interpolate(frame, [0, 24], [0, 1], clamp);
  return (
    <Frame bg={NIGHT} color="#fff">
      <div
        style={{
          position: "absolute",
          width: r * 2,
          height: r * 2,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.brand} 0%, ${C.brandDark} 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          border: `4px solid ${C.brandLight}`,
          transform: `scale(${0.3 + ring * 0.9})`,
          opacity: 1 - ring,
        }}
      />
      <div style={{ position: "relative", textAlign: "center" }}>
        <div
          style={{
            fontSize: 210,
            fontWeight: 900,
            letterSpacing: "-0.055em",
          }}
        >
          {NAME.split("").map((ch, i) => (
            <Letter key={i} ch={ch} i={i} />
          ))}
          <span style={{ color: C.brandLight }}>.</span>
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 600,
            color: C.brandLight,
            marginTop: 10,
            opacity: tag,
            transform: `translateY(${(1 - tag) * 30}px)`,
          }}
        >
          Booking, handled.
        </div>
      </div>
    </Frame>
  );
};
