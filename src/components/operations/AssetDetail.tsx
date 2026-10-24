"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Crosshair,
  Info,
  LayoutGrid,
  ListChecks,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { EDGES, FLOW_THRESHOLDS, LOOPS, PUMPS, TANKS } from "@/lib/data/facility";
import { cls, duration, hm } from "@/lib/format";
import { activeIncidents, type IncidentRuntime, type SimState } from "@/lib/simulation/engine";
import { filterReading, pumpReading, sensorValue, sensorsFor, tankReading } from "@/lib/simulation/readings";
import { FLOW_VISUAL_HEX, FLOW_VISUAL_LABEL, TONE_HEX, edgeVisual, pumpStatusInfo, tankStatusInfo, type StatusInfo } from "@/lib/status";
import {
  ASSET_BY_ID,
  EDGE_BY_ID,
  FILTER_BY_ID,
  JUNCTION_BY_ID,
  PUMP_BY_ID,
  SENSOR_BY_ID,
  TANK_BY_ID,
  VALVE_BY_ID,
  assetLabel,
  assetShort,
  downstreamTanks,
  neighbours,
  tankInfrastructure,
  upstreamEdges,
} from "@/lib/topology/graph";
import { techName } from "@/lib/workflow/handover";
import { useShallow } from "zustand/react/shallow";
import { useAppStore, type PanelTab } from "@/store/useAppStore";
import { createInitialState } from "@/lib/simulation/engine";
import { AssetPreview } from "./AssetPreview";
import { Avatar, TaskStatusPill } from "./TaskCard";
import { Button, KeyValue, SimTag, Sparkline, StatusBadge, Tabs } from "@/components/ui/primitives";

const BASELINE = createInitialState().edgeFlow;

const TABS: { id: PanelTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "live", label: "Live Data" },
  { id: "connections", label: "Connections" },
  { id: "history", label: "History" },
];

function statusFor(sim: SimState, id: string): { info: StatusInfo; subtitle: string } {
  const a = ASSET_BY_ID[id];
  if (a.kind === "tank") {
    const t = TANK_BY_ID[id];
    return { info: tankStatusInfo(sim.tanks[id].status), subtitle: t.habitat.name };
  }
  if (a.kind === "pump") {
    const p = sim.pumps[id];
    const info = pumpStatusInfo(p);
    const inc = sim.incidents.find((i) => i.rootAssetId === id && i.status !== "resolved");
    return { info: p.mode === "fault" ? { ...info, label: "Fault" } : info, subtitle: inc ? inc.diagnosis.label.replace(" (overcurrent)", "") : PUMP_BY_ID[id].role === "backup" ? "Standby duty pump" : "Primary duty pump" };
  }
  if (a.kind === "valve") {
    const open = (sim.valves[id]?.open ?? 0) > 0.5;
    return { info: { tone: open ? "ok" : "off", label: open ? "Open" : "Closed", icon: open ? "check" : "pause" }, subtitle: VALVE_BY_ID[id].name };
  }
  if (a.kind === "pipe") {
    const e = EDGE_BY_ID[id];
    const v = edgeVisual(sim, id, e.from, e.to, e.kind, BASELINE[id] ?? 0);
    const tone = v === "interrupted" || v === "upstream" ? "crit" : v === "backup" || v === "limited" ? "backup" : v === "standby" ? "off" : "ok";
    return { info: { tone, label: FLOW_VISUAL_LABEL[v], icon: tone === "crit" ? "alert" : tone === "off" ? "pause" : "check" }, subtitle: `${e.kind} line · DN${e.diameter}` };
  }
  if (a.kind === "filter") {
    const fr = filterReading(sim, id);
    if (fr.backwashing) return { info: { tone: "info", label: "Backwashing", icon: "spinner" }, subtitle: FILTER_BY_ID[id].media };
    if (fr.clogPct > 2) return { info: { tone: "crit", label: "Blocked", icon: "alert" }, subtitle: "Media blockage" };
    const flow = fr.flow;
    return { info: { tone: flow > 1 ? "ok" : "off", label: flow > 1 ? "In service" : "No flow", icon: flow > 1 ? "check" : "pause" }, subtitle: FILTER_BY_ID[id].media };
  }
  if (a.kind === "sensor") {
    const s = SENSOR_BY_ID[id];
    return { info: { tone: "ok", label: "Reporting", icon: "check" }, subtitle: `${s.kind.replace("-", " ")} sensor` };
  }
  const flow = sim.nodeFlow[id] ?? 0;
  return { info: { tone: flow > 1 ? "ok" : "off", label: flow > 1 ? "Carrying flow" : "No flow", icon: flow > 1 ? "check" : "pause" }, subtitle: JUNCTION_BY_ID[id]?.name ?? "" };
}

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-line py-3 last:border-0">
      <Icon aria-hidden className="mt-0.5 size-[18px] shrink-0 text-ink-2" strokeWidth={1.8} />
      <div className="w-[92px] shrink-0 text-[13px] font-semibold text-ink">{label}</div>
      <div className="min-w-0 flex-1 text-[13px]">{children}</div>
    </div>
  );
}

