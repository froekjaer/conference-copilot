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

console.log("");
console.log(`RESULTAT: ${ok}/${alt} kontroller bestaaet`);
process.exit(ok === alt ? 0 : 1);
