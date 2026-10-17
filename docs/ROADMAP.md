# Roadmap — små, afprøvelige releases

Prioriteret efter, hvad der gør mest forskel for en AV-tekniker i salen. Hver release skal kunne afprøves med den portable ZIP.

## v0.2.1 — Lavere forsinkelse
- Blokke på 4 s som standard + kortere overlay-opdatering.
- Spring stille blokke over (simpel VAD/energitærskel), så der ikke betales for pauser.
- Vis "behandles…"-indikator, så teknikeren kan se, at appen arbejder.
- Mål: median forsinkelse under 3 s fra ytring til undertekst.

## v0.2.2 — Optagelse og eksport
- Optag lyden til WAV ved siden af transskriptionen (valgfrit, lokalt).
- Eksportér transskriptionen som **TXT, JSONL, SRT og VTT** med tidsstempler.
- Knap "Åbn mappe" pr. session; filnavn med dato og mødetitel.

## v0.2.3 — Terminologi
- Ordliste pr. konference (navne, fagtermer, akronymer) som føjes til oversættelsesprompten.
- Efterbehandling: erstat kendte fejltransskriptioner ("Grimseventyr" → "Grimms eventyr").
- Import/eksport af ordlister som tekstfil.

## v0.3.0 — Undertekster til en anden pc
- Lille websocket-server i appen; en browser på en ekstra pc viser underteksterne.
- Adgangskode på forbindelsen, kun lokalnetværk, ingen cloud.
- Test med to maskiner på samme switch.

## v0.3.1 — Driftssikkerhed over lange dage
- Kø med backoff og maks. samtidige kald; håndtering af 429/5xx uden tabte blokke.
- Genopkobling efter netværksudfald uden at miste transskriptet.
- Soak-test på 4–6 timer med simuleret lyd og netværksfejl.

## v0.4.0 — Genbrug af tidligere konferencer
- Optagelser fra tidligere arrangementer bruges som **regressionstest** og til at måle terminologikvalitet.
- Kun med eksplicit samtykke; ingen modeltræning, ingen upload ud over det valgte API.

## Principper
- Små releases, hver med automatiske tests + en praktisk prøve i salen.
- Ingen nye afhængigheder uden at de kan pakkes i den portable ZIP.
- Ingen telemetri; alle data bliver på maskinen.
