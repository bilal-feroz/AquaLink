/**
 * Deterministic life-support simulation.
 *
 * The engine advances in fixed 1-second steps of *simulated* time. Its state is
 * fully determined by the initial state plus the command log, so any moment of
 * a scenario can be reproduced by replaying the same commands (see scenario.ts).
 *
 * Nothing here is wired to real equipment. All values are simulated.
 */
import { FILTERS, FLOW_THRESHOLDS, LOOPS, PUMPS, SCENARIO_START, TANKS, VALVES } from "@/lib/data/facility";
import { FILTER_BY_ID, PUMP_BY_ID, TANK_BY_ID, assetShort, downstreamTanks, outgoing } from "@/lib/topology/graph";
import { solveHydraulics } from "./hydraulics";

export type PumpMode = "running" | "standby" | "starting" | "tripping" | "fault" | "stopping";
export type CirculationStatus = "healthy" | "degraded" | "reduced" | "no-flow";
export type EventKind =
  | "fault"
  | "alarm"
  | "transfer"
  | "backup"
  | "stable"
  | "status"
  | "command"
  | "recovery"
  | "restored"
  | "resolved";
export type Severity = "critical" | "warning" | "info" | "ok";

export interface PumpRuntime {
  id: string;
  mode: PumpMode;
  /** Fraction of rated capacity currently produced (0..1). */
  output: number;
  /** Fraction of rated capacity the pump is driving towards. */
  setpoint: number;
  /** Motor current, % of full-load amps (before measurement noise). */
  motorCurrent: number;
  /** Peak motor current observed during the most recent trip, % FLA. */
  peakCurrent: number;
  modeSince: number;
  faultAt?: number;
  diagnosis?: "overcurrent" | "unknown";
  /** True while a backup pump is covering for a failed primary. */
  covering: boolean;
}

export interface ValveRuntime {
  id: string;
  open: number;
  commandedOpen: boolean;
}

export interface TankRuntime {
  id: string;
  flow: number;
  flowPct: number;
  temp: number;
  ph: number;
  dissolvedO2: number;
  status: CirculationStatus;
  belowSince?: number;
  restoredSince?: number;
  lowFlowAlarm: boolean;
  /** Since when circulation has sat in the degraded band (60–90 %). */
  degradedSince?: number;
  degradedAlarm: boolean;
}

export interface FilterRuntime {
  id: string;
  /** Media blockage, 0 = clean, 1 = fully blocked. */
  clog: number;
  clogTarget: number;
  /** Differential pressure across the bed, kPa (before measurement noise). */
  dp: number;
  highDpSince?: number;
  highDpAlarm: boolean;
  backwashing: boolean;
  backwashSince?: number;
}

export interface SimEvent {
  id: string;
  t: number;
  kind: EventKind;
  severity: Severity;
  title: string;
  detail?: string;
  assets: string[];
  incidentId?: string;
}

export interface IncidentRuntime {
  id: string;
  number: number;
  title: string;
  rootAssetId: string;
  openedAt: number;
  resolvedAt?: number;
  status: "active" | "recovering" | "resolved";
  /** Every tank downstream of the root asset that dropped below healthy flow. */
  affectedTankIds: string[];
  diagnosis: { label: string; confidence: "confirmed" | "suspected"; evidence: string };
  backupPumpId?: string;
  backupStartedAt?: number;
  backupConfirmedAt?: number;
  stabilizedAt?: number;
  lastStatusAt?: number;
  stableSince?: number;
  restoredSince?: number;
  recoveryCommandAt?: number;
}

export type SimCommandType = "inject-fault" | "recover" | "start-backup" | "inject-clog" | "backwash";

export interface SimCommand {
  t: number;
  type: SimCommandType;
  assetId: string;
}

export interface SimSample {
  t: number;
  /** Tank flow % in TANKS order. */
  flows: number[];
  /** Pump output (fraction of rated) in PUMPS order. */
  pumps: number[];
  temps: number[];
  dissolvedO2: number[];
}

export interface SimState {
  t: number;
  startedAt: number;
  pumps: Record<string, PumpRuntime>;
  filters: Record<string, FilterRuntime>;
  valves: Record<string, ValveRuntime>;
  tanks: Record<string, TankRuntime>;
  edgeFlow: Record<string, number>;
  pumpDelivered: Record<string, number>;
  nodeFlow: Record<string, number>;
  events: SimEvent[];
  incidents: IncidentRuntime[];
  commands: SimCommand[];
  history: SimSample[];
  counters: { event: number; incident: number };
  /** Tank flow % at the previous step (stability detection). */
  prevFlow: Record<string, number>;
}

