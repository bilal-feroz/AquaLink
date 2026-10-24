"use client";

import { BarChart3 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { FLOW_THRESHOLDS, PUMPS, TANKS } from "@/lib/data/facility";
import { hm } from "@/lib/format";
import type { SimSample } from "@/lib/simulation/engine";
import { facilityKpis } from "@/lib/simulation/kpi";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader, Segmented } from "@/components/ui/primitives";

const SERIES = "#2a78d6";

interface MiniChartProps {
  title: string;
  subtitle?: string;
  samples: SimSample[];
  pick: (s: SimSample) => number;
  min: number;
  max: number;
  unit: string;
  digits?: number;
  refs?: { value: number; label: string }[];
}

/** Single-series line chart with crosshair tooltip (pointer + keyboard). */
function MiniChart({ title, subtitle, samples, pick, min, max, unit, digits = 0, refs = [] }: MiniChartProps) {
  // Drawn at roughly its on-screen size so axis text stays small and crisp.
  const W = 540;
  const H = 170;
  const pad = { l: 32, r: 8, t: 10, b: 22 };
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const n = samples.length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min)) * (H - pad.t - pad.b);
  const path = samples.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pick(s)).toFixed(1)}`).join("");
  const last = n ? pick(samples[n - 1]) : 0;
  const hv = hover !== null && samples[hover] ? samples[hover] : null;
  const ticks = [min, (min + max) / 2, max];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <figure className="glass-tile rounded-2xl p-3.5">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span>
          <span id={`${id}-t`} className="block text-[13px] font-semibold text-ink">
            {title}
          </span>
          {subtitle && <span className="block text-[11px] text-muted">{subtitle}</span>}
        </span>
        <span className="tabular text-[15px] font-semibold text-ink">
          {last.toFixed(digits)}
          <span className="text-[11px] font-medium text-muted">{unit}</span>
        </span>
      </figcaption>
      <div className="relative mt-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none outline-none"
          role="img"
          aria-labelledby={`${id}-t`}
          aria-describedby={`${id}-d`}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n - 1) - 1));
            if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? 0) + 1));
            if (e.key === "Escape") setHover(null);
          }}
          onBlur={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e8ecf1" strokeWidth={1} />
              <text x={pad.l - 5} y={y(t) + 3.5} textAnchor="end" fontSize={11} fill="#5a6b84" className="tabular">
                {t % 1 === 0 ? t : t.toFixed(1)}
              </text>
            </g>
          ))}
          {refs.map((r) => (
            <g key={r.label}>
              <line x1={pad.l} x2={W - pad.r} y1={y(r.value)} y2={y(r.value)} stroke="#8494aa" strokeWidth={1} strokeDasharray="3 3" />
              <text x={pad.l + 4} y={r.value >= (min + max) / 2 ? y(r.value) + 10 : y(r.value) - 3} textAnchor="start" fontSize={10.5} fill="#5a6b84">
                {r.label}
              </text>
            </g>
          ))}
          {n > 1 && (
            <>
              <text x={pad.l} y={H - 5} fontSize={11} fill="#5a6b84" className="tabular">
                {hm(samples[0].t)}
              </text>
              <text x={W - pad.r} y={H - 5} fontSize={11} textAnchor="end" fill="#5a6b84" className="tabular">
                {hm(samples[n - 1].t)}
              </text>
            </>
          )}
          <path d={path} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hv && hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#0b1b33" strokeOpacity={0.35} strokeWidth={1} />
              <circle cx={x(hover)} cy={y(pick(hv))} r={4} fill={SERIES} stroke="#fff" strokeWidth={2} />
            </g>
          )}
        </svg>
        {hv && hover !== null && (
          <div className="glass pointer-events-none absolute top-0 rounded-lg bg-white/95 px-2.5 py-1.5 text-[12px] shadow-lg" style={{ left: `${Math.min(70, (x(hover) / W) * 100)}%` }} role="status">
            <div className="tabular font-semibold text-ink">
              {pick(hv).toFixed(digits)}
              {unit}
            </div>
            <div className="tabular text-muted">{hm(hv.t)} sim</div>
          </div>
        )}
      </div>
      <p id={`${id}-d`} className="sr-only">
        {title} from {n ? hm(samples[0].t) : ""} to {n ? hm(samples[n - 1].t) : ""}; latest {last.toFixed(digits)}
        {unit}. Use left and right arrow keys to read values.
      </p>
    </figure>
  );
}

const WINDOWS = [
  { id: 15, label: "15 min" },
  { id: 30, label: "30 min" },
  { id: 60, label: "1 hour" },
  { id: 0, label: "All" },
];

type Topic = "circulation" | "pumps" | "water" | "table";

export function AnalyticsView() {
  const sim = useAppStore((s) => s.sim);
  const [win, setWin] = useState(30);
  const [topic, setTopic] = useState<Topic>("circulation");
  const k = facilityKpis(sim);
  const samples = useMemo(() => {
    const from = win ? sim.t - win * 60 : -Infinity;
    const list = sim.history.filter((s) => s.t >= from);
    // Thin to ~240 points for drawing.
    const step = Math.max(1, Math.ceil(list.length / 240));
    return list.filter((_, i) => i % step === 0 || i === list.length - 1);
  }, [sim.history, sim.t, win]);
  const tableRows = useMemo(() => sim.history.filter((s) => (s.t - sim.startedAt) % 60 === 0 && (!win || s.t >= sim.t - win * 60)).slice(-60), [sim.history, sim.startedAt, sim.t, win]);

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <PageHeader
        icon={BarChart3}
        title="Analytics"
        subtitle="How the facility has been doing over time, recorded every few simulated seconds."
        actions={<Segmented<number> label="Time window" value={win} onChange={setWin} options={WINDOWS} />}
      />

      <div className="space-y-5 px-6 py-5">
        <section aria-label="Headline indicators" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Circulation", value: `${k.aggregateFlowDisplay}%`, note: "Average across all six tanks", tone: k.aggregateFlowDisplay >= FLOW_THRESHOLDS.healthy ? "text-ok" : "text-crit" },
            { label: "Shortfall", value: `${k.shortfallDisplay}%`, note: "Circulation missing right now", tone: k.shortfallDisplay > 0 ? "text-warn" : "text-ink" },
            { label: "Time healthy", value: `${k.availability.toFixed(1)}%`, note: `Tank time at ${FLOW_THRESHOLDS.healthy}% or more`, tone: "text-ink" },
            { label: "Water temperature", value: `${k.avgTemp.toFixed(1)} °C`, note: "Average of all tanks", tone: "text-ink" },
          ].map((s) => (
            <div key={s.label} className="glass-tile rounded-2xl p-4">
              <div className="text-[12.5px] text-muted">{s.label}</div>
              <div className={`tabular mt-1 text-[28px] leading-tight font-semibold ${s.tone}`}>{s.value}</div>
              <div className="text-[12px] text-subtle">{s.note}</div>
            </div>
          ))}
        </section>

        <Segmented<Topic>
          label="Topic"
          value={topic}
          onChange={setTopic}
          options={[
            { id: "circulation", label: "Tank circulation" },
            { id: "pumps", label: "Pumps" },
            { id: "water", label: "Oxygen" },
            { id: "table", label: "Table" },
          ]}
        />

        {topic === "circulation" && (
          <section aria-label="Tank circulation, % of design" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {TANKS.map((t, i) => (
              <MiniChart
                key={t.id}
                title={t.name}
                subtitle={t.habitat.name}
                samples={samples}
                pick={(s) => s.flows[i]}
                min={0}
                max={100}
                unit="%"
                refs={[
                  { value: FLOW_THRESHOLDS.healthy, label: "healthy" },
                  { value: FLOW_THRESHOLDS.emergencyMinimum, label: "emergency" },
                ]}
              />
            ))}
          </section>
        )}
        {topic === "pumps" && (
          <section aria-label="Pump output, % of rated capacity" className="grid gap-3 md:grid-cols-3">
            {PUMPS.map((p, i) => (
              <MiniChart key={p.id} title={p.name} subtitle={p.role === "backup" ? "Backup pump" : "Duty pump"} samples={samples} pick={(s) => s.pumps[i] * 100} min={0} max={100} unit="%" />
            ))}
          </section>
        )}
        {topic === "water" && (
          <section aria-label="Dissolved oxygen, mg/L" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {TANKS.map((t, i) => (
              <MiniChart key={t.id} title={t.name} subtitle="Dissolved oxygen" samples={samples} pick={(s) => s.dissolvedO2[i]} min={5} max={7} unit=" mg/L" digits={2} refs={[{ value: t.habitat.doMin, label: "minimum" }]} />
            ))}
          </section>
        )}
        {topic === "table" && (
          <section aria-labelledby="an-table" className="glass-tile overflow-x-auto rounded-2xl">
            <h2 id="an-table" className="px-4 pt-3 text-[14px] font-semibold">
              Circulation, one row per minute
            </h2>
            <table className="mt-2 w-full text-[13px]">
              <thead className="border-y border-white/80 bg-white/50 text-left text-[12px] text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Time</th>
                  {TANKS.map((t) => (
                    <th key={t.id} className="px-3 py-2 font-semibold">
                      {t.name}
                    </th>
                  ))}
                  {PUMPS.map((p) => (
                    <th key={p.id} className="px-3 py-2 font-semibold">
                      Pump {p.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((s) => (
                  <tr key={s.t} className="tabular border-b border-white/70 last:border-0">
                    <td className="px-4 py-1.5 font-medium">{hm(s.t)}</td>
                    {s.flows.map((f, i) => (
                      <td key={i} className="px-3 py-1.5">
                        {Math.round(f)}%
                      </td>
                    ))}
                    {s.pumps.map((p, i) => (
                      <td key={i} className="px-3 py-1.5">
                        {Math.round(p * 100)}%
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <details className="glass-tile rounded-2xl px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink">How are these worked out?</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            <li>Circulation is the water reaching a tank as a share of what it is designed to get.</li>
            <li>The facility figure is the plain average of the six tanks, e.g. (4 × 100% + 45% + 50%) ÷ 6 ≈ 83% in the pump-fault example.</li>
            <li>Shortfall is simply 100% minus that average.</li>
            <li>Everything here is simulated demonstration data.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
