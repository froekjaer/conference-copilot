// Conference Co-Pilot — hovedproces.
// To vinduer: kontrolpanelet og det gennemsigtige undertekst-overlay.
// Al logik er pakket i try/catch, saa netvaerks- og lysfejl aldrig braender appen ned.
import { app, BrowserWindow, ipcMain, screen, safeStorage, dialog } from "electron";
import { join, dirname } from "node:path";
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from "node:fs";
import {
  transkriber, oversaet, demoTranksriber, demoOversaet,
  byggTranskriptLinje, byggTranskriptJson, beskrivFejl,
  STANDARD_BASE_URL, STANDARD_STT_MODEL, STANDARD_MT_MODEL,
} from "./pipeline.js";
import {
  laesIndstillinger, gemIndstillinger, gemHemmelighed, laesHemmelighed, sletHemmelighed,
  sikrMappe, STANDARD_INDSTILLINGER,
} from "./storage.js";

const SELFTEST = process.argv.includes("--selftest");
const dataMappe = app.isPackaged ? join(dirname(process.execPath), "data") : join(app.getAppPath(), "data");
const indstillingerFil = join(dataMappe, "indstillinger.json");
const hemmelighedFil = join(dataMappe, "hemmelighed.bin");
const transskriptMappe = join(dataMappe, "transskriptioner");
sikrMappe(join(dataMappe, "x"));

let kontrolVindue = null;
let overlayVindue = null;
let indstillinger = laesIndstillinger(indstillingerFil);
let demoSekvens = 0;

const krypto = {
  tilgaengelig: () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } },
  kryptér: (s) => safeStorage.encryptString(s),
  dekryptér: (buf) => { try { return safeStorage.decryptString(buf); } catch { return ""; } },
};

function hentNoegle() {
  const fraMiljoe = process.env.CO_PILOT_API_KEY;
  if (fraMiljoe && fraMiljoe.trim()) return { noegle: fraMiljoe.trim(), kilde: "miljøvariabel" };
  const laest = laesHemmelighed(hemmeligFil, krypto);
  return laest.ok ? { noegle: laest.noegle, kilde: "DPAPI" } : { noegle: "", kilde: "ingen" };
}

