/**
 * AquaLink demonstration facility — the single physical + logical description
 * of the aquarium. Every view (public, infrastructure, incident), every panel
 * and the simulation read from these records.
 *
 * Units: metres for coordinates, m³/h for flow, °C, pH, mg/L.
 * Coordinate frame: +Y up, +Z towards the main entrance (public camera side).
 *
 * All values are illustrative demonstration data, not measurements from a real
 * facility. See docs/SIMULATION.md for the assumptions behind the numbers.
 */
import type {
  EdgeConfig,
  FilterConfig,
  Floor,
  JunctionConfig,
  LoopConfig,
  PipeRoute,
  PumpConfig,
  SensorConfig,
  TankConfig,
  Technician,
  ValveConfig,
} from "@/lib/types";

export const FACILITY = {
  id: "AQL-HARBOUR",
  name: "Harbour Point Aquarium",
  system: "Marine Life Support",
  twin: "Live Facility Twin",
};

export const FLOORS: Floor[] = [
  { id: "L3", name: "Level 3 — Upper Gallery", elevation: 12, description: "Upper viewing gallery and Coral Lagoon exhibit", publicAccess: true },
  { id: "L2", name: "Level 2 — Reef Gallery", elevation: 6, description: "Reef gallery balconies with Indo-Pacific and Mangrove exhibits", publicAccess: true },
  { id: "L1", name: "Level 1 — Atrium", elevation: 0, description: "Main atrium, Open Ocean showcase, Seagrass and Anemone exhibits", publicAccess: true },
  { id: "B1", name: "B1 — Life Support Plant", elevation: -6, description: "Restricted maintenance level: pumps, filtration and distribution headers", publicAccess: false },
];

export const FLOOR_BY_ID = Object.fromEntries(FLOORS.map((f) => [f.id, f])) as Record<Floor["id"], Floor>;

/** Building extents used by the architecture and camera bounds. */
export const BUILDING = {
  minX: -24,
  maxX: 24,
  minZ: -16,
  maxZ: 14,
  /** Entrance plaza floor extends past the atrium envelope towards the visitor entrance. */
  entranceZ: 30,
  roof: 18,
  slab: 0.5,
  plant: { minX: -24, maxX: 24, minZ: -14, maxZ: 12, floor: -6, ceiling: -0.5 },
  /** Gallery decks (balconies) wrapping the atrium void. */
  decks: {
    L2: { y: 6, left: { minX: -24, maxX: -9, minZ: -16, maxZ: 2 }, right: { minX: 9, maxX: 24, minZ: -16, maxZ: 2 }, back: { minX: -9, maxX: 9, minZ: -16, maxZ: -10.5 } },
    L3: { y: 12, left: { minX: -24, maxX: -10.5, minZ: -16, maxZ: -4 }, right: { minX: 10.5, maxX: 24, minZ: -16, maxZ: -4 }, back: { minX: -10.5, maxX: 10.5, minZ: -16, maxZ: -11.5 } },
  },
  /** Structural columns (x, z), floor to roof. */
  columns: [
    [-9, 2],
    [9, 2],
    [-9, -4.5],
    [9, -4.5],
    [-9.75, -11],
    [9.75, -11],
    [-16.5, 2],
    [16.5, 2],
    [-3.5, -12.5],
    [3.5, -12.5],
  ] as [number, number][],
  columnRadius: 0.36,
  /** Service shafts that hide the risers feeding the upper-level exhibits. */
  shafts: [
    { id: "SHAFT-W", minX: -24, maxX: -21.3, minZ: -6.2, maxZ: -2.8, top: 6 },
    { id: "SHAFT-E", minX: 21.6, maxX: 24, minZ: -10.2, maxZ: -0.6, top: 18 },
  ],
};

