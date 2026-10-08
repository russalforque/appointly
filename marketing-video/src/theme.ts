import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Inter (variable, latin) bundled in public/ so renders work offline.
export const FONT = "Inter";
loadFont({
  family: FONT,
  url: staticFile("inter-latin-wght.woff2"),
  weight: "100 900",
});

export const C = {
  ink: "#0f172a",
  muted: "#64748b",
  paper: "#ffffff",
  brand: "#4f46e5",
  brandLight: "#a5b4fc",
  brandDark: "#312e81",
  red: "#ef4444",
};

export const FPS = 30;