/** Engine constants (demonstration assumptions). */
export const SIM = {
  tripDurationSec: 4,
  tripPeakCurrent: 148,
  overcurrentThreshold: 125,
  coastDownTauSec: 5,
  stopRampSec: 20,
  valveStrokeSec: 10,
  stabilityWindowSec: 45,
  restoredWindowSec: 30,
  statusIntervalSec: 600,
  backupReleaseDelaySec: 10,
  historyIntervalSec: 5,
  historyLimit: 4000,
  firstIncidentNumber: 1042,
  /** Water-quality drift rates per second at zero circulation. */
  drift: { temp: 0.00003, ph: -0.00004, dissolvedO2: -0.0002 },
  /** Recovery time constant towards baseline when circulating normally, seconds. */
  relaxSec: 1200,
  /** Filter blockage scenario: final blockage, build-up time, backwash time. */
  clogTarget: 0.3,
  clogRampSec: 240,
  backwashSec: 90,
  /** High differential-pressure alarm, kPa, and its debounce. */
  dpAlarmKpa: 62,
  dpAlarmDelaySec: 20,
};

/** Clean-bed differential pressure rises with throughput²; blockage adds to it. */
export function filterDp(flowFraction: number, clog: number) {
  return 18 + 30 * flowFraction * flowFraction + 120 * clog;
}

export function loopDesignFlow(filterId: string) {
  const loop = LOOPS.find((l) => l.filterId === filterId);
  return TANKS.filter((t) => loop?.tankIds.includes(t.id)).reduce((sum, t) => sum + t.designFlow, 0) || 1;
}

export function classifyFlow(pct: number): CirculationStatus {
  if (pct >= FLOW_THRESHOLDS.healthy) return "healthy";
  if (pct >= FLOW_THRESHOLDS.reduced) return "degraded";
  if (pct >= FLOW_THRESHOLDS.none) return "reduced";
  return "no-flow";
}

export function createInitialState(t0 = SCENARIO_START): SimState {
  const pumps: Record<string, PumpRuntime> = {};
  for (const p of PUMPS) {
    const running = p.role === "primary";
    pumps[p.id] = {
      id: p.id,
      mode: running ? "running" : "standby",
      output: running ? 1 : 0,
      setpoint: running ? 1 : 0,
      motorCurrent: running ? motorLoad(1) : 0,
      peakCurrent: 0,
      modeSince: t0,
      covering: false,
    };
  }
  const valves: Record<string, ValveRuntime> = {};
  for (const v of VALVES) valves[v.id] = { id: v.id, open: v.normallyOpen ? 1 : 0, commandedOpen: v.normallyOpen };
  const tanks: Record<string, TankRuntime> = {};
  for (const t of TANKS) {
    tanks[t.id] = {
      id: t.id,
      flow: t.designFlow,
      flowPct: 100,
      temp: t.baseline.temp,
      ph: t.baseline.ph,
      dissolvedO2: t.baseline.dissolvedO2,
      status: "healthy",
      lowFlowAlarm: false,
      degradedAlarm: false,
    };
  }
  const filters: Record<string, FilterRuntime> = {};
  for (const f of FILTERS) filters[f.id] = { id: f.id, clog: 0, clogTarget: 0, dp: filterDp(1, 0), highDpAlarm: false, backwashing: false };
  const state: SimState = {
    t: t0,
    startedAt: t0,
    pumps,
    filters,
    valves,
    tanks,
    edgeFlow: {},
    pumpDelivered: {},
    nodeFlow: {},
    events: [],
    incidents: [],
    commands: [],
    history: [],
    counters: { event: 0, incident: 0 },
    prevFlow: {},
  };
  solve(state);
  sample(state);
  return state;
}

function motorLoad(output: number) {
  // Motor current vs. hydraulic load for a VFD-driven centrifugal pump (illustrative).
  return output <= 0 ? 0 : 30 + 55 * output;
}

function pushEvent(s: SimState, e: Omit<SimEvent, "id">): SimEvent {
  s.counters.event += 1;
  const ev: SimEvent = { id: `EV-${String(s.counters.event).padStart(4, "0")}`, ...e };
  s.events.push(ev);
  return ev;
}