export const TANKS: TankConfig[] = [
  {
    id: "TNK-A",
    code: "A",
    name: "Tank A",
    floor: "L1",
    position: [0, 0, -3],
    radius: 5,
    height: 14.2,
    plinth: 0.6,
    volumeM3: 1110,
    designFlow: 480,
    baseline: { temp: 27.1, ph: 7.8, dissolvedO2: 6.6 },
    habitat: {
      name: "Open Ocean Showcase",
      description: "Three-storey cylindrical showcase with reef sharks, rays and schooling fish.",
      tempRange: [25.5, 27.8],
      phRange: [7.7, 8.3],
      doMin: 5.5,
      scenery: "open-ocean",
      waterTint: { shallow: "#2ea6cf", deep: "#03213f" },
      species: [
        { kind: "shark", label: "Blacktip reef sharks", count: 3 },
        { kind: "ray", label: "Cownose rays", count: 4 },
        { kind: "school", label: "Schooling trevally", count: 110 },
        { kind: "reef", label: "Reef fish", count: 36 },
      ],
    },
  },
  {
    id: "TNK-B",
    code: "B",
    name: "Tank B",
    floor: "L3",
    position: [15, 12, -9],
    radius: 3.1,
    height: 4.4,
    plinth: 0.5,
    volumeM3: 128,
    designFlow: 200,
    baseline: { temp: 26.2, ph: 7.7, dissolvedO2: 6.5 },
    habitat: {
      name: "Coral Lagoon",
      description: "Shallow lagoon with soft corals, tangs and anthias.",
      tempRange: [25.0, 27.5],
      phRange: [7.6, 8.3],
      doMin: 5.5,
      scenery: "reef",
      waterTint: { shallow: "#4cc6d6", deep: "#0a3d5c" },
      species: [{ kind: "reef", label: "Lagoon reef fish", count: 44 }],
    },
  },
  {
    id: "TNK-C",
    code: "C",
    name: "Tank C",
    floor: "L2",
    position: [15.5, 6, -2.5],
    radius: 2.8,
    height: 4.2,
    plinth: 0.5,
    volumeM3: 98,
    designFlow: 180,
    baseline: { temp: 26.3, ph: 7.6, dissolvedO2: 6.4 },
    habitat: {
      name: "Mangrove Nursery",
      description: "Brackish-tolerant mangrove root habitat for juvenile snapper and archerfish.",
      tempRange: [24.0, 28.0],
      phRange: [7.4, 8.2],
      doMin: 5.0,
      scenery: "mangrove",
      waterTint: { shallow: "#5cbfae", deep: "#0b3a45" },
      species: [{ kind: "mangrove", label: "Juvenile snapper & archerfish", count: 26 }],
    },
  },
  {
    id: "TNK-D",
    code: "D",
    name: "Tank D",
    floor: "L2",
    position: [-15.5, 6, -5],
    radius: 3.1,
    height: 4.4,
    plinth: 0.5,
    volumeM3: 128,
    designFlow: 120,
    baseline: { temp: 26.4, ph: 8.1, dissolvedO2: 6.7 },
    habitat: {
      name: "Indo-Pacific Reef",
      description: "Hard-coral reef with wrasse, butterflyfish and damsels.",
      tempRange: [25.0, 27.5],
      phRange: [7.9, 8.4],
      doMin: 5.5,
      scenery: "reef",
      waterTint: { shallow: "#46bfe0", deep: "#07345a" },
      species: [{ kind: "reef", label: "Indo-Pacific reef fish", count: 50 }],
    },
  },
  {
    id: "TNK-E",
    code: "E",
    name: "Tank E",
    floor: "L1",
    position: [14.5, 0, 6.5],
    radius: 3,
    height: 4.6,
    plinth: 0.5,
    volumeM3: 124,
    designFlow: 130,
    baseline: { temp: 26.6, ph: 8.0, dissolvedO2: 6.6 },
    habitat: {
      name: "Seagrass Meadow",
      description: "Seagrass beds with seahorses and pipefish.",
      tempRange: [24.0, 27.0],
      phRange: [7.8, 8.4],
      doMin: 5.5,
      scenery: "seagrass",
      waterTint: { shallow: "#5ccfc4", deep: "#08404f" },
      species: [
        { kind: "seahorse", label: "Lined seahorses", count: 12 },
        { kind: "reef", label: "Pipefish & gobies", count: 14 },
      ],
    },
  },
  {
    id: "TNK-F",
    code: "F",
    name: "Tank F",
    floor: "L1",
    position: [-14.5, 0, 5.5],
    radius: 3,
    height: 4.6,
    plinth: 0.5,
    volumeM3: 124,
    designFlow: 110,
    baseline: { temp: 26.5, ph: 7.9, dissolvedO2: 6.6 },
    habitat: {
      name: "Anemone Reef",
      description: "Clownfish and damselfish hosted by carpet and bubble-tip anemones.",
      tempRange: [25.0, 27.5],
      phRange: [7.8, 8.4],
      doMin: 5.5,
      scenery: "anemone",
      waterTint: { shallow: "#45b9de", deep: "#062f55" },
      species: [
        { kind: "clownfish", label: "Clownfish", count: 18 },
        { kind: "reef", label: "Damselfish", count: 22 },
      ],
    },
  },
];

