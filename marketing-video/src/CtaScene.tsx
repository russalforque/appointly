import React from "react";
import { C } from "./theme";
import { Rise, Stage, Words } from "./ui";

export const CtaScene: React.FC = () => (
  <Stage dark>
    <Words
      text="Start your *14-day* *free* *trial.*"
      size={120}
      accent={C.brandLight}
    />
    <Rise delay={26}>
      <div style={{ fontSize: 50, color: C.brandLight, marginTop: 28 }}>
        No card required.
      </div>
    </Rise>
    <Rise delay={44} style={{ marginTop: 70 }}>
      <div
        style={{
          display: "inline-block",
          background: C.paper,
          color: C.brand,
          fontSize: 50,
          fontWeight: 800,
          padding: "26px 56px",
          borderRadius: 999,
        }}
      >
        appointly-blond.vercel.app
      </div>
    </Rise>
  </Stage>
);
