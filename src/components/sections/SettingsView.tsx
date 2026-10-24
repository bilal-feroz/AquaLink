"use client";

import { Filter, Gauge, Keyboard, MonitorPlay, RotateCcw, Settings, Sparkles, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { cls } from "@/lib/format";
import { useAppStore, type MotionPref, type Quality } from "@/store/useAppStore";
import { Kbd, PageHeader } from "@/components/ui/primitives";

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; hint: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cls("flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors", on ? "border-sky-300 bg-gradient-to-r from-sky-50 to-cyan-50/60 ring-1 ring-sky-200" : "glass-tile hover:bg-white/90")}
          >
            <span className={cls("grid size-4 shrink-0 place-items-center rounded-full border-2", on ? "border-brand" : "border-line-strong")}>{on && <span className="size-2 rounded-full bg-brand" />}</span>
            <span>
              <span className="block text-[13.5px] font-semibold text-ink">{o.label}</span>
              <span className="block text-[12px] text-muted">{o.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Panel({ icon: Icon, title, children, className }: { icon: typeof Settings; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cls("glass-tile rounded-2xl p-5", className)}>
      <h2 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-ink">
        <Icon aria-hidden className="size-4 text-brand" /> {title}
      </h2>
      {children}
    </section>
  );
}

export function SettingsView() {
  const motion = useAppStore((s) => s.motionPref);
  const quality = useAppStore((s) => s.quality);
  const autoFF = useAppStore((s) => s.autoFastForward);
  const system = useAppStore((s) => s.systemReducedMotion);
  const a = useAppStore.getState();
  const demo = (fn: () => void) => () => {
    fn();
    a.setSection("facility");
  };
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <PageHeader icon={Settings} title="Settings" subtitle="How the twin looks and moves on this device. Saved in this browser." />
      <div className="grid gap-4 px-6 py-5 md:grid-cols-2 2xl:grid-cols-4">
        <Panel icon={Sparkles} title="Motion">
          <Choice<MotionPref>
            label="Motion preference"
            value={motion}
            onChange={a.setMotionPref}
            options={[
              { id: "system", label: "Match my device", hint: system ? "Your device asks for less motion" : "Follows your system setting" },
              { id: "reduce", label: "Reduced", hint: "Instant camera, still water" },
              { id: "full", label: "Full", hint: "Flowing water and swimming fish" },
            ]}
          />
        </Panel>

        <Panel icon={Gauge} title="Graphics quality">
          <Choice<Quality>
            label="Graphics quality"
            value={quality}
            onChange={a.setQuality}
            options={[
              { id: "high", label: "High", hint: "Glow, outlines, sharpest image" },
              { id: "balanced", label: "Balanced", hint: "Lighter effects, smoother on laptops" },
              { id: "low", label: "Low", hint: "No effects, for older machines" },
            ]}
          />
          <p className="mt-3 text-[12px] text-muted">Drops to Balanced on its own if the view starts to stutter.</p>
        </Panel>

        <Panel icon={MonitorPlay} title="Demo scenarios">
          <div className="grid gap-2">
            <button onClick={demo(() => a.runScenario("pump-c2"))} className="btn-glossy flex items-center gap-2.5 rounded-xl bg-crit px-3.5 py-2.5 text-left text-[13.5px] font-semibold text-white">
              <Zap aria-hidden className="size-4" /> Run pump C-2 failure
            </button>
            <button onClick={demo(() => a.runScenario("filter-f1"))} className="btn-glossy flex items-center gap-2.5 rounded-xl bg-amber-500 px-3.5 py-2.5 text-left text-[13.5px] font-semibold text-white">
              <Filter aria-hidden className="size-4" /> Run filter F-1 blockage
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={demo(() => a.loadPreset("incident"))} className="glass-btn rounded-xl px-3 py-2 text-[12.5px] font-medium text-ink">
                Jump to pump fault
              </button>
              <button onClick={demo(() => a.loadPreset("filter"))} className="glass-btn rounded-xl px-3 py-2 text-[12.5px] font-medium text-ink">
                Jump to filter clog
              </button>
            </div>
            <button onClick={() => a.openDialog({ resetConfirm: true })} className="glass-btn flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-medium text-crit">
              <RotateCcw aria-hidden className="size-3.5" /> Reset to normal
            </button>
          </div>
          <label className="mt-4 flex items-start gap-2.5 text-[13px]">
            <input type="checkbox" checked={autoFF} onChange={(e) => a.setAutoFastForward(e.target.checked)} className="mt-0.5 size-4 accent-brand" />
            <span>
              <span className="font-medium text-ink">Speed through the slow parts</span>
              <span className="block text-[12px] text-muted">Plays pump start-ups and settling at 20×, then back to normal.</span>
            </span>
          </label>
        </Panel>

        <Panel icon={Keyboard} title="Keyboard shortcuts">
          <ul className="grid gap-2 text-[13px]">
            {[
              ["1", "Public view"],
              ["2", "Operations view"],
              ["T", "Text view"],
              ["R", "Reset camera"],
              ["F", "Focus selection"],
              ["Esc", "Clear selection"],
              ["Space", "Pause / play"],
              ["H", "Shift handover"],
            ].map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-3">
                <span className="text-ink-2">{v}</span>
                <Kbd>{k}</Kbd>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
