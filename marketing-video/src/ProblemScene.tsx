import React from "react";
import { C } from "./theme";
import { Rise, Stage, Words } from "./ui";

export const ProblemScene: React.FC = () => (
  <Stage>
    <Words text="Phone tag and DMs *don't* *scale.*" accent={C.red} />
    <Rise delay={30} style={{ marginTop: 48 }}>
      <div style={{ fontSize: 50, color: C.muted, maxWidth: 1300 }}>
        Your customers want to book while you're busy — or asleep.
      </div>
    </Rise>
  </Stage>
);
