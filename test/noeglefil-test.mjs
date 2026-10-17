// Verificerer at noeglen kan laeses fra en fil og faktisk virker mod APIet (ét billigt kald).
// Noeglen printes ikke — kun kilde, svar og tokenforbrug.
//   node test/noeglefil-test.mjs [sti]
import { homedir } from "node:os";
import { join } from "node:path";
import { laesNoegleFil, vaelgNoegle } from "../src/noegle.js";
import { oversaet } from "../src/pipeline.js";

const sti = process.argv[2] || join(homedir(), ".cc-key.txt");
const laest = laesNoegleFil(sti);
if (!laest.ok) {
  console.error("FEJL: kunne ikke laese noeglefilen: " + laest.fejl);
  process.exit(2);
}

const valg = vaelgNoegle({ noegleFil: sti });
const t0 = Date.now();
const svar = await oversaet({ tekst: "Test af noeglefil.", fra: "da", til: "en", noegle: valg.noegle });
console.log(JSON.stringify({
  kilde: valg.kilde,
  fil: sti,
  ok: svar.ok === true,
  oversat: svar.tekst || null,
  fejl: svar.ok ? null : svar.fejl,
  ms: Date.now() - t0,
  tokens: svar.brug ? svar.brug.total_tokens : null,
}, null, 2));
process.exit(svar.ok ? 0 : 1);
