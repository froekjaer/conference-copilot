# Funktioner, begrænsninger og testresultater

**Version:** 0.3.0 · **Opdateret:** 17-10-2026
Simulerede og virkelige tests er markeret hver for sig.

## Rettelser i 0.3.0 — talegenkendelse og undertekster

### Målt årsag til de forkerte sprog

Transskriptionen sendte hele tiden `language=da` (verificeret i den faktiske request). Fejlen var, at **whisper-1 finder på tekst, når der ikke er tale** — og at 0.2.3'ens fallback sendte stille blokke videre til netop whisper-1.

| Lyd | Model | Sprog | Svar |
|---|---|---|---|
| Stilhed | whisper-1 | da | "…abonnere på kanalen for at se flere videoer" |
| Støj | whisper-1 | da | "Danske tekster af Amara.org familie" |
| Støj | whisper-1 | ingen | **"ご視聴ありがとうございました"** |
| Stilhed/støj | gpt-4o-mini-transcribe | da / ingen | tomt ✅ |

### Rettelser

| Rettelse | Effekt |
|---|---|
| **Taledetektor** med adaptivt støjgulv | stilhed og lydkortstøj når slet ikke API'et (målt: RMS 0,0016 → 0 kald) |
| **Fallback strammet** | whisper-1 bruges kun ved faktisk tale, og svaret skal bestå sprog- og hallucinationskontrol |
| **Sprogkontrol** | ikke-latinsk skrift i latinsk kildesprog kasseres som "usikker"; engelske fagudtryk og navne er stadig tilladt |
| **Hallucinationsfilter** | kasserer de målte fraser (abonnere på kanalen, Amara.org, japanske afslutningsfraser) |
| **Stabile undertekster** | ingen `...` på skærmen; forrige tekst bliver stående til et nyt gyldigt resultat; min. 0,9 s visningstid; fejl rydder intet |
| **Skrifttype** | normaliseringen accepterede kun 7 faste fonte og erstattede alle andre med Segoe UI — nu gemmes og anvendes alle Windows-skrifttyper |
| **Måling** | UI viser samlet forsinkelse, STT-tid og gennemsnit |

## Rettelser i 0.2.3

| Fejl | Årsag | Rettelse |
|---|---|---|
| **Kunne ikke vælge sprog ind/ud** | Sprogvælgerne faldt ud, da brugerfladen blev bygget om i 0.2.0 — appen brugte stadig de gemte værdier (dansk → engelsk), så det så ud som om sprogvalget virkede | **Kildesprog** og **Målsprog** er tilbage som lister (da/en/de/fr/es/it) plus **⇄ Byt**; valget gemmes og nulstiller konteksten |
| **Dårlig oversættelse** | Blokke på 4 s bliver afklippet midt i sætninger, og oversætteren så kun fragmentet uden at kende sammenhængen | Oversætteren får nu **deforegående tekst som kontekst** (op til 240 tegn) og en instruks om ikke at digte videre på et afklippet fragment |
| **Manglende undertekster** | `gpt-4o-mini-transcribe` returnerede tomt på en blok med tydelig tale (målt ved 80 s i testfilen), så en hel sætning forsvandt | Hvis svaret er tomt **og** der er tale i blokken (niveau > 2 %), prøves én gang med `whisper-1` — den returnerede sætningen korrekt |
| Tom række i lydfil-tilstand | Lydindgangsrækken blev kun skjult halvt | Rækken skjules helt |
| **Baggrundsafspilning blev bremset** | Chromium satte afspilning og timere på pause, når vinduet ikke var i forgrunden — det rammer rigtig brug, når PowerPoint ligger foran | `backgroundThrottling: false` på begge vinduer, så behandlingen kører videre, mens præsentationen er i fokus |

### Målt kvalitet (4 s blokke, rigtig dansk tale)

