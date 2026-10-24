/**
 * Shared status vocabulary: the same label, tone and colour is used by the 3D
 * labels, panels, tables and reports. Colour is never the only signal: every
 * status also has text and a distinct icon.
 */
import type { CirculationStatus, PumpRuntime, SimState } from "@/lib/simulation/engine";
import { PUMP_BY_ID, incoming } from "@/lib/topology/graph";

export type Tone = "ok" | "warn" | "crit" | "backup" | "off" | "info";

export const TONE_HEX: Record<Tone, string> = {
  ok: "#22c55e",
  warn: "#f59e0b",
  crit: "#ef4444",
  backup: "#f2a516",
  off: "#94a3b8",
  info: "#38bdf8",
};

export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  crit: "text-crit",
  backup: "text-warn",
  off: "text-muted",
  info: "text-brand",
};

export const TONE_BG: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  crit: "bg-crit-bg text-crit",
  backup: "bg-warn-bg text-warn",
  off: "bg-slate-100 text-muted",
  info: "bg-brand-50 text-brand-600",
};

export type StatusIcon = "check" | "alert" | "octagon" | "x" | "backup" | "pause" | "spinner";

export interface StatusInfo {
  tone: Tone;
  label: string;
  icon: StatusIcon;
}

export function tankStatusInfo(status: CirculationStatus): StatusInfo {
  switch (status) {
    case "healthy":
      return { tone: "ok", label: "Healthy", icon: "check" };
    case "degraded":
      return { tone: "warn", label: "Flow degraded", icon: "alert" };
    case "reduced":
      return { tone: "crit", label: "Flow reduced", icon: "octagon" };
    case "no-flow":
      return { tone: "crit", label: "No circulation", icon: "x" };
  }
}

export function pumpStatusInfo(p: PumpRuntime): StatusInfo {
  const cfg = PUMP_BY_ID[p.id];
  switch (p.mode) {
    case "running":
      return p.covering ? { tone: "backup", label: `Backup (${Math.round(p.output * 100)}%)`, icon: "backup" } : { tone: "ok", label: "Online", icon: "check" };
    case "starting":
      return { tone: "backup", label: p.covering ? "Backup starting" : "Starting", icon: "spinner" };
    case "stopping":
      return { tone: "warn", label: "To standby", icon: "spinner" };
    case "standby":
      return cfg?.role === "backup" ? { tone: "off", label: "Standby", icon: "pause" } : { tone: "off", label: "Stopped", icon: "pause" };
    case "tripping":
      return { tone: "crit", label: "Overcurrent", icon: "alert" };
    case "fault":
      return { tone: "crit", label: "Fault · Stopped", icon: "alert" };
  }
}

export type FlowVisual = "normal" | "backup" | "limited" | "interrupted" | "upstream" | "standby" | "return";

/**
 * Visual state of a pipe edge, derived from simulated flow and pump states.
 * - interrupted: downstream of a failed pump on its primary path, no flow.
 * - upstream: suction side feeding a failed pump (no flow, upstream of fault).
 * - backup: carrying flow sourced from a covering backup pump.
 * - limited: carrying flow below its share of design (capacity limited).
 */
export function edgeVisual(s: SimState, edgeId: string, from: string, to: string, kind: "suction" | "supply" | "return", design: number): FlowVisual {
  const flow = s.edgeFlow[edgeId] ?? 0;
  const fromPump = s.pumps[from];
  const toPump = s.pumps[to];
  if (kind === "suction" && toPump && (toPump.mode === "fault" || toPump.mode === "tripping")) return "upstream";
  if (kind === "suction" && toPump?.covering && flow > 0.5) return "backup";
  if (fromPump && (fromPump.mode === "fault" || fromPump.mode === "tripping")) return "interrupted";
  if (flow < 0.5) {
    // A dry line downstream of a failed pump stays red; otherwise it is idle/standby.
    return isDownstreamOfFault(s, from) ? "interrupted" : "standby";
  }
  if (fromPump?.covering || (isFedByBackup(s, from) && kind !== "return")) return "backup";
  if (design > 0 && flow < design * 0.9) return "limited";
  return kind === "return" ? "return" : "normal";
}

const parents = (node: string) => incoming(node, ["supply"]).map((e) => e.from);

function isDownstreamOfFault(s: SimState, node: string, depth = 0): boolean {
  if (depth > 8) return false;
  const p = s.pumps[node];
  if (p) return p.mode === "fault" || p.mode === "tripping";
  return parents(node).some((n) => isDownstreamOfFault(s, n, depth + 1));
}

function isFedByBackup(s: SimState, node: string, depth = 0): boolean {
  if (depth > 8) return false;
  const p = s.pumps[node];
  if (p) return p.covering && (p.mode === "running" || p.mode === "starting");
  return parents(node).some((n) => isFedByBackup(s, n, depth + 1));
}

export const FLOW_VISUAL_HEX: Record<FlowVisual, string> = {
  normal: "#2f8cff",
  return: "#4f7fb8",
  backup: "#f2a516",
  limited: "#f2a516",
  interrupted: "#ef4444",
  upstream: "#b45f63",
  standby: "#6b7686",
};

export const FLOW_VISUAL_LABEL: Record<FlowVisual, string> = {
  normal: "Normal circulation",
  return: "Return flow",
  backup: "Backup flow",
  limited: "Capacity-limited flow",
  interrupted: "Interrupted (downstream of fault)",
  upstream: "No flow (upstream of fault)",
  standby: "Idle / standby",
};
