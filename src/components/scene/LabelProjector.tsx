"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { BUILDING, TANKS } from "@/lib/data/facility";
import { labelRegistry } from "./labels";
import { sceneFx } from "./sceneFx";

interface Occluder {
  mesh: THREE.Mesh;
  ownerId?: string;
  /** Only occludes while the architecture is solid (public view). */
  architectural: boolean;
}

/**
 * Projects registered DOM labels onto the canvas every frame, hides labels that
 * are behind the camera, off-screen, occluded or overlapping a higher-priority
 * label. Occlusion and de-cluttering run every few frames.
 */
export function LabelProjector() {
  const { camera, size } = useThree();
  const frame = useRef(0);
  const visibleState = useRef(new Map<string, boolean>());
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);

  const occluders = useMemo<Occluder[]>(() => {
    const list: Occluder[] = [];
    const box = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ));
      m.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
      m.updateMatrixWorld(true);
      list.push({ mesh: m, architectural: true });
    };
    box(BUILDING.minX, -BUILDING.slab, BUILDING.minZ, BUILDING.maxX, 0, BUILDING.maxZ);
    for (const key of ["L2", "L3"] as const) {
      const d = BUILDING.decks[key];
      for (const p of [d.left, d.right, d.back]) box(p.minX, d.y - 0.45, p.minZ, p.maxX, d.y, p.maxZ);
    }
    for (const t of TANKS) {
      // Only the opaque core of a habitat hides labels behind it.
      const m = new THREE.Mesh(new THREE.CylinderGeometry(t.radius * 0.75, t.radius * 0.75, t.height, 16));
      m.position.set(t.position[0], t.position[1] + t.plinth + t.height / 2, t.position[2]);
      m.updateMatrixWorld(true);
      list.push({ mesh: m, ownerId: t.id, architectural: false });
    }
    return list;
  }, []);

  useFrame(() => {
    frame.current += 1;
    const w = size.width;
    const h = size.height;
    const heavy = frame.current % 3 === 0;
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const entries = [...labelRegistry.values()].sort((a, b) => b.priority - a.priority);
    const solidArchitecture = sceneFx.ghost < 0.3 && sceneFx.shellVisible > 0.5;

    for (const e of entries) {
      v.copy(e.anchor).project(camera);
      const behind = v.z > 1 || v.z < -1;
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      const dist = camera.position.distanceTo(e.anchor);
      let show = !behind && x > -40 && x < w + 40 && y > -20 && y < h + 40 && dist < e.maxDistance;

      const ew = e.el.offsetWidth;
      const eh = e.el.offsetHeight;
      const left = x - ew / 2;
      const top = e.align === "center" ? y - eh / 2 : y - eh;

      if (show && heavy) {
        // Occlusion test against solid geometry between camera and anchor.
        dir.copy(e.anchor).sub(camera.position);
        const len = dir.length();
        dir.normalize();
        raycaster.set(camera.position, dir);
        raycaster.far = len - 0.4;
        // Engineering views are x-ray: only the solid public building occludes.
        for (const o of solidArchitecture ? occluders : []) {
          if (o.ownerId === e.ownerId) continue;
          if (raycaster.intersectObject(o.mesh, false).length) {
            show = false;
            break;
          }
        }
        visibleState.current.set(e.id, show);
      } else if (show) {
        show = visibleState.current.get(e.id) ?? show;
      }

      if (show) {
        // De-clutter: skip if overlapping a higher-priority label.
        const rect = { x0: left, y0: top, x1: left + ew, y1: top + eh };
        const overlap = placed.some((p) => {
          const ox = Math.min(p.x1, rect.x1) - Math.max(p.x0, rect.x0);
          const oy = Math.min(p.y1, rect.y1) - Math.max(p.y0, rect.y0);
          return ox > 6 && oy > 4 && ox * oy > ew * eh * 0.18;
        });
        if (overlap && e.priority < 90) show = false;
        else placed.push(rect);
      }

      const s = e.el.style;
      s.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
      if (show) {
        s.visibility = "visible";
        s.opacity = String(e.emphasis);
        s.pointerEvents = "auto";
      } else {
        s.opacity = "0";
        s.pointerEvents = "none";
        s.visibility = "hidden";
      }
    }
  });

  return null;
}
