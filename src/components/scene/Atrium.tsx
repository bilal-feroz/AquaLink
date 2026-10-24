"use client";

/**
 * Visitor-side dressing of the public atrium: jellyfish lanterns floating in the
 * void, a holographic manta circling over the entrance, benches and info kiosks
 * at each habitat, planters and vines trailing from the gallery decks.
 * Scenery only — none of it is part of the life-support model, and it fades
 * out with the building shell in the Operations view.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BUILDING, TANKS } from "@/lib/data/facility";
import type { TankConfig } from "@/lib/types";
import { bushGeometry, jellyGeometry, rayGeometry, rng } from "./geometry";
import { sceneFx } from "./sceneFx";

// ---------------------------------------------------------------------------
// Layout

interface Spot {
  x: number;
  y: number;
  z: number;
  /** Yaw so the item faces its habitat (benches) or the visitor (kiosks). */
  yaw: number;
}

/** Keep a point on the gallery deck the habitat stands on. */
function onDeck(t: TankConfig, x: number, z: number): [number, number] {
  if (t.floor === "L1") return [x, z];
  const d = BUILDING.decks[t.floor as "L2" | "L3"];
  const side = t.position[0] < 0 ? d.left : d.right;
  return [Math.min(side.maxX - 0.8, Math.max(side.minX + 0.8, x)), Math.min(side.maxZ - 0.7, Math.max(side.minZ + 0.8, z))];
}

/** Direction from a habitat towards the open atrium, where visitors stand. */
function towardsVisitors(t: TankConfig) {
  if (t.id === "TNK-A") return new THREE.Vector2(0, 1);
  return new THREE.Vector2(-t.position[0] * 0.5, 10 - t.position[2]).normalize();
}

function benchSpots(): Spot[] {
  const out: Spot[] = [];
  const A = TANKS[0];
  // A ring of benches facing the Open Ocean showcase.
  for (const deg of [-48, -20, 20, 48]) {
    const a = (deg * Math.PI) / 180;
    const x = A.position[0] + Math.sin(a) * 9.6;
    const z = A.position[2] + Math.cos(a) * 9.6;
    out.push({ x, y: 0, z, yaw: Math.atan2(A.position[0] - x, A.position[2] - z) });
  }
  for (const t of TANKS.slice(1)) {
    const dir = towardsVisitors(t);
    const [x, z] = onDeck(t, t.position[0] + dir.x * (t.radius + 2.4), t.position[2] + dir.y * (t.radius + 2.4));
    out.push({ x, y: t.position[1], z, yaw: Math.atan2(t.position[0] - x, t.position[2] - z) });
  }
  return out;
}

function kioskSpots(): Spot[] {
  return TANKS.map((t) => {
    const dir = towardsVisitors(t).rotateAround(new THREE.Vector2(), t.id === "TNK-A" ? 0.62 : 0.7);
    const d = t.radius + (t.id === "TNK-A" ? 1.9 : 1.3);
    const [x, z] = onDeck(t, t.position[0] + dir.x * d, t.position[2] + dir.y * d);
    // The screen faces away from the glass, towards whoever is reading it.
    return { x, y: t.position[1], z, yaw: Math.atan2(x - t.position[0], z - t.position[2]) };
  });
}

const PLANTER_SPOTS: [number, number, number][] = [
  [-22.2, 0, 1.5],
  [22.2, 0, 1.5],
  [-16, 0, 18],
  [16, 0, 18],
  [-9, 0, 24.5],
  [9, 0, 24.5],
  [-22.2, 6, -9],
  [22.2, 6, -9],
];

const BENCHES = benchSpots();
const KIOSKS = kioskSpots();

/** Circles visitors steer around (x, z, radius, floor y). */
export const ATRIUM_OBSTACLES = [
  ...BENCHES.map((b) => ({ x: b.x, z: b.z, r: 1.15, y: b.y })),
  ...KIOSKS.map((k) => ({ x: k.x, z: k.z, r: 0.5, y: k.y })),
  ...PLANTER_SPOTS.map(([x, y, z]) => ({ x, z, r: 1.0, y })),
];

