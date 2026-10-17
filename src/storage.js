// Lagring: indstillinger (klartekst) og hemmeligheder (krypteret via Electron safeStorage = DPAPI paa Windows).
// Indstillinger v2 samler overlay-geometri pr. skaerm, typografi, lydkilde og egne modeller.
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { typografi } from "./layout.js";

export const INDSTILLINGER_VERSION = 2;

export const STANDARD_OVERLAY = {
  skaermId: null,
  skriftStoerrelse: 34,
  skriftFamilie: "Segoe UI",
  tekstFarve: "#ffffff",
  konturFarve: "#000000",
  konturPx: 2,
  skygge: false,
  baggrundFarve: "#000000",
  baggrundAlpha: 0.55,
  justering: "left",
  visKilde: true,
  maxLinjer: 3,
  klikGennem: true,
  redigering: false,
  breddePct: 0.9,
  hoejdePct: 0.22,
  placering: { preset: "nederst", prSkarm: {} },
};

export const STANDARD_INDSTILLINGER = {
  version: INDSTILLINGER_VERSION,
  provider: "openai",
  demo: false,
  baseUrl: "https://api.openai.com/v1",
  sttModel: "whisper-1",
  mtModel: "gpt-4o-mini",
  kildeSprog: "da",
  maalSprog: "en",
  chunkSekunder: 6,
  noegleFil: "",
  egneModeller: [],
  lydKilde: "mikrofon",
  lydFil: "",
  lydFilNavn: "",
  lydUdgang: "",
  hastighed: 1,
  overlay: { ...STANDARD_OVERLAY },
};

/** Retter gamle/ugyldige indstillinger til v2 uden at kaste brugerens valg vaek. */
export function normaliserIndstillinger(raa = {}) {
  const j = { ...raa };
  // v1 havde provider "api"/"demo" og ingen version
  if (!j.version) {
    if (j.provider === "demo") {
      j.demo = true;
      j.provider = "openai";
    } else if (j.provider === "api" || !j.provider) {
      j.provider = "openai";
    }
  }
  const overlayRaa = { ...STANDARD_OVERLAY, ...(j.overlay || {}) };
  const placeringRaa = { ...(overlayRaa.placering || {}) };
  const prSkarm = {};
  for (const [noegle, g] of Object.entries(placeringRaa.prSkarm || {})) {
    if (g && Number.isFinite(Number(g.width)) && Number.isFinite(Number(g.height))) {
      prSkarm[noegle] = { x: Number(g.x) || 0, y: Number(g.y) || 0, width: Number(g.width), height: Number(g.height) };
    }
  }
  const overlay = {
    ...overlayRaa,
    ...typografi(overlayRaa),
    placering: {
      preset: ["øverst", "midten", "nederst", "brugerdefineret"].includes(placeringRaa.preset) ? placeringRaa.preset : "nederst",
      prSkarm,
    },
    breddePct: Math.min(Math.max(Number(overlayRaa.breddePct) || 0.9, 0.2), 1),
    hoejdePct: Math.min(Math.max(Number(overlayRaa.hoejdePct) || 0.22, 0.06), 0.9),
    klikGennem: overlayRaa.klikGennem !== false,
    redigering: Boolean(overlayRaa.redigering),
  };
  return {
    ...STANDARD_INDSTILLINGER,
    ...j,
    version: INDSTILLINGER_VERSION,
    demo: Boolean(j.demo),
    chunkSekunder: Math.min(Math.max(Number(j.chunkSekunder) || 6, 3), 20),
    hastighed: [0.75, 1, 1.25].includes(Number(j.hastighed)) ? Number(j.hastighed) : 1,
    egneModeller: Array.isArray(j.egneModeller) ? j.egneModeller.filter((m) => m && m.id) : [],
    overlay,
  };
}

export function sikrMappe(filSti) {
  const mappe = dirname(filSti);
  if (!existsSync(mappe)) mkdirSync(mappe, { recursive: true });
  return mappe;
}

export function laesIndstillinger(filSti) {
  try {
    if (!existsSync(filSti)) return normaliserIndstillinger({});
    return normaliserIndstillinger(JSON.parse(readFileSync(filSti, "utf8")));
  } catch {
    return normaliserIndstillinger({});
  }
}

export function gemIndstillinger(filSti, indstillinger) {
  try {
    sikrMappe(filSti);
    writeFileSync(filSti, JSON.stringify(normaliserIndstillinger(indstillinger), null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Hemmeligheds-lager. `krypto` injiceres: i Electron bruges safeStorage (DPAPI),
 * i unit-tests en attrap. Returnerer aldrig noeglen til log/UI.
 */
export function gemHemmelighed(filSti, noegle, krypto) {
  try {
    if (!krypto?.tilgaengelig?.()) return { ok: false, fejl: "kryptering ikke tilgaengelig" };
    const krypteret = krypto.kryptér(String(noegle));
    sikrMappe(filSti);
    writeFileSync(filSti, JSON.stringify({ version: 1, blok: krypteret.toString("base64") }, null, 2), "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, fejl: String(e.message || e).slice(0, 120) };
  }
}

export function laesHemmelighed(filSti, krypto) {
  try {
    if (!existsSync(filSti)) return { ok: false, fejl: "ingen gemt noegle" };
    const j = JSON.parse(readFileSync(filSti, "utf8"));
    if (!j?.blok) return { ok: false, fejl: "ugyldigt format" };
    const noegle = krypto.dekryptér(Buffer.from(j.blok, "base64"));
    if (!noegle) return { ok: false, fejl: "kunne ikke dekryptere" };
    return { ok: true, noegle };
  } catch (e) {
    return { ok: false, fejl: String(e.message || e).slice(0, 120) };
  }
}

export function sletHemmelighed(filSti) {
  try {
    if (existsSync(filSti)) unlinkSync(filSti);
    return { ok: true };
  } catch (e) {
    return { ok: false, fejl: String(e.message || e).slice(0, 120) };
  }
}