export const PUMPS: PumpConfig[] = [
  {
    id: "PMP-C1",
    code: "C-1",
    name: "Circulation Pump C-1",
    floor: "B1",
    position: [-9, -6, 5.5],
    suctionSide: -1,
    ratedFlow: 900,
    role: "primary",
    loopId: "LOOP-1",
    startRampSec: 30,
    fla: 62,
    motorKw: 37,
    model: "End-suction centrifugal, 37 kW, VFD",
    installed: "2019-04",
  },
  {
    id: "PMP-C2",
    code: "C-2",
    name: "Circulation Pump C-2",
    floor: "B1",
    position: [5, -6, 5.5],
    suctionSide: 1,
    ratedFlow: 420,
    role: "primary",
    loopId: "LOOP-2",
    startRampSec: 30,
    fla: 38,
    motorKw: 22,
    model: "End-suction centrifugal, 22 kW, VFD",
    installed: "2019-04",
  },
  {
    id: "PMP-C3",
    code: "C-3",
    name: "Circulation Pump C-3",
    floor: "B1",
    position: [17, -6, 5.5],
    suctionSide: -1,
    ratedFlow: 300,
    role: "backup",
    loopId: "LOOP-2",
    backupOutputFraction: 0.6,
    // Soft-start on the standby drive: 125 s to full rated output.
    startRampSec: 125,
    fla: 29,
    motorKw: 15,
    model: "End-suction centrifugal, 15 kW, standby duty",
    installed: "2021-09",
  },
];

export const FILTERS: FilterConfig[] = [
  { id: "FLT-1", code: "F-1", name: "Sand Filter F-1", floor: "B1", position: [-14, -6, 0.5], radius: 1.2, height: 3.4, media: "Graded silica sand", loopId: "LOOP-1" },
  { id: "FLT-2", code: "F-2", name: "Sand Filter F-2", floor: "B1", position: [13, -6, 0.5], radius: 1.2, height: 3.4, media: "Graded silica sand", loopId: "LOOP-2" },
];

export const VALVES: ValveConfig[] = [
  { id: "V-101", code: "V-101", name: "C-1 discharge isolation", floor: "B1", position: [-9.95, -3.1, 5.5], axis: "y", type: "isolation", normallyOpen: true, diameter: 250 },
  { id: "V-102", code: "V-102", name: "Tank A balancing valve", floor: "B1", position: [-3, -1.5, 4.5], axis: "z", type: "balancing", normallyOpen: true, diameter: 200 },
  { id: "V-103", code: "V-103", name: "Tank D balancing valve", floor: "B1", position: [-22, -1.5, 4], axis: "z", type: "balancing", normallyOpen: true, diameter: 100 },
  { id: "V-104", code: "V-104", name: "Tank E balancing valve", floor: "B1", position: [6, -1.5, 10.5], axis: "x", type: "balancing", normallyOpen: true, diameter: 100 },
  { id: "V-105", code: "V-105", name: "Tank F balancing valve", floor: "B1", position: [-14.5, -1.5, 6.9], axis: "z", type: "balancing", normallyOpen: true, diameter: 100 },
  { id: "V-201", code: "V-201", name: "C-2 discharge check / isolation", floor: "B1", position: [5.95, -3.1, 5.5], axis: "y", type: "check", normallyOpen: true, diameter: 200 },
  { id: "V-202", code: "V-202", name: "Tank B balancing valve", floor: "B1", position: [9, -2.2, 3], axis: "z", type: "balancing", normallyOpen: true, diameter: 150 },
  { id: "V-203", code: "V-203", name: "Tank C balancing valve", floor: "B1", position: [11, -2.2, 3], axis: "z", type: "balancing", normallyOpen: true, diameter: 150 },
  { id: "V-301", code: "V-301", name: "C-3 auto-transfer valve (normally closed)", floor: "B1", position: [16.05, -3.1, 5.5], axis: "y", type: "auto-transfer", normallyOpen: false, diameter: 150 },
  { id: "V-110", code: "V-110", name: "Loop 1 return isolation", floor: "B1", position: [-14, -1.75, 0.1], axis: "y", type: "isolation", normallyOpen: true, diameter: 250 },
  { id: "V-210", code: "V-210", name: "Loop 2 return isolation", floor: "B1", position: [13, -1.75, 0], axis: "z", type: "isolation", normallyOpen: true, diameter: 200 },
];

