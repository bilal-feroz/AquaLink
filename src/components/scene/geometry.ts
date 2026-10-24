/**
 * Procedural geometry for marine life, scenery and visitors.
 * Everything is generated in code (no external GLB assets), seeded for
 * deterministic layouts, and kept low-poly for instancing.
 */
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ensure geometries share attributes (position, normal, uv, aPart) so they can be merged. */
function prep(g: THREE.BufferGeometry, part: number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (!geo.getAttribute("normal")) geo.computeVertexNormals();
  if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute("position").count * 2), 2));
  const n = geo.getAttribute("position").count;
  geo.setAttribute("aPart", new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  for (const key of Object.keys(geo.attributes)) if (!["position", "normal", "uv", "aPart"].includes(key)) geo.deleteAttribute(key);
  return geo;
}

function merge(list: THREE.BufferGeometry[]) {
  const m = mergeGeometries(list, false);
  if (!m) throw new Error("geometry merge failed");
  m.computeBoundingSphere();
  return m;
}

function tri(points: number[][], part: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
  g.computeVertexNormals();
  return prep(g, part);
}

function body(lenScale: number, height: number, width: number, tailTaper: number, noseTaper: number, seg = 14) {
  const g = new THREE.SphereGeometry(0.5, seg, Math.max(8, Math.round(seg * 0.7)));
  g.rotateZ(Math.PI / 2); // poles along X
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    let k = 1;
    if (x < 0) k = 1 + (x / 0.5) * tailTaper;
    else k = 1 - Math.pow(x / 0.5, 2.2) * noseTaper;
    p.setXYZ(i, x * lenScale, p.getY(i) * height * 2 * k, p.getZ(i) * width * 2 * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Generic reef / schooling fish. Forward is +X, up is +Y. Length ≈ 1. */
export function fishGeometry(kind: "reef" | "slim" | "deep") {
  const dims = kind === "slim" ? { h: 0.16, w: 0.075 } : kind === "deep" ? { h: 0.33, w: 0.07 } : { h: 0.24, w: 0.075 };
  const b = prep(body(1, dims.h, dims.w, 0.55, 0.15), 0);
  const tailH = dims.h * 1.35;
  const tail = tri(
    [
      [-0.44, 0, 0],
      [-0.72, tailH, 0],
      [-0.6, 0, 0],
      [-0.44, 0, 0],
      [-0.6, 0, 0],
      [-0.72, -tailH, 0],
    ],
    1,
  );
  const dorsal = tri(
    [
      [0.12, dims.h * 0.85, 0],
      [-0.28, dims.h * 1.45, 0],
      [-0.32, dims.h * 0.55, 0],
    ],
    1,
  );
  const anal = tri(
    [
      [-0.08, -dims.h * 0.8, 0],
      [-0.3, -dims.h * 1.25, 0],
      [-0.34, -dims.h * 0.45, 0],
    ],
    1,
  );
  return merge([b, tail, dorsal, anal]);
}

export function sharkGeometry() {
  const b = prep(body(1, 0.085, 0.08, 0.82, 0.65, 18), 0);
  const dorsal = tri(
    [
      [0.06, 0.07, 0],
      [-0.1, 0.27, 0],
      [-0.16, 0.06, 0],
    ],
    1,
  );
  const second = tri(
    [
      [-0.3, 0.035, 0],
      [-0.36, 0.09, 0],
      [-0.39, 0.03, 0],
    ],
    1,
  );
  const tailUp = tri(
    [
      [-0.46, 0.0, 0],
      [-0.7, 0.24, 0],
      [-0.58, 0.01, 0],
    ],
    1,
  );
  const tailLow = tri(
    [
      [-0.47, -0.005, 0],
      [-0.58, 0.01, 0],
      [-0.62, -0.13, 0],
    ],
    1,
  );
  const pec = (side: number) =>
    tri(
      [
        [0.16, -0.05, 0.05 * side],
        [-0.04, -0.13, 0.3 * side],
        [0.04, -0.06, 0.07 * side],
      ],
      1,
    );
  return merge([b, dorsal, second, tailUp, tailLow, pec(1), pec(-1)]);
}

/** Ray: flat disc with pointed wing tips along ±Z and a whip tail along −X. */
export function rayGeometry() {
  const g = new THREE.SphereGeometry(0.5, 24, 12);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const zz = z * 2; // -1..1
    const wing = 1 + 0.55 * Math.pow(Math.abs(zz), 3);
    const thick = 0.07 * (1 - Math.pow(Math.abs(zz), 1.5)) + 0.01;
    p.setXYZ(i, x * 0.62 * (1 - 0.35 * Math.abs(zz)) + Math.abs(zz) * -0.08, y * thick * 2, z * 1.05 * wing);
  }
  g.computeVertexNormals();
  const disc = prep(g, 0);
  const tail = new THREE.ConeGeometry(0.018, 0.9, 5);
  tail.rotateZ(Math.PI / 2);
  tail.translate(-0.68, 0, 0);
  return merge([disc, prep(tail, 1)]);
}

export function seahorseGeometry() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.02, 0.36, 0),
    new THREE.Vector3(0.05, 0.24, 0),
    new THREE.Vector3(0.0, 0.08, 0),
    new THREE.Vector3(-0.04, -0.06, 0),
    new THREE.Vector3(-0.01, -0.2, 0),
    new THREE.Vector3(0.06, -0.27, 0),
    new THREE.Vector3(0.1, -0.21, 0),
    new THREE.Vector3(0.06, -0.17, 0),
  ]);
  const tube = new THREE.TubeGeometry(curve, 28, 0.045, 6, false);
  const p = tube.getAttribute("position");
  // Taper the tail.
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < -0.05) {
      const k = 0.55 + 0.45 * Math.max(0, (y + 0.3) / 0.25);
      const c = curve.getPoint(Math.min(1, Math.max(0, (0.36 - y) / 0.63)));
      p.setX(i, c.x + (p.getX(i) - c.x) * k);
      p.setZ(i, p.getZ(i) * k);
    }
  }
  tube.computeVertexNormals();
  const head = new THREE.SphereGeometry(0.06, 10, 8);
  head.translate(0.03, 0.4, 0);
  const snout = new THREE.CylinderGeometry(0.018, 0.026, 0.14, 6);
  snout.rotateZ(Math.PI / 2);
  snout.translate(0.13, 0.39, 0);
  const fin = tri(
    [
      [-0.03, 0.18, 0],
      [-0.1, 0.12, 0],
      [-0.04, 0.05, 0],
    ],
    1,
  );
  return merge([prep(tube, 0), prep(head, 0), prep(snout, 0), fin]);
}