function AssetChip({ id, tone }: { id: string; tone?: "crit" | "warn" | "ok" }) {
  const select = useAppStore((s) => s.select);
  return (
    <button
      onClick={() => select(id)}
      className={cls(
        "rounded-lg px-2.5 py-1 text-[12.5px] font-semibold transition-colors",
        tone === "crit" ? "bg-crit-bg text-crit hover:bg-red-100" : tone === "warn" ? "bg-warn-bg text-warn" : "bg-slate-100 text-ink-2 hover:bg-slate-200",
      )}
    >
      {assetShort(id)}
    </button>
  );
}

function incidentFor(sim: SimState, id: string): IncidentRuntime | undefined {
  return activeIncidents(sim).find((i) => i.rootAssetId === id || i.affectedTankIds.includes(id) || i.backupPumpId === id) ?? undefined;
}

function RecommendedActions({ incidentId }: { incidentId: string }) {
  const tasks = useAppStore(useShallow((s) => s.tasks.filter((t) => t.incidentId === incidentId).sort((a, b) => a.priority - b.priority)));
  const setSection = useAppStore((s) => s.setSection);
  if (!tasks.length) return null;
  const top = tasks.filter((t) => t.status !== "done").slice(0, 3);
  const doneCount = tasks.filter((t) => t.status === "done").length;
  return (
    <section aria-labelledby="ra-title" className="pt-3">
      <h3 id="ra-title" className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
        <ListChecks aria-hidden className="size-[18px]" strokeWidth={1.8} /> Recommended Actions
        <span className="ml-auto text-[11.5px] font-medium text-muted">
          {doneCount}/{tasks.length} done
        </span>
      </h3>
      <ol className="mt-2 space-y-1.5">
        {top.map((t, i) => (
          <li key={t.id}>
            <button onClick={() => setSection("tasks")} className="flex w-full items-start gap-3 rounded-lg px-1.5 py-1.5 text-left hover:bg-slate-50">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-bold text-brand">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-snug text-ink">{t.title}</span>
                <span className="mt-0.5 flex items-center gap-2">
                  <TaskStatusPill status={t.status} />
                  <span className="text-[11px] text-muted">{techName(t.assigneeId)}</span>
                </span>
              </span>
              <Avatar techId={t.assigneeId} />
            </button>
          </li>
        ))}
        {top.length === 0 && <li className="px-1.5 text-[12.5px] text-ok">All recommended actions completed.</li>}
      </ol>
      <Button size="sm" variant="subtle" className="mt-2 w-full" onClick={() => setSection("tasks")}>
        Open task list
      </Button>
    </section>
  );
}

