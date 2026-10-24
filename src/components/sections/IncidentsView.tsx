"use client";

import { Box, CheckCircle2, FileText, Filter, MessageSquarePlus, ShieldCheck, TriangleAlert, Zap } from "lucide-react";
import { useState } from "react";
import { FLOW_THRESHOLDS, TECHNICIANS } from "@/lib/data/facility";
import { cls, duration, hm } from "@/lib/format";
import type { IncidentRuntime, SimState } from "@/lib/simulation/engine";
import { filterReading } from "@/lib/simulation/readings";
import { pumpStatusInfo, tankStatusInfo, type StatusInfo } from "@/lib/status";
import { ASSET_BY_ID, PUMP_BY_ID, TANK_BY_ID } from "@/lib/topology/graph";
import { techName } from "@/lib/workflow/handover";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/store/useAppStore";
import { TaskCard } from "@/components/operations/TaskCard";
import { Button, EmptyState, PageHeader, SimTag, StatusBadge } from "@/components/ui/primitives";

export function severityOf(sim: SimState, inc: IncidentRuntime): { label: string; tone: "crit" | "warn" | "ok"; rationale: string } {
  if (inc.status === "resolved") return { label: "Resolved", tone: "ok", rationale: "Everything is back to normal." };
  const flows = inc.affectedTankIds.map((id) => sim.tanks[id].flowPct);
  const min = flows.length ? Math.min(...flows) : 100;
  if (min < FLOW_THRESHOLDS.emergencyMinimum) return { label: "P1 · Critical", tone: "crit", rationale: `A tank is below ${FLOW_THRESHOLDS.emergencyMinimum}% circulation.` };
  if (min < FLOW_THRESHOLDS.healthy) return { label: "P2 · High", tone: "warn", rationale: `Tanks are running low, but all stay above ${FLOW_THRESHOLDS.emergencyMinimum}%.` };
  return { label: "P3 · Monitoring", tone: "ok", rationale: "Flow is back; the cause is still being fixed." };
}

const TONE_PILL = { crit: "bg-crit-bg text-crit", warn: "bg-warn-bg text-warn", ok: "bg-ok-bg text-ok" } as const;

/** Status of whatever started the incident: a pump or a filter. */
function rootStatus(sim: SimState, id: string): StatusInfo | null {
  if (PUMP_BY_ID[id]) return pumpStatusInfo(sim.pumps[id]);
  if (ASSET_BY_ID[id]?.kind === "filter") {
    const f = filterReading(sim, id);
    if (f.backwashing) return { tone: "backup", label: "Backwashing", icon: "spinner" };
    return f.clogPct > 2 ? { tone: "crit", label: `${Math.round(f.clogPct)}% blocked`, icon: "alert" } : { tone: "ok", label: "In service", icon: "check" };
  }
  return null;
}

function Tile({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "crit" | "warn" | "ok" }) {
  return (
    <div className={cls("rounded-2xl border p-4", tone === "crit" ? "border-red-200/90 bg-red-50/80" : tone === "warn" ? "border-amber-200/90 bg-amber-50/80" : "glass-tile")}>
      <div className="mb-1.5 text-[12px] font-medium text-muted">{title}</div>
      {children}
    </div>
  );
}

