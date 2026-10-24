"use client";

import { MeshReflectorMaterial } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BUILDING, FILTERS, PUMPS, TANKS } from "@/lib/data/facility";
import { useAppStore } from "@/store/useAppStore";
import { treeGeometry } from "./geometry";
import { WALLS, ghostMaterial, releaseGhost, type Cutaway } from "./ghost";
import { sceneFx } from "./sceneFx";

type Box = { min: [number, number, number]; max: [number, number, number] };

function boxProps(b: Box) {
  const size: [number, number, number] = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const pos: [number, number, number] = [(b.max[0] + b.min[0]) / 2, (b.max[1] + b.min[1]) / 2, (b.max[2] + b.min[2]) / 2];
  return { size, pos };
}

const P = BUILDING.plant;

function wallMat(color: string, cutaway: Cutaway, ghost = 0.05) {
  return ghostMaterial(new THREE.MeshStandardMaterial({ color, roughness: 0.75 }), { ghost, cutaway });
}

function useArchMaterials() {
  const mats = useMemo(() => {
    const m = {
      floor: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#272b33", roughness: 0.32, metalness: 0.1, envMapIntensity: 0.6 }), { ghost: 0.08 }),
      inlay: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#c9a96e", roughness: 0.3, metalness: 0.75, emissive: new THREE.Color("#3a2a10"), emissiveIntensity: 0.4 }), { ghost: 0.0 }),
      deck: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#e4ddd1", roughness: 0.5, metalness: 0.05 }), { ghost: 0.1 }),
      fascia: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#f6f2ea", roughness: 0.35 }), { ghost: 0.12 }),
      cove: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#ffc184"), emissiveIntensity: 3.2 }), { ghost: 0.0 }),
      glassRail: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#cfe9ff", roughness: 0.05, metalness: 0.1, opacity: 0.16, side: THREE.DoubleSide }), { base: 0.16, ghost: 0.0, alwaysTransparent: true }),
      handrail: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#c49a5c", roughness: 0.28, metalness: 0.9 }), { ghost: 0.15 }),
      column: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#d6cfc3", roughness: 0.5, envMapIntensity: 0.6 }), { ghost: 0.08 }),
      columnLight: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#57d6ff"), emissiveIntensity: 2.6 }), { ghost: 0.0 }),
      wallBack: wallMat("#3b3430", WALLS.back),
      wallLeft: wallMat("#3b3430", WALLS.left),
      wallRight: wallMat("#3b3430", WALLS.right),
      wallRear: wallMat("#2c3036", WALLS.rear, 0.25),
      wallPanel: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#ffb066"), emissiveIntensity: 1.6 }), { ghost: 0.0, cutaway: WALLS.back }),
      sidePanelL: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#ffb066"), emissiveIntensity: 1.5 }), { ghost: 0.0, cutaway: WALLS.left }),
      sidePanelR: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#ffb066"), emissiveIntensity: 1.5 }), { ghost: 0.0, cutaway: WALLS.right }),
      ceiling: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#14161b", roughness: 0.8, side: THREE.DoubleSide }), { ghost: 0.0, cutaway: WALLS.roof }),
      downlight: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#fff1d6"), emissiveIntensity: 3.4 }), { ghost: 0.0, cutaway: WALLS.roof }),
      skylight: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#bfe6ff"), emissiveIntensity: 2.6 }), { ghost: 0.0, cutaway: WALLS.roof }),
      escalator: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#8f98a3", roughness: 0.35, metalness: 0.7 }), { ghost: 0.1 }),
      leaf: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#2f7a45", roughness: 0.7, side: THREE.DoubleSide }), { ghost: 0.0 }),
      planter: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#3b3631", roughness: 0.6 }), { ghost: 0.0 }),
      edges: ghostMaterial(new THREE.LineBasicMaterial({ color: "#7fd3ff" }), { ghost: 0.42, engineeringOnly: true }),
    };
    return m;
  }, []);
  useEffect(
    () => () => {
      for (const mat of Object.values(mats)) {
        releaseGhost(mat);
        mat.dispose();
      }
    },
    [mats],
  );
  return mats;
}

