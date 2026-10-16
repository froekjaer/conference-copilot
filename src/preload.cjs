// Preload: sikker bro mellem renderer og hovedproces (contextIsolation).
const { contextBridge, ipcRenderer } = require("electron");

const kald = (kanal, ...args) => ipcRenderer.invoke(kanal, ...args);

contextBridge.exposeInMainWorld("copilot", {
  info: () => kald("info"),
  displays: () => kald("displays"),
  settings: { hent: () => kald("settings:get"), gem: (d) => kald("settings:set", d) },
  secrets: { status: () => kald("secrets:status"), gem: (n) => kald("secrets:set", n), slet: () => kald("secrets:clear") },
  overlay: {
    config: (d) => kald("overlay:config", d),
    tekst: (d) => kald("overlay:tekst", d),
    vis: (v) => kald("overlay:vis", v),
  },
  stt: (d) => kald("stt:transcribe", d),
  mt: (d) => kald("mt:translate", d),
  transskript: { tilfoej: (d) => kald("transcript:append", d), mappe: () => kald("transcript:mappe") },
  testForbindelse: () => kald("test:forbindelse"),
  // overlay-vinduet lytter paa disse
  paaOverlayTekst: (fn) => ipcRenderer.on("overlay:tekst", (_e, d) => fn(d)),
  paaOverlayConfig: (fn) => ipcRenderer.on("overlay:config", (_e, d) => fn(d)),
});
