"use client";

import { ChevronDown, Filter, FlaskConical, HeartPulse, Pause, Play, RotateCcw, SkipForward, Zap } from "lucide-react";
import { useState } from "react";
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

function scenarioState(def: ScenarioDef, sim: SimState) {
  const inc = [...sim.incidents].reverse().find((i) => i.rootAssetId === def.rootAssetId);
  const live = !!inc && inc.status !== "resolved";
  const building = !inc && ((sim.filters?.[def.rootAssetId]?.clogTarget ?? 0) > 0 || sim.pumps[def.rootAssetId]?.mode === "tripping");
  const running = live || building;
  return { inc, live, running, healed: inc?.status === "resolved" && !running };
}

/** One scenario as a compact row; it grows a progress line and actions only while it runs. */
function ScenarioTile({ def }: { def: ScenarioDef }) {
  const sim = useAppStore((s) => s.sim);
  const a = useAppStore.getState();
  const active = activeIncidents(sim);
  const { inc, live, running, healed } = scenarioState(def, sim);
  const otherRunning = !running && (active.length > 0 || Object.values(sim.filters ?? {}).some((f) => f.clogTarget > 0 && !f.backwashing));
  const steps = stepsFor(def, sim, inc && (live || healed) ? inc : undefined);
  const doneSteps = steps.filter((s) => s.done).length;
  const stepNow = [...steps].reverse().find((s) => s.done);
  const Icon = def.id === "pump-c2" ? Zap : Filter;
  const canHeal = live && inc?.status === "active";
  const canSkip = live && !inc?.stabilizedAt && inc?.status === "active";

  return (
    <div title={def.summary} className={cls("rounded-xl px-2.5 py-2 transition-colors", running ? "bg-red-50/90 ring-1 ring-red-200/90" : healed ? "bg-emerald-50/90 ring-1 ring-emerald-200/90" : "glass-tile")}>
      <div className="flex items-center gap-2.5">
        <span className={cls("grid size-8 shrink-0 place-items-center rounded-lg", running ? "btn-glossy bg-crit text-white" : healed ? "btn-glossy bg-ok text-white" : "bg-gradient-to-b from-sky-50 to-cyan-100/70 text-cyan-700 ring-1 ring-white")}>
          <Icon aria-hidden className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-ink">{def.title}</span>
            {running && <span className="pulse-crit shrink-0 rounded-full bg-crit px-1.5 text-[9.5px] leading-4 font-bold text-white uppercase">Live</span>}
            {healed && <span className="shrink-0 rounded-full bg-ok-bg px-1.5 text-[9.5px] leading-4 font-bold text-ok uppercase">Healed</span>}
          </span>
          <span className="block truncate text-[11.5px] text-muted">{def.affects}</span>
        </span>
        {!running && (
          <button
            disabled={otherRunning}
            title={otherRunning ? "One scenario at a time" : undefined}
            aria-label={`${healed ? "Run scenario again" : "Run scenario"}: ${def.title}`}
            onClick={() => a.runScenario(def.id)}
            className="btn-glossy inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-crit px-2.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Play aria-hidden className="size-3" /> {healed ? "Again" : "Run"}
          </button>
        )}
      </div>

      {(running || healed) && (
        <div className="mt-2 pl-[42px]">
          <div className="flex items-center gap-2">
            <span
              role="progressbar"
              aria-label={`${def.title} progress`}
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-valuenow={doneSteps}
              className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white ring-1 ring-black/5"
            >
              <span className={cls("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", healed ? "bg-ok" : "bg-gradient-to-r from-red-500 to-amber-400")} style={{ width: `${(doneSteps / steps.length) * 100}%` }} />
            </span>
            <span className="shrink-0 text-[11px] font-medium text-ink-2">{stepNow ? stepNow.label : "Starting"}</span>
          </div>
          {(canSkip || canHeal || inc?.status === "recovering") && (
            <div className="mt-2 flex items-center justify-end gap-1.5">
              {inc?.status === "recovering" && <span className="mr-auto text-[11.5px] font-medium text-ok">Healing… flow returning</span>}
              {canSkip && (
                <button onClick={a.stabilize} className="glass-btn inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium">
                  <SkipForward aria-hidden className="size-3" /> Skip
                </button>
              )}
              {canHeal && (
                <button onClick={a.recover} className="btn-glossy inline-flex h-7 items-center gap-1 rounded-lg bg-ok px-2.5 text-[12px] font-semibold text-white">
                  <HeartPulse aria-hidden className="size-3.5" /> {def.heal}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ScenarioCard() {
  const sim = useAppStore((s) => s.sim);
  const speed = useAppStore((s) => s.speed);
  const playing = useAppStore((s) => s.playing);
  const ff = useAppStore((s) => s.fastForwarding);
  const a = useAppStore.getState();
  const [open, setOpen] = useState(false);
  // A running (or just healed) scenario stays on show even when the lab is closed.
  const current = SCENARIOS.find((d) => scenarioState(d, sim).running) ?? SCENARIOS.find((d) => scenarioState(d, sim).healed && sim.t - (scenarioState(d, sim).inc?.resolvedAt ?? 0) < 45);
  const currentRunning = !!current && scenarioState(current, sim).running;
  return (
    <section aria-labelledby="scenario-title" className="glass overflow-hidden rounded-2xl">
      <header className="water-header flex items-center gap-2 px-3 py-2 text-white">
        <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="scenario-body" className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 pr-1 text-left">
          <FlaskConical aria-hidden className="size-4 shrink-0 text-sky-300" />
          <span id="scenario-title" className="text-[13.5px] font-semibold whitespace-nowrap">
            Scenario lab
          </span>
          {currentRunning ? (
            <span aria-label="Scenario running" className="pulse-crit size-2 shrink-0 rounded-full bg-red-400" />
          ) : (
            <span aria-label={`${SCENARIOS.length} scenarios`} className="grid size-5 shrink-0 place-items-center rounded-full bg-white/15 text-[10.5px] font-semibold">
              {SCENARIOS.length}
            </span>
          )}
          <ChevronDown aria-hidden className={cls("ml-auto size-4 shrink-0 text-white/80 transition-transform duration-300 group-hover:text-white", open && "rotate-180")} />
        </button>
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-white/10 p-0.5 ring-1 ring-white/10" title="Simulated time">
          <span className="tabular px-1.5 text-[11.5px] text-white/80">{clock(sim.t)}</span>
          <button aria-label={playing ? "Pause simulation" : "Resume simulation"} onClick={a.togglePlaying} className="grid size-6 place-items-center rounded-md hover:bg-white/10">
            {playing ? <Pause aria-hidden className="size-3" /> : <Play aria-hidden className="size-3" />}
          </button>
          {[1, 10, 60].map((v) => (
            <button
              key={v}
              aria-pressed={playing && speed === v}
              onClick={() => a.setSpeed(v)}
              className={cls("tabular h-6 rounded-md px-1.5 text-[11px] font-semibold", playing && speed === v ? "bg-white text-ink" : "text-white/75 hover:bg-white/10")}
            >
              {v}×
            </button>
          ))}
          {ff && playing && <span className="px-1 text-[10px] font-bold text-amber-300">20×</span>}
        </div>
      </header>
      {!open && current && (
        <div className="p-2">
          <ScenarioTile def={current} />
        </div>
      )}
      <div id="scenario-body" hidden={!open} className="fade-in space-y-1.5 p-2">
        {SCENARIOS.map((d) => (
          <ScenarioTile key={d.id} def={d} />
        ))}
        <div className="flex items-center gap-1 px-0.5 pt-0.5 text-[11.5px]">
          <span className="text-subtle">Jump to</span>
          <button className="rounded-md px-1.5 py-1 font-medium text-brand hover:bg-white/80" onClick={() => a.loadPreset("incident")}>
            Pump fault
          </button>
          <span aria-hidden className="text-subtle">·</span>
          <button className="rounded-md px-1.5 py-1 font-medium text-brand hover:bg-white/80" onClick={() => a.loadPreset("filter")}>
            Filter clog
          </button>
          <button className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium text-muted hover:bg-white/80 hover:text-ink" onClick={() => a.openDialog({ resetConfirm: true })}>
            <RotateCcw aria-hidden className="size-3" /> Reset
          </button>
        </div>
      </div>
    </section>
  );
}
