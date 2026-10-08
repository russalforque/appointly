import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { clamp, Frame, NIGHT, useSpring } from "./kit";

const SLIDERS = [
  { label: "Buffer between bookings", to: 15, unit: "min" },
  { label: "Minimum notice", to: 2, unit: "hrs" },
  { label: "Book up to", to: 60, unit: "days ahead" },
];

const Slider: React.FC<{ label: string; to: number; unit: string; at: number }> = ({
  label,
  to,
  unit,
  at,
}) => {
  const frame = useCurrentFrame();
  const show = useSpring(at, 200);
  const v = interpolate(frame, [at + 4, at + 22], [0, 1], {
    ...clamp,
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  return (
    <div style={{ opacity: show, transform: `translateY(${(1 - show) * 40}px)` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 40, color: "#cbd5e1", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 50, fontWeight: 900 }}>
          {Math.round(v * to)} <span style={{ fontSize: 34, color: C.brandLight }}>{unit}</span>
        </span>
      </div>
      <div
        style={{
          position: "relative",
          marginTop: 22,
          height: 16,
          borderRadius: 8,
          background: "rgba(255,255,255,0.12)",
        }}
      >
        <div style={{ width: `${v * 72}%`, height: "100%", borderRadius: 8, background: C.brandLight }} />
        <div
          style={{
            position: "absolute",
            top: -16,
            left: `calc(${v * 72}% - 24px)`,
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: `0 0 0 10px ${C.brand}66`,
          }}
        />
      </div>
    </div>
  );
};

export const RulesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const head = useSpring(0, 200);
  const on = interpolate(frame, [10, 16], [0, 1], clamp);
  return (
    <Frame bg={`radial-gradient(circle at 50% 100%, #26235a 0%, ${NIGHT} 60%)`} color="#fff">
      <div style={{ width: 900, display: "flex", flexDirection: "column", gap: 64 }}>
        <div
          style={{
            fontSize: 120,
            fontWeight: 900,
            letterSpacing: "-0.05em",
            lineHeight: 1,
            opacity: head,
            transform: `translateY(${(1 - head) * -40}px)`,
          }}
        >
          Your hours.
          <br />
          <span style={{ color: C.brandLight }}>Your rules.</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 46, fontWeight: 800 }}>Accept online bookings</span>
          <div
            style={{
              width: 150,
              height: 84,
              borderRadius: 42,
              background: on > 0.5 ? C.brand : "rgba(255,255,255,0.15)",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 8,
                left: 8 + on * 66,
                width: 68,
                height: 68,
                borderRadius: "50%",
                background: "#fff",
              }}
            />
          </div>
        </div>
        {SLIDERS.map((s, i) => (
          <Slider key={s.label} {...s} at={18 + i * 12} />
        ))}
      </div>
    </Frame>
  );
};
