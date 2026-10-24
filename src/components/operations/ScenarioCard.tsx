"use client";

import { Check, Filter, FlaskConical, HeartPulse, Pause, Play, RotateCcw, SkipForward, Zap } from "lucide-react";
import { clock, cls } from "@/lib/format";
import { activeIncidents, type IncidentRuntime, type SimState } from "@/lib/simulation/engine";
import { SCENARIOS, type ScenarioDef } from "@/lib/simulation/scenario";
import { useAppStore } from "@/store/useAppStore";

interface Step {
  label: string;
  done: boolean;
}

function stepsFor(def: ScenarioDef, sim: SimState, inc?: IncidentRuntime): Step[] {
  const hasAlarm = !!inc && sim.events.some((e) => e.incidentId === inc.id && e.kind === "alarm");
  const resolved = inc?.status === "resolved";
  if (def.id === "pump-c2")
    return [
      { label: "Trip", done: !!inc },
      { label: "Low flow", done: hasAlarm },
      { label: "C-3 backup", done: !!inc?.backupConfirmedAt },
      { label: "Stable", done: !!inc?.stabilizedAt },
      { label: "Healed", done: resolved },
    ];
  const f = sim.filters?.[def.rootAssetId];
  return [
    { label: "Clogging", done: !!inc || (f?.clogTarget ?? 0) > 0 },
    { label: "DP alarm", done: !!inc },
    { label: "Degraded", done: hasAlarm },
    { label: "Stable", done: !!inc?.stabilizedAt },
    { label: "Backwashed", done: resolved },
  ];
}

