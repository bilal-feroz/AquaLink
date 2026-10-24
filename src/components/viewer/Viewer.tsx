"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Logo } from "@/components/layout/Header";
import { SceneLabels } from "@/components/scene/SceneLabels";
import { useAppStore } from "@/store/useAppStore";
import { TextView } from "./TextView";
import { FloorSelector, FlowLegend, IncidentTimelineOverlay, ModeSwitcher, ScenarioDock, ViewerButtons, ViewerControls } from "./ViewerOverlays";

const FacilityCanvas = dynamic(() => import("@/components/scene/FacilityCanvas"), {
  ssr: false,
  loading: () => <SceneLoading />,
});

function SceneLoading() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-scene text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="opacity-90 invert-0">
          <span className="sr-only">Loading 3D facility</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
          <span className="size-4 animate-spin rounded-full border-2 border-white/25 border-t-sky-300" />
          <span className="text-[13px] text-white/80">Building the facility twin…</span>
        </div>
      </div>
    </div>
  );
}

export function Viewer({ active }: { active: boolean }) {
  const mode = useAppStore((s) => s.mode);
  const textView = useAppStore((s) => s.textView);
  const webglFailed = useAppStore((s) => s.webglFailed);
  const setWebglFailed = useAppStore((s) => s.setWebglFailed);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    import("@/components/scene/FacilityCanvas").then((m) => {
      const ok = m.webglAvailable();
      setSupported(ok);
      if (!ok) setWebglFailed(true);
    });
  }, [setWebglFailed]);

  const showText = textView || webglFailed;
  const engineering = mode !== "public";

  return (
    <div id="viewer" className="relative h-full min-h-0 w-full overflow-hidden rounded-2xl bg-scene shadow-[0_1px_2px_rgba(16,24,40,0.06),0_8px_24px_rgba(16,24,40,0.08)]" aria-label="3D facility viewer">
      {supported && !webglFailed && <FacilityCanvas active={active && !textView} />}
      {supported === null && <SceneLoading />}
      {!showText && supported && <SceneLabels />}
      {showText && <TextView reason={webglFailed ? "3D rendering is unavailable on this device (WebGL could not start). All facility information is shown as text instead." : undefined} />}

      {/* Overlays */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto">
            <ModeSwitcher />
          </div>
          <div className="pointer-events-auto flex items-center gap-1.5">
            <ScenarioDock />
            <ViewerButtons />
          </div>
        </div>
        {!showText && (
          <div className="flex flex-col gap-3">
            {mode === "incident" && (
              <div className="max-w-[calc(100%-210px)]">
                <IncidentTimelineOverlay />
              </div>
            )}
            <div className="flex items-end justify-between gap-3">
              <div className="pointer-events-auto">
                <ViewerControls />
              </div>
              {engineering && (
                <div className="pointer-events-auto hidden lg:block">
                  <FlowLegend />
                </div>
              )}
              <div className="pointer-events-auto">
                <FloorSelector />
              </div>
            </div>
          </div>
        )}
      </div>
      <span className="sr-only">
        <Logo />
      </span>
    </div>
  );
}
