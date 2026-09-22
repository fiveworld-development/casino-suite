# 🏴‍☠️ Kraken's Hoard 2.0

**Status:** ✅ spielbar · `krakens-hoard.html` · Code: `src/games/krakens-hoard/`

## Kernidee

Man **baut das Schiff auf** und verteidigt es: Planken sprengen, das Deck bleibt offen, das Kraken-Meter lädt sich auf, bis der Kraken garantiert angreift. Jede Mechanik hat Fortschritt über mehrere Spins, statt reinem Zufall.

## Eckdaten (3 Mio. simulierte Spins)

| | |
|---|---|
| Grid | 6 Walzen × 4–8 Reihen, Gewinnwege ab Walze 1 (mind. 3), Tumble |
| Gewinnwege | 4.096 → 15.625 → 46.656 → 117.649 → 262.144 |
| RTP | **96,04 %** (Basisspiel 67,3 % inkl. Planken-Münzen 8,8 %, Freispiele 28,7 %) |
| Trefferquote | **43,6 %** – fast jeder zweite Spin gewinnt |
| Kraken-Angriff | alle ~25 Spins (50 % durch volles Meter) |
| Freispiele | alle ~150 Spins, Ø 43x Einsatz |
| Big Win (15x+) | alle ~117 Spins |
| Ø offene Reihen | 5,7 |
| Volatilität | mittel |
| Max-Win | 10.000x (Cap) |

## Update 2.1: Sturm-Wahl, Kraken's Wrath, Bonus-Kauf (gemessen, `scripts/sim-kraken-fs.js`, 1 Mio. Basis-Spins + 30.000 Runden je Sturm)

| Sturm | Spins (3 Kompasse) | Start | Ø Wert | Gesamt-RTP |
|---|---|---|---|---|
| Sturmflut | 10 (+3 je Kompass) | – | 44,2x | 95,9 % |
| Kraken-Jagd | 5 (+1) | 1 klebrige Kraken-Walze x2–x5 | 44,6x | 96,2 % |
| Tiefsee-Wut | 6 (+1) | Kraken's Wrath im 1. Spin | 44,5x | 96,1 % |

- **Kraken's Wrath:** In den Freispielen gibt es ein eigenes Meter (10 Ladungen, 1 pro Planke, 2 pro Kraken-Auge). Ist es voll, werden drei Walzen gleichzeitig wild (nie Walze 2+3 zusammen → keine Endlos-Kaskade). Wrath-Walzen sind reine Wilds; die Multiplikatoren kommen von klebrigen Kraken-Walzen.
- **Bonus-Kauf:** 46x Einsatz (gemessener Ø 44,4x / 0,96 = 46,3x). Danach wählt man den Sturm.
- **Deck-Faktor** jetzt `(4/Reihen)^3`: Ein volles 8er-Deck ist ~8× so viel wert wie 4 Reihen (vorher ~4×) – Aufbauen fühlt sich spürbar belohnender an. Basisspiel 66,3 %, Freispiele alle ~150 Spins.
- **Darstellungs-Bugfix:** Schwebende Gewinnbeträge lagen auf der Kraken-Plakette in der Walzenmitte und stapelten sich bei schnellen Kaskaden. Plakette sitzt jetzt oben an der Walze, jeder neue Betrag ersetzt den vorherigen.

## Mechaniken

1. **Tumble:** Gewinnsymbole explodieren, Überlebende fallen nach, neue regnen von oben.
2. **Planken sprengen – und das Deck bleibt offen.** Jeder Tumble-Gewinn sprengt eine Planke (+1 Reihe). Offene Reihen bleiben über Spins bestehen. Ein Spin **ohne neue Sprengung** lässt eine Planke wieder zuschlagen. Deck und Meter werden gespeichert (auch nach Neuladen).
3. **Deck-Faktor:** Pro Gewinnweg zahlt ein größeres Deck weniger (`(4/Reihen)^4`), insgesamt lohnt es sich aber etwa 4× mehr. Sonst wäre ein offenes 8er-Deck 64× so viel wert.
4. **Kraken-Meter (0–30):** +1 pro gesprengter Planke, +2 pro Kraken-Auge. Voll → **garantierter Kraken-Angriff** im nächsten Spin. Zusätzlich 2 % Zufallsangriff (Freispiele 3 %).
5. **Kraken-Walze:** Tentakel peitscht hoch, eine Walze (2–5) wird komplett wild mit Multiplikator **x2 / x3 / x5** (Freispiele zusätzlich x10). Die Walze bleibt für **alle Kaskaden** des Spins. Mehrere Multiplikatoren werden **addiert**.
6. **Beute hinter Planken:** 15 % Münzen (Sofortgewinn 0,5x–10x), 25 % Kraken-Auge (+2 Meter), sonst leer.
7. **Freispiele „Der Sturm“:** 3/4/5/6 Kompasse = 10/12/15/20, Retrigger +5. Frisches 4er-Deck, **Kraken-Walzen kleben bis zum Ende** (max. 2). Zwei Riesen-Tentakel steigen hinter der Maschine auf. Danach kehrt das Deck des Spielers zurück.
8. **Anticipation, Gesamtgewinn-Tafel, Big/Mega/Epic, Münzflug ins Guthaben, „262.144 WEGE!“-Feier.**

