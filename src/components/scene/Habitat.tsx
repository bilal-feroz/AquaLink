"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CirculationStatus } from "@/lib/simulation/engine";
import type { TankConfig } from "@/lib/types";
import {
  anemoneGeometry,
  bladeGeometry,
  boulderCoralGeometry,
  branchCoralGeometry,
  fanCoralGeometry,
  fishGeometry,
  flowerCoralGeometry,
  rayGeometry,
  rng,
  rockGeometry,
  rootGeometry,
  seahorseGeometry,
  sharkGeometry,
  spongeGeometry,
  starfishGeometry,
} from "./geometry";
import { sceneFx } from "./sceneFx";
import {
  floorCausticMaterial,
  glassMaterial,
  marineMaterial,
  particleMaterial,
  underwaterMaterial,
  waterBackMaterial,
  waterFrontMaterial,
  waterSurfaceMaterial,
  type SwimStyle,
  type UnderwaterUniforms,
} from "./shaders";

type GeoKind = "shark" | "ray" | "slim" | "reef" | "deep" | "seahorse";

interface FishInstance {
  center: [number, number, number];
  orbit: [number, number, number, number];
  wobble: [number, number, number, number];
  offset: [number, number, number];
  colA: string;
  colB: string;
  pattern: number;
  /** Index into the tank's habitat.species list. */
  species?: number;
}

const REEF_PALETTE: [string, string, number][] = [
  ["#f5cf1f", "#f7e27a", 0], // yellow tang
  ["#1f4fd6", "#f2c41a", 2], // blue tang
  ["#ff6f9f", "#ffb25a", 0], // anthias
  ["#45c8ff", "#b7f1ff", 0], // chromis
  ["#f5e6b8", "#e8a21c", 3], // butterflyfish
  ["#2fbf73", "#ff6fa0", 2], // wrasse
  ["#7c4dff", "#ffd54a", 2], // royal gramma
  ["#ff8a3d", "#ffe0b0", 0], // hawkfish
];

// Saturated reef colours: under the blue "actinic" light these fluoresce (see uGlow).
const CORAL_COLORS = ["#ff4f8b", "#c86bfa", "#ff8a3d", "#ffd23f", "#4dffb8", "#ff5fd2", "#ff6b6b", "#9b7bff", "#3de8ff", "#b6ff5c", "#ff9ec7", "#ffb84d"];
const FLOWER_COLORS = ["#ff4fa3", "#ff7a1a", "#ffd23f", "#b6ff5c", "#3de8ff", "#c86bfa", "#ff5f5f", "#7cf5d0"];
const SPONGE_COLORS = ["#9b4dff", "#ff7a1a", "#ffcc33", "#ff4f8b", "#2fd3ff"];
const STAR_COLORS = ["#ff5a1f", "#ff3b5c", "#ffb020", "#3d7bff", "#ff7ab8"];
const SEAGRASS = ["#4f9a4a", "#5fb14f", "#3f8a3c", "#6cbf5a", "#4a9e60"];
const ALGAE = ["#c2185b", "#e64a19", "#8e3bd6", "#d81b60", "#b8862b", "#7cb342"];

