// Overlay-vinduet: anvender typografi/placering og viser de undertekster hovedprocessen sender.
const rod = document.getElementById("ramme");
const kildeEl = document.getElementById("kilde");
const oversatEl = document.getElementById("oversat");

const rgba = (hex, alpha) => {
  const h = String(hex || "#000000").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Udvendig kontur: otte skygger rundt om bogstavet bevarer skriftens vaegt (text-stroke traekker indad). */
function konturSkygge(farve, px, ekstra) {
  const dele = [];
  const d = Math.max(0, Math.min(8, Number(px) || 0));
  if (d > 0) {
    const retninger = [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]];
    for (const [x, y] of retninger) dele.push(`${(x * d).toFixed(1)}px ${(y * d).toFixed(1)}px 0 ${farve}`);
  }
  if (ekstra) dele.push(ekstra);
  return dele.length ? dele.join(", ") : "none";
}

function anvend(c) {
  const s = document.documentElement.style;
  s.setProperty("--skrift", `${c.skriftStoerrelse || 34}px`);
  s.setProperty("--familie", `"${c.skriftFamilie || "Segoe UI"}", system-ui, sans-serif`);
  s.setProperty("--tekst", c.tekstFarve || "#ffffff");
  s.setProperty("--bg", rgba(c.baggrundFarve, Number.isFinite(c.baggrundAlpha) ? c.baggrundAlpha : 0.55));
  s.setProperty("--bg-alpha", String(c.baggrundAlpha));
  s.setProperty("--justering", c.justering || "left");
  s.setProperty("--linjer", String(c.maxLinjer || 3));
  s.setProperty("--kontur-px", `${Number(c.konturPx) || 0}px`);
  s.setProperty("--kontur-farve", c.konturFarve || "#000000");

  const skygge = c.skygge ? "0 3px 8px rgba(0,0,0,0.55)" : "";
  const kontur = konturSkygge(c.konturFarve, Number(c.konturPx) || 0, skygge);
  rod.style.textShadow = kontur;
  oversatEl.style.filter = "";
  kildeEl.style.filter = "";
  kildeEl.style.display = c.visKilde === false ? "none" : "";
  document.body.classList.toggle("redigering", Boolean(c.redigering));
}

function vis(d) {
  kildeEl.textContent = d.kilde || "";
  oversatEl.textContent = d.oversat || "";
  // Naar originalsproget er skjult, bruger oversaettelsen hele hoejden (styling i CSS)
  oversatEl.style.webkitLineClamp = document.documentElement.style.getPropertyValue("--linjer") || "3";
}

window.copilot?.paaOverlayConfig?.(anvend);
window.copilot?.paaOverlayTekst?.(vis);
