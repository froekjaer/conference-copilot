// Kontrolpanelets logik: lydoptagelse i blokke, koerende behandlingsko, overlay og transskript.
const $ = (id) => document.getElementById(id);
const tilstand = { optager: false, stream: null, recorder: null, ko: [], arbejder: false, blokke: 0, ord: 0, genstartTimer: null };

function log(linje) {
  const div = document.createElement("div");
  div.textContent = `[${new Date().toLocaleTimeString()}] ${linje}`;
  $("log").prepend(div);
  while ($("log").childNodes.length > 120) $("log").removeChild($("log").lastChild);
}
function saetStatus(tekst, slags = "") {
  const p = $("statusPille");
  p.textContent = tekst;
  p.className = "pille " + (slags === "live" ? "pille-live" : slags === "fejl" ? "pille-fejl" : "pille-off");
}
const sov = (ms) => new Promise((r) => setTimeout(r, ms));

async function medGenforsoeg(fn, navn, forsog = 3) {
  let sidste;
  for (let i = 1; i <= forsog; i++) {
    try { return await fn(); }
    catch (e) {
      sidste = e;
      const fejl = e?.fejl || e?.message || String(e);
      if (i === forsog) { log(`FEJL ${navn} (forsøg ${i}/${forsog}): ${fejl}`); break; }
      log(`ADVARSEL ${navn} fejlede (forsøg ${i}/${forsog}): ${fejl} — prøver igen`);
      await sov(700 * i);
    }
  }
  throw sidste;
}

// ---------------------------------------------------------------- enheder
async function hentEnheder() {
  try {
    // Laas op for etiketter: bed om mikrofonadgang en gang.
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
  } catch (e) { /* ingen adgang — listen vises uden etiketter */ }
  const enheder = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
  const vaelger = $("enhedsVaelger");
  vaelger.innerHTML = "";
  enheder.forEach((d, i) => {
    const o = document.createElement("option");
    o.value = d.deviceId;
    o.textContent = d.label || `Lydindgang ${i + 1}`;
    vaelger.appendChild(o);
  });
  if (enheder.length === 0) {
    const o = document.createElement("option");
    o.value = ""; o.textContent = "(ingen lydindgang fundet)";
    vaelger.appendChild(o);
  }
  log(`Lydindgange fundet: ${enheder.length}`);
  return enheder;
}

// ---------------------------------------------------------------- optagelse
function nivellering(stream) {
  const ctx = new AudioContext();
  const kilde = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  kilde.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const id = setInterval(() => {
    analyser.getByteTimeDomainData(data);
    let max = 0;
    for (const v of data) max = Math.max(max, Math.abs(v - 128));
    const pct = Math.round((max / 128) * 100);
    $("niveauTekst").textContent = `niveau: ${pct} %`;
  }, 400);
  return () => { clearInterval(id); try { ctx.close(); } catch { /* intet */ } };
}

async function startOptagelse() {
  const enhedsId = $("enhedsVaelger").value;
  const begraensninger = { echoCancellation: false, noiseSuppression: false, autoGainControl: true };
  if (enhedsId) begraensninger.deviceId = { exact: enhedsId };
  tilstand.stream = await navigator.mediaDevices.getUserMedia({ audio: begraensninger });

  const spor = tilstand.stream.getAudioTracks()[0];
  const stopper = nivellering(tilstand.stream);
  tilstand.stopperNiveau = stopper;

  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
  const optager = new MediaRecorder(tilstand.stream, { mimeType: mime });
  tilstand.recorder = optager;
  const blokMs = Math.max(3, Math.min(20, Number($("chunkSekunder").value) || 6)) * 1000;

  optager.ondataavailable = (e) => {
    if (e.data && e.data.size > 800) e.data.arrayBuffer().then((buf) => { tilstand.ko.push({ buf, mime }); koerKo(); });
  };
  optager.start(blokMs);
  tilstand.optager = true;

  // Lydafbrydelse: genstart optagelsen automatisk
  spor.addEventListener("ended", () => {
    log("ADVARSEL lydindgang afbrudt — genstarter om 2 s");
    $("lydStatus").textContent = "lyd afbrudt — genstarter…";
    clearTimeout(tilstand.genstartTimer);
    tilstand.genstartTimer = setTimeout(async () => {
      await stopOptagelse(true);
      try { await startOptagelse(); log("optagelse genstartet"); } catch (e) { log("FEJL kunne ikke genstarte: " + (e.message || e)); saetStatus("lyd afbrudt", "fejl"); }
    }, 2000);
  });

  saetStatus("lytter", "live");
  $("startKnap").disabled = true;
  $("stopKnap").disabled = false;
  $("lydStatus").textContent = `optager i blokke på ${blokMs / 1000} s (${mime})`;
  log("Optagelse startet");
}