### Sicherheitsregeln in der Mathematik
- Kraken-Walzen 2 **und** 3 gleichzeitig sind verboten: Damit gewinnt jedes Symbol auf Walze 1, und die Kaskade läuft endlos (Bug in einer Zwischenversion).
- Max. 25 Kaskaden pro Spin (Sicherheitsnetz).
- Scatter-Chance pro Feld sinkt mit der Deck-Größe → großes Deck ≠ mehr Freispiele.

## Auszahlungen

Grundwerte (× Einsatz pro Gewinnweg, vor `payScale` 0,286 × Deck-Faktor):

| Symbol | 3 | 4 | 5 | 6 | Gewicht |
|---|---|---|---|---|---|
| Kapitän | 1,5 | 3 | 6 | 15 | 4 |
| Papagei | 1 | 2 | 4 | 8 | 6 |
| Schatztruhe | 0,75 | 1,5 | 3 | 6 | 7 |
| Schiff | 0,5 | 1 | 2 | 4 | 9 |
| Rum | 0,4 | 0,8 | 1,5 | 3 | 11 |
| Pistolen | 0,3 | 0,6 | 1,2 | 2,5 | 12 |
| A | 0,2 | 0,4 | 0,75 | 1,5 | 16 |
| K / Q | 0,15 | 0,3 | 0,5 | 1 | 18 / 20 |
| J / 10 | 0,1 | 0,2 | 0,4 | 0,8 | 21 / 22 |

Freispiele: zusätzlich `fsScale` 0,41 (Planken + klebrige Walzen sind dort gleichzeitig aktiv – echte Slots lösen das mit eigenen Freispiel-Walzensets).

**Nach jeder Änderung:** `npm run sim:kraken -- 3000000` (1 Mio. streut ±2 % wegen seltener Riesengewinne).

## Geld & Kassenbuch

- Jeder Gewinn wird auf **ganze Cent gerundet**, bevor er gebucht wird.
- Debug (`?debug`): `KH.audit(startGuthaben)` vergleicht Guthaben mit Start − Σ Einsätze + Σ Gewinne. Getestet: 12 Spins inkl. Freispiele → erwartet 10.088,07 = Guthaben 10.088,07 ✅.
- Fällt eine Animation aus, springt das Spiel aufs Endergebnis und zahlt trotzdem korrekt aus (`safePlay`).

## Präsentation & Layout

- Kamera zeigt aktive Reihen + eine Teaser-Planke; Sprengung = Zoom raus, zuschlagende Planke = Zoom rein.
- Rahmen verzerrungsfrei (Breite exakt, nur Pfosten verlängert).
- Kraken-Walzen: violette Aura + Multiplikator-Plakette in der Walzenmitte, leuchten bei Gewinnen auf.
- Responsive: PC (Logo links, Info + Meter rechts), Handy hoch (Logo oben, Info + Meter unten), Handy quer (Bedienung als Spalte rechts). Touch: Tippen = Spin/Quick-Stop, Vibration, Vollbild.

## Assets

Alle vorhanden unter `public/assets/krakens-hoard/` inkl. `kraken_tentacle` (Walzen-Angriff) und `kraken_tentacle_sea` (Freispiel-Auftritt). Optional noch: `coin`, `multiplier_orb`, echte Sounds (Liste im [Asset-Guide](06-asset-guide.md)).
