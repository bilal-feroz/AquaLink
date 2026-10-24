"use client";

import { ChevronDown, ClipboardList, FileText, MessageSquarePlus } from "lucide-react";
import { useId, useState } from "react";
import { TECHNICIANS } from "@/lib/data/facility";
import { cls, hm } from "@/lib/format";
import { assetShort } from "@/lib/topology/graph";
import { TASK_STATUS_LABEL } from "@/lib/workflow/tasks";
import type { MaintenanceTask, TaskStatus } from "@/lib/workflow/types";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/primitives";

const STATUS_STYLE: Record<TaskStatus, string> = {
  open: "bg-slate-100 text-ink-2",
  "in-progress": "bg-brand-50 text-brand-600",
  blocked: "bg-warn-bg text-warn",
  done: "bg-ok-bg text-ok",
};

export function TaskStatusPill({ status }: { status: TaskStatus }) {
  return <span className={cls("rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", STATUS_STYLE[status])}>{TASK_STATUS_LABEL[status]}</span>;
}

export function Avatar({ techId, size = 22 }: { techId?: string; size?: number }) {
  const t = TECHNICIANS.find((x) => x.id === techId);
  return (
    <span
      title={t ? t.name : "Unassigned"}
      className={cls("inline-grid shrink-0 place-items-center rounded-full text-[10px] font-semibold", t ? "bg-sky-100 text-sky-800" : "border border-dashed border-line-strong text-subtle")}
      style={{ width: size, height: size }}
    >
      {t ? t.initials : "?"}
    </span>
  );
}

export function TaskCard({ task, defaultOpen = false, showIncident = false }: { task: MaintenanceTask; defaultOpen?: boolean; showIncident?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [note, setNote] = useState("");
  const a = useAppStore.getState();
  const workOrder = useAppStore((s) => s.workOrders.find((w) => w.id === task.workOrderId));
  const uid = useId();
  const done = task.steps.filter((s) => s.done).length;

  return (
    <article className={cls("rounded-xl border bg-white transition-shadow", open ? "border-line-strong shadow-sm" : "border-line")} aria-labelledby={`${uid}-t`}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-3 px-3.5 py-3 text-left">
        <span className={cls("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold", task.status === "done" ? "bg-ok-bg text-ok" : "bg-brand-50 text-brand")}>{task.priority}</span>
        <span className="min-w-0 flex-1">
          <span id={`${uid}-t`} className={cls("block text-[13.5px] leading-snug font-medium", task.status === "done" ? "text-muted line-through decoration-1" : "text-ink")}>
            {task.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
            <TaskStatusPill status={task.status} />
            <span className="tabular">
              {done}/{task.steps.length} steps
            </span>
            {showIncident && <span>{task.incidentId}</span>}
            {task.workOrderId && <span className="font-medium text-ink-2">{task.workOrderId}</span>}
          </span>
        </span>
        <Avatar techId={task.assigneeId} />
        <ChevronDown aria-hidden className={cls("mt-1 size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-line px-3.5 py-3">
          <p className="text-[12.5px] leading-relaxed text-ink-2">{task.description}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11.5px] font-medium text-muted">
              Assignee
              <select
                value={task.assigneeId ?? ""}
                onChange={(e) => a.assignTask(task.id, e.target.value || undefined)}
                className="mt-1 block h-8 w-full rounded-lg border border-line bg-white px-2 text-[13px] text-ink"
              >
                <option value="">Unassigned</option>
                {TECHNICIANS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.role}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px] font-medium text-muted">
              Status
              <select value={task.status} onChange={(e) => a.setTaskStatus(task.id, e.target.value as TaskStatus)} className="mt-1 block h-8 w-full rounded-lg border border-line bg-white px-2 text-[13px] text-ink">
                {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset>
            <legend className="mb-1 text-[11.5px] font-medium text-muted">Checklist</legend>
            <ul className="space-y-1">
              {task.steps.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1 text-[13px] hover:bg-slate-50">
                    <input type="checkbox" checked={s.done} onChange={() => a.toggleStep(task.id, s.id)} className="mt-0.5 size-4 shrink-0 accent-brand" />
                    <span className={cls("leading-snug", s.done ? "text-muted line-through" : "text-ink")}>
                      {s.label}
                      {s.done && s.doneAt !== undefined && <span className="ml-1.5 text-[11px] text-subtle no-underline">✓ {hm(s.doneAt)}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          {task.assetIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {task.assetIds.slice(0, 6).map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    a.select(id);
                    a.setSection("facility");
                  }}
                  className="rounded-md bg-slate-100 px-2 py-0.5 text-[11.5px] font-medium text-ink-2 hover:bg-slate-200"
                >
                  {assetShort(id)}
                </button>
              ))}
            </div>
          )}

          <div>
            <div className="mb-1 text-[11.5px] font-medium text-muted">Notes</div>
            {task.notes.length === 0 && <p className="text-[12px] text-subtle">No notes yet.</p>}
            <ul className="space-y-1.5">
              {task.notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12.5px]">
                  <span className="tabular font-semibold text-ink-2">{hm(n.at)}</span> <span className="text-muted">{n.by}</span>
                  <div className="text-ink">{n.text}</div>
                </li>
              ))}
            </ul>
            <form
              className="mt-2 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                a.addTaskNote(task.id, note);
                setNote("");
              }}
            >
              <label htmlFor={`${uid}-note`} className="sr-only">
                Add a note to {task.id}
              </label>
              <input
                id={`${uid}-note`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Record an observation…"
                className="h-8 min-w-0 flex-1 rounded-lg border border-line px-2.5 text-[13px] placeholder:text-subtle"
              />
              <Button size="sm" variant="subtle" icon={MessageSquarePlus} type="submit" disabled={!note.trim()}>
                Add
              </Button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {workOrder ? (
              <Button size="sm" icon={FileText} onClick={() => a.openDialog({ workOrderId: workOrder.id })}>
                View {workOrder.id}
              </Button>
            ) : (
              <Button
                size="sm"
                icon={ClipboardList}
                onClick={() => {
                  const id = a.createWorkOrder(task.id);
                  if (id) a.openDialog({ workOrderId: id });
                }}
              >
                Create work order
              </Button>
            )}
            <span className="text-[11px] text-subtle">Simulated — not sent to a CMMS</span>
          </div>

          {task.history.length > 0 && (
            <details className="text-[12px]">
              <summary className="cursor-pointer font-medium text-muted">History ({task.history.length})</summary>
              <ul className="mt-1.5 space-y-0.5">
                {[...task.history].reverse().map((h, i) => (
                  <li key={i} className="text-ink-2">
                    <span className="tabular text-muted">{hm(h.at)}</span> {h.by}: {h.action}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </article>
  );
}
