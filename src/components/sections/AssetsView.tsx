"use client";

import { ArrowRight, Box, Cog, Database, Droplets, Filter, GitBranch, Radio, Search, ToggleLeft, Waypoints, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { cls } from "@/lib/format";
import type { SimState } from "@/lib/simulation/engine";
import { filterReading, pumpReading, sensorValue, tankReading } from "@/lib/simulation/readings";
import { pumpStatusInfo, tankStatusInfo, type StatusInfo } from "@/lib/status";
import { ASSETS, type AssetRecord } from "@/lib/topology/graph";
import type { AssetKind, FloorId } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader, Segmented, StatusBadge } from "@/components/ui/primitives";

const KIND_INFO: Record<AssetKind, { label: string; icon: LucideIcon }> = {
  tank: { label: "Tank", icon: Droplets },
  pump: { label: "Pump", icon: Cog },
  filter: { label: "Filter", icon: Filter },
  valve: { label: "Valve", icon: ToggleLeft },
  junction: { label: "Header", icon: Waypoints },
  sensor: { label: "Sensor", icon: Radio },
  pipe: { label: "Pipe", icon: GitBranch },
};

const KIND_ORDER: AssetKind[] = ["tank", "pump", "filter", "valve", "junction", "sensor", "pipe"];

const LEVEL: Record<FloorId, string> = { L3: "Level 3", L2: "Level 2", L1: "Level 1", PL: "Plant hall" };

function describe(sim: SimState, a: AssetRecord): { status: StatusInfo; reading: string } {
  switch (a.kind) {
    case "tank": {
      const r = tankReading(sim, a.id);
      return { status: tankStatusInfo(sim.tanks[a.id].status), reading: `${Math.round(r.flowPct)}% flow · ${r.temp.toFixed(1)} °C` };
    }
    case "pump":
      return { status: pumpStatusInfo(sim.pumps[a.id]), reading: `${Math.round(pumpReading(sim, a.id).delivered)} m³/h` };
    case "filter": {
      const f = filterReading(sim, a.id);
      const blocked = f.clogPct > 2;
      return {
        status: f.backwashing ? { tone: "backup", label: "Backwashing", icon: "spinner" } : blocked ? { tone: "crit", label: `${Math.round(f.clogPct)}% blocked`, icon: "alert" } : { tone: "ok", label: "In service", icon: "check" },
        reading: `${Math.round(f.flow)} m³/h`,
      };
    }
    case "valve": {
      const open = (sim.valves[a.id]?.open ?? 0) > 0.5;
      return { status: { tone: open ? "ok" : "off", label: open ? "Open" : "Closed", icon: open ? "check" : "pause" }, reading: `${Math.round((sim.valves[a.id]?.open ?? 0) * 100)}% open` };
    }
    case "sensor":
      return { status: { tone: "ok", label: "Reporting", icon: "check" }, reading: sensorValue(sim, a.id).display };
    case "pipe": {
      const f = sim.edgeFlow[a.id] ?? 0;
      return { status: { tone: f > 0.5 ? "ok" : "off", label: f > 0.5 ? "Flowing" : "No flow", icon: f > 0.5 ? "check" : "pause" }, reading: `${Math.round(f)} m³/h` };
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
  const [q, setQ] = useState("");
  const counts = useMemo(() => Object.fromEntries(KIND_ORDER.map((k) => [k, ASSETS.filter((x) => x.kind === k).length])) as Record<AssetKind, number>, []);
  const rows = useMemo(() => ASSETS.filter((x) => (kind === "all" || x.kind === kind) && (!q || `${x.id} ${x.name} ${x.code}`.toLowerCase().includes(q.toLowerCase()))), [kind, q]);

  const open = (x: AssetRecord) => {
    if (x.kind !== "tank" && useAppStore.getState().mode === "public") a.setMode("operations");
    a.setSection("facility");
    a.select(x.id);
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("aqualink:focus", { detail: x.id })), 60);
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Database}
        title="Assets"
        subtitle="Every tank, pump, filter, valve, sensor and pipe in the facility. Click one to find it in 3D."
        actions={
          <label className="relative">
            <span className="sr-only">Search assets</span>
            <Search aria-hidden className="absolute top-2.5 left-3 size-4 text-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or ID" className="glass-tile h-9 w-64 rounded-xl pr-3 pl-9 text-[13px] outline-none focus:ring-2 focus:ring-sky-300" />
          </label>
        }
      >
        <Segmented<AssetKind | "all">
          label="Asset type"
          value={kind}
          onChange={setKind}
          options={[
            { id: "all", label: `All ${ASSETS.length}` },
            ...KIND_ORDER.map((k) => ({
              id: k,
              label: (
                <>
                  {KIND_INFO[k].label}s <span className="ml-0.5 opacity-60">{counts[k]}</span>
                </>
              ),
            })),
          ]}
        />
      </PageHeader>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <table className="w-full border-separate border-spacing-y-1">
          <caption className="sr-only">Assets ({rows.length})</caption>
          <thead className="text-left text-[12px] text-muted">
            <tr>
              <th className="px-4 pt-3 pb-1 font-medium">Asset</th>
              <th className="px-3 pt-3 pb-1 font-medium">Where</th>
              <th className="px-3 pt-3 pb-1 font-medium">Status</th>
              <th className="px-3 pt-3 pb-1 font-medium">Now</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const d = describe(sim, x);
              const Icon = KIND_INFO[x.kind].icon;
              return (
                <tr key={x.id} onClick={() => open(x)} className="group cursor-pointer">
                  <td className="rounded-l-xl bg-white/65 px-4 py-2.5 transition-colors group-hover:bg-white">
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-b from-sky-50 to-cyan-100/70 text-cyan-700 ring-1 ring-white">
                        <Icon aria-hidden className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium text-ink">{x.name}</span>
                        <span className="tabular block text-[11.5px] text-subtle">
                          {KIND_INFO[x.kind].label} · {x.id}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="bg-white/65 px-3 py-2.5 text-[13px] text-ink-2 transition-colors group-hover:bg-white">{LEVEL[x.floor]}</td>
                  <td className="bg-white/65 px-3 py-2.5 transition-colors group-hover:bg-white">
                    <StatusBadge size="sm" info={d.status} />
                  </td>
                  <td className="tabular bg-white/65 px-3 py-2.5 text-[13px] text-ink-2 transition-colors group-hover:bg-white">{d.reading}</td>
                  <td className="rounded-r-xl bg-white/65 px-3 py-2.5 text-right transition-colors group-hover:bg-white">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        open(x);
                      }}
                      className={cls("inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-brand opacity-70 transition-opacity group-hover:opacity-100")}
                      aria-label={`View ${x.name} in 3D`}
                    >
                      <Box aria-hidden className="size-3.5" /> View <ArrowRight aria-hidden className="size-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-10 text-center text-[13px] text-muted">Nothing matches “{q}”.</p>}
      </div>
    </div>
  );
}
