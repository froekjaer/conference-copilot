// Renderer overlayet med et uddrag af en allerede gemt testrapport (ingen nye API-kald).
// Bruges til at lave et illustrativt bevisbillede af den RIGTIGE transskription og oversaettelse.
//   electron test/render-overlay.mjs --json=test/output/rigtig.json --fra=6 --til=7 --out=test/output/uddrag.png
import { app, BrowserWindow } from "electron";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const her = dirname(fileURLToPath(import.meta.url));
const arg = (navn, standard = null) => {
  const f = process.argv.find((a) => a.startsWith(`--${navn}=`));
  return f ? f.slice(navn.length + 3) : standard;
};

app.whenReady().then(async () => {
  const jsonFil = arg("json", join(her, "output", "rigtig.json"));
  const ud = arg("out", join(her, "output", "uddrag.png"));
  const fra = parseInt(arg("fra", "1"), 10);
  const til = parseInt(arg("til", "2"), 10);
  const data = JSON.parse(readFileSync(jsonFil, "utf8"));

  const saetninger = (t) => String(t || "").split(/(?<=[.!?])\s+/).filter(Boolean);
  const kilde = saetninger(data.kilde).slice(fra - 1, til).join(" ");
  const oversat = saetninger(data.oversat).slice(fra - 1, til).join(" ");

  const vindue = new BrowserWindow({
    width: 1100, height: 260, x: 40, y: 40, show: true,
    transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: join(her, "..", "src", "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  await vindue.loadFile(join(her, "..", "src", "renderer", "overlay.html"));
  await new Promise((r) => setTimeout(r, 400));
  vindue.webContents.send("overlay:config", { skriftStoerrelse: 34, baggrundAlpha: 0.6, visKilde: true });
  vindue.webContents.send("overlay:tekst", { kilde, oversat });
  await new Promise((r) => setTimeout(r, 900));
  const png = (await vindue.webContents.capturePage()).toPNG();
  mkdirSync(dirname(ud), { recursive: true });
  writeFileSync(ud, png);
  console.log(JSON.stringify({ ud, kilde, oversat, bytes: png.length }, null, 2));
  app.exit(0);
});