export const JUNCTIONS: JunctionConfig[] = [
  {
    id: "HDR-1",
    code: "HDR-1",
    name: "Loop 1 distribution header",
    floor: "B1",
    position: [-9.95, -1.5, 8],
    kind: "supply-header",
    manifold: [
      [-18.5, -1.5, 8],
      [-2, -1.5, 8],
    ],
    // Weighted by design flow so every Loop 1 tank reaches design together.
    branchWeights: { "V-102": 480, "V-103": 120, "V-104": 130, "V-105": 110 },
  },
  {
    id: "HDR-2",
    code: "HDR-2",
    name: "Loop 2 distribution header",
    floor: "B1",
    position: [11, -2.2, 8],
    kind: "supply-header",
    manifold: [
      [5.95, -2.2, 8],
      [16.05, -2.2, 8],
    ],
    // Balancing valves V-202 / V-203 are set for an equal split of header flow.
    branchWeights: { "V-202": 1, "V-203": 1 },
  },
  { id: "SH-2", code: "SH-2", name: "Loop 2 suction tee", floor: "B1", position: [13, -5.15, 3.2], kind: "suction-tee" },
  {
    id: "RH-1",
    code: "RH-1",
    name: "Loop 1 return collector",
    floor: "B1",
    position: [-14, -0.95, 0.1],
    kind: "return-header",
    manifold: [
      [-14, -0.95, -0.7],
      [-14, -0.95, 0.9],
    ],
  },
  {
    id: "RH-2",
    code: "RH-2",
    name: "Loop 2 return collector",
    floor: "B1",
    position: [13, -0.95, -1.5],
    kind: "return-header",
  },
];

export const LOOPS: LoopConfig[] = [
  {
    id: "LOOP-1",
    name: "Loop 1 — Atrium & west exhibits",
    primaryPumps: ["PMP-C1"],
    backupPumps: [],
    filterId: "FLT-1",
    tankIds: ["TNK-A", "TNK-D", "TNK-E", "TNK-F"],
  },
  {
    id: "LOOP-2",
    name: "Loop 2 — East gallery exhibits",
    primaryPumps: ["PMP-C2"],
    backupPumps: ["PMP-C3"],
    filterId: "FLT-2",
    tankIds: ["TNK-B", "TNK-C"],
    autoTransfer: { primary: "PMP-C2", backup: "PMP-C3", valve: "V-301", delaySec: 120 },
  },
];

