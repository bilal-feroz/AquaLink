"use client";

/**
 * AquaLink application store — the single source of truth.
 *
 * - `sim` is the published snapshot of the deterministic simulation. Every 3D
 *   object, label, panel, KPI and timeline reads from it.
 * - UI state (mode, selection, layers, level) lives alongside it.
 * - Technician workflow (tasks, notes, work orders, handovers) is persisted.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CURRENT_USER, TECHNICIANS } from "@/lib/data/facility";
import {
  activeIncidents,
  advanceUntil,
  createInitialState,
  isTransient,
  stepOnce,
  type SimCommand,
  type SimState,
} from "@/lib/simulation/engine";
import { PRESETS, SCENARIOS, type ScenarioId, type ScenarioPreset } from "@/lib/simulation/scenario";
import { ASSET_BY_ID, PUMP_BY_ID, downstreamTanks } from "@/lib/topology/graph";
import type { FloorId } from "@/lib/types";
import { buildHandover, buildWorkOrderContext } from "@/lib/workflow/handover";
import { generateTasks } from "@/lib/workflow/tasks";
import type {
  ActivityEntry,
  HandoverReport,
  IncidentMeta,
  MaintenanceTask,
  TaskStatus,
  WorkOrder,
} from "@/lib/workflow/types";
import { getEngine, rebuildEngine, setEngine, snapshot } from "./engine";

export type Section = "facility" | "assets" | "incidents" | "tasks" | "analytics" | "settings";
export type ViewMode = "public" | "operations";
export type PanelTab = "overview" | "live" | "connections" | "history";
export type Quality = "high" | "balanced" | "low";
export type MotionPref = "system" | "reduce" | "full";

export type LayerKey = "tanks" | "pumps" | "filters" | "pipes" | "valves" | "sensors" | "shell" | "flow" | "labels" | "marine" | "visitors";

export type LayerState = Record<LayerKey, boolean>;

// The plant hall sits physically behind the atrium, so its equipment is part of
// the public world too (seen when orbiting round); pipes are clipped to the plant.
export const LAYER_DEFAULTS: Record<ViewMode, LayerState> = {
  public: { tanks: true, pumps: true, filters: true, pipes: true, valves: true, sensors: false, shell: true, flow: true, labels: false, marine: true, visitors: true },
  operations: { tanks: true, pumps: true, filters: true, pipes: true, valves: true, sensors: true, shell: true, flow: true, labels: true, marine: true, visitors: false },
};

export interface FollowTarget {
  tankId: string;
  /** Index into the tank's habitat.species list. */
  species: number;
}

/** A one-shot visual pulse: red when a fault spreads, green when service is restored. */
export interface FxPulse {
  id: number;
  kind: "fault" | "heal";
  rootId: string;
  tanks: string[];
}

export interface Toast {
  id: number;
  tone: "info" | "ok" | "warn" | "crit";
  text: string;
}

interface Dialogs {
  handover: boolean;
  workOrderId: string | null;
  resetConfirm: boolean;
  shortcuts: boolean;
}

export interface AppState {
  hydrated: boolean;

  // Simulation
  sim: SimState;
  speed: number;
  playing: boolean;
  autoFastForward: boolean;
  fastForwarding: boolean;

  // UI
  section: Section;
  mode: ViewMode;
  selectedId: string | null;
  hoveredId: string | null;
  level: FloorId | null;
  layers: Record<ViewMode, LayerState>;
  panelTab: PanelTab;
  textView: boolean;
  motionPref: MotionPref;
  systemReducedMotion: boolean;
  quality: Quality;
  showTimeline: boolean;
  cameraNonce: number;
  follow: FollowTarget | null;
  pulse: FxPulse | null;
  toasts: Toast[];
  dialogs: Dialogs;
  webglFailed: boolean;

  // Workflow (persisted)
  tasks: MaintenanceTask[];
  workOrders: WorkOrder[];
  incidentMeta: Record<string, IncidentMeta>;
  handovers: HandoverReport[];
  activity: ActivityEntry[];
  counters: { workOrder: number; note: number; handover: number; activity: number };