// --- Scenery -------------------------------------------------------------

function displace(g: THREE.BufferGeometry, amount: number, seed: number, flattenBelow = -Infinity) {
  const r = rng(seed);
  const offsets = Array.from({ length: 6 }, () => [r() * 10, r() * 10, r() * 10]);
  const p = g.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n =
      Math.sin(v.x * 3.1 + offsets[0][0]) * Math.sin(v.y * 2.7 + offsets[0][1]) * Math.sin(v.z * 3.3 + offsets[0][2]) +
      0.5 * Math.sin(v.x * 7.3 + offsets[1][0]) * Math.sin(v.y * 6.1 + offsets[1][1]) * Math.sin(v.z * 6.7 + offsets[1][2]);
    v.multiplyScalar(1 + n * amount);
    if (v.y < flattenBelow) v.y = flattenBelow;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function rockGeometry(seed: number) {
  // Weld the polyhedron's vertices so displaced rocks get smooth normals.
  const base = new THREE.IcosahedronGeometry(1, 3);
  base.deleteAttribute("normal");
  base.deleteAttribute("uv");
  const g = mergeVertices(base);
  g.scale(1, 0.62, 0.85);
  displace(g, 0.22, seed, -0.25);
  return prep(g, 0);
}

export function boulderCoralGeometry(seed: number) {
  const g = new THREE.SphereGeometry(0.5, 16, 10);
  g.scale(1, 0.7, 1);
  displace(g, 0.08, seed, -0.05);
  // Brain-coral grooves.
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    const groove = 1 + 0.035 * Math.sin(x * 26 + Math.sin(z * 9) * 3);
    p.setXYZ(i, x * groove, y * groove, z * groove);
  }
  g.computeVertexNormals();
  return prep(g, 0);
}

