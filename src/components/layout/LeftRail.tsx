"use client";

import { BarChart3, ClipboardCheck, Database, Home, Settings, TriangleAlert, type LucideIcon } from "lucide-react";
import { cls } from "@/lib/format";
import { activeIncidents } from "@/lib/simulation/engine";
import { useAppStore, type Section } from "@/store/useAppStore";

const ITEMS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "facility", label: "Facility", icon: Home },
  { id: "assets", label: "Assets", icon: Database },
  { id: "incidents", label: "Incidents", icon: TriangleAlert },
  { id: "tasks", label: "Tasks", icon: ClipboardCheck },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

export function LeftRail() {
  const section = useAppStore((s) => s.section);
  const setSection = useAppStore((s) => s.setSection);
  const incidents = useAppStore((s) => activeIncidents(s.sim).length);
  const openTasks = useAppStore((s) => s.tasks.filter((t) => t.status !== "done").length);

  const item = (it: { id: Section; label: string; icon: LucideIcon }) => {
    const active = section === it.id;
    const badge = it.id === "incidents" ? incidents : it.id === "tasks" ? openTasks : 0;
    const Icon = it.icon;
    return (
      <li key={it.id}>
        <button
          onClick={() => setSection(it.id)}
          aria-current={active ? "page" : undefined}
          className={cls(
            "relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[11.5px] font-medium transition-colors",
            active ? "bg-brand-50 text-brand" : "text-muted hover:bg-slate-100 hover:text-ink",
          )}
        >
          {active && <span aria-hidden className="absolute top-2 bottom-2 -left-2 w-[3px] rounded-r-full bg-brand" />}
          <Icon aria-hidden className="size-[21px]" strokeWidth={1.8} />
          {it.label}
          {badge > 0 && (
            <span className={cls("absolute top-1.5 right-2 min-w-4 rounded-full px-1 text-[10px] leading-4 font-bold text-white", it.id === "incidents" ? "bg-crit" : "bg-brand")}>
              {badge}
              <span className="sr-only"> {it.id === "incidents" ? "active incidents" : "open tasks"}</span>
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <nav aria-label="Main" className="flex w-[78px] shrink-0 flex-col justify-between border-r border-line bg-white px-2 py-3">
      <ul className="flex flex-col gap-1">{ITEMS.map(item)}</ul>
      <ul>{item({ id: "settings", label: "Settings", icon: Settings })}</ul>
    </nav>
  );
}
