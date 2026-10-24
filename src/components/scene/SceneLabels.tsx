"use client";

import { AlertTriangle } from "lucide-react";
import { memo, useCallback, useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { FILTERS, JUNCTIONS, PUMPS, SENSORS, TANKS, VALVES } from "@/lib/data/facility";
import { cls } from "@/lib/format";
import { activeIncidents } from "@/lib/simulation/engine";
import { filterReading, sensorValue, tankReading } from "@/lib/simulation/readings";
import { TONE_HEX, pumpStatusInfo, tankStatusInfo, type StatusInfo } from "@/lib/status";
import { STATUS_ICONS } from "@/components/ui/primitives";
import type { Vec3 } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { registerLabel, unregisterLabel } from "./labels";
import { useTraceSet } from "./trace";

interface LabelProps {
  id: string;
  ownerId: string;
  anchor: Vec3;
  priority: number;
  emphasis: number;
  align?: "center" | "bottom";
  maxDistance?: number;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}

function SceneLabel({ id, ownerId, anchor, priority, emphasis, align = "bottom", maxDistance = 140, ariaLabel, className, children }: LabelProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const select = useAppStore((s) => s.select);
  const hover = useAppStore((s) => s.hover);
  const anchorKey = anchor.join(",");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const [x, y, z] = anchorKey.split(",").map(Number);
    registerLabel({ id, el, anchor: new THREE.Vector3(x, y, z), priority, ownerId, emphasis, align, maxDistance });
    return () => unregisterLabel(id, el);
  }, [id, ownerId, anchorKey, priority, emphasis, align, maxDistance]);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      onClick={() => {
        select(ownerId);
        window.dispatchEvent(new CustomEvent("aqualink:focus", { detail: ownerId }));
      }}
      onMouseEnter={() => hover(ownerId)}
      onMouseLeave={() => hover(null)}
      onFocus={() => hover(ownerId)}
      onBlur={() => hover(null)}
      className={cls("scene-focus group absolute top-0 left-0 flex cursor-pointer flex-col items-center text-left transition-opacity duration-200 will-change-transform select-none", className)}
      style={{ visibility: "hidden", opacity: 0 }}
    >
      {children}
    </button>
  );
}

function StatusGlyph({ info, size = 13 }: { info: StatusInfo; size?: number }) {
  const Icon = STATUS_ICONS[info.icon];
  return <Icon aria-hidden style={{ width: size, height: size, color: TONE_HEX[info.tone] }} strokeWidth={2.6} className={cls("shrink-0", info.icon === "spinner" && "animate-spin")} />;
}

/** Thin stem from the chip down to the asset it names. */
function Stem({ tone, length = 18 }: { tone: string; length?: number }) {
  return (
    <span aria-hidden className="flex flex-col items-center">
      <span className="w-px" style={{ height: length, background: `linear-gradient(${tone}, transparent)` }} />
      <span className="-mt-0.5 size-1.5 rounded-full" style={{ background: tone, boxShadow: `0 0 8px ${tone}` }} />
    </span>
  );
}

