"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { TANKS } from "@/lib/data/facility";
import { activeIncidents } from "@/lib/simulation/engine";
import { ASSET_BY_ID, TANK_BY_ID } from "@/lib/topology/graph";
import { useAppStore } from "@/store/useAppStore";
import { sceneFx } from "./sceneFx";
import { WAVE_SPEED, startWave, waveFx } from "./waveFx";

const RED = new THREE.Color("#ff3b3b");
const AMBER = new THREE.Color("#ffb020");
const GREEN = new THREE.Color("#33ff99");

const ringVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

function burstMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color() }, uProgress: { value: 0 } },
    vertexShader: ringVertex,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uProgress;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float r = uProgress;
        float ring = exp(-pow((d - r) / 0.045, 2.0));
        float fill = smoothstep(r, 0.0, d) * 0.18;
        float fade = 1.0 - smoothstep(0.55, 1.0, uProgress);
        float a = (ring + fill) * fade * step(d, 1.0);
        gl_FragColor = vec4(uColor * a * 2.2, a);
      }
    `,
  });
}

function haloMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uOpacity: { value: 0 }, uInner: { value: 0.6 } },
    vertexShader: ringVertex,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime; uniform float uOpacity; uniform float uInner;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float band = smoothstep(uInner - 0.04, uInner, d) * (1.0 - smoothstep(0.92, 1.0, d));
        // Ripples travelling outward through the band.
        float rip = 0.55 + 0.45 * sin((d - uTime * 0.35) * 40.0);
        float edge = exp(-pow((d - uInner) / 0.035, 2.0)) * 1.6;
        float a = (band * rip * 0.38 + edge) * uOpacity;
        gl_FragColor = vec4(uColor * a * 1.8, a);
      }
    `,
  });
}

function auraMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: ringVertex,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime; uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float fall = pow(1.0 - vUv.y, 1.7);
        float bands = 0.55 + 0.45 * sin((vUv.y * 5.0 - uTime * 1.4) * 6.2831);
        float a = fall * bands * uOpacity * 0.55;
        gl_FragColor = vec4(uColor * a * 2.0, a);
      }
    `,
  });
}

interface Burst {
  pos: THREE.Vector3;
  radius: number;
  start: number;
  duration: number;
  color: THREE.Color;
}

const POOL = 20;
const SPARKS = 320;

function assetFloor(id: string): [number, number, number] {
  const t = TANK_BY_ID[id];
  if (t) return [t.position[0], t.position[1] + 0.03, t.position[2]];
  const a = ASSET_BY_ID[id];
  return a ? [a.position[0], -1.97, a.position[2]] : [0, 0, 0];
}

function assetRadius(id: string) {
  const t = TANK_BY_ID[id];
  return t ? t.radius + 0.45 : 2.4;
}

export function FaultEffects() {
  const pulse = useAppStore((s) => s.pulse);
  const sim = useAppStore((s) => s.sim);
  const reduced = useAppStore((s) => s.motionPref === "reduce" || (s.motionPref === "system" && s.systemReducedMotion));
  const bursts = useRef<Burst[]>([]);
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
  const ringMats = useMemo(() => Array.from({ length: POOL }, burstMaterial), []);
  const lastPulse = useRef<number>(0);

  // Sparkles for the heal effect.
  const sparkGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    g.setAttribute("aLife", new THREE.BufferAttribute(new Float32Array(SPARKS), 1));
    return g;
  }, []);
  const sparkMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: GREEN.clone() }, uScale: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aLife; uniform float uScale; varying float vLife;
          void main() { vLife = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (2.0 + 6.0 * aLife) * uScale * (40.0 / -mv.z); gl_Position = projectionMatrix * mv; }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; varying float vLife;
          void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vLife; gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.35) * a * 2.0, a); }
        `,
      }),
    [],
  );
  const sparks = useRef<{ x: number; y: number; z: number; vy: number; born: number; life: number }[]>([]);

  // Persistent halos around affected tanks and the incident root.
  const haloIds = useMemo(() => [...TANKS.map((t) => t.id), "PMP-C1", "PMP-C2", "PMP-C3", "FLT-1", "FLT-2"], []);
  const haloMats = useMemo(() => haloIds.map(() => haloMaterial()), [haloIds]);
  const auraMats = useMemo(() => TANKS.map(() => auraMaterial()), []);
  const healGlow = useRef<Record<string, number>>({});

  useEffect(
    () => () => {
      ringMats.forEach((m) => m.dispose());
      haloMats.forEach((m) => m.dispose());
      auraMats.forEach((m) => m.dispose());
      sparkGeo.dispose();
      sparkMat.dispose();
    },
    [ringMats, haloMats, auraMats, sparkGeo, sparkMat],
  );

  // Kick off a new pulse.
  useEffect(() => {
    if (!pulse || pulse.id === lastPulse.current) return;
    lastPulse.current = pulse.id;
    const now = sceneFx.time;
    startWave(pulse.kind, pulse.rootId, now);
    const color = pulse.kind === "fault" ? RED : GREEN;
    const root = assetFloor(pulse.rootId);
    const add = (pos: [number, number, number], radius: number, delay: number, duration = 1.9) =>
      bursts.current.push({ pos: new THREE.Vector3(...pos), radius, start: now + delay, duration, color });
    for (let i = 0; i < 3; i++) add(root, 9, i * 0.35, 2.2);
    for (const id of pulse.tanks) {
      const delay = (waveFx.tankAt[id] ?? 0) / WAVE_SPEED;
      const r = assetRadius(id) + 5;
      add(assetFloor(id), r, delay, 1.7);
      add(assetFloor(id), r * 0.75, delay + 0.3, 1.7);
      if (pulse.kind === "heal") {
        healGlow.current[id] = now + delay;
        const t = TANK_BY_ID[id];
        for (let k = 0; k < 50; k++) {
          const a = Math.random() * Math.PI * 2;
          const d = t.radius + 0.2 + Math.random() * 1.4;
          sparks.current.push({ x: t.position[0] + Math.cos(a) * d, y: t.position[1] + 0.2 + Math.random() * 0.6, z: t.position[2] + Math.sin(a) * d, vy: 0.6 + Math.random() * 1.2, born: now + delay + Math.random() * 1.2, life: 3.2 + Math.random() * 1.8 });
        }
      }
    }
    if (pulse.kind === "heal") healGlow.current[pulse.rootId] = now;
    if (bursts.current.length > POOL) bursts.current.splice(0, bursts.current.length - POOL);
  }, [pulse]);

  const active = activeIncidents(sim);
  const incidentRoots = new Set(active.map((i) => i.rootAssetId));

  useFrame((state) => {
    const now = sceneFx.time;
    // Bursts
    bursts.current = bursts.current.filter((b) => now - b.start < b.duration);
    for (let i = 0; i < POOL; i++) {
      const mesh = ringRefs.current[i];
      if (!mesh) continue;
      const b = bursts.current[i];
      const p = b ? (now - b.start) / b.duration : -1;
      if (!b || p < 0 || reduced) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.copy(b.pos);
      mesh.scale.setScalar(b.radius * 2);
      ringMats[i].uniforms.uProgress.value = Math.min(1, p);
      ringMats[i].uniforms.uColor.value.copy(b.color);
    }
    // Halos
    haloIds.forEach((id, i) => {
      const m = haloMats[i];
      let target = 0;
      let col = RED;
      const tank = sim.tanks[id];
      if (tank && tank.flowPct < 90) {
        target = 1;
        col = tank.status === "degraded" ? AMBER : RED;
      } else if (incidentRoots.has(id)) {
        target = 1;
      }
      const heal = healGlow.current[id];
      if (heal !== undefined && now > heal && now - heal < 5) {
        target = Math.max(target, 1 - (now - heal) / 5);
        col = GREEN;
      }
      m.uniforms.uOpacity.value += (target * (0.65 + 0.35 * sceneFx.pulse) - m.uniforms.uOpacity.value) * 0.12;
      m.uniforms.uColor.value.lerp(col, 0.2);
      m.uniforms.uTime.value = now * sceneFx.motion;
      const ti = TANKS.findIndex((t) => t.id === id);
      if (ti >= 0) {
        const am = auraMats[ti];
        am.uniforms.uOpacity.value += (target * (0.7 + 0.3 * sceneFx.pulse) - am.uniforms.uOpacity.value) * 0.12;
        am.uniforms.uColor.value.copy(m.uniforms.uColor.value);
        am.uniforms.uTime.value = now * sceneFx.motion;
      }
    });
    // Sparks
    const pos = sparkGeo.getAttribute("position") as THREE.BufferAttribute;
    const life = sparkGeo.getAttribute("aLife") as THREE.BufferAttribute;
    sparks.current = sparks.current.filter((s) => now - s.born < s.life).slice(-SPARKS);
    for (let i = 0; i < SPARKS; i++) {
      const s = sparks.current[i];
      if (!s || now < s.born) {
        life.setX(i, 0);
        continue;
      }
      const age = now - s.born;
      pos.setXYZ(i, s.x + Math.sin(age * 3 + i) * 0.08, s.y + age * s.vy, s.z + Math.cos(age * 2.6 + i) * 0.08);
      life.setX(i, Math.max(0, 1 - age / s.life));
    }
    pos.needsUpdate = true;
    life.needsUpdate = true;
    sparkMat.uniforms.uScale.value = state.size.height / 900;
    if (waveFx.active && now - waveFx.start > waveFx.maxDist / WAVE_SPEED + 6) waveFx.active = false;
  });

  return (
    <group>
      {ringMats.map((m, i) => (
        <mesh
          key={i}
          ref={(el) => {
            ringRefs.current[i] = el;
          }}
          material={m}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={8}
          visible={false}
          raycast={() => null}
        >
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
      {haloIds.map((id, i) => {
        const pos = assetFloor(id);
        const r = assetRadius(id);
        const outer = r + 1.6;
        return (
          <mesh key={id} material={haloMats[i]} position={[pos[0], pos[1] + 0.01, pos[2]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={7} raycast={() => null} onUpdate={() => (haloMats[i].uniforms.uInner.value = r / outer)}>
            <planeGeometry args={[outer * 2, outer * 2]} />
          </mesh>
        );
      })}
      {TANKS.map((t, i) => (
        <mesh key={`aura-${t.id}`} material={auraMats[i]} position={[t.position[0], t.position[1] + t.plinth + Math.min(t.height, 4.6) / 2, t.position[2]]} renderOrder={7} raycast={() => null}>
          <cylinderGeometry args={[t.radius + 0.22, t.radius + 0.22, Math.min(t.height, 4.6), 64, 1, true]} />
        </mesh>
      ))}
      <points geometry={sparkGeo} material={sparkMat} frustumCulled={false} renderOrder={9} raycast={() => null} />
    </group>
  );
}
