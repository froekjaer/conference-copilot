// Genererer en kort WAV-fil til MEKANISK test af keden (ikke tale).
// Til den RIGTIGE test skal der bruges en dansk taleoptagelse (fx egen optagelse eller public domain-lyd).
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const her = dirname(fileURLToPath(import.meta.url));
const ud = join(her, "assets");
mkdirSync(ud, { recursive: true });

const rate = 16000;
const sekunder = 4;
const samples = rate * sekunder;
const data = Buffer.alloc(samples * 2);

for (let i = 0; i < samples; i++) {
  const t = i / rate;
  let v = 0;
  if (t >= 0.5 && t < 1.5) v = Math.sin(2 * Math.PI * 440 * t) * 0.25;
  else if (t >= 2.0 && t < 3.0) v = Math.sin(2 * Math.PI * 660 * t) * 0.25;
  data.writeInt16LE(Math.round(v * 32767), i * 2);
}

const hoved = Buffer.alloc(44);
hoved.write("RIFF", 0);
hoved.writeUInt32LE(36 + data.length, 4);
hoved.write("WAVE", 8);
hoved.write("fmt ", 12);
hoved.writeUInt32LE(16, 16);
hoved.writeUInt16LE(1, 20);          // PCM
hoved.writeUInt16LE(1, 22);          // mono
hoved.writeUInt32LE(rate, 24);
hoved.writeUInt32LE(rate * 2, 28);
hoved.writeUInt16LE(2, 32);
hoved.writeUInt16LE(16, 34);
hoved.write("data", 36);
hoved.writeUInt32LE(data.length, 40);

const fil = join(ud, "mekanisk-test.wav");
writeFileSync(fil, Buffer.concat([hoved, data]));
console.log(`skrev ${fil} (${(hoved.length + data.length)} bytes, ${sekunder} s, 440/660 Hz toner — ikke tale)`);