async function stopOptagelse(stille = false) {
  tilstand.optager = false;
  try { if (tilstand.recorder && tilstand.recorder.state !== "inactive") tilstand.recorder.stop(); } catch { /* intet */ }
  try { if (tilstand.stopperNiveau) tilstand.stopperNiveau(); } catch { /* intet */ }
  try { if (tilstand.stream) tilstand.stream.getTracks().forEach((t) => t.stop()); } catch { /* intet */ }
  tilstand.stream = null; tilstand.recorder = null;
  if (!stille) {
    saetStatus("stoppet");
    $("startKnap").disabled = false;
    $("stopKnap").disabled = true;
    $("lydStatus").textContent = "";
    log("Optagelse stoppet");
  }
}

// ---------------------------------------------------------------- behandlingsko
async function koerKo() {
  if (tilstand.arbejder) return;
  tilstand.arbejder = true;
  try {
    while (tilstand.ko.length) {
      const { buf, mime } = tilstand.ko.shift();
      try {
        const stt = await medGenforsoeg(() => window.copilot.stt({ buffer: buf, mimeType: mime, language: $("kildeSprog").value }), "transskription");
        const kildeTekst = (stt?.tekst || "").trim();
        if (stt?.ok === false) throw new Error(stt.fejl);
        if (!kildeTekst) { log("tom transskription — springer over"); continue; }

        const mt = await medGenforsoeg(() => window.copilot.mt({ tekst: kildeTekst, fra: $("kildeSprog").value, til: $("maalSprog").value }), "oversættelse");
        if (mt?.ok === false) throw new Error(mt.fejl);
        const oversat = (mt?.tekst || "").trim();

        $("liveKilde").textContent = kildeTekst;
        $("liveOversat").textContent = oversat;
        await window.copilot.overlay.tekst({ kilde: kildeTekst, oversat });
        await window.copilot.transskript.tilfoej({ kilde: kildeTekst, oversat });

        tilstand.blokke++;
        tilstand.ord += oversat.split(/\s+/).filter(Boolean).length;
        $("taeller").textContent = `${tilstand.blokke} blokke · ${tilstand.ord} ord`;
        log(`OK ${kildeTekst.slice(0, 60)}${kildeTekst.length > 60 ? "…" : ""}`);
      } catch (e) {
        log("FEJL i behandling: " + (e?.fejl || e?.message || e));
        saetStatus("fejl — kører videre", "fejl");
        setTimeout(() => { if (tilstand.optager) saetStatus("lytter", "live"); }, 2500);
      }
    }
  } finally {
    tilstand.arbejder = false;
  }
}

// ---------------------------------------------------------------- UI-binding
async function indlaesAlt() {
  const info = await window.copilot.info();
  $("version").textContent = `v${info.version}${info.pakket ? "" : " (dev)"}`;
  log(`Datamappe: ${info.dataMappe}`);

  const st = await window.copilot.settings.hent();
  const i = st.indstillinger;
  $("baseUrl").value = i.baseUrl; $("sttModel").value = i.sttModel; $("mtModel").value = i.mtModel;
  $("kildeSprog").value = i.kildeSprog; $("maalSprog").value = i.maalSprog;
  $("chunkSekunder").value = i.chunkSekunder;
  $("demoTilstand").checked = i.provider === "demo";
  $("fontStoerrelse").value = i.overlay.skriftStoerrelse; $("fontVaerdi").textContent = i.overlay.skriftStoerrelse;
  $("baggrundAlpha").value = Math.round(i.overlay.baggrundAlpha * 100); $("alphaVaerdi").textContent = Math.round(i.overlay.baggrundAlpha * 100);
  $("visKilde").checked = i.overlay.visKilde !== false;
  $("klikGennem").checked = i.overlay.klikGennem !== false;

  const d = await window.copilot.displays();
  $("skaermVaelger").innerHTML = "";
  d.skaerme.forEach((s) => {
    const o = document.createElement("option");
    o.value = String(s.id);
    o.textContent = `Skærm ${s.indeks + 1}${s.primaer ? " (primær)" : ""} — ${s.bounds.width}×${s.bounds.height}`;
    if (String(i.overlay.skaermId) === String(s.id)) o.selected = true;
    $("skaermVaelger").appendChild(o);
  });
  await opdaterNoegleStatus();
  await hentEnheder();
}

