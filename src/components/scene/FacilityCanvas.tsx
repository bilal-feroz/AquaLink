"use client";

import { Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Outline, Selection, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TANKS } from "@/lib/data/facility";
import { activeIncidents } from "@/lib/simulation/engine";
import { effectiveReducedMotion, useAppStore } from "@/store/useAppStore";
import { Architecture, PlantRoom } from "./Architecture";
import { CameraRig } from "./CameraRig";
import { Equipment } from "./Equipment";
import { FaultEffects } from "./FaultEffects";
import { updateGhosts } from "./ghost";
import { Habitat } from "./Habitat";
import { LabelProjector } from "./LabelProjector";
import { Picking } from "./Picking";
import { Pipes } from "./Pipes";
import { sceneFx } from "./sceneFx";
import { useTraceSet } from "./trace";
import { Visitors } from "./Visitors";
import { SceneLoader } from "@/components/viewer/SceneLoader";

/** Eases global scene effects towards the current mode every frame. */
function FxDriver() {
  const mode = useAppStore((s) => s.mode);
  const shell = useAppStore((s) => s.layers[s.mode].shell);
  const hasIncident = useAppStore((s) => activeIncidents(s.sim).length > 0);
  const reduced = useAppStore(effectiveReducedMotion);
  const scene = useThree((s) => s.scene);
  const bg = useMemo(() => ({ pub: new THREE.Color("#0b1220"), ops: new THREE.Color("#050a14"), cur: new THREE.Color("#0b1220") }), []);
  useFrame((state, dt) => {
    const d = Math.min(dt, 0.1);
    sceneFx.time += d;
    sceneFx.motion = reduced ? 0.12 : 1;
    sceneFx.ghostTarget = mode === "public" ? 0 : 1;
    sceneFx.incidentTarget = mode === "operations" && hasIncident ? 1 : 0;
    sceneFx.shellTarget = shell ? 1 : 0;
    const k = reduced ? 1 : 1 - Math.exp(-d * 2.4);
    sceneFx.ghost += (sceneFx.ghostTarget - sceneFx.ghost) * k;
    sceneFx.incident += (sceneFx.incidentTarget - sceneFx.incident) * k;
    sceneFx.shellVisible += (sceneFx.shellTarget - sceneFx.shellVisible) * k;
    if (Math.abs(sceneFx.ghost - sceneFx.ghostTarget) < 0.002) sceneFx.ghost = sceneFx.ghostTarget;
    sceneFx.pulse = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(sceneFx.time * 3.4);
    // Deeper, blueprint-like backdrop in Operations.
    bg.cur.copy(bg.pub).lerp(bg.ops, sceneFx.ghost);
    if (scene.background instanceof THREE.Color) scene.background.copy(bg.cur);
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(bg.cur);
    updateGhosts(state.camera, d);
  }, -1);
  return null;
}

function Lights() {
  const hemi = useRef<THREE.HemisphereLight>(null);
  return (
    <>
      <hemisphereLight ref={hemi} args={["#ffe6cc", "#1b2738", 1.05]} />
      <directionalLight position={[12, 30, 18]} intensity={1.05} color="#ffe9d2" />
      <directionalLight position={[-18, 14, 26]} intensity={0.45} color="#bcd7ff" />
      {/* Cool rim light from the back so silhouettes read against the glass */}
      <directionalLight position={[0, 12, -40]} intensity={0.55} color="#8fc8ff" />
      {/* Aquarium glow onto floors and balconies */}
      {TANKS.map((t) => (
        <pointLight
          key={t.id}
          position={[t.position[0], t.position[1] + t.plinth + Math.min(t.height, 6) * 0.55, t.position[2]]}
          color={t.habitat.waterTint.shallow}
          intensity={t.id === "TNK-A" ? 170 : 40}
          distance={t.id === "TNK-A" ? 28 : 13}
          decay={1.6}
        />
      ))}
      {/* Warm gallery light */}
      <pointLight position={[0, 16.5, 8]} color="#ffd2a0" intensity={110} distance={42} decay={1.4} />
      <pointLight position={[-16, 10.5, -10]} color="#ffcc99" intensity={48} distance={20} decay={1.5} />
      <pointLight position={[16, 10.5, -10]} color="#ffcc99" intensity={48} distance={20} decay={1.5} />
      {/* Plant hall work lighting */}
      <pointLight position={[-10, 7.5, -26]} color="#e6f0ff" intensity={70} distance={26} decay={1.3} />
      <pointLight position={[10, 7.5, -26]} color="#e6f0ff" intensity={70} distance={26} decay={1.3} />
    </>
  );
}

