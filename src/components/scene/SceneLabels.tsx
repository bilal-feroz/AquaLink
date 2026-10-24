"use client";

import { AlertTriangle } from "lucide-react";
import { memo, useCallback, useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { FILTERS, JUNCTIONS, PUMPS, SENSORS, TANKS, VALVES } from "@/lib/data/facility";
import { cls } from "@/lib/format";
import { activeIncidents } from "@/lib/simulation/engine";
import { sensorValue, tankReading } from "@/lib/simulation/readings";
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

function SceneLabel({ id, ownerId, anchor, priority, emphasis, align = "center", maxDistance = 140, ariaLabel, className, children }: LabelProps) {
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
      onClick={() => select(ownerId)}
      onMouseEnter={() => hover(ownerId)}
      onMouseLeave={() => hover(null)}
      onFocus={() => hover(ownerId)}
      onBlur={() => hover(null)}
      className={cls("scene-focus absolute top-0 left-0 cursor-pointer text-left transition-opacity duration-200 will-change-transform select-none", className)}
      style={{ visibility: "hidden", opacity: 0 }}
    >
      {children}
    </button>
  );
}

function StatusGlyph({ info, size = 14 }: { info: StatusInfo; size?: number }) {
  const Icon = STATUS_ICONS[info.icon];
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size + 4, height: size + 4 }}>
      <span className="absolute inset-0 rounded-full opacity-25" style={{ background: TONE_HEX[info.tone] }} />
      <Icon aria-hidden style={{ width: size - 2, height: size - 2, color: TONE_HEX[info.tone] }} strokeWidth={2.4} className={info.icon === "spinner" ? "animate-spin" : undefined} />
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
      if (trace.active && !trace.nodes.has(id)) e = 0.42;
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
      const flowColor = info.tone === "ok" ? "#4ade80" : TONE_HEX[info.tone];
      const anchorY = t.id === "TNK-A" ? t.position[1] + 9.2 : t.position[1] + t.plinth + t.height * 0.6;
      const pri = (selectedId === t.id ? 100 : 0) + (info.tone === "crit" ? 60 : info.tone === "warn" ? 50 : 40);
      const aria = `${t.name}, ${t.habitat.name}: ${info.label}, ${Math.round(tank.flowPct)}% circulation, ${r.temp.toFixed(1)} degrees, pH ${r.ph.toFixed(1)}`;
      const selected = selectedId === t.id;
      labels.push(
        <SceneLabel key={t.id} id={`lbl-${t.id}`} ownerId={t.id} anchor={[t.position[0], anchorY, t.position[2]]} priority={pri} emphasis={emphasisFor(t.id, t.floor)} ariaLabel={aria}>
          <div className={cls("scene-label rounded-xl px-3 py-2 text-white", selected && "ring-2 ring-sky-300/80", info.tone === "crit" && "border-red-400/40")}>
            <div className="flex items-center gap-2">
              <StatusGlyph info={info} />
              <span className="text-[15px] leading-none font-semibold tracking-tight">{t.name}</span>
            </div>
            {mode === "public" && (
              <>
                <div className="tabular mt-1.5 text-[13px] leading-tight text-white/85">
                  {r.temp.toFixed(1)}°C <span className="text-white/35">|</span> {r.ph.toFixed(1)} pH
                </div>
                <div className="tabular mt-0.5 text-[13px] leading-tight font-semibold" style={{ color: flowColor }}>
                  {Math.round(tank.flowPct)}% flow
                </div>
              </>
            )}
            {mode === "infrastructure" && (
              <div className="tabular mt-1 text-center text-[19px] leading-none font-semibold" style={{ color: info.tone === "ok" ? "#fff" : flowColor }}>
                {Math.round(tank.flowPct)}%
              </div>
            )}
            {mode === "incident" && (
              <>
                <div className="mt-1 text-[13px] leading-tight font-semibold" style={{ color: flowColor }}>
                  {info.label}
                </div>
                <div className="tabular text-[15px] leading-tight font-semibold" style={{ color: info.tone === "ok" ? "#fff" : flowColor }}>
                  {Math.round(tank.flowPct)}%
                </div>
              </>
            )}
          </div>
        </SceneLabel>,
      );
    }
  }

  if (mode !== "public" && layers.labels) {
    if (layers.pumps) {
      for (const p of PUMPS) {
        const pr = sim.pumps[p.id];
        const info = pumpStatusInfo(pr);
        const isRoot = incident?.rootAssetId === p.id && info.tone === "crit";
        const pri = (selectedId === p.id ? 100 : 0) + (info.tone === "crit" ? 70 : info.tone === "backup" ? 55 : 45);
        labels.push(
          <SceneLabel
            key={p.id}
            id={`lbl-${p.id}`}
            ownerId={p.id}
            anchor={[p.position[0], p.position[1] + 2.75, p.position[2]]}
            priority={pri}
            emphasis={emphasisFor(p.id, p.floor)}
            align="bottom"
            ariaLabel={`${p.name}: ${info.label}`}
          >
            {isRoot && mode === "incident" ? (
              <div className="scene-label flex items-center gap-2.5 rounded-xl border-red-500/60 bg-red-950/80 px-3 py-2 text-white shadow-[0_0_24px_rgba(239,68,68,0.35)]">
                <span className="pulse-crit grid size-7 place-items-center rounded-full bg-red-600">
                  <AlertTriangle aria-hidden className="size-4" strokeWidth={2.5} />
                </span>
                <span>
                  <span className="block text-[14px] leading-tight font-semibold">{p.code} Motor Fault</span>
                  <span className="block text-[12px] leading-tight text-red-200">Stopped</span>
                </span>
              </div>
            ) : (
              <div className={cls("scene-label rounded-xl px-3 py-1.5 text-white", selectedId === p.id && "ring-2 ring-sky-300/80", info.tone === "crit" && "border-red-400/50")}>
                <div className="flex items-center gap-1.5">
                  <StatusGlyph info={info} size={12} />
                  <span className="text-[13px] leading-none font-semibold">Pump {p.code}</span>
                </div>
                <div className="mt-1 text-[12px] leading-none font-medium" style={{ color: info.tone === "ok" ? "#86efac" : TONE_HEX[info.tone] }}>
                  {info.label}
                </div>
              </div>
            )}
          </SceneLabel>,
        );
      }
    }
    if (layers.filters) {
      for (const f of FILTERS) {
        const flow = sim.nodeFlow[f.id] ?? 0;
        labels.push(
          <SceneLabel key={f.id} id={`lbl-${f.id}`} ownerId={f.id} anchor={[f.position[0], f.position[1] + f.height + 0.75, f.position[2]]} priority={selectedId === f.id ? 100 : 20} emphasis={emphasisFor(f.id, f.floor)} align="bottom" maxDistance={70} ariaLabel={`${f.name}: ${Math.round(flow)} cubic metres per hour`}>
            <div className="scene-chip rounded-lg px-2 py-1 text-[11px] leading-none font-medium text-white/90">
              {f.code} <span className="tabular text-white/55">· {Math.round(flow)} m³/h</span>
            </div>
          </SceneLabel>,
        );
      }
    }
    if (layers.valves) {
      for (const v of VALVES) {
        const open = (sim.valves[v.id]?.open ?? 0) > 0.5;
        const relevant = trace.active ? trace.nodes.has(v.id) : v.type === "auto-transfer";
        if (!relevant && selectedId !== v.id && hoveredId !== v.id) continue;
        labels.push(
          <SceneLabel key={v.id} id={`lbl-${v.id}`} ownerId={v.id} anchor={[v.position[0], v.position[1] + 0.62, v.position[2]]} priority={selectedId === v.id ? 100 : 12} emphasis={emphasisFor(v.id, v.floor)} align="bottom" maxDistance={60} ariaLabel={`${v.code} ${v.name}: ${open ? "open" : "closed"}`}>
            <div className="scene-chip rounded-md px-1.5 py-0.5 text-[10.5px] leading-none font-medium whitespace-nowrap text-white/90">
              {v.code} <span className={open ? "text-emerald-300" : "text-slate-300"}>{open ? "open" : "closed"}</span>
            </div>
          </SceneLabel>,
        );
      }
    }
    for (const j of JUNCTIONS) {
      if (!layers.pipes) break;
      if (selectedId !== j.id && hoveredId !== j.id) continue;
      labels.push(
        <SceneLabel key={j.id} id={`lbl-${j.id}`} ownerId={j.id} anchor={[j.position[0], j.position[1] + 0.55, j.position[2]]} priority={100} emphasis={1} align="bottom" ariaLabel={j.name}>
          <div className="scene-chip rounded-md px-1.5 py-0.5 text-[10.5px] leading-none font-medium whitespace-nowrap text-white/90">{j.code}</div>
        </SceneLabel>,
      );
    }
    if (layers.sensors) {
      for (const s of SENSORS) {
        if (selectedId !== s.id && hoveredId !== s.id) continue;
        const val = sensorValue(sim, s.id);
        labels.push(
          <SceneLabel key={s.id} id={`lbl-${s.id}`} ownerId={s.id} anchor={[s.position[0], s.position[1] + 0.35, s.position[2]]} priority={100} emphasis={1} align="bottom" ariaLabel={`${s.name}: ${val.display}`}>
            <div className="scene-chip rounded-md px-1.5 py-0.5 text-[10.5px] leading-none font-medium whitespace-nowrap text-white/90">
              {s.code} <span className="tabular text-sky-200">{val.display}</span>
            </div>
          </SceneLabel>,
        );
      }
    }
  }

  return (
    <div aria-label="3D facility labels" role="group" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="pointer-events-auto">{labels}</div>
    </div>
  );
}

export const SceneLabels = memo(SceneLabelsImpl);
