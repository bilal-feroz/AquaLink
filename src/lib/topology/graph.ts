/**
 * Facility dependency graph.
 *
 * Nodes are physical assets (filters, pumps, valves, junctions, tanks).
 * Edges are pipes, directed in the direction of water flow. The physical
 * routing of each pipe lives in PIPE_ROUTES and is joined here by edge id.
 */
import {
  EDGES,
  FILTERS,
  FLOOR_BY_ID,
  JUNCTIONS,
  LOOPS,
  PIPE_ROUTES,
  PUMPS,
  SENSORS,
  TANKS,
  VALVES,
} from "@/lib/data/facility";
import type {
  AssetKind,
  EdgeConfig,
  FilterConfig,
  FloorId,
  JunctionConfig,
  PipeRoute,
  PumpConfig,
  SensorConfig,
  TankConfig,
  ValveConfig,
  Vec3,
} from "@/lib/types";

export interface AssetRecord {
  id: string;
  kind: AssetKind;
  code: string;
  name: string;
  floor: FloorId;
  position: Vec3;
  loopId?: string;
}

export const TANK_BY_ID: Record<string, TankConfig> = Object.fromEntries(TANKS.map((t) => [t.id, t]));
export const PUMP_BY_ID: Record<string, PumpConfig> = Object.fromEntries(PUMPS.map((p) => [p.id, p]));
export const FILTER_BY_ID: Record<string, FilterConfig> = Object.fromEntries(FILTERS.map((f) => [f.id, f]));
export const VALVE_BY_ID: Record<string, ValveConfig> = Object.fromEntries(VALVES.map((v) => [v.id, v]));
export const JUNCTION_BY_ID: Record<string, JunctionConfig> = Object.fromEntries(JUNCTIONS.map((j) => [j.id, j]));
export const SENSOR_BY_ID: Record<string, SensorConfig> = Object.fromEntries(SENSORS.map((s) => [s.id, s]));
export const EDGE_BY_ID: Record<string, EdgeConfig> = Object.fromEntries(EDGES.map((e) => [e.id, e]));
export const ROUTE_BY_EDGE: Record<string, PipeRoute> = Object.fromEntries(PIPE_ROUTES.map((r) => [r.edgeId, r]));

function loopOfTank(id: string) {
  return LOOPS.find((l) => l.tankIds.includes(id))?.id;
}

function midpoint(points: Vec3[]): Vec3 {
  // Point halfway along the polyline (by length).
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    lens.push(l);
    total += l;
  }
  let target = total / 2;
  for (let i = 1; i < points.length; i++) {
    const l = lens[i - 1];
    if (target <= l) {
      const a = points[i - 1];
      const b = points[i];
      const k = l === 0 ? 0 : target / l;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    target -= l;
  }
  return points[points.length - 1];
}

function floorForPos([, y, z]: Vec3): FloorId {
  // Everything behind the atrium's back wall is the back-of-house plant hall.
  if (z < -16.2) return "PL";
  if (y < 0) return "L1";
  if (y < 5.5) return "L1";
  if (y < 11.5) return "L2";
  return "L3";
}

const assetList: AssetRecord[] = [
  ...TANKS.map((t) => ({ id: t.id, kind: "tank" as const, code: t.code, name: t.name, floor: t.floor, position: t.position, loopId: loopOfTank(t.id) })),
  ...PUMPS.map((p) => ({ id: p.id, kind: "pump" as const, code: p.code, name: p.name, floor: p.floor, position: p.position, loopId: p.loopId })),
  ...FILTERS.map((f) => ({ id: f.id, kind: "filter" as const, code: f.code, name: f.name, floor: f.floor, position: f.position, loopId: f.loopId })),
  ...VALVES.map((v) => ({ id: v.id, kind: "valve" as const, code: v.code, name: v.name, floor: v.floor, position: v.position })),
  ...JUNCTIONS.map((j) => ({ id: j.id, kind: "junction" as const, code: j.code, name: j.name, floor: j.floor, position: j.position })),
  ...SENSORS.map((s) => ({ id: s.id, kind: "sensor" as const, code: s.code, name: s.name, floor: s.floor, position: s.position })),
  ...EDGES.map((e) => {
    const route = ROUTE_BY_EDGE[e.id];
    const pos = route ? midpoint(route.points) : ([0, 0, 0] as Vec3);
    return {
      id: e.id,
      kind: "pipe" as const,
      code: e.id,
      name: `${shortName(e.from)} → ${shortName(e.to)}`,
      floor: floorForPos(pos),
      position: pos,
    };
  }),
];

function shortName(id: string): string {
  if (TANK_BY_ID[id]) return TANK_BY_ID[id].name;
  if (PUMP_BY_ID[id]) return PUMP_BY_ID[id].code;
  if (FILTER_BY_ID[id]) return FILTER_BY_ID[id].code;
  if (VALVE_BY_ID[id]) return VALVE_BY_ID[id].code;
  if (JUNCTION_BY_ID[id]) return JUNCTION_BY_ID[id].code;
  return id;
}

export const ASSETS: AssetRecord[] = assetList;
export const ASSET_BY_ID: Record<string, AssetRecord> = Object.fromEntries(assetList.map((a) => [a.id, a]));

export function assetLabel(id: string): string {
  const a = ASSET_BY_ID[id];
  if (!a) return id;
  if (a.kind === "pipe") return `${a.code} (${a.name})`;
  if (a.kind === "tank" || a.kind === "pump") return a.name;
  return `${a.code} · ${a.name}`;
}

