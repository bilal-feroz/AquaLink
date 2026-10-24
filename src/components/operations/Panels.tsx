"use client";

import { ArrowRight, CircleCheck, Droplets, Gauge, Network, Thermometer, TriangleAlert, Waves, type LucideIcon } from "lucide-react";
import { FLOW_THRESHOLDS, LOOPS, PUMPS, TANKS } from "@/lib/data/facility";
import { cls, duration } from "@/lib/format";
import { activeIncidents } from "@/lib/simulation/engine";
import { facilityKpis } from "@/lib/simulation/kpi";
import { pumpReading } from "@/lib/simulation/readings";
import { pumpStatusInfo, tankStatusInfo, TONE_HEX } from "@/lib/status";
import { NETWORK_COUNTS, PUMP_BY_ID, TANK_BY_ID } from "@/lib/topology/graph";
import type { SpeciesKind } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { LayerToggles } from "@/components/viewer/ViewerOverlays";
import { Button, Card, Dot, Meter, SimTag, StatusBadge } from "@/components/ui/primitives";

function Kpi({ icon: Icon, value, label, sub }: { icon: LucideIcon; value: string; label: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-center">
      <Icon aria-hidden className="size-5 text-brand" strokeWidth={1.8} />
      <div className="tabular text-[17px] font-semibold text-ink">{value}</div>
      <div className="text-[11px] leading-tight text-muted">{label}</div>
      {sub && <div className="text-[10px] leading-tight text-subtle">{sub}</div>}
    </div>
  );
}

