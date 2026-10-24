"use client";

import { Check, Copy, Download, FileText, Send } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { clock } from "@/lib/format";
import { techName, workOrderText } from "@/lib/workflow/handover";
import type { HandoverReport } from "@/lib/workflow/types";
import { useAppStore } from "@/store/useAppStore";
import { Button, Dialog, Kbd } from "@/components/ui/primitives";

function download(name: string, text: string, type = "text/markdown") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

/** Small renderer for the handover markdown (headings, lists, tables, paragraphs). */
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("# ")) out.push(<h1 key={i} className="text-lg font-semibold">{inline(l.slice(2))}</h1>);
    else if (l.startsWith("## ")) out.push(<h2 key={i} className="mt-4 border-b border-line pb-1 text-[14px] font-semibold">{inline(l.slice(3))}</h2>);
    else if (l.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!/^\|[-| ]+\|$/.test(lines[i])) rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      out.push(
        <table key={`t${i}`} className="mt-2 w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              {rows[0].map((c) => (
                <th key={c} className="py-1 pr-3 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((r, ri) => (
              <tr key={ri} className="tabular border-b border-line last:border-0">
                {r.map((c, ci) => (
                  <td key={ci} className="py-1 pr-3">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    } else if (l.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
      out.push(
        <ul key={`u${i}`} className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
          {items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    } else if (l === "---") out.push(<hr key={i} className="my-3 border-line" />);
    else if (l.trim()) out.push(<p key={i} className="mt-1.5 text-[13px] text-ink-2">{inline(l)}</p>);
    i++;
  }
  return <div>{out}</div>;
}

function HandoverDialog() {
  const open = useAppStore((s) => s.dialogs.handover);
  const handovers = useAppStore((s) => s.handovers);
  const a = useAppStore.getState();
  const [report, setReport] = useState<HandoverReport | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (open) setReport(useAppStore.getState().createHandover());
    else setReport(null);
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={() => a.openDialog({ handover: false })}
      title={report ? `Shift handover ${report.id}` : "Shift handover"}
      wide
      footer={
        report && (
          <>
            <span className="mr-auto text-[12px] text-muted">
              Generated at {clock(report.createdAt)} sim · {handovers.length} handover(s) this scenario
            </span>
            <Button
              icon={copied ? Check : Copy}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(report.markdown);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                } catch {
                  a.toast("Clipboard unavailable — use Download instead.", "warn");
                }
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="primary" icon={Download} onClick={() => download(`aqualink-handover-${report.id}.md`, report.markdown)}>
              Download .md
            </Button>
          </>
        )
      }
    >
      {report && <Markdown text={report.markdown} />}
    </Dialog>
  );
}

function WorkOrderDialog() {
  const id = useAppStore((s) => s.dialogs.workOrderId);
  const wo = useAppStore((s) => s.workOrders.find((w) => w.id === id));
  const a = useAppStore.getState();
  return (
    <Dialog
      open={!!wo}
      onClose={() => a.openDialog({ workOrderId: null })}
      title={wo ? `Work order ${wo.id}` : "Work order"}
      wide
      footer={
        wo && (
          <>
            <span className="mr-auto rounded-md border border-dashed border-line-strong px-2 py-0.5 text-[11px] font-semibold text-muted uppercase">Simulated — not sent to a CMMS</span>
            <Button icon={Download} onClick={() => download(`${wo.id}.txt`, workOrderText(wo), "text/plain")}>
              Download
            </Button>
            <Button variant="primary" icon={wo.status === "issued" ? Check : Send} disabled={wo.status === "issued"} onClick={() => a.issueWorkOrder(wo.id)}>
              {wo.status === "issued" ? "Issued" : "Issue work order"}
            </Button>
          </>
        )
      }
    >
      {wo && (
        <div className="space-y-4 text-[13px]">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Status", wo.status],
              ["Priority", wo.priority],
              ["Incident", wo.incidentId],
              ["Asset", wo.assetId],
              ["Assigned to", techName(wo.assigneeId)],
              ["Raised", `${clock(wo.createdAt)} by ${wo.createdBy}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line p-2.5">
                <div className="text-[11px] text-muted">{k}</div>
                <div className="font-semibold capitalize">{v}</div>
              </div>
            ))}
          </div>
          <div>
            <h3 className="font-semibold">{wo.title}</h3>
            <p className="mt-1 text-ink-2">{wo.description}</p>
          </div>
          <div>
            <h4 className="mb-1 text-[12px] font-semibold text-muted uppercase">Requested actions</h4>
            <ol className="list-decimal space-y-0.5 pl-5">
              {wo.requestedActions.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </div>
          <div>
            <h4 className="mb-1 text-[12px] font-semibold text-muted uppercase">Context at time of issue (simulated)</h4>
            <ul className="list-disc space-y-0.5 pl-5 text-ink-2">
              {wo.context.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ResetDialog() {
  const open = useAppStore((s) => s.dialogs.resetConfirm);
  const a = useAppStore.getState();
  return (
    <Dialog
      open={open}
      onClose={() => a.openDialog({ resetConfirm: false })}
      title="Reset to healthy baseline?"
      footer={
        <>
          <Button onClick={() => a.openDialog({ resetConfirm: false })}>Cancel</Button>
          <Button variant="danger" onClick={a.resetScenario}>
            Reset scenario
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] text-ink-2">
        The simulation returns to 10:00 with every pump in normal duty. Incidents, tasks, notes, work orders and handovers recorded in this scenario are cleared so the demo starts from the same state every time.
      </p>
    </Dialog>
  );
}

function ShortcutsDialog() {
  const open = useAppStore((s) => s.dialogs.shortcuts);
  const a = useAppStore.getState();
  return (
    <Dialog open={open} onClose={() => a.openDialog({ shortcuts: false })} title="Keyboard shortcuts">
      <ul className="space-y-1.5 text-[13px]">
        {[
          ["1 / 2 / 3", "Public / Infrastructure / Incident view"],
          ["T", "Accessible text view"],
          ["R", "Reset camera"],
          ["F", "Focus selected asset"],
          ["Esc", "Clear selection"],
          ["Space", "Pause / resume simulation"],
          ["H", "Prepare shift handover"],
          ["Tab", "Move between 3D labels and controls"],
        ].map(([k, v]) => (
          <li key={k} className="flex items-center gap-3">
            <span className="w-24">
              <Kbd>{k}</Kbd>
            </span>
            {v}
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted">
        <FileText aria-hidden className="size-3.5" /> Mouse: drag to orbit, right-drag to pan, wheel to zoom, double-click an asset to focus.
      </p>
    </Dialog>
  );
}

export function Dialogs() {
  return (
    <>
      <HandoverDialog />
      <WorkOrderDialog />
      <ResetDialog />
      <ShortcutsDialog />
    </>
  );
}