export function branchCoralGeometry(seed: number) {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const branches = 6 + Math.floor(r() * 4);
  for (let i = 0; i < branches; i++) {
    const len = 0.45 + r() * 0.45;
    const c = new THREE.CylinderGeometry(0.022, 0.05, len, 6);
    c.translate(0, len / 2, 0);
    const tilt = 0.15 + r() * 0.6;
    c.rotateZ(tilt);
    c.rotateY(r() * Math.PI * 2);
    parts.push(prep(c, 0));
    // A forked sub-branch from mid height.
    const len2 = len * 0.55;
    const c2 = new THREE.CylinderGeometry(0.016, 0.03, len2, 5);
    c2.translate(0, len2 / 2, 0);
    c2.rotateZ(tilt + 0.5 + r() * 0.3);
    const tip = new THREE.Vector3(0, len * 0.55, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
    c2.rotateY(r() * Math.PI * 2);
    c2.translate(tip.x * 0.6, tip.y, tip.z * 0.6);
    parts.push(prep(c2, 0));
  }
  return merge(parts);
}

export function fanCoralGeometry(seed: number) {
  const r = rng(seed);
  const g = new THREE.CircleGeometry(0.55, 18, 0, Math.PI);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const d = Math.hypot(x, y);
    const k = d > 0.3 ? 1 + (r() - 0.5) * 0.18 : 1;
    p.setXYZ(i, x * k, y * k, Math.sin(x * 6) * 0.04);
  }
  g.computeVertexNormals();
  const stem = new THREE.CylinderGeometry(0.02, 0.035, 0.18, 5);
  stem.translate(0, -0.05, 0);
  return merge([prep(g, 0), prep(stem, 1)]);
}

export function anemoneGeometry(seed: number) {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.CylinderGeometry(0.2, 0.26, 0.16, 12);
  base.translate(0, 0.08, 0);
  parts.push(prep(base, 1));
  const count = 46;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + r() * 0.2;
    const ring = 0.04 + r() * 0.17;
    const len = 0.18 + r() * 0.14;
    const t = new THREE.ConeGeometry(0.022, len, 4);
    t.translate(0, len / 2, 0);
    t.rotateZ(0.3 + ring * 2.2);
    t.rotateY(-a);
    t.translate(Math.cos(a) * ring, 0.15, Math.sin(a) * ring);
    parts.push(prep(t, 0));
  }
  return merge(parts);
}

export function bladeGeometry() {
  const g = new THREE.PlaneGeometry(0.07, 1, 1, 6);
  g.translate(0, 0.5, 0);
  return prep(g, 0);
}

export function rootGeometry(seed: number) {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.4;
    const spread = 0.7 + r() * 0.5;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.6, 0),
      new THREE.Vector3(Math.cos(a) * spread * 0.4, 1.0, Math.sin(a) * spread * 0.4),
      new THREE.Vector3(Math.cos(a) * spread * 0.85, 0.35, Math.sin(a) * spread * 0.85),
      new THREE.Vector3(Math.cos(a) * spread, -0.02, Math.sin(a) * spread),
    ]);
    parts.push(prep(new THREE.TubeGeometry(curve, 14, 0.045 + r() * 0.02, 5, false), 0));
  }
  const trunk = new THREE.CylinderGeometry(0.09, 0.13, 1.4, 7);
  trunk.translate(0, 2.3, 0);
  parts.push(prep(trunk, 0));
  return merge(parts);
}

// --- Visitors ----------------------------------------------------------

/** A simple standing person, ≈1.75 m tall. aPart: 0 legs, 1 clothing, 2 skin, 3 hair. */
export function personGeometry() {
  const legL = new THREE.CylinderGeometry(0.075, 0.065, 0.86, 6);
  legL.translate(-0.095, 0.43, 0);
  const legR = legL.clone();
  legR.translate(0.19, 0, 0);
  const torso = new THREE.CapsuleGeometry(0.19, 0.42, 4, 8);
  torso.scale(1, 1, 0.68);
  torso.translate(0, 1.18, 0);
  const head = new THREE.SphereGeometry(0.115, 10, 8);
  head.translate(0, 1.6, 0);
  const hair = new THREE.SphereGeometry(0.122, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  hair.translate(0, 1.615, -0.008);
  return merge([prep(legL, 0), prep(legR, 0), prep(torso, 1), prep(head, 2), prep(hair, 3)]);
}

export function treeGeometry(seed: number) {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.08, 0.13, 2.6, 7);
  trunk.translate(0, 1.3, 0);
  parts.push(prep(trunk, 1));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.3;
    const leaf = new THREE.ConeGeometry(0.22, 1.4, 4);
    leaf.scale(1, 1, 0.25);
    leaf.translate(0, 0.7, 0);
    leaf.rotateZ(1.1 + r() * 0.5);
    leaf.rotateY(-a);
    leaf.translate(0, 2.55, 0);
    parts.push(prep(leaf, 0));
  }
  return merge(parts);
}
