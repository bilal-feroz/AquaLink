"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Selection } from "@react-three/postprocessing";
import { Droplets, Filter as FilterIcon, Gauge, GitBranch, Radio } from "lucide-react";
import { useRef } from "react";
import * as THREE from "three";
import { Filter, Pump, Valve } from "@/components/scene/Equipment";
import { cls } from "@/lib/format";
import { ASSET_BY_ID, FILTER_BY_ID, PUMP_BY_ID, TANK_BY_ID, VALVE_BY_ID } from "@/lib/topology/graph";
import { useAppStore } from "@/store/useAppStore";

function Spin({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.35;
  });
  return <group ref={ref}>{children}</group>;
}

/** Live 3D model preview of a piece of equipment, rendered from the same component as the scene. */
function ModelPreview({ id }: { id: string }) {
  const pump = PUMP_BY_ID[id];
  const filter = FILTER_BY_ID[id];
  const valve = VALVE_BY_ID[id];
  const cam: [number, number, number] = pump ? [3.4, 2.6, 4.2] : filter ? [4, 3.2, 5.2] : [1.6, 1.2, 2];
  const target = pump ? 0.9 : filter ? 1.7 : 0;
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: cam, fov: 38 }} onCreated={({ camera }) => camera.lookAt(0, target, 0)} gl={{ antialias: true }}>
      <color attach="background" args={["#e9eef4"]} />
      <hemisphereLight args={["#ffffff", "#8a96a6", 1.4]} />
      <directionalLight position={[4, 6, 5]} intensity={1.6} />
      <Selection>
        <Spin>
          {pump && <Pump cfg={{ ...pump, position: [0, 0, 0] }} selected={false} />}
          {filter && <Filter cfg={{ ...filter, position: [0, 0, 0] }} selected={false} />}
          {valve && <Valve cfg={{ ...valve, position: [0, 0, 0] }} selected={false} />}
        </Spin>
      </Selection>
    </Canvas>
  );
}

export function AssetPreview({ id, className }: { id: string; className?: string }) {
  const a = ASSET_BY_ID[id];
  const capture = useAppStore((s) => s.captures[id]);
  const box = cls("relative overflow-hidden rounded-xl border border-line bg-slate-100", className);
  if (!a) return null;
  if (a.kind === "tank") {
    const t = TANK_BY_ID[id];
    return (
      <div className={box}>
        {capture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capture} alt={`Rendered view of ${t.name}, ${t.habitat.name}`} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full" style={{ background: `linear-gradient(180deg, ${t.habitat.waterTint.shallow}, ${t.habitat.waterTint.deep})` }} />
        )}
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