/** Logical dependency graph: directed edges in the direction of water flow. */
export const EDGES: EdgeConfig[] = [
  // Suction side
  { id: "LN-01", from: "FLT-1", to: "PMP-C1", kind: "suction", diameter: 300 },
  { id: "LN-02", from: "FLT-2", to: "SH-2", kind: "suction", diameter: 250 },
  { id: "LN-03", from: "SH-2", to: "PMP-C2", kind: "suction", diameter: 200 },
  { id: "LN-04", from: "SH-2", to: "PMP-C3", kind: "suction", diameter: 200 },
  // Loop 1 supply
  { id: "LN-11", from: "PMP-C1", to: "V-101", kind: "supply", diameter: 250 },
  { id: "LN-12", from: "V-101", to: "HDR-1", kind: "supply", diameter: 250 },
  { id: "LN-13", from: "HDR-1", to: "V-102", kind: "supply", diameter: 200 },
  { id: "LN-14", from: "V-102", to: "TNK-A", kind: "supply", diameter: 200 },
  { id: "LN-15", from: "HDR-1", to: "V-103", kind: "supply", diameter: 100 },
  { id: "LN-16", from: "V-103", to: "TNK-D", kind: "supply", diameter: 100 },
  { id: "LN-17", from: "HDR-1", to: "V-104", kind: "supply", diameter: 100 },
  { id: "LN-18", from: "V-104", to: "TNK-E", kind: "supply", diameter: 100 },
  { id: "LN-19", from: "HDR-1", to: "V-105", kind: "supply", diameter: 100 },
  { id: "LN-20", from: "V-105", to: "TNK-F", kind: "supply", diameter: 100 },
  // Loop 2 supply (primary C-2, backup C-3)
  { id: "LN-21", from: "PMP-C2", to: "V-201", kind: "supply", diameter: 200 },
  { id: "LN-22", from: "V-201", to: "HDR-2", kind: "supply", diameter: 200 },
  { id: "LN-23", from: "PMP-C3", to: "V-301", kind: "supply", diameter: 150 },
  { id: "LN-24", from: "V-301", to: "HDR-2", kind: "supply", diameter: 150 },
  { id: "LN-25", from: "HDR-2", to: "V-202", kind: "supply", diameter: 150 },
  { id: "LN-26", from: "V-202", to: "TNK-B", kind: "supply", diameter: 150 },
  { id: "LN-27", from: "HDR-2", to: "V-203", kind: "supply", diameter: 150 },
  { id: "LN-28", from: "V-203", to: "TNK-C", kind: "supply", diameter: 150 },
  // Returns (gravity drains back to the loop filter)
  { id: "LN-31", from: "TNK-A", to: "RH-1", kind: "return", diameter: 250 },
  { id: "LN-32", from: "TNK-D", to: "RH-1", kind: "return", diameter: 100 },
  { id: "LN-33", from: "TNK-E", to: "RH-1", kind: "return", diameter: 100 },
  { id: "LN-34", from: "TNK-F", to: "RH-1", kind: "return", diameter: 100 },
  { id: "LN-35", from: "RH-1", to: "V-110", kind: "return", diameter: 300 },
  { id: "LN-36", from: "V-110", to: "FLT-1", kind: "return", diameter: 300 },
  { id: "LN-37", from: "TNK-B", to: "RH-2", kind: "return", diameter: 150 },
  { id: "LN-38", from: "TNK-C", to: "RH-2", kind: "return", diameter: 150 },
  { id: "LN-39", from: "RH-2", to: "V-210", kind: "return", diameter: 200 },
  { id: "LN-40", from: "V-210", to: "FLT-2", kind: "return", diameter: 200 },
];

/**
 * Physical routing of every pipe. Kept separate from the logical graph above:
 * the graph says *what* is connected, these polylines say *where* the pipe runs.
 */
