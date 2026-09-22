# 🎨 Asset-Guide – ChatGPT-Prompts, Dateinamen, Sounds

## Ablauf (für jedes Spiel gleich)

1. **Neuer ChatGPT-Chat pro Spiel.** Zuerst den **Style-Block** allein senden, danach die Prompts einzeln – so bleibt der Stil konsistent.
2. Bei Symbolen immer: *transparent background, PNG*. Formate: Symbole 1024×1024, Hintergründe 1536×1024 (Querformat).
3. Bilder speichern (Dateinamen egal) → Ordner an Claude geben. Claude erstellt ein Kontaktbild (`scripts/contact-sheet.js`), ordnet zu und importiert als getrimmte WebPs (`scripts/import-<spiel>.js`) nach `public/assets/<spiel>/`.
4. Nicht passende Bilder einfach neu generieren lassen – „same style, but …“.

---

## 🏴‍☠️ Kraken's Hoard – Nachlieferung

Alle Pflicht-Assets sind vorhanden. Diese 3 ersetzen die Code-Effekte (im **selben Chat** wie die bisherigen Kraken-Assets generieren, damit der Stil passt):

| Datei | Format | Prompt |
|---|---|---|
| `kraken_tentacle` | 1024×1536 Hochformat | *Single giant kraken tentacle rising vertically out of dark stormy sea water, curling slightly at the tip, deep purple and violet skin with wet glossy highlights, rows of pale pink suction cups along the inner side, bioluminescent teal glowing spots, water splashing and dripping off it, dramatic rim light from above, same art style as the WILD symbol, full tentacle visible from base to tip, centered, transparent background, PNG* |
| `kraken_tentacle` (Alternative, falls zu „gerade“) | 1024×1536 | *Massive curved kraken tentacle bursting upward from ocean waves in an S-shape, tip curling to the right, glossy dark purple skin, glowing magenta suction cups, sea water spray and foam at the base, epic fantasy slot game art, 3D render, transparent background, PNG* |
| `coin` | 512×512 | *Single gold pirate doubloon coin, slightly tilted, skull and crossbones engraving, worn edges, shiny metallic reflections, transparent background, PNG* |
| `multiplier_orb` | 1024×1024 | *Glowing magical sea orb, swirling emerald green and teal energy inside, bright white core, small bubbles and light particles around it, empty center for a number, transparent background, PNG* |

→ Als WebP unter `public/assets/krakens-hoard/` ablegen (Claude importiert). Der Code nutzt sie automatisch, sobald die Datei existiert.

---

## 𓂀 Pharaoh's Eclipse

**Style-Block (zuerst senden):**
```
For this whole conversation, create assets for a premium AAA online slot game called "Pharaoh's Eclipse", ancient Egypt theme. Style: hyper-detailed 3D-rendered game art like Play'n GO / Pragmatic Play, cinematic lighting, deep lapis-lazuli blue and polished gold, turquoise gem accents, mystical solar-eclipse glow, glossy materials, strong rim light. Every symbol: centered, fills 85% of the frame, transparent background, PNG, 1024x1024, no text unless asked.
```

| Datei | Prompt |
|---|---|
| `sym_pharaoh` | Golden pharaoh death mask with glowing eyes, highest-paying symbol |
| `sym_anubis` | Anubis god bust, black and gold, glowing staff |
| `sym_explorer` | Adventurous treasure hunter with fedora and torch, confident pose |
| `sym_scarab` | Golden scarab beetle with turquoise wings spread |
| `sym_ankh` | Golden ankh with embedded rubies, magical glow |
| `sym_A` / `sym_K` / `sym_Q` / `sym_J` / `sym_T` | Letter "A" (then K, Q, J, 10) carved in sandstone with gold inlay and gems: A red, K blue, Q green, J purple, 10 orange |
| `sym_eye` | Eye of Horus emblem in gold and lapis, radiant light, word "WILD" underneath |
| `book` | Ancient open golden book of the dead with glowing hieroglyphs |
| `sarcophagus` | Golden sarcophagus lid, standing, ornate, transparent background |
| `moon_disc` | Dark moon disc with subtle glowing corona edge, transparent background |
| `card_back` | Egyptian-style playing card back, gold on lapis, for gamble feature |
| `bg_main` (1536×1024) | Inside a grand Egyptian temple, torches, giant statues, golden light, empty center space for reels |
| `bg_freespins` (1536×1024) | Pyramids at night during a total solar eclipse, glowing corona, mystical purple-gold sky |
| `frame` (1536×1024) | Ornate Egyptian reel frame, gold and lapis with hieroglyphs, **large empty transparent center**, transparent background |
| `logo` | "PHARAOH'S ECLIPSE" epic gold 3D lettering with eclipse sun behind, transparent background |
| `win_big` / `win_mega` / `win_epic` | "BIG WIN" / "MEGA WIN" / "EPIC WIN" gold 3D letters, Egyptian ornaments, sun rays, transparent background |

