# Conference Co-Pilot — startvejledning til AV-teknikeren

Portabel Windows-app til **live transskription og undertekster** oven på PowerPoint.
Ingen installation, ingen administratorrettigheder: pak ZIP-filen ud og kør `ConferenceCoPilot.exe`.

---

## 1. Kom i gang (2 minutter)

1. Pak ZIP-filen ud et sted hvor du må skrive (fx `C:\AV\ConferenceCoPilot`). **Kør den ikke fra ZIP-filen selv.**
2. Dobbeltklik **`ConferenceCoPilot.exe`**. Kontrolpanelet åbner, og et gennemsigtigt overlay vises nederst på skærmen.
3. Vælg **lydindgang** i feltet *1 · Lydindgang* — fx dit USB-lydkort eller AV-mixeren. Tryk ↻ hvis listen er tom.
4. Indsæt **API-nøglen** i feltet *2 · API-nøgle og model* og tryk **Gem**. Nøglen gemmes krypteret med Windows DPAPI (kun din Windows-bruger kan læse den).
   **Nemmere:** skriv stien til en nøglefil du allerede har — fx `C:\Users\dig\.cc-key.txt` — i feltet nedenunder og tryk **Brug fil**. Appen læser nøglen derfra ved hvert kald og viser kun stien, aldrig nøglen. **Ryd** fjerner valget igen.
   *Vil du prøve uden nøgle?* Sæt flueben i **Demo-tilstand** — så kører hele kæden med eksempeltekst (ingen API-kald).
5. Tryk **Test forbindelse** for at bekræfte nøglen.
6. Vælg **kildesprog** (fx Dansk) og **målsprog** (fx English).
7. Tryk **▶ Start**. Underteksterne begynder at komme efter 5–8 sekunder.

## 2. Overlay oven på PowerPoint

- Vælg **skærm** i feltet *3 · Undertekst-overlay* (fx projektoren som *Skærm 2*).
- Justér **tekststørrelse** og **baggrund** med skyderne — ændringen ses med det samme.
- **Klik gennem overlayet** er slået til som standard, så museklik går til PowerPoint. Slå det fra, hvis du vil flytte/pege på overlayet.
- **Vis/Skjul overlay** og **Send prøvetekst** bruges til at teste inden oplægget starter.
- Start PowerPoint i **præsentationsvisning** — overlayet ligger altid øverst.

## 3. Transskription

- Hver blok skrives med tidsstempel til mappen `data\transskriptioner\`.
  - `ÅÅÅÅ-MM-DD.txt` — læsbar tekst (`[19:42:07] DA: …` / `[19:42:07] EN: …`)
  - `ÅÅÅÅ-MM-DD.jsonl` — samme data maskinlæsbart
- Knappen **Åbn transskriptionsmappe** viser mappen i Stifinder.

## 4. Hvis noget driller

| Symptom | Handling |
|---|---|
| "ingen lydindgang fundet" | Tjek at lydkortet er tilsluttet, tryk ↻, og giv Windows-appen mikrofonadgang (Indstillinger → Privatliv → Mikrofon). |
| `niveau: 0 %` | Vælg en anden lydindgang, eller skru op på mixeren. |
| "lyd afbrudt — genstarter…" | Appen genstarter optagelsen selv. Sker det gentagne gange, så tjek USB-forbindelsen. |
| `fejl: STT HTTP 401` | API-nøglen er ugyldig eller udløbet — indsæt en ny og tryk Gem. |
| `fejl: MT HTTP 429` | For mange kald på kort tid — appen forsøger igen automatisk. |
| Intet overlay på projektoren | Vælg den rigtige skærm i feltet *3*, og tryk **Vis overlay**. |

Appen stopper aldrig ved netværksfejl: den logger fejlen i vinduet og fortsætter.

## 5. Sikkerhed og data

- **Nøglekilder i prioriteret rækkefølge:** miljøvariablen `CO_PILOT_API_KEY` → **nøglefil** (den sti du peger på) → **DPAPI** (den nøgle du har gemt i UI'en). Den aktive kilde står i feltet under knapperne — kun kilden og filstien, aldrig nøglen.
- **API-nøglen** gemmes udelukkende krypteret i `data\hemmelighed.bin` (Windows DPAPI, bundet til din bruger). Den skrives aldrig i logs eller transskriptioner.
- Du kan i stedet sætte nøglen som miljøvariablen `CO_PILOT_API_KEY` før start — så gemmes den slet ikke på disk.
- Ingen telemetri. Ingen automatisk upload af lyd eller tekster. Lyden sendes kun til den API-udbyder, du selv har konfigureret, og kun i de korte blokke der skal transskriberes.
- **Slet nøglen** med knappen *Slet* (fjerner den krypterede fil).

## 6. Krav

- Windows 10/11 (64-bit), ca. 400 MB fri plads til udpakning.
- Netværksadgang til den valgte API-udbyder (fx `api.openai.com`).
- En API-nøgle til tale-til-tekst og oversættelse, fx OpenAI-kompatibel. Andre udbydere kan bruges ved at ændre **Base-URL** og modelnavne.

## 7. Kendte begrænsninger (version 0.1)

- Kræver netværk: transskription og oversættelse foregår i skyen (ingen lokal model endnu).
- Blokke på 5–8 sekunder giver en forsinkelse på nogle sekunder — ikke ord-for-ord-realtid.
- Ingen optagelse af lyden til fil, ingen taler-adskillelse, ingen ordforslag.
- Overlayet kan flyttes til en skærm, men ikke frit placeres med musen endnu.
