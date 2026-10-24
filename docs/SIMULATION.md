# AquaLink simulation model

Everything AquaLink shows — 3D labels, flow animation, KPIs, incident cards, the
timeline, tasks and the handover — is derived from one deterministic simulation.
This document explains the configuration and the assumptions behind the numbers.

**All values are demonstration data.** They are not measurements from a real
facility and are not validated against a real life-support plant.

Source files:

| File | Role |
|---|---|
| `src/lib/data/facility.ts` | Facility configuration: floors, tanks, pumps, filters, valves, headers, sensors, logical edges, physical pipe routes, thresholds |
| `src/lib/topology/graph.ts` | Directed dependency graph and traversal (downstream tanks, supply paths, tank infrastructure) |
| `src/lib/simulation/hydraulics.ts` | Steady-state hydraulic solver |
| `src/lib/simulation/engine.ts` | 1-second step engine: pump dynamics, auto-transfer, alarms, incidents, events |
| `src/lib/simulation/readings.ts` | Simulated sensor readings (deterministic measurement noise) |
| `src/lib/simulation/kpi.ts` | Facility KPIs and their definitions |
| `src/lib/simulation/scenario.ts` | Presets and scenario stages |
| `scripts/sim-check.ts` | Headless verification (`npm run sim:check`) |

## 1. Topology

The logical graph (`EDGES`) is directed in the direction of water flow:

```
Loop 1 (Atrium & west)                         Loop 2 (East gallery)
FLT-1 ─► PMP-C1 ─► V-101 ─► HDR-1 ─┬► V-102 ─► Tank A      FLT-2 ─► SH-2 ─┬► PMP-C2 ─► V-201 ─┐
                                   ├► V-103 ─► Tank D                     └► PMP-C3 ─► V-301 ─┴► HDR-2 ─┬► V-202 ─► Tank B
                                   ├► V-104 ─► Tank E                        (backup, V-301 normally closed)   └► V-203 ─► Tank C
                                   └► V-105 ─► Tank F
Returns: Tanks A, D, E, F ─► RH-1 ─► V-110 ─► FLT-1        Returns: Tanks B, C ─► RH-2 ─► V-210 ─► FLT-2
```

The physical routing of each pipe (`PIPE_ROUTES`) is stored separately from the
graph. The graph says *what* is connected; the routes say *where* the pipe runs
(B1 headers, risers in the service shafts, branches under the gallery decks).

## 2. Hydraulic solver

Each simulated second:

1. Every pump **offers** `output fraction × rated flow`.
2. Offered flow moves along supply edges in topological order. Closed valves block flow.
3. Each tank branch is limited to the tank's **design flow** (flow-control limit).
4. At a header, offered flow is shared between branches by **branch weight**
   ("water-filling"): a branch that hits its limit is capped and the remainder is
   shared among the others. Anything not accepted is recirculated.
5. Pumps then **deliver** only what the network accepted (back-propagated).
6. Suction and return flows follow from mass balance.

Tank circulation % = accepted tank flow ÷ tank design flow.

## 3. Reference configuration

| Asset | Value | Note |
|---|---|---|
| Tank A / D / E / F design flow | 480 / 120 / 130 / 110 m³/h | Loop 1 total 840 m³/h |
| Tank B / C design flow | 200 / 180 m³/h | Loop 2 total 380 m³/h |
| C-1 rated | 900 m³/h | Delivers 840 m³/h (all Loop 1 tanks at 100 %) |
| C-2 rated | 420 m³/h | Delivers 380 m³/h normally |
| C-3 rated | 300 m³/h | Standby duty for Loop 2 |
| C-3 backup output | **60 % of rated** = 180 m³/h | Emergency setpoint of the standby drive |
| HDR-2 branch weights | B : C = 1 : 1 | Balancing valves V-202 / V-203 set for an equal split |
| Auto-transfer delay | 120 s | C-2 in fault for 120 s → start C-3, open V-301 |
| C-3 soft-start ramp | 125 s to 100 % rated | Reaches its 60 % setpoint in 75 s |
| Coast-down | τ = 5 s | Output of a tripped pump decays exponentially |

### Why Tank B stabilises at 45 % and Tank C at 50 %

The backup pump's 60 % refers to **its own rated capacity**, not to tank circulation:

```
C-3 offered flow = 0.60 × 300 m³/h = 180 m³/h
HDR-2 equal split → 90 m³/h to Tank B, 90 m³/h to Tank C
Tank B = 90 / 200 = 45 %      Tank C = 90 / 180 = 50 %
```

Under normal operation C-2 offers 420 m³/h; the equal split would give 210 to
each branch, so Tank C caps at its 180 m³/h design flow and the remaining flow
fills Tank B to its 200 m³/h design — both at 100 %.