function BackupCoverage({ sim, inc }: { sim: SimState; inc: IncidentRuntime }) {
  if (!inc.backupPumpId) {
    return (
      <Row icon={ShieldCheck} label="Backup">
        <span className="font-medium text-crit">No configured backup</span>
        <p className="text-[12px] text-muted">Affected tanks depend on emergency procedures.</p>
      </Row>
    );
  }
  const bk = sim.pumps[inc.backupPumpId];
  const code = PUMP_BY_ID[inc.backupPumpId].code;
  const minFlow = inc.affectedTankIds.length ? Math.min(...inc.affectedTankIds.map((id) => sim.tanks[id].flowPct)) : 100;
  const active = bk.covering && bk.mode === "running";
  const meets = minFlow >= FLOW_THRESHOLDS.emergencyMinimum;
  return (
    <Row icon={ShieldCheck} label="Backup Coverage">
      <div className="font-medium text-ink">
        {code} {active ? `online (${Math.round(bk.output * 100)}%)` : bk.mode === "starting" ? "starting" : bk.mode === "standby" ? "standby — not yet started" : pumpStatusInfo(bk).label}
      </div>
      <p className="text-[12px] text-muted">{active ? "Temporary, partial support of the loop" : "Auto-transfer configured after 120 s"}</p>
      {active && (
        <span
          title={`Every affected tank is at or above the ${FLOW_THRESHOLDS.emergencyMinimum}% demonstration emergency threshold. This is not a guarantee of biological safety.`}
          className={cls("mt-1.5 inline-block rounded-lg px-2 py-1 text-[11.5px] font-semibold", meets ? "bg-ok-bg text-ok" : "bg-crit-bg text-crit")}
        >
          {meets ? `Sufficient vs ${FLOW_THRESHOLDS.emergencyMinimum}% demo threshold` : `Below ${FLOW_THRESHOLDS.emergencyMinimum}% demo threshold`}
        </span>
      )}
    </Row>
  );
}

