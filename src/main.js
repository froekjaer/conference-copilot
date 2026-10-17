// Conference Co-Pilot — hovedproces (v0.2).
// Kontrolpanel + gennemsigtigt overlay med flytbar placering, typografi og lydfil-input.
// Alle fejl fanges, saa netvaerks- og lydfejl ikke braender appen ned.
import { app, BrowserWindow, ipcMain, screen, safeStorage, dialog, shell } from "electron";
import { join, dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { writeFileSync, appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import {
  transkriber, oversaet, demoTranksriber, demoOversaet,
  byggTranskriptLinje, byggTranskriptJson, beskrivFejl,
  STANDARD_BASE_URL, STANDARD_STT_MODEL, STANDARD_MT_MODEL,
} from "./pipeline.js";
import {
  laesIndstillinger, gemIndstillinger, gemHemmelighed, laesHemmelighed, sletHemmelighed,
  sikrMappe, normaliserIndstillinger, STANDARD_INDSTILLINGER,
} from "./storage.js";
import { vaelgNoegle, laesNoegleFil } from "./noegle.js";
import { geometriFor, presetGeometri, standardStoerrelse, skaermNoegle, klamp } from "./layout.js";
import { skalProeveIgen } from "./flow.js";
import { UDBYDERE, MODELLER, validerValg } from "./modeller.js";

const SELFTEST = process.argv.includes("--selftest");
// Appen afspiller lydfiler programmatisk (og testerne gor det uden museklik)
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
const QUIT_TEST = process.argv.includes("--quit-test");
const LYDFIL_TEST = (process.argv.find((a) => a.startsWith("--lydfil-test=")) || "").split("=")[1] || "";
const STOP_TEST = (process.argv.find((a) => a.startsWith("--stop-test=")) || "").split("=")[1] || "";
const FRA_SEK = Number((process.argv.find((a) => a.startsWith("--fra=")) || "").split("=")[1] || 0);
const TVANG_DEMO = process.argv.includes("--demo");
const dataMappe = app.isPackaged ? join(dirname(process.execPath), "data") : join(app.getAppPath(), "data");
const indstillingerFil = join(dataMappe, "indstillinger.json");
const hemmelighedFil = join(dataMappe, "hemmelighed.bin");
const transskriptMappe = join(dataMappe, "transskriptioner");

let kontrolVindue = null;
let overlayVindue = null;
let indstillinger = laesIndstillinger(indstillingerFil);
let demoSekvens = 0;
let gemTid = null;
let afslutter = false;

const krypto = {
  tilgaengelig: () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } },
  kryptér: (s) => safeStorage.encryptString(s),
  dekryptér: (buf) => { try { return safeStorage.decryptString(buf); } catch { return ""; } },
};

function hentNoegle() {
  const dpapi = laesHemmelighed(hemmelighedFil, krypto);
  return vaelgNoegle({
    miljoe: process.env.CO_PILOT_API_KEY,
    noegleFil: indstillinger.noegleFil || "",
    dpapi: dpapi.ok ? dpapi.noegle : "",
  });
}

