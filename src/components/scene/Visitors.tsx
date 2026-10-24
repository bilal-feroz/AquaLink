"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BUILDING, TANKS } from "@/lib/data/facility";
import { PLANTERS } from "./Architecture";
import { personGeometry, rng } from "./geometry";
import { sceneFx } from "./sceneFx";
import { visitorMaterial } from "./shaders";

const CLOTHES = ["#2b3a55", "#7a2e3b", "#d9d4c7", "#3f5f4a", "#c58b3a", "#1f2328", "#5b6b8c", "#a14d6a", "#e6e1d6", "#355c7d", "#8c6e54", "#406b8f", "#d65f5f", "#4fa3a5"];
const SKIN = ["#e9c2a6", "#c68e6a", "#8d5a3b", "#f1d0b8", "#a8704e", "#5e3a26"];

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Poi {
  x: number;
  z: number;
  /** Where the visitor looks while standing here. */
  lookX: number;
  lookZ: number;
}

interface Zone {
  y: number;
  rect: Rect;
  pois: Poi[];
  count: number;
}

interface Agent {
  zone: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  state: "walk" | "look";
  target: Poi;
  timer: number;
  phase: number;
  scale: number;
  photoAt: number;
  pose: number;
}

interface Obstacle {
  x: number;
  z: number;
  r: number;
  y: number;
}

const OBSTACLES: Obstacle[] = [
  ...TANKS.map((t) => ({ x: t.position[0], z: t.position[2], r: t.radius + 0.75, y: t.position[1] })),
  ...BUILDING.columns.flatMap(([x, z]) => [0, 6, 12].map((y) => ({ x, z, r: 0.75, y }))),
  ...PLANTERS.map(([x, y, z]) => ({ x, z, r: 0.95, y })),
  // Escalator footprints approximated by circles.
  ...[2.6, 5.1, 7.6, 10.1, 12.5].flatMap((z) => [
    { x: -19.5, z, r: 1.0, y: 0 },
    { x: 20.5, z, r: 1.0, y: 0 },
  ]),
];

function tankPois(tankId: string, n: number, r: () => number): Poi[] {
  const t = TANKS.find((x) => x.id === tankId)!;
  const out: Poi[] = [];
  for (let i = 0; i < n; i++) {
    // Favour the side facing the atrium / entrance.
    const toward = Math.atan2(10 - t.position[2], -t.position[0] * 0.6);
    const a = toward + (r() - 0.5) * Math.PI * 1.5;
    const d = t.radius + 1.0 + r() * 0.9;
    out.push({ x: t.position[0] + Math.cos(a) * d, z: t.position[2] + Math.sin(a) * d, lookX: t.position[0], lookZ: t.position[2] });
  }
  return out;
}

function railPois(edge: { x1: number; z1: number; x2: number; z2: number }, n: number, r: () => number): Poi[] {
  const A = TANKS[0];
  return Array.from({ length: n }, () => {
    const k = r();
    const x = edge.x1 + (edge.x2 - edge.x1) * k;
    const z = edge.z1 + (edge.z2 - edge.z1) * k;
    return { x, z, lookX: A.position[0], lookZ: A.position[2] };
  });
}

function buildZones(): Zone[] {
  const r = rng(91);
  const L2 = BUILDING.decks.L2;
  const L3 = BUILDING.decks.L3;
  const inset = (d: Rect, m = 0.7): Rect => ({ minX: d.minX + m, maxX: d.maxX - m, minZ: d.minZ + m, maxZ: d.maxZ - m });
  return [
    {
      y: 0,
      rect: { minX: -22.5, maxX: 22.5, minZ: -9.5, maxZ: 26 },
      pois: [
        ...tankPois("TNK-A", 18, r),
        ...tankPois("TNK-E", 8, r),
        ...tankPois("TNK-F", 8, r),
        ...Array.from({ length: 10 }, () => ({ x: -18 + r() * 36, z: 15 + r() * 10, lookX: 0, lookZ: -3 })),
      ],
      count: 50,
    },
    { y: L2.y, rect: inset(L2.left), pois: [...tankPois("TNK-D", 7, r), ...railPois({ x1: -9.8, z1: -9, x2: -9.8, z2: 1 }, 5, r)], count: 10 },
    { y: L2.y, rect: inset(L2.right), pois: [...tankPois("TNK-C", 7, r), ...railPois({ x1: 9.8, z1: -9, x2: 9.8, z2: 1 }, 5, r)], count: 10 },
    { y: L2.y, rect: inset(L2.back, 0.6), pois: railPois({ x1: -7.5, z1: -11.2, x2: 7.5, z2: -11.2 }, 6, r), count: 6 },
    { y: L3.y, rect: inset(L3.right), pois: [...tankPois("TNK-B", 7, r), ...railPois({ x1: 11.3, z1: -11, x2: 11.3, z2: -5 }, 3, r)], count: 9 },
    { y: L3.y, rect: inset(L3.left), pois: railPois({ x1: -11.3, z1: -11, x2: -11.3, z2: -5 }, 5, r), count: 5 },
    { y: L3.y, rect: inset(L3.back, 0.6), pois: railPois({ x1: -8, z1: -12.2, x2: 8, z2: -12.2 }, 5, r), count: 5 },
  ];
}

