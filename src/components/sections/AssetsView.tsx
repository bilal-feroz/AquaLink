"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { FLOORS } from "@/lib/data/facility";
import { cls } from "@/lib/format";
import type { SimState } from "@/lib/simulation/engine";
import { pumpReading, sensorValue, tankReading } from "@/lib/simulation/readings";
import { pumpStatusInfo, tankStatusInfo, type StatusInfo } from "@/lib/status";
import { ASSETS, EDGE_BY_ID, NETWORK_COUNTS, type AssetRecord } from "@/lib/topology/graph";
import type { AssetKind } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { StatusBadge } from "@/components/ui/primitives";

const KINDS: { id: AssetKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "tank", label: "Tanks" },
  { id: "pump", label: "Pumps" },
  { id: "filter", label: "Filters" },
  { id: "valve", label: "Valves" },
  { id: "junction", label: "Headers" },
  { id: "sensor", label: "Sensors" },
  { id: "pipe", label: "Pipes" },
];

function describe(sim: SimState, a: AssetRecord): { status: StatusInfo; reading: string } {
  switch (a.kind) {
    case "tank": {
      const r = tankReading(sim, a.id);
      return { status: tankStatusInfo(sim.tanks[a.id].status), reading: `${Math.round(r.flowPct)}% · ${r.temp.toFixed(1)} °C · pH ${r.ph.toFixed(1)}` };
    }
    case "pump": {
      const r = pumpReading(sim, a.id);
      return { status: pumpStatusInfo(sim.pumps[a.id]), reading: `${Math.round(r.delivered)} m³/h · ${r.currentPct.toFixed(0)}% FLA` };
    }
    case "valve": {
      const open = (sim.valves[a.id]?.open ?? 0) > 0.5;
      return { status: { tone: open ? "ok" : "off", label: open ? "Open" : "Closed", icon: open ? "check" : "pause" }, reading: `${Math.round((sim.valves[a.id]?.open ?? 0) * 100)}% open` };
    }
    case "sensor":
      return { status: { tone: "ok", label: "Reporting", icon: "check" }, reading: sensorValue(sim, a.id).display };
    case "pipe": {
      const f = sim.edgeFlow[a.id] ?? 0;
      return { status: { tone: f > 0.5 ? "ok" : "off", label: f > 0.5 ? "Flowing" : "No flow", icon: f > 0.5 ? "check" : "pause" }, reading: `${Math.round(f)} m³/h · ${EDGE_BY_ID[a.id].kind}` };
    }
    default: {
      const f = sim.nodeFlow[a.id] ?? 0;
      return { status: { tone: f > 0.5 ? "ok" : "off", label: f > 0.5 ? "In service" : "No flow", icon: f > 0.5 ? "check" : "pause" }, reading: `${Math.round(f)} m³/h` };
    }
  }
}

export function AssetsView() {
  const sim = useAppStore((s) => s.sim);
  const a = useAppStore.getState();
  const [kind, setKind] = useState<AssetKind | "all">("all");
  const [floor, setFloor] = useState<string>("all");
  const [q, setQ] = useState("");
  const rows = useMemo(
    () =>
      ASSETS.filter((x) => (kind === "all" || x.kind === kind) && (floor === "all" || x.floor === floor) && (!q || `${x.id} ${x.name} ${x.code}`.toLowerCase().includes(q.toLowerCase()))),
    [kind, floor, q],
  );

  const open = (x: AssetRecord) => {
    if (x.kind !== "tank" && useAppStore.getState().mode === "public") a.setMode("infrastructure");
    a.setSection("facility");
    a.select(x.id);
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("aqualink:focus", { detail: x.id })), 60);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-6 pt-5 pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Asset registry</h1>
        <p className="mt-1 text-[13px] text-muted">
          Every asset in the facility twin — {NETWORK_COUNTS.tanks} tanks, {NETWORK_COUNTS.pumps} pumps, {NETWORK_COUNTS.filters} filters, {NETWORK_COUNTS.valves} valves, {NETWORK_COUNTS.sensors} sensors and {NETWORK_COUNTS.pipes} pipe runs. Select a row to locate it in 3D.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="Asset type" className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
            {KINDS.map((k) => (
              <button key={k.id} role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)} className={cls("rounded-md px-2.5 py-1 text-[12.5px] font-medium", kind === k.id ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}>
                {k.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            Level
            <select value={floor} onChange={(e) => setFloor(e.target.value)} className="h-8 rounded-lg border border-line bg-white px-2 text-[13px] text-ink">
              <option value="all">All levels</option>
              {FLOORS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id}
                </option>
              ))}
            </select>
          </label>
          <label className="relative ml-auto">
            <span className="sr-only">Search assets</span>
            <Search aria-hidden className="absolute top-2 left-2.5 size-4 text-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID or name" className="h-8 w-60 rounded-lg border border-line pr-3 pl-8 text-[13px]" />
          </label>
        </div>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <table className="w-full">
          <caption className="sr-only">Assets ({rows.length})</caption>
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[12px] text-muted">
            <tr className="border-b border-line">
              <th className="px-6 py-2.5 font-semibold">ID</th>
              <th className="px-3 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">Type</th>
              <th className="px-3 py-2.5 font-semibold">Level</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Reading</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const d = describe(sim, x);
              return (
                <tr key={x.id} className="border-b border-line hover:bg-slate-50">
                  <td className="tabular px-6 py-2 text-[13px] font-medium">
                    <button onClick={() => open(x)} className="text-brand hover:underline">
                      {x.id}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-[13px] text-ink">{x.name}</td>
                  <td className="px-3 py-2 text-[13px] text-muted capitalize">{x.kind}</td>
                  <td className="px-3 py-2 text-[13px] text-muted">{x.floor}</td>
                  <td className="px-3 py-2">
                    <StatusBadge size="sm" info={d.status} />
                  </td>
                  <td className="tabular px-3 py-2 text-[13px] text-ink-2">{d.reading}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
