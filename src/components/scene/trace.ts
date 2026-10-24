/**
 * Which assets/edges are "in focus" for the current selection or incident.
 * Used to emphasise dependency paths and dim everything else.
 */
import { useMemo } from "react";
import { EDGES } from "@/lib/data/facility";
import { activeIncidents } from "@/lib/simulation/engine";
import {
  ASSET_BY_ID,
  EDGE_BY_ID,
  downstreamEdges,
  downstreamTanks,
  incoming,
  outgoing,
  tankInfrastructure,
  upstreamEdges,
} from "@/lib/topology/graph";
import { useAppStore } from "@/store/useAppStore";

export interface TraceSet {
  edges: Set<string>;
  nodes: Set<string>;
  /** True when the set should dim everything outside it. */
  active: boolean;
}

function returnsFrom(tankId: string) {
  const out: string[] = [];
  const stack = [tankId];
  const seen = new Set<string>();
  while (stack.length) {
    const n = stack.pop()!;
    for (const e of outgoing(n, ["return"])) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e.id);
      stack.push(e.to);
    }
  }
  return out;
}

export function traceFor(assetId: string): { edges: string[]; nodes: string[] } {
  const a = ASSET_BY_ID[assetId];
  if (!a) return { edges: [], nodes: [] };
  let edges: string[] = [];
  if (a.kind === "tank") {
    const infra = tankInfrastructure(assetId);
    edges = [...upstreamEdges(assetId).map((e) => e.id), ...infra.returnEdges.map((e) => e.id)];
  } else if (a.kind === "pipe") {
    const e = EDGE_BY_ID[assetId];
    edges = [assetId];
    return { edges, nodes: [e.from, e.to] };
  } else if (a.kind === "sensor") {
    return { edges: [], nodes: [assetId] };
  } else {
    const downEdges = downstreamEdges(assetId);
    const down = downEdges.map((e) => e.id);
    const up = incoming(assetId, ["suction", "supply"]).map((e) => e.id);
    edges = [...down, ...up];
    // Other sources feeding the same headers (e.g. the backup pump for a primary).
    if (a.kind === "pump") {
      const headers = new Set(downEdges.map((e) => e.to).filter((n) => ASSET_BY_ID[n]?.kind === "junction"));
      for (const h of headers) for (const e of upstreamEdges(h)) edges.push(e.id);
    }
    if (a.kind === "filter") edges.push(...EDGES.filter((e) => e.to === assetId).map((e) => e.id));
  }
  const nodes = new Set<string>([assetId]);
  for (const id of edges) {
    nodes.add(EDGE_BY_ID[id].from);
    nodes.add(EDGE_BY_ID[id].to);
  }
  return { edges, nodes: [...nodes] };
}

export function useTraceSet(): TraceSet {
  const selectedId = useAppStore((s) => s.selectedId);
  const mode = useAppStore((s) => s.mode);
  const incidentKey = useAppStore((s) => {
    const inc = activeIncidents(s.sim)[0];
    return inc ? `${inc.id}|${inc.rootAssetId}|${inc.backupPumpId ?? ""}|${inc.affectedTankIds.join(",")}` : "";
  });
  return useMemo(() => {
    if (selectedId && ASSET_BY_ID[selectedId] && mode !== "public") {
      const t = traceFor(selectedId);
      return { edges: new Set(t.edges), nodes: new Set(t.nodes), active: true };
    }
    if (mode === "incident" && incidentKey) {
      const [, root, backup, affected] = incidentKey.split("|");
      const edges = new Set<string>();
      const nodes = new Set<string>([root]);
      for (const e of [...downstreamEdges(root), ...incoming(root, ["suction"])]) edges.add(e.id);
      if (backup) {
        nodes.add(backup);
        for (const e of [...downstreamEdges(backup), ...incoming(backup, ["suction"])]) edges.add(e.id);
      }
      for (const tank of affected ? affected.split(",") : downstreamTanks(root)) {
        nodes.add(tank);
        for (const id of returnsFrom(tank)) edges.add(id);
      }
      for (const id of edges) {
        nodes.add(EDGE_BY_ID[id].from);
        nodes.add(EDGE_BY_ID[id].to);
      }
      return { edges, nodes, active: true };
    }
    return { edges: new Set(), nodes: new Set(), active: false };
  }, [selectedId, mode, incidentKey]);
}
