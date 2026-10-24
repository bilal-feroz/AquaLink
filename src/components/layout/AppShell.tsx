"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { TANKS } from "@/lib/data/facility";
import { cls } from "@/lib/format";
import type { ScenarioPreset } from "@/lib/simulation/scenario";
import { effectiveReducedMotion, useAppStore } from "@/store/useAppStore";
import { RightPanel } from "@/components/operations/RightPanel";
import { Viewer } from "@/components/viewer/Viewer";
import { Dialogs } from "@/components/dialogs/Dialogs";
import { AnalyticsView } from "@/components/sections/AnalyticsView";
import { AssetsView } from "@/components/sections/AssetsView";
import { IncidentsView } from "@/components/sections/IncidentsView";
import { SettingsView } from "@/components/sections/SettingsView";
import { TasksView } from "@/components/sections/TasksView";
import { Header } from "./Header";
import { LeftRail } from "./LeftRail";

function useBoot() {
  const hydrated = useAppStore((s) => s.hydrated);
  useEffect(() => {
    if (hydrated) return;
    void Promise.resolve(useAppStore.persist.rehydrate()).then(() => {
      const params = new URLSearchParams(window.location.search);
      const scenario = params.get("scenario");
      const st = useAppStore.getState();
      if (scenario === "incident" || scenario === "reference") st.loadPreset("incident");
      else if (scenario === "baseline" || scenario === "reset") st.loadPreset("baseline");
      else if (scenario === "onset") st.loadPreset("stabilizing" as ScenarioPreset["id"]);
      else if (scenario === "filter") st.loadPreset("filter");
      const mode = params.get("mode");
      if (mode === "public") st.setMode("public");
      else if (mode === "operations" || mode === "infrastructure" || mode === "incident") st.setMode("operations");
      const select = params.get("select");
      if (select) st.select(select);
      useAppStore.setState({ hydrated: true });
    });
  }, [hydrated]);
  return hydrated;
}

function useSimClock() {
  const tick = useAppStore((s) => s.tick);
  const last = useRef<number>(0);
  useEffect(() => {
    last.current = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1, (now - last.current) / 1000);
      last.current = now;
      tick(dt);
    }, 250);
    return () => clearInterval(id);
  }, [tick]);
}

function useReducedMotionWatcher() {
  const set = useAppStore((s) => s.setSystemReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    set(mq.matches);
    const on = () => set(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [set]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useAppStore.getState();
      const dialogOpen = s.dialogs.handover || s.dialogs.resetConfirm || s.dialogs.shortcuts || !!s.dialogs.workOrderId;
      if (dialogOpen) return;
      switch (e.key) {
        case "1":
          s.setMode("public");
          break;
        case "2":
        case "3":
          s.setMode("operations");
          break;
        case "Escape":
          if (s.selectedId) s.select(null);
          break;
        case "r":
        case "R":
          s.resetCamera();
          break;
        case "f":
        case "F":
          if (s.selectedId) window.dispatchEvent(new CustomEvent("aqualink:focus", { detail: s.selectedId }));
          break;
        case "t":
        case "T":
          s.setTextView(!s.textView);
          break;
        case " ":
          if (t === document.body) {
            e.preventDefault();
            s.togglePlaying();
          }
          break;
        case "?":
          s.openDialog({ shortcuts: true });
          break;
        case "h":
        case "H":
          s.openDialog({ handover: true });
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);
  const icon = { info: Info, ok: CheckCircle2, warn: TriangleAlert, crit: XCircle };
  const tone = { info: "text-brand", ok: "text-ok", warn: "text-warn", crit: "text-crit" };
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => {
        const Icon = icon[t.tone];
        return (
          <button key={t.id} onClick={() => dismiss(t.id)} className="glass fade-in pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-[13px] font-medium text-ink shadow-xl">
            <Icon aria-hidden className={cls("size-4", tone[t.tone])} />
            {t.text}
          </button>
        );
      })}
    </div>
  );
}

export function AppShell() {
  const hydrated = useBoot();
  useEffect(() => {
    // Read-only hook for automated scripts (acceptance tests, habitat captures).
    (window as unknown as { aqualink?: unknown }).aqualink = { store: useAppStore, tanks: TANKS };
  }, []);
  useSimClock();
  useReducedMotionWatcher();
  useShortcuts();
  const section = useAppStore((s) => s.section);
  const reduced = useAppStore(effectiveReducedMotion);
  const facility = section === "facility";

  return (
    <div className="flex h-dvh flex-col" data-reduced-motion={reduced ? "true" : "false"}>
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to main content
      </a>
      <Header />
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        <main id="main" className="relative flex min-w-0 flex-1 gap-3 p-3" aria-busy={!hydrated}>
          <div className={cls("relative min-w-0 flex-1", !facility && "invisible")} aria-hidden={!facility}>
            {hydrated && <Viewer active={facility} />}
          </div>
          {facility && hydrated && <RightPanel />}
          {!facility && (
            <div className="glass absolute inset-3 overflow-hidden rounded-2xl">
              {section === "assets" && <AssetsView />}
              {section === "incidents" && <IncidentsView />}
              {section === "tasks" && <TasksView />}
              {section === "analytics" && <AnalyticsView />}
              {section === "settings" && <SettingsView />}
            </div>
          )}
        </main>
      </div>
      <Dialogs />
      <Toasts />
    </div>
  );
}