// ---------------------------------------------------------------- vinduer
function opretKontrol() {
  kontrolVindue = new BrowserWindow({
    width: 1020, height: 780, minWidth: 900, minHeight: 620,
    title: "Conference Co-Pilot",
    backgroundColor: "#12151c",
    webPreferences: { preload: join(app.getAppPath(), "src", "preload.cjs"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  kontrolVindue.loadFile(join(app.getAppPath(), "src", "renderer", "index.html"));
  kontrolVindue.on("closed", async () => {
    kontrolVindue = null;
    await lukOverlay();
    if (QUIT_TEST) {
      try { writeFileSync(join(dataMappe, "quit-test.json"), JSON.stringify({ tid: new Date().toISOString(), overlayVæk: !overlayVindue }, null, 2), "utf8"); } catch { /* intet */ }
    }
    app.quit();
  });
  if (SELFTEST) kontrolVindue.webContents.on("did-finish-load", () => setTimeout(() => koerSelftest(), 1500));
  if (LYDFIL_TEST) kontrolVindue.webContents.on("did-finish-load", () => setTimeout(() => koerLydfilTest(LYDFIL_TEST), 1500));
  if (STOP_TEST) kontrolVindue.webContents.on("did-finish-load", () => setTimeout(() => koerStopTest(STOP_TEST), 1500));
  if (QUIT_TEST) kontrolVindue.webContents.on("did-finish-load", () => setTimeout(() => { if (kontrolVindue) kontrolVindue.close(); }, 2500));
}

function vaelgSkaerm(skaermId) {
  const alle = screen.getAllDisplays();
  if (skaermId && alle.some((d) => d.id === skaermId)) return alle.find((d) => d.id === skaermId);
  return screen.getPrimaryDisplay();
}

function overlayConfig() {
  const o = indstillinger.overlay;
  return {
    skriftStoerrelse: o.skriftStoerrelse,
    skriftFamilie: o.skriftFamilie,
    tekstFarve: o.tekstFarve,
    konturFarve: o.konturFarve,
    konturPx: o.konturPx,
    skygge: o.skygge,
    baggrundFarve: o.baggrundFarve,
    baggrundAlpha: o.baggrundAlpha,
    justering: o.justering,
    visKilde: o.visKilde,
    maxLinjer: o.maxLinjer,
    redigering: o.redigering,
    klikGennem: o.klikGennem,
  };
}

function opretOverlay() {
  const skaerm = vaelgSkaerm(indstillinger.overlay.skaermId);
  const g = geometriFor(skaerm, indstillinger.overlay);
  overlayVindue = new BrowserWindow({
    ...g,
    transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
    resizable: false, movable: true, focusable: false, show: false,
    webPreferences: { preload: join(app.getAppPath(), "src", "preload.cjs"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  overlayVindue.setAlwaysOnTop(true, "screen-saver");
  overlayVindue.setIgnoreMouseEvents(!indstillinger.overlay.redigering, { forward: true });
  overlayVindue.loadFile(join(app.getAppPath(), "src", "renderer", "overlay.html"));
  overlayVindue.once("ready-to-show", () => {
    overlayVindue.showInactive();
    overlayVindue.webContents.send("overlay:config", overlayConfig());
  });
  overlayVindue.on("moved", () => planlaegGem());
  overlayVindue.on("closed", () => { overlayVindue = null; });
}

function planlaegGem() {
  clearTimeout(gemTid);
  gemTid = setTimeout(gemOverlayPlacering, 350);
}

function gemOverlayPlacering() {
  if (!overlayVindue || overlayVindue.isDestroyed()) return;
  const [x, y] = overlayVindue.getPosition();
  const [width, height] = overlayVindue.getSize();
  const skaerm = vaelgSkaerm(indstillinger.overlay.skaermId);
  indstillinger.overlay.placering.preset = "brugerdefineret";
  indstillinger.overlay.placering.prSkarm[skaermNoegle(skaerm)] = { x, y, width, height };
  indstillinger.overlay.breddePct = +(width / skaerm.workArea.width).toFixed(3);
  indstillinger.overlay.hoejdePct = +(height / skaerm.workArea.height).toFixed(3);
  gemIndstillinger(indstillingerFil, indstillinger);
}

function placerOverlay(geo) {
  if (!overlayVindue) return null;
  const skaerm = vaelgSkaerm(indstillinger.overlay.skaermId);
  const g = geo || geometriFor(skaerm, indstillinger.overlay);
  overlayVindue.setBounds(klamp(g, skaerm.workArea));
  return g;
}

// Lukker overlayet paent: skjul + gennemsigtigt foerst, saa Windows naar at fjerne billedet,
// derefter destroy. Uden dette kan den sidste undertekst blive staaende som et spook paa skaermen.
async function lukOverlay() {
  if (!overlayVindue || overlayVindue.isDestroyed()) { overlayVindue = null; return; }
  const v = overlayVindue;
  overlayVindue = null;
  try { v.setOpacity(0); } catch { /* intet */ }
  try { v.hide(); } catch { /* intet */ }
  await new Promise((r) => setTimeout(r, 180));
  try { if (!v.isDestroyed()) v.destroy(); } catch { /* intet */ }
}

// ---------------------------------------------------------------- skrifttyper
let skrifttyperCache = null;

/** Alle installerede skrifttyper fra Windows-registret (bade maskin- og brugerniveau). */
function laesSkrifttyper() {
  if (skrifttyperCache) return skrifttyperCache;
  const navne = new Set();
  const noegler = [
    "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
    "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
  ];
  for (const n of noegler) {
    try {
      const ud = execFileSync("reg", ["query", n], { encoding: "latin1", timeout: 5000, windowsHide: true });
      for (const linje of String(ud).split(/\r?\n/)) {
        if (!/REG_(SZ|EXPAND_SZ)/i.test(linje)) continue;
        const dele = linje.trim().split(/\s{2,}/);
        const navn = (dele[0] || "").replace(/\s*\((TrueType|OpenType)\)\s*$/i, "").trim();
        if (navn && !navn.startsWith("@")) navne.add(navn);
      }
    } catch { /* registret kan ikke laeses — spring over */ }
  }
  skrifttyperCache = [...navne].sort((a, b) => a.localeCompare(b, "da"));
  return skrifttyperCache;
}

// ---------------------------------------------------------------- IPC
const svar = (fn) => async (_evt, ...args) => {
  try { return { ok: true, ...(await fn(...args)) }; }
  catch (e) { return { ok: false, fejl: beskrivFejl(e) }; }
};

ipcMain.handle("info", svar(async () => {
  const n = hentNoegle();
  return {
    version: app.getVersion(), dataMappe, pakket: app.isPackaged,
    noegleKilde: n.kilde, harNoegle: Boolean(n.noegle), noegleFil: indstillinger.noegleFil || "",
    kryptering: krypto.tilgaengelig(),
  };
}));

ipcMain.handle("displays", svar(async () => ({
  skaerme: screen.getAllDisplays().map((d, i) => ({
    id: d.id, indeks: i, primaer: d.id === screen.getPrimaryDisplay().id,
    bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor,
  })),
})));

ipcMain.handle("skrifttyper", svar(async () => ({ skrifttyper: laesSkrifttyper() })));

ipcMain.handle("settings:get", svar(async () => ({ indstillinger })));
ipcMain.handle("settings:set", svar(async (del) => {
  indstillinger = normaliserIndstillinger({ ...indstillinger, ...del, overlay: { ...indstillinger.overlay, ...(del?.overlay || {}) } });
  gemIndstillinger(indstillingerFil, indstillinger);
  if (del?.overlay && ("skaermId" in del.overlay || "placering" in del.overlay)) placerOverlay();
  overlayVindue?.webContents.send("overlay:config", overlayConfig());
  return { indstillinger };
}));

ipcMain.handle("secrets:status", svar(async () => {
  const n = hentNoegle();
  return { harNoegle: Boolean(n.noegle), kilde: n.kilde, noegleFil: indstillinger.noegleFil || "", kryptering: krypto.tilgaengelig() };
}));
ipcMain.handle("secrets:set", svar(async (nyNoegle) => {
  if (!nyNoegle || !String(nyNoegle).trim()) throw new Error("tom noegle");
  const r = gemHemmelighed(hemmelighedFil, String(nyNoegle).trim(), krypto);
  if (!r.ok) throw new Error(r.fejl);
  return { kilde: "DPAPI" };
}));
ipcMain.handle("secrets:clear", svar(async () => { sletHemmelighed(hemmelighedFil); return { slettet: true }; }));
ipcMain.handle("secrets:proev-fil", svar(async (sti) => {
  const r = laesNoegleFil(sti);
  if (!r.ok) throw new Error(r.fejl);
  return { laest: true, sti: String(sti).trim() };
}));

ipcMain.handle("dialog:noeglefil", svar(async () => {
  const r = await dialog.showOpenDialog(kontrolVindue, {
    title: "Vælg fil med API-nøgle", properties: ["openFile"],
    filters: [{ name: "Nøglefiler", extensions: ["txt", "key", "env"] }, { name: "Alle filer", extensions: ["*"] }],
  });
  if (r.canceled || !r.filePaths[0]) return { annulleret: true };
  return { sti: r.filePaths[0] };
}));

ipcMain.handle("dialog:lydfil", svar(async () => {
  const r = await dialog.showOpenDialog(kontrolVindue, {
    title: "Vælg lydfil", properties: ["openFile"],
    filters: [{ name: "Lydfiler", extensions: ["wav", "mp3", "m4a", "flac", "ogg", "opus", "webm", "mp4"] }, { name: "Alle filer", extensions: ["*"] }],
  });
  if (r.canceled || !r.filePaths[0]) return { annulleret: true };
  return { sti: r.filePaths[0], navn: basename(r.filePaths[0]) };
}));

ipcMain.handle("fil:laes", svar(async (sti) => {
  if (!sti || !existsSync(sti)) throw new Error("filen findes ikke");
  const st = statSync(sti);
  if (st.size > 150 * 1024 * 1024) throw new Error("filen er større end 150 MB — vælg en mindre fil");
  const data = readFileSync(sti);
  return { navn: basename(sti), stoerrelse: st.size, base64: data.toString("base64") };
}));

ipcMain.handle("modeller", svar(async () => ({ udbydere: UDBYDERE, modeller: MODELLER, egne: indstillinger.egneModeller || [] })));
ipcMain.handle("modeller:valider", svar(async (valg) => validerValg({ ...(valg || {}), egne: indstillinger.egneModeller || [] })));

ipcMain.handle("overlay:config", svar(async (del) => {
  indstillinger.overlay = normaliserIndstillinger({ ...indstillinger, overlay: { ...indstillinger.overlay, ...(del || {}) } }).overlay;
  gemIndstillinger(indstillingerFil, indstillinger);
  overlayVindue?.webContents.send("overlay:config", overlayConfig());
  return { overlay: indstillinger.overlay };
}));

ipcMain.handle("overlay:redigering", svar(async (til) => {
  indstillinger.overlay.redigering = Boolean(til);
  gemIndstillinger(indstillingerFil, indstillinger);
  if (overlayVindue) {
    overlayVindue.setIgnoreMouseEvents(!til, { forward: true });
    overlayVindue.setFocusable(Boolean(til));
    if (til) overlayVindue.showInactive();
    overlayVindue.webContents.send("overlay:config", overlayConfig());
  }
  return { redigering: indstillinger.overlay.redigering };
}));

ipcMain.handle("overlay:preset", svar(async (preset) => {
  const skaerm = vaelgSkaerm(indstillinger.overlay.skaermId);
  indstillinger.overlay.placering.preset = preset;
  delete indstillinger.overlay.placering.prSkarm[skaermNoegle(skaerm)];
  const { w, h } = standardStoerrelse(skaerm.workArea, indstillinger.overlay.breddePct, indstillinger.overlay.hoejdePct);
  const g = presetGeometri(skaerm.workArea, preset, w, h);
  if (overlayVindue) overlayVindue.setBounds(g);
  gemIndstillinger(indstillingerFil, indstillinger);
  return { geometri: g };
}));

ipcMain.handle("overlay:stoerrelse", svar(async ({ breddePct, hoejdePct }) => {
  const skaerm = vaelgSkaerm(indstillinger.overlay.skaermId);
  if (Number.isFinite(Number(breddePct))) indstillinger.overlay.breddePct = Math.min(Math.max(Number(breddePct), 0.2), 1);
  if (Number.isFinite(Number(hoejdePct))) indstillinger.overlay.hoejdePct = Math.min(Math.max(Number(hoejdePct), 0.06), 0.9);
  const { w, h } = standardStoerrelse(skaerm.workArea, indstillinger.overlay.breddePct, indstillinger.overlay.hoejdePct);
  const nu = overlayVindue ? { x: overlayVindue.getPosition()[0], y: overlayVindue.getPosition()[1], width: overlayVindue.getSize()[0], height: overlayVindue.getSize()[1] } : geometriFor(skaerm, indstillinger.overlay);
  const g = klamp({ x: nu.x + (nu.width - w) / 2, y: nu.y + (nu.height - h) / 2, width: w, height: h }, skaerm.workArea);
  if (overlayVindue) overlayVindue.setBounds(g);
  planlaegGem();
  return { geometri: g };
}));

ipcMain.handle("overlay:tekst", svar(async ({ kilde, oversat, tid }) => {
  if (!overlayVindue) return { sendt: false };
  overlayVindue.webContents.send("overlay:tekst", { kilde: kilde || "", oversat: oversat || "", tid: tid || "" });
  return { sendt: true };
}));
ipcMain.handle("overlay:vis", svar(async (vis) => {
  if (!overlayVindue) return { synlig: false };
  if (vis) overlayVindue.showInactive(); else overlayVindue.hide();
  return { synlig: Boolean(vis) };
}));

ipcMain.handle("stt:transcribe", svar(async ({ buffer, mimeType, language, niveau }) => {
  if (indstillinger.demo || TVANG_DEMO) return { tekst: demoTranksriber(demoSekvens++), demo: true };
  const n = hentNoegle();
  if (!n.noegle) throw new Error("ingen API-nøgle sat (Demo-tilstand kan bruges)");
  const valg = {
    audioBuffer: Buffer.from(buffer), mimeType,
    noegle: n.noegle,
    baseUrl: indstillinger.baseUrl || STANDARD_BASE_URL,
    model: indstillinger.sttModel || STANDARD_STT_MODEL,
    language: language || indstillinger.kildeSprog || "",
  };
  const r = await transkriber(valg);
  if (!r.ok) throw new Error(r.fejl);

  // Den hurtige model kan sjældent returnere tomt paa tale — saa proever vi én gang med whisper-1
  if (skalProeveIgen(r.tekst, niveau, valg.model)) {
    const r2 = await transkriber({ ...valg, model: "whisper-1" });
    if (r2.ok && r2.tekst.trim()) return { tekst: r2.tekst, fallback: "whisper-1" };
  }
  return { tekst: r.tekst };
}));

ipcMain.handle("mt:translate", svar(async ({ tekst, fra, til, kontekst }) => {
  if (indstillinger.demo || TVANG_DEMO) return { tekst: demoOversaet(tekst), demo: true };
  const n = hentNoegle();
  if (!n.noegle) throw new Error("ingen API-nøgle sat (Demo-tilstand kan bruges)");
  const r = await oversaet({
    tekst, fra: fra || indstillinger.kildeSprog, til: til || indstillinger.maalSprog,
    kontekst: kontekst || "",
    noegle: n.noegle,
    baseUrl: indstillinger.baseUrl || STANDARD_BASE_URL,
    model: indstillinger.mtModel || STANDARD_MT_MODEL,
  });
  if (!r.ok) throw new Error(r.fejl);
  return { tekst: r.tekst };
}));

ipcMain.handle("transcript:append", svar(async ({ kilde, oversat, tid }) => {
  sikrMappe(join(transskriptMappe, "x"));
  const d = new Date();
  const navn = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const linje = byggTranskriptLinje({ kilde, oversat, fra: indstillinger.kildeSprog, til: indstillinger.maalSprog, dato: d, tid });
  appendFileSync(join(transskriptMappe, `${navn}.txt`), linje, "utf8");
  appendFileSync(join(transskriptMappe, `${navn}.jsonl`), byggTranskriptJson({ kilde, oversat, fra: indstillinger.kildeSprog, til: indstillinger.maalSprog, dato: d, tid }), "utf8");
  return { fil: join(transskriptMappe, `${navn}.txt`) };
}));

ipcMain.handle("transcript:mappe", svar(async () => {
  sikrMappe(join(transskriptMappe, "x"));
  await shell.openPath(transskriptMappe);
  return { mappe: transskriptMappe };
}));

ipcMain.handle("test:forbindelse", svar(async () => {
  if (indstillinger.demo) return { svar: "(demo)", demo: true };
  const n = hentNoegle();
  if (!n.noegle) throw new Error("ingen API-nøgle sat");
  const r = await oversaet({ tekst: "Test.", fra: "da", til: "en", noegle: n.noegle, baseUrl: indstillinger.baseUrl, model: indstillinger.mtModel });
  if (!r.ok) throw new Error(r.fejl);
  return { svar: r.tekst };
}));

// ---------------------------------------------------------------- selftest
async function koerSelftest() {
  const rapport = { tid: new Date().toISOString(), pakket: app.isPackaged, version: app.getVersion(), trin: [] };
  const tilfoej = (navn, ok, detalje) => rapport.trin.push({ navn, ok, detalje: String(detalje ?? "").slice(0, 220) });
  try {
    tilfoej("vinduer", Boolean(kontrolVindue && overlayVindue), `kontrol=${Boolean(kontrolVindue)} overlay=${Boolean(overlayVindue)}`);
    tilfoej("skaerme", screen.getAllDisplays().length >= 1, `antal=${screen.getAllDisplays().length}`);

    const wa = screen.getPrimaryDisplay().workArea;
    const presets = ["øverst", "midten", "nederst"].map((p) => presetGeometri(wa, p, 1200, 220));
    const inde = presets.every((g) => g.x >= wa.x && g.y >= wa.y && g.x + g.width <= wa.x + wa.width && g.y + g.height <= wa.y + wa.height);
    tilfoej("overlay-presets", inde && new Set(presets.map((g) => g.y)).size === 3, presets.map((g) => g.y).join("/"));

    const gl = klamp({ x: -500, y: -500, width: 300, height: 100 }, wa);
    tilfoej("overlay-klamp", gl.x >= wa.x && gl.y >= wa.y && gl.width >= 320, JSON.stringify(gl));

    const v2 = normaliserIndstillinger({ provider: "demo", overlay: { skriftStoerrelse: 999 } });
    tilfoej("indstillinger-v2", v2.demo === true && v2.provider === "openai" && v2.overlay.skriftStoerrelse === 96, `demo=${v2.demo} skrift=${v2.overlay.skriftStoerrelse}`);

    const enheder = await kontrolVindue.webContents.executeJavaScript("window.__selftestEnheder ? window.__selftestEnheder() : Promise.resolve(null)");
    tilfoej("lydenheder", Boolean(enheder && enheder.length), JSON.stringify(enheder || []).slice(0, 180));

    const mikrofon = await kontrolVindue.webContents.executeJavaScript("window.__selftestMikrofon ? window.__selftestMikrofon() : Promise.resolve(null)");
    tilfoej("mikrofon-capture", Boolean(mikrofon?.ok), JSON.stringify(mikrofon || {}).slice(0, 180));

    const udgange = await kontrolVindue.webContents.executeJavaScript("window.__selftestUdgange ? window.__selftestUdgange() : Promise.resolve(null)");
    tilfoej("lydudgange", Array.isArray(udgange), JSON.stringify(udgange || []).slice(0, 180));

    overlayVindue.webContents.send("overlay:config", overlayConfig());
    overlayVindue.webContents.send("overlay:tekst", { kilde: "Velkommen til konferencen.", oversat: "Welcome to the conference.", tid: "00:00" });
    await new Promise((r) => setTimeout(r, 900));
    const png = (await overlayVindue.webContents.capturePage()).toPNG();
    writeFileSync(join(dataMappe, "selftest-overlay.png"), png);
    tilfoej("overlay-render", png.length > 1000, `png=${png.length} bytes`);

    const pngK = (await kontrolVindue.webContents.capturePage()).toPNG();
    writeFileSync(join(dataMappe, "selftest-kontrol.png"), pngK);
    tilfoej("kontrol-render", pngK.length > 5000, `png=${pngK.length} bytes`);

    const alleSkærme = screen.getAllDisplays();
    if (alleSkærme.length > 1) {
      const s2 = alleSkærme[1];
      const g2 = presetGeometri(s2.workArea, "nederst", Math.min(1000, s2.workArea.width - 40), 200);
      overlayVindue.setBounds(g2);
      await new Promise((r) => setTimeout(r, 400));
      const png2 = (await overlayVindue.webContents.capturePage()).toPNG();
      writeFileSync(join(dataMappe, "selftest-overlay-skaerm2.png"), png2);
      const inde = g2.x >= s2.bounds.x && g2.y >= s2.bounds.y && g2.x + g2.width <= s2.bounds.x + s2.bounds.width;
      tilfoej("overlay-skaerm2", inde && png2.length > 1000, `skaerm ${s2.id} y=${g2.y} png=${png2.length}`);
      overlayVindue.setBounds(geometriFor(vaelgSkaerm(indstillinger.overlay.skaermId), indstillinger.overlay));
    } else {
      tilfoej("overlay-skaerm2", true, "ikke afproevet — kun én skaerm tilsluttet");
    }

    appendFileSync(join(transskriptMappe, "selftest.txt"), "selftest\n", "utf8");
    tilfoej("transskript-skrivning", existsSync(join(transskriptMappe, "selftest.txt")), join(transskriptMappe, "selftest.txt"));

    const t = demoTranksriber(0);
    tilfoej("demo-stt", Boolean(t), t);
    tilfoej("demo-mt", Boolean(demoOversaet(t)), demoOversaet(t));
    tilfoej("kryptering-tilgaengelig", krypto.tilgaengelig(), "safeStorage/DPAPI");
    tilfoej("modelvalidering", validerValg({ udbyderId: "openai", baseUrl: "https://api.openai.com/v1", sttModel: "whisper-1", mtModel: "gpt-4o-mini", egne: [] }).ok === true, "openai + whisper-1 + gpt-4o-mini");
    const fonte = laesSkrifttyper();
    tilfoej("skrifttyper", fonte.length > 15, `${fonte.length} fundet, fx ${fonte.slice(0, 3).join(", ")}`);
  } catch (e) {
    tilfoej("uventet-fejl", false, beskrivFejl(e));
  }
  writeFileSync(join(dataMappe, "selftest-rapport.json"), JSON.stringify(rapport, null, 2), "utf8");
  console.log("SELFTEST " + JSON.stringify(rapport));
  app.exit(rapport.trin.every((t) => t.ok) ? 0 : 1);
}

// ---------------------------------------------------------------- lydfil-test
async function koerLydfilTest(sti) {
  const rapport = { tid: new Date().toISOString(), fil: sti, demo: true, trin: [] };
  const tilfoej = (navn, ok, detalje) => rapport.trin.push({ navn, ok, detalje: String(detalje ?? "").slice(0, 240) });
  try {
    const r = await kontrolVindue.webContents.executeJavaScript(`window.__testLydfil(${JSON.stringify(sti)}, ${FRA_SEK})`);
    tilfoej("afkodning", Boolean(r?.ok) && r.varighed > 0, `${Number(r?.varighed || 0).toFixed(1)} s`);
    tilfoej("blokke behandlet", Number(r?.blokke) > 0, `${r?.blokke} blokke, ${r?.ord} ord, ${r?.ms} ms for ${Number(r?.blokSek || 0).toFixed(1)} s lyd`);
    tilfoej("kilde-tekst", Boolean(r?.kilde), String(r?.kilde || "").slice(0, 130));
    tilfoej("overlay-tekst", Boolean(r?.oversat), String(r?.oversat || "").slice(0, 90));
    await new Promise((res) => setTimeout(res, 700));
    const png = (await overlayVindue.webContents.capturePage()).toPNG();
    writeFileSync(join(dataMappe, "lydfil-test-overlay.png"), png);
    tilfoej("overlay-render", Boolean(r?.ok) && png.length > 1000, `png=${png.length} bytes`);
  } catch (e) {
    tilfoej("uventet-fejl", false, beskrivFejl(e));
  }
  writeFileSync(join(dataMappe, "lydfil-test.json"), JSON.stringify(rapport, null, 2), "utf8");
  console.log("LYDFILTEST " + JSON.stringify(rapport));
  app.exit(rapport.trin.every((t) => t.ok) ? 0 : 1);
}

// ---------------------------------------------------------------- stop-test
async function koerStopTest(sti) {
  const rapport = { tid: new Date().toISOString(), fil: sti, trin: [] };
  const tilfoej = (navn, ok, detalje) => rapport.trin.push({ navn, ok, detalje: String(detalje ?? "").slice(0, 240) });
  try {
    const r = await kontrolVindue.webContents.executeJavaScript(`window.__testStop(${JSON.stringify(sti)})`);
    tilfoej("afspilning starter", r?.foer?.paused === false, JSON.stringify(r?.foer || r?.fejl || r));
    tilfoej("stop stopper afspilningen", r?.efter?.paused === true && r?.efter?.tid === 0, JSON.stringify(r?.efter));
    tilfoej("knapperne skifter tilstand", r?.efter?.startKnapSlaaetFra === false && r?.efter?.stopKnapSlaaetFra === true, "start aktiv, stop inaktiv");
  } catch (e) {
    tilfoej("uventet-fejl", false, beskrivFejl(e));
  }
  writeFileSync(join(dataMappe, "stop-test.json"), JSON.stringify(rapport, null, 2), "utf8");
  console.log("STOPTEST " + JSON.stringify(rapport));
  app.exit(rapport.trin.every((t) => t.ok) ? 0 : 1);
}

// ---------------------------------------------------------------- opstart
app.whenReady().then(() => {
  sikrMappe(join(dataMappe, "x"));
  sikrMappe(join(transskriptMappe, "x"));
  opretKontrol();
  opretOverlay();
  app.on("activate", () => { if (!kontrolVindue) opretKontrol(); });
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", async (e) => {
  if (afslutter) return;
  if (overlayVindue && !overlayVindue.isDestroyed()) {
    e.preventDefault();
    afslutter = true;
    await lukOverlay();
    app.quit();
  }
});
process.on("uncaughtException", (e) => { try { console.error("uventet fejl:", beskrivFejl(e)); } catch { /* intet */ } });