// ---------------------------------------------------------------------------
// Jellyfish lanterns

const JELLY_COLORS = ["#ff6fd8", "#a78bfa", "#5ee7ff", "#7dffd4", "#ffcf6b", "#ff8fa3"];

function jellySpots() {
  const r = rng(77);
  const A = TANKS[0];
  const out: { pos: [number, number, number]; s: number; color: string }[] = [];
  // Around the sides and back of the Open Ocean showcase, so the glass stays clear from the gallery.
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.9 + (i / 8) * 1.2) + r() * 0.15;
    out.push({ pos: [A.position[0] + Math.cos(a) * (7.4 + r() * 0.6), 10.5 + r() * 5.5, A.position[2] + Math.sin(a) * (7.4 + r() * 0.6)], s: 0.55 + r() * 0.35, color: JELLY_COLORS[i % JELLY_COLORS.length] });
  }
  // High over the front of the atrium, just under the roof.
  for (let i = 0; i < 7; i++) {
    const side = i % 2 ? 1 : -1;
    out.push({ pos: [side * (5.5 + r() * 8), 13 + r() * 3.5, 3.5 + r() * 9], s: 0.6 + r() * 0.4, color: JELLY_COLORS[(i + 3) % JELLY_COLORS.length] });
  }
  return out;
}

