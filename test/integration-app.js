// Integrationstest: lydfil → transskription → engelsk oversaettelse → overlay-skemaermbillede.
// Kør som selvstaendig Electron-app (roerer ikke hovedappens filer):
//   electron test/integration-app.js --audio=<fil> --out=<sti uden endelse> [--demo] [--fra=da] [--til=en]
// Uden --demo kraever den CO_PILOT_API_KEY i miljoeet (noeglen vises eller logges aldrig).
import { app, BrowserWindow } from "electron";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { transkriber, oversaet, demoTranksriber, demoOversaet, beskrivFejl, STANDARD_STT_MODEL, STANDARD_MT_MODEL, STANDARD_BASE_URL } from "../src/pipeline.js";

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

const MIME = { ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".webm": "audio/webm", ".ogg": "audio/ogg", ".flac": "audio/flac" };

const soevn = (ms) => new Promise((r) => setTimeout(r, ms));
const sidsteSaetninger = (tekst, antal = 2) => {
  const s = String(tekst || "").split(/(?<=[.!?])\s+/).filter(Boolean);
  return s.slice(-antal).join(" ").trim();
};

app.whenReady().then(async () => {
  const start = Date.now();
  const rapport = {
    tid: new Date().toISOString(),
    demo,
    lydFil,
    fra,
    til,
    apiVaert: base ? new URL(base).host : new URL(STANDARD_BASE_URL).host,
    modeller: { stt: modelStt || STANDARD_STT_MODEL, mt: modelMt || STANDARD_MT_MODEL },
    trin: [],
  };
  const tilfoej = (navn, ok, detalje = "") => rapport.trin.push({ navn, ok, detalje: String(detalje).slice(0, 400) });

  const afslut = (kode) => {
    rapport.samletMs = Date.now() - start;
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

    // overlay-vindue oprettes foerst, saa vi kan maale lydens varighed og senere vise teksten
    const vindue = new BrowserWindow({
      width: 1100, height: 260, x: 40, y: 40, show: true,
      transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
      webPreferences: { preload: join(her, "..", "src", "preload.cjs"), contextIsolation: true, nodeIntegration: false },
    });
    await vindue.loadFile(join(her, "..", "src", "renderer", "overlay.html"));
    await soevn(400);

    const lydUrl = "file:///" + lydFil.replace(/\\/g, "/");
    const varighedSek = await vindue.webContents.executeJavaScript(
      `new Promise((res) => { try { const a = new Audio(${JSON.stringify(lydUrl)}); a.onloadedmetadata = () => res(a.duration); a.onerror = () => res(null); setTimeout(() => res(a.duration || null), 4000); } catch (e) { res(null); } })`
    );
    rapport.lydVarighedSek = varighedSek;

    // 1) transskription
    const t1 = Date.now();
    const stt = demo
      ? { ok: true, tekst: demoTranksriber(0) }
      : await transkriber({ audioBuffer: buffer, mimeType: mime, noegle, language: fra, model: modelStt || undefined, baseUrl: base || undefined });
    rapport.sttMs = Date.now() - t1;
    tilfoej("transskription", stt.ok === true && Boolean(stt.tekst), stt.ok ? stt.tekst : stt.fejl);
    if (!stt.ok) return afslut(1);

    // 2) oversaettelse
    const t2 = Date.now();
    const mt = demo
      ? { ok: true, tekst: demoOversaet(stt.tekst) }
      : await oversaet({ tekst: stt.tekst, fra, til, noegle, model: modelMt || undefined, baseUrl: base || undefined });
    rapport.mtMs = Date.now() - t2;
    if (mt.brug) rapport.mtBrug = mt.brug;
    tilfoej("oversaettelse", mt.ok === true && Boolean(mt.tekst), mt.ok ? mt.tekst : mt.fejl);
    if (!mt.ok) return afslut(1);

    // 3) overlay: vis de sidste saetninger (som en liveblok) og tag skaermbillede
    const t3 = Date.now();
    const visKilde = sidsteSaetninger(stt.tekst, 2);
    const visOversat = sidsteSaetninger(mt.tekst, 2);
    vindue.webContents.send("overlay:config", { skriftStoerrelse: 34, baggrundAlpha: 0.6, visKilde: true });
    vindue.webContents.send("overlay:tekst", { kilde: visKilde, oversat: visOversat });
    await soevn(900);
    const png = (await vindue.webContents.capturePage()).toPNG();
    rapport.overlayMs = Date.now() - t3;
    mkdirSync(dirname(udSti), { recursive: true });
    writeFileSync(`${udSti}.png`, png);
    tilfoej("overlay-render", png.length > 1000, `${png.length} bytes → ${udSti}.png`);

    rapport.kilde = stt.tekst;
    rapport.oversat = mt.tekst;
    rapport.overlayKilde = visKilde;
    rapport.overlayOversat = visOversat;
    return afslut(rapport.trin.every((t) => t.ok) ? 0 : 1);
  } catch (e) {
    tilfoej("uventet-fejl", false, beskrivFejl(e));
    return afslut(1);
  }
});
