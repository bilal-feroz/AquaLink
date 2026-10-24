/**
 * Facility KPIs. All aggregates are documented here and computed only from
 * simulation state, so every panel reports the same numbers.
 *
 *  - Circulation (aggregate flow): equal-weighted mean of tank circulation %.
 *    (4 × 100 % + 45 % + 50 %) / 6 = 82.5 % → displayed as 83 %.
 *  - Flow shortfall: 100 − displayed aggregate (so the two always sum to 100).
 *    It is a shortfall in circulation, not a share of faulty equipment.
 *  - Average temperature: simple arithmetic mean of the six tank readings.
 *  - Mean pH: arithmetic mean of pH readings (indicative only; pH is logarithmic).
 *  - Circulation availability: share of sampled tank-time at or above the
 *    healthy flow threshold since the scenario started.
 */
import { FLOW_THRESHOLDS, LOOPS, TANKS } from "@/lib/data/facility";
import type { SimState } from "./engine";
import { tankReading } from "./readings";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export interface FacilityKpis {
  aggregateFlow: number;
  aggregateFlowDisplay: number;
  shortfallDisplay: number;
  healthyCount: number;
  reducedCount: number;
  offlineCount: number;
  affectedTankIds: string[];
  avgTemp: number;
  meanPh: number;
  meanDo: number;
  availability: number;
  activeLoops: number;
  totalLoops: number;
}

export function facilityKpis(s: SimState): FacilityKpis {
  const flows = TANKS.map((t) => s.tanks[t.id].flowPct);
  const readings = TANKS.map((t) => tankReading(s, t.id));
  const aggregate = mean(flows);
  const aggregateDisplay = Math.round(aggregate);
  const affected = TANKS.filter((t) => s.tanks[t.id].flowPct < FLOW_THRESHOLDS.healthy).map((t) => t.id);
  const offline = TANKS.filter((t) => s.tanks[t.id].flowPct < FLOW_THRESHOLDS.none).length;

  let ok = 0;
  let total = 0;
  for (const sample of s.history) {
    for (const f of sample.flows) {
      total += 1;
      if (f >= FLOW_THRESHOLDS.healthy) ok += 1;
    }
  }

  const activeLoops = LOOPS.filter((l) => l.tankIds.some((id) => s.tanks[id].flow > 0.5)).length;

  return {
    aggregateFlow: aggregate,
    aggregateFlowDisplay: aggregateDisplay,
    shortfallDisplay: 100 - aggregateDisplay,
    healthyCount: TANKS.length - affected.length,
    reducedCount: affected.length - offline,
    offlineCount: offline,
    affectedTankIds: affected,
    avgTemp: mean(readings.map((r) => r.temp)),
    meanPh: mean(readings.map((r) => r.ph)),
    meanDo: mean(readings.map((r) => r.dissolvedO2)),
    availability: total ? (ok / total) * 100 : 100,
    activeLoops,
    totalLoops: LOOPS.length,
  };
}