function ScenarioTile({ def }: { def: ScenarioDef }) {
  const sim = useAppStore((s) => s.sim);
  const a = useAppStore.getState();
  const active = activeIncidents(sim);
  const inc = [...sim.incidents].reverse().find((i) => i.rootAssetId === def.rootAssetId);
  const live = inc && inc.status !== "resolved";
  const building = !inc && ((sim.filters?.[def.rootAssetId]?.clogTarget ?? 0) > 0 || sim.pumps[def.rootAssetId]?.mode === "tripping");
  const running = !!live || building;
  const healed = inc?.status === "resolved" && !running;
  const otherRunning = !running && (active.length > 0 || Object.values(sim.filters ?? {}).some((f) => f.clogTarget > 0 && !f.backwashing));
  const steps = stepsFor(def, sim, inc && (live || healed) ? inc : undefined);
  const Icon = def.id === "pump-c2" ? Zap : Filter;
  const canHeal = live && inc?.status === "active";
  const canSkip = live && !inc?.stabilizedAt && inc?.status === "active";

  return (
    <div className={cls("rounded-xl border p-3 transition-colors", running ? "border-red-200 bg-gradient-to-br from-red-50 to-white" : healed ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white" : "border-line bg-white")}>
      <div className="flex items-start gap-3">
        <span className={cls("grid size-9 shrink-0 place-items-center rounded-lg", running ? "bg-crit text-white" : healed ? "bg-ok text-white" : "bg-slate-100 text-ink-2")}>
          <Icon aria-hidden className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold text-ink">{def.title}</span>
            {running && <span className="pulse-crit rounded-full bg-crit px-1.5 py-px text-[10px] font-bold text-white uppercase">Live</span>}
            {healed && <span className="rounded-full bg-ok-bg px-1.5 py-px text-[10px] font-bold text-ok uppercase">Healed</span>}
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-muted">{def.summary}</p>
          <p className="mt-1 text-[11.5px] text-ink-2">
            <span className="font-medium">Affects:</span> {def.affects}
          </p>
        </div>
      </div>

      {(running || healed) && (
        <ol aria-label={`${def.title} progress`} className="mt-3 grid grid-cols-5 gap-1">
          {steps.map((st, i) => (
            <li key={st.label} className="flex flex-col items-center gap-1">
              <span className={cls("h-1.5 w-full rounded-full", st.done ? (i === steps.length - 1 ? "bg-ok" : "bg-crit") : "bg-slate-200")} />
              <span className={cls("text-[10px] leading-tight", st.done ? "font-semibold text-ink" : "text-subtle")}>{st.label}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {!running && (
          <button
            disabled={otherRunning}
            onClick={() => a.runScenario(def.id)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-crit px-3 text-[12.5px] font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play aria-hidden className="size-3.5" /> {healed ? "Run again" : "Run scenario"}
          </button>
        )}
        {canSkip && (
          <button onClick={a.stabilize} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[12.5px] font-medium hover:bg-slate-50">
            <SkipForward aria-hidden className="size-3.5" /> Skip to stable
          </button>
        )}
        {canHeal && (
          <button onClick={a.recover} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ok px-3 text-[12.5px] font-semibold text-white shadow-sm hover:bg-green-800">
            <HeartPulse aria-hidden className="size-3.5" /> {def.heal}
          </button>
        )}
        {live && inc?.status === "recovering" && <span className="inline-flex h-8 items-center gap-1.5 text-[12.5px] font-medium text-ok">Healing… circulation returning</span>}
        {otherRunning && <span className="inline-flex h-8 items-center text-[11.5px] text-subtle">One scenario at a time</span>}
      </div>
    </div>
  );
}

export function ScenarioCard() {
  const sim = useAppStore((s) => s.sim);
  const speed = useAppStore((s) => s.speed);
  const playing = useAppStore((s) => s.playing);
  const ff = useAppStore((s) => s.fastForwarding);
  const a = useAppStore.getState();
  return (
    <section aria-labelledby="scenario-title" className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <header className="bg-gradient-to-r from-[#0d1b33] via-[#11264a] to-[#173563] px-4 pt-3 pb-2.5 text-white">
        <div className="flex items-center justify-between gap-2">
          <h3 id="scenario-title" className="flex items-center gap-2 text-[13.5px] font-semibold whitespace-nowrap">
            <FlaskConical aria-hidden className="size-4 text-sky-300" /> Scenario lab
          </h3>
          <span className="rounded border border-white/25 px-1.5 py-px text-[9.5px] font-bold tracking-wide text-white/70 uppercase">Simulated</span>
        </div>
        <div className="mt-2 flex items-center gap-1 rounded-lg bg-white/8 p-1">
          <span className="tabular mr-auto pl-1.5 text-[12px] text-white/80">{clock(sim.t)}</span>
          <button aria-label={playing ? "Pause simulation" : "Resume simulation"} onClick={a.togglePlaying} className="grid size-7 place-items-center rounded-md hover:bg-white/10">
            {playing ? <Pause aria-hidden className="size-3.5" /> : <Play aria-hidden className="size-3.5" />}
          </button>
          {[1, 10, 60].map((v) => (
            <button
              key={v}
              aria-pressed={playing && speed === v}
              onClick={() => a.setSpeed(v)}
              className={cls("tabular h-7 rounded-md px-1.5 text-[11.5px] font-semibold", playing && speed === v ? "bg-white text-ink" : "text-white/75 hover:bg-white/10")}
            >
              {v}×
            </button>
          ))}
          {ff && playing && <span className="px-1 text-[10.5px] font-bold text-amber-300">▸▸ 20×</span>}
        </div>
      </header>
      <div className="space-y-2 p-3">
        {SCENARIOS.map((d) => (
          <ScenarioTile key={d.id} def={d} />
        ))}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-semibold text-subtle uppercase">Presets</span>
          <button className="rounded-md border border-line px-2 py-1 text-[11.5px] font-medium hover:bg-slate-50" onClick={() => a.loadPreset("incident")}>
            Pump fault @ 10:24
          </button>
          <button className="rounded-md border border-line px-2 py-1 text-[11.5px] font-medium hover:bg-slate-50" onClick={() => a.loadPreset("filter")}>
            Filter clog @ 10:20
          </button>
          <button className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium text-muted hover:bg-slate-100 hover:text-ink" onClick={() => a.openDialog({ resetConfirm: true })}>
            <RotateCcw aria-hidden className="size-3" /> Reset
          </button>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-subtle">
          <Check aria-hidden className="size-3" /> Transients fast-forward at 20×, then return to your speed.
        </p>
      </div>
    </section>
  );
}
