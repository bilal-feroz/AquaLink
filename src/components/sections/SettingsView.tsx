"use client";

import { RotateCcw } from "lucide-react";
import { FLOW_THRESHOLDS, LOOPS, PUMPS } from "@/lib/data/facility";
import { cls } from "@/lib/format";
import { useAppStore, type MotionPref, type Quality } from "@/store/useAppStore";
import { Button, Card, Kbd } from "@/components/ui/primitives";

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; hint?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} className={cls("rounded-xl border p-3 text-left", value === o.id ? "border-brand bg-brand-50" : "border-line hover:bg-slate-50")}>
          <div className="text-[13px] font-semibold text-ink">{o.label}</div>
          {o.hint && <div className="mt-0.5 text-[12px] text-muted">{o.hint}</div>}
        </button>
      ))}
    </div>
  );
}

export function SettingsView() {
  const motion = useAppStore((s) => s.motionPref);
  const quality = useAppStore((s) => s.quality);
  const autoFF = useAppStore((s) => s.autoFastForward);
  const system = useAppStore((s) => s.systemReducedMotion);
  const a = useAppStore.getState();
  const c3 = PUMPS.find((p) => p.id === "PMP-C3")!;
  const loop2 = LOOPS.find((l) => l.id === "LOOP-2")!;
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <header className="border-b border-line px-6 pt-5 pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-[13px] text-muted">Display, accessibility and demonstration controls. Preferences are saved in this browser.</p>
      </header>
      <div className="grid max-w-5xl gap-4 px-6 py-5 lg:grid-cols-2">
        <Card title="Motion" id="st-motion">
          <Choice<MotionPref>
            label="Motion preference"
            value={motion}
            onChange={a.setMotionPref}
            options={[
              { id: "system", label: "System", hint: system ? "Your OS asks for reduced motion" : "Follows your OS setting" },
              { id: "reduce", label: "Reduced", hint: "Instant camera, static flow arrows" },
              { id: "full", label: "Full", hint: "Animated flow and marine life" },
            ]}
          />
        </Card>
        <Card title="Rendering quality" id="st-quality">
          <Choice<Quality>
            label="Rendering quality"
            value={quality}
            onChange={a.setQuality}
            options={[
              { id: "high", label: "High", hint: "Bloom, outlines, 1.75× pixel ratio" },
              { id: "balanced", label: "Balanced", hint: "Lighter effects, 1.25×" },
              { id: "low", label: "Low", hint: "No post-processing" },
            ]}
          />
          <p className="mt-2 text-[12px] text-muted">Quality drops automatically to Balanced if the frame rate declines.</p>
        </Card>
        <Card title="Simulation" id="st-sim">
          <label className="flex items-start gap-2.5 text-[13px]">
            <input type="checkbox" checked={autoFF} onChange={(e) => a.setAutoFastForward(e.target.checked)} className="mt-0.5 size-4 accent-brand" />
            <span>
              <span className="font-medium">Auto fast-forward transients</span>
              <span className="block text-[12px] text-muted">Runs the simulation at 20× while pumps start, stop or the incident is still settling, then returns to your chosen speed.</span>
            </span>
          </label>
          <dl className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-[12.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Auto-transfer delay ({loop2.name.split(" — ")[0]})</dt>
              <dd className="font-medium">{loop2.autoTransfer?.delaySec} s</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">C-3 backup output</dt>
              <dd className="font-medium">
                {Math.round((c3.backupOutputFraction ?? 1) * 100)}% of {c3.ratedFlow} m³/h
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Low-flow alarm</dt>
              <dd className="font-medium">
                &lt; {FLOW_THRESHOLDS.reduced}% for {FLOW_THRESHOLDS.alarmDelaySec} s
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Demo emergency threshold</dt>
              <dd className="font-medium">{FLOW_THRESHOLDS.emergencyMinimum}% circulation</dd>
            </div>
          </dl>
          <p className="mt-2 text-[12px] text-muted">Configured in src/lib/data/facility.ts — see docs/SIMULATION.md.</p>
        </Card>
        <Card title="Demonstration presets" id="st-presets">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => a.loadPreset("incident")}>Reference incident (10:24)</Button>
            <Button onClick={() => a.loadPreset("stabilizing")}>Fault onset (10:10)</Button>
            <Button variant="danger" icon={RotateCcw} onClick={() => a.openDialog({ resetConfirm: true })}>
              Reset scenario
            </Button>
          </div>
          <p className="mt-3 text-[12.5px] text-muted">
            URL parameters: <code className="rounded bg-slate-100 px-1">?scenario=incident</code>, <code className="rounded bg-slate-100 px-1">?scenario=baseline</code>, <code className="rounded bg-slate-100 px-1">?mode=infrastructure</code>,{" "}
            <code className="rounded bg-slate-100 px-1">?select=PMP-C2</code>.
          </p>
        </Card>
        <Card title="Keyboard" id="st-keys" className="lg:col-span-2">
          <ul className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
            {[
              ["1 / 2 / 3", "Public / Infrastructure / Incident view"],
              ["T", "Toggle accessible text view"],
              ["R", "Reset camera"],
              ["F", "Focus selected asset"],
              ["Esc", "Clear selection"],
              ["Space", "Pause / resume simulation"],
              ["H", "Prepare shift handover"],
              ["?", "Show shortcuts"],
            ].map(([k, v]) => (
              <li key={k} className="flex items-center gap-3">
                <span className="w-24 shrink-0">
                  <Kbd>{k}</Kbd>
                </span>
                <span className="text-ink-2">{v}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-muted">Every 3D label is a focusable button; Tab through them to select assets without a mouse.</p>
        </Card>
      </div>
    </div>
  );
}
