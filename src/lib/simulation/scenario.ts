/**
 * Demonstration scenarios. A scenario is a command log replayed from the
 * healthy baseline at 10:00:00 simulated time, so presets are exact and
 * reproducible.
 */
import { SCENARIO_START } from "@/lib/data/facility";
import type { SimCommand, SimState } from "./engine";
import { SIM, activeIncidents } from "./engine";

export const hms = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s;

export interface ScenarioPreset {
  id: "baseline" | "incident" | "stabilizing";
  label: string;
  description: string;
  commands: SimCommand[];
  target: number;
}

/** Injecting at 10:09:56 makes C-2 trip at 10:10:00 after the 4 s overcurrent build-up. */
const C2_FAULT_AT = hms(10, 10) - SIM.tripDurationSec;

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
    label: "Reference incident (10:24)",
    description: "C-2 tripped at 10:10, C-3 backup carrying Loop 2, Tanks B and C at partial circulation.",
    commands: [{ t: C2_FAULT_AT, type: "inject-fault", assetId: "PMP-C2" }],
    target: hms(10, 24),
  },
  {
    id: "stabilizing",
    label: "Fault onset (10:10)",
    description: "Moments after the C-2 trip, before the backup has started.",
    commands: [{ t: C2_FAULT_AT, type: "inject-fault", assetId: "PMP-C2" }],
    target: hms(10, 10, 20),
  },
];

export type ScenarioStage = "baseline" | "fault" | "backup" | "stabilized" | "recovering" | "recovered";

export function scenarioStage(s: SimState): ScenarioStage {
  const active = activeIncidents(s);
  if (active.length === 0) return s.incidents.length ? "recovered" : "baseline";
  const inc = active[active.length - 1];
  if (inc.status === "recovering") return "recovering";
  if (inc.stabilizedAt) return "stabilized";
  if (inc.backupStartedAt) return "backup";
  return "fault";
}