type Mats = ReturnType<typeof useArchMaterials>;

function BoxMesh({ b, material, edges, edgeMat }: { b: Box; material: THREE.Material; edges?: boolean; edgeMat?: THREE.Material }) {
  const { size, pos } = boxProps(b);
  const geo = useMemo(() => new THREE.BoxGeometry(...size), [size[0], size[1], size[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  const edgeGeo = useMemo(() => (edges ? new THREE.EdgesGeometry(geo) : null), [geo, edges]);
  return (
    <group position={pos}>
      <mesh geometry={geo} material={material} raycast={() => null} />
      {edgeGeo && edgeMat && <lineSegments geometry={edgeGeo} material={edgeMat} raycast={() => null} />}
    </group>
  );
}

interface Edge {
  a: [number, number];
  b: [number, number];
  y: number;
}

/** Deck edges that face the atrium void (where rails and cove lights go). */
function voidEdges(): Edge[] {
  const out: Edge[] = [];
  for (const key of ["L2", "L3"] as const) {
    const d = BUILDING.decks[key];
    out.push({ a: [d.left.maxX, d.back.maxZ], b: [d.left.maxX, d.left.maxZ], y: d.y });
    out.push({ a: [d.left.minX, d.left.maxZ], b: [d.left.maxX, d.left.maxZ], y: d.y });
    out.push({ a: [d.right.minX, d.back.maxZ], b: [d.right.minX, d.right.maxZ], y: d.y });
    out.push({ a: [d.right.minX, d.right.maxZ], b: [d.right.maxX, d.right.maxZ], y: d.y });
    out.push({ a: [d.back.minX, d.back.maxZ], b: [d.back.maxX, d.back.maxZ], y: d.y });
  }
  return out;
}

function Rail({ e, mats }: { e: Edge; mats: Mats }) {
  const dx = e.b[0] - e.a[0];
  const dz = e.b[1] - e.a[1];
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const mid: [number, number, number] = [(e.a[0] + e.b[0]) / 2, e.y, (e.a[1] + e.b[1]) / 2];
  return (
    <group position={mid} rotation={[0, -angle, 0]}>
      <mesh material={mats.glassRail} position={[0, 0.55, 0]} raycast={() => null}>
        <planeGeometry args={[len, 1.0]} />
      </mesh>
      <mesh material={mats.handrail} position={[0, 1.08, 0]} rotation={[0, 0, Math.PI / 2]} raycast={() => null}>
        <cylinderGeometry args={[0.045, 0.045, len, 8]} />
      </mesh>
      <mesh material={mats.fascia} position={[0, -0.23, 0]} raycast={() => null}>
        <boxGeometry args={[len, 0.5, 0.12]} />
      </mesh>
      <mesh material={mats.cove} position={[0, -0.5, -0.12]} raycast={() => null}>
        <boxGeometry args={[len, 0.04, 0.06]} />
      </mesh>
    </group>
  );
}

function deckBoxes(): Box[] {
  const out: Box[] = [];
  for (const key of ["L2", "L3"] as const) {
    const d = BUILDING.decks[key];
    for (const part of [d.left, d.right, d.back]) out.push({ min: [part.minX, d.y - 0.45, part.minZ], max: [part.maxX, d.y, part.maxZ] });
  }
  return out;
}

function Ceiling({ mats }: { mats: Mats }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(BUILDING.minX, P.minZ);
    s.lineTo(BUILDING.maxX, P.minZ);
    s.lineTo(BUILDING.maxX, BUILDING.maxZ);
    s.lineTo(BUILDING.minX, BUILDING.maxZ);
    const hole = new THREE.Path();
    hole.absarc(0, -3, 7.2, 0, Math.PI * 2, true);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false, curveSegments: 48 });
    g.rotateX(Math.PI / 2);
    return g;
  }, []);
  const lights = useMemo(() => {
    const pts: [number, number][] = [];
    for (let x = -21; x <= 21; x += 4.2)
      for (let z = -13.5; z <= 12; z += 4.2) {
        if (Math.hypot(x, z + 3) < 8.4) continue;
        pts.push([x, z]);
      }
    return pts;
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = new THREE.Matrix4();
    lights.forEach(([x, z], i) => ref.current?.setMatrixAt(i, m.makeTranslation(x, BUILDING.roof - 0.02, z)));
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [lights]);
  return (
    <group>
      <mesh geometry={geo} material={mats.ceiling} position={[0, BUILDING.roof + 0.5, 0]} raycast={() => null} />
      <instancedMesh ref={ref} args={[undefined, mats.downlight, lights.length]} raycast={() => null}>
        <cylinderGeometry args={[0.16, 0.16, 0.04, 12]} />
      </instancedMesh>
      <mesh material={mats.skylight} position={[0, BUILDING.roof - 0.05, -3]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[7.2, 0.08, 8, 96]} />
      </mesh>
      <mesh material={mats.skylight} position={[0, BUILDING.roof + 0.45, -3]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[5.4, 0.05, 6, 96]} />
      </mesh>
    </group>
  );
}