function buildLife(t: TankConfig, waterH: number) {
  const r = rng(t.code.charCodeAt(0) * 977);
  const R = t.radius;
  const lists: Record<GeoKind, FishInstance[]> = { shark: [], ray: [], slim: [], reef: [], deep: [], seahorse: [] };
  const anemones = anemoneSpots(t);
  let schools = 0;
  const kindsAll = Object.keys(lists) as GeoKind[];
  t.habitat.species.forEach((g, speciesIdx) => {
    const before = kindsAll.map((k) => lists[k].length);
    tagSpecies(g, speciesIdx, before);
  });
  return lists;

  function tagSpecies(g: TankConfig["habitat"]["species"][number], speciesIdx: number, before: number[]) {
    addSpecies(g);
    kindsAll.forEach((k, i) => {
      for (let j = before[i]; j < lists[k].length; j++) lists[k][j].species = speciesIdx;
    });
  }

  function addSpecies(g: TankConfig["habitat"]["species"][number]) {
    if (g.kind === "shark") {
      for (let i = 0; i < g.count; i++)
        lists.shark.push({
          center: [0, 0, 0],
          orbit: [R * (0.6 + r() * 0.12), waterH * (0.3 + r() * 0.4), (0.11 + r() * 0.05) * (i % 2 ? -1 : 1), r() * 6.28],
          wobble: [0.5 + r() * 0.5, 0.11 + r() * 0.06, 0.4, 1.9 + r() * 0.3],
          offset: [0, 0, 0],
          colA: "#5d6b78",
          colB: "#dfe4e8",
          pattern: 0,
        });
    } else if (g.kind === "ray") {
      for (let i = 0; i < g.count; i++)
        lists.ray.push({
          center: [0, 0, 0],
          orbit: [R * (0.38 + r() * 0.22), waterH * (0.12 + r() * 0.35), (0.09 + r() * 0.05) * (i % 2 ? 1 : -1), r() * 6.28],
          wobble: [0.35, 0.09 + r() * 0.05, 0.3, 1.25 + r() * 0.25],
          offset: [0, 0, 0],
          colA: "#8a6b4d",
          colB: "#e9e2d6",
          pattern: 0,
        });
    } else if (g.kind === "school") {
      // One coherent shoal sharing an orbit, each fish offset in the body frame.
      // Further shoals circle lower and the other way round, so they never merge.
      const n = schools++;
      const orbit: FishInstance["orbit"] = n === 0 ? [R * 0.46, waterH * 0.58, 0.2, 1.3] : [R * 0.62, waterH * 0.3, -0.16, 4.1];
      const spread = n === 0 ? 1 : 0.6;
      for (let i = 0; i < g.count; i++) {
        lists.slim.push({
          center: [0, 0, 0],
          orbit: [orbit[0], orbit[1], orbit[2], orbit[3]],
          wobble: [0.25 + r() * 0.2, 0.35 + r() * 0.2, 0.15, (n === 0 ? 0.36 : 0.3) + r() * 0.08],
          offset: [(r() - 0.5) * 3.6 * spread, (r() - 0.5) * 1.9 * spread, (r() - 0.5) * 1.8 * spread],
          colA: g.look?.a ?? "#b9c7d3",
          colB: g.look?.b ?? "#eef3f7",
          pattern: g.look?.pattern ?? 0,
        });
      }
    } else if (g.kind === "reef") {
      let placed = 0;
      while (placed < g.count) {
        const groupSize = Math.min(g.count - placed, 1 + Math.floor(r() * 4));
        const pal: [string, string, number] = g.look ? [g.look.a, g.look.b, g.look.pattern] : REEF_PALETTE[Math.floor(r() * REEF_PALETTE.length)];
        const radius = 0.5 + r() * (R - 1.1);
        const y = waterH * (0.12 + r() * 0.42);
        const speed = (0.18 + r() * 0.3) * (r() > 0.5 ? 1 : -1);
        const phase = r() * 6.28;
        const shape = g.look?.shape ?? (pal[2] === 2 || pal[0] === "#f5cf1f" ? "deep" : "reef");
        const list = shape === "deep" ? lists.deep : shape === "slim" ? lists.slim : lists.reef;
        for (let k = 0; k < groupSize; k++) {
          list.push({
            center: [0, 0, 0],
            orbit: [radius, y, speed, phase],
            wobble: [0.12 + r() * 0.15, 0.4 + r() * 0.4, 0.2 + r() * 0.2, (t.code === "A" ? 0.32 : 0.26) + r() * 0.08],
            offset: [(r() - 0.5) * 0.9, (r() - 0.5) * 0.4, (r() - 0.5) * 0.5],
            colA: pal[0],
            colB: pal[1],
            pattern: pal[2],
          });
        }
        placed += groupSize;
      }
    } else if (g.kind === "clownfish") {
      for (let i = 0; i < g.count; i++) {
        const a = anemones[i % anemones.length];
        lists.reef.push({
          center: [a[0], 0, a[2]],
          orbit: [0.18 + r() * 0.28, 0.45 + r() * 0.35, (0.5 + r() * 0.4) * (r() > 0.5 ? 1 : -1), r() * 6.28],
          wobble: [0.08, 0.8 + r() * 0.5, 0.06, 0.15 + r() * 0.03],
          offset: [0, 0, 0],
          colA: "#ff6a1a",
          colB: "#ffffff",
          pattern: 1,
        });
      }
    } else if (g.kind === "seahorse") {
      for (let i = 0; i < g.count; i++) {
        const a = r() * 6.28;
        const d = 0.4 + r() * (R - 1.0);
        lists.seahorse.push({
          center: [Math.cos(a) * d, 0, Math.sin(a) * d],
          orbit: [0.06 + r() * 0.1, 0.5 + r() * 1.4, 0.06 * (r() > 0.5 ? 1 : -1), r() * 6.28],
          wobble: [0.08, 0.3, 0.02, 0.42 + r() * 0.1],
          offset: [0, 0, 0],
          colA: r() > 0.5 ? "#e7b43c" : "#d9792b",
          colB: "#f6dc8a",
          pattern: 3,
        });
      }
    } else if (g.kind === "mangrove") {
      for (let i = 0; i < g.count; i++) {
        const archer = i % 3 === 0;
        lists.slim.push({
          center: [0, 0, 0],
          orbit: [0.6 + r() * (R - 1.2), waterH * (0.2 + r() * 0.6), (0.15 + r() * 0.2) * (r() > 0.5 ? 1 : -1), r() * 6.28],
          wobble: [0.15, 0.5, 0.2, 0.3 + r() * 0.08],
          offset: [0, 0, 0],
          colA: archer ? "#e6e8df" : "#c9a58a",
          colB: archer ? "#1d2320" : "#f2c94c",
          pattern: archer ? 1 : 3,
        });
      }
    }
  }
}

