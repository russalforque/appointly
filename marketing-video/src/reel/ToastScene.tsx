import React from "react";
import { useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Frame, NIGHT, useSpring } from "./kit";

const TOASTS = [
  { title: "New booking", body: "Massage · Sat 10:30 AM", time: "2:14 AM" },
  { title: "New booking", body: "Nails with Cara · 1:00 PM", time: "3:02 AM" },
  { title: "Rescheduled", body: "Beard trim · Fri 6:00 PM", time: "4:47 AM" },
  { title: "New booking", body: "Haircut with Ana · 3:00 PM", time: "6:15 AM" },
];

const Toast: React.FC<{ title: string; body: string; time: string; at: number }> = ({
  title,
  body,
  time,
  at,
}) => {
  const p = useSpring(at, 13, 200);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 34,
        background: "rgba(255,255,255,0.08)",
        border: "2px solid rgba(255,255,255,0.12)",
        borderRadius: 44,
        padding: "34px 40px",
        transform: `translateY(${(1 - p) * -120}px) scale(${0.85 + 0.15 * p})`,
        opacity: Math.min(1, p * 2),
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          flexShrink: 0,
          borderRadius: 26,
          background: C.brand,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 58,
          fontWeight: 900,
        }}
      >
        A
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 42, fontWeight: 800 }}>{title}</span>
          <span style={{ fontSize: 34, color: "#94a3b8" }}>{time}</span>
        </div>
        <div style={{ fontSize: 40, color: "#cbd5e1", marginTop: 6 }}>{body}</div>
      </div>
    </div>
  );
};

export const ToastScene: React.FC = () => {
  const frame = useCurrentFrame();
  const head = useSpring(0, 200);
  const moonY = Math.sin(frame / 10) * 8;
  return (
    <Frame bg={`radial-gradient(circle at 50% 0%, #26235a 0%, ${NIGHT} 60%)`} color="#fff">
      <div style={{ width: 920, display: "flex", flexDirection: "column", gap: 28 }}>
        <div
          style={{
            textAlign: "center",
            marginBottom: 50,
            opacity: head,
            transform: `translateY(${moonY}px)`,
          }}
        >
          <div style={{ fontSize: 50, fontWeight: 600, color: C.brandLight }}>
            While you sleep...
          </div>
          <div
            style={{
              fontSize: 104,
              fontWeight: 900,
              letterSpacing: "-0.045em",
              lineHeight: 1.02,
              marginTop: 14,
            }}
          >
            your calendar
            <br />
            fills itself.
          </div>
        </div>
        {/* Newest on top, like a lock screen. */}
        {TOASTS.map((t, i) => ({ ...t, at: 12 + i * 15 }))
          .reverse()
          .map((t) => (frame >= t.at ? <Toast key={t.time} {...t} /> : null))}
      </div>
    </Frame>
  );
};