function SceneLabelsImpl() {
  const mode = useAppStore((s) => s.mode);
  const sim = useAppStore((s) => s.sim);
  const layers = useAppStore((s) => s.layers[s.mode]);
  const selectedId = useAppStore((s) => s.selectedId);
  const hoveredId = useAppStore((s) => s.hoveredId);
  const level = useAppStore((s) => s.level);
  const trace = useTraceSet();
  const incident = activeIncidents(sim)[0];

  const emphasisFor = useCallback(
    (id: string, floor?: string) => {
      if (selectedId === id || hoveredId === id) return 1;
      let e = 1;
      if (trace.active && !trace.nodes.has(id)) e = 0.45;
      if (level && floor && floor !== level) e = Math.min(e, 0.4);
      return e;
    },
    [selectedId, hoveredId, trace, level],
  );

  const labels: ReactNode[] = [];

  if (layers.tanks) {
    for (const t of TANKS) {
      const tank = sim.tanks[t.id];
      const info = tankStatusInfo(tank.status);
      const r = tankReading(sim, t.id);
      const tone = info.tone === "ok" ? "#4ade80" : TONE_HEX[info.tone];
      const top = t.position[1] + t.plinth + t.height + (t.radius < 4 ? 0.55 : 0.35);
      const pri = (selectedId === t.id ? 100 : 0) + (info.tone === "crit" ? 60 : info.tone === "warn" ? 50 : 40);
      const aria = `${t.name}, ${t.habitat.name}: ${info.label}, ${Math.round(tank.flowPct)}% circulation, ${r.temp.toFixed(1)} degrees, pH ${r.ph.toFixed(1)}`;
      const open = selectedId === t.id || hoveredId === t.id;
      const alert = info.tone !== "ok";
      labels.push(
        <SceneLabel key={t.id} id={`lbl-${t.id}`} ownerId={t.id} anchor={[t.position[0], top, t.position[2]]} priority={pri} emphasis={emphasisFor(t.id, t.floor)} ariaLabel={aria}>
          <span
            className={cls(
              "scene-pill flex items-center gap-1.5 rounded-full py-1 pr-1 pl-2 text-white",
              open && "ring-2 ring-sky-300/80",
              alert && "scene-pill-alert",
            )}
            style={alert ? { borderColor: `${tone}88`, boxShadow: `0 0 0 1px ${tone}33, 0 6px 20px ${tone}40` } : undefined}
          >
            <StatusGlyph info={info} />
            <span className="text-[12.5px] leading-none font-semibold tracking-tight whitespace-nowrap">{t.name}</span>
            <span className="tabular rounded-full px-1.5 py-0.5 text-[11.5px] leading-none font-bold" style={{ background: `${tone}26`, color: tone }}>
              {Math.round(tank.flowPct)}%
            </span>
          </span>
          {(open || (mode === "operations" && alert)) && (
            <span className="scene-pill fade-in mt-1 rounded-lg px-2 py-1 text-[11px] leading-tight whitespace-nowrap text-white/85">
              {alert && <span className="font-semibold" style={{ color: tone }}>{info.label} · </span>}
              <span className="tabular">
                {r.temp.toFixed(1)}°C · pH {r.ph.toFixed(1)}
              </span>
            </span>
          )}
          <Stem tone={tone} length={open ? 10 : 16} />
        </SceneLabel>,
      );
    }
  }

  // Equipment chips: always in Operations, and in the public view for whatever is selected or faulted.
  const showEquip = (id: string, alert: boolean) => (mode === "operations" && layers.labels) || selectedId === id || hoveredId === id || (alert && mode === "operations");

  if (layers.pumps) {
    for (const p of PUMPS) {
      const pr = sim.pumps[p.id];
      const info = pumpStatusInfo(pr);
      if (!showEquip(p.id, info.tone === "crit")) continue;
      const isRoot = incident?.rootAssetId === p.id && info.tone === "crit";
      const pri = (selectedId === p.id ? 100 : 0) + (info.tone === "crit" ? 70 : info.tone === "backup" ? 55 : 45);
      const tone = info.tone === "ok" ? "#4ade80" : TONE_HEX[info.tone];
      labels.push(
        <SceneLabel key={p.id} id={`lbl-${p.id}`} ownerId={p.id} anchor={[p.position[0], p.position[1] + 2.3, p.position[2]]} priority={pri} emphasis={emphasisFor(p.id, p.floor)} ariaLabel={`${p.name}: ${info.label}`}>
          {isRoot ? (
            <span className="scene-pill flex items-center gap-2 rounded-full border-red-500/60 py-1 pr-3 pl-1 text-white" style={{ background: "rgba(80,10,14,0.88)", boxShadow: "0 0 24px rgba(239,68,68,0.45)" }}>
              <span className="pulse-crit grid size-6 place-items-center rounded-full bg-red-600">
                <AlertTriangle aria-hidden className="size-3.5" strokeWidth={2.6} />
              </span>
              <span className="text-[12.5px] leading-none font-semibold whitespace-nowrap">{p.code} motor fault</span>
              <span className="text-[11px] leading-none text-red-200">stopped</span>
            </span>
          ) : (
            <span className={cls("scene-pill flex items-center gap-1.5 rounded-full px-2 py-1 text-white", selectedId === p.id && "ring-2 ring-sky-300/80")}>
              <StatusGlyph info={info} size={12} />
              <span className="text-[12px] leading-none font-semibold whitespace-nowrap">Pump {p.code}</span>
              <span className="text-[11px] leading-none font-medium whitespace-nowrap" style={{ color: tone }}>
                {info.label}
              </span>
            </span>
          )}
          <Stem tone={tone} length={12} />
        </SceneLabel>,
      );
    }
  }
  if (layers.filters) {
    for (const f of FILTERS) {
      const fr = filterReading(sim, f.id);
      const blocked = fr.clogPct > 2;
      if (!showEquip(f.id, blocked)) continue;
      const tone = fr.backwashing ? "#38bdf8" : blocked ? "#ef4444" : "#4ade80";
      const isRoot = incident?.rootAssetId === f.id;
      labels.push(
        <SceneLabel key={f.id} id={`lbl-${f.id}`} ownerId={f.id} anchor={[f.position[0], f.position[1] + f.height + 0.6, f.position[2]]} priority={isRoot ? 72 : selectedId === f.id ? 100 : 22} emphasis={emphasisFor(f.id, f.floor)} maxDistance={90} ariaLabel={`${f.name}: ${Math.round(fr.flow)} cubic metres per hour, ${fr.dpKpa.toFixed(0)} kPa`}>
          <span
            className="scene-pill flex items-center gap-1.5 rounded-full px-2 py-1 text-white"
            style={isRoot ? { background: "rgba(80,10,14,0.88)", boxShadow: "0 0 24px rgba(239,68,68,0.45)" } : undefined}
          >
            {isRoot && (
              <span className="pulse-crit grid size-5 place-items-center rounded-full bg-red-600">
                <AlertTriangle aria-hidden className="size-3" strokeWidth={2.6} />
              </span>
            )}
            <span className="text-[12px] leading-none font-semibold whitespace-nowrap">{isRoot ? `${f.code} blocked` : `Filter ${f.code}`}</span>
            <span className="tabular text-[11px] leading-none whitespace-nowrap" style={{ color: tone }}>
              {fr.backwashing ? "backwashing" : `${fr.dpKpa.toFixed(0)} kPa`}
            </span>
          </span>
          <Stem tone={tone} length={12} />
        </SceneLabel>,
      );
    }
  }
  if (mode === "operations" && layers.labels && layers.valves) {
    for (const v of VALVES) {
      const open = (sim.valves[v.id]?.open ?? 0) > 0.5;
      const relevant = trace.active ? trace.nodes.has(v.id) : v.type === "auto-transfer";
      if (!relevant && selectedId !== v.id && hoveredId !== v.id) continue;
      labels.push(
        <SceneLabel key={v.id} id={`lbl-${v.id}`} ownerId={v.id} anchor={[v.position[0], v.position[1] + 0.62, v.position[2]]} priority={selectedId === v.id ? 100 : 12} emphasis={emphasisFor(v.id, v.floor)} maxDistance={70} ariaLabel={`${v.code} ${v.name}: ${open ? "open" : "closed"}`}>
          <span className="scene-pill rounded-full px-1.5 py-0.5 text-[10.5px] leading-none font-medium whitespace-nowrap text-white/90">
            {v.code} <span className={open ? "text-emerald-300" : "text-slate-300"}>{open ? "open" : "closed"}</span>
          </span>
        </SceneLabel>,
      );
    }
  }
  for (const j of JUNCTIONS) {
    if (!layers.pipes || (selectedId !== j.id && hoveredId !== j.id)) continue;
    labels.push(
      <SceneLabel key={j.id} id={`lbl-${j.id}`} ownerId={j.id} anchor={[j.position[0], j.position[1] + 0.55, j.position[2]]} priority={100} emphasis={1} ariaLabel={j.name}>
        <span className="scene-pill rounded-full px-1.5 py-0.5 text-[10.5px] leading-none font-medium whitespace-nowrap text-white/90">{j.code}</span>
      </SceneLabel>,
    );
  }
  if (layers.sensors) {
    for (const s of SENSORS) {
      if (selectedId !== s.id && hoveredId !== s.id) continue;
      const val = sensorValue(sim, s.id);
      labels.push(
        <SceneLabel key={s.id} id={`lbl-${s.id}`} ownerId={s.id} anchor={[s.position[0], s.position[1] + 0.35, s.position[2]]} priority={100} emphasis={1} ariaLabel={`${s.name}: ${val.display}`}>
          <span className="scene-pill rounded-full px-1.5 py-0.5 text-[10.5px] leading-none font-medium whitespace-nowrap text-white/90">
            {s.code} <span className="tabular text-sky-200">{val.display}</span>
          </span>
        </SceneLabel>,
      );
    }
  }

  return (
    <div aria-label="3D facility labels" role="group" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="pointer-events-auto">{labels}</div>
    </div>
  );
}

export const SceneLabels = memo(SceneLabelsImpl);