// Marine life is built once per tank so the scene and camera-follow share it.
const LIFE_CACHE = new Map<string, Record<GeoKind, FishInstance[]>>();
function lifeFor(t: TankConfig) {
  if (!LIFE_CACHE.has(t.id)) LIFE_CACHE.set(t.id, buildLife(t, t.height * 0.965));
  return LIFE_CACHE.get(t.id)!;
}

/**
 * World position of a representative animal of one species, matching the
 * GPU swim path in marineMaterial exactly (same formula, same clock).
 */
export function speciesWorldPosition(t: TankConfig, speciesIdx: number, time: number, out = new THREE.Vector3()) {
  const lists = lifeFor(t);
  let inst: FishInstance | undefined;
  for (const k of Object.keys(lists) as GeoKind[]) {
    inst = lists[k].find((f) => f.species === speciesIdx);
    if (inst) break;
  }
  if (!inst) return out.set(t.position[0], t.position[1] + t.plinth + t.height * 0.5, t.position[2]);
  const [radius, height, speed, phase] = inst.orbit;
  const [vAmp, vFreq, rAmp] = inst.wobble;
  const ang = phase + speed * time;
  const r = radius + rAmp * Math.sin(time * 0.21 + phase * 3);
  const y = height + vAmp * Math.sin(time * vFreq + phase * 5);
  return out.set(t.position[0] + inst.center[0] + Math.cos(ang) * r, t.position[1] + t.plinth + y, t.position[2] + inst.center[2] + Math.sin(ang) * r);
}

function anemoneSpots(t: TankConfig): [number, number, number][] {
  if (t.habitat.scenery !== "anemone") return [[0, 0, 0]];
  const R = t.radius;
  return [
    [-R * 0.35, 0, R * 0.25],
    [R * 0.4, 0, R * 0.15],
    [0.1, 0, -R * 0.4],
    [-R * 0.1, 0, R * 0.55],
    [R * 0.15, 0, -R * 0.05],
  ];
}

const GEO_CACHE: Partial<Record<GeoKind, THREE.BufferGeometry>> = {};
function baseGeometry(kind: GeoKind) {
  if (!GEO_CACHE[kind]) {
    GEO_CACHE[kind] =
      kind === "shark" ? sharkGeometry() : kind === "ray" ? rayGeometry() : kind === "seahorse" ? seahorseGeometry() : fishGeometry(kind === "slim" ? "slim" : kind === "deep" ? "deep" : "reef");
  }
  return GEO_CACHE[kind]!;
}

