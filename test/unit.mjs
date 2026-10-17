// Unit-tests for Conference Co-Pilots kerne (ingen netvaerk, ingen Electron).
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  byggSttForm, transkriber, oversaet, byggOversaettelsesPrompt, medGenforsoeg,
  byggTranskriptLinje, byggTranskriptJson, beskrivFejl, erNetvaerksfejl, demoTranksriber, demoOversaet,
} from "../src/pipeline.js";
import { laesIndstillinger, gemIndstillinger, gemHemmelighed, laesHemmelighed, sletHemmelighed } from "../src/storage.js";
import { laesNoegleFil, vaelgNoegle } from "../src/noegle.js";
import { presetGeometri, klamp, geometriFor, skaermNoegle, typografi, standardStoerrelse } from "../src/layout.js";
import { modellerFor, validerValg } from "../src/modeller.js";
import { kodWav, udsnit } from "../src/wav.js";
import { normaliserIndstillinger } from "../src/storage.js";
import { normChunk, forventetForsinkelse, rms, erStille, erHallucination, skalProeveIgen } from "../src/flow.js";

let ok = 0, alt = 0;
const tjek = (navn, bestaaet, detalje = "") => {
  alt++;
  if (bestaaet) ok++;
  console.log(`${bestaaet ? "OK  " : "FEJL"}  ${navn}${detalje ? "  — " + detalje : ""}`);
};

const ATTRAP_NOEGLE = "attrap-noegle-til-test";

// ---- STT-form
const form = byggSttForm(Buffer.from("x".repeat(2000)), "audio/webm", { model: "whisper-1", language: "da" });
tjek("STT-form indeholder fil, model og sprog", form instanceof FormData && form.has("file") && form.get("model") === "whisper-1" && form.get("language") === "da");

// ---- transkriber med attrap-fetch
const r1 = await transkriber({ audioBuffer: Buffer.alloc(4000), noegle: ATTRAP_NOEGLE, fetchImpl: async () => ({ ok: true, json: async () => ({ text: "  hej verden  " }) }) });
tjek("transkriber trimmer svar", r1.ok === true && r1.tekst === "hej verden", r1.tekst);

const r2 = await transkriber({ audioBuffer: Buffer.alloc(4000), noegle: ATTRAP_NOEGLE, fetchImpl: async () => ({ ok: false, status: 401, text: async () => "unauthorized" }) });
tjek("transkriber rapporterer HTTP-fejl uden at kaste", r2.ok === false && /401/.test(r2.fejl), r2.fejl);

const r3 = await transkriber({ audioBuffer: Buffer.alloc(4000), noegle: ATTRAP_NOEGLE, fetchImpl: async () => { throw new Error("fetch failed"); } });
tjek("transkriber fanger netvaerksfejl", r3.ok === false && /fetch failed/.test(r3.fejl), r3.fejl);

const r4 = await transkriber({ audioBuffer: Buffer.alloc(10), noegle: ATTRAP_NOEGLE });
tjek("transkriber afviser for lidt lyd", r4.ok === false && /for lidt lyd/.test(r4.fejl));

// ---- auth-header uden at noeglen lækker
let setHoved = null;
await transkriber({ audioBuffer: Buffer.alloc(4000), noegle: ATTRAP_NOEGLE, fetchImpl: async (_u, o) => { setHoved = o.headers; return { ok: true, json: async () => ({ text: "x" }) }; } });
tjek("auth-header saettes som Bearer uden at indgaa i klartekst i filer", setHoved?.get?.("Authorization") === `Bearer ${ATTRAP_NOEGLE}`);

// ---- oversaettelse
const o1 = await oversaet({ tekst: "Hej verden", fra: "da", til: "en", noegle: ATTRAP_NOEGLE, fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: " Hello world " } }] }) }) });
tjek("oversaet returnerer trimmet tekst", o1.ok === true && o1.tekst === "Hello world", o1.tekst);
const prompt = byggOversaettelsesPrompt("Hej", "da", "en");
tjek("prompten indeholder sprog og kun-oversaettelse-regel", prompt[0].content.includes("Danish") && prompt[0].content.includes("English") && /ONLY/.test(prompt[0].content));
tjek("tom tekst giver tomt svar uden kald", (await oversaet({ tekst: "  ", noegle: ATTRAP_NOEGLE })).tekst === "");

// ---- genforsoeg
let forsoeg = 0;
const res = await medGenforsoeg(async (i) => { forsoeg++; if (i < 3) throw new Error("igen"); return "ok"; }, { baseMs: 1 });
tjek("medGenforsoeg forsoeger igen og lykkes", res === "ok" && forsoeg === 3, `forsoeg=${forsoeg}`);
let fejlede = false;
try { await medGenforsoeg(async () => { throw new Error("altid fejl"); }, { forsog: 2, baseMs: 1 }); } catch { fejlede = true; }
tjek("medGenforsoeg kaster efter sidste forsoeg", fejlede);

