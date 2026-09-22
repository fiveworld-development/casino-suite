# Casino Arcade – Projekt-Dokumentation

Premium-Casino-Spiele im Stil von echten Providern (Pragmatic, Play'n GO, Nolimit City) und Stake – **ausschließlich mit Spielgeld**. Kein Echtgeld, keine Einzahlung, keine Auszahlung.

## Übersicht

| # | Spiel | Typ | Mechanik | Status |
|---|---|---|---|---|
| 1 | [Kraken's Hoard](01-krakens-hoard.md) | Slot | Tumble + wachsende Walzen (4 → 8 Reihen), Kraken-Wilds, Sturm-Freispiele | ✅ spielbar |
| 2 | [Pharaoh's Eclipse](02-pharaohs-eclipse.md) | Slot | Book-Style, Expanding Symbol, Eclipse-Meter | 📝 Design fertig, Assets fehlen |
| 3 | [Dragon Emperor](03-dragon-emperor.md) | Slot | Hold & Win, 4 Jackpots, Drachenzorn | 📝 Design fertig, Assets fehlen |
| ⭐ | [Haze Kings 420](07-haze-kings.md) | Slot (Flaggschiff) | 7×7 Cluster, Hotbox-Multiplikatoren bis x1024, Grinder-Wild, Blaze, Bonus-Kauf | 📝 Design fertig, Assets fehlen |
| 4 | [Blackjack](04-blackjack.md) | Tisch | 6-Deck, Split/Double/Insurance | 📝 Design fertig, Assets fehlen |
| 5 | [Texas Hold'em](05-poker.md) | Tisch | vs. 5 KI-Gegner + Video Poker | 📝 Design fertig, Assets fehlen |

➡ **[Asset-Guide](06-asset-guide.md)** – alle ChatGPT-Prompts, Dateinamen, Sounds, Import-Ablauf.

## Starten

```bash
cd D:\Projects\casino-arcade
npm install
npm run dev          # → http://localhost:5190
```

- Lobby: `http://localhost:5190/`
- Kraken's Hoard: `http://localhost:5190/krakens-hoard.html`
- Debug-Modus: `?debug` anhängen → `window.KH` in der Konsole (z. B. `KH.freeSpins(10)`, `KH.maybeBigWin(60, 60)`)

## Projektstruktur

```
casino-arcade/
├─ index.html                  Lobby (Stake-Style)
├─ krakens-hoard.html          Slot 1
├─ public/assets/<spiel>/      Web-optimierte Assets (WebP) + sfx/*.mp3
├─ scripts/
│  ├─ import-krakens-hoard.js  ChatGPT-PNGs → getrimmte WebPs
│  ├─ contact-sheet.js         Übersichtsbild aller Roh-Assets (zum Zuordnen)
│  └─ sim-krakens-hoard.js     RTP-Simulation (Monte Carlo)
├─ src/shared/                 motion.js (Tweens/Partikel), sound.js, wallet.js (Spielgeld)
└─ src/games/krakens-hoard/    math.js · main.js · sfx.js · textures.js · style.css
```

## Qualitätsstandard (gilt für alle Spiele)

- **Mathematik zuerst:** Jedes Spiel hat ein reines `math.js` ohne Grafik. RTP wird per Simulation mit ≥ 1 Mio. Runden verifiziert, bevor irgendetwas animiert wird.
- **Server-Style:** Ein Spin wird komplett vorab berechnet (Liste von Steps), der Renderer spielt ihn nur ab. So könnte die Logik später 1:1 auf einen Server wandern.
- **Look:** echte gemalte Assets (ChatGPT) + Code-Effekte (Partikel, Glow, Shake, Gold-Text mit Verlauf).
- **Feel:** Anticipation bei 2 Scattern, Quick-Stop per Klick/Leertaste, Turbo, Autoplay, Big/Mega/Epic Win mit Hochzählen und Tier-Upgrades.
- **Responsive:** Querformat (Logo links, Infos rechts) und Hochformat (Logo oben, Infos unten) mit eigenem Layout – nicht einfach runterskaliert.
- **Sound:** Echte Dateien unter `public/assets/<spiel>/sfx/<name>.mp3` ersetzen automatisch den Synth-Fallback.

## Offene Punkte / Roadmap

1. Kraken's Hoard: echte Sounds + Musik einbauen (Liste im Asset-Guide), optionales Tentakel-Asset.
2. Pharaoh's Eclipse – Assets generieren → Engine (Walzen-Spin statt Tumble).
3. Dragon Emperor – Assets generieren → Hold & Win-Modus.
4. Blackjack + Poker – Tisch-Assets generieren → eigene Tisch-Engine.
5. Gemeinsame Lobby-Kacheln mit echten Thumbnails, Spielhistorie.
