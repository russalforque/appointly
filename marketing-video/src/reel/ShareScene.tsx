import React from "react";
import { useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Frame, useSpring } from "./kit";

const LINK = "/book/studio-ana";
const PLACES = ["Instagram bio", "Facebook page", "WhatsApp", "Your website"];
const TYPE_START = 8;
const TYPE_END = 32;

const Place: React.FC<{ text: string; at: number }> = ({ text, at }) => {
  const p = useSpring(at, 10, 220);
  const check = useSpring(at + 8, 200);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        background: "#fff",
        borderRadius: 36,
        padding: "32px 36px",
        fontSize: 48,
        fontWeight: 700,
        width: 720,
        boxShadow: "0 24px 60px rgba(49,46,129,0.15)",
        transform: `scale(${p}) rotate(${(1 - p) * 12}deg)`,
        opacity: Math.min(1, p * 2),
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: C.brand,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${check})`,
          flexShrink: 0,
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {text}
    </div>
  );
};

export const ShareScene: React.FC = () => {
  const frame = useCurrentFrame();
  const head = useSpring(0, 200);
  const chars = Math.round(
    Math.max(0, Math.min(1, (frame - TYPE_START) / (TYPE_END - TYPE_START))) * LINK.length,
  );
  const caret = frame < TYPE_END + 10 && Math.floor(frame / 6) % 2 === 0;
  return (
    <Frame bg={`linear-gradient(180deg, #e0e7ff 0%, #a5b4fc 100%)`}>
      <div style={{ width: 920, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            fontSize: 110,
            fontWeight: 900,
            letterSpacing: "-0.05em",
            textAlign: "center",
            lineHeight: 1,
            opacity: head,
            transform: `translateY(${(1 - head) * -40}px)`,
          }}
        >
          One link.
          <br />
          <span style={{ color: C.brand }}>Everywhere.</span>
        </div>
        <div
          style={{
            marginTop: 70,
            background: C.ink,
            color: "#fff",
            borderRadius: 999,
            padding: "32px 40px",
            fontSize: 40,
            fontWeight: 700,
            whiteSpace: "nowrap",
            textAlign: "center",
          }}
        >
          <span style={{ color: "#94a3b8" }}>appointly-blond.vercel.app</span>
          {LINK.slice(0, chars)}
          <span style={{ opacity: caret ? 1 : 0, color: C.brandLight }}>|</span>
        </div>
        <div
          style={{
            marginTop: 60,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 22,
          }}
        >
          {PLACES.map((p, i) => (
            <Place key={p} text={p} at={TYPE_END + 4 + i * 8} />
          ))}
        </div>
      </div>
    </Frame>
  );
};