/** Soft daylight beam falling through the skylight into the showcase. */
function SkylightBeam() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vN; varying vec3 vWorld;
          void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uOpacity;
          varying vec2 vUv; varying vec3 vN; varying vec3 vWorld;
          void main() {
            vec3 V = normalize(cameraPosition - vWorld);
            float edge = pow(abs(dot(normalize(vN), V)), 1.5);
            float streak = 0.75 + 0.25 * sin(vUv.x * 50.0 + uTime * 0.3) * sin(vUv.x * 23.0 - uTime * 0.2);
            float a = vUv.y * vUv.y * 0.11 * edge * streak * uOpacity;
            gl_FragColor = vec4(vec3(0.72, 0.88, 1.0) * a, a);
          }
        `,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    mat.uniforms.uTime.value = sceneFx.time * sceneFx.motion;
    mat.uniforms.uOpacity.value = 1 - sceneFx.ghost;
  });
  return (
    <mesh material={mat} position={[0, 16.4, -3]} renderOrder={6} raycast={() => null}>
      <cylinderGeometry args={[7.0, 5.0, 3.4, 64, 1, true]} />
    </mesh>
  );
}

function WallPanels({ mats }: { mats: Mats }) {
  const back = useMemo(() => {
    const out: [number, number, number][] = [];
    for (const y of [7.6, 13.6]) for (let x = -19.5; x <= 19.5; x += 6.5) out.push([x, y, BUILDING.minZ + 0.22]);
    return out;
  }, []);
  const side = useMemo(() => {
    const out: { pos: [number, number, number]; w: number; h: number }[] = [];
    for (let z = -12; z <= 10; z += 5.5) out.push({ pos: [0, 1.6, z], w: 3.2, h: 2.6 });
    for (let z = -13; z <= -6; z += 5) out.push({ pos: [0, 7.7, z], w: 2.6, h: 2.2 });
    return out;
  }, []);
  return (
    <group>
      {back.map((p, i) => (
        <mesh key={i} material={mats.wallPanel} position={p} raycast={() => null}>
          <planeGeometry args={[3.4, 2.4]} />
        </mesh>
      ))}
      {side.map((p, i) => (
        <group key={i}>
          <mesh material={mats.sidePanelL} position={[BUILDING.minX + 0.22, p.pos[1], p.pos[2]]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
            <planeGeometry args={[p.w, p.h]} />
          </mesh>
          <mesh material={mats.sidePanelR} position={[BUILDING.maxX - 0.22, p.pos[1], p.pos[2]]} rotation={[0, -Math.PI / 2, 0]} raycast={() => null}>
            <planeGeometry args={[p.w, p.h]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Plants({ mats }: { mats: Mats }) {
  const geo = useMemo(() => treeGeometry(5), []);
  const spots: [number, number, number][] = [
    [-21.5, 0, 11],
    [-18.5, 0, 12.5],
    [21.5, 0, 11.5],
    [6.5, 0, 11.5],
    [-6.5, 0, 11.5],
    [-21.5, 6, -14],
    [21.5, 6, -14],
  ];
  return (
    <group>
      {spots.map((p, i) => (
        <group key={i} position={p} rotation={[0, i * 1.3, 0]}>
          <mesh material={mats.planter} position={[0, 0.3, 0]} raycast={() => null}>
            <cylinderGeometry args={[0.55, 0.45, 0.6, 16]} />
          </mesh>
          <mesh geometry={geo} material={mats.leaf} position={[0, 0.55, 0]} scale={1.05} raycast={() => null} />
        </group>
      ))}
    </group>
  );
}

export const PLANTERS: [number, number, number][] = [
  [-21.5, 0, 11],
  [-18.5, 0, 12.5],
  [21.5, 0, 11.5],
  [6.5, 0, 11.5],
  [-6.5, 0, 11.5],
  [-21.5, 6, -14],
  [21.5, 6, -14],
];

function Escalator({ from, to, mats }: { from: [number, number, number]; to: [number, number, number]; mats: Mats }) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const run = Math.hypot(dx, dz);
  const len = Math.hypot(run, dy);
  const mid: [number, number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy, run);
  return (
    <group position={mid} rotation={[0, yaw, 0]}>
      <group rotation={[-pitch, 0, 0]}>
        <mesh material={mats.escalator} raycast={() => null}>
          <boxGeometry args={[1.4, 0.5, len]} />
        </mesh>
        {[0.72, -0.72].map((x) => (
          <group key={x}>
            <mesh material={mats.glassRail} position={[x, 0.6, 0]} raycast={() => null}>
              <boxGeometry args={[0.04, 0.8, len]} />
            </mesh>
            <mesh material={mats.handrail} position={[x, 1.02, 0]} raycast={() => null}>
              <boxGeometry args={[0.08, 0.06, len]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** Polished atrium floor that reflects the glowing habitats (public view, high quality). */
function ReflectiveFloor() {
  const quality = useAppStore((s) => s.quality);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ref.current) ref.current.visible = sceneFx.ghost < 0.02 && sceneFx.shellVisible > 0.5;
  });
  if (quality !== "high") return null;
  const depth = BUILDING.entranceZ - BUILDING.minZ;
  return (
    <mesh ref={ref} position={[0, 0.003, (BUILDING.entranceZ + BUILDING.minZ) / 2]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <planeGeometry args={[BUILDING.maxX - BUILDING.minX, depth]} />
      <MeshReflectorMaterial
        blur={[420, 140]}
        resolution={768}
        mixBlur={1}
        mixStrength={3.2}
        roughness={0.75}
        depthScale={1.1}
        minDepthThreshold={0.35}
        maxDepthThreshold={1.4}
        color="#3a4250"
        metalness={0.3}
        mirror={0.6}
      />
    </mesh>
  );
}

export function Architecture() {
  const mats = useArchMaterials();
  const edges = useMemo(() => voidEdges(), []);
  const decks = useMemo(() => deckBoxes(), []);
  const tankA = TANKS[0];
  const fullDepth: [number, number] = [P.minZ, BUILDING.maxZ];

  return (
    <group>
      {/* Atrium floor slab and entrance plaza */}
      <BoxMesh b={{ min: [BUILDING.minX, -BUILDING.slab, BUILDING.minZ], max: [BUILDING.maxX, 0, BUILDING.entranceZ] }} material={mats.floor} edges edgeMat={mats.edges} />
      <ReflectiveFloor />
      <mesh material={mats.inlay} position={[tankA.position[0], 0.008, tankA.position[2]]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[tankA.radius + 0.9, tankA.radius + 1.05, 96]} />
      </mesh>
      <mesh material={mats.inlay} position={[tankA.position[0], 0.008, tankA.position[2]]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[tankA.radius + 3.6, tankA.radius + 3.68, 96]} />
      </mesh>

      {/* Gallery decks, rails, cove lighting */}
      {decks.map((b, i) => (
        <BoxMesh key={i} b={b} material={mats.deck} edges edgeMat={mats.edges} />
      ))}
      {edges.map((e, i) => (
        <Rail key={i} e={e} mats={mats} />
      ))}

      {/* Columns with accent light rings */}
      {BUILDING.columns.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh material={mats.column} position={[0, BUILDING.roof / 2, 0]} raycast={() => null}>
            <cylinderGeometry args={[BUILDING.columnRadius, BUILDING.columnRadius, BUILDING.roof, 20]} />
          </mesh>
          {[0.12, 5.4, 11.4].map((y) => (
            <mesh key={y} material={mats.columnLight} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
              <torusGeometry args={[BUILDING.columnRadius + 0.02, 0.025, 6, 32]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Envelope: the back wall separates the atrium from the plant hall */}
      <BoxMesh b={{ min: [BUILDING.minX, -2.3, BUILDING.minZ - 0.4], max: [BUILDING.maxX, BUILDING.roof, BUILDING.minZ] }} material={mats.wallBack} edges edgeMat={mats.edges} />
      <BoxMesh b={{ min: [BUILDING.minX - 0.4, -2.3, fullDepth[0]], max: [BUILDING.minX, BUILDING.roof, fullDepth[1]] }} material={mats.wallLeft} edges edgeMat={mats.edges} />
      <BoxMesh b={{ min: [BUILDING.maxX, -2.3, fullDepth[0]], max: [BUILDING.maxX + 0.4, BUILDING.roof, fullDepth[1]] }} material={mats.wallRight} edges edgeMat={mats.edges} />
      <BoxMesh b={{ min: [BUILDING.minX, -2.3, P.minZ - 0.4], max: [BUILDING.maxX, BUILDING.roof, P.minZ] }} material={mats.wallRear} edges edgeMat={mats.edges} />
      <WallPanels mats={mats} />
      <Ceiling mats={mats} />
      <SkylightBeam />

      <Escalator from={[-19.5, 0, 12.5]} to={[-19.5, 6, 2.6]} mats={mats} />
      <Escalator from={[20.5, 0, 12.5]} to={[20.5, 6, 2.6]} mats={mats} />
      <Plants mats={mats} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Back-of-house life-support plant hall.

function gridFloorMaterial(base: string, line: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uBase: { value: new THREE.Color(base) }, uLine: { value: new THREE.Color(line) } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase; uniform vec3 uLine;
      varying vec3 vWorld;
      void main() {
        vec2 g = abs(fract(vWorld.xz / 2.0) - 0.5) / fwidth(vWorld.xz / 2.0);
        float l = 1.0 - min(min(g.x, g.y), 1.0);
        vec2 G = abs(fract(vWorld.xz / 10.0) - 0.5) / fwidth(vWorld.xz / 10.0);
        float L = 1.0 - min(min(G.x, G.y), 1.0);
        vec3 col = uBase + uLine * (l * 0.14 + L * 0.3);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

export function PlantRoom() {
  const mats = useMemo(
    () => ({
      floor: gridFloorMaterial("#252b34", "#5aa9ff"),
      voidFloor: gridFloorMaterial("#141920", "#3f7fc4"),
      pad: new THREE.MeshStandardMaterial({ color: "#5f6670", roughness: 0.9 }),
      safety: new THREE.MeshStandardMaterial({ color: "#e0b51c", roughness: 0.6, emissive: new THREE.Color("#3a2c00"), emissiveIntensity: 0.6 }),
      steel: new THREE.MeshStandardMaterial({ color: "#7d8793", metalness: 0.75, roughness: 0.4 }),
      lamp: new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#e8f3ff"), emissiveIntensity: 3 }),
      walkway: new THREE.MeshStandardMaterial({ color: "#2a6b55", roughness: 0.7 }),
      console: new THREE.MeshStandardMaterial({ color: "#1b2028", metalness: 0.4, roughness: 0.5 }),
      screen: new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#3aa0ff"), emissiveIntensity: 2.2 }),
      hazard: new THREE.MeshStandardMaterial({ color: "#d9a81a", roughness: 0.6 }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const pads = [
    ...PUMPS.map((pm) => ({ x: pm.position[0], z: pm.position[2], w: 3.8, d: 1.9 })),
    ...FILTERS.map((f) => ({ x: f.position[0], z: f.position[2], w: f.radius * 2 + 0.8, d: f.radius * 2 + 0.8 })),
  ];
  const cx = (P.minX + P.maxX) / 2;
  const cz = (P.minZ + P.maxZ) / 2;
  const hangers: [number, number][] = [
    [-16, 2.5],
    [-6, 2.5],
    [7.5, 1.8],
    [14, 1.8],
  ];
  return (
    <group>
      {/* Plant floor and the service void under the atrium slab */}
      <mesh material={mats.floor} position={[cx, P.floor - 0.15, cz]} raycast={() => null}>
        <boxGeometry args={[P.maxX - P.minX, 0.3, P.maxZ - P.minZ]} />
      </mesh>
      <mesh material={mats.voidFloor} position={[0, BUILDING.voidFloor - 0.15, (BUILDING.minZ + BUILDING.maxZ) / 2]} raycast={() => null}>
        <boxGeometry args={[BUILDING.maxX - BUILDING.minX, 0.3, BUILDING.maxZ - BUILDING.minZ]} />
      </mesh>
      <mesh material={mats.walkway} position={[0, P.floor + 0.01, -36.1]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[44, 1.0]} />
      </mesh>
      {pads.map((pd, i) => (
        <group key={i} position={[pd.x, P.floor, pd.z]}>
          <mesh material={mats.pad} position={[0, 0.06, 0]} raycast={() => null}>
            <boxGeometry args={[pd.w, 0.12, pd.d]} />
          </mesh>
          <mesh material={mats.safety} position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[Math.max(pd.w, pd.d) * 0.62, Math.max(pd.w, pd.d) * 0.62 + 0.08, 4, 1, Math.PI / 4]} />
          </mesh>
        </group>
      ))}
      {/* Trapeze hangers carrying the overhead headers from the roof steel */}
      {hangers.map(([x, y]) => (
        <group key={x} position={[x, 0, -22.5]}>
          <mesh material={mats.steel} position={[0, y - 0.34, 0]} raycast={() => null}>
            <boxGeometry args={[0.14, 0.1, 1.3]} />
          </mesh>
          {[-0.55, 0.55].map((dz) => (
            <mesh key={dz} material={mats.steel} position={[0, (y - 0.34 + 8.6) / 2, dz]} raycast={() => null}>
              <boxGeometry args={[0.05, 8.6 - (y - 0.34), 0.05]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Hazard band along the plant's rear wall */}
      <mesh material={mats.hazard} position={[cx, P.floor + 0.35, P.minZ + 0.02]} raycast={() => null}>
        <boxGeometry args={[P.maxX - P.minX, 0.2, 0.04]} />
      </mesh>
      {/* Control console */}
      <group position={[-4.5, P.floor, -35.6]}>
        <mesh material={mats.console} position={[0, 0.5, 0]} raycast={() => null}>
          <boxGeometry args={[3.2, 1.0, 0.9]} />
        </mesh>
        {[-1, 0, 1].map((i) => (
          <mesh key={i} material={mats.screen} position={[i * 1.0, 1.4, 0.2]} rotation={[0.25, Math.PI, 0]} raycast={() => null}>
            <planeGeometry args={[0.85, 0.5]} />
          </mesh>
        ))}
      </group>
      {/* Industrial light bars */}
      {[-16, -8, 0, 8, 16].map((x) =>
        [-20, -26, -32].map((z) => (
          <mesh key={`${x}-${z}`} material={mats.lamp} position={[x, 8.6, z]} raycast={() => null}>
            <boxGeometry args={[2.2, 0.06, 0.2]} />
          </mesh>
        )),
      )}
    </group>
  );
}
