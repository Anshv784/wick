"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const frag = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uMouse;
uniform float uIgnite;

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float noise(float x) { float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float fbm(float x) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(x); x *= 2.03; a *= 0.5; } return v; }

// Price path used for the candle skyline.
float price(float i) { return fbm(i * 0.11 + 3.0) * 0.9 + sin(i * 0.035) * 0.12; }

vec3 palette(float t) {
  vec3 a = vec3(1.0, 0.48, 0.10);   // flame
  vec3 b = vec3(1.0, 0.18, 0.39);   // magenta
  vec3 c = vec3(0.55, 0.42, 1.0);   // violet
  return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, (t - 0.5) * 2.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  vec3 col = vec3(0.012, 0.012, 0.016);

  // --- light ribbons (bend toward the pointer) ----------------------------------
  vec2 m = (uMouse - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float bend = exp(-pow(p.x - m.x, 2.0) * 3.0) * (m.y - p.y) * 0.25;
    float y = 0.12 * sin(p.x * (1.1 + fi * 0.13) + t * (0.18 + fi * 0.02) + fi * 1.7)
            + (fi - 3.0) * 0.045 + p.x * 0.28 - 0.06 + bend;
    float d = abs(p.y - y);
    float w = 0.0025 + 0.0022 * fi;
    float glow = w / (d + w) ;
    glow = pow(glow, 2.2) * (0.55 + 0.45 * sin(p.x * 3.0 - t * 0.6 + fi));
    float fade = smoothstep(-1.2, 0.2, p.x) * smoothstep(1.4, 0.3, p.x);
    col += palette(fi / 6.0) * glow * fade * 0.9;
  }

  // --- candle skyline --------------------------------------------------------------
  float wdt = 0.034;
  float xs = p.x + t * 0.025;
  float idx = floor(xs / wdt);
  float cx = (idx + 0.5) * wdt;
  float o = price(idx), c = price(idx + 1.0);
  float hi = max(o, c) + hash(idx * 1.7) * 0.06;
  float lo = min(o, c) - hash(idx * 2.3) * 0.06;
  float base = -0.62;
  float sc = 0.42;
  float top = base + max(o, c) * sc, bot = base + min(o, c) * sc;
  float wt = base + hi * sc, wb = base + lo * sc;
  float dx = abs(xs - cx);
  float body = step(dx, wdt * 0.32) * step(bot, p.y) * step(p.y, max(top, bot + 0.004));
  float wick = step(dx, 0.0016) * step(wb, p.y) * step(p.y, wt);
  vec3 cc = c >= o ? vec3(0.37, 0.88, 0.63) : vec3(1.0, 0.42, 0.51);
  float cfade = smoothstep(-1.0, 0.1, p.x) * 0.55;
  col = mix(col, cc * 0.85, max(body, wick * 0.9) * cfade);

  // --- touch level + the wick that ignites -------------------------------------------
  float level = base + 0.62 * sc + 0.05;
  float lv = smoothstep(0.003, 0.0, abs(p.y - level)) * smoothstep(-1.0, 0.0, p.x);
  float dash = step(0.5, fract(p.x * 40.0 - t * 0.6));
  col += vec3(1.0, 0.48, 0.1) * lv * dash * 0.65;
  col += vec3(1.0, 0.45, 0.12) * smoothstep(0.06, 0.0, abs(p.y - level)) * 0.05;

  vec2 fp = vec2(0.52, level + 0.03);
  float r = length((p - fp) * vec2(1.0, 0.7));
  float flick = 0.8 + 0.2 * sin(t * 13.0) * sin(t * 7.3);
  float flame = exp(-r * 22.0) * 1.6 * flick * uIgnite;
  float tongue = exp(-abs(p.x - fp.x - sin(p.y * 40.0 - t * 8.0) * 0.006) * 140.0) * smoothstep(0.22, 0.0, p.y - fp.y) * step(fp.y - 0.02, p.y);
  col += vec3(1.0, 0.55, 0.18) * flame + vec3(1.0, 0.75, 0.4) * tongue * 0.7 * uIgnite;
  col += vec3(1.0, 0.35, 0.1) * exp(-r * 4.0) * 0.18 * uIgnite;

  // vignette + grain
  col *= smoothstep(1.35, 0.25, length(p * vec2(0.8, 1.1)));
  col += (hash(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + t) - 0.5) * 0.018;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Full-screen GPU hero: light ribbons, a candle skyline and a wick that catches fire. */
export function HeroShader({ ignite = 1 }: { ignite?: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const igniteRef = useRef(ignite);
  igniteRef.current = ignite;

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0.62, 0.55) },
      uIgnite: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: "void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: frag,
    });
    const geo = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geo, mat));

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const target = new THREE.Vector2(0.62, 0.55);
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
    };
    window.addEventListener("pointermove", onMove);
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);

    let raf = 0;
    const start = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      uniforms.uTime.value = (performance.now() - start) / 1000;
      uniforms.uMouse.value.lerp(target, 0.05);
      uniforms.uIgnite.value += (igniteRef.current - uniforms.uIgnite.value) * 0.04;
      renderer.render(scene, camera);
    };
    if (reduced) {
      uniforms.uTime.value = 8;
      uniforms.uIgnite.value = 1;
      renderer.render(scene, camera);
    } else loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      ro.disconnect();
      io.disconnect();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mount} className="absolute inset-0" aria-hidden />;
}
