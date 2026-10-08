import React from "react";
import { useCurrentFrame } from "remotion";
import { C } from "../theme";
import { BEAT, Frame, NIGHT, useSpring } from "./kit";

const SLAMS = [
  { word: "STOP", bg: C.brand, color: "#fff" },
  { word: "CHASING", bg: "#fff", color: NIGHT },
  { word: "BOOKINGS", bg: NIGHT, color: C.brandLight },
  { word: "IN DMs.", bg: C.red, color: "#fff" },
];

const Slam: React.FC<{ word: string; bg: string; color: string; at: number }> = ({
  word,
  bg,
  color,
  at,
}) => {
  const p = useSpring(at, 11, 260);
  return (
    <Frame bg={bg} color={color}>
      <div
        style={{
          fontSize: 190,
          fontWeight: 900,
          letterSpacing: "-0.05em",
          transform: `scale(${2.2 - 1.2 * p}) rotate(${(1 - p) * -8}deg)`,
          opacity: Math.min(1, p * 3),
        }}
      >
        {word}
      </div>
    </Frame>
  );
};

export const SlamScene: React.FC = () => {
  const frame = useCurrentFrame();
  const i = Math.min(SLAMS.length - 1, Math.floor(frame / BEAT));
  return <Slam key={i} {...SLAMS[i]} at={i * BEAT} />;
};