export const PIPE_ROUTES: PipeRoute[] = [
  { edgeId: "LN-01", points: [[-14, -5.15, 1.75], [-14, -5.15, 5.5], [-10.6, -5.15, 5.5]] },
  { edgeId: "LN-02", points: [[13, -5.15, 1.75], [13, -5.15, 3.2]] },
  { edgeId: "LN-03", points: [[13, -5.15, 3.2], [8, -5.15, 3.2], [8, -5.15, 5.5], [6.6, -5.15, 5.5]] },
  { edgeId: "LN-04", points: [[13, -5.15, 3.2], [14.4, -5.15, 3.2], [14.4, -5.15, 5.5], [15.4, -5.15, 5.5]] },

  { edgeId: "LN-11", points: [[-9.95, -4.1, 5.5], [-9.95, -3.1, 5.5]] },
  { edgeId: "LN-12", points: [[-9.95, -3.1, 5.5], [-9.95, -1.5, 5.5], [-9.95, -1.5, 8]] },
  { edgeId: "LN-13", points: [[-3, -1.5, 8], [-3, -1.5, 4.5]] },
  { edgeId: "LN-14", points: [[-3, -1.5, 4.5], [-3, -1.5, -1.8], [-3, 0.6, -1.8]] },
  { edgeId: "LN-15", points: [[-18.5, -1.5, 8], [-22, -1.5, 8], [-22, -1.5, 4]] },
  { edgeId: "LN-16", points: [[-22, -1.5, 4], [-22, -1.5, -5], [-22, 5.1, -5], [-15.5, 5.1, -5], [-15.5, 6.5, -5]] },
  { edgeId: "LN-17", points: [[-2, -1.5, 8], [-2, -1.5, 10.5], [6, -1.5, 10.5]] },
  { edgeId: "LN-18", points: [[6, -1.5, 10.5], [14.5, -1.5, 10.5], [14.5, -1.5, 6.5], [14.5, 0.5, 6.5]] },
  { edgeId: "LN-19", points: [[-14.5, -1.5, 8], [-14.5, -1.5, 6.9]] },
  { edgeId: "LN-20", points: [[-14.5, -1.5, 6.9], [-14.5, -1.5, 5.5], [-14.5, 0.5, 5.5]] },

  { edgeId: "LN-21", points: [[5.95, -4.1, 5.5], [5.95, -3.1, 5.5]] },
  { edgeId: "LN-22", points: [[5.95, -3.1, 5.5], [5.95, -2.2, 5.5], [5.95, -2.2, 8]] },
  { edgeId: "LN-23", points: [[16.05, -4.1, 5.5], [16.05, -3.1, 5.5]] },
  { edgeId: "LN-24", points: [[16.05, -3.1, 5.5], [16.05, -2.2, 5.5], [16.05, -2.2, 8]] },
  { edgeId: "LN-25", points: [[9, -2.2, 8], [9, -2.2, 3]] },
  { edgeId: "LN-26", points: [[9, -2.2, 3], [9, -2.2, -9], [22.3, -2.2, -9], [22.3, 11.1, -9], [15, 11.1, -9], [15, 12.5, -9]] },
  { edgeId: "LN-27", points: [[11, -2.2, 8], [11, -2.2, 3]] },
  { edgeId: "LN-28", points: [[11, -2.2, 3], [11, -2.2, -2.5], [22.3, -2.2, -2.5], [22.3, 5.1, -2.5], [15.5, 5.1, -2.5], [15.5, 6.5, -2.5]] },

  { edgeId: "LN-31", points: [[2.5, 0.6, -0.3], [2.5, -0.95, -0.3], [-14, -0.95, -0.3]] },
  { edgeId: "LN-32", points: [[-14.2, 6.5, -4], [-14.2, 4.7, -4], [-23, 4.7, -4], [-23, -0.95, -4], [-23, -0.95, -0.7], [-14, -0.95, -0.7]] },
  { edgeId: "LN-33", points: [[14.5, 0.5, 5.2], [14.5, -0.95, 5.2], [14.5, -0.95, 0.9], [-14, -0.95, 0.9]] },
  { edgeId: "LN-34", points: [[-13.2, 0.5, 4.2], [-13.2, -0.95, 4.2], [-13.2, -0.95, 0.1], [-14, -0.95, 0.1]] },
  { edgeId: "LN-35", points: [[-14, -0.95, 0.1], [-14, -1.75, 0.1]] },
  { edgeId: "LN-36", points: [[-14, -1.75, 0.1], [-14, -2.55, 0.1]] },
  { edgeId: "LN-37", points: [[16.3, 12.5, -8], [16.3, 10.7, -8], [23, 10.7, -8], [23, -0.95, -8], [13, -0.95, -8], [13, -0.95, -1.5]] },
  { edgeId: "LN-38", points: [[16.7, 6.5, -1.5], [16.7, 4.7, -1.5], [23, 4.7, -1.5], [23, -0.95, -1.5], [13, -0.95, -1.5]] },
  { edgeId: "LN-39", points: [[13, -0.95, -1.5], [13, -1.75, -1.5], [13, -1.75, 0]] },
  { edgeId: "LN-40", points: [[13, -1.75, 0], [13, -1.75, 0.5], [13, -2.55, 0.5]] },
];