function JellyLanterns() {
  const spots = useMemo(() => jellySpots(), []);
  const geometry = useMemo(() => {
    const g = jellyGeometry();
    const col = new Float32Array(spots.length * 3);
    const phase = new Float32Array(spots.length);
    const c = new THREE.Color();
    spots.forEach((s, i) => {
      col.set(c.set(s.color).toArray(), i * 3);
      phase[i] = (i * 0.618) % 1;
    });
    g.setAttribute("aCol", new THREE.InstancedBufferAttribute(col, 3));
    g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
    return g;
  }, [spots]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uMotion: { value: 1 }, uOpacity: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aPart; attribute vec3 aCol; attribute float aPhase;
          uniform float uTime; uniform float uMotion;
          varying float vPart; varying vec3 vCol; varying vec3 vN; varying vec3 vW; varying float vY;
          void main() {
            vec3 p = position;
            float t = uTime * uMotion + aPhase * 10.0;
            float pulse = sin(t * 1.6);
            if (aPart < 0.5) {
              // The bell contracts at the rim with each pulse.
              float rim = 1.0 - clamp(p.y / 0.72, 0.0, 1.0);
              p.xz *= 1.0 + 0.09 * pulse * rim;
              p.y *= 1.0 - 0.06 * pulse;
            } else {
              float d = -p.y;
              p.x += sin(t * 1.3 + d * 2.2) * 0.12 * d;
              p.z += cos(t * 1.1 + d * 1.9) * 0.1 * d;
            }
            vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
            w.y += sin(uTime * uMotion * 0.45 + aPhase * 6.28) * 0.35;
            vW = w.xyz;
            vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
            vPart = aPart; vCol = aCol; vY = position.y;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity;
          varying float vPart; varying vec3 vCol; varying vec3 vN; varying vec3 vW; varying float vY;
          void main() {
            vec3 V = normalize(cameraPosition - vW);
            float fres = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
            float a; vec3 c;
            if (vPart < 0.5) {
              a = 0.16 + 0.6 * fres;
              c = vCol * (0.7 + 1.5 * fres) + vec3(1.0) * fres * 0.3;
            } else if (vPart < 1.5) {
              a = 0.5 * clamp(1.0 + vY / 2.8, 0.0, 1.0);
              c = vCol * 1.3;
            } else {
              a = 0.38 * clamp(1.0 + vY / 1.7, 0.0, 1.0);
              c = mix(vCol, vec3(1.0), 0.35);
            }
            gl_FragColor = vec4(c, a * uOpacity);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  );
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach((s, i) => {
      q.setFromEuler(new THREE.Euler((i % 3) * 0.06, i * 0.7, 0));
      mesh.setMatrixAt(i, m.compose(new THREE.Vector3(...s.pos), q, new THREE.Vector3(s.s, s.s, s.s)));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [spots]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame(() => {
    material.uniforms.uTime.value = sceneFx.time;
    material.uniforms.uMotion.value = sceneFx.motion;
    material.uniforms.uOpacity.value = 1 - sceneFx.ghost;
  });
  return <instancedMesh ref={ref} args={[geometry, material, spots.length]} frustumCulled={false} renderOrder={7} raycast={() => null} />;
}

// ---------------------------------------------------------------------------
// Holographic manta circling over the entrance

function HoloManta() {
  const geometry = useMemo(() => rayGeometry(), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uMotion: { value: 1 }, uOpacity: { value: 1 } },
        vertexShader: /* glsl */ `
          uniform float uTime; uniform float uMotion;
          varying vec3 vN; varying vec3 vW;
          void main() {
            vec3 p = position;
            float span = abs(p.z);
            p.y += sin(uTime * uMotion * 1.1 - span * 2.2) * 0.22 * pow(span, 1.4);
            vec4 w = modelMatrix * vec4(p, 1.0);
            vW = w.xyz;
            vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uOpacity;
          varying vec3 vN; varying vec3 vW;
          void main() {
            vec3 V = normalize(cameraPosition - vW);
            float fres = pow(1.0 - abs(dot(normalize(vN), V)), 1.6);
            float scan = 0.75 + 0.25 * step(0.5, fract(vW.y * 5.0 - uTime * 0.6));
            float a = (0.12 + 0.75 * fres) * scan * uOpacity;
            vec3 c = mix(vec3(0.25, 0.85, 1.0), vec3(0.75, 0.95, 1.0), fres);
            gl_FragColor = vec4(c, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  );
  const ref = useRef<THREE.Mesh>(null);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame(() => {
    const t = sceneFx.time * sceneFx.motion;
    material.uniforms.uTime.value = sceneFx.time;
    material.uniforms.uMotion.value = sceneFx.motion;
    material.uniforms.uOpacity.value = 1 - sceneFx.ghost;
    const m = ref.current;
    if (!m) return;
    const a = t * 0.11;
    const r = 5.5;
    m.position.set(Math.cos(a) * r, 15.2 + Math.sin(t * 0.4) * 0.4, 8.5 + Math.sin(a) * r);
    // Nose along the direction of travel, banking into the turn.
    const tx = -Math.sin(a);
    const tz = Math.cos(a);
    m.rotation.set(-0.28, Math.atan2(-tz, tx), Math.sin(t * 0.4) * 0.05, "YXZ");
  });
  return <mesh ref={ref} geometry={geometry} material={material} scale={4.2} renderOrder={7} raycast={() => null} />;
}

// ---------------------------------------------------------------------------
// Benches, kiosks, planters and vines

function Furniture() {
  const benchGeo = useMemo(() => {
    const seat = new THREE.BoxGeometry(2.1, 0.09, 0.56);
    seat.translate(0, 0.46, 0);
    const back = new THREE.BoxGeometry(2.1, 0.42, 0.06);
    back.rotateX(-0.12);
    back.translate(0, 0.72, -0.26);
    return { wood: mergeGeometries([seat, back])!, frame: frameGeometry() };
  }, []);
  const kioskGeo = useMemo(() => {
    const post = new THREE.BoxGeometry(0.16, 1.0, 0.16);
    post.translate(0, 0.5, 0);
    const base = new THREE.BoxGeometry(0.5, 0.05, 0.4);
    base.translate(0, 0.025, 0);
    const head = new THREE.BoxGeometry(0.7, 0.48, 0.06);
    head.rotateX(-0.45);
    head.translate(0, 1.18, 0);
    return mergeGeometries([post, base, head])!;
  }, []);
  const bushGeos = useMemo(() => [bushGeometry(3), bushGeometry(11)], []);
  const mats = useMemo(
    () => ({
      wood: new THREE.MeshStandardMaterial({ color: "#9a6a3d", roughness: 0.55 }),
      metal: new THREE.MeshStandardMaterial({ color: "#2b3038", roughness: 0.4, metalness: 0.7 }),
      planter: new THREE.MeshStandardMaterial({ color: "#d9d2c5", roughness: 0.5 }),
      leaf: new THREE.MeshStandardMaterial({ color: "#3f8f4e", roughness: 0.65 }),
      screen: kioskScreenMaterial(),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
      benchGeo.wood.dispose();
      benchGeo.frame.dispose();
      kioskGeo.dispose();
      bushGeos.forEach((g) => g.dispose());
    },
    [mats, benchGeo, kioskGeo, bushGeos],
  );
  useFrame(() => {
    mats.screen.uniforms.uTime.value = sceneFx.time * sceneFx.motion;
  });

  return (
    <group>
      {BENCHES.map((b, i) => (
        <group key={`b${i}`} position={[b.x, b.y, b.z]} rotation={[0, b.yaw, 0]}>
          <mesh geometry={benchGeo.wood} material={mats.wood} raycast={() => null} />
          <mesh geometry={benchGeo.frame} material={mats.metal} raycast={() => null} />
        </group>
      ))}
      {KIOSKS.map((k, i) => (
        <group key={`k${i}`} position={[k.x, k.y, k.z]} rotation={[0, k.yaw, 0]}>
          <mesh geometry={kioskGeo} material={mats.metal} raycast={() => null} />
          <mesh position={[0, 1.18, 0.035]} rotation={[-0.45, 0, 0]} raycast={() => null}>
            <planeGeometry args={[0.62, 0.4]} />
            <primitive object={mats.screen} attach="material" />
          </mesh>
          <KioskTint tank={TANKS[i]} />
        </group>
      ))}
      {PLANTER_SPOTS.map(([x, y, z], i) => (
        <group key={`p${i}`} position={[x, y, z]} rotation={[0, i * 1.7, 0]}>
          <mesh material={mats.planter} position={[0, 0.35, 0]} raycast={() => null}>
            <cylinderGeometry args={[0.75, 0.62, 0.7, 20]} />
          </mesh>
          <mesh geometry={bushGeos[i % 2]} material={mats.leaf} position={[0, 0.62, 0]} scale={1.15} raycast={() => null} />
        </group>
      ))}
    </group>
  );
}

/** Small coloured light under each kiosk screen, matched to its habitat's water. */
function KioskTint({ tank }: { tank: TankConfig }) {
  return (
    <mesh position={[0, 0.06, 0.24]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <circleGeometry args={[0.32, 24]} />
      <meshBasicMaterial color={tank.habitat.waterTint.shallow} transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function frameGeometry() {
  const legs: THREE.BufferGeometry[] = [];
  for (const x of [-0.9, 0.9]) {
    const leg = new THREE.BoxGeometry(0.07, 0.44, 0.5);
    leg.translate(x, 0.22, 0);
    legs.push(leg);
    const strut = new THREE.BoxGeometry(0.05, 0.42, 0.05);
    strut.rotateX(-0.12);
    strut.translate(x, 0.68, -0.25);
    legs.push(strut);
  }
  return mergeGeometries(legs)!;
}

/** Animated "habitat guide" screen: soft ocean gradient, drifting light and a progress line. */
function kioskScreenMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec3 top = vec3(0.12, 0.62, 0.9);
        vec3 bot = vec3(0.02, 0.12, 0.3);
        vec3 c = mix(bot, top, vUv.y);
        float wave = 0.5 + 0.5 * sin(vUv.x * 9.0 + uTime * 1.2 + sin(vUv.y * 6.0 + uTime * 0.7) * 1.5);
        c += vec3(0.25, 0.6, 0.8) * wave * 0.25 * vUv.y;
        // Title bar and a moving progress line, like a looping guide video.
        c = mix(c, vec3(0.92, 0.97, 1.0), step(0.82, vUv.y) * step(0.08, vUv.x) * step(vUv.x, 0.6) * step(vUv.y, 0.88));
        float bar = step(0.1, vUv.y) * step(vUv.y, 0.13) * step(0.08, vUv.x) * step(vUv.x, 0.08 + 0.84 * fract(uTime * 0.05));
        c = mix(c, vec3(0.5, 0.95, 1.0), bar);
        gl_FragColor = vec4(c * 1.6, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Trailing vines hanging from the front edges of the gallery decks. */
function Vines() {
  const items = useMemo(() => {
    const r = rng(19);
    const out: { x: number; y: number; z: number; len: number; tint: number }[] = [];
    const L2 = BUILDING.decks.L2;
    const L3 = BUILDING.decks.L3;
    const runs: { x0: number; x1: number; z: number; y: number }[] = [
      { x0: L2.left.minX + 1, x1: L2.left.maxX - 0.8, z: L2.left.maxZ, y: L2.y },
      { x0: L2.right.minX + 0.8, x1: L2.right.maxX - 1, z: L2.right.maxZ, y: L2.y },
      { x0: L3.left.minX + 1, x1: L3.left.maxX - 0.8, z: L3.left.maxZ, y: L3.y },
      { x0: L3.right.minX + 0.8, x1: L3.right.maxX - 1, z: L3.right.maxZ, y: L3.y },
    ];
    for (const run of runs)
      for (let x = run.x0; x < run.x1; x += 0.55 + r() * 0.5) {
        // Skip the escalator landings so vines never hang across them.
        if (run.y === L2.y && Math.abs(Math.abs(x) - 20) < 1.4) continue;
        out.push({ x, y: run.y - 0.5, z: run.z + 0.16, len: 0.8 + r() * 1.8, tint: r() });
      }
    return out;
  }, []);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.34, 1, 1, 8);
    g.translate(0, -0.5, 0);
    const tint = new Float32Array(items.length);
    items.forEach((v, i) => (tint[i] = v.tint));
    g.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 1));
    return g;
  }, [items]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float aTint;
          uniform float uTime;
          varying vec2 vUv; varying float vTint;
          void main() {
            vUv = uv; vTint = aTint;
            vec3 p = position;
            float hang = 1.0 - uv.y;
            vec4 w = instanceMatrix * vec4(p, 1.0);
            w.x += sin(uTime * 0.8 + w.x * 1.3) * 0.06 * hang * hang;
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * w;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; varying float vTint;
          void main() {
            // Alternating leaves along a thin stem, tapering towards the tip.
            float rows = 9.0;
            float seg = fract(vUv.y * rows);
            float side = mod(floor(vUv.y * rows), 2.0) * 2.0 - 1.0;
            float taper = 0.55 + 0.45 * vUv.y;
            vec2 q = vec2((vUv.x - 0.5 - side * 0.18 * taper) * 2.6 / taper, (seg - 0.5) * 1.5);
            float leaf = length(q);
            float stem = abs(vUv.x - 0.5);
            if (leaf > 0.5 && stem > 0.035) discard;
            vec3 dark = vec3(0.12, 0.33, 0.16);
            vec3 light = mix(vec3(0.3, 0.62, 0.3), vec3(0.45, 0.7, 0.28), vTint);
            vec3 c = mix(light, dark, smoothstep(0.1, 0.5, leaf)) * (0.7 + 0.3 * vUv.y);
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  );
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    items.forEach((v, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(v.x, v.y, v.z), new THREE.Quaternion(), new THREE.Vector3(1, v.len, 1))));
    mesh.instanceMatrix.needsUpdate = true;
  }, [items]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame(() => {
    material.uniforms.uTime.value = sceneFx.time * sceneFx.motion;
  });
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} frustumCulled={false} raycast={() => null} />;
}

export function Atrium() {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    // Visitor scenery belongs to the solid public building.
    if (ref.current) ref.current.visible = sceneFx.ghost < 0.35 && sceneFx.shellVisible > 0.5;
  });
  return (
    <group ref={ref}>
      <JellyLanterns />
      <HoloManta />
      <Furniture />
      <Vines />
    </group>
  );
}