// ---- transskript-format
const d = new Date("2026-10-16T19:42:07");
const linje = byggTranskriptLinje({ kilde: "Hej", oversat: "Hello", fra: "da", til: "en", dato: d });
tjek("transskript-linje har tidsstempel og begge sprog", /\[19:42:07\] DA: Hej/.test(linje) && /\[19:42:07\] EN: Hello/.test(linje), linje.split("\n")[0]);
const parsed = JSON.parse(byggTranskriptJson({ kilde: "Hej", oversat: "Hello", fra: "da", til: "en", dato: d }));
tjek("JSONL-linje er gyldig JSON med felterne", parsed.kilde === "Hej" && parsed.oversat === "Hello" && parsed.fra === "da");

// ---- fejlbeskrivelser
tjek("beskrivFejl kender tidsgraense", beskrivFejl({ name: "AbortError" }) === "tidsgraense overskredet");
tjek("erNetvaerksfejl genkender netvaerksfejl", erNetvaerksfejl(new Error("fetch failed")) === true);
tjek("beskrivFejl afkorter lange beskeder", beskrivFejl(new Error("a".repeat(400))).length <= 202);

// ---- demo-tilstand
tjek("demo-transskription giver tekst", typeof demoTranksriber(0) === "string" && demoTranksriber(0).length > 10);
tjek("demo-oversaettelse oversaetter kendt linje", demoOversaet(demoTranksriber(0)).startsWith("Welcome"));

// ---- lagring (indstillinger og krypteret hemmelighed)
const mappe = mkdtempSync(join(tmpdir(), "copilot-test-"));
try {
  const indFil = join(mappe, "under", "indstillinger.json");
  tjek("indstillinger har standardvaerdier uden fil", laesIndstillinger(indFil).kildeSprog === "da");
  gemIndstillinger(indFil, { baseUrl: "https://x/v1", kildeSprog: "en", maalSprog: "de", overlay: { skriftStoerrelse: 44 } });
  const laest = laesIndstillinger(indFil);
  tjek("indstillinger kan gemmes og laeses", laest.kildeSprog === "en" && laest.maalSprog === "de" && laest.overlay.skriftStoerrelse === 44);

  const attrapKrypto = {
    tilgaengelig: () => true,
    kryptér: (s) => Buffer.from("KRYPT:" + s, "utf8"),
    dekryptér: (b) => b.toString("utf8").replace("KRYPT:", ""),
  };
  const hemmeligFil = join(mappe, "hemmelighed.bin");
  tjek("hemmelighed kan gemmes", gemHemmelighed(hemmeligFil, ATTRAP_NOEGLE, attrapKrypto).ok === true);
  tjek("filen indeholder ikke noeglen i klartekst", !readFileSync(hemmeligFil, "utf8").includes(ATTRAP_NOEGLE));
  tjek("hemmelighed kan laeses tilbage", laesHemmelighed(hemmeligFil, attrapKrypto).noegle === ATTRAP_NOEGLE);
  tjek("utilgaengelig kryptering afvises", gemHemmelighed(hemmeligFil, "x", { tilgaengelig: () => false }).ok === false);
  sletHemmelighed(hemmeligFil);
  tjek("hemmelighed kan slettes", !existsSync(hemmeligFil));
} finally {
  rmSync(mappe, { recursive: true, force: true });
}

