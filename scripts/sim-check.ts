/**
 * Headless verification of the simulation against the reference scenario.
 * Run with: npm run sim:check
 */
import { EDGES, PIPE_ROUTES, TANKS } from "../src/lib/data/facility";
import { advanceUntil, createInitialState, replay } from "../src/lib/simulation/engine";
import { facilityKpis } from "../src/lib/simulation/kpi";
import { tankReading } from "../src/lib/simulation/readings";
import { PRESETS, hms } from "../src/lib/simulation/scenario";
import { downstreamTanks, tankInfrastructure } from "../src/lib/topology/graph";
import { clock } from "../src/lib/format";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

// Routes cover every edge.
const routed = new Set(PIPE_ROUTES.map((r) => r.edgeId));
check("every graph edge has a physical route", EDGES.every((e) => routed.has(e.id)), EDGES.filter((e) => !routed.has(e.id)).map((e) => e.id).join(","));

// Topology
check("C-2 downstream tanks are B and C", JSON.stringify(downstreamTanks("PMP-C2")) === JSON.stringify(["TNK-B", "TNK-C"]), downstreamTanks("PMP-C2").join(","));
check("C-1 downstream tanks are A, D, E, F", JSON.stringify(downstreamTanks("PMP-C1")) === JSON.stringify(["TNK-A", "TNK-D", "TNK-E", "TNK-F"]));
const infraB = tankInfrastructure("TNK-B");
check("Tank B primary C-2, backup C-3", infraB.primaryPumps.join() === "PMP-C2" && infraB.backupPumps.join() === "PMP-C3", JSON.stringify(infraB.primaryPumps.concat(infraB.backupPumps)));

// Baseline
const base = createInitialState();
const bk = facilityKpis(base);
check("baseline: all tanks 100%", TANKS.every((t) => Math.abs(base.tanks[t.id].flowPct - 100) < 1e-6));
check("baseline: no incidents", base.incidents.length === 0);
check("baseline: avg temp ≈ 26.5", bk.avgTemp.toFixed(1) === "26.5", bk.avgTemp.toFixed(3));

// Reference incident
const preset = PRESETS.find((p) => p.id === "incident")!;
const s = replay(preset.commands, preset.target);
const k = facilityKpis(s);
console.log("\nTimeline:");
for (const e of s.events) console.log(`  ${clock(e.t)}  [${e.kind}] ${e.title}`);
console.log("");
for (const t of TANKS) {
  const r = tankReading(s, t.id);
  console.log(`  ${t.name}: ${s.tanks[t.id].flowPct.toFixed(2)}%  ${r.temp.toFixed(2)}°C  pH ${r.ph.toFixed(2)}  DO ${r.dissolvedO2.toFixed(2)}`);
}
for (const id of ["PMP-C1", "PMP-C2", "PMP-C3"]) console.log(`  ${id}: ${s.pumps[id].mode} output ${(s.pumps[id].output * 100).toFixed(1)}% delivered ${(s.pumpDelivered[id] ?? 0).toFixed(1)}`);

check("incident: Tank B at 45%", Math.round(s.tanks["TNK-B"].flowPct) === 45, s.tanks["TNK-B"].flowPct.toFixed(2));
check("incident: Tank C at 50%", Math.round(s.tanks["TNK-C"].flowPct) === 50, s.tanks["TNK-C"].flowPct.toFixed(2));
check("incident: A, D, E, F at 100%", ["TNK-A", "TNK-D", "TNK-E", "TNK-F"].every((id) => Math.abs(s.tanks[id].flowPct - 100) < 1e-6));
check("incident: C-2 fault", s.pumps["PMP-C2"].mode === "fault");
check("incident: C-3 running at 60%", s.pumps["PMP-C3"].mode === "running" && Math.abs(s.pumps["PMP-C3"].output - 0.6) < 1e-9);
check("incident: aggregate 83%", k.aggregateFlowDisplay === 83, k.aggregateFlow.toFixed(2));
check("incident: shortfall 17%", k.shortfallDisplay === 17);
check("incident: avg temp 26.5", k.avgTemp.toFixed(1) === "26.5", k.avgTemp.toFixed(3));
check("incident: B pH displays 7.7", tankReading(s, "TNK-B").ph.toFixed(1) === "7.7");
check("incident: C pH displays 7.6", tankReading(s, "TNK-C").ph.toFixed(1) === "7.6");
const inc = s.incidents[0];
check("incident: INC-1042 grouped, affects B and C", inc?.id === "INC-1042" && inc.affectedTankIds.join() === "TNK-B,TNK-C");
check("incident: diagnosis confirmed overcurrent", inc?.diagnosis.confidence === "confirmed");
check("incident: opened at 10:10:00", inc?.openedAt === hms(10, 10));
const at = (kind: string) => s.events.find((e) => e.kind === kind)?.t ?? -1;
check("event: low-flow alarm at 10:11", clock(at("alarm")).startsWith("10:11"), clock(at("alarm")));
check("event: auto-transfer at 10:12", clock(at("transfer")).startsWith("10:12"), clock(at("transfer")));
check("event: backup confirmed at 10:13", clock(at("backup")).startsWith("10:13"), clock(at("backup")));
check("event: stabilized at 10:14", clock(at("stable")).startsWith("10:14"), clock(at("stable")));
check("event: status at 10:24", clock(at("status")).startsWith("10:24"), clock(at("status")));
check("only one alarm entry (grouped)", s.events.filter((e) => e.kind === "alarm").length === 1);