function tankList(ids: string[]) {
  const names = ids.map((id) => TANK_BY_ID[id]?.name ?? id);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function activeIncidents(s: Pick<SimState, "incidents">) {
  return s.incidents.filter((i) => i.status !== "resolved");
}

/** True once the incident's root asset is back in normal service. */
function rootHealthy(s: SimState, rootId: string) {
  const pump = s.pumps[rootId];
  if (pump) return pump.mode === "running" || (PUMP_BY_ID[rootId]?.role === "backup" && pump.mode === "standby");
  const filter = s.filters[rootId];
  if (filter) return !filter.backwashing && filter.clog < 0.02;
  return true;
}

function incidentForAsset(s: SimState, assetId: string) {
  return s.incidents.find((i) => i.status !== "resolved" && (i.rootAssetId === assetId || downstreamTanks(i.rootAssetId).includes(assetId)));
}

function startPump(s: SimState, id: string, setpoint: number) {
  const p = s.pumps[id];
  p.mode = "starting";
  p.setpoint = setpoint;
  p.modeSince = s.t;
}

function applyFilterCommand(s: SimState, c: SimCommand) {
  const f = s.filters[c.assetId];
  const cfg = FILTER_BY_ID[c.assetId];
  if (!f || !cfg) return;
  if (c.type === "inject-clog") {
    if (f.clogTarget > 0) return;
    f.clogTarget = SIM.clogTarget;
  } else if (c.type === "backwash" || c.type === "recover") {
    if (f.clog <= 0.001 || f.backwashing) return;
    f.backwashing = true;
    f.backwashSince = s.t;
    f.clogTarget = 0;
    const inc = incidentForAsset(s, c.assetId);
    if (inc) {
      inc.status = "recovering";
      inc.recoveryCommandAt = s.t;
    }
    pushEvent(s, {
      t: s.t,
      kind: "command",
      severity: "info",
      title: `Backwash of ${cfg.code} started (simulated)`,
      detail: `Authorized backwash and rinse of ${cfg.name}, about ${SIM.backwashSec} s.`,
      assets: [c.assetId],
      incidentId: inc?.id,
    });
  }
}

function applyCommand(s: SimState, c: SimCommand) {
  if (s.filters[c.assetId]) return applyFilterCommand(s, c);
  const p = s.pumps[c.assetId];
  const cfg = PUMP_BY_ID[c.assetId];
  if (!p || !cfg) return;
  if (c.type === "inject-fault") {
    if (p.mode === "fault" || p.mode === "tripping" || p.mode === "standby") {
      if (p.mode === "standby") {
        // A standby pump that fails is immediately unavailable.
        p.mode = "fault";
        p.faultAt = s.t;
        p.diagnosis = "unknown";
        p.modeSince = s.t;
        openIncident(s, c.assetId);
      }
      return;
    }
    p.mode = "tripping";
    p.modeSince = s.t;
  } else if (c.type === "recover") {
    if (p.mode !== "fault") return;
    const inc = incidentForAsset(s, c.assetId);
    pushEvent(s, {
      t: s.t,
      kind: "command",
      severity: "info",
      title: `Authorized restart of ${cfg.code} (simulated)`,
      detail: `${cfg.name} returned to service after maintenance sign-off. Restart ramp ${cfg.startRampSec} s.`,
      assets: [c.assetId],
      incidentId: inc?.id,
    });
    if (inc) {
      inc.status = "recovering";
      inc.recoveryCommandAt = s.t;
    }
    p.peakCurrent = 0;
    p.diagnosis = undefined;
    p.faultAt = undefined;
    if (cfg.role === "backup") {
      // A repaired standby pump returns to standby duty.
      p.mode = "standby";
      p.modeSince = s.t;
      p.output = 0;
      p.setpoint = 0;
    } else {
      startPump(s, c.assetId, 1);
    }
  } else if (c.type === "start-backup") {
    if (p.mode !== "standby") return;
    const loop = LOOPS.find((l) => l.autoTransfer?.backup === c.assetId);
    const inc = loop ? incidentForAsset(s, loop.autoTransfer!.primary) : undefined;
    startPump(s, c.assetId, cfg.backupOutputFraction ?? 1);
    p.covering = true;
    if (loop?.autoTransfer) s.valves[loop.autoTransfer.valve].commandedOpen = true;
    if (inc) inc.backupStartedAt = s.t;
    pushEvent(s, {
      t: s.t,
      kind: "transfer",
      severity: "info",
      title: `Manual start command: ${cfg.code} backup`,
      detail: `Operator-initiated backup start at ${Math.round((cfg.backupOutputFraction ?? 1) * 100)}% rated output.`,
      assets: [c.assetId],
      incidentId: inc?.id,
    });
  }
}

function openIncident(s: SimState, rootId: string): IncidentRuntime {
  const cfg = PUMP_BY_ID[rootId];
  const p = s.pumps[rootId];
  const number = SIM.firstIncidentNumber + s.counters.incident;
  s.counters.incident += 1;
  const overcurrent = p.diagnosis === "overcurrent";
  const loop = LOOPS.find((l) => l.autoTransfer?.primary === rootId);
  const inc: IncidentRuntime = {
    id: `INC-${number}`,
    number,
    title: `${cfg.name} ${overcurrent ? "Motor Fault" : "Fault"}`,
    rootAssetId: rootId,
    openedAt: s.t,
    status: "active",
    affectedTankIds: [],
    diagnosis: overcurrent
      ? {
          label: "Motor fault (overcurrent)",
          confidence: "confirmed",
          evidence: `Simulated motor current rose to ${p.peakCurrent.toFixed(0)}% FLA (threshold ${SIM.overcurrentThreshold}%) before the overcurrent protection tripped.`,
        }
      : {
          label: "Suspected pump fault",
          confidence: "suspected",
          evidence: "Pump unavailable without a preceding overcurrent signature. Cause not confirmed by simulated signals.",
        },
    backupPumpId: loop?.autoTransfer?.backup,
  };
  s.incidents.push(inc);
  return inc;
}

function openFilterIncident(s: SimState, filterId: string): IncidentRuntime {
  const cfg = FILTER_BY_ID[filterId];
  const f = s.filters[filterId];
  const number = SIM.firstIncidentNumber + s.counters.incident;
  s.counters.incident += 1;
  const inc: IncidentRuntime = {
    id: `INC-${number}`,
    number,
    title: `${cfg.name} Media Blockage`,
    rootAssetId: filterId,
    openedAt: s.t,
    status: "active",
    affectedTankIds: [],
    diagnosis: {
      label: "Filter media blockage (high differential pressure)",
      confidence: "confirmed",
      evidence: `Simulated differential pressure rose to ${f.dp.toFixed(0)} kPa (alarm ${SIM.dpAlarmKpa} kPa) while loop throughput fell, consistent with a blocked sand bed.`,
    },
  };
  s.incidents.push(inc);
  return inc;
}

function updateFilters(s: SimState) {
  for (const cfg of FILTERS) {
    const f = s.filters[cfg.id];
    if (f.backwashing) {
      f.clog = Math.max(0, f.clog - SIM.clogTarget / SIM.backwashSec);
      if (f.clog <= 0) {
        f.backwashing = false;
        f.clogTarget = 0;
        const inc = incidentForAsset(s, cfg.id);
        pushEvent(s, {
          t: s.t,
          kind: "recovery",
          severity: "ok",
          title: `${cfg.code} backwash complete: filter back in service`,
          detail: `${cfg.name} bed clean; differential pressure back to normal.`,
          assets: [cfg.id],
          incidentId: inc?.id,
        });
      }
    } else if (f.clog < f.clogTarget) {
      f.clog = Math.min(f.clogTarget, f.clog + SIM.clogTarget / SIM.clogRampSec);
    }
  }
}

function updateFilterAlarms(s: SimState) {
  for (const cfg of FILTERS) {
    const f = s.filters[cfg.id];
    const flow = s.nodeFlow[cfg.id] ?? 0;
    f.dp = filterDp(flow / loopDesignFlow(cfg.id), f.clog);
    if (f.dp > SIM.dpAlarmKpa) {
      if (f.highDpSince === undefined) f.highDpSince = s.t;
      if (!f.highDpAlarm && s.t - f.highDpSince >= SIM.dpAlarmDelaySec) {
        f.highDpAlarm = true;
        const inc = incidentForAsset(s, cfg.id) ?? openFilterIncident(s, cfg.id);
        const tanks = downstreamTanks(cfg.id);
        pushEvent(s, {
          t: s.t,
          kind: "fault",
          severity: "critical",
          title: `${cfg.code} high differential pressure: media blockage`,
          detail: `Differential pressure ${f.dp.toFixed(0)} kPa (alarm ${SIM.dpAlarmKpa} kPa). Loop throughput limited for ${tankList(tanks)}; ${inc.id} opened.`,
          assets: [cfg.id, ...tanks],
          incidentId: inc.id,
        });
      }
    } else {
      f.highDpSince = undefined;
      f.highDpAlarm = false;
    }
  }
}

function updatePumps(s: SimState) {
  for (const cfg of PUMPS) {
    const p = s.pumps[cfg.id];
    const elapsed = s.t - p.modeSince;
    const rate = 1 / cfg.startRampSec;
    switch (p.mode) {
      case "running": {
        if (p.output < p.setpoint) p.output = Math.min(p.setpoint, p.output + rate);
        else if (p.output > p.setpoint) p.output = Math.max(p.setpoint, p.output - rate);
        p.motorCurrent = motorLoad(p.output);
        break;
      }
      case "tripping": {
        // Overcurrent build-up before the motor protection opens.
        const k = Math.min(1, elapsed / SIM.tripDurationSec);
        p.motorCurrent = motorLoad(p.output) + (SIM.tripPeakCurrent - motorLoad(p.output)) * k;
        p.peakCurrent = Math.max(p.peakCurrent, p.motorCurrent);
        p.output = Math.max(0, p.output - 0.01);
        if (elapsed >= SIM.tripDurationSec) {
          p.mode = "fault";
          p.modeSince = s.t;
          p.faultAt = s.t;
          p.diagnosis = p.peakCurrent > SIM.overcurrentThreshold ? "overcurrent" : "unknown";
          p.motorCurrent = 0;
          p.covering = false;
          const inc = openIncident(s, cfg.id);
          const tanks = downstreamTanks(cfg.id);
          pushEvent(s, {
            t: s.t,
            kind: "fault",
            severity: "critical",
            title: `${cfg.code} stopped: motor ${p.diagnosis === "overcurrent" ? "overcurrent trip" : "fault"}`,
            detail: `Motor current peaked at ${p.peakCurrent.toFixed(0)}% FLA before protective trip. Supply to ${tankList(tanks)} lost; ${inc.id} opened.`,
            assets: [cfg.id, ...tanks],
            incidentId: inc.id,
          });
        }
        break;
      }
      case "fault": {
        p.output *= Math.exp(-1 / SIM.coastDownTauSec);
        if (p.output < 0.001) p.output = 0;
        p.motorCurrent = 0;
        break;
      }
      case "starting": {
        // The drive starts ramping on the step after the start command.
        if (elapsed === 0) break;
        p.output = Math.min(p.setpoint, p.output + rate);
        p.motorCurrent = motorLoad(p.output) + (p.output < p.setpoint ? 6 : 0);
        if (p.output >= 0.95 * p.setpoint) {
          p.mode = "running";
          p.modeSince = s.t;
          if (p.covering) {
            const loop = LOOPS.find((l) => l.autoTransfer?.backup === cfg.id);
            const inc = loop ? incidentForAsset(s, loop.autoTransfer!.primary) : undefined;
            if (inc) inc.backupConfirmedAt = s.t;
            pushEvent(s, {
              t: s.t,
              kind: "backup",
              severity: "info",
              title: `${cfg.code} backup running at ${Math.round(p.setpoint * 100)}% rated output`,
              detail: `Running state confirmed. ${cfg.code} supplying ${tankList(downstreamTanks(cfg.id))} through the auto-transfer valve.`,
              assets: [cfg.id],
              incidentId: inc?.id,
            });
          } else {
            const inc = incidentForAsset(s, cfg.id);
            pushEvent(s, {
              t: s.t,
              kind: "recovery",
              severity: "ok",
              title: `${cfg.code} running: primary circulation restored`,
              detail: `${cfg.name} confirmed running at design output.`,
              assets: [cfg.id],
              incidentId: inc?.id,
            });
          }
        }
        break;
      }
      case "stopping": {
        p.output = Math.max(0, p.output - 1 / SIM.stopRampSec);
        p.motorCurrent = motorLoad(p.output);
        if (p.output <= 0) {
          p.mode = "standby";
          p.modeSince = s.t;
          p.setpoint = 0;
          p.motorCurrent = 0;
        }
        break;
      }
      case "standby": {
        p.output = 0;
        p.motorCurrent = 0;
        break;
      }
    }
  }
}

function autoTransfer(s: SimState) {
  for (const loop of LOOPS) {
    const at = loop.autoTransfer;
    if (!at) continue;
    const prim = s.pumps[at.primary];
    const bk = s.pumps[at.backup];
    const bkCfg = PUMP_BY_ID[at.backup];
    // Start the standby pump once the primary has been in fault for the configured delay.
    if (prim.mode === "fault" && prim.faultAt !== undefined && s.t - prim.faultAt >= at.delaySec && bk.mode === "standby") {
      startPump(s, at.backup, bkCfg.backupOutputFraction ?? 1);
      bk.covering = true;
      s.valves[at.valve].commandedOpen = true;
      const inc = incidentForAsset(s, at.primary);
      if (inc) inc.backupStartedAt = s.t;
      pushEvent(s, {
        t: s.t,
        kind: "transfer",
        severity: "info",
        title: `Auto-transfer: ${bkCfg.code} start command, ${at.valve} opening`,
        detail: `${PUMP_BY_ID[at.primary].code} in fault for ${at.delaySec} s. Standby ${bkCfg.code} commanded to ${Math.round((bkCfg.backupOutputFraction ?? 1) * 100)}% rated output.`,
        assets: [at.backup, at.valve],
        incidentId: inc?.id,
      });
    }
    // Release the backup once the primary is confirmed running again.
    if (prim.mode === "running" && bk.covering && (bk.mode === "running" || bk.mode === "starting") && s.t - prim.modeSince >= SIM.backupReleaseDelaySec) {
      bk.mode = "stopping";
      bk.modeSince = s.t;
      bk.covering = false;
      s.valves[at.valve].commandedOpen = false;
      const inc = incidentForAsset(s, at.primary);
      pushEvent(s, {
        t: s.t,
        kind: "recovery",
        severity: "ok",
        title: `${bkCfg.code} returning to standby, ${at.valve} closing`,
        detail: `${PUMP_BY_ID[at.primary].code} has carried the loop for ${SIM.backupReleaseDelaySec} s.`,
        assets: [at.backup, at.valve],
        incidentId: inc?.id,
      });
    }
  }
}

function updateValves(s: SimState) {
  const step = 1 / SIM.valveStrokeSec;
  for (const v of Object.values(s.valves)) {
    if (v.commandedOpen) v.open = Math.min(1, v.open + step);
    else v.open = Math.max(0, v.open - step);
  }
}

function solve(s: SimState) {
  const pumpOffered: Record<string, number> = {};
  for (const cfg of PUMPS) pumpOffered[cfg.id] = s.pumps[cfg.id].output * cfg.ratedFlow;
  // A blocked filter limits what the pumps drawing through it can deliver.
  for (const f of FILTERS) {
    const fed = PUMPS.filter((pc) => feedsFrom(f.id, pc.id));
    const offered = fed.reduce((sum, pc) => sum + pumpOffered[pc.id], 0);
    const cap = f.capacity * (1 - s.filters[f.id].clog);
    if (offered > cap && offered > 0) for (const pc of fed) pumpOffered[pc.id] *= cap / offered;
  }
  const valveOpen: Record<string, number> = {};
  for (const v of Object.values(s.valves)) valveOpen[v.id] = v.open;
  const res = solveHydraulics({ pumpOffered, valveOpen });
  s.edgeFlow = res.edgeFlow;
  s.pumpDelivered = res.pumpDelivered;
  s.nodeFlow = res.nodeFlow;
  for (const cfg of TANKS) {
    const tank = s.tanks[cfg.id];
    tank.flow = res.tankFlow[cfg.id] ?? 0;
    tank.flowPct = (tank.flow / cfg.designFlow) * 100;
    tank.status = classifyFlow(tank.flowPct);
  }
}

function feedsFrom(filterId: string, pumpId: string): boolean {
  const stack = [filterId];
  const seen = new Set<string>();
  while (stack.length) {
    const n = stack.pop()!;
    if (n === pumpId) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const e of outgoing(n, ["suction"])) stack.push(e.to);
  }
  return false;
}

