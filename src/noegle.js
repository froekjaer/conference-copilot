// Oplosning af API-noeglen fra de tre mulige kilder, i prioriteret raekkefoelge:
//   1. miljoevariabel (CO_PILOT_API_KEY)  2. noeglefil paa disken  3. DPAPI (Windows Credential-beskyttet fil)
// Modulet returnerer noeglen til kalderen, men logger eller viser den aldrig.
import { readFileSync, existsSync } from "node:fs";

/** Laeser en noegle fra en fil. Returnerer { ok, noegle } eller { ok: false, fejl } — aldrig noeglens vaerdi i fejlen. */
export function laesNoegleFil(sti) {
  const p = String(sti || "").trim();
  if (!p) return { ok: false, fejl: "ingen sti angivet" };
  try {
    if (!existsSync(p)) return { ok: false, fejl: "filen findes ikke" };
    const tekst = readFileSync(p, "utf8").trim();
    if (tekst.length < 20) return { ok: false, fejl: "filen ser tom ud" };
    if (/\s/.test(tekst)) return { ok: false, fejl: "filen skal indeholde praecis én linje uden mellemrum" };
    return { ok: true, noegle: tekst };
  } catch (e) {
    return { ok: false, fejl: String(e?.message || e).slice(0, 120) };
  }
}

/** Vaelger den foerste tilgaengelige kilde. Returnerer { noegle, kilde }. */
export function vaelgNoegle({ miljoe, noegleFil, dpapi } = {}) {
  if (miljoe && String(miljoe).trim()) return { noegle: String(miljoe).trim(), kilde: "miljøvariabel" };
  if (noegleFil) {
    const r = laesNoegleFil(noegleFil);
    if (r.ok) return { noegle: r.noegle, kilde: "nøglefil" };
  }
  if (dpapi) return { noegle: String(dpapi), kilde: "DPAPI" };
  return { noegle: "", kilde: "ingen" };
}
