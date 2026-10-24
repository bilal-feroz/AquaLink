/**
 * Fault / heal propagation wave. When a scenario fault opens (or service is
 * restored) a coloured front travels from the root asset down every dependent
 * pipe at a fixed speed, so you can watch what else is affected.
 */
import { EDGES, TANKS } from "@/lib/data/facility";
import { EDGE_BY_ID, ROUTE_BY_EDGE, outgoing } from "@/lib/topology/graph";
import type { Vec3 } from "@/lib/types";

export const WAVE_SPEED = 13; // metres per second along the pipe network

export const waveFx = {
  active: false,
  kind: "fault" as "fault" | "heal",
  start: 0,
  rootId: "",
  /** Distance from the root at which each edge starts. */
  edgeStart: {} as Record<string, number>,
  /** Distance from the root at which each reached tank is fed. */
  tankAt: {} as Record<string, number>,
  maxDist: 0,
};

function polylineLength(points: Vec3[]) {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]);
  return l;
}

export const EDGE_LENGTH: Record<string, number> = Object.fromEntries(EDGES.map((e) => [e.id, ROUTE_BY_EDGE[e.id] ? polylineLength(ROUTE_BY_EDGE[e.id].points) : 0]));

/** Shortest path distances from a root over suction + supply edges. */
export function waveDistances(rootId: string) {
  const edgeStart: Record<string, number> = {};
  const nodeDist: Record<string, number> = { [rootId]: 0 };
  const tankAt: Record<string, number> = {};
  const queue = [rootId];
  while (queue.length) {
    const n = queue.shift()!;
    for (const e of outgoing(n, ["suction", "supply"])) {
      const start = nodeDist[n];
      if (edgeStart[e.id] === undefined || start < edgeStart[e.id]) edgeStart[e.id] = start;
      const end = start + EDGE_LENGTH[e.id];
      if (nodeDist[e.to] === undefined || end < nodeDist[e.to]) {
        nodeDist[e.to] = end;
        queue.push(e.to);
      }
    }
  }
  for (const t of TANKS) if (nodeDist[t.id] !== undefined) tankAt[t.id] = nodeDist[t.id];
  const maxDist = Math.max(0, ...Object.keys(edgeStart).map((id) => edgeStart[id] + EDGE_LENGTH[EDGE_BY_ID[id].id]));
  return { edgeStart, tankAt, maxDist };
}

export function startWave(kind: "fault" | "heal", rootId: string, now: number) {
  const d = waveDistances(rootId);
  Object.assign(waveFx, { active: true, kind, start: now, rootId, ...d });
}