function tankSensors(t: TankConfig): SensorConfig[] {
  const [x, y, z] = t.position;
  const r = t.radius + 0.08;
  const sy = y + t.plinth * 0.55;
  // Sensors sit on the tank plinth, facing the service side (−Z) and the visitor side.
  const at = (deg: number): [number, number, number] => {
    const a = (deg * Math.PI) / 180;
    return [x + Math.cos(a) * r, sy, z + Math.sin(a) * r];
  };
  const inlet = PIPE_ROUTES.find((p) => {
    const e = EDGES.find((ed) => ed.id === p.edgeId);
    return e?.to === t.id;
  });
  const inletTop = inlet ? inlet.points[inlet.points.length - 1] : t.position;
  const floorY = t.position[1];
  return [
    { id: `TT-${t.code}`, code: `TT-${t.code}1`, name: `${t.name} temperature`, kind: "temperature", assetId: t.id, floor: t.floor, position: at(-60), unit: "°C" },
    { id: `AT-${t.code}`, code: `AT-${t.code}1`, name: `${t.name} pH analyser`, kind: "ph", assetId: t.id, floor: t.floor, position: at(-90), unit: "pH" },
    { id: `DO-${t.code}`, code: `DO-${t.code}1`, name: `${t.name} dissolved oxygen`, kind: "dissolved-o2", assetId: t.id, floor: t.floor, position: at(-120), unit: "mg/L" },
    // Flow transmitter sits on the tank's inlet branch just below the slab.
    { id: `FT-${t.code}`, code: `FT-${t.code}1`, name: `${t.name} inlet flow`, kind: "flow", assetId: t.id, floor: t.floor, position: [inletTop[0], floorY - 1.0, inletTop[2]], unit: "m³/h" },
  ];
}

function pumpSensors(p: PumpConfig): SensorConfig[] {
  const [x, y, z] = p.position;
  const s = p.suctionSide;
  return [
    { id: `CT-${p.code}`, code: `CT-${p.code.replace("-", "")}`, name: `${p.code} motor current`, kind: "motor-current", assetId: p.id, floor: p.floor, position: [x - s * 0.75, y + 1.55, z + 0.25], unit: "% FLA" },
    { id: `PT-${p.code}`, code: `PT-${p.code.replace("-", "")}`, name: `${p.code} discharge pressure`, kind: "pressure", assetId: p.id, floor: p.floor, position: [x + s * 0.95 + 0.22, y + 2.35, z], unit: "bar" },
  ];
}

function filterSensors(f: FilterConfig): SensorConfig[] {
  const [x, y, z] = f.position;
  return [
    { id: `DPT-${f.code}`, code: `DPT-${f.code.replace("-", "")}`, name: `${f.name} differential pressure`, kind: "diff-pressure", assetId: f.id, floor: f.floor, position: [x + f.radius + 0.1, y + 1.6, z], unit: "kPa" },
  ];
}

export const SENSORS: SensorConfig[] = [...TANKS.flatMap(tankSensors), ...PUMPS.flatMap(pumpSensors), ...FILTERS.flatMap(filterSensors)];

export const TECHNICIANS: Technician[] = [
  { id: "T-01", name: "Jamie Doyle", initials: "JD", role: "Shift lead, life support" },
  { id: "T-02", name: "Priya Nair", initials: "PN", role: "Mechanical technician" },
  { id: "T-03", name: "Marcus Oyelaran", initials: "MO", role: "Electrical technician" },
  { id: "T-04", name: "Sofia Lind", initials: "SL", role: "Life-support operator" },
  { id: "T-05", name: "Kenji Watanabe", initials: "KW", role: "Senior aquarist" },
];

export const CURRENT_USER = TECHNICIANS[0];

/** Thresholds used to classify circulation. Demonstration values. */
export const FLOW_THRESHOLDS = {
  /** At or above: healthy. */
  healthy: 90,
  /** Below this: reduced flow (critical). Between this and healthy: degraded (warning). */
  reduced: 60,
  /** Below this: no circulation. */
  none: 5,
  /** Configured demonstration emergency minimum circulation. */
  emergencyMinimum: 40,
  /** Low-flow alarm debounce (seconds below `reduced`). */
  alarmDelaySec: 60,
};

/** Scenario epoch: the simulated day starts at 10:00:00. */
export const SCENARIO_START = 10 * 3600;