---

## 🐉 Dragon Emperor

**Style-Block:**
```
For this whole conversation, create assets for a premium AAA online slot game called "Dragon Emperor", imperial Chinese theme. Style: hyper-detailed 3D-rendered game art like Aristocrat / Pragmatic Play, cinematic lighting, deep imperial red, jade green and glowing gold, fire and smoke effects, glossy lacquer and jade materials, strong rim light. Every symbol: centered, fills 85% of the frame, transparent background, PNG, 1024x1024, no text unless asked.
```

| Datei | Prompt |
|---|---|
| `sym_dragon` | Majestic golden imperial dragon head, breathing fire, highest-paying symbol |
| `sym_emperor` | Chinese emperor in golden robes and crown, regal |
| `sym_tiger` | White tiger roaring, jade accents |
| `sym_koi` | Golden koi fish leaping with water splash |
| `sym_lantern` | Glowing red paper lantern with gold tassels |
| `sym_A` … `sym_T` | Letter "A" (then K, Q, J, 10) carved from red lacquer and jade with gold trim: A red, K blue, Q green, J purple, 10 orange |
| `sym_wild` | Golden dragon coiled around the word "WILD" in gold |
| `pearl` | Glowing fire pearl orb, flames swirling inside, empty center for number |
| `jackpot_mini/minor/major/grand` | Jackpot plaque with text "MINI" (bronze) / "MINOR" (silver) / "MAJOR" (gold) / "GRAND" (red-gold with jewels), ornate Chinese style |
| `dragon_full` (1536×1024) | Full-body golden dragon in flight, roaring, fire breath, transparent background |
| `jade_stone` | Glowing jade stone gem (respin counter) |
| `firework` | Single golden-red firework burst |
| `bg_main` (1536×1024) | Imperial palace courtyard at dusk, red pillars, lanterns, cherry blossoms, empty center for reels |
| `bg_bonus` (1536×1024) | Night sky over the palace, giant dragon circling in clouds, fire glow |
| `frame` | Ornate red-lacquer and gold reel frame with dragon carvings, **large empty transparent center** |
| `logo` | "DRAGON EMPEROR" epic gold 3D lettering, dragon wrapped around |
| `win_big/mega/epic` | "BIG WIN" / "MEGA WIN" / "EPIC WIN" gold 3D letters, fireworks, dragon |

---

## ♠️ Blackjack & Poker – „Haze Kings Lounge“ (Cannabis-Edition)

Die Tischspiele laufen im selben Universum wie **Haze Kings 420**: eine exklusive Cannabis-Lounge für Erwachsene. Das heißt Luxus-Casino trifft Neon-Grün, Gold, Samt und Rauch. Ein gemeinsamer Chat für beide Spiele, damit Chips, Karten und Raum zusammenpassen.

**Style-Block:**
```
For this whole conversation, create assets for a premium AAA online casino table game suite (Blackjack and Texas Hold'em) set in "Haze Kings Lounge", an exclusive luxury cannabis lounge for adults. Style: photorealistic 3D render like Evolution Gaming live-casino studios mixed with Hacksaw Gaming flair: deep emerald green velvet felt, black leather, polished gold trim, glowing neon green and soft purple accent lighting, subtle cannabis leaf motifs embossed and engraved (elegant, never cartoonish), soft volumetric haze in the air, warm golden spotlights, cinematic shallow depth of field. Rich, high-end, stylish. Objects: centered, transparent background, PNG unless it is a table or room.
```

**Gemeinsam** (`public/assets/tables/`):

