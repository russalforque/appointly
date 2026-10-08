import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { BEAT, clamp, Frame, useSpring } from "./kit";

const STAFF = ["Ana", "Ben", "Cara"];
const HOURS = ["9", "10", "11", "12", "1", "2", "3", "4"];
const ROW = 118;
const COL = 250;
const TIME_COL = 110;

const SHADES = [C.brand, "#7c3aed", "#0ea5e9", "#db2777", "#059669"];

const BLOCKS = [
  { col: 0, row: 0, len: 1, label: "Haircut", shade: 0 },
  { col: 1, row: 1, len: 2, label: "Color", shade: 1 },
  { col: 2, row: 0, len: 1, label: "Nails", shade: 3 },
  { col: 0, row: 2, len: 2, label: "Color", shade: 1 },
  { col: 2, row: 3, len: 2, label: "Massage", shade: 2 },
  { col: 1, row: 4, len: 1, label: "Beard", shade: 4 },
  { col: 0, row: 5, len: 1, label: "Haircut", shade: 0 },
  { col: 2, row: 6, len: 1, label: "Nails", shade: 3 },
].map((b, i) => ({ ...b, at: i * (BEAT / 2) }));

// A clashing booking tries Ana at 11 (already taken) and gets bounced.
const CLASH_AT = 70;

const Block: React.FC<(typeof BLOCKS)[number]> = ({ col, row, len, label, shade, at }) => {
  const p = useSpring(at, 10, 220);
  return (
    <div
      style={{
        position: "absolute",
        left: TIME_COL + col * COL + 8,
        top: row * ROW + 6,
        width: COL - 16,
        height: len * ROW - 12,
        borderRadius: 22,
        background: SHADES[shade],
        color: "#fff",
        padding: "18px 22px",
        fontSize: 36,
        fontWeight: 800,
        opacity: Math.min(1, p * 2),
        transform: `translateY(${(1 - p) * -260}px) scale(${0.8 + 0.2 * p})`,
      }}
    >
      {label}
    </div>
  );
};

const Clash: React.FC = () => {
  const frame = useCurrentFrame();
  const fall = useSpring(CLASH_AT, 12, 220);
  const shake = frame >= CLASH_AT + 8 && frame < CLASH_AT + 22 ? Math.sin(frame * 3) * 14 : 0;
  const fly = interpolate(frame, [CLASH_AT + 22, CLASH_AT + 34], [0, 1], {
    ...clamp,
    easing: (t) => t * t,
  });
  if (frame < CLASH_AT) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: TIME_COL + 8 + shake + fly * 900,
        top: 2 * ROW + 6 + (1 - fall) * -400 - fly * 200,
        width: COL - 16,
        height: ROW - 12,
        borderRadius: 22,
        border: `5px dashed ${C.red}`,
        background: "#fef2f2",
        color: C.red,
        padding: "16px 20px",
        fontSize: 32,
        fontWeight: 800,
        opacity: fall * (1 - fly),
        transform: `rotate(${fly * 30}deg)`,
        zIndex: 2,
      }}
    >
      Taken!
    </div>
  );
};

export const CalendarScene: React.FC = () => {
  const head = useSpring(0, 200);
  const grid = useSpring(0, 200);
  const tag = useSpring(CLASH_AT + 30, 11, 200);
  return (
    <Frame bg="#f8fafc">
      <div
        style={{
          position: "absolute",
          top: 220,
          fontSize: 96,
          fontWeight: 900,
          letterSpacing: "-0.045em",
          textAlign: "center",
          lineHeight: 1.02,
          opacity: head,
        }}
      >
        One shared
        <br />
        <span style={{ color: C.brand }}>calendar.</span>
      </div>
      <div style={{ marginTop: 200, opacity: grid }}>
        <div style={{ display: "flex", marginLeft: TIME_COL, marginBottom: 16 }}>
          {STAFF.map((s) => (
            <div key={s} style={{ width: COL, textAlign: "center", fontSize: 40, fontWeight: 800 }}>
              {s}
            </div>
          ))}
        </div>
        <div
          style={{
            position: "relative",
            width: TIME_COL + COL * STAFF.length,
            height: ROW * HOURS.length,
            background: "#fff",
            borderRadius: 36,
            boxShadow: "0 30px 80px rgba(49,46,129,0.12)",
          }}
        >
          {HOURS.map((h, i) => (
            <div
              key={h}
              style={{
                position: "absolute",
                top: i * ROW,
                left: 0,
                right: 0,
                height: ROW,
                borderTop: i ? "2px solid #f1f5f9" : undefined,
                fontSize: 30,
                fontWeight: 600,
                color: C.muted,
                paddingLeft: 30,
                paddingTop: 14,
              }}
            >
              {h}
            </div>
          ))}
          {BLOCKS.map((b, i) => (
            <Block key={i} {...b} />
          ))}
          <Clash />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 260,
          background: C.red,
          color: "#fff",
          fontSize: 54,
          fontWeight: 900,
          padding: "28px 56px",
          borderRadius: 999,
          transform: `scale(${tag}) rotate(-3deg)`,
        }}
      >
        No double-bookings.
      </div>
    </Frame>
  );
};
