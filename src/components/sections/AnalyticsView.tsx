"use client";

import { useId, useMemo, useState } from "react";
import { FLOW_THRESHOLDS, PUMPS, TANKS } from "@/lib/data/facility";
import { cls, hm } from "@/lib/format";
import type { SimSample } from "@/lib/simulation/engine";
import { facilityKpis } from "@/lib/simulation/kpi";
import { useAppStore } from "@/store/useAppStore";
import { SimTag } from "@/components/ui/primitives";

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
  const W = 300;
  const H = 120;
  const pad = { l: 30, r: 8, t: 8, b: 20 };
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
    <figure className="rounded-xl border border-line bg-white p-3">
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
              <text x={pad.l - 5} y={y(t) + 3.5} textAnchor="end" fontSize={9} fill="#5a6b84" className="tabular">
                {t % 1 === 0 ? t : t.toFixed(1)}
              </text>
            </g>
          ))}
          {refs.map((r) => (
            <g key={r.label}>
              <line x1={pad.l} x2={W - pad.r} y1={y(r.value)} y2={y(r.value)} stroke="#8494aa" strokeWidth={1} strokeDasharray="3 3" />
              <text x={pad.l + 4} y={r.value >= (min + max) / 2 ? y(r.value) + 10 : y(r.value) - 3} textAnchor="start" fontSize={8.5} fill="#5a6b84">
                {r.label}
              </text>
            </g>
          ))}
          {n > 1 && (
            <>
              <text x={pad.l} y={H - 5} fontSize={9} fill="#5a6b84" className="tabular">
                {hm(samples[0].t)}
              </text>
              <text x={W - pad.r} y={H - 5} fontSize={9} textAnchor="end" fill="#5a6b84" className="tabular">
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
          <div className="pointer-events-none absolute top-0 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] shadow-lg" style={{ left: `${Math.min(70, (x(hover) / W) * 100)}%` }} role="status">
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
  { id: 15, label: "Last 15 min" },
  { id: 30, label: "Last 30 min" },
  { id: 60, label: "Last 60 min" },
  { id: 0, label: "Since 10:00" },
];

export function AnalyticsView() {
  const sim = useAppStore((s) => s.sim);
  const [win, setWin] = useState(30);
  const [table, setTable] = useState(false);
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
      <header className="border-b border-line px-6 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <SimTag />
        </div>
        <p className="mt-1 text-[13px] text-muted">Trends recorded by the simulation every 5 simulated seconds. Every number here is computed from the same state as the 3D twin.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Time window" className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {WINDOWS.map((w) => (
              <button key={w.id} role="radio" aria-checked={win === w.id} onClick={() => setWin(w.id)} className={cls("rounded-md px-2.5 py-1 text-[12.5px] font-medium", win === w.id ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}>
                {w.label}
              </button>
            ))}
          </div>
          <button aria-pressed={table} onClick={() => setTable(!table)} className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium hover:bg-slate-50">
            {table ? "Show charts" : "Show table"}
          </button>
        </div>
      </header>

      <div className="space-y-6 px-6 py-5">
        <section aria-label="Headline indicators" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Aggregate circulation", value: `${k.aggregateFlowDisplay}%`, note: `exact ${k.aggregateFlow.toFixed(1)}% · equal-weighted mean of 6 tanks` },
            { label: "Circulation shortfall", value: `${k.shortfallDisplay}%`, note: "100 − displayed aggregate" },
            { label: "Circulation availability", value: `${k.availability.toFixed(1)}%`, note: `tank-time ≥ ${FLOW_THRESHOLDS.healthy}% since 10:00` },
            { label: "Average temperature", value: `${k.avgTemp.toFixed(1)} °C`, note: "simple mean of 6 tank readings" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-line p-4">
              <div className="text-[12px] text-muted">{s.label}</div>
              <div className="tabular mt-1 text-[26px] font-semibold text-ink">{s.value}</div>
              <div className="text-[11.5px] text-subtle">{s.note}</div>
            </div>
          ))}
        </section>

        {!table ? (
          <>
            <section aria-labelledby="an-flow">
              <h2 id="an-flow" className="mb-2 text-[14px] font-semibold">
                Tank circulation, % of design
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                      { value: FLOW_THRESHOLDS.healthy, label: "healthy 90%" },
                      { value: FLOW_THRESHOLDS.emergencyMinimum, label: "emergency 40%" },
                    ]}
                  />
                ))}
              </div>
            </section>
            <section aria-labelledby="an-pumps">
              <h2 id="an-pumps" className="mb-2 text-[14px] font-semibold">
                Pump output, % of rated capacity
              </h2>
              <div className="grid gap-3 md:grid-cols-3">
                {PUMPS.map((p, i) => (
                  <MiniChart key={p.id} title={p.name} subtitle={`rated ${p.ratedFlow} m³/h · ${p.role}`} samples={samples} pick={(s) => s.pumps[i] * 100} min={0} max={100} unit="%" />
                ))}
              </div>
            </section>
            <section aria-labelledby="an-do">
              <h2 id="an-do" className="mb-2 text-[14px] font-semibold">
                Dissolved oxygen, mg/L
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {TANKS.map((t, i) => (
                  <MiniChart key={t.id} title={t.name} samples={samples} pick={(s) => s.dissolvedO2[i]} min={5} max={7} unit=" mg/L" digits={2} refs={[{ value: t.habitat.doMin, label: `min ${t.habitat.doMin}` }]} />
                ))}
              </div>
            </section>
          </>
        ) : (
          <section aria-labelledby="an-table" className="overflow-x-auto rounded-xl border border-line">
            <h2 id="an-table" className="px-4 pt-3 text-[14px] font-semibold">
              Circulation samples (1-minute)
            </h2>
            <table className="mt-2 w-full text-[13px]">
              <thead className="border-y border-line bg-slate-50 text-left text-[12px] text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Sim time</th>
                  {TANKS.map((t) => (
                    <th key={t.id} className="px-3 py-2 font-semibold">
                      {t.name}
                    </th>
                  ))}
                  {PUMPS.map((p) => (
                    <th key={p.id} className="px-3 py-2 font-semibold">
                      {p.code} out
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((s) => (
                  <tr key={s.t} className="tabular border-b border-line last:border-0">
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

        <section aria-labelledby="an-defs" className="rounded-xl border border-line bg-slate-50 p-4 text-[12.5px] leading-relaxed text-ink-2">
          <h2 id="an-defs" className="mb-1 text-[13px] font-semibold text-ink">
            How these numbers are calculated
          </h2>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Circulation % = delivered tank inlet flow ÷ tank design flow, from the hydraulic solver.</li>
            <li>Aggregate circulation is the equal-weighted mean of the six tanks: (4 × 100% + 45% + 50%) ÷ 6 = 82.5% in the reference incident, shown as 83%.</li>
            <li>Shortfall is missing circulation (100% − aggregate), not a share of faulty equipment.</li>
            <li>Mean pH is an arithmetic mean of readings and is indicative only, because pH is logarithmic.</li>
            <li>All values are simulated demonstration data, not plant measurements.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
