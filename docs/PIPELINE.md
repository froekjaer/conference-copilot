# Lydpipelinen — konkret gennemgang (v0.1.0)

Dette er en gennemgang af den faktiske kode, ikke af planer. Alle stier er relative til repoet.

## 1. Transskription

| Punkt | Fakta |
|---|---|
| Endpoint | `POST {baseUrl}/audio/transcriptions` — `src/pipeline.js`, funktion `transkriber()` |
| Standard base-URL | `https://api.openai.com/v1` (`src/storage.js`) |
| Model | `whisper-1` (`STANDARD_STT_MODEL`) |
| Protokol | `multipart/form-data` med felterne `file` (lyd), `model`, `language` (`da`), `response_format=json` |
| Auth | `Authorization: Bearer <nøgle>` — nøglen hentes fra DPAPI-filen eller `CO_PILOT_API_KEY` |
| Tidsgrænse | 60 s pr. kald (`AbortController`) |
| Lydformat i appen | `MediaRecorder` → `audio/webm` (Opus), blokke på 6 s (kan ændres i UI 3–15 s) |
| Lydformat i test | WAV/MP3/MP4/OGG/FLAC understøttes nu også (`endelseForMime()`) |

## 2. Oversættelse

| Punkt | Fakta |
|---|---|
| Endpoint | `POST {baseUrl}/chat/completions` — `oversaet()` |
| Model | `gpt-4o-mini` (`STANDARD_MT_MODEL`) |
| Prompt | Systembesked: "simultaneous interpreter … Danish to English … translation ONLY … preserve names, numbers and technical terms"; brugerbesked = transskriptionen |
| Parametre | `temperature: 0`, to beskeder pr. kald |
| Retning | Dansk → engelsk som standard; begge veje og flere sprog kan vælges i UI (da, en, de, fr, es, it) |
| Tidsgrænse | 20 s pr. kald |

## 3. Forventede omkostninger pr. konferencetime

Priser fra OpenAIs officielle prisliste (hentet 17-10-2026): Whisper **$0,006/min**, `gpt-4o-mini` **$0,15 input / $0,60 output pr. 1 mio. tokens**, `gpt-4o-mini-transcribe` **$0,003/min**.

| Post | Regnestykke | Pris/time |
|---|---|---|
| Transskription (whisper-1) | 60 min × $0,006 | **$0,36** |
| Oversættelse (gpt-4o-mini) | 600 blokke × ca. 85 input-tokens = 51k ($0,008) + 600 × ca. 30 output-tokens = 18k ($0,011) | **$0,02** |
| **I alt** | | **≈ $0,38/time ≈ 2,6 kr.** |

- Billigere alternativ: `gpt-4o-mini-transcribe` i stedet for `whisper-1` → **≈ $0,20/time ≈ 1,4 kr.**
- En 3-timers konference: ca. **$1,14** (whisper) eller **$0,60** (mini-transcribe).
- Transskriptionen er 95 % af regningen; oversættelsen er støj i regnestykket.
- 600 kald/time = 10 kald/minut — inden for normale rate limits (fx 50 RPM).

## 4. Understøtter appen reelt både OpenAI og andre udbydere?

**Nej — den understøtter ét OpenAI-kompatibelt endpoint ad gangen.** Der er ingen udbyderlag, ingen udbyderliste og ingen fallback. Det man kan ændre i UI er base-URL og modelnavne.

| Udbyder | Virker? | Hvorfor |
|---|---|---|
| OpenAI | ✅ | Referencen |
| Groq, Together, DeepInfra, Fireworks | ✅ hvis de udbyder både `/audio/transcriptions` og `/chat/completions` med Bearer | Samme protokol |
| Lokal whisper.cpp-server + lokal LLM-server | ✅ | Samme protokol |
| **Azure OpenAI** | ❌ | Kræver `api-key`-header, `api-version`-parameter og deployment-navne i stien |
| **DeepL** | ❌ | Helt andet API (og ingen transskription) |
| **Google Gemini / Cloud Speech** | ❌ | Andet API og anden auth |
| **Anthropic** | ❌ | Ingen lydendpoint |

Skal flere udbydere reelt understøttes, kræver det et lille udbyderlag (header-navn, sti-skabelon, parameterkrav pr. udbyder) — det er ikke bygget.

## 5. Automatisk integrationstest

Harness: `test/integration-app.js` (kører som selvstændig Electron-app og rører ikke hovedappen):

```
Kør:  electron test/integration-app.js --audio=<fil> --out=test/output/x --base=<url> [--demo]
```

Den tager en lydfil → `transkriber()` → `oversaet()` → viser begge tekster i overlay-vinduet → gemmer PNG + JSON-rapport.

### Bevis 1 — mekanisk (demo, uden netværk)
`--demo`: 4 s WAV (toner, ikke tale) → pladsholdertekst → engelsk → overlay-PNG. **4/4 trin OK.** Beviser kun kæden, ikke API'et.

### Bevis 2 — rigtigt HTTP mod lokal mock af OpenAI-API'et
`test/mock-server.mjs` (port 8787) modtog præcis dette:

```
POST /v1/audio/transcriptions
  multipart/form-data; boundary=…        ✓
  Authorization: Bearer <skjult>         ✓
  model=whisper-1  language=da  response_format=json  filnavn=lyd.wav  (128.498 bytes)  ✓

POST /v1/chat/completions
  model=gpt-4o-mini  temperature=0  antalBeskeder=2  ✓
  systemPrompt="You are a simultaneous interpreter for a live conference…"
  brugerTekst="Velkommen til konferencen…"
```

Kæden gav overlay-PNG (104 KB). **4/4 trin OK.** Det beviser, at appen bygger korrekte HTTP-kald og læser svarene korrekt — men ikke at OpenAI svarer, og ikke kvaliteten på dansk tale.

### Bevis 3 — rigtigt API-kald
**Ikke gennemført.** Der var ingen API-nøgle til rådighed på maskinen (hverken i miljøet eller i appens lager). Uden en nøgle kan hverken transskription eller oversættelse afprøves mod den rigtige tjeneste, og derfor er der **ikke** publiceret nye releases.

Sådan køres det, når nøglen findes (nøglen sættes i miljøet og optræder aldrig i log eller repo):

```powershell
$env:CO_PILOT_API_KEY = '<nøgle>'
electron test/integration-app.js --audio=test/assets/dansk-tale.wav --out=test/output/rigtig
```

## Rettelser foretaget i denne gennemgang

1. **Filendelser i STT-kaldet** (`endelseForMime`): før blev alt ikke-WAV/MP4 sendt som `.webm` — en MP3/OGG-fil ville blive afvist. Nu mappes mp3, mp4/m4a, wav, flac, ogg og webm korrekt, så en ekstern optagelse kan bruges.
2. **Tidsgrænse for STT** hævet fra 30 s til 60 s, så et 6-sekunders klip ikke rammer loftet på en langsom forbindelse.

Ingen andre fejl forhindrede kæden; resten af pipelinen kørte uændret igennem begge tests.