// Recovery
s.commands.push({ t: s.t + 1, type: "recover", assetId: "PMP-C2" });
const resolved = advanceUntil(s, (x) => x.incidents[0].status === "resolved", 600);
check("recovery: incident resolves", resolved, clock(s.t));
check("recovery: all tanks ≥ 99%", TANKS.every((t) => s.tanks[t.id].flowPct > 99));
advanceUntil(s, (x) => x.pumps["PMP-C3"].mode === "standby", 120);
check("recovery: C-3 back in standby", s.pumps["PMP-C3"].mode === "standby");
check("recovery: V-301 closed", s.valves["V-301"].open === 0);
console.log("\nRecovery events:");
for (const e of s.events.filter((e) => e.t > hms(10, 24))) console.log(`  ${clock(e.t)}  [${e.kind}] ${e.title}`);

// Generic graph: C-1 failure affects only Loop 1 tanks and has no backup.
const c1 = replay([{ t: hms(10, 1), type: "inject-fault", assetId: "PMP-C1" }], hms(10, 6));
check("C-1 fault: A, D, E, F lose flow; B, C unaffected",
  ["TNK-A", "TNK-D", "TNK-E", "TNK-F"].every((id) => c1.tanks[id].flowPct < 5) && ["TNK-B", "TNK-C"].every((id) => c1.tanks[id].flowPct === 100));

// Second scenario: sand filter F-1 blockage limits Loop 1 only.
const fp = PRESETS.find((p) => p.id === "filter")!;
const f = replay(fp.commands, fp.target);
console.log("\nFilter scenario timeline:");
for (const e of f.events) console.log(`  ${clock(e.t)}  [${e.kind}] ${e.title}`);
const loop1 = ["TNK-A", "TNK-D", "TNK-E", "TNK-F"];
const fflows = loop1.map((id) => f.tanks[id].flowPct);
check("filter: Loop 1 tanks degraded (60–90 %)", fflows.every((v) => v >= 60 && v < 90), fflows.map((v) => v.toFixed(1)).join(","));
check("filter: Loop 2 tanks unaffected", f.tanks["TNK-B"].flowPct === 100 && f.tanks["TNK-C"].flowPct === 100);
check("filter: incident rooted at FLT-1 affecting A, D, E, F", f.incidents[0]?.rootAssetId === "FLT-1" && f.incidents[0].affectedTankIds.join() === "TNK-A,TNK-D,TNK-E,TNK-F", f.incidents[0]?.affectedTankIds.join());
check("filter: high DP alarm raised", f.events.some((e) => e.kind === "fault" && e.title.includes("differential pressure")));
check("filter: degraded-circulation warning grouped", f.events.filter((e) => e.kind === "alarm").length === 1);
check("filter: stabilized", f.incidents[0]?.stabilizedAt !== undefined);
f.commands.push({ t: f.t + 1, type: "backwash", assetId: "FLT-1" });
check("filter: backwash resolves the incident", advanceUntil(f, (x) => x.incidents[0].status === "resolved", 900), clock(f.t));
check("filter: all tanks back to design", TANKS.every((t) => f.tanks[t.id].flowPct > 99));

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
