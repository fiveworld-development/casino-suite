# 🃏 Blackjack

**Status:** ✅ Implementiert · `blackjack.html` · Engine `src/tables/blackjack/engine.js` · Kit `src/tables/kit/` (geteilt mit Poker)

## Regeln (Standard „Vegas Strip“, RTP ≈ 99,5 % bei Basic Strategy)

- 6 Decks, Shoe wird bei ~75 % Penetration neu gemischt (Mischanimation).
- Dealer steht auf Soft 17. Blackjack zahlt 3:2.
- Double auf beliebige 2 Karten, auch nach Split. Split bis 3 Hände, Asse nur 1× splitten (je 1 Karte).
- Insurance bei Dealer-Ass (zahlt 2:1). Kein Surrender (optional später).
- Einsatz über Chips: 1 · 5 · 25 · 100 · 500 · 1.000 (Spielgeld).

## Präsentation

- Top-Down-Tisch mit grünem Filz, bedruckt: „BLACKJACK PAYS 3 TO 2 · DEALER MUST STAND ON SOFT 17 · INSURANCE PAYS 2 TO 1“ (als Code-Text, gestochen scharf).
- Karten gleiten aus dem Shoe, Flip in 3D, Schatten + leichte Rotation.
- Chips stapeln sich physikalisch mit Klick-Sound, Gewinne werden vom Dealer zugeschoben.
- Handwert-Badge an jeder Hand, Bust/Blackjack-Banner.
- Buttons: Hit · Stand · Double · Split · Insurance · Rebet · Rebet & Deal.

## Karten

Kartenflächen werden **per Code gerendert** (Zahlen, Symbole, Ecken, perfekt scharf in jeder Auflösung). Nur die Bildkarten (J/Q/K) und die Rückseite kommen als Asset.

## Asset-Liste

Prompts → [Asset-Guide › Blackjack & Poker](06-asset-guide.md#blackjack--poker).

**Look: „Haze Kings Lounge“** – Luxus-Casino im Cannabis-Stil (Samtfilz mit Gold-Blatt-Prägung, Neon-Grün, Rauch-Overlay), gleiches Universum wie Haze Kings 420. Chip-Stufen: 1 · 5 · 25 · 100 · **420** · 1.000.

`table_blackjack`, `card_back`, `court_J`, `court_Q`, `court_K`, `chip_1`, `chip_5`, `chip_25`, `chip_100`, `chip_420`, `chip_1000`, `smoke_layer`, `shoe`, `discard_tray`, `bg_room`, `logo_blackjack`, `dealer`, `win_blackjack`

Import: `node scripts/import-tables.js` (importiert alle Tables/Blackjack/Poker-Assets als getrimmte WebPs aus den Quell-PNGs).

## Shared Kit (`src/tables/kit/`)

Siehe `src/tables/kit/README.md` für die volle API. Kurzfassung:
- `deck.js` – `Shoe` (6 Decks, 75 % Penetration), `shuffle`/`randomInt` (Fisher-Yates, `crypto.getRandomValues` unbiased).
- `cards.js` – `buildCardTextures()` rendert alle 52 Kartenflächen per Canvas (2×-Auflösung, Court-Karten mit Lounge-Art), `CardView` mit 3D-Flip.
- `chips.js` – `chipBreakdown()` (Greedy-Zerlegung 1/5/25/100/420/1000), `ChipStack`, `flyChip()` (Flug-Animation für Einsatz/Auszahlung).
- `embed.js` – Phone-App-Iframe-Unterstützung: `isEmbedMode()`, `setupEmbedViewport()`, `requestFullscreenIfStandalone()`, `?embed=1` blendet den Lobby-Zurück-Button aus.
- `table-ui.css` – Lounge-Look (Smaragd/Gold/Neongrün), responsive & touch-tauglich.

## Engine & Tests

Reine Regel-Engine ohne Pixi/DOM in `src/tables/blackjack/engine.js` (Handwert inkl. Soft-Hands, Dealer-S17, komplette Payout-Tabelle, Insurance, Split/Double-Eligibility, Split-Ass-Sonderregel, Split-Blackjack = Even Money statt 3:2).

```
npm run test:tables        # deck.js + chips.js + engine.js Assertions (node, keine Deps)
npm run sim:blackjack       # 1.000.000-Hand-Simulation mit Basic Strategy
```

**Gemessener House Edge (1.000.000 Hände, echte Engine, Basic Strategy):** **0,486 %** (erwartet 0,4–0,6 % für 6 Decks/S17/BJ 3:2/DAS/Split bis 4 Hände/kein Surrender) — passt.

## Bekannte Lücken

- Nur 1 Spielspot implementiert (bis zu 3 Spots waren laut Spec ein optionales Extra).
- Insurance-UI bietet „Versichern“ / „Nein danke“ / „Even Money“ (bei eigenem Blackjack); Even-Money zahlt sofort 1:1 statt auf 3:2-vs-Push zu pokern.
- Mischanimation (Fächer + Cut-Card) läuft bei ~75 % Penetration vor dem nächsten Deal; visuell nicht in jedem Testlauf bestätigt (nur Logik/State verifiziert), da parallele Agenten denselben Dev-Server/Browser genutzt und wiederholt HMR-Reloads/Tab-Wechsel ausgelöst haben.
- Chip-Flug-Animationen (Einsatz platzieren, Auszahlung/Verlust) sind verdrahtet und lösen fehlerfrei aus; die Wallet-Auszahlung selbst ist unabhängig von der Animation (Ledger-Audit bestätigt korrekte Beträge auch falls die Animation unterbrochen wird).
- Tablet/Zwischengrößen abseits der 7 getesteten Auflösungen (1920×1080, 1366×768, 1024×768, 768×1024, 390×844, 360×780, 844×390) nicht einzeln geprüft; die Skalierung ist aber stetig (`w / 1450`, geclamped) und sollte dazwischen funktionieren.
