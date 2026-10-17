// Kontrolpanelet: lyd (mikrofon eller fil), nøgle/model, overlay, udseende og transskript.
"use strict";

const $ = (id) => document.getElementById(id);
const T = {
  indstillinger: null,
  udbydere: [], modeller: [], egne: [],
  mikrofonEnheder: [], udgange: [],
  stream: null, recorder: null, optager: false, analyser: null, niveauTimer: null,
  audioCtx: null, buffer: null, audioEl: null, blobUrl: null,
  sidsteSendt: 0, tikTimer: null, behandler: Promise.resolve(),
  blokke: 0, ord: 0, session: 0, forsinkelser: [], kontekst: "", blokTop: 0,
};

const log = (tekst) => {
  const p = $("log");
  const linje = `[${new Date().toLocaleTimeString("da-DK", { hour12: false })}] ${tekst}`;
  p.textContent += (p.textContent ? "\n" : "") + linje;
  p.scrollTop = p.scrollHeight;
};
const fmtTid = (sek) => {
  const s = Math.max(0, Math.floor(Number(sek) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const saetStatus = (tekst, slags = "") => {
  const p = $("statusPille");
  p.textContent = tekst;
  p.className = "pille " + (slags === "live" ? "pille-live" : slags === "fejl" ? "pille-fejl" : "pille-off");
};
const debounce = (fn, ms = 250) => { let t = null; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// Samme regel som i src/flow.js — rendereren kan ikke importere ES-moduler fra file://
const erHallucination = (tekst) => /subscribe|amara\.org|thanks for watching|thank you for watching|undertekster af|subtitles by|www\.youtube|\.com\/channel/i.test(String(tekst || ""));

// ---------------------------------------------------------------- skrifttyper
function fyldSkrifttyper(liste) {
  const sel = $("skriftFamilie");
  const valgt = T.indstillinger?.overlay?.skriftFamilie || "Segoe UI";
  sel.innerHTML = "";
  const alle = [...new Set([valgt, "Segoe UI", "Arial", "Calibri", ...(liste || [])])];
  alle.forEach((navn) => {
    const o = document.createElement("option");
    o.value = navn; o.textContent = navn;
    sel.appendChild(o);
  });
  sel.value = alle.includes(valgt) ? valgt : alle[0];
}

// ---------------------------------------------------------------- indstillinger
async function gem(del) {
  const r = await window.copilot.settings.gem(del);
  if (r.ok) T.indstillinger = r.indstillinger;
  return r;
}

async function anvendIndstillinger() {
  const i = T.indstillinger;
  $("lydKilde").value = i.lydKilde || "mikrofon";
  $("kildeSprog").value = i.kildeSprog;
  $("maalSprog").value = i.maalSprog;
  $("chunkSekunder").value = i.chunkSekunder;
  $("hastighed").value = String(i.hastighed || 1);
  $("baseUrl").value = i.baseUrl;
  $("demoTilstand").checked = Boolean(i.demo);
  $("lydFilNavn").value = i.lydFil ? `${i.lydFilNavn || ""}  ${i.lydFil}`.trim() : "";
  $("noegleFil").value = i.noegleFil || "";
  $("fontStoerrelse").value = i.overlay.skriftStoerrelse; $("fontVaerdi").textContent = i.overlay.skriftStoerrelse;
  $("skriftFamilie").value = i.overlay.skriftFamilie;
  $("tekstFarve").value = i.overlay.tekstFarve;
  $("konturFarve").value = i.overlay.konturFarve;
  $("konturPx").value = i.overlay.konturPx; $("konturVaerdi").textContent = i.overlay.konturPx;
  $("skygge").checked = Boolean(i.overlay.skygge);
  $("baggrundFarve").value = i.overlay.baggrundFarve;
  $("baggrundAlpha").value = Math.round(i.overlay.baggrundAlpha * 100); $("alphaVaerdi").textContent = Math.round(i.overlay.baggrundAlpha * 100);
  $("justering").value = i.overlay.justering;
  $("maxLinjer").value = i.overlay.maxLinjer;
  $("visKilde").checked = i.overlay.visKilde !== false;
  $("bredde").value = Math.round((i.overlay.breddePct || 0.9) * 100); $("breddeVaerdi").textContent = Math.round((i.overlay.breddePct || 0.9) * 100);
  $("hoejde").value = Math.round((i.overlay.hoejdePct || 0.22) * 100); $("hoejdeVaerdi").textContent = Math.round((i.overlay.hoejdePct || 0.22) * 100);
  $("redigeringstilstand").checked = Boolean(i.overlay.redigering);
  skiftLydKilde();
}

// ---------------------------------------------------------------- nøgle
async function opdaterNoegleStatus() {
  const st = await window.copilot.secrets.status();
  if (!st.ok) return;
  const hvor = st.kilde === "nøglefil" && st.noegleFil ? ` (${st.noegleFil})` : "";
  $("noegleStatus").textContent = st.harNoegle
    ? `Aktiv nøglekilde: ${st.kilde}${hvor} — DPAPI: ${st.kryptering ? "tilgængelig" : "utilgængelig"}`
    : `Ingen nøgle fundet — vælg en nøglefil, gem en nøgle, eller brug Demo-tilstand`;
}

// ---------------------------------------------------------------- modeller
function fyldUdbydere() {
  const sel = $("provider");
  sel.innerHTML = "";
  T.udbydere.forEach((u) => {
    const o = document.createElement("option");
    o.value = u.id; o.textContent = u.navn;
    sel.appendChild(o);
  });
  sel.value = T.indstillinger.provider;
}

function fyldModeller(beholdValg = true) {
  const i = T.indstillinger;
  const lav = (select, anvendelse, valgt) => {
    select.innerHTML = "";
    const liste = T.modeller.filter((m) => m.anvendelse.includes(anvendelse) && (m.udbydere.includes(i.provider) || i.provider === "lokal"));
    const egne = T.egne.filter((m) => m.anvendelse === anvendelse || m.anvendelse === "begge");
    [...liste, ...egne.map((m) => ({ ...m, egen: true }))].forEach((m) => {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = `${m.id}${m.egen ? " (egen)" : m.note ? " — " + m.note : ""}`;
      select.appendChild(o);
    });
    if (beholdValg && [...select.options].some((o) => o.value === valgt)) select.value = valgt;
    else if (select.options.length) select.value = select.options[0].value;
    if (!select.options.length) {
      const o = document.createElement("option");
      o.value = ""; o.textContent = "— ingen modeller —";
      select.appendChild(o);
    }
  };
  lav($("sttModel"), "stt", i.sttModel);
  lav($("mtModel"), "mt", i.mtModel);
  validerModelvalg();
}

async function validerModelvalg() {
  const valg = {
    udbyderId: $("provider").value,
    baseUrl: $("baseUrl").value,
    sttModel: $("sttModel").value,
    mtModel: $("mtModel").value,
  };
  const r = await window.copilot.modeller.valider(valg);
  $("modelStatus").textContent = r.ok ? "Modelvalg OK" : "Bemærk: " + (r.fejl || []).join(" · ");
  $("modelStatus").style.color = r.ok ? "" : "#ffb0b0";
  return r;
}

// ---------------------------------------------------------------- enheder og skærme
async function hentEnheder() {
  try {
    const alle = await navigator.mediaDevices.enumerateDevices();
    T.mikrofonEnheder = alle.filter((d) => d.kind === "audioinput");
    T.udgange = alle.filter((d) => d.kind === "audiooutput");
    const sel = $("enhedVaelger");
    const nu = sel.value;
    sel.innerHTML = "";
    T.mikrofonEnheder.forEach((d, index) => {
      const o = document.createElement("option");
      o.value = d.deviceId;
      o.textContent = d.label || `Lydindgang ${index + 1}`;
      sel.appendChild(o);
    });
    if (!T.mikrofonEnheder.length) {
      const o = document.createElement("option");
      o.value = ""; o.textContent = "Ingen lydindgang fundet";
      sel.appendChild(o);
    }
    if (nu && [...sel.options].some((o) => o.value === nu)) sel.value = nu;
    else if (T.indstillinger?.enhedId && [...sel.options].some((o) => o.value === T.indstillinger.enhedId)) sel.value = T.indstillinger.enhedId;

    const ud = $("lydUdgang");
    const nuUd = ud.value || T.indstillinger?.lydUdgang || "";
    ud.innerHTML = "";
    const ingen = document.createElement("option");
    ingen.value = ""; ingen.textContent = "Ingen lydafspilning";
    ud.appendChild(ingen);
    T.udgange.forEach((d, index) => {
      const o = document.createElement("option");
      o.value = d.deviceId;
      o.textContent = d.label || `Lydudgang ${index + 1}`;
      ud.appendChild(o);
    });
    if ([...ud.options].some((o) => o.value === nuUd)) ud.value = nuUd;
    $("lydStatus").textContent = `${T.mikrofonEnheder.length} lydindgange · ${T.udgange.length} lydudgange`;
  } catch (e) {
    log("FEJL kunne ikke hente enheder: " + e.message);
  }
}

async function fyldSkaerme() {
  const d = await window.copilot.displays();
  if (!d.ok) return;
  T.skaerme = d.skaerme;
  const sel = $("skaermVaelger");
  sel.innerHTML = "";
  d.skaerme.forEach((s) => {
    const o = document.createElement("option");
    o.value = String(s.id);
    o.textContent = `Skærm ${s.indeks + 1}${s.primaer ? " (primær)" : ""} — ${s.bounds.width}×${s.bounds.height}`;
    if (String(T.indstillinger.overlay.skaermId) === String(s.id)) o.selected = true;
    sel.appendChild(o);
  });
}

// ---------------------------------------------------------------- lydfil
function skiftLydKilde() {
  const fil = $("lydKilde").value === "fil";
  $("enhedRaekke").style.display = fil ? "none" : "";
  $("udgangFelt").style.display = fil ? "" : "none";
  $("filFelt").style.display = fil ? "" : "none";
  $("transportFelt").style.display = fil ? "" : "none";
  $("startKnap").textContent = fil ? "▶ Afspil og transskribér" : "▶ Start";
}

async function vaelgLydFil() {
  const r = await window.copilot.dialog.lydFil();
  if (!r.ok) return log("FEJL filvælger: " + r.fejl);
  if (r.annulleret) return;
  await indlaesLydFil(r.sti, r.navn);
}

async function indlaesLydFil(sti, navn) {
  const r = await window.copilot.filer.laes(sti);
  if (!r.ok) return log("FEJL kunne ikke læse filen: " + r.fejl);
  const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
  try {
    T.audioCtx = T.audioCtx || new AudioContext();
    T.buffer = await T.audioCtx.decodeAudioData(bytes.buffer.slice(0));
  } catch (e) {
    return log("FEJL kunne ikke afkode lydfilen: " + e.message);
  }
  if (T.blobUrl) URL.revokeObjectURL(T.blobUrl);
  T.blobUrl = URL.createObjectURL(new Blob([bytes]));
  if (!T.audioEl) {
    T.audioEl = new Audio();
    T.audioEl.addEventListener("ended", () => {
      saetStatus("fil afspillet");
      $("startKnap").disabled = false;
      $("stopKnap").disabled = true;
    });
    T.audioEl.addEventListener("timeupdate", opdaterTid);
  }
  T.audioEl.src = T.blobUrl;
  T.audioEl.playbackRate = Number($("hastighed").value) || 1;
  T.sidsteSendt = 0;
  await gem({ lydKilde: "fil", lydFil: sti, lydFilNavn: navn || r.navn });
  $("lydFilNavn").value = `${navn || r.navn}  ${sti}`;
  $("tidTotal").textContent = fmtTid(T.buffer.duration);
  $("tidNu").textContent = "00:00";
  log(`Lydfil indlæst: ${navn || r.navn} (${fmtTid(T.buffer.duration)}, ${(r.stoerrelse / 1048576).toFixed(1)} MB)`);
}

function opdaterTid() {
  if (!T.audioEl || !T.buffer) return;
  const d = T.buffer.duration || 0;
  $("tidNu").textContent = fmtTid(T.audioEl.currentTime);
  if (d > 0) $("soeg").value = String(Math.round((T.audioEl.currentTime / d) * 1000));
}

async function afspilFil() {
  if (!T.audioEl || !T.buffer) return log("FEJL vælg en lydfil først");
  try {
    if ($("lydUdgang").value) {
      if (T.audioEl.setSinkId) await T.audioEl.setSinkId($("lydUdgang").value);
      T.audioEl.muted = false;
    } else {
      T.audioEl.muted = true;
    }
  } catch (e) {
    log("FEJL lydudgang utilgængelig — afspiller uden lyd: " + e.message);
    T.audioEl.muted = true;
  }
  T.audioEl.playbackRate = Number($("hastighed").value) || 1;
  await T.audioEl.play();
  saetStatus("afspiller", "live");
  $("startKnap").disabled = true;
  $("stopKnap").disabled = false;
  if (!T.tikTimer) T.tikTimer = setInterval(tik, 250);
}

function pauseFil() {
  if (!T.audioEl) return;
  T.audioEl.pause();
  saetStatus("pauset");
  $("startKnap").disabled = false;
  $("stopKnap").disabled = true;
}

function stopFil() {
  if (!T.audioEl) return;
  T.session += 1;              // svar undervejs forkastes
  T.audioEl.pause();
  T.audioEl.currentTime = 0;
  T.sidsteSendt = 0;
  opdaterTid();
  saetStatus("stoppet");
  $("startKnap").disabled = false;
  $("stopKnap").disabled = true;
}

function tik() {
  if (!T.audioEl || !T.buffer) return;
  opdaterTid();
  const d = T.buffer.duration || 0;
  const chunk = Number($("chunkSekunder").value) || 4;
  const nu = T.audioEl.currentTime;

  if (nu + 0.4 < T.sidsteSendt) T.sidsteSendt = nu;      // brugeren har spolet tilbage
  if (!T.audioEl.paused && nu - T.sidsteSendt >= chunk) {
    behandlFilBlok();
  }
  if (d > 0 && nu >= d - 0.15 && T.sidsteSendt < d - 0.8) behandlFilBlok();
}

function behandlFilBlok() {
  if (!T.buffer) return;
  const chunk = Number($("chunkSekunder").value) || 4;
  const start = T.sidsteSendt;
  const slut = Math.min(start + chunk, T.buffer.duration);
  if (slut - start < 0.4) return;
  const { bytes, rms } = wavFraUdsnit(T.buffer, start, slut);
  T.sidsteSendt = slut;
  if (rms < 0.004) {
    log(`[${fmtTid(start)}] stille blok sprunget over`);
    return;
  }
  const startet = performance.now();
  koerBehandling(() => behandl(bytes, "audio/wav", fmtTid(start), startet, rms));
}

// ---------------------------------------------------------------- fælles behandling
function wavFraUdsnit(buffer, startSek, slutSek) {
  const rate = buffer.sampleRate;
  const kanaler = buffer.numberOfChannels || 1;
  const fra = Math.max(0, Math.floor(startSek * rate));
  const til = Math.min(buffer.length, Math.floor(slutSek * rate));
  const antal = Math.max(0, til - fra);
  const samples = new Float32Array(antal);
  for (let k = 0; k < kanaler; k++) {
    const data = buffer.getChannelData(k);
    for (let i = 0; i < antal; i++) samples[i] += data[fra + i] / kanaler;
  }
  const dataBytes = antal * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const skriv = (off, t) => { for (let i = 0; i < t.length; i++) v.setUint8(off + i, t.charCodeAt(i)); };
  skriv(0, "RIFF"); v.setUint32(4, 36 + dataBytes, true); skriv(8, "WAVE"); skriv(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  skriv(36, "data"); v.setUint32(40, dataBytes, true);
  let off = 44;
  for (let i = 0; i < antal; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return { bytes: new Uint8Array(buf), varighedSek: antal / rate, rms: Math.sqrt(samples.reduce((a, v) => a + v * v, 0) / (antal || 1)) };
}

function koerBehandling(fn) {
  T.behandler = T.behandler.then(fn).catch((e) => log("FEJL " + (e?.message || e)));
  return T.behandler;
}

async function behandl(bytes, mime, tid, startet = performance.now(), niveauVaerdi = null) {
  const i = T.indstillinger;
  const minSession = T.session;
  const stt = await window.copilot.stt({ buffer: bytes, mimeType: mime, language: i.kildeSprog, niveau: niveauVaerdi });
  if (stt.fallback) log(`tomt svar fra ${i.sttModel} — brugte whisper-1 i stedet`);
  if (minSession !== T.session) return;
  if (!stt.ok) throw new Error("transskription: " + stt.fejl);
  const tekst = (stt.tekst || "").trim();
  if (!tekst) return;

  // Whisper kan finde paa at skrive "abonnér paa kanalen" paa stilhed — det skal ikke ud i salen
  if (erHallucination(tekst) && (niveauVaerdi === null || niveauVaerdi < 0.02)) {
    log(`[${tid}] kasseret hallucination: ${tekst.slice(0, 50)}`);
    return;
  }

  // 1) vis originalsproget med det samme — kortere oplevet ventetid
  await window.copilot.overlay.tekst({ kilde: tekst, oversat: "…", tid });
  $("kildeTekst").textContent = tekst;

  const mt = await window.copilot.mt({ tekst, fra: i.kildeSprog, til: i.maalSprog, kontekst: T.kontekst || "" });
  if (minSession !== T.session) return;
  const oversat = mt.ok ? mt.tekst : "";
  if (!mt.ok) log("FEJL oversættelse: " + mt.fejl);

  await window.copilot.overlay.tekst({ kilde: tekst, oversat, tid });
  await window.copilot.transskript.tilfoej({ kilde: tekst, oversat, tid });

  T.blokke += 1;
  T.ord += tekst.split(/\s+/).filter(Boolean).length;
  T.kontekst = (T.kontekst ? T.kontekst + " " : "") + tekst;
  if (T.kontekst.length > 240) T.kontekst = T.kontekst.slice(-240);
  $("oversatTekst").textContent = oversat;
  $("blokTal").textContent = `${T.blokke} blokke`;
  $("ordTal").textContent = `${T.ord} ord`;

  const ms = Math.round(performance.now() - startet);
  T.forsinkelser.push(ms);
  if (T.forsinkelser.length > 20) T.forsinkelser.shift();
  const gns = Math.round(T.forsinkelser.reduce((a, b) => a + b, 0) / T.forsinkelser.length);
  $("forsinkelse").textContent = `forsinkelse: ${(ms / 1000).toFixed(1)} s (gns. ${(gns / 1000).toFixed(1)} s)`;
  log(`${tid ? "[" + tid + "] " : ""}${tekst.slice(0, 70)}${tekst.length > 70 ? "…" : ""}`);
}

// ---------------------------------------------------------------- live
async function startLive() {
  const enhedId = $("enhedVaelger").value;
  try {
    T.stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: enhedId ? { exact: enhedId } : undefined, echoCancellation: true, noiseSuppression: true },
    });
  } catch (e) {
    saetStatus("fejl", "fejl");
    return log("FEJL kunne ikke åbne lydindgangen: " + e.message);
  }
  T.audioCtx = T.audioCtx || new AudioContext();
  const kilde = T.audioCtx.createMediaStreamSource(T.stream);
  T.analyser = T.audioCtx.createAnalyser();
  T.analyser.fftSize = 512;
  kilde.connect(T.analyser);
  startNiveau();

  const mime = "audio/webm";
  T.recorder = new MediaRecorder(T.stream, { mimeType: mime });
  const chunk = Number($("chunkSekunder").value) || 4;
  const start = Date.now();
  T.recorder.ondataavailable = async (e) => {
    if (!e.data || e.data.size < 1200) return;
    const bytes = new Uint8Array(await e.data.arrayBuffer());
    const tid = fmtTid((Date.now() - start) / 1000);
    const niveau = T.blokTop || 0;
    T.blokTop = 0;
    koerBehandling(() => behandl(bytes, mime, tid, performance.now(), niveau));
  };
  T.recorder.onstop = () => log("Optagelse stoppet");
  T.recorder.start(chunk * 1000);
  T.optager = true;
  $("startKnap").disabled = true;
  $("stopKnap").disabled = false;
  $("lydKilde").disabled = true;
  saetStatus("optager", "live");
  log(`Optagelse startet (blokke á ${chunk} s)`);

  const spor = T.stream.getAudioTracks()[0];
  spor?.addEventListener("ended", () => {
    log("lyd afbrudt — genstarter om 2 s");
    setTimeout(() => { if (T.optager) { stopLive(true); startLive(); } }, 2000);
  });
}

function startNiveau() {
  const data = new Uint8Array(T.analyser.frequencyBinCount);
  T.niveauTimer = setInterval(() => {
    if (!T.analyser) return;
    T.analyser.getByteTimeDomainData(data);
    let top = 0;
    for (let i = 0; i < data.length; i++) top = Math.max(top, Math.abs(data[i] - 128) / 128);
    T.blokTop = Math.max(T.blokTop || 0, top);
    $("niveauTekst").textContent = `niveau: ${Math.round(top * 100)} %`;
  }, 200);
}

function stopLive(genstart = false) {
  T.optager = false;
  T.session += 1;
  try { T.recorder?.state !== "inactive" && T.recorder?.stop(); } catch { /* intet */ }
  T.stream?.getTracks().forEach((t) => t.stop());
  T.stream = null;
  clearInterval(T.niveauTimer);
  T.niveauTimer = null;
  T.analyser = null;
  $("startKnap").disabled = false;
  $("stopKnap").disabled = true;
  $("lydKilde").disabled = false;
  if (!genstart) saetStatus("stoppet");
}

// ---------------------------------------------------------------- overlay
function overlayFraUI() {
  return {
    skriftStoerrelse: Number($("fontStoerrelse").value),
    skriftFamilie: $("skriftFamilie").value,
    tekstFarve: $("tekstFarve").value,
    konturFarve: $("konturFarve").value,
    konturPx: Number($("konturPx").value),
    skygge: $("skygge").checked,
    baggrundFarve: $("baggrundFarve").value,
    baggrundAlpha: Number($("baggrundAlpha").value) / 100,
    justering: $("justering").value,
    maxLinjer: Number($("maxLinjer").value),
    visKilde: $("visKilde").checked,
  };
}
const gemOverlay = debounce(async () => {
  const r = await window.copilot.overlay.config(overlayFraUI());
  if (r.ok) T.indstillinger.overlay = r.overlay;
}, 220);

// ---------------------------------------------------------------- init
async function indlaes() {
  const info = await window.copilot.info();
  $("version").textContent = `v${info.version}${info.pakket ? "" : " (dev)"}`;
  log(`Datamappe: ${info.dataMappe}`);

  const st = await window.copilot.settings.hent();
  T.indstillinger = st.indstillinger;

  const mo = await window.copilot.modeller.hent();
  T.udbydere = mo.udbydere; T.modeller = mo.modeller; T.egne = mo.egne || [];

  const fonte = await window.copilot.skrifttyper();
  fyldSkrifttyper(fonte.ok ? fonte.skrifttyper : []);

  fyldUdbydere();
  fyldModeller(false);
  await anvendIndstillinger();
  await fyldSkaerme();
  await opdaterNoegleStatus();
  await hentEnheder();
  if (T.indstillinger.lydFil) await indlaesLydFil(T.indstillinger.lydFil, T.indstillinger.lydFilNavn).catch(() => {});

  log("Klar.");
}

// ---------------------------------------------------------------- events
$("lydKilde").addEventListener("change", () => { skiftLydKilde(); gem({ lydKilde: $("lydKilde").value }); });
$("opdaterEnheder").addEventListener("click", hentEnheder);
$("enhedVaelger").addEventListener("change", () => gem({ enhedId: $("enhedVaelger").value }));
$("vaelgLydFil").addEventListener("click", vaelgLydFil);
$("rydLydFil").addEventListener("click", async () => {
  stopFil();
  T.buffer = null;
  if (T.blobUrl) { URL.revokeObjectURL(T.blobUrl); T.blobUrl = null; }
  $("lydFilNavn").value = "";
  $("tidTotal").textContent = "00:00";
  await gem({ lydFil: "", lydFilNavn: "" });
});
$("afspil").addEventListener("click", afspilFil);
$("pause").addEventListener("click", pauseFil);
$("stop").addEventListener("click", stopFil);
$("soeg").addEventListener("input", () => {
  if (!T.audioEl || !T.buffer) return;
  T.audioEl.currentTime = (Number($("soeg").value) / 1000) * (T.buffer.duration || 0);
  T.sidsteSendt = T.audioEl.currentTime;
  opdaterTid();
});
$("hastighed").addEventListener("change", async () => {
  const v = Number($("hastighed").value);
  if (T.audioEl) T.audioEl.playbackRate = v;
  await gem({ hastighed: v });
});
$("lydUdgang").addEventListener("change", async () => {
  const id = $("lydUdgang").value;
  await gem({ lydUdgang: id });
  if (T.audioEl) {
    try { if (id && T.audioEl.setSinkId) await T.audioEl.setSinkId(id); T.audioEl.muted = !id; }
    catch (e) { log("FEJL lydudgang: " + e.message); T.audioEl.muted = true; }
  }
});
$("startKnap").addEventListener("click", () => {
  if ($("lydKilde").value === "fil") return afspilFil();
  startLive();
});
$("stopKnap").addEventListener("click", () => {
  if ($("lydKilde").value === "fil") stopFil();
  else stopLive();
  saetStatus("stoppet");
});
$("chunkSekunder").addEventListener("change", () => gem({ chunkSekunder: Number($("chunkSekunder").value) }));
$("kildeSprog").addEventListener("change", async () => {
  T.kontekst = "";
  await gem({ kildeSprog: $("kildeSprog").value });
  log("Kildesprog: " + $("kildeSprog").options[$("kildeSprog").selectedIndex].text);
});
$("maalSprog").addEventListener("change", async () => {
  T.kontekst = "";
  await gem({ maalSprog: $("maalSprog").value });
  log("Målsprog: " + $("maalSprog").options[$("maalSprog").selectedIndex].text);
});
$("byttSprog").addEventListener("click", async () => {
  const fra = $("maalSprog").value;
  const til = $("kildeSprog").value;
  $("kildeSprog").value = fra;
  $("maalSprog").value = til;
  T.kontekst = "";
  await gem({ kildeSprog: fra, maalSprog: til });
  log(`Sprog byttet: ${fra} → ${til}`);
});

$("vaelgNoegleFil").addEventListener("click", async () => {
  const r = await window.copilot.dialog.noegleFil();
  if (!r.ok) return log("FEJL filvælger: " + r.fejl);
  if (r.annulleret) return;
  const p = await window.copilot.secrets.proevFil(r.sti);
  if (!p.ok) return log("FEJL kunne ikke læse nøglefilen: " + p.fejl);
  await gem({ noegleFil: r.sti });
  $("noegleFil").value = r.sti;
  log("Nøglefil i brug: " + r.sti);
  await opdaterNoegleStatus();
});
$("rydNoegleFil").addEventListener("click", async () => {
  await gem({ noegleFil: "" });
  $("noegleFil").value = "";
  log("Nøglefil fjernet");
  await opdaterNoegleStatus();
});
$("gemNoegle").addEventListener("click", async () => {
  const v = $("noegleInput").value;
  if (!v.trim()) return log("FEJL indtast en nøgle først");
  const r = await window.copilot.secrets.gem(v.trim());
  $("noegleInput").value = "";
  log(r.ok ? "Nøgle gemt (krypteret)" : "FEJL kunne ikke gemme: " + r.fejl);
  await opdaterNoegleStatus();
});
$("sletNoegle").addEventListener("click", async () => {
  await window.copilot.secrets.slet();
  log("Nøgle slettet");
  await opdaterNoegleStatus();
});

$("provider").addEventListener("change", async () => {
  const u = T.udbydere.find((x) => x.id === $("provider").value);
  const del = { provider: $("provider").value };
  if (u) del.baseUrl = u.baseUrl;
  await gem(del);
  $("baseUrl").value = T.indstillinger.baseUrl;
  fyldModeller(false);
});
$("baseUrl").addEventListener("change", async () => { await gem({ baseUrl: $("baseUrl").value }); validerModelvalg(); });
$("sttModel").addEventListener("change", async () => { await gem({ sttModel: $("sttModel").value }); validerModelvalg(); });
$("mtModel").addEventListener("change", async () => { await gem({ mtModel: $("mtModel").value }); validerModelvalg(); });
$("tilfoejModel").addEventListener("click", async () => {
  const id = $("egenModelId").value.trim();
  if (!id) return log("FEJL skriv et model-ID");
  const anvendelse = $("egenModelAnvendelse").value;
  const egne = [...(T.indstillinger.egneModeller || []), { id, anvendelse, navn: id }];
  await gem({ egneModeller: egne });
  T.egne = egne;
  $("egenModelId").value = "";
  fyldModeller(false);
  log(`Egen model tilføjet: ${id} (${anvendelse})`);
});
$("demoTilstand").addEventListener("change", () => gem({ demo: $("demoTilstand").checked }));
$("testForbindelse").addEventListener("click", async () => {
  $("testStatus").textContent = "tester…";
  const r = await window.copilot.testForbindelse();
  $("testStatus").textContent = r.ok ? `OK: ${r.svar}` : "Fejl: " + r.fejl;
});

$("skaermVaelger").addEventListener("change", async () => {
  await gem({ overlay: { skaermId: Number($("skaermVaelger").value) } });
});
document.querySelectorAll("[data-preset]").forEach((b) => {
  b.addEventListener("click", async () => {
    const r = await window.copilot.overlay.preset(b.dataset.preset);
    if (r.ok) log("Placering: " + b.dataset.preset);
    document.querySelectorAll("[data-preset]").forEach((x) => x.classList.toggle("aktiv", x === b));
  });
});
const gemStoerrelse = debounce(async () => {
  await window.copilot.overlay.stoerrelse({ breddePct: Number($("bredde").value) / 100, hoejdePct: Number($("hoejde").value) / 100 });
}, 200);
$("bredde").addEventListener("input", () => { $("breddeVaerdi").textContent = $("bredde").value; gemStoerrelse(); });
$("hoejde").addEventListener("input", () => { $("hoejdeVaerdi").textContent = $("hoejde").value; gemStoerrelse(); });
$("redigeringstilstand").addEventListener("change", async () => {
  const r = await window.copilot.overlay.redigering($("redigeringstilstand").checked);
  if (r.ok) log(r.redigering ? "Redigeringstilstand: træk overlayet med musen" : "Redigeringstilstand slået fra (klik-gennem)");
});
$("visOverlay").addEventListener("click", () => window.copilot.overlay.vis(true));
$("skjulOverlay").addEventListener("click", () => window.copilot.overlay.vis(false));
$("proevTekst").addEventListener("click", () => window.copilot.overlay.tekst({
  kilde: "Velkommen til konferencen. Vi starter om et øjeblik.",
  oversat: "Welcome to the conference. We will begin in a moment.",
  tid: "00:00",
}));

$("fontStoerrelse").addEventListener("input", () => { $("fontVaerdi").textContent = $("fontStoerrelse").value; gemOverlay(); });
$("konturPx").addEventListener("input", () => { $("konturVaerdi").textContent = $("konturPx").value; gemOverlay(); });
$("baggrundAlpha").addEventListener("input", () => { $("alphaVaerdi").textContent = $("baggrundAlpha").value; gemOverlay(); });
["skriftFamilie", "tekstFarve", "konturFarve", "baggrundFarve", "justering", "skygge", "visKilde"].forEach((id) => {
  $(id).addEventListener("change", gemOverlay);
});
$("maxLinjer").addEventListener("change", gemOverlay);
$("aabnMappe").addEventListener("click", () => window.copilot.transskript.mappe());

// ---------------------------------------------------------------- selftest-hooks
window.__selftestEnheder = async () => {
  const d = await navigator.mediaDevices.enumerateDevices();
  return d.filter((x) => x.kind === "audioinput").map((x) => x.label || x.deviceId);
};
window.__selftestUdgange = async () => {
  const d = await navigator.mediaDevices.enumerateDevices();
  return d.filter((x) => x.kind === "audiooutput").map((x) => x.label || x.deviceId);
};
window.__selftestMikrofon = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    const kilde = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    kilde.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let top = 0;
    const start = Date.now();
    await new Promise((r) => {
      const t = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        for (let i = 0; i < data.length; i++) top = Math.max(top, Math.abs(data[i] - 128) / 128);
        if (Date.now() - start > 1500) { clearInterval(t); r(); }
      }, 100);
    });
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close();
    return { ok: true, varighedMs: Date.now() - start, topNiveau: Math.round(top * 100) };
  } catch (e) {
    return { ok: false, fejl: e.message };
  }
};