export function ActiveIncidentCard() {
  const sim = useAppStore((s) => s.sim);
  const setMode = useAppStore((s) => s.setMode);
  const inc = activeIncidents(sim)[0];
  if (!inc) return null;
  const root = PUMP_BY_ID[inc.rootAssetId];
  const names = inc.affectedTankIds.map((id) => TANK_BY_ID[id].name.replace("Tank ", ""));
  return (
    <div className="rounded-xl border border-red-200 bg-crit-bg/70 p-3.5">
      <div className="flex items-start gap-3">
        <span className="pulse-crit grid size-8 shrink-0 place-items-center rounded-full bg-crit text-white">
          <TriangleAlert aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-ink">
            {root.name} <span className="text-crit">Fault</span>
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">
            Pump stopped. Reduced flow to Tank {names.join(" and ")}. {inc.backupPumpId && sim.pumps[inc.backupPumpId].covering ? `${PUMP_BY_ID[inc.backupPumpId].code} backup active.` : ""}
          </p>
          <button onClick={() => setMode("incident")} className="mt-1.5 flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline">
            View details <ArrowRight aria-hidden className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

const SPECIES_ICON: Partial<Record<SpeciesKind, string>> = { shark: "Sharks", ray: "Rays", seahorse: "Seahorses" };

export function FacilityStatusPanel() {
  const sim = useAppStore((s) => s.sim);
  const captures = useAppStore((s) => s.captures);
  const select = useAppStore((s) => s.select);
  const k = facilityKpis(sim);
  const active = activeIncidents(sim);
  const anyAffected = k.affectedTankIds.length > 0;
  const outOfRange = TANKS.filter((t) => {
    const tk = sim.tanks[t.id];
    const h = t.habitat;
    return tk.temp < h.tempRange[0] || tk.temp > h.tempRange[1] || tk.ph < h.phRange[0] || tk.ph > h.phRange[1] || tk.dissolvedO2 < h.doMin;
  });

  // Species groups summed from the habitat configuration (same counts the scene renders).
  const groups: { key: string; label: string; count: number; tanks: string[]; capture?: string }[] = [];
  const add = (key: string, label: string, count: number, tankId: string) => {
    const g = groups.find((x) => x.key === key);
    if (g) {
      g.count += count;
      if (!g.tanks.includes(tankId)) g.tanks.push(tankId);
    } else groups.push({ key, label, count, tanks: [tankId], capture: captures[tankId] });
  };
  for (const t of TANKS)
    for (const s of t.habitat.species) {
      const label = SPECIES_ICON[s.kind];
      if (label) add(s.kind, label, s.count, t.id);
      else add("fish", "Reef & schooling fish", s.count, t.id);
    }
  const corals = TANKS.filter((t) => ["reef", "anemone", "open-ocean"].includes(t.habitat.scenery));
  groups.push({ key: "coral", label: "Coral habitats", count: corals.length, tanks: corals.map((t) => t.id), capture: captures["TNK-D"] });

  return (
    <div className="space-y-3">
      <Card title="Facility Status" id="fs-title" action={<SimTag />}>
        <div className="flex items-center gap-2.5">
          <Dot tone={anyAffected ? "crit" : "ok"} pulse={anyAffected} className="size-3.5" />
          <span className={cls("text-[19px] font-semibold tracking-tight", anyAffected ? "text-crit" : "text-ok")}>{anyAffected ? "Issue Detected" : "All Systems Normal"}</span>
        </div>
        <p className="mt-1 text-[12.5px] text-muted">
          {k.affectedTankIds.length} {k.affectedTankIds.length === 1 ? "tank" : "tanks"} affected <span className="text-line-strong">|</span>{" "}
          {outOfRange.length === 0 ? "Water quality within habitat limits" : `${outOfRange.length} tank(s) outside habitat limits`}
        </p>
        <div className="mt-3 grid grid-cols-4 divide-x divide-line rounded-xl border border-line">
          <Kpi icon={Thermometer} value={`${k.avgTemp.toFixed(1)}°C`} label="Avg. temperature" />
          <Kpi icon={Droplets} value={k.meanPh.toFixed(2)} label="Mean pH" />
          <Kpi icon={Waves} value={`${k.aggregateFlowDisplay}%`} label="Circulation" />
          <Kpi icon={Gauge} value={`${k.availability.toFixed(1)}%`} label="Availability" sub="since 10:00" />
        </div>
        {active.length > 0 && (
          <div className="mt-3">
            <ActiveIncidentCard />
          </div>
        )}
      </Card>

      <Card title="Marine Life Overview" id="ml-title">
        <ul className="grid grid-cols-2 gap-2">
          {groups.map((g) => (
            <li key={g.key}>
              <button
                onClick={() => select(g.tanks[0])}
                className="group flex w-full items-center gap-2.5 rounded-lg border border-line p-1.5 text-left hover:border-line-strong hover:bg-slate-50"
              >
                <span className="relative size-11 shrink-0 overflow-hidden rounded-md bg-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {g.capture && <img src={g.capture} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold text-ink">{g.label}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {g.key === "coral" ? `${g.count} exhibits` : `${g.count} animals`} · {g.tanks.map((id) => TANK_BY_ID[id].code).join(", ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-subtle">Counts from the habitat configuration rendered in the twin, not animal-tracking data.</p>
      </Card>

      <Card title="Habitat Gallery" id="hg-title" action={<span className="text-[11px] text-muted">Rendered from the twin</span>}>
        <ul className="grid grid-cols-2 gap-2">
          {TANKS.map((t) => {
            const info = tankStatusInfo(sim.tanks[t.id].status);
            return (
              <li key={t.id}>
                <button onClick={() => select(t.id)} className="group relative block aspect-[3/2] w-full overflow-hidden rounded-lg bg-slate-200 text-left" aria-label={`${t.name}, ${t.habitat.name}, ${info.label}`}>
                  {captures[t.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={captures[t.id]} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <span className="block h-full w-full animate-pulse" style={{ background: `linear-gradient(180deg, ${t.habitat.waterTint.shallow}, ${t.habitat.waterTint.deep})` }} />
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1.5 text-white">
                    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold">
                      <Dot tone={info.tone} className="size-2" /> {t.name}
                    </span>
                    <span className="block truncate text-[10.5px] text-white/75">{t.habitat.name}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

export function InfrastructurePanel() {
  const sim = useAppStore((s) => s.sim);
  const select = useAppStore((s) => s.select);
  const k = facilityKpis(sim);
  const counts = [
    { label: "tanks", value: NETWORK_COUNTS.tanks },
    { label: "circulation pumps", value: NETWORK_COUNTS.pumps },
    { label: "sand filters", value: NETWORK_COUNTS.filters },
    { label: "valves", value: NETWORK_COUNTS.valves },
    { label: "sensors", value: NETWORK_COUNTS.sensors },
    { label: "pipe runs", value: NETWORK_COUNTS.pipes },
  ];
  return (
    <div className="space-y-3">
      <Card title="Network Overview" id="no-title" action={<SimTag />}>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {counts.map((c) => (
            <li key={c.label} className="flex items-baseline gap-2 text-[13px]">
              <span className="tabular w-6 text-right font-semibold text-ink">{c.value}</span>
              <span className="text-muted">{c.label}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px]">
          <Network aria-hidden className="size-4 text-brand" />
          <span>
            <span className="font-semibold">
              {k.activeLoops}/{k.totalLoops}
            </span>{" "}
            circulation loops active
          </span>
        </div>
      </Card>

      <Card title="Flow Distribution" id="fd-title">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-line p-2.5">
            <div className={cls("tabular text-[24px] font-semibold", k.aggregateFlowDisplay >= 90 ? "text-ok" : "text-crit")}>{k.aggregateFlowDisplay}%</div>
            <div className="text-[11.5px] text-muted">Aggregate circulation vs design</div>
          </div>
          <div className="rounded-lg border border-line p-2.5">
            <div className={cls("tabular text-[24px] font-semibold", k.shortfallDisplay > 0 ? "text-warn" : "text-ink")}>{k.shortfallDisplay}%</div>
            <div className="text-[11.5px] text-muted">Circulation shortfall</div>
          </div>
          <div className="rounded-lg border border-line p-2.5">
            <div className="tabular text-[20px] font-semibold text-ink">{k.reducedCount}</div>
            <div className="text-[11.5px] text-muted">Tanks with reduced flow</div>
          </div>
          <div className="rounded-lg border border-line p-2.5">
            <div className="tabular text-[20px] font-semibold text-ink">{k.offlineCount}</div>
            <div className="text-[11.5px] text-muted">Tanks with no circulation</div>
          </div>
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
          Equal-weighted mean of tank circulation. The shortfall is missing circulation, not a share of faulty equipment.
        </p>
      </Card>

      <Card title="Pump Duty" id="pd-title">
        <ul className="divide-y divide-line">
          {PUMPS.map((p) => {
            const r = pumpReading(sim, p.id);
            return (
              <li key={p.id}>
                <button onClick={() => select(p.id)} className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-slate-50">
                  <span>
                    <span className="block text-[13px] font-medium text-ink">Pump {p.code}</span>
                    <span className="block text-[11.5px] text-muted">{LOOPS.find((l) => l.id === p.loopId)?.name.split(" — ")[0]} · {p.role}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <StatusBadge size="sm" info={pumpStatusInfo(sim.pumps[p.id])} />
                    <span className="tabular text-[11.5px] text-muted">{Math.round(r.delivered)} m³/h</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Layers" id="ly-title">
        <LayerToggles />
      </Card>
    </div>
  );
}

export function IncidentSummaryPanel() {
  const sim = useAppStore((s) => s.sim);
  const tasks = useAppStore((s) => s.tasks);
  const a = useAppStore.getState();
  const inc = activeIncidents(sim)[0];
  if (!inc) return <IncidentModePanel />;
  const root = PUMP_BY_ID[inc.rootAssetId];
  const itasks = tasks.filter((t) => t.incidentId === inc.id).sort((x, y) => x.priority - y.priority);
  const next = itasks.find((t) => t.status !== "done");
  const backup = inc.backupPumpId ? sim.pumps[inc.backupPumpId] : undefined;
  return (
    <div className="space-y-3">
      <Card title={`${inc.id} · Active incident`} id="is-title" action={<SimTag />}>
        <div className="flex items-start gap-3">
          <span className="pulse-crit grid size-9 shrink-0 place-items-center rounded-full bg-crit text-white">
            <TriangleAlert aria-hidden className="size-4.5" />
          </span>
          <div>
            <div className="text-[15px] font-semibold text-ink">{inc.title}</div>
            <p className="text-[12.5px] text-muted">
              Open {duration(sim.t - inc.openedAt)} · {inc.diagnosis.label} ({inc.diagnosis.confidence})
            </p>
          </div>
        </div>
        <ul className="mt-3 space-y-2">
          <li>
            <button onClick={() => a.select(root.id)} className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left hover:bg-slate-50">
              <span className="text-[13px] font-medium">Failed: {root.name}</span>
              <StatusBadge size="sm" info={pumpStatusInfo(sim.pumps[root.id])} />
            </button>
          </li>
          {inc.affectedTankIds.map((id) => (
            <li key={id}>
              <button onClick={() => a.select(id)} className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left hover:bg-slate-50">
                <span className="text-[13px] font-medium">
                  {TANK_BY_ID[id].name} <span className="text-muted">· {TANK_BY_ID[id].habitat.name}</span>
                </span>
                <span className="tabular text-[13px] font-semibold text-crit">{Math.round(sim.tanks[id].flowPct)}%</span>
              </button>
            </li>
          ))}
          {backup && inc.backupPumpId && (
            <li>
              <button onClick={() => a.select(inc.backupPumpId!)} className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left hover:bg-slate-50">
                <span className="text-[13px] font-medium">Backup: {PUMP_BY_ID[inc.backupPumpId].name}</span>
                <StatusBadge size="sm" info={pumpStatusInfo(backup)} />
              </button>
            </li>
          )}
        </ul>
        {next && (
          <div className="mt-3 rounded-lg bg-brand-50 px-3 py-2.5">
            <div className="text-[11.5px] font-semibold text-brand-600 uppercase">Next action</div>
            <div className="text-[13px] font-medium text-ink">{next.title}</div>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="primary" onClick={() => a.setSection("incidents")}>
            Open incident
          </Button>
          <Button size="sm" onClick={() => a.setSection("tasks")}>
            Tasks ({itasks.filter((t) => t.status !== "done").length} open)
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function IncidentModePanel() {
  const sim = useAppStore((s) => s.sim);
  const a = useAppStore.getState();
  const last = [...sim.incidents].reverse()[0];
  return (
    <div className="space-y-3">
      <Card title="Incident View" id="iv-title" action={<SimTag />}>
        <div className="flex items-center gap-2.5">
          <CircleCheck aria-hidden className="size-6 text-ok" />
          <span className="text-[17px] font-semibold text-ok">No active incident</span>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
          All circulation pumps are in their normal duty and every tank is at or above {FLOW_THRESHOLDS.healthy}% of design flow.
        </p>
        {last && (
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-muted">
            Last incident: <span className="font-medium text-ink">{last.id}</span> — {last.title}, resolved after {duration((last.resolvedAt ?? sim.t) - last.openedAt)}.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="danger" icon={TriangleAlert} onClick={() => a.simulateFailure("PMP-C2")}>
            Simulate C-2 failure
          </Button>
          <Button onClick={() => a.loadPreset("incident")}>Load reference incident</Button>
        </div>
      </Card>
    </div>
  );
}
