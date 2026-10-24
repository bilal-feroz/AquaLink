"use client";

import dynamic from "next/dynamic";
import { Droplets, Filter as FilterIcon, Gauge, GitBranch, Radio } from "lucide-react";
import { habitatImage } from "@/lib/data/facility";
import { cls } from "@/lib/format";
import { ASSET_BY_ID, TANK_BY_ID } from "@/lib/topology/graph";

// The equipment preview pulls in three.js; load it only when an asset needs it.
const ModelPreview = dynamic(() => import("./ModelPreview"), { ssr: false });

export function AssetPreview({ id, className }: { id: string; className?: string }) {
  const a = ASSET_BY_ID[id];
  const box = cls("relative overflow-hidden rounded-xl border border-line bg-slate-100", className);
  if (!a) return null;
  if (a.kind === "tank") {
    const t = TANK_BY_ID[id];
    return (
      <div className={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={habitatImage(id)} alt={`Rendered view of ${t.name}, ${t.habitat.name}`} decoding="async" className="h-full w-full object-cover" style={{ background: `linear-gradient(180deg, ${t.habitat.waterTint.shallow}, ${t.habitat.waterTint.deep})` }} />
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">Twin render</span>
      </div>
    );
  }
  if (a.kind === "pump" || a.kind === "filter" || a.kind === "valve") {
    return (
      <div className={box} aria-label={`3D model preview of ${a.name}`} role="img">
        <ModelPreview id={id} />
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">3D model</span>
      </div>
    );
  }
  const Icon = a.kind === "sensor" ? Radio : a.kind === "pipe" ? GitBranch : a.kind === "junction" ? Gauge : a.kind === "filter" ? FilterIcon : Droplets;
  return (
    <div className={cls(box, "grid place-items-center text-muted")}>
      <Icon aria-hidden className="size-9" strokeWidth={1.4} />
    </div>
  );
}