function IncidentDetail({ inc }: { inc: IncidentRuntime }) {
  const sim = useAppStore((s) => s.sim);
  const tasks = useAppStore(useShallow((s) => s.tasks.filter((t) => t.incidentId === inc.id).sort((a, b) => a.priority - b.priority)));
  const meta = useAppStore((s) => s.incidentMeta[inc.id]);
  const workOrders = useAppStore(useShallow((s) => s.workOrders.filter((w) => w.incidentId === inc.id)));
  const a = useAppStore.getState();
  const [note, setNote] = useState("");
  const sev = severityOf(sim, inc);
  const events = sim.events.filter((e) => e.incidentId === inc.id);
  const root = ASSET_BY_ID[inc.rootAssetId];
  const rs = rootStatus(sim, inc.rootAssetId);
  const goTo = (id: string) => {
    a.setSection("facility");
    a.setMode("operations");
    a.select(id);
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <header className="border-b border-white/70 px-6 pt-5 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-muted">
              {inc.id}
              <span className={cls("rounded-full px-2 py-px text-[11px] font-semibold", TONE_PILL[sev.tone])}>{sev.label}</span>
              <SimTag />
            </div>
            <h2 className="mt-1 text-[21px] font-semibold tracking-tight text-ink">{inc.title}</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Started {hm(inc.openedAt)} · {inc.status === "resolved" ? `fixed ${hm(inc.resolvedAt!)}, after ${duration(inc.resolvedAt! - inc.openedAt)}` : `open for ${duration(sim.t - inc.openedAt)}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={Box} onClick={() => goTo(inc.rootAssetId)}>
              View in 3D
            </Button>
            <Button icon={FileText} onClick={() => a.openDialog({ handover: true })}>
              Handover
            </Button>
            {inc.status !== "resolved" && !meta?.acknowledgedAt && (
              <Button variant="primary" icon={CheckCircle2} onClick={() => a.acknowledgeIncident(inc.id)}>
                Acknowledge
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Tile title="What went wrong" tone={sev.tone === "ok" ? undefined : sev.tone}>
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => goTo(inc.rootAssetId)} className="truncate text-[14px] font-semibold text-brand hover:underline">
                {root?.name ?? inc.rootAssetId}
              </button>
              {rs && <StatusBadge size="sm" info={rs} />}
            </div>
            <p className="mt-1 text-[12.5px] text-ink-2">{inc.diagnosis.label}</p>
            <p className="mt-1 text-[12px] text-muted">{sev.rationale}</p>
          </Tile>
          <Tile title={`Affected tanks (${inc.affectedTankIds.length})`}>
            <ul className="space-y-1.5">
              {inc.affectedTankIds.map((id) => {
                const tk = sim.tanks[id];
                return (
                  <li key={id}>
                    <button onClick={() => (a.setSection("facility"), a.select(id))} className="flex w-full items-center justify-between gap-2 text-left">
                      <span className="text-[13px] font-medium text-ink">
                        {TANK_BY_ID[id].name} <span className="font-normal text-muted">· {TANK_BY_ID[id].habitat.name}</span>
                      </span>
                      <StatusBadge size="sm" info={{ ...tankStatusInfo(tk.status), label: `${Math.round(tk.flowPct)}%` }} />
                    </button>
                  </li>
                );
              })}
              {inc.affectedTankIds.length === 0 && <li className="text-[12.5px] text-muted">Impact still developing.</li>}
            </ul>
            {inc.backupPumpId && (
              <p className="mt-2 border-t border-white/80 pt-2 text-[12px] text-muted">
                Backup {PUMP_BY_ID[inc.backupPumpId].code}: <span className="font-medium text-ink-2">{pumpStatusInfo(sim.pumps[inc.backupPumpId]).label}</span>
              </p>
            )}
          </Tile>
          <Tile title="Who's on it">
            <label className="block">
              <span className="sr-only">Responsible technician</span>
              <select value={meta?.ownerId ?? ""} onChange={(e) => a.setIncidentOwner(inc.id, e.target.value || undefined)} className="glass-btn block h-9 w-full rounded-xl px-2.5 text-[13px] text-ink">
                <option value="">Unassigned</option>
                {TECHNICIANS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted">
              <ShieldCheck aria-hidden className={cls("size-3.5", meta?.acknowledgedAt ? "text-ok" : "text-subtle")} />
              {meta?.acknowledgedAt ? `Acknowledged ${hm(meta.acknowledgedAt)} by ${meta.acknowledgedBy}` : "Not acknowledged yet"}
            </p>
          </Tile>
        </div>
      </header>

      <div className="grid gap-6 px-6 py-5 xl:grid-cols-[1fr_360px]">
        <section aria-labelledby="tasks">
          <h3 id="tasks" className="mb-2 flex items-center justify-between text-[14px] font-semibold text-ink">
            What to do
            <span className="text-[12px] font-medium text-muted">
              {tasks.filter((t) => t.status === "done").length} of {tasks.length} done
            </span>
          </h3>
          <div className="space-y-2">
            {tasks.map((t, i) => (
              <TaskCard key={t.id} task={t} defaultOpen={i === 0 && t.status !== "done"} />
            ))}
          </div>
        </section>

        <div className="space-y-5">
          <section aria-labelledby="timeline" className="glass-tile rounded-2xl p-4">
            <h3 id="timeline" className="mb-3 text-[14px] font-semibold text-ink">
              Timeline
            </h3>
            <ol className="relative ml-1.5 space-y-3 border-l border-sky-200 pl-4">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span
                    aria-hidden
                    className="absolute top-1 -left-[21.5px] size-2.5 rounded-full ring-4 ring-white"
                    style={{ background: e.severity === "critical" ? "#d1242f" : e.severity === "warning" ? "#e39a12" : e.severity === "ok" ? "#15803d" : "#1d6fe0" }}
                  />
                  <div className="text-[13px]">
                    <span className="tabular font-semibold">{hm(e.t)}</span> <span className="text-ink">{e.title}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="notes" className="glass-tile rounded-2xl p-4">
            <h3 id="notes" className="mb-2 text-[14px] font-semibold text-ink">
              Notes
            </h3>
            <ul className="space-y-1.5">
              {(meta?.notes ?? []).map((n) => (
                <li key={n.id} className="rounded-lg bg-white/70 px-3 py-2 text-[12.5px]">
                  <span className="tabular font-semibold">{hm(n.at)}</span> <span className="text-muted">{n.by}</span>
                  <div>{n.text}</div>
                </li>
              ))}
              {(meta?.notes ?? []).length === 0 && <li className="text-[12.5px] text-subtle">No notes yet.</li>}
            </ul>
            <form
              className="mt-2 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                a.addIncidentNote(inc.id, note);
                setNote("");
              }}
            >
              <label htmlFor="inc-note" className="sr-only">
                Add an incident note
              </label>
              <input id="inc-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className="h-9 min-w-0 flex-1 rounded-xl border border-white bg-white/80 px-3 text-[13px] outline-none focus:ring-2 focus:ring-sky-300" />
              <Button variant="primary" icon={MessageSquarePlus} type="submit" disabled={!note.trim()}>
                Add
              </Button>
            </form>
          </section>

          {workOrders.length > 0 && (
            <section aria-labelledby="wos" className="glass-tile rounded-2xl p-4">
              <h3 id="wos" className="mb-2 text-[14px] font-semibold text-ink">
                Work orders
              </h3>
              <ul className="space-y-1.5">
                {workOrders.map((w) => (
                  <li key={w.id}>
                    <button onClick={() => a.openDialog({ workOrderId: w.id })} className="glass-btn flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px]">
                      <span>
                        <span className="font-semibold">{w.id}</span> <span className="text-muted">· {w.title}</span>
                      </span>
                      <span className="text-[11.5px] text-muted">
                        {w.status} · {techName(w.assigneeId)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export function IncidentsView() {
  const sim = useAppStore((s) => s.sim);
  const a = useAppStore.getState();
  const [picked, setPicked] = useState<string | null>(null);
  const list = [...sim.incidents].reverse();
  const current = list.find((i) => i.id === picked) ?? list[0];
  const run = (id: "pump-c2" | "filter-f1") => {
    a.setSection("facility");
    a.runScenario(id);
  };
  if (list.length === 0)
    return (
      <div className="flex h-full flex-col">
        <PageHeader icon={TriangleAlert} title="Incidents" subtitle="When equipment fails, every alarm it causes is grouped here under one incident." />
        <div className="grid flex-1 place-items-center">
          <EmptyState icon={ShieldCheck} title="All clear">
            <p>No incidents right now. Run a demo failure to see how one is handled from alarm to fix.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button variant="danger" icon={Zap} onClick={() => run("pump-c2")}>
                Run pump failure
              </Button>
              <Button icon={Filter} onClick={() => run("filter-f1")}>
                Run filter blockage
              </Button>
            </div>
          </EmptyState>
        </div>
      </div>
    );
  return (
    <div className="flex h-full">
      <nav aria-label="Incidents" className="scroll-thin w-72 shrink-0 overflow-y-auto border-r border-white/70">
        <h1 className="flex items-center gap-2 px-5 pt-5 pb-3 text-[21px] font-semibold tracking-tight text-ink">
          <TriangleAlert aria-hidden className="size-5 text-crit" /> Incidents
        </h1>
        <ul className="space-y-1.5 px-3 pb-4">
          {list.map((i) => {
            const sev = severityOf(sim, i);
            const on = current?.id === i.id;
            return (
              <li key={i.id}>
                <button onClick={() => setPicked(i.id)} aria-current={on ? "true" : undefined} className={cls("w-full rounded-xl px-3 py-2.5 text-left transition-colors", on ? "glass-tile ring-1 ring-sky-200" : "hover:bg-white/60")}>
                  <div className="flex items-center justify-between text-[12px] font-semibold text-muted">
                    {i.id}
                    <span className={cls("rounded-full px-2 py-px text-[10.5px]", TONE_PILL[sev.tone])}>{sev.label}</span>
                  </div>
                  <div className="mt-0.5 text-[13px] font-medium text-ink">{i.title}</div>
                  <div className="text-[11.5px] text-muted">
                    {hm(i.openedAt)} · {i.affectedTankIds.length} {i.affectedTankIds.length === 1 ? "tank" : "tanks"}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">{current && <IncidentDetail inc={current} />}</div>
    </div>
  );
}
