// Integrationstest: lydfil → transskription → engelsk oversaettelse → overlay-skemaermbillede.
// Kør som selvstaendig Electron-app (roerer ikke hovedappens filer):
//   electron test/integration-app.js --audio=<fil> --out=<sti uden endelse> [--demo] [--fra=da] [--til=en]
// Uden --demo kraever den CO_PILOT_API_KEY i miljoeet (noeglen vises eller logges aldrig).
import { app, BrowserWindow } from "electron";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { transkriber, oversaet, demoTranksriber, demoOversaet, beskrivFejl } from "../src/pipeline.js";

const her = dirname(fileURLToPath(import.meta.url));
const arg = (navn, standard = null) => {
  const fundet = process.argv.find((a) => a.startsWith(`--${navn}=`));
  return fundet ? fundet.slice(navn.length + 3) : standard;
};
const lydFil = arg("audio");
const udSti = arg("out", join(her, "output", "integration"));
const demo = process.argv.includes("--demo");
const fra = arg("fra", "da");
const til = arg("til", "en");
const modelStt = arg("stt", undefined);
const modelMt = arg("mt", undefined);
const base = arg("base", undefined);
const noegle = process.env.CO_PILOT_API_KEY || "";

const MIME = { ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".webm": "audio/webm", ".ogg": "audio/ogg" };

const soevn = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const rapport = { tid: new Date().toISOString(), demo, lydFil, fra, til, trin: [] };
  const tilfoej = (navn, ok, detalje = "") => rapport.trin.push({ navn, ok, detalje: String(detalje).slice(0, 300) });

  const afslut = (kode) => {
    mkdirSync(dirname(udSti), { recursive: true });
    writeFileSync(`${udSti}.json`, JSON.stringify(rapport, null, 2), "utf8");
    console.log("INTEGRATION " + JSON.stringify(rapport));
    app.exit(kode);
  };

  try {
    if (!lydFil || !existsSync(lydFil)) { tilfoej("lydfil", false, `findes ikke: ${lydFil}`); return afslut(1); }
    const buffer = readFileSync(lydFil);
    const mime = MIME[extname(lydFil).toLowerCase()] || "audio/wav";
    tilfoej("lydfil", buffer.byteLength > 1200, `${buffer.byteLength} bytes, ${mime}`);

    if (!demo && !noegle) { tilfoej("api-noegle", false, "CO_PILOT_API_KEY er ikke sat — brug --demo eller sæt noeglen"); return afslut(1); }

    // 1) transskription
    const stt = demo
      ? { ok: true, tekst: demoTranksriber(0) }
      : await transkriber({ audioBuffer: buffer, mimeType: mime, noegle, language: fra, model: modelStt || undefined, baseUrl: base || undefined });
    tilfoej("transskription", stt.ok === true && Boolean(stt.tekst), stt.ok ? stt.tekst : stt.fejl);
    if (!stt.ok) return afslut(1);

    // 2) oversaettelse
    const mt = demo
      ? { ok: true, tekst: demoOversaet(stt.tekst) }
      : await oversaet({ tekst: stt.tekst, fra, til, noegle, model: modelMt || undefined, baseUrl: base || undefined });
    tilfoej("oversaettelse", mt.ok === true && Boolean(mt.tekst), mt.ok ? mt.tekst : mt.fejl);
    if (!mt.ok) return afslut(1);

    // 3) overlay: vis teksten og tag et skaermbillede
    const vindue = new BrowserWindow({
      width: 1100, height: 260, x: 40, y: 40, show: true,
      transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
      webPreferences: { preload: join(her, "..", "src", "preload.cjs"), contextIsolation: true, nodeIntegration: false },
    });
    await vindue.loadFile(join(her, "..", "src", "renderer", "overlay.html"));
    await soevn(500);
    vindue.webContents.send("overlay:config", { skriftStoerrelse: 34, baggrundAlpha: 0.6, visKilde: true });
    vindue.webContents.send("overlay:tekst", { kilde: stt.tekst, oversat: mt.tekst });
    await soevn(900);
    const png = (await vindue.webContents.capturePage()).toPNG();
    mkdirSync(dirname(udSti), { recursive: true });
    writeFileSync(`${udSti}.png`, png);
    tilfoej("overlay-render", png.length > 1000, `${png.length} bytes → ${udSti}.png`);

    rapport.kilde = stt.tekst;
    rapport.oversat = mt.tekst;
    return afslut(rapport.trin.every((t) => t.ok) ? 0 : 1);
  } catch (e) {
    tilfoej("uventet-fejl", false, beskrivFejl(e));
    return afslut(1);
  }
});
