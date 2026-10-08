import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { clamp, Frame, useSpring } from "./kit";

const STEPS = [
  { title: "Sign up free", sub: "14-day trial. No card." },
  { title: "Add services & staff", sub: "Set your hours and rules." },
  { title: "Share your link", sub: "Instagram, Facebook, anywhere." },
  { title: "Get booked.", sub: "Straight onto your calendar." },
];
const STEP = 30;

const Step: React.FC<{ i: number }> = ({ i }) => {
  const frame = useCurrentFrame();
  const local = frame - i * STEP;
  const last = i === STEPS.length - 1;
  const inP = useSpring(i * STEP, 13, 200);
  const out = last ? 0 : interpolate(local, [STEP - 6, STEP], [0, 1], clamp);
  if (local < 0 || out >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: Math.min(1, inP * 2) * (1 - out),
        transform: `translateX(${(1 - inP) * 300 - out * 300}px)`,
      }}
    >
      <div
        style={{
          fontSize: 520,
          fontWeight: 900,
          lineHeight: 0.9,
          letterSpacing: "-0.06em",
          color: "#e0e7ff",
        }}
      >
        {i + 1}
      </div>
      <div
        style={{
          fontSize: 100,
          fontWeight: 900,
          letterSpacing: "-0.045em",
          textAlign: "center",
          lineHeight: 1.02,
          marginTop: 30,
          maxWidth: 920,
        }}
      >
        {STEPS[i].title}
      </div>
      <div style={{ fontSize: 50, color: C.muted, marginTop: 24 }}>{STEPS[i].sub}</div>
    </div>
  );
};

export const StepsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const head = useSpring(0, 200);
  return (
    <Frame bg="#fff">
      <div
        style={{
          position: "absolute",
          top: 250,
          fontSize: 40,
          fontWeight: 700,
          letterSpacing: "0.2em",
          color: C.brand,
          opacity: head,
        }}
      >
        LIVE IN 4 STEPS
      </div>
      {STEPS.map((_, i) => (
        <Step key={i} i={i} />
      ))}
      <div
        style={{
          position: "absolute",
          bottom: 380,
          display: "flex",
          gap: 20,
        }}
      >
        {STEPS.map((_, i) => {
          const fill = interpolate(frame, [i * STEP, i * STEP + 10], [0, 1], clamp);
          return (
            <div
              key={i}
              style={{
                width: 140,
                height: 14,
                borderRadius: 7,
                background: "#e2e8f0",
                overflow: "hidden",
              }}
            >
              <div style={{ width: `${fill * 100}%`, height: "100%", background: C.brand }} />
            </div>
          );
        })}
      </div>
    </Frame>
  );
};
