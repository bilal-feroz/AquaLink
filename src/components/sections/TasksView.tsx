"use client";

import { ArrowRight, ClipboardCheck, FileText, Filter, Zap } from "lucide-react";
import { useState } from "react";
import { TECHNICIANS } from "@/lib/data/facility";
import { cls } from "@/lib/format";
import type { TaskStatus } from "@/lib/workflow/types";
import { useAppStore } from "@/store/useAppStore";
import { TaskCard } from "@/components/operations/TaskCard";
import { Button, EmptyState, PageHeader } from "@/components/ui/primitives";

const COLUMNS: { id: TaskStatus | "active"; label: string; statuses: TaskStatus[]; dot: string }[] = [
  { id: "open", label: "To do", statuses: ["open", "blocked"], dot: "bg-slate-400" },
  { id: "in-progress", label: "In progress", statuses: ["in-progress"], dot: "bg-brand" },
  { id: "done", label: "Done", statuses: ["done"], dot: "bg-ok" },
];

export function TasksView() {
  const tasks = useAppStore((s) => s.tasks);
  const a = useAppStore.getState();
  const [assignee, setAssignee] = useState("all");
  const filtered = tasks.filter((t) => assignee === "all" || (assignee === "none" ? !t.assigneeId : t.assigneeId === assignee));
  const next = [...tasks].filter((t) => t.status !== "done").sort((x, y) => x.priority - y.priority)[0];
  const subtitle = "Step-by-step checklists created for each incident. Assign them, tick off steps, add notes.";

  if (tasks.length === 0)
    return (
      <div className="flex h-full flex-col">
        <PageHeader icon={ClipboardCheck} title="Tasks" subtitle={subtitle} />
        <div className="grid flex-1 place-items-center">
          <EmptyState icon={ClipboardCheck} title="Nothing to do">
            <p>Tasks appear as soon as an incident opens. Run a demo failure to see them.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button variant="danger" icon={Zap} onClick={() => (a.setSection("facility"), a.runScenario("pump-c2"))}>
                Run pump failure
              </Button>
              <Button icon={Filter} onClick={() => (a.setSection("facility"), a.runScenario("filter-f1"))}>
                Run filter blockage
              </Button>
            </div>
          </EmptyState>
        </div>
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={ClipboardCheck}
        title="Tasks"
        subtitle={subtitle}
        actions={
          <>
            <label className="flex items-center gap-2 text-[12.5px] text-muted">
              Show
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="glass-btn h-9 rounded-xl px-2.5 text-[13px] text-ink">
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
              Shift handover
            </Button>
          </>
        }
      >
        {next && (
          <p className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-50 to-cyan-50/70 px-3 py-2 text-[13px] ring-1 ring-sky-100">
            <ArrowRight aria-hidden className="size-4 text-brand" />
            <span className="font-semibold text-brand">Next up:</span> <span className="text-ink">{next.title}</span>
          </p>
        )}
      </PageHeader>
      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-3">
        {COLUMNS.map((c) => {
          const list = filtered.filter((t) => c.statuses.includes(t.status)).sort((x, y) => x.priority - y.priority);
          return (
            <section key={c.id} aria-labelledby={`col-${c.id}`} className="flex min-h-0 flex-col rounded-2xl bg-white/35 ring-1 ring-white/80">
              <h2 id={`col-${c.id}`} className="flex items-center justify-between px-4 pt-3.5 pb-2 text-[13.5px] font-semibold text-ink">
                <span className="flex items-center gap-2">
                  <span aria-hidden className={cls("size-2 rounded-full", c.dot)} />
                  {c.label}
                </span>
                <span className="glass-tile rounded-full px-2 text-[11.5px] text-muted">{list.length}</span>
              </h2>
              <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
                {list.map((t) => (
                  <TaskCard key={t.id} task={t} showIncident />
                ))}
                {list.length === 0 && <p className="px-1 py-6 text-center text-[12.5px] text-subtle">Nothing here yet.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