const FLASHES = 24;

export function Visitors({ visible }: { visible: boolean }) {
  const zones = useMemo(() => buildZones(), []);
  const agents = useMemo<Agent[]>(() => {
    const r = rng(2024);
    const out: Agent[] = [];
    zones.forEach((zone, zi) => {
      for (let i = 0; i < zone.count; i++) {
        const poi = zone.pois[Math.floor(r() * zone.pois.length)];
        const child = r() < 0.15;
        out.push({
          zone: zi,
          x: poi.x + (r() - 0.5) * 1.5,
          z: poi.z + (r() - 0.5) * 1.5,
          heading: r() * Math.PI * 2,
          speed: 0.85 + r() * 0.5,
          state: r() < 0.5 ? "look" : "walk",
          target: zone.pois[Math.floor(r() * zone.pois.length)],
          timer: r() * 8,
          phase: r() * 10,
          scale: child ? 0.64 + r() * 0.08 : 0.92 + r() * 0.16,
          photoAt: -1,
          pose: 0,
        });
      }
    });
    return out;
  }, [zones]);

  const material = useMemo(() => visitorMaterial(), []);
  const geometry = useMemo(() => {
    const g = personGeometry().clone();
    const r = rng(77);
    const n = agents.length;
    const cloth = new Float32Array(n * 3);
    const skin = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      cloth.set(c.set(CLOTHES[Math.floor(r() * CLOTHES.length)]).toArray(), i * 3);
      skin.set(c.set(SKIN[Math.floor(r() * SKIN.length)]).toArray(), i * 3);
      phase[i] = r();
    }
    g.setAttribute("aCloth", new THREE.InstancedBufferAttribute(cloth, 3));
    g.setAttribute("aSkin", new THREE.InstancedBufferAttribute(skin, 3));
    g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
    g.setAttribute("aWalk", new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, [agents]);

  const flashGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FLASHES * 3), 3));
    g.setAttribute("aI", new THREE.BufferAttribute(new Float32Array(FLASHES), 1));
    return g;
  }, []);
  const flashMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uScale: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aI; uniform float uScale; varying float vI;
          void main() { vI = aI; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (6.0 + 70.0 * aI) * uScale * (12.0 / max(-mv.z, 4.0)); gl_Position = projectionMatrix * mv; }
        `,
        fragmentShader: /* glsl */ `
          varying float vI;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float d = length(c);
            float core = smoothstep(0.5, 0.0, d);
            float star = max(0.0, 1.0 - abs(c.x) * 14.0) * smoothstep(0.5, 0.0, abs(c.y)) + max(0.0, 1.0 - abs(c.y) * 14.0) * smoothstep(0.5, 0.0, abs(c.x));
            float a = (core * core + star * 0.6) * vI;
            gl_FragColor = vec4(vec3(0.92, 0.96, 1.0) * a * 3.0, a);
          }
        `,
      }),
    [],
  );
  const flashes = useRef<{ x: number; y: number; z: number; t: number }[]>([]);

  const ref = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
  const rand = useMemo(() => rng(7), []);

  useEffect(() => {
    TANKS.forEach((t, i) => {
      material.uniforms.uGlowPos.value[i].set(t.position[0], t.position[1] + t.plinth + Math.min(t.height, 6) * 0.5, t.position[2]);
      material.uniforms.uGlowCol.value[i].set(t.habitat.waterTint.shallow).multiplyScalar(t.radius > 4 ? 1.6 : 1.0);
    });
    return () => {
      material.dispose();
      geometry.dispose();
      flashGeo.dispose();
      flashMat.dispose();
    };
  }, [material, geometry, flashGeo, flashMat]);

  useFrame((state, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const show = visible && sceneFx.ghost < 0.35;
    mesh.visible = show;
    if (!show) return;
    const dt = Math.min(delta, 0.05) * sceneFx.motion;
    const now = sceneFx.time;
    const walk = geometry.getAttribute("aWalk") as THREE.InstancedBufferAttribute;
    agents.forEach((a, i) => {
      const zone = zones[a.zone];
      let moving = 0;
      if (a.state === "look") {
        a.timer -= dt;
        // Turn to face the exhibit.
        const want = Math.atan2(a.target.lookX - a.x, a.target.lookZ - a.z);
        a.heading += Math.atan2(Math.sin(want - a.heading), Math.cos(want - a.heading)) * Math.min(1, dt * 3);
        if (a.photoAt > 0 && a.timer < a.photoAt) {
          a.photoAt = -1;
          const fx = a.x + Math.sin(a.heading) * 0.32 * a.scale;
          const fz = a.z + Math.cos(a.heading) * 0.32 * a.scale;
          flashes.current.push({ x: fx, y: zone.y + 1.48 * a.scale, z: fz, t: now });
        }
        a.pose += ((a.photoAt > 0 || (a.timer > 0 && a.timer < 0.6)) && a.pose < 1 ? 1 : -1) * dt * 3;
        a.pose = Math.max(0, Math.min(1, a.pose));
        if (a.timer <= 0) {
          a.state = "walk";
          let next = a.target;
          while (next === a.target && zone.pois.length > 1) next = zone.pois[Math.floor(rand() * zone.pois.length)];
          a.target = next;
        }
      } else {
        const dx = a.target.x - a.x;
        const dz = a.target.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.35) {
          a.state = "look";
          a.timer = 5 + rand() * 10;
          a.photoAt = rand() < 0.4 ? a.timer * (0.3 + rand() * 0.5) : -1;
        } else {
          let vx = dx / dist;
          let vz = dz / dist;
          // Steer around habitats, columns and planters on this level.
          for (const o of OBSTACLES) {
            if (Math.abs(o.y - zone.y) > 1) continue;
            const ox = a.x - o.x;
            const oz = a.z - o.z;
            const od = Math.hypot(ox, oz);
            const reach = o.r + 1.3;
            if (od < reach && od > 1e-3) {
              const push = (reach - od) / reach;
              vx += (ox / od) * push * 2.2;
              vz += (oz / od) * push * 2.2;
              // Slide tangentially towards the target side.
              const side = Math.sign(ox * dz - oz * dx) || 1;
              vx += (-oz / od) * side * push * 1.4;
              vz += (ox / od) * side * push * 1.4;
            }
          }
          const vl = Math.hypot(vx, vz) || 1;
          const want = Math.atan2(vx / vl, vz / vl);
          a.heading += Math.atan2(Math.sin(want - a.heading), Math.cos(want - a.heading)) * Math.min(1, dt * 5);
          a.x += Math.sin(a.heading) * a.speed * dt;
          a.z += Math.cos(a.heading) * a.speed * dt;
          a.x = Math.min(zone.rect.maxX, Math.max(zone.rect.minX, a.x));
          a.z = Math.min(zone.rect.maxZ, Math.max(zone.rect.minZ, a.z));
          moving = 1;
          a.phase += dt * a.speed * 5.2;
        }
        a.pose = Math.max(0, a.pose - dt * 3);
      }
      tmp.q.setFromAxisAngle(tmp.up, a.heading);
      tmp.m.compose(tmp.v.set(a.x, zone.y, a.z), tmp.q, tmp.s.setScalar(a.scale));
      mesh.setMatrixAt(i, tmp.m);
      walk.setXYZ(i, a.phase, moving, a.pose);
    });
    mesh.instanceMatrix.needsUpdate = true;
    walk.needsUpdate = true;
    material.uniforms.uTime.value = now;
    material.uniforms.uMotion.value = sceneFx.motion;

    // Camera flashes: a bright double pop that fades in ~0.25 s.
    const fp = flashGeo.getAttribute("position") as THREE.BufferAttribute;
    const fi = flashGeo.getAttribute("aI") as THREE.BufferAttribute;
    flashes.current = flashes.current.filter((f) => now - f.t < 0.35).slice(-FLASHES);
    for (let i = 0; i < FLASHES; i++) {
      const f = flashes.current[i];
      if (!f) {
        fi.setX(i, 0);
        continue;
      }
      const age = now - f.t;
      fp.setXYZ(i, f.x, f.y, f.z);
      fi.setX(i, Math.max(0, age < 0.06 ? 1 : 1 - (age - 0.06) / 0.29));
    }
    fp.needsUpdate = true;
    fi.needsUpdate = true;
    flashMat.uniforms.uScale.value = state.size.height / 900;
  });

  return (
    <group>
      <instancedMesh ref={ref} args={[geometry, material, agents.length]} frustumCulled={false} raycast={() => null} />
      <points geometry={flashGeo} material={flashMat} frustumCulled={false} renderOrder={9} visible={visible} raycast={() => null} />
    </group>
  );
}

export const VISITOR_COUNT_NOTE = "Visitor figures are scenery for scale; they are not tracked occupancy data.";
