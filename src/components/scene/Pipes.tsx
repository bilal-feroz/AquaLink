"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Select } from "@react-three/postprocessing";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { EDGES, JUNCTIONS, PIPE_ROUTES } from "@/lib/data/facility";
import { createInitialState } from "@/lib/simulation/engine";
import { FLOW_VISUAL_HEX, edgeVisual, type FlowVisual } from "@/lib/status";
import { EDGE_BY_ID, outgoing } from "@/lib/topology/graph";
import type { JunctionConfig, Vec3 } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { sceneFx } from "./sceneFx";
import { flowMaterial } from "./shaders";
import type { TraceSet } from "./trace";

const BASELINE_FLOW = createInitialState().edgeFlow;

export function pipeRadius(diameterMm: number) {
  return 0.05 + (diameterMm / 1000) * 0.5;
}

/** Polyline → curve path with rounded elbows. */
export function roundedPath(points: Vec3[], maxRadius = 0.38) {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const v = points.map((p) => new THREE.Vector3(...p));
  let start = v[0].clone();
  for (let i = 1; i < v.length - 1; i++) {
    const prev = v[i - 1];
    const cur = v[i];
    const next = v[i + 1];
    const inDir = cur.clone().sub(prev);
    const outDir = next.clone().sub(cur);
    const rc = Math.min(maxRadius, inDir.length() / 2.2, outDir.length() / 2.2);
    inDir.normalize();
    outDir.normalize();
    const a = cur.clone().addScaledVector(inDir, -rc);
    const b = cur.clone().addScaledVector(outDir, rc);
    if (start.distanceTo(a) > 1e-4) path.add(new THREE.LineCurve3(start, a));
    path.add(new THREE.QuadraticBezierCurve3(a, cur.clone(), b));
    start = b;
  }
  path.add(new THREE.LineCurve3(start, v[v.length - 1]));
  return path;
}

function tubeFor(points: Vec3[], radius: number, radial = 12) {
  const path = roundedPath(points);
  const length = path.getLength();
  const segs = Math.max(8, Math.ceil(length * 5) + (points.length - 2) * 8);
  return { geo: new THREE.TubeGeometry(path, segs, radius, radial, false), length };
}

const BODY_COLOR = "#9aa5b1";

interface PipeProps {
  edgeId: string;
  points: Vec3[];
  diameter: number;
  visual: FlowVisual;
  flow: number;
  nominal: number;
  showFlow: boolean;
  highlighted: boolean;
  dimmed: boolean;
  interactive: boolean;
}