| Datei | Format | Prompt |
|---|---|---|
| `bg_room` | 1536×1024 | Blurred luxury cannabis lounge interior, velvet sofas, lush plants and green neon glow, gold chandeliers, lava lamps, soft haze drifting in the air, warm bokeh lights, very soft focus, no people, no readable text |
| `card_back` | 1024×1536 | Premium playing card back, deep emerald with intricate gold filigree forming a symmetric cannabis leaf mandala, subtle embossed crown crest in the center, thin gold border, no text |
| `court_J` | 1024×1536 | Art-deco illustrated Jack for a playing card face: stylish young gentleman with a rolled joint behind his ear and a gold-leaf brooch, emerald and gold palette, mirrored top/bottom like a classic court card, no letters or suit symbols |
| `court_Q` | 1024×1536 | Same style, Queen: elegant woman with a crown woven from golden cannabis leaves, holding a jeweled vape pen like a scepter |
| `court_K` | 1024×1536 | Same style, King: the rastafarian lion king from Haze Kings with gold crown and chain, holding a golden bong like a scepter |
| `chip_1` | 1024×1024 | Top-down view of a single premium casino chip, white ceramic with lime-green edge spots, gold inlay ring with tiny engraved leaf pattern, small gold leaf emblem in the center, transparent background |
| `chip_5` | 1024×1024 | Same chip, deep red with white edge spots |
| `chip_25` | 1024×1024 | Same chip, emerald green with gold edge spots |
| `chip_100` | 1024×1024 | Same chip, black with neon-green edge spots and glowing leaf center |
| `chip_420` | 1024×1024 | Special chip, purple and gold with rainbow iridescent edge, the number "420" engraved in gold in the center |
| `chip_1000` | 1024×1024 | Same chip, solid gold with black edge spots and emerald inlay |
| `smoke_layer` | 1536×1024 | Soft white volumetric smoke wisps drifting horizontally, very transparent, transparent background (overlay over the table) |

**Blackjack** (`public/assets/blackjack/`):

| Datei | Format | Prompt |
|---|---|---|
| `table_blackjack` | 1536×1024 | Top-down view of a semicircular blackjack table, emerald green velvet felt with a large subtle embossed gold cannabis leaf watermark in the middle, black leather padded rail with gold trim and a thin glowing neon-green LED line, 7 empty gold-outlined betting circles along the curve, dealer area at the top straight edge, **no text printed on the felt**, soft haze and golden spotlight from above |
| `shoe` | 1024×1024 | Black leather and gold card dealing shoe with an engraved leaf emblem, 3/4 view from above, transparent background |
| `discard_tray` | 1024×1024 | Smoked-glass discard tray with gold edges, a few cards inside, top-down view, transparent background |
| `dealer` | 1024×1024 | Charismatic lounge dealer, upper body, emerald velvet vest over black shirt, gold leaf pin, relaxed confident smile, soft green neon backlight and haze, portrait crop |
| `logo_blackjack` | 1536×1024 | "BLACKJACK" luxury gold 3D lettering with neon green glow, an ace of spades whose spade is shaped like a cannabis leaf, gold chips and smoke wisps, small "HAZE KINGS LOUNGE" crown badge, transparent background |

**Poker** (`public/assets/poker/`):