// ---- noegle fra fil (ny valgmulighed)
{
  const mappe2 = mkdtempSync(join(tmpdir(), "copilot-noegle-"));
  try {
    const gyldig = join(mappe2, "nokkel.txt");
    writeFileSync(gyldig, "  " + ATTRAP_NOEGLE + "\n", "utf8");
    tjek("noeglefil: gyldig fil laeses og trimmes", laesNoegleFil(gyldig).ok === true && laesNoegleFil(gyldig).noegle === ATTRAP_NOEGLE);

    const tom = join(mappe2, "tom.txt");
    writeFileSync(tom, "   \n", "utf8");
    tjek("noeglefil: tom fil afvises", laesNoegleFil(tom).ok === false);

    const kort = join(mappe2, "kort.txt");
    writeFileSync(kort, "kort", "utf8");
    tjek("noeglefil: for kort indhold afvises", laesNoegleFil(kort).ok === false);

    const flerlinje = join(mappe2, "flere.txt");
    writeFileSync(flerlinje, ATTRAP_NOEGLE + "\n" + ATTRAP_NOEGLE, "utf8");
    tjek("noeglefil: flere linjer afvises", laesNoegleFil(flerlinje).ok === false);

    tjek("noeglefil: manglende fil afvises", laesNoegleFil(join(mappe2, "findes-ikke.txt")).ok === false);

    tjek("prioritet: miljoevariabel vinder over fil", vaelgNoegle({ miljoe: "miljoe-noegle-1234567890", noegleFil: gyldig, dpapi: "dpapi-noegle" }).kilde === "miljøvariabel");
    tjek("prioritet: fil vinder over DPAPI", vaelgNoegle({ noegleFil: gyldig, dpapi: "dpapi-noegle" }).kilde === "nøglefil");
    tjek("prioritet: DPAPI bruges naar fil mangler", vaelgNoegle({ noegleFil: join(mappe2, "findes-ikke.txt"), dpapi: "dpapi-noegle" }).kilde === "DPAPI");
    tjek("prioritet: ingen kilde giver tom noegle", vaelgNoegle({}).kilde === "ingen" && vaelgNoegle({}).noegle === "");
  } finally {
    rmSync(mappe2, { recursive: true, force: true });
  }
}

// ---- layout: presets, klampning, placering pr. skaerm
{
  const wa = { x: 0, y: 0, width: 1920, height: 1040 };
  const o = presetGeometri(wa, "øverst", 1200, 220);
  const m = presetGeometri(wa, "midten", 1200, 220);
  const n = presetGeometri(wa, "nederst", 1200, 220);
  tjek("layout: presets giver tre forskellige placeringer", o.y < m.y && m.y < n.y, `${o.y}/${m.y}/${n.y}`);
  tjek("layout: presets holder sig inde paa skaermen", [o, m, n].every((g) => g.x >= 0 && g.y >= 0 && g.y + g.height <= wa.height));
  const k = klamp({ x: -900, y: 5000, width: 100, height: 50 }, wa);
  tjek("layout: klamp holder vinduet inde og over minimum", k.x >= 0 && k.y + k.height <= wa.height && k.width >= 320 && k.height >= 100, JSON.stringify(k));
  const skaerm = { id: 7, bounds: { width: 1920, height: 1080 }, workArea: wa };
  const g1 = geometriFor(skaerm, { placering: { preset: "nederst", prSkarm: { [skaermNoegle(skaerm)]: { x: 10, y: 20, width: 800, height: 200 } } } });
  tjek("layout: gemt placering pr. skaerm bruges", g1.x === 10 && g1.y === 20 && g1.width === 800);
  const g2 = geometriFor(skaerm, { placering: { preset: "øverst", prSkarm: {} } });
  tjek("layout: uden gemt placering bruges preset", g2.y === wa.y + 24);
  const tp = typografi({ skriftStoerrelse: 999, tekstFarve: "blå", konturPx: -3, justering: "skæv", maxLinjer: 99 });
  tjek("layout: typografi saniteres", tp.skriftStoerrelse === 96 && tp.tekstFarve === "#ffffff" && tp.konturPx === 0 && tp.justering === "left" && tp.maxLinjer === 6, JSON.stringify(tp));
}

// ---- modeller og validering
{
  const stt = modellerFor("openai", "stt", []).map((m) => m.id);
  tjek("modeller: openai-stt indeholder whisper-1", stt.includes("whisper-1") && !stt.includes("gpt-4o-mini"));
  const mtGroq = modellerFor("groq", "mt", []).map((m) => m.id);
  tjek("modeller: groq-mt indeholder llama", mtGroq.includes("llama-3.3-70b-versatile"));
  const egne = modellerFor("openai", "stt", [{ id: "min-model", anvendelse: "stt" }]).map((m) => m.id);
  tjek("modeller: egen model medtages", egne.includes("min-model"));
  tjek("validering: kendt kombination er ok", validerValg({ udbyderId: "openai", baseUrl: "https://api.openai.com/v1", sttModel: "whisper-1", mtModel: "gpt-4o-mini" }).ok === true);
  tjek("validering: ukendt model afvises", validerValg({ udbyderId: "openai", baseUrl: "https://api.openai.com/v1", sttModel: "findes-ikke", mtModel: "gpt-4o-mini" }).ok === false);
  tjek("validering: ugyldig URL afvises", validerValg({ udbyderId: "openai", baseUrl: "api.openai.com", sttModel: "whisper-1", mtModel: "gpt-4o-mini" }).ok === false);
}