// Bruges af main-processens --lydfil-test: indlæser filen og koerer én blok gennem samme kodevej som under afspilning.
window.__testLydfil = async (sti, fraSek = 0) => {
  await indlaesLydFil(sti, String(sti).split(/[\\/]/).pop());
  if (!T.buffer) return { ok: false, fejl: "kunne ikke afkode lydfilen" };
  const start = Math.max(0, Number(fraSek) || 0);
  const chunk = Number($("chunkSekunder").value) || 4;
  const slut = Math.min(start + chunk, T.buffer.duration);
  const { bytes, rms } = wavFraUdsnit(T.buffer, start, slut);
  const t0 = performance.now();
  await behandl(bytes, "audio/wav", fmtTid(start));
  return {
    ok: T.blokke > 0,
    varighed: T.buffer.duration,
    blokSek: slut - start,
    rms: +rms.toFixed(4),
    ms: Math.round(performance.now() - t0),
    blokke: T.blokke,
    ord: T.ord,
    kilde: $("kildeTekst").textContent,
    oversat: $("oversatTekst").textContent,
  };
};

// Bruges af main-processens --stop-test: afspiller, klikker Stop og rapporterer tilstanden.
window.__testStop = async (sti) => {
  try {
    await indlaesLydFil(sti, String(sti).split(/[\\/]/).pop());
    if (!T.buffer) return { ok: false, fejl: "kunne ikke afkode lydfilen" };
    await afspilFil();
    await new Promise((r) => setTimeout(r, 1200));
    const foer = { paused: T.audioEl.paused, tid: T.audioEl.currentTime, stopKnapSlaaetFra: $("stopKnap").disabled };
    stopFil();
    await new Promise((r) => setTimeout(r, 400));
    const efter = { paused: T.audioEl.paused, tid: T.audioEl.currentTime, startKnapSlaaetFra: $("startKnap").disabled, stopKnapSlaaetFra: $("stopKnap").disabled };
    return { ok: foer.paused === false && efter.paused === true && efter.tid === 0, foer, efter };
  } catch (e) {
    return { ok: false, fejl: String(e?.message || e), navn: String(e?.name || ""), foer: null, efter: null };
  }
};

indlaes().catch((e) => log("FEJL opstart: " + e.message));
