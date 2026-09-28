"use client";

// Tiny synthesized UI sounds (Web Audio, no files). Off by default; the visitor opts in.

import { useEffect, useState } from "react";

export type Sound = "hover" | "click" | "ignite" | "tick" | "shield" | "thud" | "toggle";

const KEY = "wick.sound";
let ctx: AudioContext | null = null;
let enabled = false;
const subs = new Set<(v: boolean) => void>();

try {
  enabled = typeof window !== "undefined" && localStorage.getItem(KEY) === "on";
} catch {}

function ac() {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0) {
  const a = ac();
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, from: number, to: number) {
  const a = ac();
  const t = a.currentTime;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = 0.8;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export function play(s: Sound) {
  if (!enabled || typeof window === "undefined") return;
  try {
    switch (s) {
      case "hover":
        tone(1850, 0.05, "sine", 0.025);
        break;
      case "tick":
        tone(2600, 0.025, "square", 0.012);
        break;
      case "click":
        tone(660, 0.08, "triangle", 0.07, 990);
        break;
      case "toggle":
        tone(520, 0.06, "sine", 0.06);
        tone(780, 0.08, "sine", 0.05, undefined, 0.06);
        break;
      case "ignite":
        noise(0.55, 0.16, 400, 3200);
        tone(220, 0.5, "sawtooth", 0.03, 880);
        break;
      case "shield":
        tone(523, 0.18, "sine", 0.08);
        tone(784, 0.22, "sine", 0.07, undefined, 0.09);
        tone(1046, 0.35, "sine", 0.06, undefined, 0.18);
        break;
      case "thud":
        tone(120, 0.35, "sine", 0.22, 45);
        noise(0.2, 0.08, 900, 200);
        break;
    }
  } catch {}
}

export function setSound(v: boolean) {
  enabled = v;
  try {
    localStorage.setItem(KEY, v ? "on" : "off");
  } catch {}
  subs.forEach((f) => f(v));
  if (v) play("toggle");
}

export function useSound() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(enabled);
    subs.add(setOn);
    return () => {
      subs.delete(setOn);
    };
  }, []);
  return [on, setSound] as const;
}
