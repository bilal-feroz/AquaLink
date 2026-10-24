"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BUILDING, TANKS } from "@/lib/data/facility";
import { personGeometry, rng } from "./geometry";
import { sceneFx } from "./sceneFx";
import { visitorMaterial } from "./shaders";

const CLOTHES = ["#2b3a55", "#7a2e3b", "#d9d4c7", "#3f5f4a", "#c58b3a", "#1f2328", "#5b6b8c", "#a14d6a", "#e6e1d6", "#355c7d", "#8c6e54", "#406b8f"];
const SKIN = ["#e9c2a6", "#c68e6a", "#8d5a3b", "#f1d0b8", "#a8704e", "#5e3a26"];

interface Spot {
  x: number;
  y: number;
  z: number;
  face: number;
  scale: number;
}

/** Visitor positions on walkways, facing the nearest exhibit. */
function placeVisitors(): Spot[] {
  const r = rng(2024);
  const spots: Spot[] = [];
  const insideTank = (x: number, y: number, z: number, pad: number) =>
    TANKS.some((t) => Math.abs(t.position[1] - y) < 1 && Math.hypot(x - t.position[0], z - t.position[2]) < t.radius + pad);
  const nearestFace = (x: number, y: number, z: number) => {
    let best = TANKS[0];
    let bd = Infinity;
    for (const t of TANKS) {
      const dy = Math.abs(t.position[1] - y) < 1 || t.id === "TNK-A" ? 0 : 50;
      const d = Math.hypot(x - t.position[0], z - t.position[2]) + dy;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return Math.atan2(best.position[0] - x, best.position[2] - z) + (r() - 0.5) * 0.7;
  };
  const add = (x: number, y: number, z: number) => {
    if (insideTank(x, y, z, 0.9)) return;
    const child = r() < 0.16;
    spots.push({ x, y, z, face: nearestFace(x, y, z), scale: child ? 0.62 + r() * 0.1 : 0.92 + r() * 0.16 });
  };

  // L1: crowd around the showcase and the two ground-floor exhibits.
  const A = TANKS[0];
  for (let i = 0; i < 70; i++) {
    const a = -Math.PI * 0.05 + r() * Math.PI * 1.1;
    const d = A.radius + 1.3 + r() * 4.2;
    add(A.position[0] + Math.cos(a) * d, 0, A.position[2] + Math.sin(a) * d);
  }
  for (const t of TANKS.filter((x) => x.floor === "L1" && x.id !== "TNK-A")) {
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2;
      const d = t.radius + 1.0 + r() * 2.2;
      add(t.position[0] + Math.cos(a) * d, 0, t.position[2] + Math.sin(a) * d);
    }
  }
  for (let i = 0; i < 26; i++) add(-20 + r() * 40, 0, 9 + r() * 4.5);

  // Upper galleries: along the rails and around exhibits.
  for (const key of ["L2", "L3"] as const) {
    const d = BUILDING.decks[key];
    const n = key === "L2" ? 34 : 22;
    for (let i = 0; i < n; i++) {
      const side = r();
      if (side < 0.4) add(d.left.maxX - 0.7 - r() * 1.2, d.y, d.back.maxZ + r() * (d.left.maxZ - d.back.maxZ - 0.5));
      else if (side < 0.8) add(d.right.minX + 0.7 + r() * 1.2, d.y, d.back.maxZ + r() * (d.right.maxZ - d.back.maxZ - 0.5));
      else add(d.back.minX + r() * (d.back.maxX - d.back.minX), d.y, d.back.maxZ - 0.7 - r() * 1.2);
    }
    for (const t of TANKS.filter((x) => x.floor === key)) {
      for (let i = 0; i < 10; i++) {
        const a = r() * Math.PI * 2;
        const dd = t.radius + 0.9 + r() * 1.6;
        const x = t.position[0] + Math.cos(a) * dd;
        const z = t.position[2] + Math.sin(a) * dd;
        if (x < BUILDING.minX + 0.6 || x > BUILDING.maxX - 0.6 || z < BUILDING.minZ + 0.6) continue;
        add(x, d.y, z);
      }
    }
  }
  return spots;
}

export function Visitors({ visible }: { visible: boolean }) {
  const spots = useMemo(() => placeVisitors(), []);
  const material = useMemo(() => visitorMaterial(), []);
  const geometry = useMemo(() => {
    const g = personGeometry().clone();
    const r = rng(77);
    const n = spots.length;
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
    return g;
  }, [spots]);
  const ref = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach((s, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.face);
      m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.scale, s.scale, s.scale));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [spots]);

  useEffect(() => {
    TANKS.forEach((t, i) => {
      material.uniforms.uGlowPos.value[i].set(t.position[0], t.position[1] + t.plinth + Math.min(t.height, 6) * 0.5, t.position[2]);
      material.uniforms.uGlowCol.value[i].set(t.habitat.waterTint.shallow).multiplyScalar(t.radius > 4 ? 1.6 : 1.0);
    });
    return () => {
      material.dispose();
      geometry.dispose();
    };
  }, [material, geometry]);

  useFrame(() => {
    material.uniforms.uTime.value = sceneFx.time;
    material.uniforms.uMotion.value = sceneFx.motion;
    if (ref.current) ref.current.visible = visible && sceneFx.ghost < 0.35;
  });

  return <instancedMesh ref={ref} args={[geometry, material, spots.length]} raycast={() => null} />;
}

export const VISITOR_COUNT_NOTE = "Visitor figures are scenery for scale; they are not tracked occupancy data.";
