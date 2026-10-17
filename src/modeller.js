// Udbyder- og modelliste + validering. Holder UI'et aerligt: kun modeller der passer til
// den valgte udbyder og anvendelse praesenteres som understoettede.

export const UDBYDERE = [
  { id: "openai", navn: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "groq", navn: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "lokal", navn: "Lokal server (OpenAI-kompatibel)", baseUrl: "http://127.0.0.1:8080/v1" },
];

export const MODELLER = [
  { id: "whisper-1", navn: "Whisper", anvendelse: ["stt"], udbydere: ["openai"], note: "Standard, god dansk" },
  { id: "gpt-4o-mini-transcribe", navn: "gpt-4o-mini-transcribe", anvendelse: ["stt"], udbydere: ["openai"], note: "Billigere, hurtigere" },
  { id: "whisper-large-v3", navn: "whisper-large-v3", anvendelse: ["stt"], udbydere: ["groq"], note: "Kræver Groq-noegle" },
  { id: "gpt-4o-mini", navn: "gpt-4o-mini", anvendelse: ["mt"], udbydere: ["openai"], note: "Standard til oversættelse" },
  { id: "gpt-4o", navn: "gpt-4o", anvendelse: ["mt"], udbydere: ["openai"], note: "Bedre kvalitet, dyrere" },
  { id: "llama-3.3-70b-versatile", navn: "Llama 3.3 70B", anvendelse: ["mt"], udbydere: ["groq"], note: "Kræver Groq-noegle" },
];

/** Modeller til en udbyder og anvendelse ("stt" eller "mt"), inkl. brugerens egne. */
export function modellerFor(udbyderId, anvendelse, egne = []) {
  const fraListe = MODELLER.filter((m) => m.anvendelse.includes(anvendelse) && (m.udbydere.includes(udbyderId) || udbyderId === "lokal"));
  const egneTilPasset = (egne || []).filter((m) => m.anvendelse === anvendelse || m.anvendelse === "begge");
  return [...fraListe, ...egneTilPasset.map((m) => ({ ...m, egen: true, udbydere: [...(m.udbydere || []), udbyderId] }))];
}

export function udbyderNavn(id) {
  return (UDBYDERE.find((u) => u.id === id) || {}).navn || id;
}

/** Grundlaeggende validering af udbyder + endpoint + modelvalg. Returnerer { ok, fejl[] }. */
export function validerValg({ udbyderId, baseUrl, sttModel, mtModel, egne = [] }) {
  const fejl = [];
  const u = UDBYDERE.find((x) => x.id === udbyderId);
  if (!u) fejl.push("ukendt udbyder");
  const url = String(baseUrl || "").trim();
  if (!/^https?:\/\/[^\s]+$/i.test(url)) fejl.push("base-URL skal starte med http:// eller https://");
  if (u && u.id !== "lokal" && url && url.replace(/\/+$/, "") !== u.baseUrl.replace(/\/+$/, "")) {
    fejl.push(`base-URL afviger fra ${u.navn}s standard (${u.baseUrl})`);
  }
  const kendtStt = modellerFor(udbyderId, "stt", egne).some((m) => m.id === sttModel);
  const kendtMt = modellerFor(udbyderId, "mt", egne).some((m) => m.id === mtModel);
  if (!kendtStt) fejl.push(`transskriptionsmodellen "${sttModel}" er ikke registreret til ${udbyderNavn(udbyderId)} — tilføj den som egen model`);
  if (!kendtMt) fejl.push(`oversættelsesmodellen "${mtModel}" er ikke registreret til ${udbyderNavn(udbyderId)} — tilføj den som egen model`);
  return { ok: fejl.length === 0, fejl };
}