| STT | MT | 68 s | 80 s |
|---|---|---|---|
| whisper-1 | gpt-4o-mini | ✅ "there weren't many fish in them" | ✅ "You should say, many more" |
| gpt-4o-mini-transcribe | gpt-4o-mini | ✅ | ❌ **tomt svar** |
| gpt-4o-mini-transcribe + fallback | gpt-4o-mini | ✅ | ✅ "You need to say many more" (2,5 s) |

## Rettelser og forbedringer i 0.2.2

| Ændring | Detalje |
|---|---|
| **Kortere forsinkelse** | Standardblok 6 → **4 s**, kilde-teksten vises nu med det samme efter transskriptionen (før ventede den på oversættelsen), stille blokke springes over, og forsinkelsen måles og vises i UI'et |
| **Hurtigere standardmodel** | `gpt-4o-mini-transcribe` i stedet for `whisper-1`: målt ~30 % hurtigere og halv pris ($0,003/min mod $0,006/min) — og den skriver ikke "abonnér på kanalen", når der er stille |
| **Hallucinationsfilter** | Kendte Whisper-fraser (subscribe, amara.org, thanks for watching …) kasseres, hvis lyden er svag — de skal ikke ud i salen |
| **Alle Windows-skrifttyper** | Skrifttypen vælges fra **481 installerede skrifttyper** hentet fra Windows-registret (maskin- og brugerniveau) i stedet for 7 faste |
| **Stop virker** | Stop-knappen stoppede ikke afspilningen, fordi den kun blev aktiveret ved live-optagelse. Nu skifter Start/Stop korrekt, afspilningen stopper og stilles på 0, og svar undervejs forkastes |

### Målinger (rigtig tale, samme netværk)

| Blok | Behandlingstid (STT+MT) | Tekstkvalitet |
|---|---|---|
| 3 s | 1,7–2,3 s | ❗ kan skære "ikke" væk → betydningen vendes |
| **4 s** | **2,5 s** | ✅ korrekt |
| 5 s | 2,6 s | ✅ korrekt |
| 6 s | 1,9–3,3 s | ✅ korrekt, men ~1 s mere ventetid |

Samlet ventetid ≈ blok/2 + 2,3 s: **~5,3 s før** (6 s blok) mod **~4,3 s nu** (4 s blok) — og den danske originaltekst kommer ~1,5 s tidligere end før.

## Rettelser i 0.2.1

**Underteksten blev hængende på skærmen, når kontrolpanelet blev lukket.** Overlay-vinduet holdt processen i live, så appen aldrig afsluttede, og Windows blev efterladt med det sidste billede som et "spøgelse" — tydeligst på en sekundær skærm.

Rettet med en ordentlig lukkevej: når kontrolpanelet lukkes (eller appen afsluttes på anden måde), skjules overlayet, sættes til gennemsigtigt, og først derefter destrueres vinduet — med et lille tidsrum, så Windows kan fjerne billedet. Processen afslutter nu selv.

| Test | Resultat |
|---|---|
| `--quit-test` i udviklingsmiljø | ✅ proces afslutter med kode 0, overlay destrueret, 0 efterladte processer |
| `--quit-test` i pakket 0.2.1-ZIP | ✅ samme resultat |
| Intern selftest efter ændringen | ✅ 16/16 |

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
| Unit-tests (`npm test`) | Simuleret | ✅ **84/84** — inkl. sprogkontrol (kinesisk i dansk), taledetektor, fallback-beslutning og hallucinationer |
| Stilhed og støj | **Virkelig** | ✅ **3/3 + 3/3** — 0 blokke, ingen API-kald, ingen tekst i overlay |
| Skrifttyper (Georgia/Consolas/Segoe UI) | **Virkelig** | ✅ **2/2** — tre forskellige renders, valget gemmes uændret |
| Intern selftest, udviklingsmiljø | **Virkelig** | ✅ **17/17** — inkl. 481 skrifttyper, 2 skærme, lydudgange, kontrolpanel- og overlay-render |
| Stop-knap | **Virkelig** | ✅ **3/3** — afspilning starter, Stop stopper og nulstiller, knapperne skifter |
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