function PumpOverview({ id, sim }: { id: string; sim: SimState }) {
  const p = sim.pumps[id];
  const cfg = PUMP_BY_ID[id];
  const inc = incidentFor(sim, id);
  const tanks = downstreamTanks(id);
  const r = pumpReading(sim, id);
  const isRoot = inc?.rootAssetId === id;
  const info = pumpStatusInfo(p);
  const since = p.faultAt ?? p.modeSince;
  return (
    <div>
      <Row icon={LayoutGrid} label="Status">
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge info={p.mode === "fault" ? { ...info, label: "Stopped" } : info} />
          <span className="text-muted">· {sim.t - since > 0 ? duration(sim.t - since) + " ago" : "now"}</span>
        </span>
        <div className="tabular mt-1 text-[12px] text-muted">
          {Math.round(r.delivered)} m³/h delivered · rated {cfg.ratedFlow} m³/h
        </div>
      </Row>
      <Row icon={Users} label="Affects">
        {isRoot ? (
          <>
            <div className="flex items-center gap-2 font-semibold text-ink">
              <span className="size-2.5 rounded-full bg-crit" aria-hidden /> {inc!.affectedTankIds.length} tanks
            </div>
            <p className="text-[12px] text-muted">Reduced circulation flow</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {inc!.affectedTankIds.map((t) => (
                <AssetChip key={t} id={t} tone="crit" />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="font-medium text-ink">
              {tanks.length} downstream {tanks.length === 1 ? "tank" : "tanks"}
              {cfg.role === "backup" ? " (when active)" : ""}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tanks.map((t) => (
                <AssetChip key={t} id={t} tone={sim.tanks[t].status === "healthy" ? undefined : "crit"} />
              ))}
            </div>
          </>
        )}
      </Row>
      {isRoot && inc && (
        <Row icon={Info} label="Root Cause">
          <span className="font-medium text-ink">{inc.diagnosis.label}</span>{" "}
          <span className={cls("ml-1 rounded px-1.5 py-px text-[10.5px] font-semibold uppercase", inc.diagnosis.confidence === "confirmed" ? "bg-slate-100 text-ink-2" : "bg-warn-bg text-warn")}>{inc.diagnosis.confidence}</span>
          <p className="mt-1 text-[12px] leading-snug text-muted">{inc.diagnosis.evidence}</p>
        </Row>
      )}
      {isRoot && inc && <BackupCoverage sim={sim} inc={inc} />}
      {!isRoot && cfg.role === "backup" && (
        <Row icon={ShieldCheck} label="Duty">
          <span className="font-medium text-ink">Backup for {PUMPS.filter((x) => x.loopId === cfg.loopId && x.role === "primary").map((x) => x.code).join(", ")}</span>
          <p className="text-[12px] text-muted">Runs at {Math.round((cfg.backupOutputFraction ?? 1) * 100)}% of rated output ({Math.round((cfg.backupOutputFraction ?? 1) * cfg.ratedFlow)} m³/h) when covering.</p>
        </Row>
      )}
      {inc && <RecommendedActions incidentId={inc.id} />}
    </div>
  );
}

function FilterOverview({ id, sim }: { id: string; sim: SimState }) {
  const f = FILTER_BY_ID[id];
  const fr = filterReading(sim, id);
  const inc = incidentFor(sim, id);
  const isRoot = inc?.rootAssetId === id;
  const tanks = downstreamTanks(id);
  const blocked = fr.clogPct > 2;
  return (
    <div>
      <Row icon={LayoutGrid} label="Status">
        <StatusBadge info={fr.backwashing ? { tone: "info", label: "Backwashing", icon: "spinner" } : blocked ? { tone: "crit", label: `Bed ${Math.round(fr.clogPct)}% blocked`, icon: "alert" } : { tone: "ok", label: "In service", icon: "check" }} />
        <div className="tabular mt-1 text-[12px] text-muted">
          ΔP {fr.dpKpa.toFixed(1)} kPa · {Math.round(fr.flow)} m³/h · capacity {Math.round(f.capacity * (1 - fr.clogPct / 100))} of {f.capacity} m³/h
        </div>
      </Row>
      <Row icon={Users} label="Affects">
        <div className="font-medium text-ink">
          {(isRoot ? inc!.affectedTankIds : tanks).length} {isRoot ? "tanks with reduced flow" : "downstream tanks"}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(isRoot ? inc!.affectedTankIds : tanks).map((t) => (
            <AssetChip key={t} id={t} tone={sim.tanks[t].status === "healthy" ? undefined : sim.tanks[t].status === "degraded" ? "warn" : "crit"} />
          ))}
        </div>
      </Row>
      {isRoot && inc && (
        <Row icon={Info} label="Root Cause">
          <span className="font-medium text-ink">{inc.diagnosis.label}</span>{" "}
          <span className="ml-1 rounded bg-slate-100 px-1.5 py-px text-[10.5px] font-semibold text-ink-2 uppercase">{inc.diagnosis.confidence}</span>
          <p className="mt-1 text-[12px] leading-snug text-muted">{inc.diagnosis.evidence}</p>
        </Row>
      )}
      {isRoot && inc && (
        <Row icon={ShieldCheck} label="Backup">
          <span className="font-medium text-ink">No standby filter on this loop</span>
          <p className="text-[12px] text-muted">Pump C-1 keeps running at the reduced throughput the bed allows. Recovery: backwash F-1.</p>
        </Row>
      )}
      {inc && <RecommendedActions incidentId={inc.id} />}
    </div>
  );
}

function Reading({ label, value, range, out }: { label: string; value: string; range?: string; out?: boolean }) {
  return (
    <div className={cls("rounded-lg border p-2.5", out ? "border-red-200 bg-crit-bg/60" : "border-line")}>
      <div className="text-[11px] text-muted">{label}</div>
      <div className={cls("tabular text-[17px] font-semibold", out ? "text-crit" : "text-ink")}>{value}</div>
      {range && <div className="tabular text-[10.5px] text-subtle">Habitat {range}</div>}
    </div>
  );
}

function TankOverview({ id, sim }: { id: string; sim: SimState }) {
  const t = TANK_BY_ID[id];
  const tk = sim.tanks[id];
  const r = tankReading(sim, id);
  const infra = tankInfrastructure(id);
  const inc = incidentFor(sim, id);
  const tasks = useAppStore(useShallow((s) => s.tasks.filter((x) => x.assetIds.includes(id) && x.status !== "done")));
  const h = t.habitat;
  const backupActive = infra.backupPumps.some((p) => sim.pumps[p].covering && sim.pumps[p].mode === "running");
  return (
    <div className="space-y-3 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <Reading label="Circulation" value={`${Math.round(tk.flowPct)}%`} range={`design ${t.designFlow} m³/h`} out={tk.flowPct < FLOW_THRESHOLDS.healthy} />
        <Reading label="Temperature" value={`${r.temp.toFixed(1)} °C`} range={`${h.tempRange[0]}–${h.tempRange[1]} °C`} out={r.temp < h.tempRange[0] || r.temp > h.tempRange[1]} />
        <Reading label="pH" value={r.ph.toFixed(2)} range={`${h.phRange[0]}–${h.phRange[1]}`} out={r.ph < h.phRange[0] || r.ph > h.phRange[1]} />
        <Reading label="Dissolved O₂" value={`${r.dissolvedO2.toFixed(1)} mg/L`} range={`min ${h.doMin} mg/L`} out={r.dissolvedO2 < h.doMin} />
      </div>
      <div className="rounded-xl border border-line p-3">
        <div className="text-[12px] font-semibold text-muted uppercase">Supply</div>
        <dl className="mt-1">
          <KeyValue
            k="Primary pump"
            v={infra.primaryPumps.map((p) => (
              <AssetChipInline key={p} id={p} label={`${PUMP_BY_ID[p].code} · ${pumpStatusInfo(sim.pumps[p]).label}`} tone={pumpStatusInfo(sim.pumps[p]).tone} />
            ))}
          />
          <KeyValue
            k="Backup pump"
            v={
              infra.backupPumps.length ? (
                infra.backupPumps.map((p) => <AssetChipInline key={p} id={p} label={`${PUMP_BY_ID[p].code} · ${backupActive ? "active" : pumpStatusInfo(sim.pumps[p]).label}`} tone={pumpStatusInfo(sim.pumps[p]).tone} />)
              ) : (
                <span className="text-muted">None configured</span>
              )
            }
          />
          <KeyValue k="Filter" v={infra.filterId ? <AssetChipInline id={infra.filterId} label={FILTER_BY_ID[infra.filterId].code} /> : "—"} />
          <KeyValue k="Measured inlet" v={`${Math.round(r.flow)} m³/h`} />
          <KeyValue k="Volume" v={`${t.volumeM3} m³ · ${t.floor}`} />
        </dl>
      </div>
      <div>
        <div className="mb-1.5 text-[12px] font-semibold text-muted uppercase">Maintenance alerts</div>
        {!inc && tasks.length === 0 && <p className="text-[12.5px] text-ok">No open alerts for this habitat.</p>}
        {inc && (
          <div className="rounded-lg border border-red-200 bg-crit-bg/60 px-3 py-2 text-[12.5px]">
            <span className="font-semibold text-crit">{inc.id}</span> <span className="text-ink-2">— {inc.title}. {tk.lowFlowAlarm ? "Low-flow alarm active." : ""}</span>
          </div>
        )}
        <ul className="mt-1.5 space-y-1">
          {tasks.slice(0, 4).map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className="truncate text-ink">{x.title}</span>
              <TaskStatusPill status={x.status} />
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[12px] leading-relaxed text-muted">{h.description}</p>
    </div>
  );
}

function AssetChipInline({ id, label, tone }: { id: string; label: string; tone?: string }) {
  const select = useAppStore((s) => s.select);
  return (
    <button onClick={() => select(id)} className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-medium text-ink hover:bg-slate-200">
      {tone && <span aria-hidden className="size-2 rounded-full" style={{ background: TONE_HEX[tone as keyof typeof TONE_HEX] ?? "#999" }} />}
      {label}
    </button>
  );
}

function GenericOverview({ id, sim }: { id: string; sim: SimState }) {
  const a = ASSET_BY_ID[id];
  const rows: [string, ReactNode][] = [];
  if (a.kind === "valve") {
    const v = VALVE_BY_ID[id];
    rows.push(["Type", v.type], ["Normally", v.normallyOpen ? "Open" : "Closed"], ["Position", `${Math.round((sim.valves[id]?.open ?? 0) * 100)}% open`], ["Size", `DN${v.diameter}`]);
    const through = neighbours(id).find((n) => n.direction === "out");
    if (through) rows.push(["Flow through", `${Math.round(sim.edgeFlow[through.edge.id] ?? 0)} m³/h`]);
  } else if (a.kind === "filter") {
    const f = FILTER_BY_ID[id];
    const fr = filterReading(sim, id);
    rows.push(["Media", f.media], ["Throughput", `${Math.round(fr.flow)} m³/h`], ["Differential pressure", `${fr.dpKpa.toFixed(1)} kPa`], ["Loop", LOOPS.find((l) => l.id === f.loopId)?.name ?? ""]);
  } else if (a.kind === "pipe") {
    const e = EDGE_BY_ID[id];
    rows.push(["From", assetLabel(e.from)], ["To", assetLabel(e.to)], ["Flow", `${Math.round(sim.edgeFlow[id] ?? 0)} m³/h`], ["Baseline", `${Math.round(BASELINE[id] ?? 0)} m³/h`], ["Bore", `DN${e.diameter}`]);
  } else if (a.kind === "sensor") {
    const sv = sensorValue(sim, id);
    rows.push(["Measures", assetLabel(sv.sensor.assetId)], ["Reading", sv.display], ["Location", sv.sensor.floor]);
  } else if (a.kind === "junction") {
    rows.push(["Kind", JUNCTION_BY_ID[id].kind.replace("-", " ")], ["Throughput", `${Math.round(sim.nodeFlow[id] ?? 0)} m³/h`]);
    const tanks = downstreamTanks(id);
    if (tanks.length) rows.push(["Feeds", tanks.map((t) => TANK_BY_ID[t].code).join(", ")]);
  }
  return (
    <dl className="divide-y divide-line pt-2">
      {rows.map(([k, v]) => (
        <KeyValue key={k} k={k} v={v} />
      ))}
    </dl>
  );
}

function series(sim: SimState, pick: (i: number) => number, n = 120) {
  const h = sim.history.slice(-n);
  return h.map((_, i) => pick(sim.history.length - h.length + i));
}

function LiveData({ id, sim }: { id: string; sim: SimState }) {
  const a = ASSET_BY_ID[id];
  const tiles: { label: string; value: string; spark?: number[]; color?: string; min?: number; max?: number }[] = [];
  if (a.kind === "tank") {
    const r = tankReading(sim, id);
    const idx = TANKS.findIndex((t) => t.id === id);
    tiles.push(
      { label: "Circulation", value: `${r.flowPct.toFixed(1)} %`, spark: series(sim, (i) => sim.history[i].flows[idx]), color: "#1d6fe0", min: 0, max: 100 },
      { label: "Inlet flow (FT)", value: `${r.flow.toFixed(0)} m³/h` },
      { label: "Temperature (TT)", value: `${r.temp.toFixed(2)} °C`, spark: series(sim, (i) => sim.history[i].temps[idx]), color: "#e39a12" },
      { label: "pH (AT)", value: r.ph.toFixed(3) },
      { label: "Dissolved O₂ (DO)", value: `${r.dissolvedO2.toFixed(2)} mg/L`, spark: series(sim, (i) => sim.history[i].dissolvedO2[idx]), color: "#0ea5c6" },
    );
  } else if (a.kind === "pump") {
    const r = pumpReading(sim, id);
    const idx = PUMPS.findIndex((p) => p.id === id);
    tiles.push(
      { label: "Output (of rated)", value: `${(r.output * 100).toFixed(1)} %`, spark: series(sim, (i) => sim.history[i].pumps[idx] * 100), color: "#1d6fe0", min: 0, max: 100 },
      { label: "Delivered flow", value: `${r.delivered.toFixed(0)} m³/h` },
      { label: "Motor current (CT)", value: `${r.currentAmps.toFixed(1)} A · ${r.currentPct.toFixed(0)}% FLA` },
      { label: "Discharge pressure (PT)", value: `${r.pressureBar.toFixed(2)} bar` },
    );
    const peak = sim.pumps[id].peakCurrent;
    if (peak > 0) tiles.push({ label: "Peak current before trip", value: `${peak.toFixed(0)}% FLA` });
  } else {
    for (const s of sensorsFor(id)) tiles.push({ label: s.name, value: sensorValue(sim, s.id).display });
    if (a.kind === "sensor") tiles.push({ label: SENSOR_BY_ID[id].name, value: sensorValue(sim, id).display });
    if (a.kind === "pipe" || a.kind === "valve" || a.kind === "junction" || a.kind === "filter") {
      const flow = a.kind === "pipe" ? sim.edgeFlow[id] ?? 0 : sim.nodeFlow[id] ?? (neighbours(id).find((n) => n.direction === "out") ? sim.edgeFlow[neighbours(id).find((n) => n.direction === "out")!.edge.id] ?? 0 : 0);
      tiles.push({ label: "Flow", value: `${flow.toFixed(1)} m³/h` });
    }
  }
  return (
    <div className="space-y-2 pt-3">
      <p className="flex items-center gap-2 text-[12px] text-muted">
        <Activity aria-hidden className="size-3.5 text-brand" /> Live simulated data · updates each simulated second
      </p>
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-line px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] text-muted">{t.label}</span>
            <span className="tabular text-[14px] font-semibold text-ink">{t.value}</span>
          </div>
          {t.spark && t.spark.length > 1 && <Sparkline values={t.spark} color={t.color} min={t.min} max={t.max} label={`${t.label} trend`} />}
        </div>
      ))}
    </div>
  );
}

