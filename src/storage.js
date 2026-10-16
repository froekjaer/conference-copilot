// Lagring: indstillinger (klartekst) og hemmeligheder (krypteret via Electron safeStorage = DPAPI paa Windows).
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";

export const STANDARD_INDSTILLINGER = {
  provider: "api",
  baseUrl: "https://api.openai.com/v1",
  sttModel: "whisper-1",
  mtModel: "gpt-4o-mini",
  kildeSprog: "da",
  maalSprog: "en",
  chunkSekunder: 6,
  overlay: { skaermId: null, skriftStoerrelse: 34, baggrundAlpha: 0.55, visKilde: true, klikGennem: true },
};

export function sikrMappe(filSti) {
  const mappe = dirname(filSti);
  if (!existsSync(mappe)) mkdirSync(mappe, { recursive: true });
  return mappe;
}

export function laesIndstillinger(filSti) {
  try {
    if (!existsSync(filSti)) return { ...STANDARD_INDSTILLINGER };
    const j = JSON.parse(readFileSync(filSti, "utf8"));
    return { ...STANDARD_INDSTILLINGER, ...j, overlay: { ...STANDARD_INDSTILLINGER.overlay, ...(j.overlay || {}) } };
  } catch {
    return { ...STANDARD_INDSTILLINGER };
  }
}

export function gemIndstillinger(filSti, indstillinger) {
  try {
    sikrMappe(filSti);
    writeFileSync(filSti, JSON.stringify(indstillinger, null, 2), "utf8");
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