function updateWaterQuality(s: SimState) {
  for (const cfg of TANKS) {
    const tank = s.tanks[cfg.id];
    const deficit = Math.max(0, 1 - tank.flowPct / 100);
    tank.temp += SIM.drift.temp * deficit;
    tank.ph += SIM.drift.ph * deficit;
    tank.dissolvedO2 += SIM.drift.dissolvedO2 * deficit;
    if (tank.flowPct >= FLOW_THRESHOLDS.healthy) {
      tank.temp += (cfg.baseline.temp - tank.temp) / SIM.relaxSec;
      tank.ph += (cfg.baseline.ph - tank.ph) / SIM.relaxSec;
      tank.dissolvedO2 += (cfg.baseline.dissolvedO2 - tank.dissolvedO2) / SIM.relaxSec;
    }
  }
}

function updateAlarms(s: SimState) {
  const raised: string[] = [];
  const degraded: string[] = [];
  const cleared: string[] = [];
  for (const cfg of TANKS) {
    const tank = s.tanks[cfg.id];
    // Degraded band (60–90 %): warning after the same debounce as the low-flow alarm.
    if (tank.flowPct >= FLOW_THRESHOLDS.reduced && tank.flowPct < FLOW_THRESHOLDS.healthy) {
      if (tank.degradedSince === undefined) tank.degradedSince = s.t;
      if (!tank.degradedAlarm && !tank.lowFlowAlarm && s.t - tank.degradedSince >= FLOW_THRESHOLDS.alarmDelaySec) {
        tank.degradedAlarm = true;
        degraded.push(cfg.id);
      }
    } else {
      tank.degradedSince = undefined;
    }
    if (tank.flowPct < FLOW_THRESHOLDS.reduced) {
      tank.restoredSince = undefined;
      if (tank.belowSince === undefined) tank.belowSince = s.t;
      if (!tank.lowFlowAlarm && s.t - tank.belowSince >= FLOW_THRESHOLDS.alarmDelaySec) {
        tank.lowFlowAlarm = true;
        raised.push(cfg.id);
      }
    } else {
      tank.belowSince = undefined;
      if ((tank.lowFlowAlarm || tank.degradedAlarm) && tank.flowPct >= FLOW_THRESHOLDS.healthy) {
        if (tank.restoredSince === undefined) tank.restoredSince = s.t;
        if (s.t - tank.restoredSince >= SIM.restoredWindowSec) {
          tank.lowFlowAlarm = false;
          tank.degradedAlarm = false;
          tank.restoredSince = undefined;
          cleared.push(cfg.id);
        }
      } else if (tank.flowPct < FLOW_THRESHOLDS.healthy) {
        tank.restoredSince = undefined;
      }
    }
  }
  if (raised.length) {
    const inc = incidentForAsset(s, raised[0]);
    const last = s.events[s.events.length - 1];
    // Group alarms raised within a few seconds into one timeline entry.
    if (last && last.kind === "alarm" && last.severity === "critical" && s.t - last.t <= 5 && last.incidentId === inc?.id) {
      const all = [...new Set([...last.assets, ...raised])].sort();
      last.assets = all;
      last.title = `${tankList(all)} flow degradation detected`;
      last.detail = `Circulation below ${FLOW_THRESHOLDS.reduced}% of design for ${FLOW_THRESHOLDS.alarmDelaySec} s (low-flow alarm).`;
    } else {
      pushEvent(s, {
        t: s.t,
        kind: "alarm",
        severity: "critical",
        title: `${tankList(raised)} flow degradation detected`,
        detail: `Circulation below ${FLOW_THRESHOLDS.reduced}% of design for ${FLOW_THRESHOLDS.alarmDelaySec} s (low-flow alarm).`,
        assets: raised,
        incidentId: inc?.id,
      });
    }
  }
  if (degraded.length) {
    const inc = incidentForAsset(s, degraded[0]);
    const last = s.events[s.events.length - 1];
    const detail = `Circulation between ${FLOW_THRESHOLDS.reduced}% and ${FLOW_THRESHOLDS.healthy}% of design for ${FLOW_THRESHOLDS.alarmDelaySec} s.`;
    if (last && last.kind === "alarm" && last.severity === "warning" && s.t - last.t <= 5 && last.incidentId === inc?.id) {
      last.assets = [...new Set([...last.assets, ...degraded])].sort();
      last.title = `${tankList(last.assets)} circulation degraded`;
    } else {
      pushEvent(s, { t: s.t, kind: "alarm", severity: "warning", title: `${tankList(degraded)} circulation degraded`, detail, assets: degraded, incidentId: inc?.id });
    }
  }
  if (cleared.length) {
    const inc = s.incidents.find((i) => i.status !== "resolved" && i.affectedTankIds.some((t) => cleared.includes(t)));
    const last = s.events[s.events.length - 1];
    if (last && last.kind === "restored" && s.t - last.t <= 5 && last.incidentId === inc?.id) {
      last.assets = [...new Set([...last.assets, ...cleared])].sort();
      last.title = `${tankList(last.assets)} circulation restored`;
    } else {
      pushEvent(s, {
        t: s.t,
        kind: "restored",
        severity: "ok",
        title: `${tankList(cleared)} circulation restored`,
        detail: `Flow at or above ${FLOW_THRESHOLDS.healthy}% of design for ${SIM.restoredWindowSec} s. Low-flow alarm cleared.`,
        assets: cleared,
        incidentId: inc?.id,
      });
    }
  }
}

