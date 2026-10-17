// WAV-kodning og udsnit af dekodede lyddata. Bruges naar en lydfil koeres gennem
// samme pipeline som live-lyd: hver blok klippes ud og sendes som WAV.

/** Koder mono/stereo Float32-samples til 16-bit PCM WAV. */
export function kodWav(samples, sampleRate, kanaler = 1) {
  const antalFrames = Math.floor(samples.length / kanaler);
  const dataBytes = antalFrames * kanaler * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const skriv = (offset, tekst) => {
    for (let i = 0; i < tekst.length; i++) view.setUint8(offset + i, tekst.charCodeAt(i));
  };
  skriv(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  skriv(8, "WAVE");
  skriv(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, kanaler, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * kanaler * 2, true);
  view.setUint16(32, kanaler * 2, true);
  view.setUint16(34, 16, true);
  skriv(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < antalFrames * kanaler; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

/** Klipper [startSek, slutSek) ud af en AudioBuffer-lignende struktur som mono Float32. */
export function udsnit(buffer, startSek, slutSek) {
  const rate = buffer.sampleRate;
  const kanaler = buffer.numberOfChannels || 1;
  const fra = Math.max(0, Math.floor(startSek * rate));
  const til = Math.min(buffer.length, Math.floor(slutSek * rate));
  const antal = Math.max(0, til - fra);
  const ud = new Float32Array(antal);
  for (let k = 0; k < kanaler; k++) {
    const data = buffer.getChannelData(k);
    for (let i = 0; i < antal; i++) ud[i] += data[fra + i] / kanaler;
  }
  return ud;
}

/** Samples om til en WAV-blob klar til API-kald. */
export function wavFraUdsnit(buffer, startSek, slutSek) {
  const samples = udsnit(buffer, startSek, slutSek);
  return { bytes: kodWav(samples, buffer.sampleRate, 1), varighedSek: samples.length / buffer.sampleRate };
}
