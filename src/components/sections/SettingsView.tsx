"use client";

import { Filter, Gauge, Keyboard, MonitorPlay, RotateCcw, Sparkles, Zap, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cls } from "@/lib/format";
import { useAppStore, type MotionPref, type Quality } from "@/store/useAppStore";
import { Kbd } from "@/components/ui/primitives";

/** Three-way choice shown as a segmented row with a one-line hint for the current option. */
function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; hint: string }[]; onChange: (v: T) => void; label: string }) {
  const current = options.find((o) => o.id === value);
  return (
    <div>
      <div role="radiogroup" aria-label={label} className="glass-tile grid grid-cols-3 gap-1 rounded-xl p-1">
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              role="radio"
              aria-checked={on}
              title={o.hint}
              onClick={() => onChange(o.id)}
              className={cls("rounded-lg px-2 py-2 text-[13px] font-medium transition-colors", on ? "btn-glossy bg-brand text-white" : "text-ink-2 hover:bg-white/80")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {current && <p className="mt-1.5 px-1 text-[12px] text-muted">{current.hint}</p>}
    </div>
  );
}

function Group({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="border-b border-white/80 py-4 first:pt-1 last:border-0">
      <h3 className="mb-2.5 flex items-center gap-2 text-[13.5px] font-semibold text-ink">
        <Icon aria-hidden className="size-4 text-brand" /> {title}
      </h3>
      {children}
    </section>
  );
}

/** Settings live in a side panel over whatever is on screen, so changes are visible straight away. */
export function SettingsPanel() {
  const motion = useAppStore((s) => s.motionPref);
  const quality = useAppStore((s) => s.quality);
  const autoFF = useAppStore((s) => s.autoFastForward);
  const system = useAppStore((s) => s.systemReducedMotion);
  const a = useAppStore.getState();
  const demo = (fn: () => void) => () => {
    fn();
    a.setSection("facility");
    a.openDialog({ settings: false });
  };
  return (
    <div>
      <p className="mb-2 text-[12.5px] text-muted">How the twin looks and moves on this device. Saved in this browser.</p>
      <Group icon={Sparkles} title="Motion">
        <Choice<MotionPref>
          label="Motion preference"
          value={motion}
          onChange={a.setMotionPref}
          options={[
            { id: "system", label: "Auto", hint: system ? "Matches your device, which asks for less motion." : "Matches your device setting." },
            { id: "reduce", label: "Reduced", hint: "Instant camera moves and still water." },
            { id: "full", label: "Full", hint: "Flowing water, swimming fish, gliding camera." },
          ]}
        />
      </Group>

      <Group icon={Gauge} title="Graphics">
        <Choice<Quality>
          label="Graphics quality"
          value={quality}
          onChange={a.setQuality}
          options={[
            { id: "high", label: "High", hint: "Glow, outlines and the sharpest image." },
            { id: "balanced", label: "Balanced", hint: "Lighter effects, smoother on laptops. Used automatically if the view stutters." },
            { id: "low", label: "Low", hint: "No effects, for older machines." },
          ]}
        />
      </Group>

      <Group icon={MonitorPlay} title="Demo">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={demo(() => a.runScenario("pump-c2"))} className="btn-glossy flex items-center justify-center gap-2 rounded-xl bg-crit px-3 py-2.5 text-[13px] font-semibold text-white">
            <Zap aria-hidden className="size-4" /> Pump failure
          </button>
          <button onClick={demo(() => a.runScenario("filter-f1"))} className="btn-glossy flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 py-2.5 text-[13px] font-semibold text-white">
            <Filter aria-hidden className="size-4" /> Filter blockage
          </button>
          <button onClick={demo(() => a.loadPreset("incident"))} className="glass-btn rounded-xl px-3 py-2 text-[12.5px] font-medium text-ink">
            Jump to pump fault
          </button>
          <button onClick={demo(() => a.loadPreset("filter"))} className="glass-btn rounded-xl px-3 py-2 text-[12.5px] font-medium text-ink">
            Jump to filter clog
          </button>
        </div>
        <button
          onClick={() => {
            a.openDialog({ settings: false, resetConfirm: true });
          }}
          className="glass-btn mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-medium text-crit"
        >
          <RotateCcw aria-hidden className="size-3.5" /> Reset to normal
        </button>
        <label className="mt-3 flex items-start gap-2.5 text-[13px]">
          <input type="checkbox" checked={autoFF} onChange={(e) => a.setAutoFastForward(e.target.checked)} className="mt-0.5 size-4 accent-brand" />
          <span>
            <span className="font-medium text-ink">Speed through the slow parts</span>
            <span className="block text-[12px] text-muted">Plays pump start-ups and settling at 20×, then back to normal.</span>
          </span>
        </label>
      </Group>

      <Group icon={Keyboard} title="Keyboard shortcuts">
        <ul className="grid grid-cols-2 gap-x-5 gap-y-2 text-[13px]">
          {[
            ["1", "Public view"],
            ["2", "Operations"],
            ["T", "Text view"],
            ["R", "Reset camera"],
            ["F", "Focus selection"],
            ["Esc", "Clear selection"],
            ["Space", "Pause / play"],
            ["H", "Handover"],
          ].map(([k, v]) => (
            <li key={k} className="flex items-center justify-between gap-2">
              <span className="text-ink-2">{v}</span>
              <Kbd>{k}</Kbd>
            </li>
          ))}
        </ul>
      </Group>
    </div>
  );
}
