import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT } from "../theme";

/** 120 BPM at 30 fps. Scenes start and cut on beats. */
export const BEAT = 15;

export const NIGHT = "#0b0a1f";

export const useSpring = (delay = 0, damping = 14, stiffness = 160) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, stiffness } });
};

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export const Frame: React.FC<{
  bg: string;
  color?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ bg, color = C.ink, children, style }) => (
  <AbsoluteFill
    style={{
      background: bg,
      color,
      fontFamily: FONT,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      ...style,
    }}
  >
    {children}
  </AbsoluteFill>
);

/** A ripple that plays where a finger taps, at frame `at`. */
export const Tap: React.FC<{ at: number; color?: string }> = ({
  at,
  color = C.brand,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + 14], [0, 1], clamp);
  if (frame < at || p >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 180,
        height: 180,
        marginLeft: -90,
        marginTop: -90,
        borderRadius: "50%",
        border: `6px solid ${color}`,
        transform: `scale(${0.2 + p})`,
        opacity: 1 - p,
        pointerEvents: "none",
      }}
    />
  );
};

/** Heavy beat pulse: 1 on the beat, easing to 0 before the next. */
export const useBeatPulse = () => {
  const frame = useCurrentFrame();
  const local = frame % BEAT;
  return interpolate(local, [0, BEAT * 0.6], [1, 0], clamp);
};
