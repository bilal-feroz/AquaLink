"use client";

import { Select } from "@react-three/postprocessing";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FILTERS, JUNCTIONS, PUMPS, SENSORS, VALVES } from "@/lib/data/facility";
import { TONE_HEX, pumpStatusInfo, tankStatusInfo, type Tone } from "@/lib/status";
import type { FilterConfig, PumpConfig, SensorConfig, ValveConfig } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { sceneFx } from "./sceneFx";

const SHARED = {
  galv: new THREE.MeshStandardMaterial({ color: "#8a929b", metalness: 0.7, roughness: 0.45 }),
  cast: new THREE.MeshStandardMaterial({ color: "#3a434e", metalness: 0.55, roughness: 0.5 }),
  steel: new THREE.MeshStandardMaterial({ color: "#b8c0c9", metalness: 0.85, roughness: 0.28 }),
  yellow: new THREE.MeshStandardMaterial({ color: "#e0ad1c", metalness: 0.2, roughness: 0.5 }),
  dark: new THREE.MeshStandardMaterial({ color: "#20252c", metalness: 0.4, roughness: 0.6 }),
  vessel: new THREE.MeshStandardMaterial({ color: "#aeb9c4", metalness: 0.35, roughness: 0.42 }),
  actuator: new THREE.MeshStandardMaterial({ color: "#2f6fb8", metalness: 0.3, roughness: 0.5 }),
  actuatorAuto: new THREE.MeshStandardMaterial({ color: "#d9781e", metalness: 0.3, roughness: 0.5 }),
  sensorBody: new THREE.MeshStandardMaterial({ color: "#d7dde3", metalness: 0.4, roughness: 0.4 }),
};

function useStatusMaterial(base: string, metal = 0.45, rough = 0.42) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color: base, metalness: metal, roughness: rough, emissive: new THREE.Color("#000000") }), [base, metal, rough]);
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

