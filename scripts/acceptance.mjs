/**
 * Automated acceptance run for the 12 critical tests in the brief.
 * Drives the real app in headless Chrome (local install) via playwright-core.
 *
 *   node scripts/acceptance.mjs [baseUrl] [screenshotDir]
 */
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3000";
const shots = process.argv[3];
const exe = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const results = [];
const record = (id, name, ok, detail = "") => {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ executablePath: exe, headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

const S = (fn, arg) => page.evaluate(fn, arg);
const state = () => S(() => window.aqualink.store.getState());
const act = (name, ...args) => S(([n, a]) => window.aqualink.store.getState()[n](...a), [name, args]);
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });

await page.goto(`${base}/?scenario=baseline&mode=public`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.aqualink && window.aqualinkThree, null, { timeout: 30000 });
await page.waitForTimeout(3000);

// ---------------------------------------------------------------- Test 1
{
  const positions = () =>
    S(() => {
      const out = {};
      window.aqualinkThree.scene.traverse((o) => {
        if (o.name && o.name.startsWith("proxy-TNK")) {
          o.updateWorldMatrix(true, false);
          const e = o.matrixWorld.elements;
          out[o.name] = [e[12], e[13], e[14]].map((n) => +n.toFixed(3));
        }
      });
      return out;
    });
  const snaps = [];
  for (const key of ["1", "2", "3", "1"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(1500);
    snaps.push({ mode: (await state()).mode, pos: await positions() });
  }
  const ref = JSON.stringify(snaps[0].pos);
  const same = snaps.every((s) => JSON.stringify(s.pos) === ref);
  const count = Object.keys(snaps[0].pos).length;
  const modes = snaps.map((s) => s.mode).join(",");
  record("T1", "Shared scene: tank IDs and positions identical across modes", same && count === 6 && modes === "public,infrastructure,incident,public", `${count} tanks, modes ${modes}`);
}

// ---------------------------------------------------------------- Test 2
{
  await act("resetScenario");
  await page.waitForTimeout(500);
  const s = await state();
  const all100 = Object.values(s.sim.tanks).every((t) => Math.abs(t.flowPct - 100) < 1e-6);
  const header = await page.locator("body > div header").first().innerText();
  record("T2", "Healthy baseline", all100 && s.sim.incidents.length === 0 && s.sim.pumps["PMP-C2"].mode === "running" && header.includes("All systems normal"), `C-2 ${s.sim.pumps["PMP-C2"].mode}, incidents ${s.sim.incidents.length}`);
}

// ---------------------------------------------------------------- Test 3 (via the UI)
{
  await page.getByRole("button", { name: "Scenario", exact: false }).first().click();
  await page.getByText("Simulate C-2 failure").click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Scenario", exact: false }).first().click().catch(() => {});
  // Let the transient run (auto fast-forward), then jump to stabilization.
  await page.waitForTimeout(2500);
  await act("stabilize");
  await page.waitForTimeout(600);
  const s = await state();
  const flows = Object.fromEntries(Object.entries(s.sim.tanks).map(([k, t]) => [k, Math.round(t.flowPct)]));
  const ok = flows["TNK-B"] === 45 && flows["TNK-C"] === 50 && ["TNK-A", "TNK-D", "TNK-E", "TNK-F"].every((k) => flows[k] === 100);
  record("T3", "Failure: only B and C impacted", ok && s.sim.incidents[0]?.affectedTankIds.join() === "TNK-B,TNK-C", JSON.stringify(flows));
}

// ---------------------------------------------------------------- Test 4
{
  const checks = [];
  for (const [key, mode] of [
    ["1", "public"],
    ["2", "infrastructure"],
    ["3", "incident"],
  ]) {
    await act("select", null);
    await page.keyboard.press(key);
    await page.waitForTimeout(1200);
    const b = await page.locator('[aria-label="3D facility labels"] button[aria-label^="Tank B,"]').innerText();
    const c = await page.locator('[aria-label="3D facility labels"] button[aria-label^="Tank C,"]').innerText();
    const panel = await page.locator('aside[aria-label="Details"]').innerText();
    const okB = b.includes("45%");
    const okC = c.includes("50%");
    const okPanel = mode === "public" ? panel.includes("2 tanks affected") : mode === "infrastructure" ? panel.includes("45%") && panel.includes("50%") : panel.includes("Tank B") && panel.includes("Tank C");
    checks.push(`${mode}:${okB && okC && okPanel ? "ok" : `B=${okB} C=${okC} panel=${okPanel}`}`);
    await shot(`t4-${mode}`);
  }
  record("T4", "Cross-view consistency (B 45%, C 50% in every view; panel agrees)", checks.every((c) => c.endsWith(":ok")), checks.join(" "));
}

// ---------------------------------------------------------------- Test 5
{
  const s = await state();
  const c3 = s.sim.pumps["PMP-C3"];
  const ev = s.sim.events.find((e) => e.kind === "backup");
  await act("select", null);
  await page.keyboard.press("2");
  await page.waitForTimeout(1000);
  const lbl = await page.locator('[aria-label="3D facility labels"] button[aria-label^="Circulation Pump C-3"]').innerText();
  const v301 = s.sim.valves["V-301"].open;
  record("T5", "Backup activation consistent (state, valve, label, timeline)", c3.mode === "running" && c3.covering && Math.abs(c3.output - 0.6) < 1e-9 && v301 === 1 && !!ev && lbl.includes("Backup (60%)"), `C-3 ${c3.mode} ${Math.round(c3.output * 100)}%, V-301 ${v301}, label "${lbl.replace(/\n/g, " ")}"`);
}

// ---------------------------------------------------------------- Test 6
{
  const panel = await page.locator('aside[aria-label="Details"]').innerText();
  record("T6", "Aggregate circulation 83% / shortfall 17%", panel.includes("83%") && panel.includes("17%"), panel.match(/\d+%\s*\n?Aggregate/)?.[0]?.replace(/\n/g, " ") ?? "");
}

// ---------------------------------------------------------------- Test 7
{
  await act("select", "PMP-C2");
  await page.waitForTimeout(400);
  await page.getByRole("tab", { name: "Connections" }).click();
  await page.waitForTimeout(300);
  const conn = await page.locator('aside[aria-label="Details"]').innerText();
  await act("select", "TNK-B");
  await page.waitForTimeout(400);
  const tank = await page.locator('aside[aria-label="Details"]').innerText();
  const okPump = /Downstream dependents[\s\S]*Tank B[\s\S]*Tank C/i.test(conn);
  const okTank = /Primary pump[\s\S]*C-2/i.test(tank) && /Backup pump[\s\S]*C-3/i.test(tank);
  record("T7", "Asset inspection (C-2 dependents; Tank B primary + backup)", okPump && okTank, `pump=${okPump} tank=${okTank}`);
}

// ---------------------------------------------------------------- Test 8
{
  await act("select", null);
  await page.keyboard.press("1");
  await page.waitForTimeout(1500);
  const cam = () => S(() => window.aqualinkThree.camera.position.toArray().map((n) => +n.toFixed(2)));
  const before = await cam();
  const box = await page.locator("#viewer canvas").boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  const afterOrbit = await cam();
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(900);
  const afterZoom = await cam();
  const depth = await S(() => {
    let minZ = Infinity;
    let maxZ = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let meshes = 0;
    window.aqualinkThree.scene.traverse((o) => {
      if (o.isMesh && o.geometry) {
        meshes++;
        o.geometry.computeBoundingBox?.();
        const b = o.geometry.boundingBox;
        if (!b) return;
        const e = o.matrixWorld.elements;
        minZ = Math.min(minZ, e[14] + b.min.z);
        maxZ = Math.max(maxZ, e[14] + b.max.z);
        minY = Math.min(minY, e[13] + b.min.y);
        maxY = Math.max(maxY, e[13] + b.max.y);
      }
    });
    return { meshes, zSpan: +(maxZ - minZ).toFixed(1), ySpan: +(maxY - minY).toFixed(1) };
  });
  const moved = JSON.stringify(before) !== JSON.stringify(afterOrbit) && JSON.stringify(afterOrbit) !== JSON.stringify(afterZoom);
  record("T8", "Real 3D navigation (orbit + zoom move a perspective camera through real geometry)", moved && depth.zSpan > 25 && depth.ySpan > 18, `cam ${before} → ${afterOrbit} → ${afterZoom}; ${depth.meshes} meshes, z-span ${depth.zSpan} m, y-span ${depth.ySpan} m`);
  await act("resetCamera");
}

// ---------------------------------------------------------------- Test 9 (via the UI)
{
  await page.getByRole("button", { name: /^Tasks/ }).click();
  await page.waitForTimeout(600);
  const first = page.locator("article").filter({ hasText: "Verify C-3 backup operation" }).first();
  await first.locator("button[aria-expanded]").first().click();
  await first.locator("select").first().selectOption({ label: "Priya Nair — Mechanical technician" });
  await first.locator('input[type="checkbox"]').first().check();
  await first.locator('input[placeholder^="Record"]').fill("C-3 discharge 2.1 bar, no abnormal vibration");
  await first.getByRole("button", { name: "Add" }).click();
  await page.waitForTimeout(300);
  const s = await state();
  const t = s.tasks.find((x) => x.id === "TSK-1042-1");
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 890 } });
  await act("openDialog", { handover: true });
  await page.waitForTimeout(600);
  const dlg = await page.getByRole("dialog").innerText();
  await shot("t9-handover");
  const ok = t.assigneeId === "T-02" && t.steps[0].done && t.notes.length === 1 && dlg.includes("Priya Nair") && dlg.includes("C-3 discharge 2.1 bar") && dlg.includes("1/4 steps") && dlg.includes("INC-1042");
  record("T9", "Workflow: assign, complete step, note, handover reflects changes", ok, `assignee ${t.assigneeId}, step1 ${t.steps[0].done}, notes ${t.notes.length}, status ${t.status}`);
  await act("openDialog", { handover: false });
}

