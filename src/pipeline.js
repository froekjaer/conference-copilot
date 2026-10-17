// Kerne-logik for Conference Co-Pilot: tale→tekst, oversaettelse, transskript-linjer og genforsoeg.
// Rene funktioner uden Electron-afhaengigheder, saa de kan unit-testes i almindelig Node.
// Hemmeligheder holdes i variabler (aldrig literaler) og skrives ikke til filer eller logs.

export const STANDARD_BASE_URL = "https://api.openai.com/v1";
export const STANDARD_STT_MODEL = "whisper-1";
export const STANDARD_MT_MODEL = "gpt-4o-mini";

/** Bygger auth-headere uden at noeglen nogensinde indgaa i en log eller fil. */
function authHoveder(noegle, ekstra = {}) {
  const h = new Headers(ekstra);
  h.set("Authorization", `Bearer ${noegle}`);
  return h;
}

/** Kort, ikke-foelsom fejlbeskrivelse til UI/log. */
export function beskrivFejl(fejl) {
  if (!fejl) return "ukendt fejl";
  if (fejl.name === "AbortError") return "tidsgraense overskredet";
  const besked = String(fejl.message || fejl);
  return besked.length > 200 ? besked.slice(0, 200) + "…" : besked;
}

export function erNetvaerksfejl(fejl) {
  const tekst = String(fejl?.message || fejl || "").toLowerCase();
  return /fetch failed|network|econnreset|econnrefused|enotfound|socket|timeout|aborted|tidsgraense/.test(tekst);
}

/** Genforsoeg med eksponentiel backoff. Kaster den sidste fejl videre. */
export async function medGenforsoeg(fn, { forsog = 3, baseMs = 600, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let sidste;
  for (let i = 1; i <= forsog; i++) {
    try {
      return await fn(i);
    } catch (e) {
      sidste = e;
      if (i === forsog) break;
      await sleep(baseMs * Math.pow(2, i - 1));
    }
  }
  throw sidste;
}

/** Filendelse og MIME ud fra lydformat. Whisper accepterer mp3, mp4, mpeg, mpga, m4a, wav, flac, ogg og webm. */
export function endelseForMime(mimeType = "") {
  const m = String(mimeType).toLowerCase();
  if (m.includes("wav")) return { endelse: "wav", mime: "audio/wav" };
  if (m.includes("mpeg") || m.includes("mp3")) return { endelse: "mp3", mime: "audio/mpeg" };
  if (m.includes("mp4") || m.includes("m4a")) return { endelse: "mp4", mime: "audio/mp4" };
  if (m.includes("flac")) return { endelse: "flac", mime: "audio/flac" };
  if (m.includes("ogg") || m.includes("opus")) return { endelse: "ogg", mime: "audio/ogg" };
  return { endelse: "webm", mime: "audio/webm" };
}

/** Bygger multipart-body til et OpenAI-kompatibelt /audio/transcriptions-kald. */
export function byggSttForm(audioBuffer, mimeType = "audio/webm", { model = STANDARD_STT_MODEL, language = "" } = {}) {
  const form = new FormData();
  const { endelse, mime } = endelseForMime(mimeType);
  form.append("file", new Blob([audioBuffer], { type: mime }), `lyd.${endelse}`);
  form.append("model", model);
  if (language) form.append("language", language);
  form.append("response_format", "json");
  return form;
}

/** Tale → tekst. Returnerer { ok, tekst, fejl }. */
export async function transkriber({ audioBuffer, mimeType, noegle, baseUrl = STANDARD_BASE_URL, model = STANDARD_STT_MODEL, language = "", fetchImpl = fetch, timeoutMs = 60000 }) {
  if (!audioBuffer || audioBuffer.byteLength < 1200) return { ok: false, fejl: "for lidt lyd" };
  const url = `${baseUrl.replace(/\/+$/, "")}/audio/transcriptions`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const svar = await fetchImpl(url, { method: "POST", headers: authHoveder(noegle), body: byggSttForm(audioBuffer, mimeType, { model, language }), signal: ctrl.signal });
    if (!svar.ok) return { ok: false, fejl: `STT HTTP ${svar.status}: ${(await svar.text()).slice(0, 160)}` };
    const j = await svar.json();
    return { ok: true, tekst: String(j.text || "").trim() };
  } catch (e) {
    return { ok: false, fejl: beskrivFejl(e) };
  } finally {
    clearTimeout(tid);
  }
}

