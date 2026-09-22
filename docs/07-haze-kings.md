# 🌿 Haze Kings 420 – Flaggschiff-Slot

**Status:** ✅ Implementiert · `haze-kings.html` · `src/games/haze-kings/**` · Assets importiert nach `public/assets/haze-kings/`
**Ziel:** Das Vorzeige-Spiel der Arcade – die meisten Features, die krassesten Effekte. 18+, nur Spielgeld.

## Umsetzung – gemessene Werte (scripts/sim-haze-kings.js, siehe Bericht)

Die Cluster-Pays, Hotbox-Multiplikatoren, der Grinder-Wild-Spread, Blaze und Big Smoke sind als
reines Step-Modell in `src/games/haze-kings/math.js` implementiert (kein Rendering-Code entscheidet
über Gewinne). `TUNING.payScale` wurde mit dem Simulator auf ~96% RTP eingemessen; wegen des sehr
hohen Cap (25.000x) und der exponentiellen Hotbox-Verdopplung streut das gemessene RTP zwischen
Mehr-Millionen-Spins-Läufen spürbar (High-Volatility-Design wie spezifiziert) – siehe die exakten
Zahlen im Abschluss-Report des Bauauftrags statt hier geschätzter Werte.

## Eckdaten

| | |
|---|---|
| Grid | 7 × 7, **Cluster Pays** (ab 5 verbundenen gleichen Symbolen, waagrecht/senkrecht) |
| Kaskaden | Tumble – Gewinner verpuffen in Rauch, neue Symbole fallen nach |
| RTP (Ziel) | 96,0 % (per Simulation verifiziert, wie Kraken's Hoard) |
| Volatilität | sehr hoch |
| Max-Win | **25.000x** |
| Big / Mega / Epic / **LEGENDARY** | 15x / 30x / 50x / 200x |

## Features

1. **Hotbox-Felder (Kern-Mechanik).** Jedes Feld, auf dem ein Gewinnsymbol verpufft, bekommt eine Rauchwolke. Verpufft dort *nochmal* ein Gewinn, wird das Feld zum **Multiplikator-Feld x2**, das sich bei jedem weiteren Treffer verdoppelt: x4 → x8 … **x1024**. Alle Multiplikatoren unter einem Cluster werden **addiert** und auf den Clustergewinn angewendet. Im Basisspiel verschwinden sie nach dem Spin.
2. **Grinder-Wild.** Landet im Tumble. Beim Zerbersten „mahlt“ der Grinder alle 8 Nachbarfelder zu Wilds (3×3). Mit Funken- und Krümel-Partikeln.
3. **Blaze (zufällig, Basisspiel).** Ein Feuerzeug schnippt, eine Flammenspur zieht über eine Reihe oder Spalte und verwandelt sie komplett in *ein* Premium-Symbol. Garantiert einen Cluster.
4. **Big Smoke (zufällig).** Rauch zieht über das Grid, lichtet sich, darunter 3–6 Multiplikator-Felder mit Startwert x2–x8.
5. **Freispiele „Munchies Mode“.** 3 / 4 / 5 / 6 / 7 goldene Blätter (Scatter) = 10 / 12 / 15 / 20 / 30 Freispiele. **Hotbox-Multiplikatoren bleiben die ganze Runde erhalten.** Retrigger 3+ = +5. Szenenwechsel: Neon-Lounge → Sternenhimmel über Wolken („Cloud 9“).
6. **Super-Freispiele „Cloud 9“.** 7 Scatter oder Kauf: alle Felder starten mit x2.
7. **Bonus-Kauf (Spielgeld).** Freispiele 100x · Super-Freispiele 500x · „Lucky Lighter“ 3x/Spin (doppelte Scatter-Chance). Echte Casinos haben das auch; hier nur mit Spielgeld.
8. **Anticipation & Tension.** Ab 2 Scattern Neon-Pulse, Bass-Drop und Verzögerung; ab 4 Scattern Zeitlupe + Kamera-Zoom.
9. **Win-Progression.** Big → Mega → Epic → **LEGENDARY** mit Rauchring-Explosionen, Neon-Flackern, Konfetti aus Blättern, Bass-Drop.

## Präsentation / Effekte

- **Volumetrischer Rauch** (Shader: animiertes Noise, additiv) zieht dauerhaft über den Bildschirm, reagiert auf Gewinne.
- Neon-Röhren im Rahmen flackern im Takt der Musik; Lavalampen-Glow.
- Symbole landen mit Squash-&-Stretch, Gewinner pulsieren mit Neon-Outline, verpuffen in Rauchringen.
- Multiplikator-Felder glühen je nach Stufe: grün (x2–x8) → gold (x16–x64) → lila (x128–x512) → regenbogen (x1024).
- Screen-Shake + chromatische Aberration bei Legendary.
- Musik: entspannter Lo-Fi/Reggae-Hip-Hop-Loop im Basisspiel, im Bonus Bass-lastiger Trap-Beat.

## Symbole

| Rang | Symbol | Datei |
|---|---|---|
| 1 | Der „Haze King“ – Rastafari-Löwe mit Krone und Goldkette | `sym_king` |
| 2 | Goldene Bong mit Edelsteinen | `sym_bong` |
| 3 | Joint mit glühender Spitze | `sym_joint` |
| 4 | Grinder (Gold/Grün) – normales Symbol | `sym_grinder` |
| 5 | Feuerzeug (Zippo, Neon) | `sym_lighter` |
| 6–9 | Knospen/Buds in 4 Farben: grün, lila, orange, blau (Kristalle glitzernd) | `sym_bud_green/purple/orange/blue` |
| Wild | Grinder-Wild (golden, „WILD“) | `sym_wild` |
| Scatter | Goldenes Hanfblatt mit Glow, „BONUS“ | `sym_scatter` |

---

## 🎨 Asset-Prompts (ChatGPT)

**Neuer Chat. Style-Block zuerst senden:**
```
For this whole conversation, create assets for a premium AAA online slot game called "Haze Kings 420", cannabis lounge theme for adults. Style: hyper-detailed 3D-rendered game art like Pragmatic Play / Hacksaw Gaming / Nolimit City, glossy materials, vibrant neon green and purple lighting with warm gold accents, soft volumetric smoke wisps, cinematic rim light, playful premium vibe, rich saturated colors. Every symbol: centered, fills 85% of the frame, transparent background, PNG, 1024x1024, no text unless asked.
```

### Symbole

| Datei | Prompt |
|---|---|
| `sym_king` | Majestic rastafarian lion king with a gold crown, thick gold chain, green-yellow-red knitted hat under the crown, relaxed confident smile, soft smoke around, highest-paying symbol, ornate gold emblem frame |
| `sym_bong` | Luxurious golden glass bong encrusted with emeralds, glowing green water inside, smoke swirling at the top |
| `sym_joint` | Perfectly rolled joint with a glowing orange ember tip and curling smoke, gold filter band |
| `sym_grinder` | Premium herb grinder, open lid, gold and emerald metal, green crumbs sparkling |
| `sym_lighter` | Chrome and gold flip lighter with an open neon green flame |
| `sym_bud_green` | Single cannabis bud, lime green with sparkling crystal trichomes, glossy, gem-like |
| `sym_bud_purple` | Same bud style, deep purple with sparkling crystals |
| `sym_bud_orange` | Same bud style, orange-amber with sparkling crystals |
| `sym_bud_blue` | Same bud style, icy blue with sparkling crystals |
| `sym_wild` | Golden grinder emblem with the word "WILD" in bold glowing gold 3D letters, neon green energy |
| `sym_scatter` | Radiant golden cannabis leaf with bright glow and sparkles, word "BONUS" in gold 3D letters below |

### Welt & UI

| Datei | Format | Prompt |
|---|---|---|
| `bg_main` | 1536×1024 | Cozy luxurious neon cannabis lounge at night, velvet sofas, lava lamps, plants, neon green and purple signs (no readable text), haze in the air, warm lights, empty center space for slot reels, cinematic depth of field |
| `bg_freespins` | 1536×1024 | Dreamy sky above pink and purple clouds at sunset, giant glowing golden leaf constellation in the stars, floating islands with plants, magical, empty center space for reels |
| `frame` | 1536×1536 | Ornate square slot reel frame made of polished gold and dark emerald wood, integrated glowing neon green tubes along the edges, small gold leaf ornaments at corners, a crown ornament centered on top, **large empty transparent square center**, transparent background |
| `logo` | 1536×1024 | Game logo "HAZE KINGS" with small "420" badge, bold gold 3D letters with neon green glow, crown on top, smoke wisps and leaves, transparent background |
| `multiplier_frame` | 512×512 | Glowing square tile highlight with soft neon edges and a smoky inner glow, empty center for a number, transparent background |
| `smoke_puff` | 1024×1024 | Single soft white smoke puff cloud, realistic, wispy edges, transparent background |
| `smoke_ring` | 1024×1024 | Single perfect smoke ring seen slightly from the side, soft white, transparent background |
| `leaf_particle` | 512×512 | Single small green cannabis leaf, stylized, glossy, transparent background |
| `flame` | 512×1024 | Single stylized fire flame, neon green core with orange outer glow, transparent background |
| `lighter_big` | 1024×1024 | Large chrome and gold flip lighter, angled, lid open, igniting with a big flame, transparent background |
| `bonus_buy` | 1024×1024 | Round glossy button icon, gold ring, green center with a golden leaf and a shopping bag, transparent background |
| `win_big` / `win_mega` / `win_epic` / `win_legendary` | 1536×1024 | "BIG WIN" / "MEGA WIN" / "EPIC WIN" / "LEGENDARY WIN" in huge gold 3D letters, neon green glow, smoke explosion, flying leaves and gold coins, transparent background (legendary: add rainbow neon and crown) |
| `fs_intro` | 1536×1024 | "MUNCHIES MODE" title in playful gold 3D letters with neon glow, floating snacks (donuts, pizza slice, chips) around, clouds, transparent background |
| `super_fs_intro` | 1536×1024 | "CLOUD 9" title in gold 3D letters with rainbow neon glow, surrounded by clouds and a crown, transparent background |

### Sound (ElevenLabs / Suno)

| Datei | Prompt |
|---|---|
| `music` | *chill lo-fi reggae hip hop instrumental loop, warm bass, vinyl crackle, relaxed groove, seamless loop, no vocals* (Suno) |
| `music_bonus` | *bass-heavy chill trap beat, dreamy synths, energetic but laid back, seamless loop, no vocals* (Suno) |
| `land` | *soft pop of a bubble, short* |
| `puff` | *soft smoke puff exhale whoosh, airy* |
| `grind` | *herb grinder twisting crunch, short* |
| `lighter` | *zippo lighter flick open and ignite* |
| `bong` | *bong bubbling gurgle, short playful* |
| `multUp` | *magical synth pluck rising in pitch* |
| `bassdrop` | *deep sub bass drop impact* |
| `scatter` | *shimmering golden chime with reverb* |
| `bigWin` | *triumphant reggae horns fanfare* |
| `coin` | *single gold coin clink* |
