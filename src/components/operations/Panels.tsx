"use client";

import { ArrowRight, CircleCheck, Droplets, Gauge, Layers, Network, ShieldAlert, Thermometer, TriangleAlert, Waves, Wrench, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { FILTERS, FLOW_THRESHOLDS, PUMPS, TANKS } from "@/lib/data/facility";
import { cls, duration } from "@/lib/format";
import { activeIncidents } from "@/lib/simulation/engine";
import { facilityKpis } from "@/lib/simulation/kpi";
import { filterReading, pumpReading } from "@/lib/simulation/readings";
import { pumpStatusInfo, tankStatusInfo, TONE_HEX } from "@/lib/status";
import { ASSET_BY_ID, NETWORK_COUNTS, TANK_BY_ID } from "@/lib/topology/graph";
import { useAppStore } from "@/store/useAppStore";
import { LayerToggles } from "@/components/viewer/ViewerOverlays";
import { Meter, SimTag, Sparkline, StatusBadge } from "@/components/ui/primitives";
import { HabitatsPanel } from "./HabitatsPanel";
import { ScenarioCard } from "./ScenarioCard";

export function PanelCard({ title, icon: Icon, action, children, className }: { title: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cls("rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>
      <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
        <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
          {Icon && <Icon aria-hidden className="size-4 text-brand" />}
          {title}
        </h3>
        {action}
      </header>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

function Kpi({ icon: Icon, value, label, sub, tint }: { icon: LucideIcon; value: string; label: string; sub?: string; tint: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg" style={{ background: `${tint}1a`, color: tint }}>
          <Icon aria-hidden className="size-4" strokeWidth={2} />
        </span>
        <span className="text-[11.5px] leading-tight text-muted">{label}</span>
      </div>
      <div className="tabular mt-1.5 text-[19px] leading-none font-semibold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-1 text-[10.5px] text-subtle">{sub}</div>}
    </div>
  );
}

function circulationTrend(history: { flows: number[] }[]) {
  return history.slice(-90).map((h) => h.flows.reduce((a, b) => a + b, 0) / h.flows.length);
}

export function FacilityStatusPanel() {
  const sim = useAppStore((s) => s.sim);
  const setMode = useAppStore((s) => s.setMode);
  const k = facilityKpis(sim);
  const active = activeIncidents(sim);
  const issue = k.affectedTankIds.length > 0 || active.length > 0;
  const outOfRange = TANKS.filter((t) => {
    const tk = sim.tanks[t.id];
    const h = t.habitat;
    return tk.temp < h.tempRange[0] || tk.temp > h.tempRange[1] || tk.ph < h.phRange[0] || tk.ph > h.phRange[1] || tk.dissolvedO2 < h.doMin;
  });
  const inc = active[0];
  const trend = circulationTrend(sim.history);

  return (
    <div className="space-y-3">
      <section
        aria-labelledby="fs-title"
        className={cls(
          "overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
          issue ? "border-red-200 bg-gradient-to-br from-red-50 via-white to-white" : "border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-white",
        )}
      >
        <header className="flex items-center justify-between px-4 pt-3.5">
          <h3 id="fs-title" className="text-[13.5px] font-semibold text-ink">
            Facility status
          </h3>
          <SimTag />
        </header>
        <div className="flex items-center gap-3 px-4 pt-2">
          <span className={cls("grid size-11 place-items-center rounded-2xl text-white shadow-sm", issue ? "pulse-crit bg-crit" : "bg-ok")}>
            {issue ? <TriangleAlert aria-hidden className="size-5" /> : <CircleCheck aria-hidden className="size-5" />}
          </span>
          <div className="min-w-0">
            <div className={cls("text-[20px] leading-tight font-semibold tracking-tight", issue ? "text-crit" : "text-ok")}>{issue ? "Issue detected" : "All systems normal"}</div>
            <p className="text-[12.5px] text-muted">
              {k.affectedTankIds.length} {k.affectedTankIds.length === 1 ? "tank" : "tanks"} affected · {outOfRange.length === 0 ? "water quality within limits" : `${outOfRange.length} outside habitat limits`}
            </p>
          </div>
        </div>
        <div className="px-4 pt-2">
          <Sparkline values={trend.length > 1 ? trend : [100, 100]} min={0} max={100} height={34} color={issue ? "#d1242f" : "#16a34a"} label="Facility circulation trend" />
        </div>
        <div className="grid grid-cols-2 gap-2 px-4 pt-1 pb-4">
          <Kpi icon={Waves} value={`${k.aggregateFlowDisplay}%`} label="Circulation" sub="equal-weighted mean" tint={k.aggregateFlowDisplay >= 90 ? "#16a34a" : "#d1242f"} />
          <Kpi icon={Thermometer} value={`${k.avgTemp.toFixed(1)}°C`} label="Avg. temperature" tint="#e39a12" />
          <Kpi icon={Droplets} value={k.meanPh.toFixed(2)} label="Mean pH" sub="indicative" tint="#0ea5c6" />
          <Kpi icon={Gauge} value={`${k.availability.toFixed(1)}%`} label="Availability" sub="since 10:00" tint="#1d6fe0" />
        </div>
        {inc && (
          <button
            onClick={() => setMode("operations")}
            className="flex w-full items-center gap-3 border-t border-red-200 bg-red-50/70 px-4 py-3 text-left transition-colors hover:bg-red-100/70"
          >
            <ShieldAlert aria-hidden className="size-5 shrink-0 text-crit" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink">{inc.title}</span>
              <span className="block text-[12px] text-muted">
                {inc.affectedTankIds.map((id) => TANK_BY_ID[id].name).join(", ") || "Impact developing"} · open {duration(sim.t - inc.openedAt)}
              </span>
            </span>
            <span className="flex items-center gap-1 text-[12px] font-semibold text-brand">
              Operations <ArrowRight aria-hidden className="size-3.5" />
            </span>
          </button>
        )}
      </section>
      <ScenarioCard />
      <HabitatsPanel />
    </div>
  );
}

function NetworkHealth() {
  const sim = useAppStore((s) => s.sim);
  const select = useAppStore((s) => s.select);
  const k = facilityKpis(sim);
  return (
    <PanelCard title="Network health" icon={Network} action={<SimTag />}>
      <div className="grid grid-cols-2 gap-2">
        <Kpi icon={Waves} value={`${k.aggregateFlowDisplay}%`} label="Aggregate circulation" tint={k.aggregateFlowDisplay >= 90 ? "#16a34a" : "#d1242f"} />
        <Kpi icon={TriangleAlert} value={`${k.shortfallDisplay}%`} label="Circulation shortfall" tint={k.shortfallDisplay > 0 ? "#e39a12" : "#64748b"} />
        <Kpi icon={Gauge} value={String(k.reducedCount)} label="Tanks with reduced flow" tint="#e39a12" />
        <Kpi icon={Gauge} value={String(k.offlineCount)} label="Tanks with no circulation" tint="#d1242f" />
      </div>
      <ul className="mt-3 space-y-2">
        {TANKS.map((t) => {
          const tk = sim.tanks[t.id];
          const info = tankStatusInfo(tk.status);
          return (
            <li key={t.id}>
              <button onClick={() => select(t.id)} className="block w-full rounded-md text-left hover:bg-slate-50">
                <div className="mb-1 flex items-center justify-between text-[12.5px]">
                  <span className="font-medium text-ink">{t.name}</span>
                  <span className="tabular font-semibold" style={{ color: info.tone === "ok" ? undefined : TONE_HEX[info.tone] }}>
                    {Math.round(tk.flowPct)}%
                  </span>
                </div>
                <Meter value={tk.flowPct} tone={info.tone} label={`${t.name} circulation`} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] leading-snug text-subtle">
        {NETWORK_COUNTS.tanks} tanks · {NETWORK_COUNTS.pumps} pumps · {NETWORK_COUNTS.filters} filters · {NETWORK_COUNTS.valves} valves · {NETWORK_COUNTS.sensors} sensors · {NETWORK_COUNTS.pipes} pipe runs. {k.activeLoops}/{k.totalLoops} loops circulating. Shortfall is missing circulation, not a share of faulty equipment.
      </p>
    </PanelCard>
  );
}

function EquipmentDuty() {
  const sim = useAppStore((s) => s.sim);
  const select = useAppStore((s) => s.select);
  return (
    <PanelCard title="Plant equipment" icon={Wrench}>
      <ul className="divide-y divide-line">
        {PUMPS.map((p) => {
          const r = pumpReading(sim, p.id);
          return (
            <li key={p.id}>
              <button onClick={() => select(p.id)} className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-slate-50">
                <span>
                  <span className="block text-[13px] font-medium text-ink">Pump {p.code}</span>
                  <span className="block text-[11.5px] text-muted">
                    {p.role} · rated {p.ratedFlow} m³/h
                  </span>
                </span>
                <span className="flex flex-col items-end gap-0.5">
                  <StatusBadge size="sm" info={pumpStatusInfo(sim.pumps[p.id])} />
                  <span className="tabular text-[11.5px] text-muted">{Math.round(r.delivered)} m³/h</span>
                </span>
              </button>
            </li>
          );
        })}
        {FILTERS.map((f) => {
          const fr = filterReading(sim, f.id);
          const blocked = fr.clogPct > 2;
          return (
            <li key={f.id}>
              <button onClick={() => select(f.id)} className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-slate-50">
                <span>
                  <span className="block text-[13px] font-medium text-ink">{f.name}</span>
                  <span className="block text-[11.5px] text-muted">{Math.round(fr.flow)} m³/h throughput</span>
                </span>
                <span className="flex flex-col items-end gap-0.5">
                  <StatusBadge
                    size="sm"
                    info={fr.backwashing ? { tone: "info", label: "Backwashing", icon: "spinner" } : blocked ? { tone: "crit", label: `Blocked ${Math.round(fr.clogPct)}%`, icon: "alert" } : { tone: "ok", label: "In service", icon: "check" }}
                  />
                  <span className="tabular text-[11.5px] text-muted">ΔP {fr.dpKpa.toFixed(0)} kPa</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </PanelCard>
  );
}

export function IncidentSummaryPanel() {
  const sim = useAppStore((s) => s.sim);
  const tasks = useAppStore((s) => s.tasks);
  const a = useAppStore.getState();
  const inc = activeIncidents(sim)[0];
  if (!inc) return null;
  const root = ASSET_BY_ID[inc.rootAssetId];
  const itasks = tasks.filter((t) => t.incidentId === inc.id).sort((x, y) => x.priority - y.priority);
  const next = itasks.find((t) => t.status !== "done");
  const backup = inc.backupPumpId ? sim.pumps[inc.backupPumpId] : undefined;
  return (
    <section className="overflow-hidden rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 via-white to-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="pulse-crit grid size-10 shrink-0 place-items-center rounded-2xl bg-crit text-white">
          <TriangleAlert aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11.5px] font-semibold text-crit uppercase">
            {inc.id} · {inc.status === "recovering" ? "recovering" : "active"}
          </div>
          <div className="text-[15.5px] leading-tight font-semibold text-ink">{inc.title}</div>
          <p className="mt-0.5 text-[12px] text-muted">
            Open {duration(sim.t - inc.openedAt)} · {inc.diagnosis.label} ({inc.diagnosis.confidence})
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5 px-4">
        <li>
          <button onClick={() => a.select(root.id)} className="flex w-full items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-left hover:bg-slate-50">
            <span className="text-[13px] font-medium">Root: {root.name}</span>
            <span className="text-[11.5px] font-semibold text-crit">fault</span>
          </button>
        </li>
        {inc.affectedTankIds.map((id) => (
          <li key={id}>
            <button onClick={() => a.select(id)} className="flex w-full items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-left hover:bg-slate-50">
              <span className="text-[13px] font-medium">
                {TANK_BY_ID[id].name} <span className="text-muted">· {TANK_BY_ID[id].habitat.name}</span>
              </span>
              <span className="tabular text-[13px] font-semibold" style={{ color: TONE_HEX[tankStatusInfo(sim.tanks[id].status).tone] }}>
                {Math.round(sim.tanks[id].flowPct)}%
              </span>
            </button>
          </li>
        ))}
        {backup && inc.backupPumpId && (
          <li>
            <button onClick={() => a.select(inc.backupPumpId!)} className="flex w-full items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-left hover:bg-slate-50">
              <span className="text-[13px] font-medium">Backup: Pump {ASSET_BY_ID[inc.backupPumpId].code}</span>
              <StatusBadge size="sm" info={pumpStatusInfo(backup)} />
            </button>
          </li>
        )}
      </ul>
      {next && (
        <div className="mx-4 mt-3 rounded-xl bg-brand-50 px-3 py-2.5">
          <div className="text-[11px] font-semibold text-brand-600 uppercase">Next action</div>
          <div className="text-[13px] font-medium text-ink">{next.title}</div>
        </div>
      )}
      <div className="flex gap-2 px-4 pt-3 pb-4">
        <button onClick={() => a.setSection("incidents")} className="inline-flex h-8 items-center rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white hover:bg-brand-600">
          Open incident
        </button>
        <button onClick={() => a.setSection("tasks")} className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-[12.5px] font-medium hover:bg-slate-50">
          Tasks ({itasks.filter((t) => t.status !== "done").length} open)
        </button>
      </div>
    </section>
  );
}

export function OperationsPanel() {
  const hasIncident = useAppStore((s) => activeIncidents(s.sim).length > 0);
  return (
    <div className="space-y-3">
      {hasIncident && <IncidentSummaryPanel />}
      <ScenarioCard />
      <NetworkHealth />
      <EquipmentDuty />
      <PanelCard title="Layers" icon={Layers}>
        <LayerToggles />
      </PanelCard>
      {!hasIncident && <p className="px-1 text-[11.5px] text-subtle">No active incident. Pick a scenario above to see a failure spread through the network.</p>}
      <span className="sr-only">Flow thresholds: healthy at or above {FLOW_THRESHOLDS.healthy}%.</span>
    </div>
  );
}

/** Backwards-compatible names used elsewhere. */
export const InfrastructurePanel = OperationsPanel;
export const IncidentModePanel = OperationsPanel;
