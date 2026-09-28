"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const INK = 0x0a0a0b;
const UP = new THREE.Color("#5ee0a1");
const DOWN = new THREE.Color("#ff6b81");
const FLAME = new THREE.Color("#ff7a1a");

type Candle = { open: number; close: number; high: number; low: number };

/** Deterministic random walk so every visitor sees the same skyline. */
function series(n: number, seed: number, drift = 0.02): Candle[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: Candle[] = [];
  let price = 0;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = open + (rnd() - 0.5 + drift) * 0.9;
    const high = Math.max(open, close) + rnd() * 0.5;
    const low = Math.min(open, close) - rnd() * 0.5;
    out.push({ open, close, high, low });
    price = close;
  }
  return out;
}

/**
 * The landing hero: rows of candlesticks receding into fog, a glowing touch level, and one
 * wick that pierces it and catches fire. Vanilla three.js, no React renderer.
 */
export function CandleScene() {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(INK, 14, 46);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 1.2, 18);

    const world = new THREE.Group();
    scene.add(world);

    // --- candle rows -------------------------------------------------------------
    const ROWS = [
      { z: 0, n: 64, seed: 7, scale: 1, spacing: 0.42 },
      { z: -9, n: 80, seed: 21, scale: 1.25, spacing: 0.5 },
      { z: -20, n: 96, seed: 43, scale: 1.6, spacing: 0.62 },
    ];
    const body = new THREE.BoxGeometry(1, 1, 1);
    const disposables: { dispose: () => void }[] = [body];
    let pierce = new THREE.Vector3();
    let barrierY = 0;

    ROWS.forEach((row, r) => {
      const cs = series(row.n, row.seed, r === 0 ? 0.035 : 0.01);
      const mid = cs.reduce((a, c) => a + c.close, 0) / cs.length;
      const mat = new THREE.MeshBasicMaterial({ vertexColors: false, transparent: true, opacity: r === 0 ? 0.95 : 0.55 - r * 0.12 });
      const wickMat = mat.clone();
      disposables.push(mat, wickMat);
      const bodies = new THREE.InstancedMesh(body, mat, cs.length);
      const wicks = new THREE.InstancedMesh(body, wickMat, cs.length);
      const m = new THREE.Matrix4();
      const w = row.spacing * 0.62;
      cs.forEach((c, i) => {
        const x = (i - cs.length / 2) * row.spacing;
        const s = row.scale;
        const top = Math.max(c.open, c.close);
        const bot = Math.min(c.open, c.close);
        m.compose(
          new THREE.Vector3(x, ((top + bot) / 2 - mid) * s, row.z),
          new THREE.Quaternion(),
          new THREE.Vector3(w, Math.max(0.05, (top - bot) * s), w),
        );
        bodies.setMatrixAt(i, m);
        m.compose(
          new THREE.Vector3(x, ((c.high + c.low) / 2 - mid) * s, row.z),
          new THREE.Quaternion(),
          new THREE.Vector3(0.045 * s, (c.high - c.low) * s, 0.045 * s),
        );
        wicks.setMatrixAt(i, m);
        const col = c.close >= c.open ? UP : DOWN;
        bodies.setColorAt(i, col);
        wicks.setColorAt(i, col);
      });

      // Front row: put the touch level just under the highest wick in the right half, and
      // mark that candle as the one that ignites.
      if (r === 0) {
        let best = cs.length / 2;
        for (let i = Math.floor(cs.length * 0.55); i < cs.length - 4; i++) if (cs[i].high > cs[best].high) best = i;
        const c = cs[best];
        barrierY = (c.high - mid) * row.scale - 0.28;
        pierce = new THREE.Vector3((best - cs.length / 2) * row.spacing, (c.high - mid) * row.scale, row.z);
        bodies.setColorAt(best, FLAME);
        wicks.setColorAt(best, FLAME);
      }
      world.add(bodies, wicks);
    });

    // --- touch level (glowing plane edge) --------------------------------------------
    const lineGeo = new THREE.PlaneGeometry(60, 0.035);
    const lineMat = new THREE.MeshBasicMaterial({ color: FLAME, transparent: true, opacity: 0.9, fog: false });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.set(0, barrierY, 0.01);
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 4;
    glowCanvas.height = 128;
    const g = glowCanvas.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "rgba(255,122,26,0)");
    grad.addColorStop(0.5, "rgba(255,122,26,0.35)");
    grad.addColorStop(1, "rgba(255,122,26,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const bandGeo = new THREE.PlaneGeometry(60, 1.2);
    const bandMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.set(0, barrierY, 0);
    world.add(band, line);
    disposables.push(lineGeo, lineMat, glowTex, bandGeo, bandMat);

    // --- flame particles at the pierce point -------------------------------------------
    const N = reduced ? 0 : 180;
    const pos = new Float32Array(N * 3);
    const life = new Float32Array(N);
    const vel = new Float32Array(N * 3);
    const spawn = (i: number) => {
      pos[i * 3] = pierce.x + (Math.random() - 0.5) * 0.12;
      pos[i * 3 + 1] = pierce.y + Math.random() * 0.1;
      pos[i * 3 + 2] = pierce.z + (Math.random() - 0.5) * 0.12;
      vel[i * 3] = (Math.random() - 0.5) * 0.25;
      vel[i * 3 + 1] = 0.6 + Math.random() * 0.9;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
      life[i] = Math.random();
    };
    for (let i = 0; i < N; i++) spawn(i);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const dot = document.createElement("canvas");
    dot.width = dot.height = 64;
    const d = dot.getContext("2d")!;
    const rg = d.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, "rgba(255,170,90,1)");
    rg.addColorStop(0.25, "rgba(255,110,20,0.85)");
    rg.addColorStop(1, "rgba(255,122,26,0)");
    d.fillStyle = rg;
    d.fillRect(0, 0, 64, 64);
    const dotTex = new THREE.CanvasTexture(dot);
    const pMat = new THREE.PointsMaterial({
      size: 0.22,
      map: dotTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const flame = new THREE.Points(pGeo, pMat);
    world.add(flame);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
    halo.position.copy(pierce);
    halo.scale.setScalar(2.4);
    world.add(halo);
    disposables.push(pGeo, dotTex, pMat, halo.material);

    // Frame the pierce point slightly right of centre, where the headline doesn't cover it.
    world.position.x = -pierce.x + 5.2;
    world.position.y = -barrierY - 1.4;

    // --- interaction + loop ------------------------------------------------------------
    const target = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.position.z = w < 700 ? 26 : 18;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    let last = performance.now();
    let t = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const nowMs = performance.now();
      const dt = Math.min((nowMs - last) / 1000, 0.05);
      last = nowMs;
      t += dt;
      camera.position.x += (target.x * 1.6 + Math.sin(t * 0.08) * 1.2 - camera.position.x) * 0.03;
      camera.position.y += (1.2 - target.y * 0.8 - camera.position.y) * 0.03;
      camera.lookAt(0, 0, -4);
      lineMat.opacity = 0.75 + Math.sin(t * 2.2) * 0.15;
      halo.material.opacity = 0.6 + Math.sin(t * 9) * 0.12 + Math.sin(t * 13.7) * 0.08;
      for (let i = 0; i < N; i++) {
        life[i] += dt * 1.3;
        if (life[i] > 1) spawn(i), (life[i] = 0);
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      pGeo.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
    };
    if (reduced) {
      camera.lookAt(0, 0, -4);
      renderer.render(scene, camera);
    } else tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      ro.disconnect();
      io.disconnect();
      world.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
      disposables.forEach((x) => x.dispose());
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  // On phones the scene sits under the copy instead of behind it.
  return <div ref={mount} className="absolute inset-x-0 top-[48%] bottom-0 sm:inset-0" aria-hidden />;
}
