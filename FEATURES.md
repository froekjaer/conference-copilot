# Funktioner, begrænsninger og teststatus

**Version:** 0.1.0 · **Status:** under opbygning (første fungerende version).
Dette dokument opdateres med de **faktisk gennemførte** tests — simulerede og virkelige tests holdes adskilt.

## Fungerende funktioner

| Funktion | Status |
|---|---|
| Portabel app: pak ZIP ud og kør `ConferenceCoPilot.exe` uden installation/admin | ⏳ bygges |
| Vælge lydindgang fra Windows (USB-lydkort/AV-mixer) | ✅ implementeret (enhedsliste + valg) |
| Live transskription i blokke via OpenAI-kompatibelt API | ✅ implementeret (Whisper-kompatibel) |
| Oversættelse dansk ⇄ engelsk (flere sprog mulige) | ✅ implementeret (chat-completions) |
| Gennemsigtigt undertekst-overlay oven på PowerPoint | ✅ implementeret (altid øverst, klik-gennem) |
| Flytte overlay til valgt skærm + justere tekststørrelse og baggrund | ✅ implementeret (skærmvælger + skydere) |
| Indtaste/udskifte/slette API-nøgle i brugerfladen | ✅ implementeret (krypteret med Windows DPAPI via Electron `safeStorage`) |
| Gemme transskription med tidsstempler (tekst + JSONL) | ✅ implementeret (`data/transskriptioner/`) |
| Netværksfejl og afbrudt lyd uden nedbrud | ✅ implementeret (genforsøg med backoff, automatisk genstart af lyd, fejl vises i log) |
| Demo-tilstand uden API-nøgle (til test af overlay/transskript) | ✅ implementeret |

## Kendte begrænsninger

- Transskription og oversættelse kræver netværk og en API-nøgle (ingen lokal model i denne version).
- Blokke på 5–8 sekunder giver nogle sekunders forsinkelse — ikke ord-for-ord-realtid.
- Ingen lydoptagelse til fil, ingen taler-adskillelse, ingen genkendelse af fagtermer.
- Overlayet kan tildeles en skærm, men ikke frit placeres med musen.
- Pakken indeholder hele Electron-runtimen (~200–300 MB udpakket).

## Teststatus

| Test | Type | Resultat |
|---|---|---|
| Unit-test af pipeline (STT-form, oversættelsesprompt, transskript-linjer, genforsøg) | Simuleret (ingen netværk) | ⏳ afventer kørsel |
| App-start fra udpakket ZIP | Virkelig | ⏳ afventer |
| Intern selftest: vinduer, skærme, lydenheder, mikrofon-capture, overlay-render (PNG), transskript-skrivning | Virkelig (på denne maskine) | ⏳ afventer |
| Transskription mod API | Virkelig | ⏳ afventer API-nøgle |
| Oversættelse mod API | Virkelig | ⏳ afventer API-nøgle |
| Overlay på sekundær skærm | Virkelig hvis ekstra skærm findes; ellers simuleret | ⏳ afventer |
| Nøgleskift i brugerfladen | Virkelig | ⏳ afventer |

Testresultater skrives ind her, når de er kørt — med eksplicit markering af, hvad der er henholdsvis simuleret og faktisk afprøvet.
