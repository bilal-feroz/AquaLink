/**
 * Demonstration scenarios. A scenario is a command log replayed from the
 * healthy baseline at 10:00:00 simulated time, so presets are exact and
 * reproducible.
 */
import { SCENARIO_START } from "@/lib/data/facility";
import type { SimCommand, SimCommandType, SimState } from "./engine";
import { SIM, activeIncidents } from "./engine";

export const hms = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s;

export type ScenarioId = "pump-c2" | "filter-f1";

export interface ScenarioDef {
  id: ScenarioId;
  title: string;
  short: string;
  rootAssetId: string;
  command: SimCommandType;
  summary: string;
  heal: string;
  affects: string;
}

/** The two failure scenarios the demo can run. */
export const SCENARIOS: ScenarioDef[] = [
  {
    id: "pump-c2",
    title: "Pump C-2 motor fault",
    short: "Pump trip",
    rootAssetId: "PMP-C2",
    command: "inject-fault",
    summary: "C-2 trips on overcurrent. After 120 s, C-3 auto-transfer carries Loop 2 at 60 % of its rating.",
    heal: "Authorized C-2 restart",
    affects: "Tanks B and C",
  },
  {
    id: "filter-f1",
    title: "Sand filter F-1 blockage",
    short: "Filter clog",
    rootAssetId: "FLT-1",
    command: "inject-clog",
    summary: "F-1's bed blocks over 4 min. Differential pressure alarms and all of Loop 1 slips to degraded circulation.",
    heal: "Backwash F-1",
    affects: "Tanks A, D, E and F",
  },
];

export interface ScenarioPreset {
  id: "baseline" | "incident" | "stabilizing" | "filter";
  label: string;
  description: string;
  commands: SimCommand[];
  target: number;
}

/** Injecting at 10:09:56 makes C-2 trip at 10:10:00 after the 4 s overcurrent build-up. */
const C2_FAULT_AT = hms(10, 10) - SIM.tripDurationSec;
const F1_CLOG_AT = hms(10, 4);

export const PRESETS: ScenarioPreset[] = [
  {
    id: "baseline",
    label: "Healthy baseline",
    description: "All pumps in normal duty, every tank at design circulation, no incidents.",
    commands: [],
    target: SCENARIO_START,
  },
  {
    id: "incident",
    label: "Pump C-2 fault (10:24)",
    description: "C-2 tripped at 10:10, C-3 backup carrying Loop 2, Tanks B and C at partial circulation.",
    commands: [{ t: C2_FAULT_AT, type: "inject-fault", assetId: "PMP-C2" }],
    target: hms(10, 24),
  },
  {
    id: "stabilizing",
    label: "Pump fault onset (10:10)",
    description: "Moments after the C-2 trip, before the backup has started.",
    commands: [{ t: C2_FAULT_AT, type: "inject-fault", assetId: "PMP-C2" }],
    target: hms(10, 10, 20),
  },
  {
    id: "filter",
    label: "Filter F-1 blockage (10:20)",
    description: "F-1 started blocking at 10:04; Loop 1 tanks at degraded circulation.",
    commands: [{ t: F1_CLOG_AT, type: "inject-clog", assetId: "FLT-1" }],
    target: hms(10, 20),
  },
];

export type ScenarioStage = "baseline" | "fault" | "backup" | "stabilized" | "recovering" | "recovered";

export function scenarioStage(s: SimState): ScenarioStage {
  const active = activeIncidents(s);
  const building = Object.values(s.filters ?? {}).some((f) => f.clogTarget > 0 && !f.backwashing) || Object.values(s.pumps).some((p) => p.mode === "tripping");
  if (active.length === 0) return building ? "fault" : s.incidents.length ? "recovered" : "baseline";
  const inc = active[active.length - 1];
  if (inc.status === "recovering") return "recovering";
  if (inc.stabilizedAt) return "stabilized";
  if (inc.backupStartedAt) return "backup";
  return "fault";
}

/** The scenario behind the newest active incident, if any. */
export function activeScenario(s: SimState): ScenarioDef | undefined {
  const inc = activeIncidents(s).slice(-1)[0];
  const root = inc?.rootAssetId ?? Object.values(s.filters ?? {}).find((f) => f.clogTarget > 0)?.id ?? Object.values(s.pumps).find((p) => p.mode === "tripping")?.id;
  return SCENARIOS.find((d) => d.rootAssetId === root);
}
