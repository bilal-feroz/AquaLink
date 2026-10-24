"use client";

import { Activity, ChevronDown, Fish, Focus, Layers, LocateFixed, Maximize2, Minimize2, Minus, Plus, Table2, Users, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FLOORS } from "@/lib/data/facility";
import { cls, hm } from "@/lib/format";
import { activeIncidents, type SimEvent } from "@/lib/simulation/engine";
import { FLOW_VISUAL_HEX } from "@/lib/status";
import { TANK_BY_ID } from "@/lib/topology/graph";
import type { FloorId } from "@/lib/types";
import { useAppStore, type LayerKey, type ViewMode } from "@/store/useAppStore";
import { usePopover } from "@/components/layout/Header";

const MODES: { id: ViewMode; label: string; hint: string; icon: LucideIcon; key: string }[] = [
  { id: "public", label: "Public", hint: "Visitor view", icon: Users, key: "1" },
  { id: "operations", label: "Operations", hint: "Infrastructure & incidents", icon: Activity, key: "2" },
];

export function ModeSwitcher() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const hasIncident = useAppStore((s) => activeIncidents(s.sim).length > 0);
  return (
    <div role="radiogroup" aria-label="View mode" className="scene-chip relative flex items-center gap-1 rounded-2xl p-1 shadow-lg">
      {MODES.map((m) => {
        const active = mode === m.id;
        const Icon = m.icon;
        const alert = m.id === "operations" && hasIncident;
        return (
          <button
            key={m.id}
            role="radio"
            aria-checked={active}
            aria-keyshortcuts={m.key}
            onClick={() => setMode(m.id)}
            className={cls(
              "relative flex items-center gap-2.5 rounded-xl py-1.5 pr-3.5 pl-2 text-left whitespace-nowrap transition-all",
              active ? (alert ? "bg-white text-crit shadow-md ring-2 ring-crit/60" : "bg-white text-brand shadow-md") : "text-white/85 hover:bg-white/10 hover:text-white",
            )}
          >
            <span className={cls("grid size-7 place-items-center rounded-lg", active ? (alert ? "bg-crit-bg" : "bg-brand-50") : "bg-white/10")}>
              <Icon aria-hidden className="size-4" />
            </span>
            <span>
              <span className="block text-[13px] leading-tight font-semibold">{m.label}</span>
              <span className={cls("block text-[10.5px] leading-tight", active ? "text-muted" : "text-white/55")}>{m.hint}</span>
            </span>
            {alert && !active && <span aria-hidden className="pulse-crit absolute top-1.5 right-1.5 size-2 rounded-full bg-red-500" />}
          </button>
        );
      })}
    </div>
  );
}

