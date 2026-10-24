/**
 * Holder for the mutable simulation engine state. The store publishes
 * immutable snapshots of it; nothing outside the store mutates it.
 */
import { createInitialState, replay, type SimCommand, type SimState } from "@/lib/simulation/engine";

let engine: SimState = createInitialState();

export function getEngine() {
  return engine;
}

export function setEngine(s: SimState) {
  engine = s;
}

export function rebuildEngine(commands: SimCommand[], t: number) {
  engine = replay(commands, t);
  return engine;
}

/** Shallow-but-safe copy for publishing into React state. */
export function snapshot(s: SimState): SimState {
  const clone = <T extends object>(rec: Record<string, T>) => {
    const out: Record<string, T> = {};
    for (const k in rec) out[k] = { ...rec[k] };
    return out;
  };
  return {
    t: s.t,
    startedAt: s.startedAt,
    pumps: clone(s.pumps),
    valves: clone(s.valves),
    tanks: clone(s.tanks),
    edgeFlow: { ...s.edgeFlow },
    pumpDelivered: { ...s.pumpDelivered },
    nodeFlow: { ...s.nodeFlow },
    events: s.events.map((e) => ({ ...e, assets: [...e.assets] })),
    incidents: s.incidents.map((i) => ({ ...i, affectedTankIds: [...i.affectedTankIds], diagnosis: { ...i.diagnosis } })),
    commands: s.commands.map((c) => ({ ...c })),
    // History is append-only; consumers key off its length.
    history: s.history.slice(),
    counters: { ...s.counters },
    prevFlow: { ...s.prevFlow },
  };
}