## 4. Failure sequence (reference preset)

The fault is injected at 10:09:56. Motor current rises for 4 s and the overcurrent
protection trips at 10:10:00. Every later timestamp is computed by the engine:

| Sim time | Event | Rule |
|---|---|---|
| 10:10:00 | C-2 stopped: motor overcurrent trip; INC-1042 opened | Peak current 148 % FLA > 125 % threshold → diagnosis *confirmed* |
| 10:11:03 | Tank B and Tank C flow degradation detected | Flow < 60 % for 60 s (low-flow alarm); alarms within 5 s are grouped |
| 10:12:00 | Auto-transfer: C-3 start command, V-301 opening | C-2 in fault for 120 s and C-3 available |
| 10:13:12 | C-3 backup running at 60 % rated output | Running confirmed at 95 % of setpoint |
| 10:14:00 | Tank B and Tank C stabilised at partial circulation | Affected flows unchanged (< 0.05 %) for 45 s and above 5 % |
| 10:24:00 | Two tanks remain affected | Status every 10 min after stabilisation while unresolved |

If no overcurrent signature precedes the stop (e.g. a standby pump that fails), the
root cause is labelled *suspected* rather than confirmed.

Recovery (`Recover` control) records an authorised restart of C-2 (30 s ramp). Ten
seconds after C-2 is confirmed running, C-3 returns to standby and V-301 closes.
The incident resolves once the root pump is running and every affected tank has
been at ≥ 90 % for 30 s.

## 5. Thresholds

| Threshold | Value | Use |
|---|---|---|
| Healthy | ≥ 90 % circulation | Green, "Healthy" |
| Degraded | 60 – 90 % | Amber |
| Reduced | 5 – 60 % | Red, "Flow reduced" |
| No circulation | < 5 % | Red, "No circulation" |
| Demonstration emergency minimum | 40 % | "Sufficient" backup coverage means every affected tank is at or above this. It is not a statement about biological safety. |

Water-quality ranges are habitat-specific (see each tank's `habitat` in
`facility.ts`).

## 6. Water quality

Temperature, pH and dissolved oxygen do **not** jump when a pump fails. They drift
slowly in proportion to the circulation deficit and relax back to baseline when
circulation is healthy:

| Quantity | Drift at 0 % circulation | Recovery |
|---|---|---|
| Temperature | +0.0018 °C/min | towards baseline, τ = 20 min |
| pH | −0.0024 /min | towards baseline, τ = 20 min |
| Dissolved O₂ | −0.012 mg/L/min | towards baseline, τ = 20 min |

At 10:24 in the reference incident Tank B reads 26.2 °C / pH 7.7 and Tank C 26.3 °C /
pH 7.6 — the same values the reference screenshots show — because the drift over
14 minutes is small.

Readings include a deterministic, smooth noise term (a function of simulated time
and sensor id) so live data moves without breaking reproducibility.

## 7. KPIs

| KPI | Definition | Reference incident |
|---|---|---|
| Aggregate circulation | Equal-weighted mean of the six tank circulation values | (4 × 100 + 45 + 50) / 6 = **82.5 % → 83 %** |
| Circulation shortfall | 100 − displayed aggregate (missing circulation, not a share of faulty equipment) | **17 %** |
| Average temperature | Simple mean of the six tank readings | 26.5 °C |
| Mean pH | Arithmetic mean of readings — indicative only, pH is logarithmic | 7.85 |
| Circulation availability | Share of sampled tank-time at ≥ 90 % since the scenario started | depends on elapsed time |
| Active loops | Loops where any tank receives flow | 2 / 2 |

## 8. Determinism and presets

The engine steps in fixed 1-second increments. A scenario is its **command log**
(e.g. `inject-fault PMP-C2 @ 10:09:56`); replaying the log from the healthy
baseline reproduces any moment exactly. The app persists the command log and the
current simulated time, so a reload rebuilds the same state.

Presets (`src/lib/simulation/scenario.ts`, also via URL):

| Preset | URL | State |
|---|---|---|
| Healthy baseline | `?scenario=baseline` | 10:00:00, all normal |
| Reference incident | `?scenario=incident` | 10:24:00, C-2 fault, C-3 backup, B 45 %, C 50 % |
| Fault onset | `?scenario=onset` | 10:10:20, C-2 tripped, before backup start |

`?mode=public|infrastructure|incident` and `?select=<asset id>` can be combined
with any preset.

## 9. What the simulation does not do

- It does not model pressure, pipe friction, pump curves, NPSH or transient surge.
- It does not model animal welfare; water-quality drift is a conservative illustration.
- It is not connected to any SCADA, BMS or CMMS system. Recommended actions are
  decision support only and never operate equipment.