/** Shown while the camera is tracking one species. */
export function FollowBadge() {
  const follow = useAppStore((s) => s.follow);
  const setFollow = useAppStore((s) => s.setFollow);
  if (!follow) return null;
  const t = TANK_BY_ID[follow.tankId];
  const sp = t?.habitat.species[follow.species];
  if (!t || !sp) return null;
  return (
    <div className="scene-chip fade-in flex items-center gap-2.5 rounded-full py-1.5 pr-1.5 pl-3 text-white shadow-lg">
      <Fish aria-hidden className="size-4 text-sky-300" />
      <span className="text-[13px]">
        Following <span className="font-semibold">{sp.label}</span> <span className="text-white/60">· {t.name}</span>
      </span>
      <button onClick={() => setFollow(null)} aria-label="Stop following" className="grid size-7 place-items-center rounded-full bg-white/10 hover:bg-white/20">
        <X aria-hidden className="size-3.5" />
      </button>
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
        <span className="hidden xl:inline">Text view</span>
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
  { key: "marine", label: "Marine life" },
  { key: "pumps", label: "Pumps" },
  { key: "filters", label: "Filtration" },
  { key: "pipes", label: "Pipes" },
  { key: "valves", label: "Valves" },
  { key: "sensors", label: "Sensors" },
  { key: "flow", label: "Water flow" },
  { key: "shell", label: "Architectural shell" },
  { key: "labels", label: "Equipment labels" },
  { key: "visitors", label: "Visitors" },
];

export function LayerToggles({ compact }: { compact?: boolean }) {
  const layers = useAppStore((s) => s.layers[s.mode]);
  const mode = useAppStore((s) => s.mode);
  const toggle = useAppStore((s) => s.toggleLayer);
  const reset = useAppStore((s) => s.resetLayers);
  return (
    <div>
      <ul className={cls("grid gap-0.5", compact ? "grid-cols-1" : "grid-cols-2 gap-x-3")}>
        {LAYER_LABELS.filter((l) => !(mode !== "public" && l.key === "visitors")).map((l) => (
          <li key={l.key}>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] hover:bg-slate-50">
              <span className="text-ink-2">{l.label}</span>
              <span className="relative inline-flex">
                <input type="checkbox" role="switch" className="peer sr-only" checked={layers[l.key]} onChange={() => toggle(l.key)} />
                <span className="h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2" />
                <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
              </span>
            </label>
          </li>
        ))}
      </ul>
      {mode === "public" && <p className="mt-1 px-2 text-[11.5px] text-muted">In the public view, pipework is only drawn inside the plant hall behind the exhibits. Orbit round, or switch to Operations, to see it all.</p>}
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
  const levels: { id: FloorId; y: number; x: number }[] = [
    { id: "L3", y: 6, x: 0 },
    { id: "L2", y: 20, x: 0 },
    { id: "L1", y: 34, x: 0 },
    { id: "PL", y: 34, x: 26 },
  ];
  return (
    <svg viewBox="0 0 132 62" className="h-[62px] w-[132px]" aria-hidden>
      {levels.map((l) => {
        const on = level === l.id;
        return (
          <g key={l.id} transform={`translate(${l.x} ${l.y})`}>
            <path
              d={l.id === "PL" ? "M66 8 L94 3 L122 8 L94 13 Z" : "M8 8 L48 0 L88 8 L48 16 Z"}
              fill={on ? "rgba(96,165,250,0.45)" : "rgba(255,255,255,0.06)"}
              stroke={on ? "#93c5fd" : "rgba(255,255,255,0.35)"}
              strokeWidth="1"
            />
          </g>
        );
      })}
      <circle cx="48" cy="28" r="5" fill="none" stroke="rgba(125,211,252,0.8)" strokeWidth="1.2" />
      <text x="110" y="56" fontSize="7" fill="rgba(255,255,255,0.45)" textAnchor="middle">
        plant
      </text>
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
              className={cls("h-7 min-w-10 rounded-md px-1.5 text-[12px] font-semibold", on ? "bg-white text-brand ring-2 ring-sky-300" : "text-white/80 hover:bg-white/10")}
            >
              {f.id === "PL" ? "Plant" : f.id}
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
    { label: "Upstream of fault", color: FLOW_VISUAL_HEX.upstream, dash: true },
    { label: "Idle / offline", color: FLOW_VISUAL_HEX.standby, dash: false },
  ];
  return (
    <ul aria-label="Flow legend" className="scene-chip flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-xl px-4 py-2.5 text-[12.5px] text-white/90 shadow-lg">
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
  const tone = (k: string, sev: string) =>
    k === "fault" || k === "status" || (k === "alarm" && sev === "critical") ? "#d1242f" : k === "stable" || k === "alarm" ? "#e39a12" : k === "transfer" || k === "backup" || k === "command" ? "#1d6fe0" : "#15803d";
  const resolved = inc.status === "resolved";
  return (
    <section aria-label={`${inc.id} timeline`} className="scene-chip pointer-events-auto w-[360px] max-w-full overflow-hidden rounded-xl text-white shadow-2xl">
      <header className="flex items-center gap-2 px-3 pt-2 pb-1.5">
        <span aria-hidden className={cls("size-2 shrink-0 rounded-full", resolved ? "bg-emerald-400" : "pulse-crit bg-red-500")} />
        <h2 className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
          Incident timeline <span className="font-normal text-white/60">· {inc.id}{resolved ? " · resolved" : ""}</span>
        </h2>
        <button onClick={() => setShow(!show)} aria-expanded={show} aria-label={show ? "Collapse incident timeline" : "Expand incident timeline"} className="grid size-6 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white">
          <ChevronDown aria-hidden className={cls("size-4 transition-transform", !show && "rotate-180")} />
        </button>
      </header>
      {show && <TimelineList events={events} tone={tone} />}
    </section>
  );
}

/** Newest events at the bottom; the list stays scrolled to the latest one. */
function TimelineList({ events, tone }: { events: SimEvent[]; tone: (k: string, sev: string) => string }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);
  return (
    <ol ref={ref} className="scroll-thin max-h-[104px] space-y-0.5 overflow-y-auto border-t border-white/10 px-3 pt-1.5 pb-2">
      {events.map((e) => (
        <li key={e.id} className="flex min-w-0 items-center gap-2 text-[12px] leading-5" title={e.detail}>
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: tone(e.kind, e.severity) }} />
          <span className="tabular w-10 shrink-0 font-semibold">{hm(e.t)}</span>
          <span className="truncate text-white/80">{e.title}</span>
        </li>
      ))}
    </ol>
  );
}