function PipeRun({ edgeId, points, diameter, visual, flow, nominal, showFlow, highlighted, dimmed, interactive }: PipeProps) {
  const r = pipeRadius(diameter);
  const { geo, length } = useMemo(() => tubeFor(points, r), [points, r]);
  const flowGeo = useMemo(() => tubeFor(points, r * 1.14, 10).geo, [points, r]);
  const pickGeo = useMemo(() => (interactive ? tubeFor(points, r + 0.14, 6).geo : null), [points, r, interactive]);
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color: BODY_COLOR, metalness: 0.8, roughness: 0.32, emissive: new THREE.Color("#000"), emissiveIntensity: 0.4 }), []);
  const overlay = useMemo(() => flowMaterial(), []);
  const select = useAppStore((s) => s.select);
  const hover = useAppStore((s) => s.hover);

  useEffect(
    () => () => {
      geo.dispose();
      flowGeo.dispose();
      pickGeo?.dispose();
      body.dispose();
      overlay.dispose();
    },
    [geo, flowGeo, pickGeo, body, overlay],
  );

  const color = FLOW_VISUAL_HEX[visual];
  useEffect(() => {
    overlay.uniforms.uColor.value.set(color);
    overlay.uniforms.uLength.value = length;
    overlay.uniforms.uPhase.value = (edgeId.charCodeAt(4) % 7) * 0.13;
  }, [color, length, overlay, edgeId]);

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 5);
    const flowing = visual === "normal" || visual === "backup" || visual === "limited" || visual === "return";
    const mode = flowing && flow > 0.5 ? 0 : visual === "interrupted" || visual === "upstream" ? 1 : 2;
    overlay.uniforms.uMode.value = mode;
    overlay.uniforms.uTime.value = sceneFx.time;
    const speed = 1.8 * Math.min(1.6, flow / Math.max(nominal, 120));
    // Reduced motion: pulses hold still; their sharp leading edge still shows direction.
    overlay.uniforms.uSpeed.value = sceneFx.motion < 0.5 ? 0 : speed;
    const target = (showFlow ? 1 : 0) * (dimmed ? 0.18 : highlighted ? 1.35 : 1);
    overlay.uniforms.uIntensity.value += (target - overlay.uniforms.uIntensity.value) * k;
    overlay.uniforms.uHighlight.value = highlighted ? 0.6 : 0;
    // Body carries a restrained tint of the state colour.
    body.emissive.set(color);
    const glow = visual === "standby" ? 0 : visual === "interrupted" ? 0.25 + 0.25 * sceneFx.pulse : 0.12;
    body.emissiveIntensity = dimmed ? glow * 0.2 : highlighted ? glow + 0.25 : glow;
    body.color.set(dimmed ? "#5b636d" : BODY_COLOR);
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    select(edgeId);
  };

  return (
    <group>
      <Select enabled={highlighted}>
        <mesh geometry={geo} material={body} raycast={() => null} />
      </Select>
      <mesh geometry={flowGeo} material={overlay} renderOrder={5} raycast={() => null} />
      {pickGeo && (
        <mesh
          geometry={pickGeo}
          onClick={onClick}
          onPointerOver={(e) => {
            e.stopPropagation();
            hover(edgeId);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            hover(null);
            document.body.style.cursor = "";
          }}
        >
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
    </group>
  );
}

function headerVisual(j: JunctionConfig, visuals: Record<string, FlowVisual>, flows: Record<string, number>): { visual: FlowVisual; flow: number } {
  const outs = outgoing(j.id);
  const best = outs.reduce<{ id: string; flow: number } | null>((acc, e) => ((flows[e.id] ?? 0) > (acc?.flow ?? -1) ? { id: e.id, flow: flows[e.id] ?? 0 } : acc), null);
  if (!best) return { visual: "standby", flow: 0 };
  return { visual: visuals[best.id], flow: outs.reduce((s, e) => s + (flows[e.id] ?? 0), 0) };
}

export function Pipes({ showFlow, trace, interactive, incidentMode }: { showFlow: boolean; trace: TraceSet; interactive: boolean; incidentMode: boolean }) {
  const sim = useAppStore((s) => s.sim);
  const selectedId = useAppStore((s) => s.selectedId);
  const hoveredId = useAppStore((s) => s.hoveredId);

  const visuals = useMemo(() => {
    const out: Record<string, FlowVisual> = {};
    for (const e of EDGES) out[e.id] = edgeVisual(sim, e.id, e.from, e.to, e.kind, BASELINE_FLOW[e.id] ?? 0);
    return out;
  }, [sim]);

  return (
    <group>
      {PIPE_ROUTES.map((route) => {
        const e = EDGE_BY_ID[route.edgeId];
        const highlighted = selectedId === e.id || hoveredId === e.id || (trace.active && trace.edges.has(e.id) && !incidentMode) || (incidentMode && trace.edges.has(e.id) && selectedId === e.id);
        const dimmed = trace.active && !trace.edges.has(e.id);
        return (
          <PipeRun
            key={route.edgeId}
            edgeId={e.id}
            points={route.points}
            diameter={e.diameter}
            visual={visuals[e.id]}
            flow={sim.edgeFlow[e.id] ?? 0}
            nominal={BASELINE_FLOW[e.id] ?? 0}
            showFlow={showFlow}
            highlighted={highlighted}
            dimmed={dimmed}
            interactive={interactive}
          />
        );
      })}
      {JUNCTIONS.filter((j) => j.manifold).map((j) => {
        const hv = headerVisual(j, visuals, sim.edgeFlow);
        const dimmed = trace.active && !trace.nodes.has(j.id);
        return (
          <PipeRun
            key={j.id}
            edgeId={j.id}
            points={j.manifold!}
            diameter={320}
            visual={hv.visual}
            flow={hv.flow}
            nominal={Math.max(hv.flow, 300)}
            showFlow={showFlow}
            highlighted={selectedId === j.id || hoveredId === j.id}
            dimmed={dimmed}
            interactive={interactive}
          />
        );
      })}
    </group>
  );
}
