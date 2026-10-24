/**
 * Renders a still of each habitat from the running digital twin and saves it to
 * public/habitats/<tank id>.jpg. The gallery and asset panels use these files,
 * so the browser never has to render them at runtime.
 *
 *   node scripts/capture-habitats.mjs [baseUrl]
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3000";
const exe = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const outDir = path.join(process.cwd(), "public", "habitats");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: exe, headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`${base}/?scenario=baseline&mode=public`);
await page.waitForFunction(() => window.aqualinkThree?.gl && window.aqualink, null, { timeout: 120000 });
await page.waitForTimeout(6000);

const shots = await page.evaluate(async () => {
  const { gl, scene } = window.aqualinkThree;
  const tanks = window.aqualink.tanks;
  const W = 600;
  const H = 400;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const src = gl.domElement;
  // Reuse the page's own three.js classes via existing instances.
  const cam = window.aqualinkThree.camera.clone();
  cam.fov = 40;
  cam.aspect = src.width / src.height;
  cam.near = 0.2;
  cam.far = 200;
  cam.updateProjectionMatrix();
  const V3 = cam.position.constructor;
  const out = {};
  for (const t of tanks) {
    const cy = t.position[1] + t.plinth + Math.min(t.height, 6) * 0.48;
    const dist = t.radius * 2.15 + 1.2;
    // From the atrium side so columns and walls stay out of shot.
    const dir = new V3(-t.position[0] * 0.55, 0, 9 - t.position[2]).normalize();
    if (t.id === "TNK-A") dir.set(0.18, 0, 1).normalize();
    cam.position.set(t.position[0] + dir.x * dist, cy + 0.4, t.position[2] + dir.z * dist);
    cam.lookAt(t.position[0], cy, t.position[2]);
    cam.updateMatrixWorld();
    gl.setRenderTarget(null);
    gl.render(scene, cam);
    const ar = W / H;
    let sw = src.width;
    let sh = src.width / ar;
    if (sh > src.height) {
      sh = src.height;
      sw = sh * ar;
    }
    ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H);
    out[t.id] = canvas.toDataURL("image/jpeg", 0.86).split(",")[1];
  }
  return out;
});

for (const [id, b64] of Object.entries(shots)) {
  fs.writeFileSync(path.join(outDir, `${id}.jpg`), Buffer.from(b64, "base64"));
  console.log(`saved public/habitats/${id}.jpg`);
}
await browser.close();
