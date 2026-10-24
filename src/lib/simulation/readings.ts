/**
 * Simulated sensor readings derived from simulation state.
 *
 * Every panel, label and KPI that shows a measurement goes through these
 * functions, so a value is identical wherever it appears.
 * Measurement noise is a deterministic function of simulated time.
 */
import { LOOPS, SENSORS, TANKS } from "@/lib/data/facility";
import { FILTER_BY_ID, PUMP_BY_ID, SENSOR_BY_ID, TANK_BY_ID } from "@/lib/topology/graph";
import type { SensorConfig } from "@/lib/types";
import type { SimState } from "./engine";

function hash(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/** Deterministic, smooth noise in [-1, 1]. */
export function noise(id: string, t: number) {
  const seed = hash(id) * 100;
  return 0.6 * Math.sin(t * 0.013 + seed) + 0.4 * Math.sin(t * 0.031 + seed * 1.7);
}

export interface TankReading {
  temp: number;
  ph: number;
  dissolvedO2: number;
  /** Measured inlet flow, m³/h. */
  flow: number;
  /** Circulation as % of design (hydraulic model value). */
  flowPct: number;
}

export function tankReading(s: SimState, tankId: string): TankReading {
  const tk = s.tanks[tankId];
  return {
    temp: tk.temp + 0.015 * noise(`TT-${tankId}`, s.t),
    ph: tk.ph + 0.008 * noise(`AT-${tankId}`, s.t),
    dissolvedO2: tk.dissolvedO2 + 0.03 * noise(`DO-${tankId}`, s.t),
    flow: tk.flow > 0.5 ? tk.flow * (1 + 0.004 * noise(`FT-${tankId}`, s.t)) : 0,
    flowPct: tk.flowPct,
  };
}

export interface PumpReading {
  /** Fraction of rated output currently produced. */
  output: number;
  delivered: number;
  currentPct: number;
  currentAmps: number;
  pressureBar: number;
}

export function pumpReading(s: SimState, pumpId: string): PumpReading {
  const p = s.pumps[pumpId];
  const cfg = PUMP_BY_ID[pumpId];
  const delivered = s.pumpDelivered[pumpId] ?? 0;
  const currentPct = p.motorCurrent > 0 ? p.motorCurrent * (1 + 0.006 * noise(`CT-${pumpId}`, s.t)) : 0;
  const load = delivered / cfg.ratedFlow;
  const pressureBar = 0.35 + 2.6 * load * load + (p.mode === "running" ? 0.02 * noise(`PT-${pumpId}`, s.t) : 0);
  return {
    output: p.output,
    delivered,
    currentPct,
    currentAmps: (currentPct / 100) * cfg.fla,
    pressureBar,
  };
}

export function filterReading(s: SimState, filterId: string) {
  const f = FILTER_BY_ID[filterId];
  const flow = s.nodeFlow[filterId] ?? 0;
  const loop = LOOPS.find((l) => l.id === f.loopId);
  const design = TANKS.filter((t) => loop?.tankIds.includes(t.id)).reduce((sum, t) => sum + t.designFlow, 0) || 1;
  // Clean-bed differential pressure rises with the square of throughput.
  const k = flow / design;
  return { flow, dpKpa: 18 + 30 * k * k + 0.3 * noise(`DPT-${filterId}`, s.t) };
}

export interface SensorValue {
  sensor: SensorConfig;
  value: number;
  display: string;
}

export function sensorValue(s: SimState, sensorId: string): SensorValue {
  const sensor = SENSOR_BY_ID[sensorId];
  let value = 0;
  let digits = 1;
  switch (sensor.kind) {
    case "temperature":
      value = tankReading(s, sensor.assetId).temp;
      break;
    case "ph":
      value = tankReading(s, sensor.assetId).ph;
      digits = 2;
      break;
    case "dissolved-o2":
      value = tankReading(s, sensor.assetId).dissolvedO2;
      digits = 2;
      break;
    case "flow":
      value = tankReading(s, sensor.assetId).flow;
      digits = 0;
      break;
    case "motor-current":
      value = pumpReading(s, sensor.assetId).currentPct;
      digits = 0;
      break;
    case "pressure":
      value = pumpReading(s, sensor.assetId).pressureBar;
      digits = 2;
      break;
    case "diff-pressure":
      value = filterReading(s, sensor.assetId).dpKpa;
      digits = 1;
      break;
  }
  return { sensor, value, display: `${value.toFixed(digits)} ${sensor.unit}` };
}

export function sensorsFor(assetId: string) {
  return SENSORS.filter((x) => x.assetId === assetId);
}

export function tankThresholdState(tankId: string, r: TankReading) {
  const h = TANK_BY_ID[tankId].habitat;
  return {
    temp: r.temp < h.tempRange[0] || r.temp > h.tempRange[1] ? "out" : "ok",
    ph: r.ph < h.phRange[0] || r.ph > h.phRange[1] ? "out" : "ok",
    dissolvedO2: r.dissolvedO2 < h.doMin ? "out" : "ok",
  } as const;
}
