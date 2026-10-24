/**
 * Label registry shared between the DOM label layer (outside the canvas) and
 * the projector (inside the canvas). Positions are written straight to the DOM
 * each frame, so labels stay anchored without React re-renders.
 */
import * as THREE from "three";

export interface LabelEntry {
  id: string;
  el: HTMLElement;
  anchor: THREE.Vector3;
  priority: number;
  /** Asset that owns the label (excluded from its own occlusion test). */
  ownerId: string;
  /** Opacity multiplier for de-emphasised labels. */
  emphasis: number;
  align: "center" | "bottom";
  maxDistance: number;
}

export const labelRegistry = new Map<string, LabelEntry>();

export function registerLabel(entry: LabelEntry) {
  labelRegistry.set(entry.id, entry);
  entry.el.style.visibility = "hidden";
  entry.el.style.opacity = "0";
}

export function unregisterLabel(id: string, el: HTMLElement) {
  const cur = labelRegistry.get(id);
  if (cur && cur.el === el) labelRegistry.delete(id);
}
