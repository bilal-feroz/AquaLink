"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BUILDING, FILTERS, PUMPS, TANKS } from "@/lib/data/facility";
import { rng, treeGeometry } from "./geometry";
import { ghostMaterial, releaseGhost } from "./ghost";

type Box = { min: [number, number, number]; max: [number, number, number] };

function boxProps(b: Box) {
  const size: [number, number, number] = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const pos: [number, number, number] = [(b.max[0] + b.min[0]) / 2, (b.max[1] + b.min[1]) / 2, (b.max[2] + b.min[2]) / 2];
  return { size, pos };
}

function useArchMaterials() {
  const mats = useMemo(() => {
    const m = {
      floor: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#2f333a", roughness: 0.34, metalness: 0.05, envMapIntensity: 0.55 }), { ghost: 0.08 }),
      inlay: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#b8a27a", roughness: 0.35, metalness: 0.6 }), { ghost: 0.0 }),
      deck: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#dcd6cc", roughness: 0.55, metalness: 0.05 }), { ghost: 0.1 }),
      fascia: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#f3efe8", roughness: 0.4 }), { ghost: 0.12 }),
      cove: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#ffc58a"), emissiveIntensity: 2.4 }), { ghost: 0.0 }),
      glassRail: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#cfe9ff", roughness: 0.05, metalness: 0.1, opacity: 0.16, side: THREE.DoubleSide }), { base: 0.16, ghost: 0.0, alwaysTransparent: true }),
      handrail: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#b38c58", roughness: 0.3, metalness: 0.85 }), { ghost: 0.15 }),
      column: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#c9c2b6", roughness: 0.55, envMapIntensity: 0.6 }), { ghost: 0.1 }),
      wall: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#3a3532", roughness: 0.7 }), { ghost: 0.05 }),
      wallPanel: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#ffb36b"), emissiveIntensity: 1.25 }), { ghost: 0.0 }),
      ceiling: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#16181d", roughness: 0.8, side: THREE.DoubleSide }), { ghost: 0.0 }),
      downlight: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#fff1d6"), emissiveIntensity: 3 }), { ghost: 0.0 }),
      skylight: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#bfe6ff"), emissiveIntensity: 2.2 }), { ghost: 0.0 }),
      shaft: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#4a4440", roughness: 0.8 }), { ghost: 0.08 }),
      escalator: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#8f98a3", roughness: 0.35, metalness: 0.7 }), { ghost: 0.1 }),
      leaf: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#2f6b3e", roughness: 0.8, side: THREE.DoubleSide }), { ghost: 0.0 }),
      planter: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#3b3631", roughness: 0.6 }), { ghost: 0.0 }),
      edges: ghostMaterial(new THREE.LineBasicMaterial({ color: "#8fc1ff" }), { ghost: 0.32, engineeringOnly: true }),
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

function Rail({ e, mats }: { e: Edge; mats: ReturnType<typeof useArchMaterials> }) {
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
      {/* Fascia and warm cove light under the deck edge */}
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

const COLUMNS: [number, number][] = [
  [-9, 2],
  [9, 2],
  [-9, -4.5],
  [9, -4.5],
  [-9.75, -11],
  [9.75, -11],
  [-16.5, 2],
  [16.5, 2],
  [-3.5, -12.5],
  [3.5, -12.5],
];

function Ceiling({ mats }: { mats: ReturnType<typeof useArchMaterials> }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(BUILDING.minX, BUILDING.minZ);
    s.lineTo(BUILDING.maxX, BUILDING.minZ);
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
        <torusGeometry args={[7.2, 0.07, 8, 96]} />
      </mesh>
      <mesh position={[0, BUILDING.roof + 0.45, -3]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null} material={mats.skylight}>
        <torusGeometry args={[5.4, 0.05, 6, 96]} />
      </mesh>
    </group>
  );
}

function WallPanels({ mats }: { mats: ReturnType<typeof useArchMaterials> }) {
  const panels = useMemo(() => {
    const out: { pos: [number, number, number]; rot: number; w: number; h: number }[] = [];
    // Back wall gallery openings on L2 / L3, side wall openings on L1.
    for (const y of [7.6, 13.6]) for (let x = -19.5; x <= 19.5; x += 6.5) out.push({ pos: [x, y, BUILDING.minZ + 0.22], rot: 0, w: 3.4, h: 2.4 });
    for (const side of [-1, 1]) {
      for (let z = -12; z <= 10; z += 5.5) out.push({ pos: [side * (BUILDING.maxX - 0.22), 1.6, z], rot: (side * Math.PI) / 2, w: 3.2, h: 2.6 });
      for (let z = -13; z <= -6; z += 5) out.push({ pos: [side * (BUILDING.maxX - 0.22), 7.7, z], rot: (side * Math.PI) / 2, w: 2.6, h: 2.2 });
    }
    return out;
  }, []);
  return (
    <group>
      {panels.map((p, i) => (
        <mesh key={i} material={mats.wallPanel} position={p.pos} rotation={[0, p.rot === 0 ? 0 : -p.rot, 0]} raycast={() => null}>
          <planeGeometry args={[p.w, p.h]} />
        </mesh>
      ))}
    </group>
  );
}

function Plants({ mats }: { mats: ReturnType<typeof useArchMaterials> }) {
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

function Escalator({ from, to, mats }: { from: [number, number, number]; to: [number, number, number]; mats: ReturnType<typeof useArchMaterials> }) {
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
        <mesh material={mats.glassRail} position={[0.72, 0.6, 0]} raycast={() => null}>
          <boxGeometry args={[0.04, 0.8, len]} />
        </mesh>
        <mesh material={mats.glassRail} position={[-0.72, 0.6, 0]} raycast={() => null}>
          <boxGeometry args={[0.04, 0.8, len]} />
        </mesh>
        <mesh material={mats.handrail} position={[0.72, 1.02, 0]} raycast={() => null}>
          <boxGeometry args={[0.08, 0.06, len]} />
        </mesh>
        <mesh material={mats.handrail} position={[-0.72, 1.02, 0]} raycast={() => null}>
          <boxGeometry args={[0.08, 0.06, len]} />
        </mesh>
      </group>
    </group>
  );
}

export function Architecture() {
  const mats = useArchMaterials();
  const edges = useMemo(() => voidEdges(), []);
  const decks = useMemo(() => deckBoxes(), []);
  const tankA = TANKS[0];

  return (
    <group>
      {/* Level 1 slab (also the ceiling of the B1 plant room) */}
      <BoxMesh b={{ min: [BUILDING.minX, -BUILDING.slab, BUILDING.minZ], max: [BUILDING.maxX, 0, BUILDING.entranceZ] }} material={mats.floor} edges edgeMat={mats.edges} />
      <mesh material={mats.inlay} position={[tankA.position[0], 0.006, tankA.position[2]]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[tankA.radius + 0.9, tankA.radius + 1.05, 96]} />
      </mesh>
      <mesh material={mats.inlay} position={[tankA.position[0], 0.006, tankA.position[2]]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[tankA.radius + 3.6, tankA.radius + 3.68, 96]} />
      </mesh>

      {/* Gallery decks, rails, cove lighting */}
      {decks.map((b, i) => (
        <BoxMesh key={i} b={b} material={mats.deck} edges edgeMat={mats.edges} />
      ))}
      {edges.map((e, i) => (
        <Rail key={i} e={e} mats={mats} />
      ))}

      {/* Columns */}
      {COLUMNS.map(([x, z], i) => (
        <mesh key={i} material={mats.column} position={[x, BUILDING.roof / 2, z]} raycast={() => null}>
          <cylinderGeometry args={[0.36, 0.36, BUILDING.roof, 20]} />
        </mesh>
      ))}

      {/* Envelope */}
      <BoxMesh b={{ min: [BUILDING.minX, -0.5, BUILDING.minZ - 0.4], max: [BUILDING.maxX, BUILDING.roof, BUILDING.minZ] }} material={mats.wall} edges edgeMat={mats.edges} />
      <BoxMesh b={{ min: [BUILDING.minX - 0.4, -0.5, BUILDING.minZ], max: [BUILDING.minX, BUILDING.roof, BUILDING.maxZ] }} material={mats.wall} edges edgeMat={mats.edges} />
      <BoxMesh b={{ min: [BUILDING.maxX, -0.5, BUILDING.minZ], max: [BUILDING.maxX + 0.4, BUILDING.roof, BUILDING.maxZ] }} material={mats.wall} edges edgeMat={mats.edges} />
      <WallPanels mats={mats} />
      <Ceiling mats={mats} />

      {/* Service shafts hiding the risers to the upper exhibits */}
      {BUILDING.shafts.map((s) => (
        <BoxMesh key={s.id} b={{ min: [s.minX, 0, s.minZ], max: [s.maxX, s.top, s.maxZ] }} material={mats.shaft} edges edgeMat={mats.edges} />
      ))}

      <Escalator from={[-19.5, 0, 12.5]} to={[-19.5, 6, 2.6]} mats={mats} />
      <Escalator from={[20.5, 0, 12.5]} to={[20.5, 6, 2.6]} mats={mats} />
      <Plants mats={mats} />
    </group>
  );
}

/** Restricted B1 life-support plant room under the atrium. */
export function PlantRoom() {
  const p = BUILDING.plant;
  const mats = useMemo(
    () => ({
      floor: new THREE.MeshStandardMaterial({ color: "#545a62", roughness: 0.85 }),
      pad: new THREE.MeshStandardMaterial({ color: "#6f757d", roughness: 0.9 }),
      wall: ghostMaterial(new THREE.MeshStandardMaterial({ color: "#3e444c", roughness: 0.9 }), { ghost: 0.55, engineeringOnly: true }),
      safety: new THREE.MeshStandardMaterial({ color: "#d8b11a", roughness: 0.6 }),
      tray: new THREE.MeshStandardMaterial({ color: "#8a929c", metalness: 0.6, roughness: 0.4 }),
      lamp: new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#e6f2ff"), emissiveIntensity: 2.2 }),
      walkway: new THREE.MeshStandardMaterial({ color: "#2f6f5a", roughness: 0.7 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      releaseGhost(mats.wall);
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats],
  );
  const r = useMemo(() => rng(42), []);
  void r;
  const pads = [
    ...PUMPS.map((pm) => ({ x: pm.position[0], z: pm.position[2], w: 3.8, d: 1.9 })),
    ...FILTERS.map((f) => ({ x: f.position[0], z: f.position[2], w: f.radius * 2 + 0.8, d: f.radius * 2 + 0.8 })),
  ];
  return (
    <group>
      <mesh material={mats.floor} position={[0, p.floor - 0.15, (p.minZ + p.maxZ) / 2]} raycast={() => null}>
        <boxGeometry args={[p.maxX - p.minX, 0.3, p.maxZ - p.minZ]} />
      </mesh>
      {/* Green walkway and safety lines */}
      <mesh material={mats.walkway} position={[0, p.floor + 0.01, 9.4]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[44, 1.6]} />
      </mesh>
      {pads.map((pd, i) => (
        <group key={i} position={[pd.x, p.floor, pd.z]}>
          <mesh material={mats.pad} position={[0, 0.06, 0]} raycast={() => null}>
            <boxGeometry args={[pd.w, 0.12, pd.d]} />
          </mesh>
          <mesh material={mats.safety} position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[Math.max(pd.w, pd.d) * 0.62, Math.max(pd.w, pd.d) * 0.62 + 0.08, 4, 1, Math.PI / 4]} />
          </mesh>
        </group>
      ))}
      {/* Walls (cut away towards the viewer) */}
      <mesh material={mats.wall} position={[0, (p.floor + p.ceiling) / 2, p.minZ - 0.2]} raycast={() => null}>
        <boxGeometry args={[p.maxX - p.minX, p.ceiling - p.floor, 0.4]} />
      </mesh>
      <mesh material={mats.wall} position={[p.minX - 0.2, (p.floor + p.ceiling) / 2, (p.minZ + p.maxZ) / 2]} raycast={() => null}>
        <boxGeometry args={[0.4, p.ceiling - p.floor, p.maxZ - p.minZ]} />
      </mesh>
      <mesh material={mats.wall} position={[p.maxX + 0.2, (p.floor + p.ceiling) / 2, (p.minZ + p.maxZ) / 2]} raycast={() => null}>
        <boxGeometry args={[0.4, p.ceiling - p.floor, p.maxZ - p.minZ]} />
      </mesh>
      <mesh material={mats.wall} position={[0, p.floor + 0.6, p.maxZ + 0.2]} raycast={() => null}>
        <boxGeometry args={[p.maxX - p.minX, 1.2, 0.4]} />
      </mesh>
      {/* Cable trays and work lights */}
      {[-12, 12].map((z) => (
        <mesh key={z} material={mats.tray} position={[0, p.ceiling - 0.35, z * 0.9]} raycast={() => null}>
          <boxGeometry args={[44, 0.08, 0.5]} />
        </mesh>
      ))}
      {[-16, -8, 0, 8, 16].map((x) =>
        [-8, -2, 4].map((z) => (
          <mesh key={`${x}-${z}`} material={mats.lamp} position={[x, p.ceiling - 0.12, z]} raycast={() => null}>
            <boxGeometry args={[1.6, 0.06, 0.18]} />
          </mesh>
        )),
      )}
    </group>
  );
}