// ---- WAV-kodning og udsnit
{
  const samples = new Float32Array(1600);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.5;
  const wav = kodWav(samples, 16000, 1);
  const tekst = Buffer.from(wav.slice(0, 4)).toString("ascii") + Buffer.from(wav.slice(8, 12)).toString("ascii");
  tjek("wav: RIFF/WAVE-header", tekst === "RIFFWAVE");
  tjek("wav: laengde svarer til 16-bit mono", wav.length === 44 + samples.length * 2, `${wav.length}`);
  const dataLen = new DataView(wav.buffer, wav.byteOffset).getUint32(40, true);
  tjek("wav: datalaengde i headeren er korrekt", dataLen === samples.length * 2);

  const buffer = { sampleRate: 16000, numberOfChannels: 1, length: 32000, getChannelData: () => new Float32Array(32000).fill(0.25) };
  tjek("udsnit: klipper det rigtige antal samples", udsnit(buffer, 0.5, 1.5).length === 16000);
  tjek("udsnit: klamper til filens laengde", udsnit(buffer, 1.5, 5).length === 8000);
  tjek("udsnit: tomt interval giver tomt resultat", udsnit(buffer, 2, 1).length === 0);
}

// ---- indstillinger v2 og migrering
{
  const v2 = normaliserIndstillinger({ provider: "demo", overlay: { skriftStoerrelse: 999, placering: { preset: "skæv", prSkarm: { "1@1920x1080": { x: 5, y: 6, width: 700, height: 180 } } } } });
  tjek("indstillinger v2: demo-migrering", v2.demo === true && v2.provider === "openai" && v2.version === 3);
  tjek("indstillinger v3: whisper-1 migreres til hurtigere model", v2.sttModel === "gpt-4o-mini-transcribe", v2.sttModel);
  const v3 = normaliserIndstillinger({ version: 3, sttModel: "whisper-1" });
  tjek("indstillinger v3: bevidst valg af whisper-1 bevares", v3.sttModel === "whisper-1");
  tjek("indstillinger v2: typografi saniteres", v2.overlay.skriftStoerrelse === 96);
  tjek("indstillinger v2: ugyldigt preset falder tilbage", v2.overlay.placering.preset === "nederst");
  tjek("indstillinger v2: gemt skaermplacering bevares", v2.overlay.placering.prSkarm["1@1920x1080"].width === 700);
  const std = normaliserIndstillinger({});
  tjek("indstillinger v2: standard er hvid tekst med sort kontur", std.overlay.tekstFarve === "#ffffff" && std.overlay.konturFarve === "#000000" && std.overlay.konturPx === 2);
  tjek("indstillinger v2: standard er undertekst nederst", std.overlay.placering.preset === "nederst" && std.lydKilde === "mikrofon");
}

// ---- blokstørrelse, forsinkelse og stilhed
{
  tjek("flow: blok klem mes til 2-10 s", normChunk(1) === 2 && normChunk(99) === 10 && normChunk(3) === 3);
  tjek("flow: ugyldig blok giver standard", normChunk("abc") === 4 && normChunk(null) === 4);
  tjek("flow: forventet forsinkelse falder med kortere blokke", forventetForsinkelse(3) < forventetForsinkelse(6), `${forventetForsinkelse(3)} s mod ${forventetForsinkelse(6)} s`);
  const stille = new Float32Array(1000).fill(0.0005);
  const hoej = new Float32Array(1000).fill(0.2);
  tjek("flow: stilhed genkendes", erStille(stille) === true && erStille(hoej) === false);
  tjek("flow: rms af tom lyd er 0", rms(new Float32Array(0)) === 0);
  tjek("flow: rms vokser med signalet", rms(hoej) > rms(stille));
  tjek("flow: kendt hallucination genkendes", erHallucination("If you like this video, you can subscribe to the channel") === true);
  tjek("flow: almindelig dansk tekst er ikke hallucination", erHallucination("Der var engang en fattig kone") === false);
  tjek("flow: tom tekst er ikke hallucination", erHallucination("") === false);
  tjek("retry: tomt svar paa tale proeves igen", skalProeveIgen("", 0.3, "gpt-4o-mini-transcribe") === true);
  tjek("retry: tomt svar paa stilhed proeves ikke", skalProeveIgen("", 0.005, "gpt-4o-mini-transcribe") === false);
  tjek("retry: svar med tekst proeves ikke", skalProeveIgen("hej", 0.4, "gpt-4o-mini-transcribe") === false);
  tjek("retry: whisper-1 proeves ikke igen", skalProeveIgen("", 0.4, "whisper-1") === false);
}

console.log("");
console.log(`RESULTAT: ${ok}/${alt} kontroller bestaaet`);
process.exit(ok === alt ? 0 : 1);