function SceneEnvironment() {
  return (
    <Environment resolution={128} frames={1} background={false}>
      <Lightformer form="rect" intensity={2.4} color="#ffd9a8" position={[0, 8, -16]} scale={[40, 6, 1]} />
      <Lightformer form="rect" intensity={1.6} color="#9fd8ff" position={[0, 18, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
      <Lightformer form="rect" intensity={1.2} color="#ffc996" position={[-24, 6, 0]} rotation-y={Math.PI / 2} scale={[30, 4, 1]} />
      <Lightformer form="rect" intensity={1.2} color="#ffc996" position={[24, 6, 0]} rotation-y={-Math.PI / 2} scale={[30, 4, 1]} />
      <Lightformer form="ring" intensity={2} color="#5cc8ff" position={[0, 6, -3]} scale={6} />
    </Environment>
  );
}

function Habitats() {
  const sim = useAppStore((s) => s.sim);
  const mode = useAppStore((s) => s.mode);
  const selectedId = useAppStore((s) => s.selectedId);
  const hoveredId = useAppStore((s) => s.hoveredId);
  const layers = useAppStore((s) => s.layers[s.mode]);
  const trace = useTraceSet();
  const incident = activeIncidents(sim)[0];
  if (!layers.tanks) return null;
  return (
    <>
      {TANKS.map((t) => {
        const status = sim.tanks[t.id].status;
        const emphasis = status === "healthy" ? "none" : status === "degraded" ? "warn" : "crit";
        const dim = mode === "operations" && incident ? (trace.nodes.has(t.id) ? 0 : 0.5) : trace.active && !trace.nodes.has(t.id) ? 0.35 : 0;
        return (
          <Habitat key={t.id} t={t} status={status} selected={selectedId === t.id} hovered={hoveredId === t.id} dim={dim} showMarine={layers.marine} emphasis={emphasis} />
        );
      })}
    </>
  );
}

/** The plant hall, its equipment and the pipe network: one physical system in every view. */
function Engineering() {
  const mode = useAppStore((s) => s.mode);
  const layers = useAppStore((s) => s.layers[s.mode]);
  const hasIncident = useAppStore((s) => activeIncidents(s.sim).length > 0);
  const trace = useTraceSet();
  return (
    <group>
      <PlantRoom />
      <Equipment layers={{ pumps: layers.pumps, filters: layers.filters, valves: layers.valves, sensors: layers.sensors }} />
      {layers.pipes && <Pipes showFlow={layers.flow} trace={trace} interactive={mode !== "public"} incidentMode={mode === "operations" && hasIncident} />}
    </group>
  );
}

function Effects() {
  const quality = useAppStore((s) => s.quality);
  if (quality === "low") return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false} autoClear={false}>
      <Outline blur edgeStrength={4} visibleEdgeColor={0x7cc4ff} hiddenEdgeColor={0x2a5f8f} width={1200} />
      <Bloom mipmapBlur intensity={quality === "high" ? 0.75 : 0.5} luminanceThreshold={0.74} luminanceSmoothing={0.22} />
      <Vignette eskil={false} offset={0.22} darkness={0.5} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}

/**
 * Compiles every scene shader before the first frame. With
 * KHR_parallel_shader_compile the driver compiles them on worker threads, so the
 * page stays responsive while the loader is up. Programs are compiled for the
 * pipeline actually used: into the post-processing buffer (linear, no tone
 * mapping), or straight to screen at Low quality.
 */
function Precompile({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let live = true;
    const finish = () => {
      if (!live) return;
      live = false;
      onReady();
    };
    const target = useAppStore.getState().quality === "low" ? null : new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(target);
    const compiled = gl.compileAsync(scene, camera).catch(() => undefined);
    gl.setRenderTarget(prev);
    void compiled.then(() => {
      target?.dispose();
      finish();
    });
    // Never hold the scene back if a driver does not report completion.
    const safety = setTimeout(finish, 20000);
    return () => {
      live = false;
      clearTimeout(safety);
    };
  }, [gl, scene, camera, onReady]);
  return null;
}