function MarineGroup({ kind, list, water, dimRef }: { kind: GeoKind; list: FishInstance[]; water: string; dimRef: React.RefObject<number> }) {
  const style: SwimStyle = kind === "shark" ? 1 : kind === "ray" ? 2 : kind === "seahorse" ? 3 : 0;
  const material = useMemo(() => marineMaterial(water, style), [water, style]);
  const geometry = useMemo(() => {
    const g = baseGeometry(kind).clone();
    const n = list.length;
    const orbit = new Float32Array(n * 4);
    const wobble = new Float32Array(n * 4);
    const offset = new Float32Array(n * 3);
    const colA = new Float32Array(n * 3);
    const colB = new Float32Array(n * 3);
    const pattern = new Float32Array(n);
    const c = new THREE.Color();
    list.forEach((f, i) => {
      orbit.set(f.orbit, i * 4);
      wobble.set(f.wobble, i * 4);
      // Fold the habitat-local centre into the body-frame offset by orbiting about it.
      offset.set(f.offset, i * 3);
      colA.set(c.set(f.colA).toArray(), i * 3);
      colB.set(c.set(f.colB).toArray(), i * 3);
      pattern[i] = f.pattern;
    });
    g.setAttribute("aOrbit", new THREE.InstancedBufferAttribute(orbit, 4));
    g.setAttribute("aWobble", new THREE.InstancedBufferAttribute(wobble, 4));
    g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offset, 3));
    g.setAttribute("aColA", new THREE.InstancedBufferAttribute(colA, 3));
    g.setAttribute("aColB", new THREE.InstancedBufferAttribute(colB, 3));
    g.setAttribute("aPattern", new THREE.InstancedBufferAttribute(pattern, 1));
    return g;
  }, [kind, list]);

  // Instances orbiting a non-zero centre are placed with the instance matrix.
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    list.forEach((f, i) => mesh.setMatrixAt(i, m.makeTranslation(f.center[0], f.center[1], f.center[2])));
    mesh.instanceMatrix.needsUpdate = true;
  }, [list]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(() => {
    material.uniforms.uTime.value = sceneFx.time;
    material.uniforms.uMotion.value = sceneFx.motion;
    material.uniforms.uDim.value = dimRef.current ?? 0;
  });

  if (list.length === 0) return null;
  return <instancedMesh ref={ref} args={[geometry, material, list.length]} frustumCulled={false} raycast={() => null} />;
}

interface SceneryItem {
  kind: "rock" | "branch" | "boulder" | "fan" | "anemone" | "root" | "flower" | "sponge" | "star";
  position: [number, number, number];
  rotation: number;
  scale: [number, number, number];
  color: string;
}

/** A swaying plant blade: position, rotation, height and colour. */
type Blade = [x: number, z: number, rot: number, h: number, color: string, w?: number];

