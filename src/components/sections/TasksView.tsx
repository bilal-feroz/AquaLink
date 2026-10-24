"use client";

import { ClipboardCheck, FileText } from "lucide-react";
import { useState } from "react";
import { TECHNICIANS } from "@/lib/data/facility";
import { cls } from "@/lib/format";
import type { TaskStatus } from "@/lib/workflow/types";
import { useAppStore } from "@/store/useAppStore";
import { TaskCard } from "@/components/operations/TaskCard";
import { Button, EmptyState } from "@/components/ui/primitives";

const COLUMNS: { id: TaskStatus | "active"; label: string; statuses: TaskStatus[] }[] = [
  { id: "open", label: "Open", statuses: ["open", "blocked"] },
  { id: "in-progress", label: "In progress", statuses: ["in-progress"] },
  { id: "done", label: "Done", statuses: ["done"] },
];

export function TasksView() {
  const tasks = useAppStore((s) => s.tasks);
  const a = useAppStore.getState();
  const [assignee, setAssignee] = useState("all");
  const filtered = tasks.filter((t) => assignee === "all" || (assignee === "none" ? !t.assigneeId : t.assigneeId === assignee));
  const next = [...tasks].filter((t) => t.status !== "done").sort((x, y) => x.priority - y.priority)[0];

  if (tasks.length === 0)
    return (
      <div className="grid h-full place-items-center">
        <EmptyState icon={ClipboardCheck} title="No maintenance tasks">
          Recommended tasks are generated when an incident opens. Simulate the C-2 failure to see the incident-to-action workflow.
        </EmptyState>
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-6 pt-5 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Maintenance tasks</h1>
          <p className="mt-1 text-[13px] text-muted">Prioritized decision-support checklists. They do not authorise remote operation of life-support equipment.</p>
          {next && (
            <p className="mt-2 text-[13px]">
              <span className="font-semibold text-brand">Next action:</span> <span className="text-ink">{next.title}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            Assignee
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2 text-[13px] text-ink">
              <option value="all">Everyone</option>
              <option value="none">Unassigned</option>
              {TECHNICIANS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <Button variant="primary" icon={FileText} onClick={() => a.openDialog({ handover: true })}>
            Prepare handover
          </Button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-3">
        {COLUMNS.map((c) => {
          const list = filtered.filter((t) => c.statuses.includes(t.status)).sort((x, y) => x.priority - y.priority);
          return (
            <section key={c.id} aria-labelledby={`col-${c.id}`} className="flex min-h-0 flex-col rounded-xl bg-slate-50">
              <h2 id={`col-${c.id}`} className="flex items-center justify-between px-4 pt-3 pb-2 text-[13px] font-semibold">
                {c.label}
                <span className={cls("rounded-full px-2 text-[11px]", c.id === "done" ? "bg-ok-bg text-ok" : "bg-white text-muted")}>{list.length}</span>
              </h2>
              <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
                {list.map((t) => (
                  <TaskCard key={t.id} task={t} showIncident />
                ))}
                {list.length === 0 && <p className="px-1 py-4 text-center text-[12.5px] text-subtle">Nothing here.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