function updateIncidents(s: SimState) {
  for (const inc of s.incidents) {
    if (inc.status === "resolved") continue;
    const downstream = downstreamTanks(inc.rootAssetId);
    for (const id of downstream) {
      if (s.tanks[id].flowPct < FLOW_THRESHOLDS.healthy && !inc.affectedTankIds.includes(id)) inc.affectedTankIds.push(id);
    }
    inc.affectedTankIds.sort();
    const affected = inc.affectedTankIds.map((id) => s.tanks[id]);

    // Stabilization: affected flows above "no flow" and unchanged for the stability window.
    if (!inc.stabilizedAt && inc.status === "active" && affected.length) {
      const moving = affected.some((tk) => Math.abs(tk.flowPct - (s.prevFlow[tk.id] ?? tk.flowPct)) >= 0.05);
      if (moving || inc.stableSince === undefined) inc.stableSince = s.t;
      const minFlow = Math.min(...affected.map((tk) => tk.flowPct));
      if (minFlow >= FLOW_THRESHOLDS.none && s.t - inc.stableSince >= SIM.stabilityWindowSec) {
        inc.stabilizedAt = s.t;
        inc.lastStatusAt = s.t;
        const parts = affected.map((tk) => `${TANK_BY_ID[tk.id].name} ${Math.round(tk.flowPct)}%`).join(" · ");
        pushEvent(s, {
          t: s.t,
          kind: "stable",
          severity: "warning",
          title: `${tankList(inc.affectedTankIds)} stabilized at partial circulation`,
          detail: `${parts}. Flows steady for ${SIM.stabilityWindowSec} s on ${inc.backupPumpId ? PUMP_BY_ID[inc.backupPumpId].code + " backup" : "the remaining supply"}.`,
          assets: [...inc.affectedTankIds],
          incidentId: inc.id,
        });
      }
    }

    // Periodic status while unresolved.
    const statusBase = inc.lastStatusAt ?? inc.openedAt;
    if (inc.status === "active" && s.t - statusBase >= SIM.statusIntervalSec) {
      inc.lastStatusAt = s.t;
      const below = affected.filter((tk) => tk.flowPct < FLOW_THRESHOLDS.healthy);
      const backup = inc.backupPumpId ? s.pumps[inc.backupPumpId] : undefined;
      pushEvent(s, {
        t: s.t,
        kind: "status",
        severity: "critical",
        title: below.length ? `${below.length === 1 ? "One tank remains" : `${numberWord(below.length)} tanks remain`} affected` : "Incident unresolved",
        detail: `${assetShort(inc.rootAssetId)} ${s.filters[inc.rootAssetId] ? "still blocked" : "out of service"}. ${backup && backup.mode === "running" ? `${PUMP_BY_ID[backup.id].code} backup active. ` : ""}${below.map((tk) => `${TANK_BY_ID[tk.id].name} ${Math.round(tk.flowPct)}%`).join(", ")}.`,
        assets: below.map((tk) => tk.id),
        incidentId: inc.id,
      });
    }

    // Resolution: root asset running and every affected tank healthy for the window.
    const rootRunning = rootHealthy(s, inc.rootAssetId);
    const allHealthy = affected.every((tk) => tk.flowPct >= FLOW_THRESHOLDS.healthy);
    if (rootRunning && allHealthy) {
      if (inc.restoredSince === undefined) inc.restoredSince = s.t;
      if (s.t - inc.restoredSince >= SIM.restoredWindowSec + 1) {
        inc.status = "resolved";
        inc.resolvedAt = s.t;
        pushEvent(s, {
          t: s.t,
          kind: "resolved",
          severity: "ok",
          title: `${inc.id} resolved`,
          detail: `${assetShort(inc.rootAssetId)} back in normal service and all affected tanks at design circulation.`,
          assets: [inc.rootAssetId, ...inc.affectedTankIds],
          incidentId: inc.id,
        });
      }
    } else {
      inc.restoredSince = undefined;
    }
  }
  for (const id of Object.keys(s.tanks)) s.prevFlow[id] = s.tanks[id].flowPct;
}

