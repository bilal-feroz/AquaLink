"use client";

import { useAppStore } from "@/store/useAppStore";
import { AssetDetail } from "./AssetDetail";
import { FacilityStatusPanel, IncidentModePanel, IncidentSummaryPanel, InfrastructurePanel } from "./Panels";
import { activeIncidents } from "@/lib/simulation/engine";
import { ASSET_BY_ID } from "@/lib/topology/graph";

export function RightPanel() {
  const selectedId = useAppStore((s) => s.selectedId);
  const mode = useAppStore((s) => s.mode);
  const hasIncident = useAppStore((s) => activeIncidents(s.sim).length > 0);
  let body;
  if (selectedId && ASSET_BY_ID[selectedId]) body = <AssetDetail id={selectedId} />;
  else if (mode === "public") body = <FacilityStatusPanel />;
  else if (mode === "infrastructure") body = <InfrastructurePanel />;
  else body = hasIncident ? <IncidentSummaryPanel /> : <IncidentModePanel />;
  return (
    <aside aria-label="Details" className="scroll-thin flex w-[384px] shrink-0 flex-col overflow-y-auto pb-4">
      {body}
    </aside>
  );
}