function Connections({ id, sim }: { id: string; sim: SimState }) {
  const select = useAppStore((s) => s.select);
  const a = ASSET_BY_ID[id];
  const items = a.kind === "pipe" ? [EDGE_BY_ID[id].from, EDGE_BY_ID[id].to].map((n, i) => ({ other: n, edge: EDGE_BY_ID[id], direction: i === 0 ? "in" : "out" })) : neighbours(id);
  const chain = a.kind === "tank" ? upstreamEdges(id).filter((e) => e.kind === "supply") : [];
  const row = (edgeId: string, other: string, dir: string) => {
    const e = EDGE_BY_ID[edgeId];
    const v = edgeVisual(sim, edgeId, e.from, e.to, e.kind, BASELINE[edgeId] ?? 0);
    return (
      <li key={`${edgeId}-${other}-${dir}`} className="flex items-center gap-2 py-1.5">
        {dir === "in" ? <ArrowDownRight aria-label="upstream" className="size-4 shrink-0 text-muted" /> : <ArrowUpRight aria-label="downstream" className="size-4 shrink-0 text-muted" />}
        <button onClick={() => select(other)} className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-brand hover:underline">
          {assetLabel(other)}
        </button>
        <button onClick={() => select(edgeId)} className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11.5px] text-muted hover:bg-slate-100" title={FLOW_VISUAL_LABEL[v]}>
          <span aria-hidden className="h-1 w-3.5 rounded-full" style={{ background: FLOW_VISUAL_HEX[v] }} />
          <span className="tabular">{Math.round(sim.edgeFlow[edgeId] ?? 0)} m³/h</span>
        </button>
      </li>
    );
  };
  return (
    <div className="space-y-4 pt-3">
      <section>
        <h3 className="mb-1 text-[12px] font-semibold text-muted uppercase">Direct connections</h3>
        <ul className="divide-y divide-line">{items.map((n) => row(n.edge.id, n.other, n.direction))}</ul>
      </section>
      {chain.length > 0 && (
        <section>
          <h3 className="mb-1 text-[12px] font-semibold text-muted uppercase">Supply dependency path</h3>
          <ol className="relative ml-2 border-l border-line-strong pl-4">
            {[...chain]
              .sort((x, y) => EDGES.indexOf(x) - EDGES.indexOf(y))
              .map((e) => {
                const v = edgeVisual(sim, e.id, e.from, e.to, e.kind, BASELINE[e.id] ?? 0);
                return (
                  <li key={e.id} className="relative py-1 text-[12.5px]">
                    <span aria-hidden className="absolute top-2.5 -left-[21px] size-2.5 rounded-full border-2 border-white" style={{ background: FLOW_VISUAL_HEX[v] }} />
                    <button onClick={() => select(e.from)} className="font-medium text-ink hover:underline">
                      {assetShort(e.from)}
                    </button>
                    <span className="text-muted"> → </span>
                    <button onClick={() => select(e.to)} className="font-medium text-ink hover:underline">
                      {assetShort(e.to)}
                    </button>
                    <span className="tabular ml-1.5 text-muted">
                      {e.id} · {Math.round(sim.edgeFlow[e.id] ?? 0)} m³/h
                    </span>
                  </li>
                );
              })}
          </ol>
        </section>
      )}
      {a.kind === "pump" && (
        <section>
          <h3 className="mb-1 text-[12px] font-semibold text-muted uppercase">Downstream dependents</h3>
          <div className="flex flex-wrap gap-1.5">
            {downstreamTanks(id).map((t) => (
              <AssetChip key={t} id={t} tone={sim.tanks[t].status === "healthy" ? undefined : "crit"} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function History({ id, sim }: { id: string; sim: SimState }) {
  const tasks = useAppStore(useShallow((s) => s.tasks.filter((t) => t.assetIds.includes(id) || t.assetIds[0] === id)));
  const events = sim.events.filter((e) => e.assets.includes(id));
  const entries = [
    ...events.map((e) => ({ at: e.t, text: e.title, kind: "event" as const, tone: e.severity })),
    ...tasks.flatMap((t) => t.history.filter((h) => h.by !== "AquaLink").map((h) => ({ at: h.at, text: `${t.id}: ${h.action}`, kind: "task" as const, tone: "info" as const }))),
  ].sort((a, b) => b.at - a.at);
  return (
    <div className="pt-3">
      {entries.length === 0 && <p className="py-6 text-center text-[13px] text-muted">No simulated events or technician actions for this asset yet.</p>}
      <ol className="space-y-2">
        {entries.map((e, i) => (
          <li key={i} className="flex gap-3 text-[13px]">
            <span className="tabular w-11 shrink-0 font-semibold text-ink-2">{hm(e.at)}</span>
            <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: e.tone === "critical" ? "#d1242f" : e.tone === "warning" ? "#e39a12" : e.tone === "ok" ? "#15803d" : "#1d6fe0" }} />
            <span className="text-ink">
              {e.text}
              <span className="ml-1.5 text-[11px] text-subtle">{e.kind === "event" ? "simulation" : "technician"}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AssetDetail({ id }: { id: string }) {
  const sim = useAppStore((s) => s.sim);
  const tab = useAppStore((s) => s.panelTab);
  const setTab = useAppStore((s) => s.setPanelTab);
  const select = useAppStore((s) => s.select);
  const a = ASSET_BY_ID[id];
  if (!a) return null;
  const { info, subtitle } = statusFor(sim, id);
  const inc = incidentFor(sim, id);

  return (
    <div className="glass rounded-2xl">
      <header className="flex items-start justify-between gap-2 px-4 pt-3.5">
        <div className="min-w-0">
          <h2 className="truncate text-[18px] font-semibold tracking-tight text-ink">{a.kind === "pipe" ? `Pipe ${a.code}` : a.name}</h2>
          {inc && (
            <p className="mt-0.5 text-[12px] font-medium text-crit">
              {inc.id} · open {duration(sim.t - inc.openedAt)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button aria-label={`Focus ${a.name} in 3D`} title="Focus in 3D" onClick={() => window.dispatchEvent(new CustomEvent("aqualink:focus", { detail: id }))} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-ink">
            <Crosshair aria-hidden className="size-4" />
          </button>
          <button aria-label="Close details" onClick={() => select(null)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-ink">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      </header>
      <div className="flex gap-3 px-4 pt-3">
        <AssetPreview id={id} className="h-[104px] w-[150px] shrink-0" />
        <div className="min-w-0 pt-1">
          <div className="flex items-center gap-2">
            <span aria-hidden className={cls("size-3.5 rounded-full", info.tone === "crit" && "pulse-crit")} style={{ background: TONE_HEX[info.tone] }} />
            <span className="text-[22px] leading-none font-semibold" style={{ color: TONE_HEX[info.tone] === "#22c55e" ? "#15803d" : TONE_HEX[info.tone] }}>
              {info.label}
            </span>
          </div>
          <div className="mt-2 text-[13px] text-ink-2">{subtitle}</div>
          <div className="tabular mt-0.5 text-[12.5px] text-muted">{a.code === a.id ? a.id : `${a.id}`}</div>
          <div className="mt-1.5">
            <SimTag />
          </div>
        </div>
      </div>
      <div className="mt-3 px-3">
        <Tabs tabs={TABS} value={tab} onChange={setTab} label={`${a.name} details`} />
      </div>
      <div className="px-4 pb-4" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === "overview" && (a.kind === "pump" ? <PumpOverview id={id} sim={sim} /> : a.kind === "tank" ? <TankOverview id={id} sim={sim} /> : a.kind === "filter" ? <FilterOverview id={id} sim={sim} /> : <GenericOverview id={id} sim={sim} />)}
        {tab === "live" && <LiveData id={id} sim={sim} />}
        {tab === "connections" && <Connections id={id} sim={sim} />}
        {tab === "history" && <History id={id} sim={sim} />}
      </div>
    </div>
  );
}
