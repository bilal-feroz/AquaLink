/**
 * Steady-state hydraulic solver for the circulation network.
 *
 * Model (deliberately simple, documented in docs/SIMULATION.md):
 *  - Each running pump *offers* flow = output fraction × rated flow.
 *  - Flow travels along supply edges in topological order.
 *  - A closed valve blocks flow. Open valves pass flow unchanged.
 *  - Each tank branch has a flow-control limit equal to the tank's design flow.
 *  - At a header, offered flow is shared between branches by branch weight
 *    ("water-filling"): a branch that reaches its limit is capped and the
 *    remainder is shared among the others. Unused flow is recirculated.
 *  - Pumps then *deliver* only what the network accepted (back-propagated).
 *  - Return and suction flows follow from mass balance.
 */
import { EDGES } from "@/lib/data/facility";
import {
  JUNCTION_BY_ID,
  PUMP_BY_ID,
  SUPPLY_TOPO_ORDER,
  TANK_BY_ID,
  VALVE_BY_ID,
  incoming,
  outgoing,
} from "@/lib/topology/graph";

export interface HydraulicInput {
  /** Flow offered by each pump, m³/h. */
  pumpOffered: Record<string, number>;
  /** Valve open fraction 0..1. A valve with 0 blocks flow. */
  valveOpen: Record<string, number>;
}

export interface HydraulicResult {
  edgeFlow: Record<string, number>;
  tankFlow: Record<string, number>;
  pumpDelivered: Record<string, number>;
  /** Offered but not accepted at each header (recirculated / throttled). */
  recirculated: Record<string, number>;
  nodeFlow: Record<string, number>;
}

interface FillItem {
  key: string;
  cap: number;
  weight: number;
}

/** Share `amount` across items by weight, capping each at `cap`. */
export function waterFill(amount: number, items: FillItem[]): Record<string, number> {
  const alloc: Record<string, number> = Object.fromEntries(items.map((i) => [i.key, 0]));
  let remaining = amount;
  let active = items.filter((i) => i.cap > 1e-9 && i.weight > 0);
  for (let guard = 0; guard < items.length + 2 && remaining > 1e-9 && active.length; guard++) {
    const totalW = active.reduce((s, i) => s + i.weight, 0);
    const saturated = active.filter((i) => alloc[i.key] + (remaining * i.weight) / totalW >= i.cap - 1e-9);
    if (saturated.length === 0) {
      for (const i of active) alloc[i.key] += (remaining * i.weight) / totalW;
      remaining = 0;
      break;
    }
    for (const i of saturated) {
      remaining -= i.cap - alloc[i.key];
      alloc[i.key] = i.cap;
    }
    active = active.filter((i) => !saturated.includes(i));
  }
  return alloc;
}

const SUPPLY = ["supply"] as const;

