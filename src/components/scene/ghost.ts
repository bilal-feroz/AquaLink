/**
 * Architectural "ghosting": materials registered here fade from their public
 * opacity to a cut-away opacity as sceneFx.ghost goes 0 → 1, and disappear
 * entirely when the architectural shell layer is switched off.
 */
import * as THREE from "three";
import { sceneFx } from "./sceneFx";

interface GhostEntry {
  mat: THREE.Material & { opacity: number };
  /** Opacity in the public view. */
  base: number;
  /** Opacity in engineering (cut-away) views. */
  ghost: number;
  /** Material is transparent even when fully visible (e.g. glass). */
  alwaysTransparent: boolean;
  /** Inverse: only visible in engineering views (e.g. blueprint edges, plant room). */
  engineeringOnly: boolean;
}

const registry = new Set<GhostEntry>();

export function ghostMaterial<T extends THREE.Material>(mat: T, opts: { ghost: number; base?: number; alwaysTransparent?: boolean; engineeringOnly?: boolean }): T {
  const entry: GhostEntry = {
    mat: mat as unknown as GhostEntry["mat"],
    base: opts.base ?? 1,
    ghost: opts.ghost,
    alwaysTransparent: !!opts.alwaysTransparent,
    engineeringOnly: !!opts.engineeringOnly,
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

export function updateGhosts() {
  const g = sceneFx.ghost;
  const shell = sceneFx.shellVisible;
  for (const e of registry) {
    const target = (e.engineeringOnly ? e.ghost * g : e.base + (e.ghost - e.base) * g) * shell;
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
