# Third-party material

These parts are **not** covered by the Casino Suite License; they keep their own licenses.

## Libraries (installed via npm, not stored in this repository)

| Package | License |
|---|---|
| [PixiJS](https://github.com/pixijs/pixijs) | MIT |
| [Vite](https://github.com/vitejs/vite) | MIT (development only) |
| [sharp](https://github.com/lovell/sharp) | Apache-2.0 (asset scripts only) |

## Fonts

[Montserrat](https://fonts.google.com/specimen/Montserrat), [Cinzel](https://fonts.google.com/specimen/Cinzel), [Cinzel Decorative](https://fonts.google.com/specimen/Cinzel+Decorative) and [Inter](https://fonts.google.com/specimen/Inter), loaded from Google Fonts — all SIL Open Font License 1.1.

## Artwork

The game artwork (symbols, backgrounds, logos, cards, avatars) was created by the author with AI image generation and then selected, edited and integrated by hand (prompts: [docs/06-asset-guide.md](docs/06-asset-guide.md)). It is provided under the Casino Suite License to the extent the author holds rights in it; depending on your jurisdiction, purely AI-generated images may enjoy limited copyright protection.

## Sound effects

The following files are from [Pixabay](https://pixabay.com) and are used under the [Pixabay Content License](https://pixabay.com/service/license-summary/).
They may be used in your project as part of the games, but **must not be redistributed or sold on their own**.
All other sounds and the music are generated in code (`src/shared/sound.js`, `src/shared/music.js`) and fall under the Casino Suite License.

| File(s) in `public/assets/` | Pixabay author |
|---|---|
| `*/sfx/card.mp3`, `chip.mp3`, `shuffle.mp3`, `flip.mp3`, `vpcard.mp3` and related card/chip sounds | oxidvideos |
| `poker/sfx/allin.mp3` | freesound_community |
| `*/sfx/coinLoop.mp3` and payout loops | floraphonic |
| `*/sfx/win.mp3`, `big.mp3`, `bigWin.mp3`, `blackjack.mp3` win jingles | floraphonic, bithuh, puyopuyomegafan1234 |
| `poker/sfx/collect.mp3` coin sound | yuliana-yurukova |
| `krakens-hoard/sfx/music.mp3` ocean waves (base game) | rmultimediaeu |
| `krakens-hoard/sfx/musicStorm.mp3` storm at sea (features) | freesound_community |
| `haze-kings/sfx/music.mp3` reggae background music | freesound_community |

If you replace these files with your own, the rest of the audio keeps working (every sound has a synthesized fallback).
