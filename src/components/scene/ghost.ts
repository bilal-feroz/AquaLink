/**
 * Architectural "ghosting" and camera-aware cut-away.
 *
 * - Materials fade from their public opacity to a cut-away opacity as
 *   sceneFx.ghost goes 0 → 1 (Operations view), and disappear when the
 *   architectural shell layer is switched off.
 * - Envelope walls also fade whenever the camera is on their outside, so
 *   orbiting round the building always reveals the inside instead of a wall.
 */
import * as THREE from "three";
import { sceneFx } from "./sceneFx";

export interface Cutaway {
  /** Outward normal of the wall. */
  normal: THREE.Vector3;
  /** Camera is "outside" when normal · camera > offset. */
  offset: number;
  /** Opacity while the camera is outside. */
  min: number;
}

interface GhostEntry {
  mat: THREE.Material & { opacity: number };
  base: number;
  ghost: number;
  alwaysTransparent: boolean;
  engineeringOnly: boolean;
  publicOnly: boolean;
  cutaway?: Cutaway;
  cut: number;
}

const registry = new Set<GhostEntry>();

export function ghostMaterial<T extends THREE.Material>(
  mat: T,
  opts: { ghost: number; base?: number; alwaysTransparent?: boolean; engineeringOnly?: boolean; publicOnly?: boolean; cutaway?: Cutaway },
): T {
  const entry: GhostEntry = {
    mat: mat as unknown as GhostEntry["mat"],
    base: opts.base ?? 1,
    ghost: opts.ghost,
    alwaysTransparent: !!opts.alwaysTransparent,
    engineeringOnly: !!opts.engineeringOnly,
    publicOnly: !!opts.publicOnly,
    cutaway: opts.cutaway,
    cut: 0,
  };
  if (entry.alwaysTransparent) {
    mat.transparent = true;
    mat.depthWrite = false;
  }
  registry.add(entry);
  return mat;
}

export function releaseGhost(mat: THREE.Material) {
  for (const e of registry) if (e.mat === mat) registry.delete(e);
}

export const WALLS = {
  back: { normal: new THREE.Vector3(0, 0, -1), offset: 16.2, min: 0.1 },
  left: { normal: new THREE.Vector3(-1, 0, 0), offset: 24, min: 0.06 },
  right: { normal: new THREE.Vector3(1, 0, 0), offset: 24, min: 0.06 },
  rear: { normal: new THREE.Vector3(0, 0, -1), offset: 37, min: 0.06 },
  roof: { normal: new THREE.Vector3(0, 1, 0), offset: 18.6, min: 0.0 },
} satisfies Record<string, Cutaway>;

export function updateGhosts(camera: THREE.Camera, dt: number) {
  const g = sceneFx.ghost;
  const shell = sceneFx.shellVisible;
  const k = 1 - Math.exp(-dt * 6);
  for (const e of registry) {
    let target = (e.engineeringOnly ? e.ghost * g : e.base + (e.ghost - e.base) * g) * shell;
    if (e.publicOnly) target *= 1 - g;
    if (e.cutaway) {
      const outside = e.cutaway.normal.dot(camera.position) > e.cutaway.offset ? 1 : 0;
      e.cut += (outside - e.cut) * k;
      target = target * (1 - e.cut) + Math.min(target, e.cutaway.min) * e.cut;
    }
    e.mat.opacity = target;
    const transparent = e.alwaysTransparent || target < 0.995;
    if (e.mat.transparent !== transparent) {
      e.mat.transparent = transparent;
      e.mat.depthWrite = !transparent;
      e.mat.needsUpdate = true;
    }
    e.mat.visible = target > 0.004;
  }
}