export function solveHydraulics(input: HydraulicInput): HydraulicResult {
  const capMemo = new Map<string, number>();
  const isOpen = (id: string) => (VALVE_BY_ID[id] ? (input.valveOpen[id] ?? 0) > 0.02 : true);

  // Maximum flow the subtree below a node can accept.
  const capacity = (id: string): number => {
    if (capMemo.has(id)) return capMemo.get(id)!;
    let c: number;
    if (TANK_BY_ID[id]) c = TANK_BY_ID[id].designFlow;
    else if (!isOpen(id)) c = 0;
    else c = outgoing(id, [...SUPPLY]).reduce((s, e) => s + capacity(e.to), 0);
    capMemo.set(id, c);
    return c;
  };

  const offered: Record<string, number> = {};
  const accepted: Record<string, number> = {};
  const recirculated: Record<string, number> = {};

  // Forward pass: offer flow downstream.
  for (const node of SUPPLY_TOPO_ORDER) {
    const outs = outgoing(node, [...SUPPLY]);
    let available: number;
    if (PUMP_BY_ID[node]) available = Math.max(0, input.pumpOffered[node] ?? 0);
    else available = incoming(node, [...SUPPLY]).reduce((s, e) => s + (offered[e.id] ?? 0), 0);

    if (TANK_BY_ID[node]) {
      accepted[node] = Math.min(available, TANK_BY_ID[node].designFlow);
      continue;
    }
    if (outs.length === 0) continue;
    if (!isOpen(node)) {
      for (const e of outs) offered[e.id] = 0;
      continue;
    }
    if (outs.length === 1) {
      const cap = capacity(outs[0].to);
      offered[outs[0].id] = available;
      if (available > cap) recirculated[node] = available - cap;
      continue;
    }
    const weights = JUNCTION_BY_ID[node]?.branchWeights ?? {};
    const alloc = waterFill(
      available,
      outs.map((e) => ({ key: e.id, cap: capacity(e.to), weight: weights[e.to] ?? 1 })),
    );
    let used = 0;
    for (const e of outs) {
      offered[e.id] = alloc[e.id];
      used += alloc[e.id];
    }
    if (available - used > 1e-6) recirculated[node] = available - used;
  }

  // Backward pass: every edge carries only what downstream actually accepted.
  const edgeFlow: Record<string, number> = {};
  const nodeFlow: Record<string, number> = {};
  const pumpDelivered: Record<string, number> = {};
  for (let i = SUPPLY_TOPO_ORDER.length - 1; i >= 0; i--) {
    const node = SUPPLY_TOPO_ORDER[i];
    let through: number;
    if (TANK_BY_ID[node]) through = accepted[node] ?? 0;
    else through = outgoing(node, [...SUPPLY]).reduce((s, e) => s + (edgeFlow[e.id] ?? 0), 0);
    nodeFlow[node] = through;
    if (PUMP_BY_ID[node]) pumpDelivered[node] = through;
    const ins = incoming(node, [...SUPPLY]);
    const offeredIn = ins.reduce((s, e) => s + (offered[e.id] ?? 0), 0);
    for (const e of ins) edgeFlow[e.id] = offeredIn > 1e-9 ? ((offered[e.id] ?? 0) / offeredIn) * through : 0;
  }

  // Suction side: each pump draws what it delivers; tees sum their branches.
  for (let i = SUPPLY_TOPO_ORDER.length - 1; i >= 0; i--) {
    const node = SUPPLY_TOPO_ORDER[i];
    for (const e of incoming(node, ["suction"])) {
      edgeFlow[e.id] = PUMP_BY_ID[node]
        ? pumpDelivered[node] ?? 0
        : outgoing(node, ["suction"]).reduce((s, o) => s + (edgeFlow[o.id] ?? 0), 0);
    }
  }

  // Return side: tanks drain what they receive; collectors and valves sum inflows.
  const returnEdges = EDGES.filter((e) => e.kind === "return");
  const returnIn: Record<string, number> = {};
  const pending = [...returnEdges];
  let progressed = true;
  while (pending.length && progressed) {
    progressed = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const e = pending[i];
      const from = e.from;
      let flow: number | undefined;
      if (TANK_BY_ID[from]) flow = accepted[from] ?? 0;
      else {
        const ins = incoming(from, ["return"]);
        if (ins.every((x) => edgeFlow[x.id] !== undefined)) flow = ins.reduce((s, x) => s + edgeFlow[x.id], 0);
      }
      if (flow !== undefined) {
        edgeFlow[e.id] = flow;
        returnIn[e.to] = (returnIn[e.to] ?? 0) + flow;
        pending.splice(i, 1);
        progressed = true;
      }
    }
  }
  for (const [node, flow] of Object.entries(returnIn)) if (!TANK_BY_ID[node]) nodeFlow[node] = Math.max(nodeFlow[node] ?? 0, flow);

  const tankFlow: Record<string, number> = {};
  for (const id of Object.keys(TANK_BY_ID)) tankFlow[id] = accepted[id] ?? 0;

  return { edgeFlow, tankFlow, pumpDelivered, recirculated, nodeFlow };
}
