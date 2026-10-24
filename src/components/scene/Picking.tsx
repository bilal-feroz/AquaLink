"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { FILTERS, JUNCTIONS, PUMPS, SENSORS, TANKS, VALVES } from "@/lib/data/facility";
import type { Vec3 } from "@/lib/types";
import { useAppStore, type LayerState } from "@/store/useAppStore";

/**
 * Invisible interaction proxies with stable asset ids. Transparent glass and
 * thin parts are hard to hit precisely, so selection raycasts against these.
 * Proxies are only mounted for visible layers, so hidden assets never intercept
 * pointer events.
 */
export function Picking({ layers, mode }: { layers: LayerState; mode: "public" | "infrastructure" | "incident" }) {
  const select = useAppStore((s) => s.select);
  const hover = useAppStore((s) => s.hover);
  const engineering = mode !== "public";

  const handlers = (id: string) => ({
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 4) return;
      e.stopPropagation();
      select(id);
    },
    onDoubleClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      select(id);
      window.dispatchEvent(new CustomEvent("aqualink:focus", { detail: id }));
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      hover(id);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      hover(null);
      document.body.style.cursor = "";
    },
  });

  const sphere = (id: string, pos: Vec3, r: number) => (
    <mesh key={id} position={pos} {...handlers(id)} userData={{ assetId: id }}>
      <sphereGeometry args={[r, 10, 8]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );

  return (
    <group>
      {layers.tanks &&
        TANKS.map((t) => (
          <mesh key={t.id} name={`proxy-${t.id}`} position={[t.position[0], t.position[1] + (t.plinth + t.height) / 2, t.position[2]]} {...handlers(t.id)} userData={{ assetId: t.id, occluder: true }}>
            <cylinderGeometry args={[t.radius + 0.1, t.radius + 0.1, t.plinth + t.height, 24]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        ))}
      {engineering &&
        layers.pumps &&
        PUMPS.map((p) => (
          <mesh key={p.id} position={[p.position[0], p.position[1] + 1, p.position[2]]} {...handlers(p.id)} userData={{ assetId: p.id }}>
            <boxGeometry args={[3.8, 2.1, 1.5]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        ))}
      {engineering &&
        layers.filters &&
        FILTERS.map((f) => (
          <mesh key={f.id} position={[f.position[0], f.position[1] + f.height / 2 + 0.3, f.position[2]]} {...handlers(f.id)} userData={{ assetId: f.id }}>
            <cylinderGeometry args={[f.radius + 0.1, f.radius + 0.1, f.height + 0.6, 16]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        ))}
      {engineering && layers.valves && VALVES.map((v) => sphere(v.id, v.position, 0.42))}
      {engineering && layers.sensors && SENSORS.map((s) => sphere(s.id, s.position, 0.24))}
      {engineering && layers.pipes && JUNCTIONS.filter((j) => !j.manifold).map((j) => sphere(j.id, j.position, 0.36))}
    </group>
  );
}
