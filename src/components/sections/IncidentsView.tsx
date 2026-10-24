"use client";

import { Box, CheckCircle2, FileText, MessageSquarePlus, ShieldAlert, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { FLOW_THRESHOLDS, TECHNICIANS } from "@/lib/data/facility";
import { cls, duration, hm } from "@/lib/format";
import type { IncidentRuntime, SimState } from "@/lib/simulation/engine";
import { pumpStatusInfo, tankStatusInfo } from "@/lib/status";
import { PUMP_BY_ID, TANK_BY_ID } from "@/lib/topology/graph";
import { techName } from "@/lib/workflow/handover";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/store/useAppStore";
import { TaskCard } from "@/components/operations/TaskCard";
import { Button, EmptyState, SimTag, StatusBadge } from "@/components/ui/primitives";

export function severityOf(sim: SimState, inc: IncidentRuntime): { label: string; tone: "crit" | "warn" | "ok"; rationale: string } {
  if (inc.status === "resolved") return { label: "Resolved", tone: "ok", rationale: "Root asset running and all affected tanks back at design circulation." };
  const flows = inc.affectedTankIds.map((id) => sim.tanks[id].flowPct);
  const min = flows.length ? Math.min(...flows) : 100;
  if (min < FLOW_THRESHOLDS.emergencyMinimum)
    return { label: "P1 · Critical", tone: "crit", rationale: `At least one habitat is below the ${FLOW_THRESHOLDS.emergencyMinimum}% emergency circulation threshold.` };
  if (min < FLOW_THRESHOLDS.healthy)
    return {
      label: "P2 · High",
      tone: "warn",
      rationale: `${flows.length} habitat(s) below ${FLOW_THRESHOLDS.healthy}% of design circulation; backup holds every affected tank above the ${FLOW_THRESHOLDS.emergencyMinimum}% emergency threshold. Primary pump out of service.`,
    };
  return { label: "P3 · Monitoring", tone: "ok", rationale: "Circulation restored; root cause still open." };
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
  const root = PUMP_BY_ID[inc.rootAssetId];

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <header className="border-b border-line px-6 pt-5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-muted">
              {inc.id} <SimTag />
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{inc.title}</h2>
            <p className="mt-1 text-[13px] text-muted">
              Opened {hm(inc.openedAt)} · {inc.status === "resolved" ? `resolved ${hm(inc.resolvedAt!)} after ${duration(inc.resolvedAt! - inc.openedAt)}` : `open ${duration(sim.t - inc.openedAt)}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              icon={Box}
              onClick={() => {
                a.setMode("incident");
                a.select(inc.rootAssetId);
              }}
            >
              View in 3D
            </Button>
            <Button icon={FileText} onClick={() => a.openDialog({ handover: true })}>
              Prepare handover
            </Button>
            {inc.status !== "resolved" && !meta?.acknowledgedAt && (
              <Button variant="primary" icon={CheckCircle2} onClick={() => a.acknowledgeIncident(inc.id)}>
                Acknowledge
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className={cls("rounded-xl border p-3", sev.tone === "crit" ? "border-red-200 bg-crit-bg/60" : sev.tone === "warn" ? "border-amber-200 bg-warn-bg/60" : "border-line bg-ok-bg/50")}>
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <ShieldAlert aria-hidden className="size-4" /> Severity {sev.label}
            </div>
            <p className="mt-1 text-[12px] leading-snug text-ink-2">{sev.rationale}</p>
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="text-[12px] font-semibold text-muted uppercase">Source equipment</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <button onClick={() => (a.setSection("facility"), a.setMode("incident"), a.select(root.id))} className="text-[13.5px] font-semibold text-brand hover:underline">
                {root.name}
              </button>
              <StatusBadge size="sm" info={pumpStatusInfo(sim.pumps[root.id])} />
            </div>
            <p className="mt-1 text-[12px] text-muted">
              {inc.diagnosis.label} · {inc.diagnosis.confidence}
            </p>
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="text-[12px] font-semibold text-muted uppercase">Ownership</div>
            <label className="mt-1 block text-[12px] text-muted">
              Responsible technician
              <select value={meta?.ownerId ?? ""} onChange={(e) => a.setIncidentOwner(inc.id, e.target.value || undefined)} className="mt-1 block h-8 w-full rounded-lg border border-line bg-white px-2 text-[13px] text-ink">
                <option value="">Unassigned</option>
                {TECHNICIANS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1 text-[11.5px] text-muted">{meta?.acknowledgedAt ? `Acknowledged ${hm(meta.acknowledgedAt)} by ${meta.acknowledgedBy}` : "Not yet acknowledged"}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 px-6 py-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section aria-labelledby="impact">
            <h3 id="impact" className="mb-2 text-[14px] font-semibold">
              Current operational impact
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {inc.affectedTankIds.map((id) => {
                const t = TANK_BY_ID[id];
                const tk = sim.tanks[id];
                return (
                  <button key={id} onClick={() => (a.setSection("facility"), a.select(id))} className="flex items-center justify-between rounded-xl border border-line p-3 text-left hover:bg-slate-50">
                    <span>
                      <span className="block text-[13.5px] font-semibold">{t.name}</span>
                      <span className="block text-[12px] text-muted">{t.habitat.name}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="tabular text-lg font-semibold">{Math.round(tk.flowPct)}%</span>
                      <StatusBadge size="sm" info={tankStatusInfo(tk.status)} />
                    </span>
                  </button>
                );
              })}
              {inc.backupPumpId && (
                <div className="flex items-center justify-between rounded-xl border border-line p-3">
                  <span>
                    <span className="block text-[13.5px] font-semibold">Backup {PUMP_BY_ID[inc.backupPumpId].code}</span>
                    <span className="block text-[12px] text-muted">Temporary, partial support</span>
                  </span>
                  <StatusBadge size="sm" info={pumpStatusInfo(sim.pumps[inc.backupPumpId])} />
                </div>
              )}
            </div>
          </section>

          <section aria-labelledby="tasks">
            <h3 id="tasks" className="mb-2 flex items-center justify-between text-[14px] font-semibold">
              Linked maintenance tasks
              <span className="text-[12px] font-medium text-muted">
                {tasks.filter((t) => t.status === "done").length}/{tasks.length} complete
              </span>
            </h3>
            <div className="space-y-2">
              {tasks.map((t, i) => (
                <TaskCard key={t.id} task={t} defaultOpen={i === 0 && t.status !== "done"} />
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section aria-labelledby="timeline">
            <h3 id="timeline" className="mb-2 text-[14px] font-semibold">
              Timeline <span className="text-[12px] font-medium text-muted">simulated time</span>
            </h3>
            <ol className="relative ml-1.5 space-y-3 border-l border-line pl-4">
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
                  {e.detail && <p className="text-[12px] leading-snug text-muted">{e.detail}</p>}
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="notes">
            <h3 id="notes" className="mb-2 text-[14px] font-semibold">
              Incident notes
            </h3>
            <ul className="space-y-1.5">
              {(meta?.notes ?? []).map((n) => (
                <li key={n.id} className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px]">
                  <span className="tabular font-semibold">{hm(n.at)}</span> <span className="text-muted">{n.by}</span>
                  <div>{n.text}</div>
                </li>
              ))}
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
              <input id="inc-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an incident note…" className="h-9 min-w-0 flex-1 rounded-lg border border-line px-3 text-[13px]" />
              <Button variant="subtle" icon={MessageSquarePlus} type="submit" disabled={!note.trim()}>
                Add
              </Button>
            </form>
          </section>

          {workOrders.length > 0 && (
            <section aria-labelledby="wos">
              <h3 id="wos" className="mb-2 text-[14px] font-semibold">
                Work orders <span className="text-[12px] font-medium text-muted">simulated</span>
              </h3>
              <ul className="space-y-1.5">
                {workOrders.map((w) => (
                  <li key={w.id}>
                    <button onClick={() => a.openDialog({ workOrderId: w.id })} className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left text-[13px] hover:bg-slate-50">
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
  if (list.length === 0)
    return (
      <div className="grid h-full place-items-center">
        <EmptyState icon={TriangleAlert} title="No incidents in this scenario">
          <p>Incidents are created by the simulation when equipment fails, and group every related alarm under one root cause.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="danger" onClick={() => (a.setSection("facility"), a.simulateFailure("PMP-C2"))}>
              Simulate C-2 failure
            </Button>
            <Button onClick={() => a.loadPreset("incident")}>Load reference incident</Button>
          </div>
        </EmptyState>
      </div>
    );
  return (
    <div className="flex h-full">
      <nav aria-label="Incidents" className="scroll-thin w-72 shrink-0 overflow-y-auto border-r border-line">
        <h1 className="px-5 pt-5 pb-3 text-xl font-semibold tracking-tight">Incidents</h1>
        <ul className="space-y-1 px-3 pb-4">
          {list.map((i) => {
            const sev = severityOf(sim, i);
            const on = current?.id === i.id;
            return (
              <li key={i.id}>
                <button onClick={() => setPicked(i.id)} aria-current={on ? "true" : undefined} className={cls("w-full rounded-xl px-3 py-2.5 text-left", on ? "bg-brand-50" : "hover:bg-slate-50")}>
                  <div className="flex items-center justify-between text-[12px] font-semibold text-muted">
                    {i.id}
                    <span className={cls("rounded-full px-2 py-px text-[10.5px]", sev.tone === "crit" ? "bg-crit-bg text-crit" : sev.tone === "warn" ? "bg-warn-bg text-warn" : "bg-ok-bg text-ok")}>{sev.label}</span>
                  </div>
                  <div className="mt-0.5 text-[13px] font-medium text-ink">{i.title}</div>
                  <div className="text-[11.5px] text-muted">
                    {hm(i.openedAt)} · {i.affectedTankIds.length} tanks
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
