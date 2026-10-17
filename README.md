# Conference Co-Pilot — vejledning til AV-teknikeren

Portabel Windows-app til **live transskription og undertekster** oven på PowerPoint.
Ingen installation, ingen administratorrettigheder: pak ZIP-filen ud og kør `ConferenceCoPilot.exe`.

---

## 1. Kom i gang

1. Pak ZIP-filen ud et sted, hvor du må skrive (fx `C:\AV\ConferenceCoPilot`). **Kør den ikke fra ZIP-filen selv.**
2. Dobbeltklik **`ConferenceCoPilot.exe`**. Kontrolpanelet åbner, og overlayet vises nederst på skærmen.
3. Vælg **lydindgang** i feltet *1 · Lyd* (dit USB-lydkort eller AV-mixeren). Tryk ↻, hvis listen er tom.
4. Vælg **nøglekilde** i feltet *2 · API-nøgle og model*:
   - **Vælg nøglefil…** og peg på den fil, du allerede har (fx `C:\Users\dig\.cc-key.txt`), eller
   - indsæt nøglen og tryk **Gem** (gemmes krypteret med Windows DPAPI).
   Den aktive kilde står i linjen ovenover — aldrig nøglen selv.
5. Tryk **Test forbindelse**.
6. Vælg **kildesprog** (Dansk) og **målsprog** (English).
7. Tryk **▶ Start** — eller **▶ Afspil og transskribér**, hvis du bruger en lydfil.

## 2. Lyd: mikrofon eller fil

- **Mikrofon / lydkort** — live fra salen. Blokke på 6 s (kan ændres 3–20 s).
- **Lydfil** — vælg WAV, MP3, M4A, FLAC, OGG eller WebM med **Vælg fil…**. Afspil, pause, stop, spol i tidslinjen og skift hastighed (0,75× / 1× / 1,25×). Filen sendes gennem **samme** transskriptions- og oversættelsespipeline som live-lyd — blok for blok, ikke hele filen på én gang. Tidsstemplerne følger filens position.
- **Lydudgang** — vælg hvor filens lyd skal høres, eller **Ingen lydafspilning** (så behandles filen uden at sende lyd til højttalerne). Er enheden forsvundet, logger appen det og fortsætter uden lyd.

## 3. Overlay

- **Skærm** — vælg projektoren (fx Skærm 2).
- **Placering** — **Øverst / Midt / Nederst** eller træk selv: sæt flueben i **Flyt overlayet**, træk vinduet med musen, og fjern fluebenet igen (så klikker musen igennem til PowerPoint).
- **Bredde/Højde** — skydere i procent af skærmen.
- Placeringen gemmes **pr. skærmopsætning**, så 1920×1080 og 1280×720 kan have hver sin.
- **Vis/Skjul overlay** og **Send prøvetekst** til at teste inden oplægget.

## 4. Udseende

- **Skrifttype**, **tekststørrelse** (12–96 px), **justering** (venstre/center/højre).
- **Tekstfarve** og **konturfarve** med Windows-farvevælger, **kontur 0–8 px** (0 = ingen kontur), eller **skygge** i stedet.
- **Baggrundsfarve** og **gennemsigtighed 0–100 %**.
- **Maks. linjer** (1–6): teksten ombrydes og klippes pænt uden at flytte overlayet.
- **Vis originalsprog ovenover** — slå fra for kun at vise oversættelsen; så bruger teksten hele området.
- Standard er **hvid tekst med tynd sort kontur**, som fungerer på både lyse og mørke slides.

## 5. Modeller og udbydere

- **Udbyder** (OpenAI, Groq, lokal OpenAI-kompatibel server) sætter base-URL.
- **Transskription** og **Oversættelse** vælges fra lister med model-ID og note; kun modeller, der hører til udbyderen, vises som understøttede.
- **Egen model** — skriv model-ID, vælg anvendelse (transskription/oversættelse/begge) og tryk **Tilføj model**. Så kan nye modeller bruges uden at opdatere appen.
- Appen advarer, hvis kombinationen af udbyder, base-URL og model ikke hænger sammen.

## 6. Transskription

- Hver blok skrives med tidsstempel til `data\transskriptioner\`:
  `ÅÅÅÅ-MM-DD.txt` (læsbar) og `ÅÅÅÅ-MM-DD.jsonl` (maskinlæsbar).
- **Åbn transskriptionsmappe** viser mappen i Stifinder.

## 7. Hvis noget driller

| Symptom | Handling |
|---|---|
| "ingen lydindgang fundet" | Tjek lydkortet, tryk ↻, giv Windows-appen mikrofonadgang. |
| `niveau: 0 %` | Vælg en anden lydindgang, eller skru op på mixeren. |
| `fejl: STT HTTP 401` | Nøglen er ugyldig/udløbet — vælg en anden nøglefil eller gem en ny. |
| `fejl: MT HTTP 429` | For mange kald — appen forsøger igen automatisk. |
| Intet overlay på projektoren | Vælg den rigtige skærm under *3 · Overlay*, og tryk **Vis overlay**. |
| Filen afspilles uden lyd | Vælg en lydudgang, eller tjek at enheden stadig er tilsluttet. |
| Teksten klippes | Skru op for **Maks. linjer** eller for overlayets højde. |

## 8. Sikkerhed og data

- **Nøglekilder i prioriteret rækkefølge:** miljøvariablen `CO_PILOT_API_KEY` → **nøglefil** → **DPAPI**. Kun kilden (og filstien) vises — aldrig nøglen. Appen gemmer kun *stien* til nøglefilen, ikke indholdet.
- Ingen telemetri. Ingen automatisk upload af lyd eller tekster. Lyden sendes kun til den API-udbyder, du selv har konfigureret, og kun i de korte blokke, der skal transskriberes.

## 9. Krav og begrænsninger

- Windows 10/11 (64-bit), ca. 400 MB fri plads.
- Netværk til den valgte API-udbyder og en API-nøgle (ingen lokal model endnu).
- 5–8 sekunders blokke giver nogle sekunders forsinkelse — ikke ord-for-ord-realtid.
- Ingen optagelse af lyden til fil og ingen eksport til SRT/VTT endnu (se `docs/ROADMAP.md`).
- Overlayet kan flyttes og skaleres, men ikke roteres eller have forskelligt layout pr. slide.