const SPROGNAVN = { da: "Danish", en: "English", de: "German", fr: "French", es: "Spanish", it: "Italian" };

export function byggOversaettelsesPrompt(tekst, fra, til) {
  const fraNavn = SPROGNAVN[fra] || fra || "the source language";
  const tilNavn = SPROGNAVN[til] || til;
  return [
    { role: "system", content: `You are a simultaneous interpreter for a live conference. Translate the user's text from ${fraNavn} to ${tilNavn}. Reply with the translation ONLY - no quotes, no explanations, no extra text. Preserve names, numbers and technical terms.` },
    { role: "user", content: tekst },
  ];
}

/** Tekst → oversaettelse. Returnerer { ok, tekst, fejl }. */
export async function oversaet({ tekst, fra = "da", til = "en", noegle, baseUrl = STANDARD_BASE_URL, model = STANDARD_MT_MODEL, fetchImpl = fetch, timeoutMs = 20000 }) {
  if (!tekst || !tekst.trim()) return { ok: true, tekst: "" };
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const svar = await fetchImpl(url, {
      method: "POST",
      headers: authHoveder(noegle, { "Content-Type": "application/json" }),
      body: JSON.stringify({ model, messages: byggOversaettelsesPrompt(tekst, fra, til), temperature: 0 }),
      signal: ctrl.signal,
    });
    if (!svar.ok) return { ok: false, fejl: `MT HTTP ${svar.status}: ${(await svar.text()).slice(0, 160)}` };
    const j = await svar.json();
    return { ok: true, tekst: String(j?.choices?.[0]?.message?.content || "").trim(), brug: j?.usage || null };
  } catch (e) {
    return { ok: false, fejl: beskrivFejl(e) };
  } finally {
    clearTimeout(tid);
  }
}

/** Demo/offline-tilstand: bruges til at teste hele kaeden uden API-noegle. */
export function demoTranksriber(sekvens = 0) {
  const linjer = [
    "Velkommen til konferencen. Vi starter om et øjeblik.",
    "Dagens program handler om samarbejde mellem mennesker og maskiner.",
    "Vi tager spørgsmål efter oplægget.",
    "Tak fordi I kom.",
  ];
  return linjer[sekvens % linjer.length];
}

export function demoOversaet(tekst) {
  const tabel = {
    "Velkommen til konferencen. Vi starter om et øjeblik.": "Welcome to the conference. We will begin in a moment.",
    "Dagens program handler om samarbejde mellem mennesker og maskiner.": "Today's programme is about collaboration between humans and machines.",
    "Vi tager spørgsmål efter oplægget.": "We will take questions after the presentation.",
    "Tak fordi I kom.": "Thank you for coming.",
  };
  return tabel[tekst] || `[EN] ${tekst}`;
}

/** Tidsstempel til transskriptet (lokal tid, sekundopløsning). */
export function tidsstempel(dato = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return { klokke: `${p(dato.getHours())}:${p(dato.getMinutes())}:${p(dato.getSeconds())}`, iso: dato.toISOString() };
}

export function byggTranskriptLinje({ kilde, oversat, fra, til, dato, tid }) {
  const t = tidsstempel(dato);
  const k = tid || t.klokke;
  return `[${k}] ${fra.toUpperCase()}: ${kilde}\n[${k}] ${til.toUpperCase()}: ${oversat}\n`;
}

export function byggTranskriptJson({ kilde, oversat, fra, til, dato, tid }) {
  const t = tidsstempel(dato);
  return JSON.stringify({ ts: t.iso, klokke: tid || t.klokke, fra, til, kilde, oversat }) + "\n";
}
