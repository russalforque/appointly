import React from "react";
import { C } from "./theme";
import { Eyebrow, Rise, Stage } from "./ui";

const STEPS = [
  "Create your account",
  "Set up your business",
  "Share your link",
  "Manage bookings",
];

export const StepsScene: React.FC = () => (
  <Stage>
    <Eyebrow>Live in minutes</Eyebrow>
    <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
      {STEPS.map((s, i) => (
        <Rise key={s} delay={8 + i * 14}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 44,
              fontSize: 80,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              textAlign: "left",
            }}
          >
            <span style={{ color: C.brand, width: 70, textAlign: "right" }}>
              {i + 1}
            </span>
            {s}
          </div>
        </Rise>
      ))}
    </div>
  </Stage>
);
