// Geometri for undertekst-overlayet: presets, klampning til skaermen og placering pr. skaermopsaetning.
// Alle funktioner er rene og unit-testes uden Electron.

export const PRESETS = ["øverst", "midten", "nederst", "brugerdefineret"];

export function standardStoerrelse(workArea, breddePct = 0.9, hoejdePct = 0.22) {
  return {
    w: Math.max(320, Math.round(workArea.width * breddePct)),
    h: Math.max(100, Math.round(workArea.height * hoejdePct)),
  };
}

/** Placerer vinduet efter et preset. Ukendt preset behandles som "nederst". */
export function presetGeometri(workArea, preset, w, h, margin = 24) {
  const a = workArea;
  const width = Math.min(w, a.width);
  const height = Math.min(h, a.height);
  const x = a.x + Math.round((a.width - width) / 2);
  if (preset === "øverst") return { x, y: a.y + margin, width, height };
  if (preset === "midten") return { x, y: a.y + Math.round((a.height - height) / 2), width, height };
  return { x, y: a.y + a.height - height - margin, width, height };
}

/** Holder vinduet helt inde paa skaermen, ogsaa naar brugeren har trukket det ud i kanten. */
export function klamp(geo, workArea, minW = 320, minH = 100) {
  const a = workArea;
  const width = Math.min(Math.max(Math.round(Number(geo?.width) || minW), minW), a.width);
  const height = Math.min(Math.max(Math.round(Number(geo?.height) || minH), minH), a.height);
  const x = Math.min(Math.max(Math.round(Number(geo?.x) || a.x), a.x), a.x + a.width - width);
  const y = Math.min(Math.max(Math.round(Number(geo?.y) || a.y), a.y), a.y + a.height - height);
  return { x, y, width, height };
}

/** Noegle pr. skaermopsaetning, saa 1920x1080 og 1280x720 kan have hver sin placering. */
export function skaermNoegle(skaerm) {
  return `${skaerm.id}@${skaerm.bounds.width}x${skaerm.bounds.height}`;
}

/** Finder den gemte placering for skaermen, ellers preset. Resultatet er altid klampet. */
export function geometriFor(skaerm, overlay = {}) {
  const gemt = overlay?.placering?.prSkarm?.[skaermNoegle(skaerm)];
  if (gemt && Number.isFinite(Number(gemt.width))) return klamp(gemt, skaerm.workArea);
  const { w, h } = standardStoerrelse(skaerm.workArea, overlay?.breddePct ?? 0.9, overlay?.hoejdePct ?? 0.22);
  return presetGeometri(skaerm.workArea, overlay?.placering?.preset || "nederst", w, h);
}

/** Flytter et vindue med en forskydning og klamper resultatet. */
export function flyt(geo, dx, dy, workArea) {
  return klamp({ ...geo, x: geo.x + dx, y: geo.y + dy }, workArea);
}

/** Aendrer bredde/hoejde (fx fra skyder) og beholder centrum. */
export function skaler(geo, nyBredde, nyHoejde, workArea) {
  const cx = geo.x + geo.width / 2;
  const cy = geo.y + geo.height / 2;
  return klamp({ x: cx - nyBredde / 2, y: cy - nyHoejde / 2, width: nyBredde, height: nyHoejde }, workArea);
}

/** Saniterer typografi-indstillinger, saa ugyldige vaerdier falder tilbage til standard. */
export function typografi(overlay = {}) {
  const hex = (v, std) => (/^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v) : std);
  const tal = (v, std, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : std;
  };
  const skriftFamilie = typeof overlay.skriftFamilie === "string" && overlay.skriftFamilie.trim()
    ? overlay.skriftFamilie.trim().slice(0, 80)
    : "Segoe UI";
  return {
    skriftStoerrelse: tal(overlay.skriftStoerrelse, 34, 12, 96),
    skriftFamilie,
    tekstFarve: hex(overlay.tekstFarve, "#ffffff"),
    konturFarve: hex(overlay.konturFarve, "#000000"),
    konturPx: tal(overlay.konturPx, 2, 0, 8),
    skygge: Boolean(overlay.skygge),
    baggrundFarve: hex(overlay.baggrundFarve, "#000000"),
    baggrundAlpha: tal(overlay.baggrundAlpha, 0.55, 0, 1),
    justering: ["left", "center", "right"].includes(overlay.justering) ? overlay.justering : "left",
    visKilde: overlay.visKilde !== false,
    maxLinjer: tal(overlay.maxLinjer, 3, 1, 6),
  };
}