function useBeacon() {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#22c55e"), emissiveIntensity: 2.5 }), []);
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

const tmpColor = new THREE.Color();

/** Ease emissive towards a status colour; red tones pulse. */
function driveStatus(mats: THREE.MeshStandardMaterial[], beacon: THREE.MeshStandardMaterial, tone: Tone, strength: number, dt: number) {
  const k = 1 - Math.exp(-dt * 5);
  const pulse = tone === "crit" ? 0.45 + 0.55 * sceneFx.pulse : 1;
  tmpColor.set(TONE_HEX[tone]);
  for (const m of mats) {
    m.emissive.lerp(tmpColor, k);
    m.emissiveIntensity += (strength * pulse - m.emissiveIntensity) * k;
  }
  beacon.emissive.lerp(tmpColor, k);
  beacon.emissiveIntensity = tone === "off" ? 0.4 : 2.6 * pulse;
}

export function Pump({ cfg, selected }: { cfg: PumpConfig; selected: boolean }) {
  const p = useAppStore((s) => s.sim.pumps[cfg.id]);
  const info = pumpStatusInfo(p);
  const motor = useStatusMaterial("#2e5b86");
  const volute = useStatusMaterial("#39424d", 0.55, 0.5);
  const beacon = useBeacon();
  const fanRef = useRef<THREE.Mesh>(null);
  const s = cfg.suctionSide;

  useFrame((_, dt) => {
    const strength = info.tone === "crit" ? 0.85 : info.tone === "backup" ? 0.32 : info.tone === "ok" ? 0.04 : 0;
    driveStatus([motor, volute], beacon, info.tone, strength * (1 - sceneFx.incident * 0) , dt);
    if (fanRef.current) fanRef.current.rotation.x += dt * 40 * p.output * sceneFx.motion;
  });

  const fins = useMemo(() => Array.from({ length: 9 }, (_, i) => -s * (0.2 + i * 0.13)), [s]);

  return (
    <Select enabled={selected}>
      <group position={cfg.position}>
        <mesh material={SHARED.galv} position={[0, 0.11, 0]}>
          <boxGeometry args={[3.5, 0.22, 1.3]} />
        </mesh>
        {/* Motor with cooling fins and fan cowl */}
        <mesh material={motor} position={[-s * 0.85, 0.86, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.47, 0.47, 1.4, 28]} />
        </mesh>
        {fins.map((x, i) => (
          <mesh key={i} material={motor} position={[x - s * 0.05, 0.86, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.475, 0.025, 6, 28]} />
          </mesh>
        ))}
        <mesh material={SHARED.dark} position={[-s * 1.66, 0.86, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.5, 0.46, 0.28, 28]} />
        </mesh>
        <mesh ref={fanRef} material={SHARED.steel} position={[-s * 1.81, 0.86, 0]}>
          <boxGeometry args={[0.02, 0.62, 0.08]} />
        </mesh>
        <mesh material={motor} position={[-s * 0.75, 1.44, 0.12]}>
          <boxGeometry args={[0.38, 0.28, 0.36]} />
        </mesh>
        {[-0.35, 0.35].map((z) => (
          <mesh key={z} material={SHARED.cast} position={[-s * 0.85, 0.32, z]}>
            <boxGeometry args={[1.1, 0.22, 0.18]} />
          </mesh>
        ))}
        {/* Coupling guard and bearing frame */}
        <mesh material={SHARED.yellow} position={[s * 0.12, 0.86, 0]}>
          <boxGeometry args={[0.46, 0.44, 0.52]} />
        </mesh>
        <mesh material={SHARED.cast} position={[s * 0.52, 0.86, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.24, 0.42, 18]} />
        </mesh>
        <mesh material={SHARED.cast} position={[s * 0.52, 0.42, 0]}>
          <boxGeometry args={[0.36, 0.42, 0.5]} />
        </mesh>
        {/* Volute casing */}
        <mesh material={volute} position={[s * 0.95, 0.86, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.6, 0.6, 0.48, 32]} />
        </mesh>
        <mesh material={volute} position={[s * 0.95, 0.86, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.52, 0.14, 12, 32, Math.PI * 1.5]} />
        </mesh>
        {/* Suction nozzle (axial) and discharge nozzle (vertical) */}
        <mesh material={volute} position={[s * 1.38, 0.86, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.26, 0.42, 20]} />
        </mesh>
        <mesh material={SHARED.steel} position={[s * 1.58, 0.86, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.32, 0.32, 0.06, 24]} />
        </mesh>
        <mesh material={volute} position={[s * 0.95, 1.62, 0]}>
          <cylinderGeometry args={[0.18, 0.24, 0.5, 20]} />
        </mesh>
        <mesh material={SHARED.steel} position={[s * 0.95, 1.88, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.06, 24]} />
        </mesh>
        {/* Status beacon */}
        <mesh material={SHARED.dark} position={[-s * 0.75, 1.66, 0.12]}>
          <cylinderGeometry args={[0.06, 0.06, 0.18, 12]} />
        </mesh>
        <mesh material={beacon} position={[-s * 0.75, 1.82, 0.12]}>
          <sphereGeometry args={[0.085, 16, 12]} />
        </mesh>
      </group>
    </Select>
  );
}

export function Filter({ cfg, selected }: { cfg: FilterConfig; selected: boolean }) {
  const flow = useAppStore((s) => s.sim.nodeFlow[cfg.id] ?? 0);
  const body = useStatusMaterial("#aab6c2", 0.35, 0.4);
  const beacon = useBeacon();
  const h = cfg.height - cfg.radius * 0.6;
  useFrame((_, dt) => driveStatus([body], beacon, flow > 1 ? "ok" : "off", 0, dt));
  return (
    <Select enabled={selected}>
      <group position={cfg.position}>
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          return (
            <mesh key={i} material={SHARED.galv} position={[Math.cos(a) * cfg.radius * 0.75, 0.3, Math.sin(a) * cfg.radius * 0.75]}>
              <cylinderGeometry args={[0.06, 0.06, 0.6, 8]} />
            </mesh>
          );
        })}
        <mesh material={body} position={[0, 0.6 + h / 2, 0]}>
          <cylinderGeometry args={[cfg.radius, cfg.radius, h, 36]} />
        </mesh>
        <mesh material={body} position={[0, 0.6 + h, 0]} scale={[1, 0.45, 1]}>
          <sphereGeometry args={[cfg.radius, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh material={body} position={[0, 0.6, 0]} scale={[1, 0.35, 1]} rotation={[Math.PI, 0, 0]}>
          <sphereGeometry args={[cfg.radius, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        {[0.9, 0.6 + h - 0.2].map((y) => (
          <mesh key={y} material={SHARED.steel} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[cfg.radius + 0.01, 0.035, 6, 36]} />
          </mesh>
        ))}
        {/* Outlet nozzle towards +Z and gauge */}
        <mesh material={SHARED.steel} position={[0, 0.85, cfg.radius + 0.12]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.3, 16]} />
        </mesh>
        <mesh material={SHARED.dark} position={[cfg.radius + 0.08, 1.6, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.13, 0.13, 0.08, 16]} />
        </mesh>
        <mesh material={beacon} position={[0, 0.6 + h + cfg.radius * 0.45 + 0.08, 0]}>
          <sphereGeometry args={[0.07, 12, 10]} />
        </mesh>
      </group>
    </Select>
  );
}

