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

/** A cluster of soft-coral "flowers": short stalks, a ring of rounded petals and a centre. */
export function flowerCoralGeometry(seed: number) {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const blooms = 3 + Math.floor(r() * 4);
  for (let b = 0; b < blooms; b++) {
    const a = r() * Math.PI * 2;
    const d = b === 0 ? 0 : 0.1 + r() * 0.2;
    const h = 0.08 + r() * 0.28;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const stalk = new THREE.CylinderGeometry(0.018, 0.03, h, 6);
    stalk.translate(x, h / 2, z);
    parts.push(prep(stalk, 1));
    const petals = 7 + Math.floor(r() * 5);
    const size = 0.055 + r() * 0.04;
    const open = 0.5 + r() * 0.5;
    for (let i = 0; i < petals; i++) {
      const pa = (i / petals) * Math.PI * 2;
      const petal = new THREE.SphereGeometry(size, 7, 5);
      petal.scale(1.7, 0.35, 0.8);
      petal.translate(size * 1.4, 0, 0);
      petal.rotateZ(open);
      petal.rotateY(-pa);
      petal.translate(x, h, z);
      parts.push(prep(petal, 0));
    }
    const centre = new THREE.SphereGeometry(size * 0.75, 8, 6);
    centre.translate(x, h + size * 0.3, z);
    parts.push(prep(centre, 2));
  }
  return merge(parts);
}

/** Tube sponges: a few open-topped tubes of different heights with a lip at the top. */
export function spongeGeometry(seed: number) {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const tubes = 3 + Math.floor(r() * 3);
  for (let i = 0; i < tubes; i++) {
    const a = (i / tubes) * Math.PI * 2 + r() * 0.6;
    const d = i === 0 ? 0 : 0.09 + r() * 0.08;
    const h = 0.25 + r() * 0.5;
    const rad = 0.05 + r() * 0.035;
    const tube = new THREE.CylinderGeometry(rad * 1.15, rad, h, 12, 4, true);
    tube.translate(0, h / 2, 0);
    tube.rotateZ((r() - 0.5) * 0.35);
    tube.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(prep(tube, 0));
    const lip = new THREE.TorusGeometry(rad * 1.15, rad * 0.22, 6, 14);
    lip.rotateX(Math.PI / 2);
    lip.translate(0, h, 0);
    lip.rotateZ((r() - 0.5) * 0.35);
    lip.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(prep(lip, 0));
  }
  return merge(parts);
}

/** A five-armed starfish lying on the sand. */
export function starfishGeometry(seed: number) {
  const r = rng(seed);
  const shape = new THREE.Shape();
  const outer = 0.17;
  const inner = 0.065;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rad = i % 2 === 0 ? outer * (0.9 + r() * 0.2) : inner;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.022, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.03, 0);
  return prep(g, 0);
}

/** Jellyfish lantern: domed bell (part 0), trailing tentacles (part 1) and frilly oral arms (part 2). Rim at y = 0. */
export function jellyGeometry() {
  const r = rng(404);
  const parts: THREE.BufferGeometry[] = [];
  const bell = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  bell.scale(1, 0.72, 1);
  parts.push(prep(bell, 0));
  const skirt = new THREE.CylinderGeometry(1, 0.9, 0.16, 28, 1, true);
  skirt.translate(0, -0.08, 0);
  parts.push(prep(skirt, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + r() * 0.2;
    const len = 1.8 + r() * 1.2;
    const t = new THREE.PlaneGeometry(0.035, len, 1, 10);
    t.translate(0, -len / 2, 0);
    t.rotateY(-a + Math.PI / 2);
    t.translate(Math.cos(a) * 0.86, -0.1, Math.sin(a) * 0.86);
    parts.push(prep(t, 1));
  }
  for (let i = 0; i < 4; i++) {
    const len = 1.2 + r() * 0.5;
    const arm = new THREE.PlaneGeometry(0.2, len, 1, 10);
    arm.translate(0, -len / 2, 0);
    arm.rotateY((i / 4) * Math.PI);
    arm.translate(0, -0.05, 0);
    parts.push(prep(arm, 2));
  }
  return merge(parts);
}

/** Rounded leafy bush made of overlapping blobs, sitting on y = 0. */
export function bushGeometry(seed: number) {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const s = 0.35 + r() * 0.3;
    const blob = new THREE.IcosahedronGeometry(s, 1);
    const a = r() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.25 + r() * 0.2;
    blob.translate(Math.cos(a) * d, s * 0.8 + (i === 0 ? 0.25 : r() * 0.3), Math.sin(a) * d);
    parts.push(prep(blob, 0));
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
