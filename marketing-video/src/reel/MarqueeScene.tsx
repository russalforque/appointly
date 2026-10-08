import React from "react";
import { useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Frame, useSpring } from "./kit";

const ROWS = [
  "SALONS · SPAS · BARBERS · ",
  "CLINICS · TUTORS · TRAINERS · ",
  "NAIL STUDIOS · PET GROOMERS · ",
  "MASSAGE · CAR DETAILERS · ",
  "SALONS · SPAS · BARBERS · ",
  "CLINICS · TUTORS · TRAINERS · ",
  "NAIL STUDIOS · PET GROOMERS · ",
];

export const MarqueeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const badge = useSpring(10, 11, 200);
  return (
    <Frame bg={C.brand} color="#fff">
      <div
        style={{
          position: "absolute",
          inset: -400,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 10,
          transform: "rotate(-12deg)",
        }}
      >
        {ROWS.map((row, i) => {
          const dir = i % 2 === 0 ? -1 : 1;
          const x = dir * frame * 14 - 600;
          return (
            <div
              key={i}
              style={{
                whiteSpace: "nowrap",
                fontSize: 150,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                transform: `translateX(${x}px)`,
                color: i % 2 === 0 ? "#fff" : "transparent",
                WebkitTextStroke: i % 2 === 0 ? undefined : "3px #fff",
                opacity: i % 2 === 0 ? 0.95 : 0.6,
              }}
            >
              {row.repeat(4)}
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "relative",
          background: "#fff",
          color: C.ink,
          padding: "50px 70px",
          borderRadius: 48,
          textAlign: "center",
          transform: `scale(${badge}) rotate(${(1 - badge) * 10 - 3}deg)`,
          boxShadow: "0 40px 100px rgba(15,23,42,0.35)",
        }}
      >
        <div style={{ fontSize: 50, fontWeight: 600, color: C.muted }}>Built for</div>
        <div style={{ fontSize: 100, fontWeight: 900, letterSpacing: "-0.045em" }}>
          anyone who
          <br />
          <span style={{ color: C.brand }}>books time.</span>
        </div>
      </div>
    </Frame>
  );
};
