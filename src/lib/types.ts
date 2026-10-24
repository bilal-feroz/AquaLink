/**
 * Shared domain types for the AquaLink facility model.
 *
 * The facility is described once (src/lib/data) and every view, panel and
 * 3D object reads from that single description plus the simulation state.
 */

export type Vec3 = [number, number, number];

export type FloorId = "PL" | "L1" | "L2" | "L3";

export type AssetKind = "tank" | "pump" | "filter" | "valve" | "junction" | "sensor" | "pipe";

export interface Floor {
  id: FloorId;
  name: string;
  /** Top-of-slab elevation in metres. */
  elevation: number;
  description: string;
  publicAccess: boolean;
}

export type SpeciesKind =
  | "shark"
  | "ray"
  | "school"
  | "reef"
  | "clownfish"
  | "seahorse"
  | "mangrove";

export interface SpeciesGroup {
  kind: SpeciesKind;
  label: string;
  /** Number of animals rendered in the scene (and reported in panels). */
  count: number;
  note?: string;
}

export interface Habitat {
  name: string;
  description: string;
  /** Acceptable temperature band for this habitat, °C. */
  tempRange: [number, number];
  /** Acceptable pH band for this habitat. */
  phRange: [number, number];
  /** Dissolved oxygen alarm level, mg/L. */
  doMin: number;
  species: SpeciesGroup[];
  /** Coral colonies / plant clusters rendered for scenery. */
  scenery: "reef" | "open-ocean" | "mangrove" | "seagrass" | "anemone";
  waterTint: { shallow: string; deep: string };
}

export interface TankConfig {
  id: string;
  code: string;
  name: string;
  floor: FloorId;
  /** Base centre of the tank (floor level). */
  position: Vec3;
  radius: number;
  /** Glass height above the plinth. */
  height: number;
  plinth: number;
  volumeM3: number;
  /** Design circulation flow, m³/h. 100 % circulation == design flow. */
  designFlow: number;
  habitat: Habitat;
  baseline: { temp: number; ph: number; dissolvedO2: number };
}

export interface PumpConfig {
  id: string;
  code: string;
  name: string;
  floor: FloorId;
  position: Vec3;
  /** Direction along X that the suction nozzle faces (+1 or −1). */
  suctionSide: 1 | -1;
  /** Rated capacity, m³/h. */
  ratedFlow: number;
  role: "primary" | "backup";
  loopId: string;
  /** Output (fraction of rated) the pump runs at when acting as backup. */
  backupOutputFraction?: number;
  /** Seconds to ramp from stopped to 100 % rated output on a start command. */
  startRampSec: number;
  /** Full-load amps of the motor. */
  fla: number;
  motorKw: number;
  model: string;
  installed: string;
}

export interface FilterConfig {
  id: string;
  code: string;
  name: string;
  floor: FloorId;
  position: Vec3;
  radius: number;
  height: number;
  media: string;
  loopId: string;
  /** Clean-bed throughput limit, m³/h. */
  capacity: number;
}

export type ValveType = "isolation" | "balancing" | "auto-transfer" | "check";

export interface ValveConfig {
  id: string;
  code: string;
  name: string;
  floor: FloorId;
  position: Vec3;
  axis: "x" | "y" | "z";
  type: ValveType;
  normallyOpen: boolean;
  diameter: number;
}

export interface JunctionConfig {
  id: string;
  code: string;
  name: string;
  floor: FloorId;
  position: Vec3;
  kind: "supply-header" | "suction-tee" | "return-header";
  /** Optional manifold pipe drawn for the header: from → to. */
  manifold?: [Vec3, Vec3];
  /** Branch weighting at this junction (child node id → weight). */
  branchWeights?: Record<string, number>;
}

export type SensorKind =
  | "temperature"
  | "ph"
  | "dissolved-o2"
  | "flow"
  | "motor-current"
  | "pressure"
  | "diff-pressure";

export interface SensorConfig {
  id: string;
  code: string;
  name: string;
  kind: SensorKind;
  /** Asset the sensor measures. */
  assetId: string;
  floor: FloorId;
  position: Vec3;
  unit: string;
}

export type EdgeKind = "suction" | "supply" | "return";

export interface EdgeConfig {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  /** Nominal bore, mm. */
  diameter: number;
}

export interface PipeRoute {
  edgeId: string;
  /** Polyline of physical corner points (metres). Corners are rounded when rendered. */
  points: Vec3[];
}

export interface LoopConfig {
  id: string;
  name: string;
  primaryPumps: string[];
  backupPumps: string[];
  filterId: string;
  tankIds: string[];
  autoTransfer?: {
    primary: string;
    backup: string;
    valve: string;
    /** Seconds the primary must be in fault before the backup is started. */
    delaySec: number;
  };
}

export interface Technician {
  id: string;
  name: string;
  initials: string;
  role: string;
}
