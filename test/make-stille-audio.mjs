// Laver testfiler: ren stilhed og svag stoej (som et lydkort uden tale).
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const her = dirname(fileURLToPath(import.meta.url));
const ud = join(her, "assets");
mkdirSync(ud, { recursive: true });

function skrivWav(fil, samples, rate = 16000) {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataBytes, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(fil, buf);
  console.log(`skrev ${fil} (${(buf.length / 1024).toFixed(0)} KB, ${(samples.length / rate).toFixed(1)} s)`);
}

const rate = 16000;
const sekunder = 4;

// 1) ren stilhed
skrivWav(join(ud, "stille.wav"), new Float32Array(rate * sekunder));

// 2) svag stoej som et lydkort i tom sal (ca. -50 dB)
const stoej = new Float32Array(rate * sekunder);
for (let i = 0; i < stoej.length; i++) stoej[i] = (Math.random() * 2 - 1) * 0.003;
skrivWav(join(ud, "stoej.wav"), stoej);

// 3) stoej med et lille klik (som en stol der flytter sig)
const medKlik = new Float32Array(stoej);
for (let i = 0; i < 800; i++) medKlik[rate + i] += Math.sin((2 * Math.PI * 900 * i) / rate) * 0.12;
skrivWav(join(ud, "stoej-klik.wav"), medKlik);
