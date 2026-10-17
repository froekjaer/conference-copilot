// Preload: sikker bro mellem renderer og hovedproces (contextIsolation).
const { contextBridge, ipcRenderer } = require("electron");

const kald = (kanal, ...args) => ipcRenderer.invoke(kanal, ...args);

contextBridge.exposeInMainWorld("copilot", {
  info: () => kald("info"),
  displays: () => kald("displays"),
  settings: { hent: () => kald("settings:get"), gem: (d) => kald("settings:set", d) },
  secrets: {
    status: () => kald("secrets:status"),
    gem: (n) => kald("secrets:set", n),
    slet: () => kald("secrets:clear"),
    proevFil: (sti) => kald("secrets:proev-fil", sti),
  },
  dialog: {
    noegleFil: () => kald("dialog:noeglefil"),
    lydFil: () => kald("dialog:lydfil"),
  },
  filer: { laes: (sti) => kald("fil:laes", sti) },
  modeller: { hent: () => kald("modeller"), valider: (v) => kald("modeller:valider", v) },
  overlay: {
    config: (d) => kald("overlay:config", d),
    tekst: (d) => kald("overlay:tekst", d),
    vis: (v) => kald("overlay:vis", v),
    redigering: (v) => kald("overlay:redigering", v),
    preset: (p) => kald("overlay:preset", p),
    stoerrelse: (d) => kald("overlay:stoerrelse", d),
  },
  stt: (d) => kald("stt:transcribe", d),
  mt: (d) => kald("mt:translate", d),
  transskript: { tilfoej: (d) => kald("transcript:append", d), mappe: () => kald("transcript:mappe") },
  testForbindelse: () => kald("test:forbindelse"),
  paaOverlayTekst: (fn) => ipcRenderer.on("overlay:tekst", (_e, d) => fn(d)),
  paaOverlayConfig: (fn) => ipcRenderer.on("overlay:config", (_e, d) => fn(d)),
});
