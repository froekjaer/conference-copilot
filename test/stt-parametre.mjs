// Undersoeger hvad STT-API'et faktisk svarer paa stilhed/stoej og paa tale,
// med og uden eksplicit sprogparameter. Noeglen laeses fra fil og printes aldrig.
//   node test/stt-parametre.mjs
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { transkriber } from "../src/pipeline.js";

const her = dirname(fileURLToPath(import.meta.url));
const noegle = readFileSync(process.argv[2] || join(homedir(), ".cc-key.txt"), "utf8").trim();

const filer = [
  { navn: "stille", sti: join(her, "assets", "stille.wav"), mime: "audio/wav" },
  { navn: "stoej", sti: join(her, "assets", "stoej.wav"), mime: "audio/wav" },
  { navn: "stoej+klik", sti: join(her, "assets", "stoej-klik.wav"), mime: "audio/wav" },
];

const modeller = ["whisper-1", "gpt-4o-mini-transcribe"];
const sprog = [
  { navn: "da", vaerdi: "da" },
  { navn: "(intet)", vaerdi: "" },
];

for (const fil of filer) {
  const buffer = readFileSync(fil.sti);
  for (const model of modeller) {
    for (const s of sprog) {
      const t0 = Date.now();
      const r = await transkriber({
        audioBuffer: buffer,
        mimeType: fil.mime,
        noegle,
        model,
        language: s.vaerdi,
      });
      const tekst = r.ok ? r.tekst : "FEJL: " + r.fejl;
      console.log(`${fil.navn.padEnd(11)} | ${model.padEnd(24)} | sprog=${s.navn.padEnd(7)} | ${String(Date.now() - t0).padStart(5)} ms | "${tekst.slice(0, 90)}"`);
    }
  }
}