export function assetShort(id: string): string {
  return shortName(id);
}

export function floorName(id: FloorId) {
  return FLOOR_BY_ID[id].name;
}

// ---------------------------------------------------------------------------
// Adjacency

const outIndex = new Map<string, EdgeConfig[]>();
const inIndex = new Map<string, EdgeConfig[]>();
for (const e of EDGES) {
  if (!outIndex.has(e.from)) outIndex.set(e.from, []);
  if (!inIndex.has(e.to)) inIndex.set(e.to, []);
  outIndex.get(e.from)!.push(e);
  inIndex.get(e.to)!.push(e);
}

export function outgoing(id: string, kinds?: EdgeConfig["kind"][]): EdgeConfig[] {
  const list = outIndex.get(id) ?? [];
  return kinds ? list.filter((e) => kinds.includes(e.kind)) : list;
}

export function incoming(id: string, kinds?: EdgeConfig["kind"][]): EdgeConfig[] {
  const list = inIndex.get(id) ?? [];
  return kinds ? list.filter((e) => kinds.includes(e.kind)) : list;
}

const FORWARD: EdgeConfig["kind"][] = ["suction", "supply"];

/** All edges reachable downstream of `id` along suction + supply edges. */
export function downstreamEdges(id: string): EdgeConfig[] {
  const seen = new Set<string>();
  const out: EdgeConfig[] = [];
  const stack = [id];
  while (stack.length) {
    const n = stack.pop()!;
    for (const e of outgoing(n, FORWARD)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
      stack.push(e.to);
    }
  }
  return out;
}

/** Tanks that depend on `id` for supply (downstream along supply edges). */
export function downstreamTanks(id: string): string[] {
  if (TANK_BY_ID[id]) return [id];
  const tanks = new Set<string>();
  for (const e of downstreamEdges(id)) if (TANK_BY_ID[e.to]) tanks.add(e.to);
  return [...tanks].sort();
}

/** Edges upstream of a node along supply/suction edges. */
export function upstreamEdges(id: string): EdgeConfig[] {
  const seen = new Set<string>();
  const out: EdgeConfig[] = [];
  const stack = [id];
  while (stack.length) {
    const n = stack.pop()!;
    for (const e of incoming(n, FORWARD)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
      stack.push(e.from);
    }
  }
  return out;
}

/** Supply edges on the path(s) from a source node to a tank. */
export function pathEdges(fromId: string, tankId: string): EdgeConfig[] {
  const down = new Set(downstreamEdges(fromId).map((e) => e.id));
  return upstreamEdges(tankId).filter((e) => down.has(e.id));
}

export interface TankInfrastructure {
  primaryPumps: string[];
  backupPumps: string[];
  filterId?: string;
  supplyEdges: EdgeConfig[];
  returnEdges: EdgeConfig[];
  valves: string[];
  junctions: string[];
  sensors: string[];
}

export function tankInfrastructure(tankId: string): TankInfrastructure {
  const up = upstreamEdges(tankId);
  const nodes = new Set<string>();
  for (const e of up) {
    nodes.add(e.from);
    nodes.add(e.to);
  }
  const pumps = [...nodes].filter((n) => PUMP_BY_ID[n]);
  const ret: EdgeConfig[] = [];
  const stack = [tankId];
  const seen = new Set<string>();
  while (stack.length) {
    const n = stack.pop()!;
    for (const e of outgoing(n, ["return"])) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      ret.push(e);
      stack.push(e.to);
    }
  }
  return {
    primaryPumps: pumps.filter((p) => PUMP_BY_ID[p].role === "primary"),
    backupPumps: pumps.filter((p) => PUMP_BY_ID[p].role === "backup"),
    filterId: [...nodes].find((n) => FILTER_BY_ID[n]),
    supplyEdges: up.filter((e) => e.kind === "supply"),
    returnEdges: ret,
    valves: [...nodes].filter((n) => VALVE_BY_ID[n]),
    junctions: [...nodes].filter((n) => JUNCTION_BY_ID[n]),
    sensors: SENSORS.filter((s) => s.assetId === tankId).map((s) => s.id),
  };
}

/** Topological order of nodes over suction + supply edges (sources first). */
export const SUPPLY_TOPO_ORDER: string[] = (() => {
  const nodes = new Set<string>();
  const indeg = new Map<string, number>();
  for (const e of EDGES) {
    if (!FORWARD.includes(e.kind)) continue;
    nodes.add(e.from);
    nodes.add(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const queue = [...nodes].filter((n) => !indeg.get(n)).sort();
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const e of outgoing(n, FORWARD)) {
      const d = (indeg.get(e.to) ?? 0) - 1;
      indeg.set(e.to, d);
      if (d === 0) queue.push(e.to);
    }
  }
  if (order.length !== nodes.size) throw new Error("Facility supply graph contains a cycle");
  return order;
})();

/** Every asset connected (one hop) to `id`, with the connecting edge. */
export function neighbours(id: string): { edge: EdgeConfig; other: string; direction: "in" | "out" }[] {
  return [
    ...incoming(id).map((edge) => ({ edge, other: edge.from, direction: "in" as const })),
    ...outgoing(id).map((edge) => ({ edge, other: edge.to, direction: "out" as const })),
  ];
}

export const NETWORK_COUNTS = {
  tanks: TANKS.length,
  pumps: PUMPS.length,
  filters: FILTERS.length,
  valves: VALVES.length,
  sensors: SENSORS.length,
  pipes: EDGES.length,
  loops: LOOPS.length,
};