function buildScenery(t: TankConfig, waterH: number): { items: SceneryItem[]; blades: Blade[] } {
  const r = rng(t.code.charCodeAt(0) * 131 + 7);
  const R = t.radius;
  const items: SceneryItem[] = [];
  const blades: Blade[] = [];
  const pick = (list: string[]) => list[Math.floor(r() * list.length)];
  const polar = (minD: number, maxD: number, arc = Math.PI * 2, start = 0) => {
    const a = start + r() * arc;
    const d = minD + Math.sqrt(r()) * (maxD - minD);
    return [Math.cos(a) * d, Math.sin(a) * d] as const;
  };
  const rock = (x: number, z: number, s: number, h = 1) =>
    items.push({ kind: "rock", position: [x, s * 0.2 * h, z], rotation: r() * 6.28, scale: [s * (0.9 + r() * 0.4), s * h * (0.8 + r() * 0.5), s * (0.9 + r() * 0.4)], color: ["#6f6a63", "#5c5953", "#7d746a"][Math.floor(r() * 3)] });
  const coral = (kind: SceneryItem["kind"], x: number, y: number, z: number, s: number) =>
    items.push({ kind, position: [x, y, z], rotation: r() * 6.28, scale: [s, s, s], color: CORAL_COLORS[Math.floor(r() * CORAL_COLORS.length)] });
  // Eye candy shared by the reef-style habitats: flower corals, tube sponges, starfish, coloured algae.
  const decorate = (flowers: number, sponges: number, stars: number, algae: number, size = 1) => {
    for (let i = 0; i < flowers; i++) {
      const [x, z] = polar(0.3, R - 0.4);
      items.push({ kind: "flower", position: [x, r() * 0.12, z], rotation: r() * 6.28, scale: Array(3).fill((0.8 + r() * 0.7) * size) as [number, number, number], color: pick(FLOWER_COLORS) });
    }
    for (let i = 0; i < sponges; i++) {
      const [x, z] = polar(R * 0.45, R - 0.4);
      items.push({ kind: "sponge", position: [x, 0, z], rotation: r() * 6.28, scale: Array(3).fill((0.8 + r() * 0.6) * size) as [number, number, number], color: pick(SPONGE_COLORS) });
    }
    for (let i = 0; i < stars; i++) {
      const [x, z] = polar(0.4, R - 0.35);
      items.push({ kind: "star", position: [x, 0.02, z], rotation: r() * 6.28, scale: Array(3).fill(0.8 + r() * 0.5) as [number, number, number], color: pick(STAR_COLORS) });
    }
    for (let i = 0; i < algae; i++) {
      // Algae grow in small tufts.
      const [x, z] = polar(0.4, R - 0.3);
      const color = pick(ALGAE);
      for (let k = 0; k < 4; k++) blades.push([x + (r() - 0.5) * 0.18, z + (r() - 0.5) * 0.18, r() * 6.28, (0.25 + r() * 0.4) * size, color]);
    }
  };

  switch (t.habitat.scenery) {
    case "open-ocean": {
      // A reef pinnacle rising from the floor of the showcase.
      rock(0.6, -0.8, 2.4, 1.1);
      rock(-1.2, 0.4, 1.8);
      rock(1.4, 1.1, 1.4);
      rock(-0.2, -1.6, 1.7, 1.6);
      rock(0.3, -0.6, 1.4, 2.6);
      rock(-0.6, -0.9, 1.0, 3.4);
      for (let i = 0; i < 9; i++) {
        const [x, z] = polar(2.2, R - 0.8);
        rock(x, z, 0.5 + r() * 0.7);
      }
      for (let i = 0; i < 34; i++) {
        const [x, z] = polar(1.4, R - 0.5);
        const kinds: SceneryItem["kind"][] = ["branch", "boulder", "fan", "branch"];
        coral(kinds[i % kinds.length], x, 0, z, 0.8 + r() * 0.9);
      }
      decorate(16, 8, 10, 10, 1.6);
      // Tall kelp swaying round the edge of the showcase.
      for (let i = 0; i < 16; i++) {
        const [x, z] = polar(R - 1.2, R - 0.45);
        const color = pick(["#7a8f2b", "#9c7a2a", "#6b8e23", "#8aa13a"]);
        for (let k = 0; k < 3; k++) blades.push([x + (r() - 0.5) * 0.3, z + (r() - 0.5) * 0.3, r() * 6.28, waterH * (0.22 + r() * 0.32), color, 3.2 + r() * 1.6]);
      }
      break;
    }
    case "reef": {
      rock(0, -R * 0.3, 1.3, 1.2);
      rock(-R * 0.4, -R * 0.1, 0.9);
      rock(R * 0.45, -R * 0.15, 1.0, 1.3);
      rock(R * 0.1, R * 0.35, 0.6);
      for (let i = 0; i < 30; i++) {
        const [x, z] = polar(0.3, R - 0.45);
        const kinds: SceneryItem["kind"][] = ["branch", "boulder", "branch", "fan"];
        coral(kinds[i % kinds.length], x, r() * 0.25, z, 0.5 + r() * 0.5);
      }
      decorate(12, 5, 5, 9);
      break;
    }
    case "anemone": {
      rock(-R * 0.15, -R * 0.35, 1.0, 1.2);
      rock(R * 0.4, -R * 0.3, 0.8);
      for (const a of anemoneSpots(t)) coral("anemone", a[0], 0.05, a[2], 1.0 + r() * 0.5);
      for (let i = 0; i < 16; i++) {
        const [x, z] = polar(0.4, R - 0.45);
        coral(i % 2 ? "boulder" : "branch", x, 0, z, 0.4 + r() * 0.4);
      }
      decorate(10, 4, 6, 7);
      break;
    }
    case "seagrass": {
      rock(R * 0.35, -R * 0.35, 0.8);
      rock(-R * 0.45, -R * 0.2, 0.6);
      for (let i = 0; i < 170; i++) {
        const [x, z] = polar(0, R - 0.25);
        blades.push([x, z, r() * 6.28, 0.6 + r() * 1.3, pick(SEAGRASS)]);
      }
      decorate(7, 2, 7, 0);
      break;
    }
    case "mangrove": {
      items.push({ kind: "root", position: [-R * 0.25, 0, -R * 0.15], rotation: r() * 6.28, scale: [1.1, waterH / 3.2, 1.1], color: "#5a4636" });
      items.push({ kind: "root", position: [R * 0.35, 0, R * 0.2], rotation: r() * 6.28, scale: [0.9, waterH / 3.4, 0.9], color: "#4f3d2f" });
      rock(0.2, -R * 0.45, 0.7);
      for (let i = 0; i < 60; i++) {
        const [x, z] = polar(0, R - 0.25);
        blades.push([x, z, r() * 6.28, 0.3 + r() * 0.6, pick(["#5f7d3a", "#6f8f3f", "#55702f"])]);
      }
      decorate(4, 5, 0, 6);
      break;
    }
  }
  return { items, blades };
}