function numberWord(n: number) {
  return ["Zero", "One", "Two", "Three", "Four", "Five", "Six"][n] ?? String(n);
}

function sample(s: SimState) {
  if ((s.t - s.startedAt) % SIM.historyIntervalSec !== 0) return;
  s.history.push({
    t: s.t,
    flows: TANKS.map((t) => s.tanks[t.id].flowPct),
    pumps: PUMPS.map((p) => s.pumps[p.id].output),
    temps: TANKS.map((t) => s.tanks[t.id].temp),
    dissolvedO2: TANKS.map((t) => s.tanks[t.id].dissolvedO2),
  });
  if (s.history.length > SIM.historyLimit) s.history.splice(0, s.history.length - SIM.historyLimit);
}

/** Advance the simulation by one second. Mutates `s`. */
export function stepOnce(s: SimState) {
  s.t += 1;
  for (const c of s.commands) if (c.t === s.t) applyCommand(s, c);
  autoTransfer(s);
  updatePumps(s);
  updateFilters(s);
  updateValves(s);
  solve(s);
  updateFilterAlarms(s);
  updateWaterQuality(s);
  updateAlarms(s);
  updateIncidents(s);
  sample(s);
}

/** Advance to `target` (inclusive). Mutates and returns `s`. */
export function advanceTo(s: SimState, target: number): SimState {
  const end = Math.floor(target);
  while (s.t < end) stepOnce(s);
  return s;
}

