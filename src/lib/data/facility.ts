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
  { id: "PL", name: "Life Support Plant — back of house", elevation: -2, description: "Restricted plant hall behind the exhibits: pumps, filtration and distribution headers", publicAccess: false },
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
  /** Back-of-house life-support hall directly behind the atrium's back wall. */
  plant: { minX: -24, maxX: 24, minZ: -37, maxZ: -16.4, floor: -2 },
  /** Service void under the atrium floor that carries the supply and return mains. */
  voidFloor: -2,
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
};

/** Pre-rendered still of a habitat (scripts/capture-habitats.mjs). */
export const habitatImage = (tankId: string) => `/habitats/${tankId}.jpg`;

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
        { kind: "school", label: "Bluestripe snapper", count: 40, look: { a: "#ffd23f", b: "#3aa0ff", pattern: 3 } },
        { kind: "reef", label: "Yellow tangs", count: 14, look: { a: "#ffd400", b: "#ffe873", pattern: 0, shape: "deep" } },
        { kind: "reef", label: "Blue tangs", count: 10, look: { a: "#1f5bff", b: "#ffcf1a", pattern: 2, shape: "deep" } },
        { kind: "reef", label: "Bannerfish", count: 8, look: { a: "#f6f2e6", b: "#151515", pattern: 1, shape: "deep" } },
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
      species: [
        { kind: "reef", label: "Purple anthias", count: 14, look: { a: "#ff4fa3", b: "#ffb36b", pattern: 0 } },
        { kind: "reef", label: "Green chromis", count: 12, look: { a: "#38e0c0", b: "#c8fff3", pattern: 0 } },
        { kind: "reef", label: "Yellow tangs", count: 8, look: { a: "#ffd400", b: "#ffe873", pattern: 0, shape: "deep" } },
        { kind: "reef", label: "Royal grammas", count: 6, look: { a: "#8a3dff", b: "#ffd23f", pattern: 2 } },
        { kind: "reef", label: "Flame angelfish", count: 4, look: { a: "#ff3b1f", b: "#ffb000", pattern: 3, shape: "deep" } },
      ],
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
      species: [
        { kind: "mangrove", label: "Juvenile snapper & archerfish", count: 26 },
        { kind: "reef", label: "Silver moonyfish", count: 10, look: { a: "#e3eaee", b: "#ffd23f", pattern: 0, shape: "deep" } },
        { kind: "reef", label: "Banded scats", count: 6, look: { a: "#d9c38a", b: "#2a2a24", pattern: 1, shape: "deep" } },
      ],
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
      species: [
        { kind: "reef", label: "Blue-green chromis", count: 18, look: { a: "#45c8ff", b: "#c4f3ff", pattern: 0 } },
        { kind: "reef", label: "Butterflyfish", count: 10, look: { a: "#fff3c4", b: "#f0a20f", pattern: 3, shape: "deep" } },
        { kind: "reef", label: "Six-line wrasse", count: 8, look: { a: "#6a5cff", b: "#ff9a3c", pattern: 3, shape: "slim" } },
        { kind: "reef", label: "Moorish idols", count: 8, look: { a: "#f8f3e3", b: "#141414", pattern: 1, shape: "deep" } },
        { kind: "reef", label: "Flame angelfish", count: 6, look: { a: "#ff3b1f", b: "#ffb000", pattern: 3, shape: "deep" } },
      ],
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
        { kind: "reef", label: "Mandarin dragonets", count: 6, look: { a: "#ff7a1a", b: "#1e8cff", pattern: 3 } },
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
        { kind: "reef", label: "Blue damselfish", count: 14, look: { a: "#2a6bff", b: "#9fd0ff", pattern: 0 } },
        { kind: "reef", label: "Yellowtail damsels", count: 8, look: { a: "#2a6bff", b: "#ffd60a", pattern: 2 } },
        { kind: "reef", label: "Royal grammas", count: 6, look: { a: "#8a3dff", b: "#ffd23f", pattern: 2 } },
        { kind: "reef", label: "Firefish gobies", count: 6, look: { a: "#fff1df", b: "#ff3d3d", pattern: 2, shape: "slim" } },
      ],
    },
  },
];

