"use client";

import { useAppStore } from "@/store/useAppStore";
import { ASSET_BY_ID } from "@/lib/topology/graph";
import { AssetDetail } from "./AssetDetail";
import { FacilityStatusPanel, OperationsPanel } from "./Panels";

export function RightPanel() {
  const selectedId = useAppStore((s) => s.selectedId);
  const mode = useAppStore((s) => s.mode);
  let body;
  if (selectedId && ASSET_BY_ID[selectedId]) body = <AssetDetail id={selectedId} />;
  else if (mode === "public") body = <FacilityStatusPanel />;
  else body = <OperationsPanel />;
  return (
    <aside aria-label="Details" className="scroll-thin flex w-[392px] shrink-0 flex-col overflow-y-auto pb-4">
      {body}
    </aside>
  );
}
