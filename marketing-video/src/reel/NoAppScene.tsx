import React from "react";
import { useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Frame, useSpring } from "./kit";

const SERVICES = [
  ["Haircut", "45 min"],
  ["Color", "2 hr"],
  ["Beard trim", "20 min"],
  ["Blow-dry", "30 min"],
];

const Row: React.FC<{ name: string; len: string; at: number }> = ({ name, len, at }) => {
  const p = useSpring(at, 200);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "26px 0",
        borderBottom: "2px solid #f1f5f9",
        opacity: p,
        transform: `translateX(${(1 - p) * 60}px)`,
      }}
    >
      <div>
        <div style={{ fontSize: 38, fontWeight: 800 }}>{name}</div>
        <div style={{ fontSize: 28, color: C.muted }}>{len}</div>
      </div>
      <div
        style={{
          background: C.brand,
          color: "#fff",
          fontSize: 30,
          fontWeight: 800,
          padding: "14px 30px",
          borderRadius: 999,
        }}
      >
        Book
      </div>
    </div>
  );
};

export const NoAppScene: React.FC = () => {
  const frame = useCurrentFrame();
  const phone = useSpring(0, 15, 110);
  const head = useSpring(6, 200);
  const foot = useSpring(40, 200);
  const tilt = Math.sin(frame / 18) * 2;
  return (
    <Frame bg="#fff">
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
        No app to
        <br />
        <span style={{ color: C.brand }}>download.</span>
      </div>
      <div
        style={{
          marginTop: 170,
          width: 560,
          height: 1000,
          borderRadius: 80,
          border: `18px solid ${C.ink}`,
          background: "#fff",
          overflow: "hidden",
          boxShadow: "0 60px 120px rgba(49,46,129,0.3)",
          transform: `translateY(${(1 - phone) * 1200}px) rotate(${tilt + (1 - phone) * -15}deg)`,
        }}
      >
        <div style={{ background: C.brand, color: "#fff", padding: "70px 44px 44px" }}>
          <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: "-0.03em" }}>Studio Ana</div>
          <div style={{ fontSize: 30, color: C.brandLight, marginTop: 6 }}>Book online, any time</div>
        </div>
        <div style={{ padding: "10px 44px" }}>
          {SERVICES.map(([n, l], i) => (
            <Row key={n} name={n} len={l} at={14 + i * 6} />
          ))}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 300,
          background: C.ink,
          color: "#fff",
          fontSize: 50,
          fontWeight: 800,
          padding: "26px 54px",
          borderRadius: 999,
          transform: `scale(${foot})`,
        }}
      >
        Works on any phone.
      </div>
    </Frame>
  );
};