// ---------------------------------------------------------------- Test 10
{
  await act("setSection", "facility");
  await act("recover");
  await page.waitForFunction(() => window.aqualink.store.getState().sim.incidents[0]?.status === "resolved", null, { timeout: 30000 });
  await page.waitForFunction(() => window.aqualink.store.getState().sim.pumps["PMP-C3"].mode === "standby", null, { timeout: 30000 });
  let s = await state();
  const restored = Object.values(s.sim.tanks).every((t) => t.flowPct > 99 && !t.lowFlowAlarm);
  const headerRecovered = await page.locator("body > div header").first().innerText();
  await act("resetScenario");
  await page.waitForTimeout(500);
  s = await state();
  const headerReset = await page.locator("body > div header").first().innerText();
  const clean = s.sim.incidents.length === 0 && s.sim.events.length === 0 && s.tasks.length === 0 && headerReset.includes("All systems normal");
  record("T10", "Recovery restores circulation; reset leaves no stale alerts", restored && headerRecovered.includes("All systems normal") && clean, `restored=${restored} clean=${clean}`);
}

// ---------------------------------------------------------------- Test 11
{
  await act("loadPreset", "incident");
  await page.keyboard.press("3");
  await page.waitForTimeout(800);
  const focusables = await page.locator('[aria-label="3D facility labels"] button').count();
  await page.focus('a[href="#main"]');
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const outline = await S(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { tag: el.tagName, outline: cs.outlineStyle, width: cs.outlineWidth };
  });
  await act("setMotionPref", "reduce");
  await page.waitForTimeout(200);
  const reduced = await S(() => document.querySelector("[data-reduced-motion]")?.getAttribute("data-reduced-motion"));
  await act("setMotionPref", "system");
  await page.keyboard.press("t");
  await page.waitForTimeout(500);
  const textView = await page.locator("#viewer").innerText();
  await shot("t11-textview");
  await page.keyboard.press("t");
  const okText = textView.includes("Tank B") && textView.includes("45%") && textView.includes("INC-1042");
  record("T11", "Accessibility (keyboard modes, focusable labels, focus ring, reduced motion, text view)", focusables >= 6 && outline.outline !== "none" && reduced === "true" && okText, `labels ${focusables}, focus ${outline.tag} ${outline.outline} ${outline.width}, reduced=${reduced}, textView=${okText}`);
}

// ---------------------------------------------------------------- Test 12
{
  const sections = [
    ["Assets", "Asset registry"],
    ["Incidents", "Incidents"],
    ["Tasks", "Maintenance tasks"],
    ["Analytics", "Analytics"],
    ["Settings", "Settings"],
    ["Facility", null],
  ];
  const navOk = [];
  for (const [name, heading] of sections) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
    await page.waitForTimeout(500);
    if (heading) navOk.push((await page.locator("main h1").first().innerText()).includes(heading));
  }
  const broken = await S(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length);
  const fatal = errors.filter((e) => !/Failed to load resource/.test(e));
  record("T12", "Production quality (sections work, no broken images, no runtime errors)", navOk.every(Boolean) && broken === 0 && fatal.length === 0, `sections ${navOk.filter(Boolean).length}/${navOk.length}, broken images ${broken}, errors ${fatal.length}${fatal.length ? `: ${fatal[0].slice(0, 160)}` : ""}`);
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} acceptance tests passed`);
process.exit(failed.length ? 1 : 0);