async function opdaterNoegleStatus() {
  const s = await window.copilot.secrets.status();
  $("noegleStatus").textContent = s.harNoegle
    ? `nøgle gemt (kilde: ${s.kilde}) — kryptering: ${s.kryptering ? "DPAPI" : "utilgængelig"}`
    : `ingen nøgle gemt — kryptering: ${s.kryptering ? "tilgængelig" : "UTILGÆNGELIG"}`;
}

$("opdaterEnheder").onclick = () => hentEnheder().catch((e) => log("FEJL enhedsliste: " + e.message));
$("startKnap").onclick = () => startOptagelse().catch((e) => { log("FEJL start: " + (e.message || e)); saetStatus("kunne ikke starte", "fejl"); });
$("stopKnap").onclick = () => stopOptagelse();

$("gemNoegle").onclick = async () => {
  const v = $("noegleInput").value;
  if (!v.trim()) return log("FEJL indtast en nøgle først");
  const r = await window.copilot.secrets.gem(v.trim());
  $("noegleInput").value = "";
  log(r.ok ? "Nøgle gemt (krypteret)" : "FEJL kunne ikke gemme: " + r.fejl);
  await opdaterNoegleStatus();
};
$("sletNoegle").onclick = async () => { await window.copilot.secrets.slet(); log("Nøgle slettet"); await opdaterNoegleStatus(); };
$("testForbindelse").onclick = async () => {
  $("testStatus").textContent = "tester…";
  const r = await window.copilot.testForbindelse();
  $("testStatus").textContent = r.ok ? `svar: ${r.svar}` : `fejl: ${r.fejl}`;
  log(r.ok ? "Forbindelsestest OK" : "Forbindelsestest fejlede: " + r.fejl);
};

async function gemIndstillinger() {
  await window.copilot.settings.gem({
    baseUrl: $("baseUrl").value.trim(), sttModel: $("sttModel").value.trim(), mtModel: $("mtModel").value.trim(),
    kildeSprog: $("kildeSprog").value, maalSprog: $("maalSprog").value,
    chunkSekunder: Number($("chunkSekunder").value) || 6,
    provider: $("demoTilstand").checked ? "demo" : "api",
  });
}
["baseUrl", "sttModel", "mtModel", "kildeSprog", "maalSprog", "chunkSekunder"].forEach((id) => { $(id).onchange = gemIndstillinger; });
$("demoTilstand").onchange = async () => { await gemIndstillinger(); log("Demo-tilstand: " + ($("demoTilstand").checked ? "TIL" : "FRA")); };

$("fontStoerrelse").oninput = () => { $("fontVaerdi").textContent = $("fontStoerrelse").value; window.copilot.overlay.config({ skriftStoerrelse: Number($("fontStoerrelse").value) }); };
$("baggrundAlpha").oninput = () => { $("alphaVaerdi").textContent = $("baggrundAlpha").value; window.copilot.overlay.config({ baggrundAlpha: Number($("baggrundAlpha").value) / 100 }); };
$("visKilde").onchange = () => window.copilot.overlay.config({ visKilde: $("visKilde").checked });
$("klikGennem").onchange = () => window.copilot.overlay.config({ klikGennem: $("klikGennem").checked });
$("skaermVaelger").onchange = () => window.copilot.overlay.config({ skaermId: Number($("skaermVaelger").value) });
$("visOverlay").onclick = () => window.copilot.overlay.vis(true);
$("skjulOverlay").onclick = () => window.copilot.overlay.vis(false);
$("testTekst").onclick = () => window.copilot.overlay.tekst({ kilde: "Dette er en prøvetekst på dansk.", oversat: "This is a test sentence in English." });
$("aabnMappe").onclick = async () => { const r = await window.copilot.transskript.mappe(); log("Transskriptioner: " + r.mappe); };

// ---------------------------------------------------------------- selftest-hooks (bruges af --selftest)
window.__selftestEnheder = async () => {
  const e = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
  return e.map((d, i) => d.label || `input-${i}`);
};
window.__selftestMikrofon = async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(s);
    const an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
    const data = new Uint8Array(an.frequencyBinCount);
    let max = 0;
    const slut = Date.now() + 1500;
    while (Date.now() < slut) { an.getByteTimeDomainData(data); for (const v of data) max = Math.max(max, Math.abs(v - 128)); await sov(100); }
    s.getTracks().forEach((t) => t.stop()); try { await ctx.close(); } catch { /* intet */ }
    return { ok: true, varighedMs: 1500, topNiveau: Math.round((max / 128) * 100) };
  } catch (e) { return { ok: false, fejl: e.message }; }
};

indlaesAlt().catch((e) => log("FEJL opstart: " + (e.message || e)));
