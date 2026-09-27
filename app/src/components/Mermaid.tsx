"use client";

import { useEffect, useId, useRef } from "react";

let ready: Promise<typeof import("mermaid").default> | null = null;

function load() {
  ready ??= import("mermaid").then(({ default: m }) => {
    m.initialize({
      startOnLoad: false,
      theme: "base",
      fontFamily: "var(--font-inter-tight)",
      themeVariables: {
        darkMode: true,
        background: "#0a0a0b",
        primaryColor: "#18181b",
        primaryTextColor: "#f3efe6",
        primaryBorderColor: "#323238",
        secondaryColor: "#111113",
        tertiaryColor: "#111113",
        lineColor: "#8d8a83",
        textColor: "#f3efe6",
        noteBkgColor: "#1d140c",
        noteTextColor: "#ffb266",
        noteBorderColor: "#ff7a1a55",
        actorBkg: "#18181b",
        actorBorder: "#323238",
        actorTextColor: "#f3efe6",
        signalColor: "#8d8a83",
        signalTextColor: "#f3efe6",
        labelBoxBkgColor: "#18181b",
        labelTextColor: "#f3efe6",
        edgeLabelBackground: "#111113",
        clusterBkg: "#0f0f11",
        clusterBorder: "#242428",
        fontSize: "14px",
      },
    });
    return m;
  });
  return ready;
}

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "");
  useEffect(() => {
    let alive = true;
    load().then(async (m) => {
      const { svg } = await m.render(`m${id}`, chart);
      if (alive && ref.current) ref.current.innerHTML = svg;
    });
    return () => {
      alive = false;
    };
  }, [chart, id]);
  return <div ref={ref} className="panel flex min-h-[120px] justify-center overflow-x-auto p-5 [&_svg]:max-w-full" />;
}
