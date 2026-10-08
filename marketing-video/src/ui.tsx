import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT } from "./theme";

export const Stage: React.FC<{
  dark?: boolean;
  children: React.ReactNode;
}> = ({ dark, children }) => (
  <AbsoluteFill
    style={{
      backgroundColor: dark ? C.brandDark : C.paper,
      backgroundImage: dark
        ? `radial-gradient(circle at 50% 120%, ${C.brand} 0%, ${C.brandDark} 65%)`
        : undefined,
      color: dark ? C.paper : C.ink,
      fontFamily: FONT,
      justifyContent: "center",
      alignItems: "center",
      padding: "100px 160px",
      textAlign: "center",
    }}
  >
    {children}
  </AbsoluteFill>
);

/** Fades and lifts in at `delay` frames. */
export const Rise: React.FC<{
  delay?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [40, 0])}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Word-by-word headline. Words wrapped in *asterisks* get the brand color. */
export const Words: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  size?: number;
  accent?: string;
}> = ({ text, delay = 0, stagger = 4, size = 120, accent = C.brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: 800,
        lineHeight: 1.08,
        letterSpacing: "-0.035em",
      }}
    >
      {text.split(" ").map((w, i) => {
        const p = spring({
          frame: frame - delay - i * stagger,
          fps,
          config: { damping: 18, stiffness: 140 },
        });
        const hl = w.startsWith("*");
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: "0.25em",
              opacity: Math.min(1, p * 1.5),
              transform: `translateY(${interpolate(p, [0, 1], [0.5, 0])}em)`,
              color: hl ? accent : undefined,
            }}
          >
            {w.replace(/\*/g, "")}
          </span>
        );
      })}
    </div>
  );
};

export const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({
  children,
  color = C.brand,
}) => (
  <div
    style={{
      fontSize: 34,
      fontWeight: 600,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color,
      marginBottom: 36,
    }}
  >
    {children}
  </div>
);
