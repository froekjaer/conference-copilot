// Bygger den portable Windows-distribution: Electron-runtime + app i resources/app + startfil, pakket som ZIP.
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, renameSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const rod = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(rod, "package.json"), "utf8")).version;
const ud = join(rod, "dist", "ConferenceCoPilot");
const appMappe = join(ud, "resources", "app");
const zip = join(rod, "dist", `ConferenceCoPilot-${version}-win-x64.zip`);

const kilde = join(rod, "node_modules", "electron", "dist");
if (!existsSync(join(kilde, "electron.exe"))) {
  console.error("FEJL: Electron-binæren mangler. Kør: node node_modules/electron/install.js");
  process.exit(1);
}

console.log("1) rydder dist …");
rmSync(join(rod, "dist"), { recursive: true, force: true });
mkdirSync(appMappe, { recursive: true });

console.log("2) kopierer Electron-runtime …");
cpSync(kilde, ud, { recursive: true });

console.log("3) kopierer app-filer …");
for (const f of ["package.json", "src", "README.md", "FEATURES.md", "LICENSE"]) {
  cpSync(join(rod, f), join(appMappe, f), { recursive: true });
}

console.log("4) omdøber electron.exe og laver startfil …");
renameSync(join(ud, "electron.exe"), join(ud, "ConferenceCoPilot.exe"));
writeFileSync(join(ud, "Start Conference Co-Pilot.bat"),
  '@echo off\r\nstart "" "%~dp0ConferenceCoPilot.exe" "%~dp0resources\\app"\r\n', "utf8");

console.log("5) pakker ZIP …");
execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${ud}\\*' -DestinationPath '${zip}' -Force`], { stdio: "inherit" });

const mb = (p) => Math.round(statSync(p).size / 1048576);
console.log("");
console.log(`FÆRDIG: ${zip} (${mb(zip)} MB)`);
console.log(`Udpakket størrelse: ${ud}`);
