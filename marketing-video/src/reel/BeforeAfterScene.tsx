import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { clamp, Frame, NIGHT, useSpring } from "./kit";

const BEFORE = ["Paper notebook", "Group chats", "Missed calls", "Double-bookings"];
const AFTER = ["Bookings", "Staff", "Services", "Customers"];
const SWITCH = 60;

const Struck: React.FC<{ text: string; at: number }> = ({ text, at }) => {
  const frame = useCurrentFrame();
  const p = useSpring(at, 200);
  const strike = interpolate(frame, [at + 7, at + 13], [0, 100], clamp);
  return (
    <div
      style={{
        position: "relative",
        alignSelf: "flex-start",
        fontSize: 96,
        fontWeight: 900,
        letterSpacing: "-0.045em",
        color: strike > 0 ? "#64748b" : "#fff",
        opacity: p,
        transform: `translateX(${(1 - p) * -80}px)`,
      }}
    >
      {text}
      <div
        style={{
          position: "absolute",
          left: -8,
          top: "52%",
          height: 14,
          borderRadius: 7,
          width: `calc(${strike}% + 16px)`,
          background: C.red,
          opacity: strike > 0 ? 1 : 0,
        }}
      />
    </div>
  );
};

const Checked: React.FC<{ text: string; at: number }> = ({ text, at }) => {
  const p = useSpring(at, 11, 220);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 30,
        fontSize: 92,
        fontWeight: 900,
        letterSpacing: "-0.045em",
        opacity: Math.min(1, p * 2),
        transform: `scale(${0.6 + 0.4 * p})`,
        transformOrigin: "left center",
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="54" height="54" viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={C.brand} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {text}
    </div>
  );
};

export const BeforeAfterScene: React.FC = () => {
  const frame = useCurrentFrame();
  const wipe = interpolate(frame, [SWITCH - 4, SWITCH + 6], [100, 0], {
    ...clamp,
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const tag = useSpring(SWITCH + 40, 200);
  return (
    <Frame bg={NIGHT} color="#fff">
      <div style={{ width: 900, display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: "0.2em", color: C.red, marginBottom: 20 }}>
          BEFORE
        </div>
        {BEFORE.map((t, i) => (
          <Struck key={t} text={t} at={4 + i * 12} />
        ))}
      </div>
      <Frame
        bg={`linear-gradient(160deg, ${C.brand} 0%, ${C.brandDark} 100%)`}
        color="#fff"
        style={{ clipPath: `inset(${wipe}% 0 0 0)` }}
      >
        <div style={{ width: 900, display: "flex", flexDirection: "column", gap: 30 }}>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: "0.2em", color: C.brandLight, marginBottom: 20 }}>
            AFTER
          </div>
          {AFTER.map((t, i) => (
            <Checked key={t} text={t} at={SWITCH + 8 + i * 7} />
          ))}
          <div
            style={{
              marginTop: 40,
              fontSize: 64,
              fontWeight: 700,
              color: C.brandLight,
              opacity: tag,
              transform: `translateY(${(1 - tag) * 30}px)`,
            }}
          >
            All in one dashboard.
          </div>
        </div>
      </Frame>
    </Frame>
  );
};