  // Persisted simulation pointer
  simCommands: SimCommand[];
  simT: number;

  // --- actions
  publish: () => void;
  tick: (wallSeconds: number) => void;
  setSpeed: (speed: number) => void;
  togglePlaying: () => void;
  setAutoFastForward: (v: boolean) => void;

  simulateFailure: (pumpId?: string) => void;
  runScenario: (id: ScenarioId) => void;
  setFollow: (f: FollowTarget | null) => void;
  backupResponse: () => void;
  stabilize: () => void;
  recover: () => void;
  resetScenario: () => void;
  loadPreset: (id: ScenarioPreset["id"]) => void;

  setSection: (s: Section) => void;
  setMode: (m: ViewMode) => void;
  select: (id: string | null, opts?: { focus?: boolean }) => void;
  hover: (id: string | null) => void;
  setLevel: (l: FloorId | null) => void;
  toggleLayer: (k: LayerKey) => void;
  resetLayers: () => void;
  setPanelTab: (t: PanelTab) => void;
  setTextView: (v: boolean) => void;
  setMotionPref: (v: MotionPref) => void;
  setSystemReducedMotion: (v: boolean) => void;
  setQuality: (q: Quality) => void;
  setShowTimeline: (v: boolean) => void;
  resetCamera: () => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
  openDialog: (d: Partial<Dialogs>) => void;
  setWebglFailed: (v: boolean) => void;

  assignTask: (taskId: string, techId: string | undefined) => void;
  setTaskStatus: (taskId: string, status: TaskStatus) => void;
  toggleStep: (taskId: string, stepId: string) => void;
  addTaskNote: (taskId: string, text: string) => void;
  createWorkOrder: (taskId: string) => string | null;
  issueWorkOrder: (woId: string) => void;
  acknowledgeIncident: (incidentId: string) => void;
  setIncidentOwner: (incidentId: string, techId: string | undefined) => void;
  addIncidentNote: (incidentId: string, text: string) => void;
  createHandover: () => HandoverReport;
}

const ME = CURRENT_USER.name;

const emptyWorkflow = () => ({
  tasks: [] as MaintenanceTask[],
  workOrders: [] as WorkOrder[],
  incidentMeta: {} as Record<string, IncidentMeta>,
  handovers: [] as HandoverReport[],
  activity: [] as ActivityEntry[],
  counters: { workOrder: 0, note: 0, handover: 0, activity: 0 },
});

