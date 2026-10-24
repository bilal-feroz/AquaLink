/**
 * Recommended maintenance tasks generated for an incident.
 *
 * These are decision-support checklists for technicians. They do not operate
 * equipment; every physical action happens on site under approved procedures.
 */
import { CURRENT_USER } from "@/lib/data/facility";
import type { IncidentRuntime } from "@/lib/simulation/engine";
import { PUMP_BY_ID, TANK_BY_ID, downstreamTanks, tankInfrastructure } from "@/lib/topology/graph";
import type { MaintenanceTask } from "./types";

function names(ids: string[]) {
  const n = ids.map((id) => TANK_BY_ID[id]?.name ?? id);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

export function generateTasks(inc: IncidentRuntime, now: number): MaintenanceTask[] {
  const root = PUMP_BY_ID[inc.rootAssetId];
  const tanks = inc.affectedTankIds.length ? inc.affectedTankIds : downstreamTanks(inc.rootAssetId);
  const tankNames = names(tanks);
  const backup = inc.backupPumpId ? PUMP_BY_ID[inc.backupPumpId] : undefined;
  const flowSensors = tanks.map((id) => `FT-${TANK_BY_ID[id].code}`);
  const doSensors = tanks.map((id) => `DO-${TANK_BY_ID[id].code}`);
  const transferValve = tanks.length ? tankInfrastructure(tanks[0]).valves.find((v) => v.startsWith("V-3")) : undefined;

  const base = (n: number) => `TSK-${inc.number}-${n}`;
  const mk = (n: number, t: Omit<MaintenanceTask, "id" | "incidentId" | "status" | "notes" | "history" | "createdAt" | "steps"> & { steps: string[] }): MaintenanceTask => ({
    ...t,
    id: base(n),
    incidentId: inc.id,
    status: "open",
    notes: [],
    createdAt: now,
    history: [{ at: now, by: "AquaLink", action: `Generated from ${inc.id}` }],
    steps: t.steps.map((label, i) => ({ id: `${base(n)}-s${i + 1}`, label, done: false })),
  });

  const tasks: MaintenanceTask[] = [];
  if (backup) {
    tasks.push(
      mk(1, {
        templateId: "verify-backup",
        title: `Verify ${backup.code} backup operation and actual flow`,
        description: `${backup.code} is carrying the loop at ${Math.round((backup.backupOutputFraction ?? 1) * 100)}% of rated output. Confirm it is running as reported and that delivered flow matches the simulated readings.`,
        priority: 1,
        assetIds: [backup.id, ...(transferValve ? [transferValve] : []), ...flowSensors],
        steps: [
          `Confirm ${backup.code} running state and discharge pressure at the local panel`,
          `Check ${transferValve ?? "the transfer valve"} is fully open`,
          `Compare ${flowSensors.join(" / ")} readings with the backup setpoint`,
          `Check ${backup.code} for abnormal noise, vibration or temperature`,
        ],
      }),
    );
  } else {
    tasks.push(
      mk(1, {
        templateId: "emergency-circulation",
        title: `Establish emergency circulation for ${tankNames}`,
        description: `No configured backup pump serves ${tankNames}. Arrange temporary circulation or aeration under the approved emergency procedure.`,
        priority: 1,
        assetIds: [...tanks],
        steps: ["Deploy temporary aeration per SOP", "Confirm dissolved oxygen trend", "Notify duty manager"],
      }),
    );
  }
  tasks.push(
    mk(2, {
      templateId: "inspect-root",
      title: `Inspect ${root.code} motor and electrical fault indications`,
      description: `${inc.diagnosis.label} (${inc.diagnosis.confidence}). ${inc.diagnosis.evidence}`,
      priority: 2,
      assetIds: [root.id, `CT-${root.code}`],
      steps: [
        `Apply lock-out / tag-out to ${root.code} per site procedure`,
        "Record overload relay and drive fault codes",
        "Inspect motor terminal box and supply cabling",
        "Insulation resistance test on motor windings",
        "Check coupling and bearings for seizure or damage",
      ],
    }),
    mk(3, {
      templateId: "confirm-readings",
      title: `Confirm circulation readings for ${tankNames}`,
      description: "Cross-check simulated circulation and water quality against local instruments and animal behaviour.",
      priority: 2,
      assetIds: [...tanks, ...flowSensors, ...doSensors],
      steps: [
        ...tanks.map((id) => `Verify inlet flow at ${TANK_BY_ID[id].name}`),
        `Spot-check dissolved oxygen in ${tankNames}`,
        "Observe animal behaviour with the duty aquarist",
      ],
    }),
    mk(4, {
      templateId: "escalate",
      title: "Escalate unresolved risks per approved operating procedures",
      description: "Follow the site escalation procedure. AquaLink does not authorise remote operation of life-support equipment.",
      priority: 3,
      assetIds: [root.id, ...tanks],
      steps: [
        `Notify duty manager: ${root.code} out of service${backup ? `, ${backup.code} on backup duty` : ""}`,
        "Notify curator if dissolved oxygen nears habitat minimum or backup is lost",
        "Agree contingency (temporary pump / aeration) and time limit",
      ],
    }),
    mk(5, {
      templateId: "record",
      title: "Record observations and maintenance findings",
      description: "Capture what was found and done so the next shift can continue without re-diagnosing.",
      priority: 4,
      assetIds: [root.id],
      steps: ["Log observations against the incident", "Attach diagnostic findings to the work order", "Update shift handover notes"],
    }),
  );
  return tasks;
}

export const TASK_STATUS_LABEL: Record<MaintenanceTask["status"], string> = {
  open: "Open",
  "in-progress": "In progress",
  blocked: "Blocked",
  done: "Done",
};

export const SYSTEM_ACTOR = "AquaLink";
export const ME = CURRENT_USER;
