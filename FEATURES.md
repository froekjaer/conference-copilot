# Funktioner, begrænsninger og testresultater

**Version:** 0.2.0 · **Opdateret:** 17-10-2026
Simulerede og virkelige tests er markeret hver for sig.

## Nyt i 0.2.0

| Funktion | Status |
|---|---|
| Nøgle fra DPAPI, miljøvariabel **eller nøglefil valgt med filvælger** | ✅ kun stien gemmes; aktiv kilde vises uden at afsløre nøglen |
| Overlay **flytbart** i redigeringstilstand (træk med musen), klik-gennem i normal visning | ✅ implementeret |
| Overlay-presets **øverst / midt / nederst** + bredde/højde i procent | ✅ implementeret |
| Placering gemt **pr. skærmopsætning**, altid klemt inde på skærmen | ✅ implementeret og unit-testet |
| **Typografi**: skrifttype, størrelse, tekstfarve, konturfarve og -tykkelse (0–8 px), skygge | ✅ implementeret |
| **Baggrundsfarve** og gennemsigtighed, justering, maks. antal linjer | ✅ implementeret |
| Standard: **hvid tekst med tynd sort kontur** | ✅ |
| Vis originalsprog til/fra — uden original bruger oversættelsen hele området | ✅ |
| **Lydfil som input** med afspil, pause, stop, spol, tid/duration og 0,75×/1×/1,25× | ✅ implementeret |
| Lydfil sendes **blok for blok** gennem samme pipeline som live-lyd (ikke hele filen) | ✅ |
| **Lydudgang** kan vælges, inkl. "Ingen lydafspilning" | ✅ |
| **Filvælgere** til nøglefil og lydfil; enheder, sprog, modeller, udbyder og skærme som lister | ✅ |
| **Egen model** kan tilføjes (ID + anvendelse) uden programændring | ✅ |
| Validering af udbyder + base-URL + model | ✅ advarer ved uoverensstemmelse |

## Testresultater (kørt 17-10-2026)

| Test | Type | Resultat |
|---|---|---|
| Unit-tests (`npm test`) | Simuleret | ✅ **58/58** — inkl. 20 nye for layout/presets/klamp, typografi-sanitering, modelvalidering, WAV-kodning og indstillinger v2-migrering |
| Intern selftest, udviklingsmiljø | **Virkelig** | ✅ **16/16** — vinduer, **2 skærme**, presets, klamping, indstillinger v2, lydindgange, mikrofonoptagelse, **lydudgange**, overlay-render, **kontrolpanel-render**, **overlay på skærm 2**, transskript, DPAPI, modelvalidering |
| Lydfil-test gennem den rigtige UI | **Virkelig** | ✅ **4/4** — 4 s WAV afkodet, 1 blok behandlet, overlay-tekst vist, PNG gemt |
| Rigtig API-kæde (LibriVox dansk 3:12) | **Virkelig** | ✅ **4/4** — STT 11,8 s, MT 4,9 s, 1.296 tokens, overlay renderet |
| Overlay på sekundær skærm | **Virkelig** | ✅ skærm 2 fundet og brugt; overlay placeret inden for dens arbejdsområde og renderet (PNG 29 KB) |
| Træk-og-slip med mus i redigeringstilstand | **Ikke afprøvet** | kræver fysisk musebetjening — geometri- og gemmevejen er testet via IPC |
| Fysisk AV-mixer/USB-lydkort | **Ikke afprøvet** | testmaskinen bruger indbygget mikrofonarray |
| Afspilning til en bestemt fysisk lydudgang | **Ikke afprøvet** | enhederne listes korrekt (4 udgange), men der er ikke afspillet til ekstern enhed |

**Bevisfiler:** `docs/bevis-overlay-v02.png` (overlay med kontur), `docs/bevis-rigtig-uddrag.png` (rigtig API-tekst), `docs/bevis-rigtig-test.json` (testlog uden hemmeligheder).

## Kendte begrænsninger

- Kræver netværk og API-nøgle; ingen lokal model.
- 5–8 sekunders blokke giver nogle sekunders forsinkelse.
- Overlayet kan flyttes/skaleres, men ikke have forskelligt layout pr. slide.
- Lydfil-tilstand afspiller filen i realtid, mens den behandles; meget lange filer tager lige så lang tid som afspilningen.
- Ingen optagelse til fil eller eksport til SRT/VTT endnu — se `docs/ROADMAP.md`.
- Azure OpenAI, DeepL og Gemini understøttes ikke (kræver andet auth/endpoint).