const AXIS_ROT: Record<ValveConfig["axis"], [number, number, number]> = {
  x: [0, 0, Math.PI / 2],
  y: [0, 0, 0],
  z: [Math.PI / 2, 0, 0],
};

export function Valve({ cfg, selected }: { cfg: ValveConfig; selected: boolean }) {
  const open = useAppStore((s) => s.sim.valves[cfg.id]?.open ?? 0);
  const r = 0.07 + (cfg.diameter / 1000) * 0.62;
  const indicator = useMemo(() => new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#22c55e"), emissiveIntensity: 2 }), []);
  useEffect(() => () => indicator.dispose(), [indicator]);
  useEffect(() => {
    indicator.emissive.set(open > 0.5 ? "#22c55e" : "#94a3b8");
    indicator.emissiveIntensity = open > 0.5 ? 2 : 0.6;
  }, [open, indicator]);
  // Actuator sits perpendicular to the pipe: on top for horizontal pipes, on the side for risers.
  const actPos: [number, number, number] = cfg.axis === "y" ? [r + 0.22, 0, 0] : [0, r + 0.2, 0];
  const actRot: [number, number, number] = cfg.axis === "y" ? [0, 0, Math.PI / 2] : [0, 0, 0];
  return (
    <Select enabled={selected}>
      <group position={cfg.position}>
        <group rotation={AXIS_ROT[cfg.axis]}>
          <mesh material={SHARED.cast}>
            <cylinderGeometry args={[r * 1.45, r * 1.45, 0.24, 20]} />
          </mesh>
          {[-0.15, 0.15].map((y) => (
            <mesh key={y} material={SHARED.steel} position={[0, y, 0]}>
              <cylinderGeometry args={[r * 1.6, r * 1.6, 0.05, 20]} />
            </mesh>
          ))}
        </group>
        <group position={actPos} rotation={actRot}>
          <mesh material={SHARED.galv} position={[0, -0.06, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.2, 8]} />
          </mesh>
          <mesh material={cfg.type === "auto-transfer" ? SHARED.actuatorAuto : SHARED.actuator} position={[0, 0.12, 0]}>
            <boxGeometry args={[0.3, 0.22, 0.26]} />
          </mesh>
          <mesh material={indicator} position={[0, 0.25, 0]} rotation={[0, open * (Math.PI / 2), 0]}>
            <boxGeometry args={[0.16, 0.04, 0.05]} />
          </mesh>
        </group>
      </group>
    </Select>
  );
}

export function Sensor({ cfg, selected }: { cfg: SensorConfig; selected: boolean }) {
  const tone = useAppStore((s) => {
    const tank = s.sim.tanks[cfg.assetId];
    if (tank) return tankStatusInfo(tank.status).tone;
    const pump = s.sim.pumps[cfg.assetId];
    if (pump) return pumpStatusInfo(pump).tone === "crit" ? "crit" : "ok";
    return "ok";
  });
  const led = useMemo(() => new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#22c55e"), emissiveIntensity: 2.4 }), []);
  useEffect(() => () => led.dispose(), [led]);
  useFrame(() => {
    led.emissive.set(TONE_HEX[tone === "backup" ? "warn" : tone]);
    led.emissiveIntensity = tone === "crit" ? 1.5 + 1.5 * sceneFx.pulse : 2.2;
  });
  return (
    <Select enabled={selected}>
      <group position={cfg.position}>
        <mesh material={SHARED.sensorBody}>
          <cylinderGeometry args={[0.05, 0.06, 0.2, 10]} />
        </mesh>
        <mesh material={SHARED.dark} position={[0, 0.14, 0]}>
          <boxGeometry args={[0.14, 0.1, 0.12]} />
        </mesh>
        <mesh material={led} position={[0, 0.2, 0.0]}>
          <sphereGeometry args={[0.03, 10, 8]} />
        </mesh>
      </group>
    </Select>
  );
}

export function Equipment({ layers }: { layers: { pumps: boolean; filters: boolean; valves: boolean; sensors: boolean } }) {
  const selectedId = useAppStore((s) => s.selectedId);
  const hoveredId = useAppStore((s) => s.hoveredId);
  const hl = (id: string) => selectedId === id || hoveredId === id;
  return (
    <group>
      {layers.pumps && PUMPS.map((p) => <Pump key={p.id} cfg={p} selected={hl(p.id)} />)}
      {layers.filters && FILTERS.map((f) => <Filter key={f.id} cfg={f} selected={hl(f.id)} />)}
      {layers.valves && VALVES.map((v) => <Valve key={v.id} cfg={v} selected={hl(v.id)} />)}
      {layers.sensors && SENSORS.map((s) => <Sensor key={s.id} cfg={s} selected={hl(s.id)} />)}
    </group>
  );
}

export const JUNCTION_LIST = JUNCTIONS;
