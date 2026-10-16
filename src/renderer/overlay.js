// Overlay-renderer: modtager undertekster og konfiguration fra hovedprocessen.
const $ = (id) => document.getElementById(id);

window.copilot.paaOverlayConfig((c) => {
  if (typeof c?.skriftStoerrelse === "number") document.documentElement.style.setProperty("--skrift", c.skriftStoerrelse + "px");
  if (typeof c?.baggrundAlpha === "number") document.documentElement.style.setProperty("--alpha", String(c.baggrundAlpha));
  if (typeof c?.visKilde === "boolean") $("kilde").style.visibility = c.visKilde ? "visible" : "hidden";
});

window.copilot.paaOverlayTekst((d) => {
  const kilde = String(d?.kilde || "").trim();
  const oversat = String(d?.oversat || "").trim();
  if (kilde) $("kilde").textContent = kilde;
  if (oversat) $("oversat").textContent = oversat;
  else if (kilde) $("oversat").textContent = kilde;
});
