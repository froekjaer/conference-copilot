# Funktioner, begrænsninger og testresultater

**Version:** 0.1.0 · **Opdateret:** 16-10-2026
Simulerede tests og virkelige tests er markeret hver for sig.

## Fungerende funktioner

| Funktion | Status |
|---|---|
| Portabel app: pak ZIP ud og kør `ConferenceCoPilot.exe` — ingen installation, ingen admin | ✅ virkelig test (se nedenfor) |
| Vælge lydindgang fra Windows (USB-lydkort/AV-mixer) | ✅ implementeret; enhedslisten er afprøvet med maskinens mikrofonfelt |
| Live transskription i blokke via OpenAI-kompatibelt API | ✅ implementeret (Whisper-kompatibelt kald, `multipart/form-data`) |
| Oversættelse dansk ⇄ engelsk (flere sprog i UI) | ✅ implementeret (chat-completions, temperatur 0) |
| Gennemsigtigt undertekst-overlay oven på PowerPoint | ✅ implementeret (altid øverst på `screen-saver`-niveau, klik-gennem) |
| Overlay på valgt skærm + tekststørrelse og baggrund | ✅ implementeret (skærmvælger + skydere, live opdatering) |
| Indtaste/udskifte/slette API-nøgle i brugerfladen | ✅ implementeret, krypteret med Windows DPAPI (`safeStorage`) |
| Gemme transskription med tidsstempler (tekst + JSONL) | ✅ implementeret og afprøvet |
| Netværksfejl og afbrudt lyd uden nedbrud | ✅ implementeret (3 genforsøg med backoff; automatisk genstart af lyd efter 2 s) |
| Demo-tilstand uden API-nøgle | ✅ implementeret og afprøvet |

## Testresultater (kørt 16-10-2026)

| Test | Type | Resultat |
|---|---|---|
| Unit-test af kerne (`npm test`) | Simuleret, ingen netværk | ✅ **25/25** — STT-form, svar-trimning, HTTP-fejl, netværksfejl, for-lidt-lyd, auth-header, oversættelse, prompt, genforsøg, transskript-format, fejltekster, demo, indstillinger, krypteret nøgle (inkl. at nøglen ikke står i klartekst) |
| Intern selftest (`npm run selftest`) | **Virkelig** på denne maskine | ✅ **9/9** — vinduer oprettet, skærm fundet, lydenheder opregnet, **mikrofonoptagelse 1,5 s med niveaudetektion**, overlay-rendering (PNG 65 KB), transskriptskrivning, demo-STT, demo-MT, DPAPI tilgængelig |
| Start fra udpakket ZIP | **Virkelig** | ✅ **9/9** — ZIP pakket ud i ren mappe, `ConferenceCoPilot.exe` startet derfra, `data/` oprettet ved siden af exe'en |
| Transskription mod rigtigt API | Virkelig | ⏳ **ikke afprøvet** — der var ingen API-nøgle til rådighed under bygningen |
| Oversættelse mod rigtigt API | Virkelig | ⏳ **ikke afprøvet** — samme grund |
| Overlay på sekundær skærm | Virkelig | ⏳ **ikke afprøvet** — testmaskinen har kun én skærm |
| Nøgleskift i brugerfladen | Virkelig | ⏳ **ikke afprøvet** med en rigtig nøgle (kodevejen er unit-testet) |

**Sådan genskabes testene:** `npm test` (kerne) og `npm run selftest` (app + lyd + overlay), samt `npm run package` (bygger ZIP).

## Kendte begrænsninger

- Transskription og oversættelse kræver netværk og en API-nøgle; der er ingen lokal model i denne version.
- Blokke på 5–8 sekunder giver nogle sekunders forsinkelse — ikke ord-for-ord-realtid.
- Ingen optagelse af lyden til fil, ingen taler-adskillelse, ingen fagterm-ordlister.
- Overlayet kan tildeles en skærm, men ikke frit placeres med musen (positionen er fast nederst).
- Pakken indeholder hele Electron-runtimen: **151 MB ZIP**, ca. 400 MB udpakket.
- Mikrofonoptagelsen i selftesten målte et lavt niveau (1 %) — rummet var stille; det er en måling, ikke en fejl.

## Arkitektur i korte træk

```
Lydkort/AV-mixer → getUserMedia (renderer) → MediaRecorder i blokke
   → hovedproces: STT (multipart) → oversættelse (chat-completions)
   → overlay-vindue (transparent, altid øverst) + transskriptfil (txt + jsonl)
```
API-nøglen ligger krypteret i `data/hemmelighed.bin` (DPAPI, bundet til Windows-brugeren) eller i miljøvariablen `CO_PILOT_API_KEY`. Ingen telemetri, ingen automatisk upload.
