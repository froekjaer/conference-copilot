// Koerer den RIGTIGE integrationstest: dansk tale -> transskription -> engelsk -> overlay.
// Noeglen laeses fra en fil UDEN FOR repoet og sættes kun i barneprocessens miljoe.
// Noeglen printes aldrig, logges aldrig og skrives aldrig til disk her.
//
//   node test/koer-rigtig-test.mjs [noeglefil] [lydfil]
//
// Standard: %USERPROFILE%\.cc-key.txt og test/assets/dansk-librivox.mp3
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const her = dirname(fileURLToPath(import.meta.url));
const rod = join(her, "..");
const noegleFil = process.argv[2] || join(homedir(), ".cc-key.txt");
const lydFil = process.argv[3] || join(her, "assets", "dansk-librivox.mp3");

if (!existsSync(noegleFil)) {
  console.error(`FEJL: noeglefilen findes ikke: ${noegleFil}`);
  process.exit(2);
}
const noegle = readFileSync(noegleFil, "utf8").trim();
if (noegle.length < 20) {
  console.error("FEJL: noeglefilen ser tom eller for kort ud.");
  process.exit(2);
}
if (!existsSync(lydFil)) {
  console.error(`FEJL: lydfilen findes ikke: ${lydFil}`);
  process.exit(2);
}

const electron = process.platform === "win32"
  ? join(rod, "node_modules", "electron", "dist", "electron.exe")
  : join(rod, "node_modules", "electron", "dist", "electron");

console.log(`Koerer rigtig test: ${lydFil} -> ${join(her, "output", "rigtig")}.json/.png`);
const r = spawnSync(electron, [join(her, "integration-app.js"), `--audio=${lydFil}`, `--out=${join(her, "output", "rigtig")}`], {
  env: { ...process.env, CO_PILOT_API_KEY: noegle },
  stdio: "inherit",
});
process.exit(r.status ?? 1);