| Datei | Format | Prompt |
|---|---|---|
| `table_poker` | 1536×1024 | Top-down view of an oval poker table for 6 players, emerald velvet felt with a subtle embossed gold leaf mandala in the center, black leather rail with gold trim and a glowing neon-green LED edge, faint community card area outline, an ornate gold ashtray-style pot tray in the middle, **no text**, haze and golden spotlight |
| `dealer_button` | 512×512 | Gold poker dealer button with an emerald inlay cannabis leaf and the word "DEALER", top-down, transparent background |
| `avatar_shark` | 1024×1024 | Portrait avatar "The Kingpin": cool confident man in his 40s, dark sunglasses, emerald velvet suit, gold chain, cigar-style joint, smoke curling, green neon backlight |
| `avatar_lucky` | 1024×1024 | Portrait avatar "Lucky Mary": cheerful woman in her 30s, flower crown with cannabis leaves, sparkly dress, big laugh, warm golden light |
| `avatar_maverick` | 1024×1024 | Portrait avatar "Blaze": flashy young man with a green-tinted cowboy hat, leather jacket, lighter flame in hand, cocky grin |
| `avatar_professor` | 1024×1024 | Portrait avatar "Dr. Kush": calm older man with round glasses and grey beard, tweed jacket, holding a magnifying glass over a bud, analytical look |
| `avatar_rookie` | 1024×1024 | Portrait avatar "Couch Rookie": relaxed young guy in an oversized hoodie, sleepy red eyes, bag of snacks, holding cards, funny |
| `avatar_player` | 1024×1024 | Stylish neutral silhouette avatar, gold outline on dark emerald, small gold leaf crown |
| `logo_poker` | 1536×1024 | "TEXAS HOLD'EM" luxury gold 3D lettering with neon green glow, royal flush fanned behind with leaf-shaped spades, smoke rings, "HAZE KINGS LOUNGE" crown badge, transparent background |
| `logo_videopoker` | 1536×1024 | "KUSH OR BETTER" gold 3D lettering, vintage neon casino sign style, green and purple glow, transparent background |
| `win_blackjack` | 1536×1024 | "BLACKJACK!" celebration banner, gold 3D letters, green neon burst, flying gold leaves and chips, transparent background |
| `win_royal` | 1536×1024 | "ROYAL FLUSH" celebration banner, gold 3D letters with crown, rainbow neon glow, smoke explosion, transparent background |

Kartenflächen (Zahlen, Symbole ♠♥♦♣, Ecken) rendert der Code – gestochen scharf in jeder Größe. Pik-Symbol wird dabei als stilisiertes Blatt gezeichnet, passend zum Lounge-Look.

**Sound (Lounge):** `music_lounge` – *smooth chill jazz hop with reggae guitar skanks, laid-back, seamless loop, no vocals* (Suno) · `chip` – *ceramic casino chips clacking* · `card` – *playing card slide and flip* · `shuffle` – *riffle shuffle of a card deck* · `bong` – *playful bong bubble, short* (für Blackjack/Royal Flush).

---

## 🔊 Sound

Aktuell: synthetisierte Effekte (WebAudio) als Fallback. **Für AAA-Qualität echte Sounds** – eine Datei ersetzt automatisch den Fallback:
`public/assets/krakens-hoard/sfx/<name>.mp3`

**Quellen:** ElevenLabs *Sound Effects* (Text → SFX, sehr gut für genau diese Liste), Pixabay Sound Effects (kostenlos, kommerziell nutzbar), Freesound (CC0-Filter). Musik: Suno / Udio (eigene Tracks) oder Pixabay Music.

| Datei | Beschreibung / ElevenLabs-Prompt |
|---|---|
| `music` | Loop 60–90 s: *epic pirate adventure music loop, orchestral, fiddles and low brass, sea shanty feel, mid tempo, seamless loop, no vocals* |
| `ocean` | Loop: *calm ocean waves against a wooden ship at night, creaking wood, distant seagulls, seamless loop* |
| `storm` | Loop: *heavy storm at sea, rain on wooden deck, howling wind, seamless loop* |
| `spin` | *short whoosh of cards shuffling, fast, 0.4 seconds* |
| `land` | *single wooden block knock, soft, short* |
| `scatterLand` | *magical chime with a deep gong hit, mystical* |
| `anticipation` | *rising tension riser, strings tremolo, 2 seconds* |
| `win` | *cheerful slot machine win jingle, bells and coins, 1 second* |
| `explode` | *magical sparkle burst, glassy, short* |
| `plank` | *thick wooden plank cracking and breaking, splinters* |
| `kraken` | *sea monster roar from underwater with huge water splash* |
| `wildFlip` | *magic swoosh with shimmer* |
| `coin` | *single gold coin clink* |
| `tick` | *soft counter tick* |
| `bigWin` | *triumphant orchestral fanfare, brass, pirate theme, 3 seconds* |
| `tierUp` | *whoosh impact with shimmering bells* |
| `fsStart` | *thunder crack followed by epic orchestral hit* |
| `thunder` | *close thunder clap with rolling rumble* |
| `multUp` | *magical power-up tone, ascending* |
| `click` | *soft UI button click* |
| `error` | *soft negative UI blip* |