// ---------------------------------------------------------------- vinduer
function opretKontrol() {
  kontrolVindue = new BrowserWindow({
    width: 940, height: 700, minWidth: 820, minHeight: 560,
    title: "Conference Co-Pilot",
    backgroundColor: "#12151c",
    webPreferences: { preload: join(app.getAppPath(), "src", "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  kontrolVindue.loadFile(join(app.getAppPath(), "src", "renderer", "index.html"));
  kontrolVindue.on("closed", () => { kontrolVindue = null; });
  if (SELFTEST) kontrolVindue.webContents.on("did-finish-load", () => setTimeout(() => koerSelftest(), 1200));
}

function opretOverlay() {
  const skaerm = vaelgSkærm(indstillinger?.overlay?.skaermId);
  const { x, y, width, height } = overlayGeometri(skaerm);
  overlayVindue = new BrowserWindow({
    x, y, width, height,
    transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
    resizable: false, movable: false, focusable: false, show: false,
    webPreferences: { preload: join(app.getAppPath(), "src", "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  overlayVindue.setAlwaysOnTop(true, "screen-saver");
  overlayVindue.setIgnoreMouseEvents(indstillinger.overlay.klikGennem !== false, { forward: true });
  overlayVindue.loadFile(join(app.getAppPath(), "src", "renderer", "overlay.html"));
  overlayVindue.once("ready-to-show", () => {
    overlayVindue.showInactive();
    sendOverlayConfig();
  });
  overlayVindue.on("closed", () => { overlayVindue = null; });
}

function vaelgSkærm(skaermId) {
  const alle = screen.getAllDisplays();
  if (skaermId && alle.some((d) => d.id === skaermId)) return alle.find((d) => d.id === skaermId);
  return screen.getPrimaryDisplay();
}

function overlayGeometri(skaerm) {
  const a = skaerm.workArea;
  const hoejde = Math.max(120, Math.round(a.height * 0.22));
  return { x: a.x + Math.round(a.width * 0.05), y: a.y + a.height - hoejde - 24, width: Math.round(a.width * 0.9), height: hoejde };
}

function placerOverlay() {
  if (!overlayVindue) return;
  const skaerm = vaelgSkærm(indstillinger?.overlay?.skaermId);
  const g = overlayGeometri(skaerm);
  overlayVindue.setBounds(g);
  overlayVindue.setIgnoreMouseEvents(indstillinger.overlay.klikGennem !== false, { forward: true });
}

function sendOverlayConfig() {
  if (!overlayVindue) return;
  overlayVindue.webContents.send("overlay:config", {
    skriftStoerrelse: indstillinger.overlay.skriftStoerrelse,
    baggrundAlpha: indstillinger.overlay.baggrundAlpha,
    visKilde: indstillinger.overlay.visKilde,
  });
}

// ---------------------------------------------------------------- IPC
const svar = (fn) => async (_evt, ...args) => {
  try { return { ok: true, ...(await fn(...args)) }; }
  catch (e) { return { ok: false, fejl: beskrivFejl(e) }; }
};

ipcMain.handle("info", svar(async () => {
  const n = hentNoegle();
  return { version: app.getVersion(), dataMappe, pakket: app.isPackaged, noegleKilde: n.kilde, harNoegle: Boolean(n.noegle), kryptering: krypto.tilgaengelig() };
}));

ipcMain.handle("displays", svar(async () => ({
  skaerme: screen.getAllDisplays().map((d, i) => ({ id: d.id, indeks: i, primaer: d.id === screen.getPrimaryDisplay().id, bounds: d.bounds, scaleFactor: d.scaleFactor })),
})));
ipcMain.handle("audio:permissions", svar(async () => {
  // Paa Windows er mikrofonadgang styret af systemindstillinger; vi spoerger Chromium.
  return { ok: true };
}));

ipcMain.handle("settings:get", svar(async () => ({ indstillinger })));
ipcMain.handle("settings:set", svar(async (del) => {
  indstillinger = { ...indstillinger, ...del, overlay: { ...indstillinger.overlay, ...(del?.overlay || {}) } };
  gemIndstillinger(indstillingerFil, indstillinger);
  placerOverlay();
  sendOverlayConfig();
  return { indstillinger };
}));

ipcMain.handle("secrets:status", svar(async () => {
  const n = hentNoegle();
  return { harNoegle: Boolean(n.noegle), kilde: n.kilde, kryptering: krypto.tilgaengelig() };
}));
ipcMain.handle("secrets:set", svar(async (noegle) => {
  if (!noegle || !String(noegle).trim()) throw new Error("tom noegle");
  const r = gemHemmelighed(hemmelighedFil, String(noegle).trim(), krypto);
  if (!r.ok) throw new Error(r.fejl);
  return { kilde: "DPAPI" };
}));
ipcMain.handle("secrets:clear", svar(async () => { sletHemmelighed(hemmelighedFil); return { slettet: true }; }));

ipcMain.handle("overlay:config", svar(async (del) => {
  indstillinger.overlay = { ...indstillinger.overlay, ...(del || {}) };
  gemIndstillinger(indstillingerFil, indstillinger);
  placerOverlay();
  sendOverlayConfig();
  return { overlay: indstillinger.overlay };
}));
ipcMain.handle("overlay:tekst", svar(async ({ kilde, oversat }) => {
  if (!overlayVindue) return { sendt: false };
  overlayVindue.webContents.send("overlay:tekst", { kilde: kilde || "", oversat: oversat || "" });
  return { sendt: true };
}));
ipcMain.handle("overlay:vis", svar(async (vis) => {
  if (!overlayVindue) return { synlig: false };
  if (vis) overlayVindue.showInactive(); else overlayVindue.hide();
  return { synlig: Boolean(vis) };
}));

ipcMain.handle("stt:transcribe", svar(async ({ buffer, mimeType, language }) => {
  if (indstillinger.provider === "demo") { const t = demoTranksriber(demoSekvens++); return { tekst: t, demo: true }; }
  const { noegle } = hentNoegle();
  if (!noegle) throw new Error("ingen API-noegle sat (Demo-tilstand kan bruges)");
  const r = await transkriber({
    audioBuffer: Buffer.from(buffer), mimeType,
    apiKey: noegle,
    baseUrl: indstillinger.baseUrl || STANDARD_BASE_URL,
    model: indstillinger.sttModel || STANDARD_STT_MODEL,
    language: language || indstillinger.kildeSprog || "",
  });
  if (!r.ok) throw new Error(r.fejl);
  return { tekst: r.tekst };
}));

ipcMain.handle("mt:translate", svar(async ({ tekst, fra, til }) => {
  if (indstillinger.provider === "demo") return { tekst: demoOversaet(tekst), demo: true };
  const { noegle } = hentNoegle();
  if (!noegle) throw new Error("ingen API-noegle sat (Demo-tilstand kan bruges)");
  const r = await oversaet({
    tekst, fra: fra || indstillinger.kildeSprog, til: til || indstillinger.maalSprog,
    apiKey: noegle,
    baseUrl: indstillinger.baseUrl || STANDARD_BASE_URL,
    model: indstillinger.mtModel || STANDARD_MT_MODEL,
  });
  if (!r.ok) throw new Error(r.fejl);
  return { tekst: r.tekst };
}));

ipcMain.handle("transcript:append", svar(async ({ kilde, oversat }) => {
  sikrMappe(join(transskriptMappe, "x"));
  const d = new Date();
  const navn = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  appendFileSync(join(transskriptMappe, `${navn}.txt`), byggTranskriptLinje({ kilde, oversat, fra: indstillinger.kildeSprog, til: indstillinger.maalSprog, dato: d }), "utf8");
  appendFileSync(join(transskriptMappe, `${navn}.jsonl`), byggTranskriptJson({ kilde, oversat, fra: indstillinger.kildeSprog, til: indstillinger.maalSprog, dato: d }), "utf8");
  return { fil: join(transskriptMappe, `${navn}.txt`) };
}));

ipcMain.handle("transcript:mappe", svar(async () => ({ mappe: transskriptMappe })));
ipcMain.handle("test:forbindelse", svar(async () => {
  if (indstillinger.provider === "demo") return { svar: "(demo)", demo: true };
  const { noegle } = hentNoegle();
  if (!noegle) throw new Error("ingen API-noegle sat");
  const r = await oversaet({ tekst: "Test.", fra: "da", til: "en", apiKey: noegle, baseUrl: indstillinger.baseUrl, model: indstillinger.mtModel });
  if (!r.ok) throw new Error(r.fejl);
  return { svar: r.tekst };
}));

// ---------------------------------------------------------------- selftest
async function koerSelftest() {
  const rapport = { tid: new Date().toISOString(), pakket: app.isPackaged, version: app.getVersion(), trin: [] };
  const tilfoej = (navn, ok, detalje) => rapport.trin.push({ navn, ok, detalje: String(detalje ?? "").slice(0, 200) });
  try {
    tilfoej("vinduer", Boolean(kontrolVindue && overlayVindue), `kontrol=${Boolean(kontrolVindue)} overlay=${Boolean(overlayVindue)}`);
    tilfoej("skaerme", screen.getAllDisplays().length >= 1, `antal=${screen.getAllDisplays().length}`);
    // enheder spoerges i renderer (kraever getUserMedia)
    const enheder = await kontrolVindue.webContents.executeJavaScript("window.__selftestEnheder ? window.__selftestEnheder() : Promise.resolve(null)");
    tilfoej("lydenheder", Boolean(enheder && enheder.length), JSON.stringify(enheder || []).slice(0, 180));
    const mikrofonsvar = await kontrolVindue.webContents.executeJavaScript("window.__selftestMikrofon ? window.__selftestMikrofon() : Promise.resolve(null)");
    tilfoej("mikrofon-capture", Boolean(mikrofonsvar?.ok), JSON.stringify(mikrofonsvar || {}).slice(0, 180));

    // overlay-tekst + skaermbillede
    overlayVindue.webContents.send("overlay:tekst", { kilde: "Velkommen til konferencen.", oversat: "Welcome to the conference." });
    await new Promise((r) => setTimeout(r, 900));
    const billede = await overlayVindue.webContents.capturePage();
    const png = billede.toPNG();
    writeFileSync(join(dataMappe, "selftest-overlay.png"), png);
    tilfoej("overlay-render", png.length > 1000, `png=${png.length} bytes`);

    // transskript-skrivning
    const d = new Date();
    appendFileSync(join(transskriptMappe, "selftest.txt"), byggTranskriptLinje({ kilde: "selftest kilde", oversat: "selftest translation", fra: "da", til: "en", dato: d }), "utf8");
    tilfoej("transskript-skrivning", existsSync(join(transskriptMappe, "selftest.txt")), join(transskriptMappe, "selftest.txt"));

    // demo-pipeline (simuleret STT+MT uden noegle)
    const t = demoTranksriber(0);
    tilfoej("demo-stt", Boolean(t), t);
    tilfoej("demo-mt", Boolean(demoOversaet(t)), demoOversaet(t));
    tilfoej("kryptering-tilgaengelig", krypto.tilgaengelig(), "safeStorage/DPAPI");
  } catch (e) {
    tilfoej("uventet-fejl", false, beskrivFejl(e));
  }
  writeFileSync(join(dataMappe, "selftest-rapport.json"), JSON.stringify(rapport, null, 2), "utf8");
  console.log("SELFTEST " + JSON.stringify(rapport));
  app.exit(rapport.trin.every((t) => t.ok) ? 0 : 1);
}

// ---------------------------------------------------------------- opstart
app.whenReady().then(() => {
  opretKontrol();
  opretOverlay();
  app.on("activate", () => { if (!kontrolVindue) opretKontrol(); });
});
app.on("window-all-closed", () => app.quit());
process.on("uncaughtException", (e) => { try { console.error("uventet fejl:", beskrivFejl(e)); } catch { /* intet */ } });
