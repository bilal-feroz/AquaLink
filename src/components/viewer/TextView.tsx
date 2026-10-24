"use client";

import { FILTERS, PUMPS, TANKS, VALVES } from "@/lib/data/facility";
import { clock, hm } from "@/lib/format";
import { activeIncidents } from "@/lib/simulation/engine";
import { facilityKpis } from "@/lib/simulation/kpi";
import { pumpReading, tankReading } from "@/lib/simulation/readings";
import { pumpStatusInfo, tankStatusInfo } from "@/lib/status";
import { tankInfrastructure } from "@/lib/topology/graph";
import { useAppStore } from "@/store/useAppStore";
import { StatusBadge } from "@/components/ui/primitives";

/**
 * Text alternative to the 3D facility. Every essential fact shown in the scene
 * is available here as tables, usable by keyboard and screen readers.
 */
export function TextView({ reason }: { reason?: string }) {
  const sim = useAppStore((s) => s.sim);
  const select = useAppStore((s) => s.select);
  const selectedId = useAppStore((s) => s.selectedId);
  const k = facilityKpis(sim);
  const inc = activeIncidents(sim)[0];
  const th = "px-3 py-2 text-left text-[12px] font-semibold text-muted";
  const td = "px-3 py-2 text-[13px]";
  return (
    <div className="scroll-thin absolute inset-0 overflow-y-auto bg-canvas p-5 pt-20">
      <div className="mx-auto max-w-5xl space-y-5">
        {reason && <p className="rounded-lg border border-warn/30 bg-warn-bg px-4 py-3 text-[13px] text-warn">{reason}</p>}
        <section aria-labelledby="tv-summary" className="rounded-xl border border-line bg-white p-4">
          <h2 id="tv-summary" className="text-base font-semibold">
            Facility summary at {clock(sim.t)} (simulated)
          </h2>
          <p className="mt-1 text-[13px] text-ink-2">
            {inc
              ? `${inc.id}: ${inc.title}. Affected tanks: ${inc.affectedTankIds.map((id) => TANKS.find((t) => t.id === id)?.name).join(", ")}.`
              : "No active incidents. All tanks at design circulation."}{" "}
            Aggregate circulation {k.aggregateFlowDisplay}% of design (shortfall {k.shortfallDisplay}%). Average temperature {k.avgTemp.toFixed(1)} °C.
          </p>
        </section>
        <section aria-labelledby="tv-tanks" className="overflow-hidden rounded-xl border border-line bg-white">
          <h2 id="tv-tanks" className="px-4 pt-3 text-base font-semibold">
            Tanks
          </h2>
          <table className="mt-2 w-full">
            <thead className="border-y border-line bg-slate-50">
              <tr>
                <th className={th}>Tank</th>
                <th className={th}>Level</th>
                <th className={th}>Status</th>
                <th className={th}>Circulation</th>
                <th className={th}>Temp</th>
                <th className={th}>pH</th>
                <th className={th}>DO</th>
                <th className={th}>Supply</th>
              </tr>
            </thead>
            <tbody>
              {TANKS.map((t) => {
                const r = tankReading(sim, t.id);
                const infra = tankInfrastructure(t.id);
                return (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className={td}>
                      <button className="font-medium text-brand hover:underline" aria-pressed={selectedId === t.id} onClick={() => select(t.id)}>
                        {t.name}
                      </button>
                      <div className="text-[12px] text-muted">{t.habitat.name}</div>
                    </td>
                    <td className={td}>{t.floor}</td>
                    <td className={td}>
                      <StatusBadge size="sm" info={tankStatusInfo(sim.tanks[t.id].status)} />
                    </td>
                    <td className={`${td} tabular font-semibold`}>{Math.round(r.flowPct)}%</td>
                    <td className={`${td} tabular`}>{r.temp.toFixed(1)} °C</td>
                    <td className={`${td} tabular`}>{r.ph.toFixed(1)}</td>
                    <td className={`${td} tabular`}>{r.dissolvedO2.toFixed(1)} mg/L</td>
                    <td className={td}>
                      {infra.primaryPumps.map((p) => p.replace("PMP-", "")).join(", ")}
                      {infra.backupPumps.length > 0 && <span className="text-muted"> · backup {infra.backupPumps.map((p) => p.replace("PMP-", "")).join(", ")}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section aria-labelledby="tv-equipment" className="overflow-hidden rounded-xl border border-line bg-white">
          <h2 id="tv-equipment" className="px-4 pt-3 text-base font-semibold">
            Circulation equipment
          </h2>
          <table className="mt-2 w-full">
            <thead className="border-y border-line bg-slate-50">
              <tr>
                <th className={th}>Asset</th>
                <th className={th}>Status</th>
                <th className={th}>Flow</th>
                <th className={th}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {PUMPS.map((p) => {
                const r = pumpReading(sim, p.id);
                return (
                  <tr key={p.id} className="border-b border-line">
                    <td className={td}>
                      <button className="font-medium text-brand hover:underline" onClick={() => select(p.id)}>
                        {p.name}
                      </button>
                    </td>
                    <td className={td}>
                      <StatusBadge size="sm" info={pumpStatusInfo(sim.pumps[p.id])} />
                    </td>
                    <td className={`${td} tabular`}>{Math.round(r.delivered)} m³/h</td>
                    <td className={`${td} text-muted`}>
                      {p.role === "backup" ? "Standby / backup duty" : "Primary duty"} · rated {p.ratedFlow} m³/h
                    </td>
                  </tr>
                );
              })}
              {FILTERS.map((f) => (
                <tr key={f.id} className="border-b border-line">
                  <td className={td}>
                    <button className="font-medium text-brand hover:underline" onClick={() => select(f.id)}>
                      {f.name}
                    </button>
                  </td>
                  <td className={td}>{(sim.nodeFlow[f.id] ?? 0) > 1 ? "In service" : "No flow"}</td>
                  <td className={`${td} tabular`}>{Math.round(sim.nodeFlow[f.id] ?? 0)} m³/h</td>
                  <td className={`${td} text-muted`}>{f.media}</td>
                </tr>
              ))}
              {VALVES.filter((v) => v.type === "auto-transfer").map((v) => (
                <tr key={v.id} className="border-b border-line last:border-0">
                  <td className={td}>
                    <button className="font-medium text-brand hover:underline" onClick={() => select(v.id)}>
                      {v.code}
                    </button>
                  </td>
                  <td className={td}>{(sim.valves[v.id]?.open ?? 0) > 0.5 ? "Open" : "Closed"}</td>
                  <td className={td}>—</td>
                  <td className={`${td} text-muted`}>{v.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {inc && (
          <section aria-labelledby="tv-events" className="rounded-xl border border-line bg-white p-4">
            <h2 id="tv-events" className="text-base font-semibold">
              {inc.id} timeline
            </h2>
            <ol className="mt-2 space-y-1 text-[13px]">
              {sim.events
                .filter((e) => e.incidentId === inc.id)
                .map((e) => (
                  <li key={e.id}>
                    <span className="tabular font-semibold">{hm(e.t)}</span> — {e.title}
                  </li>
                ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