export const PUMPS: PumpConfig[] = [
  {
    id: "PMP-C1",
    code: "C-1",
    name: "Circulation Pump C-1",
    floor: "PL",
    position: [-9, -2, -25],
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
    floor: "PL",
    position: [5, -2, -25],
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
    floor: "PL",
    position: [17, -2, -25],
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
  { id: "FLT-1", code: "F-1", name: "Sand Filter F-1", floor: "PL", position: [-14, -2, -30], radius: 1.2, height: 3.4, media: "Graded silica sand", loopId: "LOOP-1", capacity: 1000 },
  { id: "FLT-2", code: "F-2", name: "Sand Filter F-2", floor: "PL", position: [13, -2, -30], radius: 1.2, height: 3.4, media: "Graded silica sand", loopId: "LOOP-2", capacity: 450 },
];

export const VALVES: ValveConfig[] = [
  { id: "V-101", code: "V-101", name: "C-1 discharge isolation", floor: "PL", position: [-9.95, 0.9, -25], axis: "y", type: "isolation", normallyOpen: true, diameter: 250 },
  { id: "V-102", code: "V-102", name: "Tank A balancing valve", floor: "PL", position: [-2, 2.5, -20.5], axis: "z", type: "balancing", normallyOpen: true, diameter: 200 },
  { id: "V-103", code: "V-103", name: "Tank D balancing valve", floor: "PL", position: [-18.5, 2.5, -20.5], axis: "z", type: "balancing", normallyOpen: true, diameter: 100 },
  { id: "V-104", code: "V-104", name: "Tank E balancing valve", floor: "PL", position: [0, 0.8, -21.5], axis: "y", type: "balancing", normallyOpen: true, diameter: 100 },
  { id: "V-105", code: "V-105", name: "Tank F balancing valve", floor: "PL", position: [-14.5, 2.5, -20.5], axis: "z", type: "balancing", normallyOpen: true, diameter: 100 },
  { id: "V-201", code: "V-201", name: "C-2 discharge check / isolation", floor: "PL", position: [5.95, 0.9, -25], axis: "y", type: "check", normallyOpen: true, diameter: 200 },
  { id: "V-202", code: "V-202", name: "Tank B balancing valve", floor: "PL", position: [9, 1.8, -20.8], axis: "z", type: "balancing", normallyOpen: true, diameter: 150 },
  { id: "V-203", code: "V-203", name: "Tank C balancing valve", floor: "PL", position: [11, 1.8, -20.3], axis: "z", type: "balancing", normallyOpen: true, diameter: 150 },
  { id: "V-301", code: "V-301", name: "C-3 auto-transfer valve (normally closed)", floor: "PL", position: [16.05, 0.9, -25], axis: "y", type: "auto-transfer", normallyOpen: false, diameter: 150 },
  { id: "V-110", code: "V-110", name: "Loop 1 return isolation", floor: "PL", position: [-14, 0.2, -34.6], axis: "y", type: "isolation", normallyOpen: true, diameter: 250 },
  { id: "V-210", code: "V-210", name: "Loop 2 return isolation", floor: "PL", position: [13, 0.2, -32.6], axis: "y", type: "isolation", normallyOpen: true, diameter: 200 },
];

export const JUNCTIONS: JunctionConfig[] = [
  {
    id: "HDR-1",
    code: "HDR-1",
    name: "Loop 1 distribution header",
    floor: "PL",
    position: [-9.95, 2.5, -22.5],
    kind: "supply-header",
    manifold: [
      [-18.5, 2.5, -22.5],
      [0, 2.5, -22.5],
    ],
    // Weighted by design flow so every Loop 1 tank reaches design together.
    branchWeights: { "V-102": 480, "V-103": 120, "V-104": 130, "V-105": 110 },
  },
  {
    id: "HDR-2",
    code: "HDR-2",
    name: "Loop 2 distribution header",
    floor: "PL",
    position: [11, 1.8, -22.5],
    kind: "supply-header",
    manifold: [
      [5.95, 1.8, -22.5],
      [16.05, 1.8, -22.5],
    ],
    // Balancing valves V-202 / V-203 are set for an equal split of header flow.
    branchWeights: { "V-202": 1, "V-203": 1 },
  },
  { id: "SH-2", code: "SH-2", name: "Loop 2 suction tee", floor: "PL", position: [13, -1.15, -27.3], kind: "suction-tee" },
  {
    id: "RH-1",
    code: "RH-1",
    name: "Loop 1 return collector",
    floor: "PL",
    position: [-14, -1.7, -34.6],
    kind: "return-header",
    manifold: [
      [-17.2, -1.7, -34.6],
      [22.2, -1.7, -34.6],
    ],
  },
  {
    id: "RH-2",
    code: "RH-2",
    name: "Loop 2 return collector",
    floor: "PL",
    position: [13, -1.7, -32.6],
    kind: "return-header",
    manifold: [
      [13, -1.7, -32.6],
      [20.4, -1.7, -32.6],
    ],
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
  // Plant hall: filters → pumps (suction side), floor at y = −2.
  { edgeId: "LN-01", points: [[-14, -1.15, -28.75], [-14, -1.15, -25], [-10.6, -1.15, -25]] },
  { edgeId: "LN-02", points: [[13, -1.15, -28.75], [13, -1.15, -27.3]] },
  { edgeId: "LN-03", points: [[13, -1.15, -27.3], [8, -1.15, -27.3], [8, -1.15, -25], [6.6, -1.15, -25]] },
  { edgeId: "LN-04", points: [[13, -1.15, -27.3], [14.4, -1.15, -27.3], [14.4, -1.15, -25], [15.4, -1.15, -25]] },

  // Pump discharges up to the overhead headers.
  { edgeId: "LN-11", points: [[-9.95, -0.1, -25], [-9.95, 0.9, -25]] },
  { edgeId: "LN-12", points: [[-9.95, 0.9, -25], [-9.95, 2.5, -25], [-9.95, 2.5, -22.5]] },
  { edgeId: "LN-21", points: [[5.95, -0.1, -25], [5.95, 0.9, -25]] },
  { edgeId: "LN-22", points: [[5.95, 0.9, -25], [5.95, 1.8, -25], [5.95, 1.8, -22.5]] },
  { edgeId: "LN-23", points: [[16.05, -0.1, -25], [16.05, 0.9, -25]] },
  { edgeId: "LN-24", points: [[16.05, 0.9, -25], [16.05, 1.8, -25], [16.05, 1.8, -22.5]] },

  // Loop 1 branches: ground-floor tanks via the under-floor void, Tank D via the L2 deck soffit.
  { edgeId: "LN-13", points: [[-2, 2.5, -22.5], [-2, 2.5, -20.5]] },
  { edgeId: "LN-14", points: [[-2, 2.5, -20.5], [-2, 2.5, -19], [-2, -1, -19], [-2, -1, -5], [-2, 0.6, -5]] },
  { edgeId: "LN-15", points: [[-18.5, 2.5, -22.5], [-18.5, 2.5, -20.5]] },
  { edgeId: "LN-16", points: [[-18.5, 2.5, -20.5], [-18.5, 2.5, -18.5], [-18.5, 5.1, -18.5], [-15.5, 5.1, -18.5], [-15.5, 5.1, -5], [-15.5, 6.5, -5]] },
  { edgeId: "LN-17", points: [[0, 2.5, -22.5], [0, 2.5, -21.5], [0, 0.8, -21.5]] },
  { edgeId: "LN-18", points: [[0, 0.8, -21.5], [0, -1, -21.5], [14.5, -1, -21.5], [14.5, -1, 6.5], [14.5, 0.5, 6.5]] },
  { edgeId: "LN-19", points: [[-14.5, 2.5, -22.5], [-14.5, 2.5, -20.5]] },
  { edgeId: "LN-20", points: [[-14.5, 2.5, -20.5], [-14.5, 2.5, -19], [-14.5, -1, -19], [-14.5, -1, 5.5], [-14.5, 0.5, 5.5]] },

  // Loop 2 branches: risers in the plant hall, then under the L2 / L3 deck soffits.
  { edgeId: "LN-25", points: [[9, 1.8, -22.5], [9, 1.8, -20.8]] },
  { edgeId: "LN-26", points: [[9, 1.8, -20.8], [9, 1.8, -19], [9, 11.1, -19], [15, 11.1, -19], [15, 11.1, -9], [15, 12.5, -9]] },
  { edgeId: "LN-27", points: [[11, 1.8, -22.5], [11, 1.8, -20.3]] },
  { edgeId: "LN-28", points: [[11, 1.8, -20.3], [11, 1.8, -18], [11, 5.1, -18], [15.5, 5.1, -18], [15.5, 5.1, -2.5], [15.5, 6.5, -2.5]] },

  // Returns run back under the floor / deck soffits to the collectors behind the filters.
  { edgeId: "LN-31", points: [[2.5, 0.6, -4.5], [2.5, -1.7, -4.5], [2.5, -1.7, -34.6]] },
  { edgeId: "LN-32", points: [[-17.2, 6.5, -6.2], [-17.2, 4.7, -6.2], [-17.2, 4.7, -18], [-17.2, -1.7, -18], [-17.2, -1.7, -34.6]] },
  { edgeId: "LN-33", points: [[16.9, 0.5, 6.1], [16.9, -1.7, 6.1], [22.2, -1.7, 6.1], [22.2, -1.7, -34.6]] },
  { edgeId: "LN-34", points: [[-11.8, 0.5, 4.6], [-11.8, -1.7, 4.6], [-11.8, -1.7, -34.6]] },
  { edgeId: "LN-35", points: [[-14, -1.7, -34.6], [-14, 0.2, -34.6]] },
  { edgeId: "LN-36", points: [[-14, 0.2, -34.6], [-14, 2.6, -34.6], [-14, 2.6, -30], [-14, 1.7, -30]] },
  { edgeId: "LN-37", points: [[16.6, 12.5, -7.6], [16.6, 10.7, -7.6], [16.6, 10.7, -18.5], [19, 10.7, -18.5], [19, -1.7, -18.5], [19, -1.7, -32.6]] },
  { edgeId: "LN-38", points: [[17.2, 6.5, -1.6], [17.2, 4.7, -1.6], [17.2, 4.7, -17.5], [20.4, 4.7, -17.5], [20.4, -1.7, -17.5], [20.4, -1.7, -32.6]] },
  { edgeId: "LN-39", points: [[13, -1.7, -32.6], [13, 0.2, -32.6]] },
  { edgeId: "LN-40", points: [[13, 0.2, -32.6], [13, 2.6, -32.6], [13, 2.6, -30], [13, 1.7, -30]] },
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
  { id: "T-01", name: "Director of Wet Things", initials: "DW", role: "Shift lead, life support" },
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
