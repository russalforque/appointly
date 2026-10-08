import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { clamp, Frame, Tap, useSpring } from "./kit";

const TAP_SERVICE = 22;
const TAP_STAFF = 46;
const TAP_TIME = 72;
const TAP_BOOK = 98;
const DONE = 106;

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 34,
      fontWeight: 700,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: C.muted,
      margin: "34px 0 18px",
    }}
  >
    {children}
  </div>
);

const Chip: React.FC<{
  text: string;
  tapAt?: number;
  taken?: boolean;
  round?: boolean;
}> = ({ text, tapAt, taken, round }) => {
  const frame = useCurrentFrame();
  const on = tapAt !== undefined && frame >= tapAt;
  const press = tapAt !== undefined
    ? interpolate(frame, [tapAt, tapAt + 3, tapAt + 8], [1, 0.9, 1], clamp)
    : 1;
  return (
    <div
      style={{
        position: "relative",
        flex: round ? undefined : 1,
        width: round ? 150 : undefined,
        height: round ? 150 : undefined,
        borderRadius: round ? "50%" : 28,
        padding: round ? 0 : "30px 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: round ? 60 : 44,
        fontWeight: 700,
        background: on ? C.brand : taken ? "#f1f5f9" : "#eef2ff",
        color: on ? "#fff" : taken ? "#cbd5e1" : C.ink,
        textDecoration: taken ? "line-through" : undefined,
        transform: `scale(${press})`,
        boxShadow: on ? `0 18px 40px ${C.brand}66` : undefined,
      }}
    >
      {text}
      {tapAt !== undefined && <Tap at={tapAt} />}
    </div>
  );
};

const Done: React.FC = () => {
  const p = useSpring(DONE, 9, 180);
  const text = useSpring(DONE + 8, 200);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#fff",
        borderRadius: 64,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: Math.min(1, p * 3),
      }}
    >
      <div
        style={{
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: C.brand,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${p})`,
        }}
      >
        <svg width="170" height="170" viewBox="0 0 24 24">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="24"
            strokeDashoffset={24 * (1 - text)}
          />
        </svg>
      </div>
      <div
        style={{
          fontSize: 110,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          marginTop: 50,
          opacity: text,
        }}
      >
        Booked!
      </div>
      <div style={{ fontSize: 46, color: C.muted, marginTop: 10, opacity: text }}>
        Haircut with Ana · 3:00 PM
      </div>
    </div>
  );
};

export const BookingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const card = useSpring(0, 16, 120);
  const head = useSpring(4, 200);
  const btnPress = interpolate(frame, [TAP_BOOK, TAP_BOOK + 3, TAP_BOOK + 8], [1, 0.92, 1], clamp);
  const float = Math.sin(frame / 12) * 6;
  return (
    <Frame bg={`linear-gradient(180deg, #eef2ff 0%, #c7d2fe 100%)`}>
      <div
        style={{
          position: "absolute",
          top: 230,
          fontSize: 92,
          fontWeight: 900,
          letterSpacing: "-0.045em",
          textAlign: "center",
          lineHeight: 1.02,
          opacity: head,
          transform: `translateY(${(1 - head) * -40}px)`,
        }}
      >
        Customers book
        <br />
        <span style={{ color: C.brand }}>themselves.</span>
      </div>
      <div
        style={{
          position: "relative",
          marginTop: 280,
          width: 900,
          background: "#fff",
          borderRadius: 64,
          padding: "50px 56px 56px",
          boxShadow: "0 50px 120px rgba(49,46,129,0.25)",
          transform: `translateY(${(1 - card) * 900 + float}px) rotate(${(1 - card) * 8}deg)`,
        }}
      >
        <Label>Service</Label>
        <div style={{ display: "flex", gap: 18 }}>
          <Chip text="Haircut" tapAt={TAP_SERVICE} />
          <Chip text="Color" />
          <Chip text="Beard" />
        </div>
        <Label>With</Label>
        <div style={{ display: "flex", gap: 30 }}>
          <Chip text="A" round tapAt={TAP_STAFF} />
          <Chip text="B" round />
          <Chip text="C" round />
        </div>
        <Label>Time</Label>
        <div style={{ display: "flex", gap: 18, marginBottom: 18 }}>
          <Chip text="9:00" taken />
          <Chip text="10:30" />
          <Chip text="1:00" taken />
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          <Chip text="3:00" tapAt={TAP_TIME} />
          <Chip text="4:30" />
          <Chip text="6:00" taken />
        </div>
        <div
          style={{
            position: "relative",
            marginTop: 46,
            background: frame >= TAP_TIME ? C.ink : "#cbd5e1",
            color: "#fff",
            fontSize: 50,
            fontWeight: 800,
            textAlign: "center",
            padding: "36px 0",
            borderRadius: 999,
            transform: `scale(${btnPress})`,
          }}
        >
          Confirm booking
          <Tap at={TAP_BOOK} color="#fff" />
        </div>
        {frame >= DONE && <Done />}
      </div>
    </Frame>
  );
};
