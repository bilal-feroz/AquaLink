/**
 * Per-frame scene effects shared between components without React renders.
 * `ghost` blends the architecture from solid (public) to cut-away (engineering),
 * `incident` emphasises fault paths. Values are eased every frame by <FxDriver/>.
 */
import type { FloorId, Vec3 } from "@/lib/types";

export const sceneFx = {
  time: 0,
  ghost: 0,
  ghostTarget: 0,
  incident: 0,
  incidentTarget: 0,
  shellVisible: 1,
  shellTarget: 1,
  motion: 1,
  /** Smoothed 0..1 pulse used for alarm emphasis. */
  pulse: 0,
};

export interface CameraPreset {
  position: Vec3;
  target: Vec3;
}

export const CAMERA_PRESETS: Record<"public" | "operations", CameraPreset> = {
  public: { position: [0, 7.4, 35], target: [0, 6.4, -3] },
  // From behind and above: the plant hall in front, the exhibits beyond.
  operations: { position: [15, 27, -60], target: [0, 1.5, -15] },
};

export const LEVEL_PRESETS: Record<FloorId, CameraPreset> = {
  PL: { position: [9, 11, -55], target: [0, 0.5, -26] },
  L1: { position: [0, 4.2, 31], target: [0, 2.6, 1] },
  L2: { position: [0, 10.5, 29], target: [0, 7.6, -3] },
  L3: { position: [2, 16.5, 25], target: [3, 13.2, -7] },
};
