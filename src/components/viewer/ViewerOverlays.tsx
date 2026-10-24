"use client";

import {
  Check,
  ChevronDown,
  FastForward,
  Focus,
  Layers,
  LocateFixed,
  Maximize2,
  Minimize2,
  Minus,
  Network,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Table2,
  TriangleAlert,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { FLOORS } from "@/lib/data/facility";
import { cls, hm } from "@/lib/format";
import { activeIncidents } from "@/lib/simulation/engine";
import { scenarioStage, type ScenarioStage } from "@/lib/simulation/scenario";
import { FLOW_VISUAL_HEX } from "@/lib/status";
import type { FloorId } from "@/lib/types";
import { useAppStore, type LayerKey, type ViewMode } from "@/store/useAppStore";
import { usePopover } from "@/components/layout/Header";

const MODES: { id: ViewMode; label: string; icon: LucideIcon; key: string }[] = [
  { id: "public", label: "Public View", icon: Users, key: "1" },
  { id: "infrastructure", label: "Infrastructure View", icon: Network, key: "2" },
  { id: "incident", label: "Incident View", icon: TriangleAlert, key: "3" },
];

export function ModeSwitcher() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const hasIncident = useAppStore((s) => activeIncidents(s.sim).length > 0);
  return (
    <div role="radiogroup" aria-label="View mode" className="scene-chip flex items-center gap-1 rounded-xl p-1 shadow-lg">
      {MODES.map((m) => {
        const active = mode === m.id;
        const Icon = m.icon;
        const alert = m.id === "incident" && hasIncident;
        return (
          <button
            key={m.id}
            role="radio"
            aria-checked={active}
            aria-keyshortcuts={m.key}
            onClick={() => setMode(m.id)}
            className={cls(
              "relative flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors",
              active ? (m.id === "incident" ? "bg-white text-crit shadow ring-2 ring-crit/70" : "bg-white text-brand shadow") : "text-white/85 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {m.label}
            {alert && !active && <span aria-hidden className="pulse-crit absolute top-1.5 right-1.5 size-2 rounded-full bg-red-500" />}
          </button>
        );
      })}
    </div>
  );
}

const STAGES: { id: ScenarioStage; label: string }[] = [
  { id: "baseline", label: "Healthy baseline" },
  { id: "fault", label: "C-2 failure" },
  { id: "backup", label: "Backup response" },
  { id: "stabilized", label: "Stabilized" },
  { id: "recovering", label: "Recovery" },
];

export function ScenarioDock() {
  const sim = useAppStore((s) => s.sim);
  const speed = useAppStore((s) => s.speed);
  const playing = useAppStore((s) => s.playing);
  const ff = useAppStore((s) => s.fastForwarding);
  const autoFF = useAppStore((s) => s.autoFastForward);
  const a = useAppStore.getState();
  const pop = usePopover();
  const stage = scenarioStage(sim);
  const stageIdx = STAGES.findIndex((s) => s.id === (stage === "recovered" ? "recovering" : stage));
  const active = activeIncidents(sim)[0];
  const c2 = sim.pumps["PMP-C2"];

  const step = (label: string, desc: string, onClick: () => void, disabled: boolean, icon: LucideIcon, done: boolean, current: boolean) => {
    const Icon = icon;
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={cls(
          "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45",
          current ? "bg-brand-50" : "hover:bg-slate-50",
        )}
      >
        <span className={cls("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", done ? "bg-ok text-white" : current ? "bg-brand text-white" : "bg-slate-100 text-ink-2")}>
          {done ? <Check aria-hidden className="size-3.5" /> : <Icon aria-hidden className="size-3.5" />}
        </span>
        <span>
          <span className="block text-[13px] font-medium text-ink">{label}</span>
          <span className="block text-[12px] leading-snug text-muted">{desc}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="scene-chip flex items-center gap-1 rounded-xl p-1 text-white shadow-lg">
        <button aria-label={playing ? "Pause simulation" : "Resume simulation"} onClick={a.togglePlaying} className="grid size-8 place-items-center rounded-lg hover:bg-white/10">
          {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
        </button>
        {[1, 10, 60].map((v) => (
          <button
            key={v}
            aria-pressed={playing && speed === v}
            onClick={() => a.setSpeed(v)}
            className={cls("tabular h-8 rounded-lg px-2 text-[12px] font-semibold", playing && speed === v ? "bg-white text-ink" : "text-white/80 hover:bg-white/10")}
          >
            {v}×
          </button>
        ))}
        {ff && (
          <span className="flex items-center gap-1 px-1.5 text-[11px] font-semibold text-amber-300" title="Fast-forwarding through the transient">
            <FastForward aria-hidden className="size-3.5" /> 20×
          </span>
        )}
      </div>
      <div className="relative" ref={pop.ref}>
        <button
          aria-expanded={pop.open}
          aria-haspopup="dialog"
          onClick={() => pop.setOpen(!pop.open)}
          className="scene-chip flex h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-medium text-white shadow-lg hover:bg-white/10"
        >
          <Zap aria-hidden className="size-4 text-amber-300" />
          Scenario
          <span className="hidden whitespace-nowrap text-white/60 2xl:inline">· {STAGES[Math.max(0, stageIdx)]?.label ?? "Baseline"}</span>
          <ChevronDown aria-hidden className="size-4 text-white/70" />
        </button>
        {pop.open && (
          <div role="dialog" aria-label="Scenario controls" className="fade-in absolute right-0 z-30 mt-2 w-[330px] rounded-xl border border-line bg-white p-2 text-ink shadow-2xl">
            <div className="flex items-center justify-between px-2.5 pt-1 pb-2">
              <span className="text-sm font-semibold">Demonstration scenario</span>
              <span className="rounded-md border border-dashed border-line-strong px-1.5 py-px text-[10px] font-semibold tracking-wide text-muted uppercase">Simulated</span>
            </div>
            {step("Healthy baseline", "All pumps normal, every tank at design flow.", () => a.openDialog({ resetConfirm: true }), false, RotateCcw, stageIdx > 0, stage === "baseline")}
            {step("Simulate C-2 failure", "Inject a motor overcurrent fault on Pump C-2.", () => a.simulateFailure("PMP-C2"), !!active || c2.mode !== "running", TriangleAlert, stageIdx >= 1, stage === "fault")}
            {step("Backup response", "Advance until the configured C-3 auto-transfer is confirmed.", a.backupResponse, !active || stage !== "fault", Zap, stageIdx >= 2 && stage !== "backup", stage === "backup")}
            {step("Incident stabilization", "Advance until Tanks B and C hold steady on backup.", a.stabilize, !active || !(stage === "fault" || stage === "backup"), Layers, stageIdx >= 3 && stage !== "stabilized", stage === "stabilized")}
            {step("Recovery", "Record an authorized C-2 restart and restore normal service.", a.recover, !active || active.status !== "active", Wrench, stage === "recovered", stage === "recovering")}
            <div className="mt-1 border-t border-line px-2.5 pt-2.5 pb-1">
              <div className="mb-2 text-[12px] font-semibold text-muted uppercase">Presets</div>
              <div className="flex flex-wrap gap-1.5">
                <button className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium hover:bg-slate-50" onClick={() => a.loadPreset("incident")}>
                  Reference incident (10:24)
                </button>
                <button className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium hover:bg-slate-50" onClick={() => a.loadPreset("stabilizing")}>
                  Fault onset (10:10)
                </button>
                <button className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium hover:bg-slate-50" disabled={sim.pumps["PMP-C1"].mode !== "running"} onClick={() => a.simulateFailure("PMP-C1")}>
                  Fail C-1 (no backup)
                </button>
              </div>
              <label className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-2">
                <input type="checkbox" checked={autoFF} onChange={(e) => a.setAutoFastForward(e.target.checked)} className="size-4 accent-brand" />
                Auto fast-forward transients (20×)
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ViewerButtons() {
  const textView = useAppStore((s) => s.textView);
  const setTextView = useAppStore((s) => s.setTextView);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  return (
    <div className="flex items-center gap-1.5">
      <button
        aria-pressed={textView}
        onClick={() => setTextView(!textView)}
        className={cls("scene-chip flex h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-medium shadow-lg", textView ? "bg-white! text-ink" : "text-white hover:bg-white/10")}
        title="Accessible text view of the facility (T)"
      >
        <Table2 aria-hidden className="size-4" />
        <span className="hidden 2xl:inline">Text view</span>
      </button>
      <button
        aria-label={full ? "Exit full screen" : "Full screen viewer"}
        onClick={() => {
          const el = document.getElementById("viewer");
          if (!document.fullscreenElement) void el?.requestFullscreen?.();
          else void document.exitFullscreen();
        }}
        className="scene-chip grid size-10 place-items-center rounded-xl text-white shadow-lg hover:bg-white/10"
      >
        {full ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
      </button>
    </div>
  );
}

const LAYER_LABELS: { key: LayerKey; label: string }[] = [
  { key: "tanks", label: "Tanks" },
  { key: "pumps", label: "Pumps" },
  { key: "filters", label: "Filtration" },
  { key: "pipes", label: "Pipes" },
  { key: "valves", label: "Valves" },
  { key: "sensors", label: "Sensors" },
  { key: "shell", label: "Architectural shell" },
  { key: "flow", label: "Water flow" },
  { key: "labels", label: "Equipment labels" },
  { key: "marine", label: "Marine life" },
  { key: "visitors", label: "Visitors" },
];

export function LayerToggles({ compact }: { compact?: boolean }) {
  const layers = useAppStore((s) => s.layers[s.mode]);
  const mode = useAppStore((s) => s.mode);
  const toggle = useAppStore((s) => s.toggleLayer);
  const reset = useAppStore((s) => s.resetLayers);
  return (
    <div>
      <ul className={cls("grid gap-0.5", compact ? "grid-cols-1" : "grid-cols-1")}>
        {LAYER_LABELS.filter((l) => !(mode !== "public" && l.key === "visitors")).map((l) => {
          const disabled = mode === "public" && ["pumps", "filters", "valves", "sensors", "pipes", "flow", "labels"].includes(l.key);
          return (
            <li key={l.key}>
              <label className={cls("flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] hover:bg-slate-50", disabled && "cursor-not-allowed opacity-50")}>
                <span className="text-ink-2">{l.label}</span>
                <span className="relative inline-flex">
                  <input type="checkbox" role="switch" className="peer sr-only" checked={layers[l.key]} disabled={disabled} onChange={() => toggle(l.key)} />
                  <span className="h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2" />
                  <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {mode === "public" && <p className="mt-1 px-2 text-[11.5px] text-muted">Engineering layers are hidden behind the building in Public View. Switch to Infrastructure View to reveal them.</p>}
      <button onClick={reset} className="mt-1 px-2 text-[12px] font-medium text-brand hover:underline">
        Reset layers for this view
      </button>
    </div>
  );
}

export function ViewerControls() {
  const resetCamera = useAppStore((s) => s.resetCamera);
  const selectedId = useAppStore((s) => s.selectedId);
  const pop = usePopover();
  const btn = "grid size-10 place-items-center rounded-lg text-white hover:bg-white/10 disabled:opacity-40";
  return (
    <div className="flex items-end gap-1.5">
      <div className="scene-chip flex items-center gap-0.5 rounded-xl p-1 shadow-lg">
        <button aria-label="Reset camera view" title="Reset view (R)" onClick={resetCamera} className={btn}>
          <LocateFixed aria-hidden className="size-[18px]" />
        </button>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-white/15" />
        <button aria-label="Zoom out" onClick={() => window.dispatchEvent(new CustomEvent("aqualink:zoom", { detail: -6 }))} className={btn}>
          <Minus aria-hidden className="size-[18px]" />
        </button>
        <button aria-label="Zoom in" onClick={() => window.dispatchEvent(new CustomEvent("aqualink:zoom", { detail: 6 }))} className={btn}>
          <Plus aria-hidden className="size-[18px]" />
        </button>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-white/15" />
        <button aria-label="Focus selected asset" title="Focus selected (F)" disabled={!selectedId} onClick={() => selectedId && window.dispatchEvent(new CustomEvent("aqualink:focus", { detail: selectedId }))} className={btn}>
          <Focus aria-hidden className="size-[18px]" />
        </button>
      </div>
      <div className="relative" ref={pop.ref}>
        <button aria-label="Visibility layers" aria-expanded={pop.open} onClick={() => pop.setOpen(!pop.open)} className="scene-chip grid size-12 place-items-center rounded-xl text-white shadow-lg hover:bg-white/10">
          <Layers aria-hidden className="size-5" />
        </button>
        {pop.open && (
          <div className="fade-in absolute bottom-14 left-0 z-30 w-64 rounded-xl border border-line bg-white p-2 shadow-2xl">
            <div className="px-2 pt-1 pb-1.5 text-sm font-semibold">Visibility layers</div>
            <LayerToggles compact />
          </div>
        )}
      </div>
    </div>
  );
}

function BuildingGlyph({ level }: { level: FloorId | null }) {
  const levels: { id: FloorId; y: number }[] = [
    { id: "L3", y: 8 },
    { id: "L2", y: 22 },
    { id: "L1", y: 36 },
    { id: "B1", y: 52 },
  ];
  return (
    <svg viewBox="0 0 120 70" className="h-[70px] w-[120px]" aria-hidden>
      {levels.map((l) => {
        const on = level === l.id;
        return (
          <g key={l.id} transform={`translate(0 ${l.y})`}>
            <path d="M20 8 L60 0 L100 8 L60 16 Z" fill={on ? "rgba(96,165,250,0.45)" : "rgba(255,255,255,0.06)"} stroke={on ? "#93c5fd" : "rgba(255,255,255,0.35)"} strokeWidth="1" />
          </g>
        );
      })}
      <circle cx="60" cy="31" r="5" fill="none" stroke="rgba(125,211,252,0.8)" strokeWidth="1.2" />
    </svg>
  );
}

export function FloorSelector() {
  const level = useAppStore((s) => s.level);
  const setLevel = useAppStore((s) => s.setLevel);
  return (
    <div className="scene-chip flex items-center gap-2 rounded-xl p-2 shadow-lg">
      <div className="hidden xl:block">
        <BuildingGlyph level={level} />
      </div>
      <div role="radiogroup" aria-label="Focus level" className="flex flex-col gap-0.5">
        {FLOORS.map((f) => {
          const on = level === f.id;
          return (
            <button
              key={f.id}
              role="radio"
              aria-checked={on}
              title={f.name}
              onClick={() => setLevel(on ? null : f.id)}
              className={cls("h-7 w-10 rounded-md text-[12px] font-semibold", on ? "bg-white text-brand ring-2 ring-sky-300" : "text-white/80 hover:bg-white/10")}
            >
              {f.id}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FlowLegend() {
  const items = [
    { label: "Normal flow", color: FLOW_VISUAL_HEX.normal, dash: false },
    { label: "Backup / limited", color: FLOW_VISUAL_HEX.backup, dash: false },
    { label: "Interrupted", color: FLOW_VISUAL_HEX.interrupted, dash: true },
    { label: "Idle / offline", color: FLOW_VISUAL_HEX.standby, dash: false },
  ];
  return (
    <ul aria-label="Flow legend" className="scene-chip flex items-center gap-4 rounded-xl px-4 py-2.5 text-[12.5px] text-white/90 shadow-lg">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2 whitespace-nowrap">
          <svg width="22" height="8" aria-hidden>
            <line x1="1" y1="4" x2="21" y2="4" stroke={i.color} strokeWidth="4" strokeLinecap="round" strokeDasharray={i.dash ? "4 3" : undefined} />
          </svg>
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function IncidentTimelineOverlay() {
  const sim = useAppStore((s) => s.sim);
  const show = useAppStore((s) => s.showTimeline);
  const setShow = useAppStore((s) => s.setShowTimeline);
  const inc = activeIncidents(sim)[0] ?? [...sim.incidents].reverse()[0];
  if (!inc) return null;
  const events = sim.events.filter((e) => e.incidentId === inc.id);
  const tone = (k: string) => (k === "fault" || k === "alarm" || k === "status" ? "#d1242f" : k === "stable" ? "#e39a12" : k === "transfer" || k === "backup" || k === "command" ? "#1d6fe0" : "#15803d");
  return (
    <section aria-label={`${inc.id} timeline`} className="pointer-events-auto rounded-2xl border border-line bg-white/95 shadow-2xl backdrop-blur">
      <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-1.5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          Incident Timeline
          <span className="text-[12px] font-medium text-muted">
            {inc.id} · simulated time {inc.status === "resolved" && "· resolved"}
          </span>
        </h2>
        <button onClick={() => setShow(!show)} aria-expanded={show} className="rounded-md px-2 py-1 text-[12px] font-medium text-muted hover:bg-slate-100">
          {show ? "Hide" : "Show"}
        </button>
      </header>
      {show && (
        <ol className="scroll-thin grid max-h-[132px] grid-flow-col grid-rows-3 gap-x-8 gap-y-1 overflow-x-auto px-4 pb-3">
          {events.map((e) => (
            <li key={e.id} className="flex min-w-0 items-center gap-2.5 text-[13.5px]" title={e.detail}>
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: tone(e.kind) }} />
              <span className="tabular w-11 shrink-0 font-semibold text-ink">{hm(e.t)}</span>
              <span className="truncate text-ink-2">{e.title}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
