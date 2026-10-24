"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { SceneLabels } from "@/components/scene/SceneLabels";
import { useAppStore } from "@/store/useAppStore";
import { SceneLoader } from "./SceneLoader";
import { TextView } from "./TextView";
import { FloorSelector, FlowLegend, FollowBadge, IncidentTimelineOverlay, ModeSwitcher, ViewerButtons, ViewerControls } from "./ViewerOverlays";

const FacilityCanvas = dynamic(() => import("@/components/scene/FacilityCanvas"), {
  ssr: false,
  loading: () => <SceneLoader step="Loading the 3D engine…" />,
});

export function Viewer({ active }: { active: boolean }) {
  const mode = useAppStore((s) => s.mode);
  const textView = useAppStore((s) => s.textView);
  const webglFailed = useAppStore((s) => s.webglFailed);
  const setWebglFailed = useAppStore((s) => s.setWebglFailed);
  const hasIncident = useAppStore((s) => s.sim.incidents.length > 0);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    import("@/components/scene/FacilityCanvas").then((m) => {
      const ok = m.webglAvailable();
      setSupported(ok);
      if (!ok) setWebglFailed(true);
    });
  }, [setWebglFailed]);

  const showText = textView || webglFailed;
  const operations = mode === "operations";

  return (
    <div
      id="viewer"
      className="relative h-full min-h-0 w-full overflow-hidden rounded-[20px] bg-scene shadow-[0_1px_2px_rgba(16,24,40,0.08),0_12px_32px_rgba(16,24,40,0.14)] ring-1 ring-black/5"
      aria-label="3D facility viewer"
    >
      {supported && !webglFailed && <FacilityCanvas active={active && !textView} />}
      {supported === null && <SceneLoader step="Loading the 3D engine…" />}
      {!showText && supported && <SceneLabels />}
      {showText && <TextView reason={webglFailed ? "3D rendering is unavailable on this device (WebGL could not start). All facility information is shown as text instead." : undefined} />}

      {/* Overlays */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto flex flex-col items-start gap-2">
            <ModeSwitcher />
            <FollowBadge />
          </div>
          <div className="pointer-events-auto">
            <ViewerButtons />
          </div>
        </div>
        {!showText && (
          <div className="flex flex-col gap-3">
            {operations && hasIncident && (
              <div className="max-w-[min(360px,calc(100%-210px))]">
                <IncidentTimelineOverlay />
              </div>
            )}
            <div className="flex items-end justify-between gap-3">
              <div className="pointer-events-auto shrink-0">
                <ViewerControls />
              </div>
              {operations && (
                <div className="pointer-events-auto hidden min-w-0 flex-1 justify-center lg:flex">
                  <FlowLegend />
                </div>
              )}
              <div className="pointer-events-auto shrink-0">
                <FloorSelector />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
