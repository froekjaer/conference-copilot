// Små rene hjælpefunktioner til lydflowet: blokstørrelse, forsinkelse, tale-detektion og tekstkontrol.

/** Bloklængde i sekunder, klemt til 2–10 s. Standard 4 s er den bedste balance mellem
 *  forsinkelse og præcision: kortere blokke kan skære ord som "ikke" væk midt i en sætning. */
export function normChunk(sekunder, standard = 4) {
  if (sekunder === null || sekunder === undefined || sekunder === "") return standard;
  const n = Number(sekunder);
  if (!Number.isFinite(n)) return standard;
  return Math.min(Math.max(Math.round(n), 2), 10);
}

/** Oplevet ventetid: i gennemsnit en halv blok + cirka 2,2 s behandling (målt på rigtig tale). */
export function forventetForsinkelse(sekunder) {
  return +(normChunk(sekunder) / 2 + 2.2).toFixed(1);
}

/** Effektivværdi (RMS) for et lydudsnit. */
export function rms(samples) {
  if (!samples || !samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function erStille(samples, graense = 0.004) {
  return rms(samples) < graense;
}

/**
 * Adaptiv taledetektor: holder styr på lydens gulv (tom sal/lydkort) og afgør,
 * om en blok indeholder tale. Uden dette sendes stilhed til API'et, og Whisper
 * finder på tekst ("abonnér på kanalen", japanske tegn …).
 */
export class TaleDetektor {
  constructor({ gulv = 0.004, faktor = 2.5, minimum = 0.009 } = {}) {
    this.gulv = gulv;
    this.faktor = faktor;
    this.minimum = minimum;
  }

  /** Opdater gulvet med en maalt RMS (kun naar der ikke er tale). */
  opdater(vaerdi) {
    const v = Number(vaerdi) || 0;
    if (v <= 0) return;
    this.gulv = this.gulv * 0.9 + Math.min(v, this.gulv * 3) * 0.1;
  }

  /** Er der tale i blokken? */
  erTale(vaerdi) {
    const v = Number(vaerdi) || 0;
    return v > Math.max(this.minimum, this.gulv * this.faktor);
  }
}

const SKRIFTER = [
  { navn: "kinesisk/japansk", re: /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/ },
  { navn: "koreansk", re: /[\uac00-\ud7af\u1100-\u11ff]/ },
  { navn: "kyrillisk", re: /[\u0400-\u04ff]/ },
  { navn: "arabisk", re: /[\u0600-\u06ff]/ },
  { navn: "hebraisk", re: /[\u0590-\u05ff]/ },
  { navn: "thai", re: /[\u0e00-\u0e7f]/ },
  { navn: "devanagari", re: /[\u0900-\u097f]/ },
];

/** Hvilket ikke-latinsk skriftsystem indeholder teksten (null hvis ingen). */
export function fremmedSkrift(tekst) {
  const t = String(tekst || "");
  for (const s of SKRIFTER) if (s.re.test(t)) return s.navn;
  return null;
}

/** Sprog hvor latinsk skrift er det normale. */
export const LATINSKE_SPROG = ["da", "en", "de", "fr", "es", "it"];

/**
 * Skal teksten kasseres som sprogligt forkert? Kun ved ikke-latinsk skrift i et latinsk sprog.
 * Engelske fagudtryk og udenlandske navne i et dansk oplæg er tilladt.
 */
export function forkertSkrift(tekst, sprog) {
  if (!tekst || !LATINSKE_SPROG.includes(String(sprog))) return null;
  return fremmedSkrift(tekst);
}

/** Kendte hallucinationer fra Whisper på stilhed/støj — skal ikke ud i underteksterne. */
export function erHallucination(tekst) {
  const t = String(tekst || "").toLowerCase().trim();
  if (!t) return false;
  return (
    /subscribe|amara\.org|thanks for watching|thank you for watching|undertekster af|subtitles by|www\.youtube|\.com\/channel/i.test(t) ||
    /abonnere på kanalen|abonner på kanalen|danske tekster af|tekster af amara/i.test(t) ||
    /ご視聴ありがとう|ご覧いただき|字幕|谢谢观看|感謝觀看/i.test(t)
  );
}

/** Skal et tomt svar prøves igen med whisper-1? Kun naar blokken faktisk indeholder tale. */
export function skalProeveIgen(tekst, harTale, model) {
  if (String(tekst || "").trim()) return false;
  if (!model || String(model) === "whisper-1") return false;
  return harTale === true;
}

/** Kort, entydig beskrivelse af hvad der blev sendt til API'et (uden noegle og uden lyddata). */
export function beskrivSttKald({ model, language, bytes, varighedSek }) {
  return `model=${model} language=${language || "(auto)"} bytes=${bytes} varighed=${Number(varighedSek || 0).toFixed(1)}s`;
}
