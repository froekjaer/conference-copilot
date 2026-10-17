// Små rene hjælpefunktioner til lydflowet: blokstørrelse, forventet forsinkelse og stilhedstjek.

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

/** Effektivværdi (RMS) for et lydudsnit — bruges til at springe stille blokke over. */
export function rms(samples) {
  if (!samples || !samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/** Sandt hvis blokken er så svag, at den ikke giver mening at sende til API'et. */
export function erStille(samples, graense = 0.004) {
  return rms(samples) < graense;
}

/** Skal et tomt svar proeves igen med whisper-1? Kun naar der faktisk er tale i blokken. */
export function skalProeveIgen(tekst, niveau, model) {
  if (String(tekst || "").trim()) return false;
  if (!model || String(model) === "whisper-1") return false;
  return Number(niveau) > 0.02;
}

/** Kendte hallucinationer fra Whisper på stilhed/kort lyd — skal ikke ud i underteksterne. */
export function erHallucination(tekst) {
  const t = String(tekst || "").toLowerCase();
  if (!t.trim()) return false;
  return /subscribe|amara\.org|thanks for watching|thank you for watching|undertekster af|subtitles by|www\.youtube|\.com\/channel/i.test(t);
}