let toastId = 0;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      /** Generate tasks for any incident that has none yet. */
      const syncWorkflow = () => {
        const { sim, tasks, incidentMeta } = get();
        const missing = sim.incidents.filter((i) => !tasks.some((t) => t.incidentId === i.id));
        if (missing.length === 0) return;
        const newTasks = missing.flatMap((i) => generateTasks(i, i.openedAt));
        const meta = { ...incidentMeta };
        for (const i of missing) if (!meta[i.id]) meta[i.id] = { incidentId: i.id, notes: [] };
        set({ tasks: [...tasks, ...newTasks], incidentMeta: meta });
      };

      const log = (text: string, extra: Partial<ActivityEntry> = {}) => {
        const { activity, counters, sim } = get();
        const n = counters.activity + 1;
        set({
          activity: [...activity, { id: `ACT-${n}`, at: sim.t, by: ME, text, ...extra }].slice(-200),
          counters: { ...counters, activity: n },
        });
      };

      const updateTask = (taskId: string, fn: (t: MaintenanceTask) => MaintenanceTask) => {
        set({ tasks: get().tasks.map((t) => (t.id === taskId ? fn(t) : t)) });
      };

      let seenEvents = 0;
      let pulseId = 0;
      const publish = (opts: { live?: boolean } = {}) => {
        const e = getEngine();
        const prevSeen = seenEvents;
        seenEvents = e.events.length;
        const patch: Partial<AppState> = { sim: snapshot(e), simT: e.t, simCommands: e.commands.map((c) => ({ ...c })) };
        // Trigger the fault / heal pulse for events that just happened live.
        if (opts.live !== false && prevSeen < e.events.length) {
          for (const ev of e.events.slice(prevSeen)) {
            if (ev.t < e.t - 60) continue;
            const inc = e.incidents.find((i) => i.id === ev.incidentId);
            if (!inc) continue;
            if (ev.kind === "fault") patch.pulse = { id: ++pulseId, kind: "fault", rootId: inc.rootAssetId, tanks: downstreamTanks(inc.rootAssetId) };
            // Heal as soon as the failed equipment itself is back in service.
            if (ev.kind === "recovery" && ev.assets[0] === inc.rootAssetId) patch.pulse = { id: ++pulseId, kind: "heal", rootId: inc.rootAssetId, tanks: [...inc.affectedTankIds] };
          }
        }
        set(patch);
        syncWorkflow();
      };

      const pushCommand = (c: Omit<SimCommand, "t">) => {
        const e = getEngine();
        e.commands.push({ ...c, t: e.t + 1 });
        stepOnce(e);
      };

      let carry = 0;

      return {
        hydrated: false,
        sim: snapshot(getEngine()),
        speed: 1,
        playing: true,
        autoFastForward: true,
        fastForwarding: false,

        section: "facility",
        mode: "public",
        selectedId: null,
        hoveredId: null,
        level: null,
        layers: structuredClone(LAYER_DEFAULTS),
        panelTab: "overview",
        textView: false,
        motionPref: "system",
        systemReducedMotion: false,
        quality: "high",
        showTimeline: true,
        cameraNonce: 0,
        follow: null,
        pulse: null,
        toasts: [],
        dialogs: { handover: false, workOrderId: null, resetConfirm: false, shortcuts: false },
        webglFailed: false,

        ...emptyWorkflow(),
        simCommands: [],
        simT: getEngine().t,

        publish: () => publish(),

        tick: (wall) => {
          const { playing, speed, autoFastForward } = get();
          if (!playing) return;
          const e = getEngine();
          const ff = autoFastForward && isTransient(e);
          const rate = ff ? Math.max(speed, 20) : speed;
          carry += wall * rate;
          const steps = Math.floor(carry);
          if (steps <= 0) {
            if (get().fastForwarding !== ff) set({ fastForwarding: ff });
            return;
          }
          carry -= steps;
          for (let i = 0; i < steps; i++) stepOnce(e);
          set({ fastForwarding: ff && isTransient(e) });
          publish();
        },

        setSpeed: (speed) => set({ speed, playing: true }),
        togglePlaying: () => set({ playing: !get().playing }),
        setAutoFastForward: (v) => set({ autoFastForward: v }),

        simulateFailure: (pumpId = "PMP-C2") => {
          const def = SCENARIOS.find((d) => d.rootAssetId === pumpId);
          if (def) return get().runScenario(def.id);
          const e = getEngine();
          const p = e.pumps[pumpId];
          if (!p || p.mode === "fault" || p.mode === "tripping") return;
          pushCommand({ type: "inject-fault", assetId: pumpId });
          set({ playing: true });
          publish();
          log(`Simulated failure injected on ${PUMP_BY_ID[pumpId].code}`);
        },

        runScenario: (id) => {
          const def = SCENARIOS.find((d) => d.id === id);
          if (!def) return;
          const e = getEngine();
          const busy = activeIncidents(e).some((i) => i.rootAssetId === def.rootAssetId) || e.pumps[def.rootAssetId]?.mode === "tripping" || (e.filters[def.rootAssetId]?.clogTarget ?? 0) > 0;
          if (busy) {
            get().toast(`${def.title} is already running.`, "warn");
            return;
          }
          pushCommand({ type: def.command, assetId: def.rootAssetId });
          set({ playing: true });
          publish();
          log(`Scenario started: ${def.title} (simulated)`);
          get().toast(`Simulating: ${def.title}`, "crit");
        },

        setFollow: (follow) => set({ follow }),

        backupResponse: () => {
          const e = getEngine();
          const inc = activeIncidents(e).find((i) => i.backupPumpId);
          if (!inc) {
            get().toast("No active incident with a configured backup pump.", "warn");
            return;
          }
          const reached = advanceUntil(e, (s) => {
            const i = s.incidents.find((x) => x.id === inc.id)!;
            return i.backupConfirmedAt !== undefined || i.status !== "active";
          }, 900);
          publish();
          if (reached) get().toast("Backup response: auto-transfer to C-3 completed", "info");
        },

        stabilize: () => {
          const e = getEngine();
          const inc = activeIncidents(e)[0];
          if (!inc) {
            get().toast("No active incident to stabilize.", "warn");
            return;
          }
          advanceUntil(e, (s) => {
            const i = s.incidents.find((x) => x.id === inc.id)!;
            return i.stabilizedAt !== undefined || i.status !== "active";
          }, 1200);
          publish();
        },

        recover: () => {
          const e = getEngine();
          const inc = activeIncidents(e).find((i) => i.status === "active");
          if (!inc) {
            get().toast("Nothing to recover.", "warn");
            return;
          }
          const isFilter = !!e.filters[inc.rootAssetId];
          pushCommand({ type: isFilter ? "backwash" : "recover", assetId: inc.rootAssetId });
          set({ playing: true });
          publish();
          log(`Recorded ${isFilter ? "backwash of" : "authorized restart of"} ${ASSET_BY_ID[inc.rootAssetId].code} (simulated)`, { incidentId: inc.id });
        },

        resetScenario: () => {
          setEngine(createInitialState());
          carry = 0;
          set({ ...emptyWorkflow(), selectedId: null, level: null, follow: null, pulse: null, dialogs: { ...get().dialogs, resetConfirm: false } });
          publish({ live: false });
          get().toast("Scenario reset to healthy baseline", "ok");
        },

        loadPreset: (id) => {
          const preset = PRESETS.find((p) => p.id === id);
          if (!preset) return;
          rebuildEngine(preset.commands, preset.target);
          carry = 0;
          set({ ...emptyWorkflow(), selectedId: null, level: null, follow: null, pulse: null });
          publish({ live: false });
        },

        setSection: (section) => set({ section }),

        setMode: (mode) => {
          const { selectedId, sim } = get();
          const patch: Partial<AppState> = { mode, section: "facility", level: null };
          if (mode === "operations" && !selectedId) {
            const inc = activeIncidents(sim)[0];
            if (inc) patch.selectedId = inc.rootAssetId;
          }
          // Keep a selection only if it is visible in the target mode.
          if (mode === "public" && selectedId && ASSET_BY_ID[selectedId]?.kind !== "tank") patch.selectedId = null;
          set(patch);
        },

        select: (id) => {
          if (id === get().selectedId) return;
          set({ selectedId: id, panelTab: "overview", follow: id && get().follow?.tankId === id ? get().follow : null });
        },
        hover: (id) => {
          if (get().hoveredId !== id) set({ hoveredId: id });
        },
        setLevel: (level) => {
          set({ level, follow: null });
        },
        toggleLayer: (k) => {
          const { layers, mode } = get();
          set({ layers: { ...layers, [mode]: { ...layers[mode], [k]: !layers[mode][k] } } });
        },
        resetLayers: () => {
          const { layers, mode } = get();
          set({ layers: { ...layers, [mode]: { ...LAYER_DEFAULTS[mode] } } });
        },
        setPanelTab: (panelTab) => set({ panelTab }),
        setTextView: (textView) => set({ textView }),
        setMotionPref: (motionPref) => set({ motionPref }),
        setSystemReducedMotion: (systemReducedMotion) => set({ systemReducedMotion }),
        setQuality: (quality) => set({ quality }),
        setShowTimeline: (showTimeline) => set({ showTimeline }),
        resetCamera: () => set({ cameraNonce: get().cameraNonce + 1, level: null }),
        toast: (text, tone = "info") => {
          const id = ++toastId;
          set({ toasts: [...get().toasts, { id, text, tone }].slice(-4) });
          setTimeout(() => get().dismissToast(id), 4200);
        },
        dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
        openDialog: (d) => set({ dialogs: { ...get().dialogs, ...d } }),
        setWebglFailed: (webglFailed) => set({ webglFailed }),

        assignTask: (taskId, techId) => {
          const t = get().tasks.find((x) => x.id === taskId);
          if (!t) return;
          const now = get().sim.t;
          const name = techId ? TECHNICIANS.find((x) => x.id === techId)?.name ?? techId : "Unassigned";
          updateTask(taskId, (x) => ({
            ...x,
            assigneeId: techId,
            status: x.status === "open" && techId ? "in-progress" : x.status,
            history: [...x.history, { at: now, by: ME, action: techId ? `Assigned to ${name}` : "Unassigned" }],
          }));
          log(`${techId ? `Assigned ${t.id} to ${name}` : `Unassigned ${t.id}`}`, { incidentId: t.incidentId, taskId });
        },

        setTaskStatus: (taskId, status) => {
          const now = get().sim.t;
          const t = get().tasks.find((x) => x.id === taskId);
          if (!t || t.status === status) return;
          updateTask(taskId, (x) => ({
            ...x,
            status,
            completedAt: status === "done" ? now : undefined,
            history: [...x.history, { at: now, by: ME, action: `Status → ${status}` }],
          }));
          log(`${t.id} marked ${status}`, { incidentId: t.incidentId, taskId });
        },

        toggleStep: (taskId, stepId) => {
          const now = get().sim.t;
          const t = get().tasks.find((x) => x.id === taskId);
          if (!t) return;
          const step = t.steps.find((s) => s.id === stepId);
          if (!step) return;
          const steps = t.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done, doneAt: !s.done ? now : undefined, doneBy: !s.done ? ME : undefined } : s));
          const allDone = steps.every((s) => s.done);
          const anyDone = steps.some((s) => s.done);
          let status: TaskStatus = t.status;
          if (allDone) status = "done";
          else if (t.status === "done") status = "in-progress";
          else if (anyDone && t.status === "open") status = "in-progress";
          updateTask(taskId, (x) => ({
            ...x,
            steps,
            status,
            completedAt: status === "done" ? now : undefined,
            history: [
              ...x.history,
              { at: now, by: ME, action: `${step.done ? "Reopened" : "Completed"} step: ${step.label}` },
              ...(status !== t.status ? [{ at: now, by: ME, action: `Status → ${status}` }] : []),
            ],
          }));
          if (!step.done) log(`Completed step on ${t.id}: ${step.label}`, { incidentId: t.incidentId, taskId });
          if (status === "done" && t.status !== "done") log(`${t.id} completed: ${t.title}`, { incidentId: t.incidentId, taskId });
        },

        addTaskNote: (taskId, text) => {
          const trimmed = text.trim();
          if (!trimmed) return;
          const { counters, sim } = get();
          const n = counters.note + 1;
          const t = get().tasks.find((x) => x.id === taskId);
          if (!t) return;
          set({ counters: { ...get().counters, note: n } });
          updateTask(taskId, (x) => ({
            ...x,
            notes: [...x.notes, { id: `NOTE-${n}`, at: sim.t, by: ME, text: trimmed }],
            history: [...x.history, { at: sim.t, by: ME, action: "Added note" }],
          }));
          log(`Note on ${t.id}: ${trimmed}`, { incidentId: t.incidentId, taskId });
        },

        createWorkOrder: (taskId) => {
          const { tasks, sim, counters, workOrders } = get();
          const t = tasks.find((x) => x.id === taskId);
          if (!t) return null;
          if (t.workOrderId) return t.workOrderId;
          const inc = sim.incidents.find((i) => i.id === t.incidentId);
          if (!inc) return null;
          const n = counters.workOrder + 1;
          const id = `WO-${5800 + n}`;
          const wo: WorkOrder = {
            id,
            taskId,
            incidentId: inc.id,
            assetId: t.assetIds[0] ?? inc.rootAssetId,
            title: t.title,
            description: t.description,
            priority: t.priority <= 1 ? "P1" : t.priority <= 2 ? "P2" : "P3",
            assigneeId: t.assigneeId,
            requestedActions: t.steps.map((s) => s.label),
            createdAt: sim.t,
            createdBy: ME,
            status: "draft",
            context: buildWorkOrderContext(sim, inc),
          };
          set({ workOrders: [...workOrders, wo], counters: { ...get().counters, workOrder: n } });
          updateTask(taskId, (x) => ({ ...x, workOrderId: id, history: [...x.history, { at: sim.t, by: ME, action: `Work order ${id} raised (simulated)` }] }));
          log(`Raised simulated work order ${id} for ${t.id}`, { incidentId: inc.id, taskId });
          return id;
        },

        issueWorkOrder: (woId) => {
          set({ workOrders: get().workOrders.map((w) => (w.id === woId ? { ...w, status: "issued" } : w)) });
          const w = get().workOrders.find((x) => x.id === woId);
          if (w) log(`Issued work order ${woId} (simulated)`, { incidentId: w.incidentId, taskId: w.taskId });
        },

        acknowledgeIncident: (incidentId) => {
          const meta = get().incidentMeta[incidentId] ?? { incidentId, notes: [] };
          if (meta.acknowledgedAt) return;
          set({ incidentMeta: { ...get().incidentMeta, [incidentId]: { ...meta, acknowledgedAt: get().sim.t, acknowledgedBy: ME, ownerId: meta.ownerId ?? CURRENT_USER.id } } });
          log(`Acknowledged ${incidentId}`, { incidentId });
        },

        setIncidentOwner: (incidentId, techId) => {
          const meta = get().incidentMeta[incidentId] ?? { incidentId, notes: [] };
          set({ incidentMeta: { ...get().incidentMeta, [incidentId]: { ...meta, ownerId: techId } } });
          log(`${incidentId} owner → ${TECHNICIANS.find((t) => t.id === techId)?.name ?? "unassigned"}`, { incidentId });
        },

        addIncidentNote: (incidentId, text) => {
          const trimmed = text.trim();
          if (!trimmed) return;
          const { counters, sim } = get();
          const n = counters.note + 1;
          const meta = get().incidentMeta[incidentId] ?? { incidentId, notes: [] };
          set({
            counters: { ...counters, note: n },
            incidentMeta: { ...get().incidentMeta, [incidentId]: { ...meta, notes: [...meta.notes, { id: `NOTE-${n}`, at: sim.t, by: ME, text: trimmed }] } },
          });
          log(`Note on ${incidentId}: ${trimmed}`, { incidentId });
        },

        createHandover: () => {
          const { sim, tasks, workOrders, incidentMeta, activity, counters, handovers } = get();
          const n = counters.handover + 1;
          const report: HandoverReport = {
            id: `HO-${String(n).padStart(3, "0")}`,
            createdAt: sim.t,
            createdBy: ME,
            markdown: buildHandover({ sim, tasks, workOrders, incidentMeta, activity, preparedBy: ME }),
          };
          set({ handovers: [...handovers, report], counters: { ...get().counters, handover: n } });
          log(`Prepared shift handover ${report.id}`);
          return report;
        },
      };
    },
    {
      name: "aqualink-v2",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        simCommands: s.simCommands,
        simT: s.simT,
        speed: s.speed,
        autoFastForward: s.autoFastForward,
        motionPref: s.motionPref,
        quality: s.quality,
        layers: s.layers,
        showTimeline: s.showTimeline,
        tasks: s.tasks,
        workOrders: s.workOrders,
        incidentMeta: s.incidentMeta,
        handovers: s.handovers,
        activity: s.activity,
        counters: s.counters,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        rebuildEngine(state.simCommands ?? [], state.simT ?? getEngine().t);
        state.publish();
      },
    },
  ),
);

export function effectiveReducedMotion(s: Pick<AppState, "motionPref" | "systemReducedMotion">) {
  return s.motionPref === "reduce" || (s.motionPref === "system" && s.systemReducedMotion);
}