/** Advance until `predicate` holds or `maxSteps` elapse. Returns true if reached. */
export function advanceUntil(s: SimState, predicate: (s: SimState) => boolean, maxSteps = 3600): boolean {
  for (let i = 0; i < maxSteps; i++) {
    if (predicate(s)) return true;
    stepOnce(s);
  }
  return predicate(s);
}

/** Rebuild state from scratch: initial state + commands, up to `target`. */
export function replay(commands: SimCommand[], target: number, t0 = SCENARIO_START): SimState {
  const s = createInitialState(t0);
  s.commands = [...commands].sort((a, b) => a.t - b.t);
  return advanceTo(s, target);
}

/** True while the plant is moving between states (used for auto fast-forward). */
export function isTransient(s: SimState): boolean {
  if (Object.values(s.pumps).some((p) => p.mode === "tripping" || p.mode === "starting" || p.mode === "stopping")) return true;
  if (s.commands.some((c) => c.t > s.t)) return true;
  if (Object.values(s.filters).some((f) => f.backwashing || Math.abs(f.clog - f.clogTarget) > 1e-6)) return true;
  return s.incidents.some(
    (i) => (i.status === "active" && !i.stabilizedAt && (i.backupPumpId ? s.pumps[i.backupPumpId].mode !== "fault" : !!s.filters[i.rootAssetId])) || i.status === "recovering",
  );
}

export function pumpIsBackupActive(s: SimState, pumpId: string) {
  const p = s.pumps[pumpId];
  return !!p && p.covering && (p.mode === "running" || p.mode === "starting");
}
