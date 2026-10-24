"use client";

import { CameraControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { BUILDING, TANKS } from "@/lib/data/facility";
import { ASSET_BY_ID, TANK_BY_ID } from "@/lib/topology/graph";
import { effectiveReducedMotion, useAppStore } from "@/store/useAppStore";
import { CAMERA_PRESETS, LEVEL_PRESETS, type CameraPreset } from "./sceneFx";

const BOUNDS = new THREE.Box3(new THREE.Vector3(-27, -6.5, -19), new THREE.Vector3(27, 19, 24));

/** Camera framing for focusing one asset. */
function focusPreset(id: string, camera: THREE.Camera): CameraPreset | null {
  const a = ASSET_BY_ID[id];
  if (!a) return null;
  let target = new THREE.Vector3(...a.position);
  let dist = 7;
  if (a.kind === "tank") {
    const t = TANK_BY_ID[id];
    target = new THREE.Vector3(t.position[0], t.position[1] + t.plinth + Math.min(t.height, 7) * 0.5, t.position[2]);
    dist = t.radius * 3.2 + 4;
  } else if (a.kind === "pump") {
    target.y += 1;
    dist = 8.5;
  } else if (a.kind === "filter") {
    target.y += 1.8;
    dist = 9;
  } else if (a.kind === "pipe") {
    dist = 10;
  } else {
    dist = 5;
  }
  // Preferred direction: towards the open atrium for exhibits, the current view otherwise.
  const base =
    a.kind === "tank"
      ? new THREE.Vector3(-target.x * 0.5, 0, 12 - target.z).normalize()
      : camera.position.clone().sub(target).setY(0).normalize();
  const candidates: { d: THREE.Vector3; dist: number }[] = [];
  for (const scale of [1, 0.8, 0.62])
    for (const yaw of [0, -0.45, 0.45, -0.9, 0.9, -1.4, 1.4])
      for (const pitch of [0.3, 0.16, 0.5, 0.04]) {
        const d = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        d.y = pitch;
        candidates.push({ d: d.normalize(), dist: dist * scale });
      }
  const pick = candidates.find((c) => clearLine(target, c.d, c.dist, id)) ?? candidates[0];
  const pos = target.clone().addScaledVector(pick.d, pick.dist);
  return { position: pos.toArray() as CameraPreset["position"], target: target.toArray() as CameraPreset["target"] };
}

/** True if the camera line from target along dir is free of columns, shafts and walls. */
function clearLine(target: THREE.Vector3, dir: THREE.Vector3, dist: number, ownId: string) {
  const p = new THREE.Vector3();
  for (let s = 1.5; s <= dist + 0.5; s += 0.5) {
    p.copy(target).addScaledVector(dir, s);
    if (p.x < BUILDING.minX + 0.6 || p.x > BUILDING.maxX - 0.6 || p.z < BUILDING.minZ + 0.6) return false;
    if (p.y > BUILDING.roof - 0.8 || p.y < 0.6) return false;
    for (const key of ["L2", "L3"] as const) {
      const d = BUILDING.decks[key];
      if (Math.abs(p.y - (d.y - 0.22)) > 0.7) continue;
      for (const r of [d.left, d.right, d.back]) if (p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ) return false;
    }
    for (const [cx, cz] of BUILDING.columns) if (Math.hypot(p.x - cx, p.z - cz) < BUILDING.columnRadius + 0.9) return false;
    for (const sh of BUILDING.shafts) if (p.x > sh.minX - 0.6 && p.x < sh.maxX + 0.6 && p.z > sh.minZ - 0.6 && p.z < sh.maxZ + 0.6 && p.y < sh.top + 0.5) return false;
    for (const t of TANKS) {
      if (t.id === ownId) continue;
      if (p.y < t.position[1] - 0.3 || p.y > t.position[1] + t.plinth + t.height + 0.5) continue;
      if (Math.hypot(p.x - t.position[0], p.z - t.position[2]) < t.radius + 0.6) return false;
    }
  }
  return true;
}

export function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const camera = useThree((s) => s.camera);
  const mode = useAppStore((s) => s.mode);
  const level = useAppStore((s) => s.level);
  const nonce = useAppStore((s) => s.cameraNonce);
  const reduced = useAppStore(effectiveReducedMotion);
  const first = useRef(true);
  const lastDist = useRef(40);

  const size = useThree((s) => s.size);
  const go = (p: CameraPreset, smooth = true, frame = false) => {
    const c = ref.current;
    if (!c) return;
    let pos = p.position;
    if (frame) {
      // Presets are composed for a wide viewer; pull back on narrower ones so the
      // whole facility stays in frame.
      const aspect = size.width / Math.max(1, size.height);
      const k = Math.min(1.6, Math.max(1, 1.62 / aspect));
      pos = [p.target[0] + (pos[0] - p.target[0]) * k, p.target[1] + (pos[1] - p.target[1]) * k, p.target[2] + (pos[2] - p.target[2]) * k];
    }
    lastDist.current = Math.hypot(pos[0] - p.target[0], pos[1] - p.target[1], pos[2] - p.target[2]);
    void c.setLookAt(...pos, ...p.target, smooth && !reduced);
  };

  // Mode / level / reset transitions.
  useEffect(() => {
    const p = level ? LEVEL_PRESETS[level] : CAMERA_PRESETS[mode];
    go(p, !first.current, !level);
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, level, nonce]);

  // Keep the framed content above the incident timeline card: shift the view
  // centre up by moving the camera down in screen space.
  const timeline = useAppStore((s) => s.mode === "incident" && s.showTimeline && s.sim.incidents.length > 0 && !s.textView);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dist = lastDist.current;
    const visible = 2 * dist * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360);
    void c.setFocalOffset(0, timeline ? visible * 0.135 : 0, 0, !reduced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, mode, level, nonce]);

  // Focus requests (double-click, focus button, keyboard).
  useEffect(() => {
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const p = focusPreset(id, camera);
      if (p) go(p);
    };
    const onZoom = (e: Event) => {
      const d = (e as CustomEvent<number>).detail;
      void ref.current?.dolly(d, !reduced);
    };
    window.addEventListener("aqualink:focus", onFocus);
    window.addEventListener("aqualink:zoom", onZoom);
    return () => {
      window.removeEventListener("aqualink:focus", onFocus);
      window.removeEventListener("aqualink:zoom", onZoom);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, reduced]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.setBoundary(BOUNDS);
    c.boundaryFriction = 0.2;
    c.minDistance = 3;
    c.maxDistance = 70;
    c.smoothTime = 0.55;
    c.draggingSmoothTime = 0.12;
    c.dollySpeed = 0.6;
    c.truckSpeed = 1.4;
  }, []);

  // Keep the camera out of tank volumes and inside the building envelope.
  const tmp = useRef(new THREE.Vector3());
  useFrame(() => {
    const c = ref.current;
    if (!c) return;
    c.maxPolarAngle = mode === "public" ? Math.PI * 0.53 : Math.PI * 0.62;
    const p = camera.position;
    for (const t of TANKS) {
      const top = t.position[1] + t.plinth + t.height + 0.4;
      const bottom = t.position[1] - 0.2;
      if (p.y < bottom || p.y > top) continue;
      const dx = p.x - t.position[0];
      const dz = p.z - t.position[2];
      const d = Math.hypot(dx, dz);
      const min = t.radius + 0.8;
      if (d < min) {
        const k = min / Math.max(d, 0.001);
        tmp.current.set(t.position[0] + dx * k, p.y, t.position[2] + dz * k);
        c.setPosition(tmp.current.x, tmp.current.y, tmp.current.z, false);
      }
    }
    if (p.y < -5.6) c.setPosition(p.x, -5.6, p.z, false);
    if (p.y > 30) c.setPosition(p.x, 30, p.z, false);
  });

  return <CameraControls ref={ref} makeDefault />;
}
