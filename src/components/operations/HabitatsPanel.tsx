"use client";

import { ChevronRight, Crosshair, Fish, Waves } from "lucide-react";
import { TANKS, habitatImage } from "@/lib/data/facility";
import { cls } from "@/lib/format";
import { tankReading } from "@/lib/simulation/readings";
import { TONE_HEX, tankStatusInfo } from "@/lib/status";
import type { SpeciesKind } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

const SPECIES_DOT: Record<SpeciesKind, string> = {
  shark: "#8fa3b5",
  ray: "#c49a6c",
  school: "#c7d6e4",
  reef: "#f5cf1f",
  clownfish: "#ff7a2e",
  seahorse: "#e7b43c",
  mangrove: "#d9c08a",
};

/**
 * Habitats & marine life, organised by tank. Clicking a tank flies the camera
 * to it; clicking an animal group flies in and follows that species.
 */
export function HabitatsPanel() {
  const sim = useAppStore((s) => s.sim);
  const follow = useAppStore((s) => s.follow);
  const a = useAppStore.getState();
  const totals = TANKS.flatMap((t) => t.habitat.species).reduce((sum, s) => sum + s.count, 0);

  const goTank = (id: string) => {
    a.setFollow(null);
    a.select(id);
    window.dispatchEvent(new CustomEvent("aqualink:focus", { detail: id }));
  };
  const goSpecies = (tankId: string, species: number) => {
    a.select(tankId);
    a.setFollow({ tankId, species });
  };

  return (
    <section aria-labelledby="hab-title" className="glass rounded-2xl">
      <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
        <h3 id="hab-title" className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
          <Waves aria-hidden className="size-4 text-cyan" /> Habitats & marine life
        </h3>
        <span className="text-[11.5px] text-muted">{totals} animals · 6 habitats</span>
      </header>
      <ul className="space-y-2 px-3 pb-3">
        {TANKS.map((t) => {
          const tank = sim.tanks[t.id];
          const info = tankStatusInfo(tank.status);
          const r = tankReading(sim, t.id);
          const tone = info.tone === "ok" ? "#16a34a" : TONE_HEX[info.tone];
          return (
            <li key={t.id} className="glass-tile overflow-hidden rounded-xl">
              <button onClick={() => goTank(t.id)} className="group flex w-full items-center gap-3 p-2 text-left transition-colors hover:bg-white/70" aria-label={`Fly to ${t.name}, ${t.habitat.name}`}>
                <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={habitatImage(t.id)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" style={{ background: `linear-gradient(180deg, ${t.habitat.waterTint.shallow}, ${t.habitat.waterTint.deep})` }} />
                  <span className="absolute top-1 left-1 rounded bg-black/55 px-1 text-[9.5px] font-bold text-white">{t.code}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-ink">{t.name}</span>
                    <span className="truncate text-[12px] text-muted">· {t.habitat.name}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-[11.5px]">
                    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-px font-semibold" style={{ background: `${tone}18`, color: tone }}>
                      <span className="size-1.5 rounded-full" style={{ background: tone }} />
                      {Math.round(tank.flowPct)}% flow
                    </span>
                    <span className="tabular text-muted">
                      {r.temp.toFixed(1)}°C · pH {r.ph.toFixed(1)} · {t.floor}
                    </span>
                  </span>
                </span>
                <Crosshair aria-hidden className="size-4 shrink-0 text-subtle transition-colors group-hover:text-brand" />
              </button>
              <ul className="flex flex-wrap gap-1.5 border-t border-white/80 bg-gradient-to-b from-sky-50/50 to-cyan-50/40 px-2 py-2">
                {t.habitat.species.map((sp, i) => {
                  const on = follow?.tankId === t.id && follow.species === i;
                  return (
                    <li key={sp.label}>
                      <button
                        onClick={() => goSpecies(t.id, i)}
                        aria-pressed={on}
                        className={cls(
                          "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px] font-medium transition-colors",
                          on ? "btn-glossy border-brand bg-brand text-white" : "border-white bg-white/70 text-ink-2 shadow-[0_1px_4px_-2px_rgba(14,58,110,0.25)] hover:border-sky-200 hover:bg-white hover:text-brand",
                        )}
                        title={`Fly to and follow the ${sp.label.toLowerCase()} in ${t.name}`}
                      >
                        <span aria-hidden className="size-2 rounded-full" style={{ background: sp.look?.a ?? SPECIES_DOT[sp.kind] }} />
                        {sp.label}
                        <span className={cls("tabular", on ? "text-white/80" : "text-subtle")}>{sp.count}</span>
                        {on ? <Fish aria-hidden className="size-3" /> : <ChevronRight aria-hidden className="size-3 opacity-50" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
      <p className="px-4 pb-3 text-[11px] text-subtle">Renders and counts come from the digital twin&apos;s habitat configuration, not live cameras or animal tracking.</p>
    </section>
  );
}
