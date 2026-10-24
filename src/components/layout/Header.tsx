"use client";

import { Bell, ChevronDown, ChevronRight, Clock3, FileText, Keyboard, Settings, Waves } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CURRENT_USER, FACILITY } from "@/lib/data/facility";
import { clock, cls, hm } from "@/lib/format";
import { activeIncidents } from "@/lib/simulation/engine";
import { useAppStore } from "@/store/useAppStore";
import { Dot } from "@/components/ui/primitives";

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-brand text-white shadow-sm">
        <Waves aria-hidden className="size-[18px]" strokeWidth={2.4} />
      </span>
      <span className="text-[19px] font-semibold tracking-tight text-ink">AquaLink</span>
    </div>
  );
}

export function Header() {
  const sim = useAppStore((s) => s.sim);
  const setMode = useAppStore((s) => s.setMode);
  const setSection = useAppStore((s) => s.setSection);
  const openDialog = useAppStore((s) => s.openDialog);
  const fastForwarding = useAppStore((s) => s.fastForwarding);
  const playing = useAppStore((s) => s.playing);
  const active = activeIncidents(sim);
  const bell = usePopover();
  const user = usePopover();
  const [seen, setSeen] = useState(0);
  const unseen = Math.max(0, sim.events.length - seen);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-white px-4">
      <div className="flex min-w-0 items-center gap-4">
        <Logo />
        <span aria-hidden className="h-6 w-px bg-line" />
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-[13px] text-muted md:flex">
          <span className="truncate">{FACILITY.system}</span>
          <span aria-hidden className="text-subtle">/</span>
          <span className="truncate font-medium text-ink-2">{FACILITY.twin}</span>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-ink-2 lg:flex" title="Simulated scenario time">
          <Clock3 aria-hidden className="size-4 text-muted" />
          <span className="tabular font-medium">{clock(sim.t)}</span>
          <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] font-semibold tracking-wide text-muted uppercase">
            {!playing ? "Paused" : fastForwarding ? "Sim ▸▸" : "Sim"}
          </span>
        </div>

        {active.length > 0 ? (
          <button
            onClick={() => setMode("incident")}
            className="flex items-center gap-2 rounded-full bg-crit-bg py-1.5 pr-2.5 pl-1.5 text-[13px] font-medium text-crit transition-colors hover:bg-red-100"
          >
            <span className="pulse-crit grid size-5 place-items-center rounded-full bg-crit text-[11px] font-bold text-white">{active.length}</span>
            {active.length === 1 ? "1 active incident" : `${active.length} active incidents`}
            <ChevronRight aria-hidden className="size-4" />
          </button>
        ) : (
          <span className="flex items-center gap-2 rounded-full bg-ok-bg px-3 py-1.5 text-[13px] font-medium text-ok">
            <Dot tone="ok" /> All systems normal
          </span>
        )}

        <div className="relative" ref={bell.ref}>
          <button
            aria-label={`Notifications, ${unseen} new`}
            aria-expanded={bell.open}
            onClick={() => {
              bell.setOpen(!bell.open);
              setSeen(sim.events.length);
            }}
            className="relative grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-slate-100"
          >
            <Bell aria-hidden className="size-[18px]" />
            {unseen > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-crit" />}
          </button>
          {bell.open && (
            <div className="fade-in absolute right-0 z-40 mt-2 w-[360px] overflow-hidden rounded-xl border border-line bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <span className="text-sm font-semibold">Simulation events</span>
                <span className="text-[11px] text-muted">Simulated time</span>
              </div>
              <ul className="scroll-thin max-h-80 overflow-y-auto py-1">
                {sim.events.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-muted">No events yet. The facility is at baseline.</li>}
                {[...sim.events].reverse().slice(0, 20).map((e) => (
                  <li key={e.id} className="flex gap-3 px-4 py-2 text-[13px]">
                    <span className="tabular w-11 shrink-0 text-muted">{hm(e.t)}</span>
                    <span className="mt-1.5">
                      <Dot tone={e.severity === "critical" ? "crit" : e.severity === "warning" ? "warn" : e.severity === "ok" ? "ok" : "info"} />
                    </span>
                    <span className="text-ink">{e.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button aria-label="Settings" onClick={() => setSection("settings")} className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-slate-100">
          <Settings aria-hidden className="size-[18px]" />
        </button>

        <div className="relative" ref={user.ref}>
          <button aria-label="Account menu" aria-expanded={user.open} onClick={() => user.setOpen(!user.open)} className="flex items-center gap-1 rounded-full py-0.5 pr-1.5 pl-0.5 hover:bg-slate-100">
            <span className="grid size-8 place-items-center rounded-full bg-slate-200 text-[12px] font-semibold text-ink-2">{CURRENT_USER.initials}</span>
            <ChevronDown aria-hidden className={cls("size-4 text-muted transition-transform", user.open && "rotate-180")} />
          </button>
          {user.open && (
            <div className="fade-in absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-xl">
              <div className="border-b border-line px-4 py-2.5">
                <div className="text-sm font-semibold">{CURRENT_USER.name}</div>
                <div className="text-[12px] text-muted">{CURRENT_USER.role} · Day shift</div>
              </div>
              <button
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] hover:bg-slate-50"
                onClick={() => {
                  user.setOpen(false);
                  openDialog({ handover: true });
                }}
              >
                <FileText aria-hidden className="size-4 text-muted" /> Prepare shift handover
              </button>
              <button
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] hover:bg-slate-50"
                onClick={() => {
                  user.setOpen(false);
                  openDialog({ shortcuts: true });
                }}
              >
                <Keyboard aria-hidden className="size-4 text-muted" /> Keyboard shortcuts
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export { usePopover };