/** Reports once a few real frames have been drawn, so the loader can fade out. */
function FirstFrames({ onShown }: { onShown: () => void }) {
  const n = useRef(0);
  useFrame(() => {
    n.current++;
    if (n.current === 3) onShown();
  });
  return null;
}

function SceneContents() {
  const layers = useAppStore((s) => s.layers[s.mode]);
  const mode = useAppStore((s) => s.mode);
  return (
    <>
      <color attach="background" args={["#0b1220"]} />
      <fog attach="fog" args={["#0b1220", 80, 170]} />
      <FxDriver />
      <Lights />
      <SceneEnvironment />
      <Selection>
        <Architecture />
        <Habitats />
        <Visitors visible={layers.visitors} />
        <Engineering />
        <Picking layers={layers} mode={mode} />
        <FaultEffects />
        <Effects />
      </Selection>
      <CameraRig />
      <LabelProjector />
    </>
  );
}

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGL2RenderingContext && c.getContext("webgl2"));
  } catch {
    return false;
  }
}

export default function FacilityCanvas({ active }: { active: boolean }) {
  const quality = useAppStore((s) => s.quality);
  const setQuality = useAppStore((s) => s.setQuality);
  const setWebglFailed = useAppStore((s) => s.setWebglFailed);
  const select = useAppStore((s) => s.select);
  const down = useRef<{ x: number; y: number } | null>(null);
  const dpr = useMemo<[number, number]>(() => (quality === "high" ? [1, 1.75] : quality === "balanced" ? [1, 1.25] : [0.75, 1]), [quality]);
  const [compiled, setCompiled] = useState(false);
  const [shown, setShown] = useState(false);
  const onCompiled = useCallback(() => setCompiled(true), []);
  const onShown = useCallback(() => setShown(true), []);

  return (
    <div
      className="absolute inset-0"
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY };
      }}
    >
      <Canvas
        dpr={dpr}
        frameloop={active && compiled ? "always" : "never"}
        camera={{ fov: 42, near: 0.3, far: 400, position: [0, 7.4, 35] }}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: false, stencil: false }}
        onCreated={({ gl, scene, camera, get }) => {
          (window as unknown as { aqualinkThree?: unknown }).aqualinkThree = {
            scene,
            camera,
            get controls() {
              return get().controls;
            },
            get gl() {
              return get().gl;
            },
          };
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.12;
          gl.localClippingEnabled = true;
          // Shader error checks force synchronous round trips to the GPU; keep them for development only.
          gl.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
          // A context lost while the canvas is still mounted and not restored
          // shortly after means WebGL is unusable; fall back to the text view.
          const el = gl.domElement;
          let restored = false;
          el.addEventListener("webglcontextrestored", () => {
            restored = true;
          });
          el.addEventListener("webglcontextlost", (ev) => {
            ev.preventDefault();
            restored = false;
            setTimeout(() => {
              if (!restored && el.isConnected) setWebglFailed(true);
            }, 2000);
          });
        }}
        onPointerMissed={(e) => {
          const d = down.current;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) select(null);
        }}
        aria-hidden
      >
        <PerformanceMonitor onDecline={() => quality === "high" && setQuality("balanced")} flipflops={2} />
        <Suspense fallback={null}>
          <SceneContents />
          {!compiled && <Precompile onReady={onCompiled} />}
          {compiled && !shown && <FirstFrames onShown={onShown} />}
        </Suspense>
      </Canvas>
      <SceneLoader step={compiled ? "Opening the doors…" : "Preparing water, glass and light…"} done={shown} />
    </div>
  );
}
