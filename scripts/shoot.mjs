/**
 * Headless screenshots of the running app using the locally installed Chrome.
 *
 *   node scripts/shoot.mjs <url> <out.png> [width] [height] [waitMs] [stepsJson]
 *
 * stepsJson is an optional array of { click?: selector, key?: string, wait?: ms, eval?: js, shot?: path }.
 */
import { chromium } from "playwright-core";

const [, , url = "http://localhost:3000", out = "shot.png", w = "1600", h = "900", wait = "6000", stepsJson = "[]"] = process.argv;
const exe = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
});
page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(Number(wait));
for (const s of JSON.parse(stepsJson)) {
  if (s.click) await page.click(s.click, { timeout: 5000 });
  if (s.key) await page.keyboard.press(s.key);
  if (s.eval) console.log("eval:", JSON.stringify(await page.evaluate(s.eval)));
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) await page.screenshot({ path: s.shot });
}
await page.screenshot({ path: out });
if (logs.length) console.log(logs.join("\n"));
await browser.close();