const SCENERY_GEO = new Map<string, THREE.BufferGeometry>();
function sceneryGeometry(kind: SceneryItem["kind"], seed: number) {
  const key = `${kind}-${seed % 3}`;
  if (!SCENERY_GEO.has(key)) {
    const s = 11 + (seed % 3) * 17;
    const g =
      kind === "rock"
        ? rockGeometry(s)
        : kind === "branch"
          ? branchCoralGeometry(s)
          : kind === "boulder"
            ? boulderCoralGeometry(s)
            : kind === "fan"
              ? fanCoralGeometry(s)
              : kind === "anemone"
                ? anemoneGeometry(s)
                : kind === "flower"
                  ? flowerCoralGeometry(s)
                  : kind === "sponge"
                    ? spongeGeometry(s)
                    : kind === "star"
                      ? starfishGeometry(s)
                      : rootGeometry(s);
    SCENERY_GEO.set(key, g);
  }
  return SCENERY_GEO.get(key)!;
}

function Scenery({ t, waterH, water, dimRef }: { t: TankConfig; waterH: number; water: string; dimRef: React.RefObject<number> }) {
  const { items, blades } = useMemo(() => buildScenery(t, waterH), [t, waterH]);
  const mats = useMemo(() => {
    const coral = underwaterMaterial({ color: "#ffffff", roughness: 0.6, side: THREE.DoubleSide }, water, waterH, waterH);
    coral.uniforms.uGlow.value = 0.32;
    const rockM = underwaterMaterial({ color: "#ffffff", roughness: 0.95 }, water, waterH, waterH);
    const sand = underwaterMaterial({ color: t.habitat.scenery === "mangrove" ? "#8d7a5c" : "#cdb88f", roughness: 1 }, water, waterH, waterH);
    const grass = underwaterMaterial({ color: "#ffffff", roughness: 0.8, side: THREE.DoubleSide }, water, waterH, waterH);
    grass.uniforms.uGlow.value = 0.12;
    // Seagrass sway in the vertex shader.
    const prev = grass.material.onBeforeCompile;
    grass.material.onBeforeCompile = (shader, renderer) => {
      prev(shader, renderer);
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float swayK = position.y * position.y;
        transformed.x += sin(uTime * 1.1 + instanceMatrix[3].x * 2.0 + instanceMatrix[3].z) * 0.12 * swayK;
        transformed.z += cos(uTime * 0.9 + instanceMatrix[3].z * 2.0) * 0.06 * swayK;`,
      );
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;");
    };
    grass.material.customProgramCacheKey = () => "aqualink-seagrass";
    return { coral, rockM, sand, grass };
  }, [t, water, waterH]);

  const groups = useMemo(() => {
    const byKey = new Map<string, { geo: THREE.BufferGeometry; items: SceneryItem[]; mat: "coral" | "rockM" }>();
    items.forEach((it, i) => {
      const seed = i;
      const key = `${it.kind}-${seed % 3}`;
      if (!byKey.has(key)) byKey.set(key, { geo: sceneryGeometry(it.kind, seed), items: [], mat: it.kind === "rock" || it.kind === "root" ? "rockM" : "coral" });
      byKey.get(key)!.items.push(it);
    });
    return [...byKey.entries()];
  }, [items]);

  const sandGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(t.radius - 0.03, 40, 0, Math.PI * 2);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, 0.05 * Math.sin(x * 2.1) * Math.cos(z * 1.7) + 0.04);
    }
    g.computeVertexNormals();
    return g;
  }, [t.radius]);

  const bladeGeo = useMemo(() => bladeGeometry(), []);

  useFrame(() => {
    const all = [mats.coral.uniforms, mats.rockM.uniforms, mats.sand.uniforms, mats.grass.uniforms] as UnderwaterUniforms[];
    for (const u of all) {
      u.uTime.value = sceneFx.time * sceneFx.motion;
      u.uDim.value = dimRef.current ?? 0;
    }
  });

  return (
    <group>
      <mesh geometry={sandGeo} material={mats.sand.material} raycast={() => null} />
      {groups.map(([key, g]) => (
        <SceneryInstances key={key} geo={g.geo} items={g.items} material={g.mat === "coral" ? mats.coral.material : mats.rockM.material} />
      ))}
      {blades.length > 0 && <BladeInstances geo={bladeGeo} blades={blades} material={mats.grass.material} />}
    </group>
  );
}

function SceneryInstances({ geo, items, material }: { geo: THREE.BufferGeometry; items: SceneryItem[]; material: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rotation);
      m.compose(new THREE.Vector3(...it.position), q, new THREE.Vector3(...it.scale));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={ref} args={[geo, material, items.length]} raycast={() => null} />;
}

function BladeInstances({ geo, blades, material }: { geo: THREE.BufferGeometry; blades: Blade[]; material: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    blades.forEach(([x, z, rot, h, color, w = 1], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      m.compose(new THREE.Vector3(x, 0.05, z), q, new THREE.Vector3(w, h, 1));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [blades]);
  return <instancedMesh ref={ref} args={[geo, material, blades.length]} raycast={() => null} />;
}

export interface HabitatProps {
  t: TankConfig;
  status: CirculationStatus;
  selected: boolean;
  hovered: boolean;
  /** 0 = normal, 1 = dimmed (not part of the current focus). */
  dim: number;
  showMarine: boolean;
  emphasis: "none" | "warn" | "crit";
}

export function Habitat({ t, status, selected, hovered, dim, showMarine, emphasis }: HabitatProps) {
  const waterH = t.height * 0.965;
  const glassR = t.radius;
  const water = t.habitat.waterTint;
  const dimRef = useRef(0);

  const mats = useMemo(() => {
    const back = waterBackMaterial(water.shallow, water.deep, glassR - 0.03, waterH);
    const front = waterFrontMaterial(water.shallow, water.deep, glassR - 0.04, waterH, t.radius > 4 ? 0.028 : 0.062);
    const surface = waterSurfaceMaterial(water.shallow);
    const glass = glassMaterial();
    const plinth = new THREE.MeshStandardMaterial({ color: "#20252d", roughness: 0.38, metalness: 0.25 });
    const rimMetal = new THREE.MeshStandardMaterial({ color: "#c9ced6", roughness: 0.28, metalness: 0.9 });
    const lightRing = new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#9fe7ff"), emissiveIntensity: 2.2, toneMapped: true });
    const hood = new THREE.MeshStandardMaterial({ color: "#161a20", roughness: 0.55, metalness: 0.4 });
    const particles = particleMaterial("#cfefff", waterH);
    const pool = floorCausticMaterial(water.shallow, glassR + 0.45, glassR + (t.radius > 4 ? 4.2 : 1.9));
    return { back, front, surface, glass, plinth, rimMetal, lightRing, hood, particles, pool };
  }, [water.shallow, water.deep, glassR, waterH, t.radius]);

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats],
  );

  const life = useMemo(() => lifeFor(t), [t]);
  const particleGeo = useMemo(() => {
    const r = rng(t.code.charCodeAt(0) * 53);
    const n = t.radius > 4 ? 420 : 110;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * (t.radius - 0.3);
      pos.set([Math.cos(a) * d, r() * waterH, Math.sin(a) * d], i * 3);
      seed[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [t.code, t.radius, waterH]);
  useEffect(() => () => particleGeo.dispose(), [particleGeo]);
  const kinds = Object.keys(life) as GeoKind[];

  const frontRef = useRef<THREE.Mesh>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const statusColor = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    const k = 1 - Math.exp(-delta * 4);
    dimRef.current += (dim - dimRef.current) * k;
    const time = sceneFx.time;
    mats.back.uniforms.uTime.value = time * sceneFx.motion;
    mats.front.uniforms.uTime.value = time * sceneFx.motion;
    mats.surface.uniforms.uTime.value = time * sceneFx.motion;
    mats.particles.uniforms.uTime.value = time * sceneFx.motion;
    mats.particles.uniforms.uScale.value = state.size.height / 900;
    mats.particles.uniforms.uOpacity.value = 1 - dimRef.current;
    mats.pool.uniforms.uTime.value = time * sceneFx.motion;
    // Floor caustics belong to the solid public building; they fade with the cut-away.
    mats.pool.uniforms.uOpacity.value = (1 - sceneFx.ghost) * (1 - dimRef.current);
    mats.back.uniforms.uDim.value = dimRef.current * 0.8;
    mats.front.uniforms.uOpacity.value = 1 - dimRef.current * 0.3;
    const alertTarget = emphasis === "crit" ? 0.55 + 0.45 * sceneFx.pulse : emphasis === "warn" ? 0.4 : 0;
    mats.back.uniforms.uAlert.value += (alertTarget * (sceneFx.incident > 0.5 ? 1 : 0.6) - mats.back.uniforms.uAlert.value) * k;
    // Camera position in the water volume's local frame (for chord thickness).
    if (frontRef.current) {
      tmp.copy(state.camera.position);
      frontRef.current.worldToLocal(tmp);
      mats.front.uniforms.uCamLocal.value.copy(tmp);
    }
    // Glass rim: selection (cyan), alert (red / amber).
    const rimTarget = selected ? 1 : hovered ? 0.55 : emphasis !== "none" ? 0.5 + 0.5 * sceneFx.pulse : 0;
    const g = mats.glass.uniforms;
    g.uRimStrength.value += (rimTarget - g.uRimStrength.value) * k;
    g.uRim.value.set(selected || hovered ? "#7cc4ff" : emphasis === "crit" ? "#ff4d4d" : emphasis === "warn" ? "#f5a524" : "#7cc4ff");
    g.uOpacity.value = 1 - dimRef.current * 0.4;
    statusColor.set(emphasis === "crit" ? "#ff3b3b" : emphasis === "warn" ? "#f5a524" : "#9fe7ff");
    mats.lightRing.emissive.lerp(statusColor, k);
    mats.lightRing.emissiveIntensity = emphasis === "crit" ? 2 + 2.5 * sceneFx.pulse : 2.2 * (1 - dimRef.current * 0.6);
  });

  const top = t.plinth + t.height;
  const smallTank = t.radius < 4;
  void status;

  return (
    <group position={t.position}>
      {/* Caustic light pool on the floor around the exhibit */}
      <mesh material={mats.pool} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} raycast={() => null}>
        <ringGeometry args={[glassR + 0.45, glassR + (t.radius > 4 ? 4.2 : 1.9), 72, 1]} />
      </mesh>
      {/* Plinth and base light ring */}
      <mesh material={mats.plinth} position={[0, t.plinth / 2, 0]} raycast={() => null}>
        <cylinderGeometry args={[glassR + 0.35, glassR + 0.45, t.plinth, 48]} />
      </mesh>
      <mesh material={mats.lightRing} position={[0, t.plinth + 0.01, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[glassR + 0.2, 0.035, 8, 72]} />
      </mesh>
      <mesh material={mats.rimMetal} position={[0, t.plinth + 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[glassR + 0.02, 0.06, 8, 72]} />
      </mesh>

      {/* Water: interior backdrop, habitat, front haze, surface */}
      <group position={[0, t.plinth, 0]}>
        <mesh material={mats.back} position={[0, waterH / 2, 0]} raycast={() => null}>
          <cylinderGeometry args={[glassR - 0.03, glassR - 0.03, waterH, 64, 1, true]} />
        </mesh>
        <mesh position={[0, waterH * 0.999, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <circleGeometry args={[glassR - 0.03, 48]} />
          <meshBasicMaterial color={water.deep} side={THREE.BackSide} />
        </mesh>
        <Scenery t={t} waterH={waterH} water={water.deep} dimRef={dimRef} />
        <points geometry={particleGeo} material={mats.particles} frustumCulled={false} renderOrder={1} raycast={() => null} />
        {showMarine && kinds.map((k) => <MarineGroup key={k} kind={k} list={life[k]} water={water.deep} dimRef={dimRef} />)}
        <mesh ref={frontRef} material={mats.front} position={[0, waterH / 2, 0]} renderOrder={2} raycast={() => null}>
          <cylinderGeometry args={[glassR - 0.04, glassR - 0.04, waterH, 64, 1, true]} />
        </mesh>
        <mesh material={mats.surface} position={[0, waterH, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3} raycast={() => null}>
          <circleGeometry args={[glassR - 0.04, 48]} />
        </mesh>
      </group>

      {/* Glass shell */}
      <mesh material={mats.glass} position={[0, t.plinth + t.height / 2, 0]} renderOrder={4} raycast={() => null}>
        <cylinderGeometry args={[glassR, glassR, t.height, 72, 1, true]} />
      </mesh>
      <mesh material={mats.rimMetal} position={[0, top, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[glassR + 0.02, smallTank ? 0.07 : 0.1, 8, 72]} />
      </mesh>
      {smallTank && (
        <group position={[0, top + 0.18, 0]}>
          <mesh material={mats.hood} raycast={() => null}>
            <cylinderGeometry args={[glassR + 0.12, glassR + 0.12, 0.34, 48]} />
          </mesh>
          <mesh material={mats.lightRing} position={[0, -0.18, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
            <torusGeometry args={[glassR - 0.25, 0.03, 6, 64]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
