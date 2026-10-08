import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "./theme";
import { Rise, Stage } from "./ui";

const Line: React.FC<{ text: string; delay: number; strikeAt: number }> = ({
  text,
  delay,
  strikeAt,
}) => {
  const frame = useCurrentFrame();
  const strike = interpolate(frame, [strikeAt, strikeAt + 10], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <Rise delay={delay}>
      <div
        style={{
          position: "relative",
          display: "inline-block",
          fontSize: 130,
          fontWeight: 800,
          letterSpacing: "-0.035em",
          lineHeight: 1.15,
          color: strike > 0 ? C.muted : C.ink,
        }}
      >
        {text}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "54%",
            height: 12,
            width: `${strike}%`,
            background: C.red,
            borderRadius: 6,
          }}
        />
      </div>
    </Rise>
  );
};

export const HookScene: React.FC = () => (
  <Stage>
    <Line text="Missed call." delay={0} strikeAt={18} />
    <Line text="Missed booking." delay={30} strikeAt={48} />
    <Line text="Missed revenue." delay={60} strikeAt={78} />
  </Stage>
);
