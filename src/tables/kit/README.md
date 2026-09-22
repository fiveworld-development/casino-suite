# Table Kit (`src/tables/kit`)

Shared building blocks for card table games ("Haze Kings Lounge" universe: Blackjack + Poker).

## `deck.js`
- `RANKS`, `SUITS` — constant arrays.
- `makeDeck()` — returns a fresh 52-card array of `{ rank, suit }`.
- `randomInt(n)` — unbiased random integer in `[0, n)` via `crypto.getRandomValues` + rejection sampling.
- `shuffle(arr)` — in-place Fisher-Yates shuffle using `randomInt`. Returns `arr`.
- `class Shoe(decks = 6, penetration = 0.75)`
  - `.draw()` — pop next card (auto-reshuffles if empty).
  - `.discardCards(cards)` — push used cards to the discard pile.
  - `.needsReshuffle()` — true once `penetration` fraction of the shoe has been dealt (check between rounds).
  - `.reshuffle()` — rebuild + shuffle the full shoe, clear discard.
  - `.remaining`, `.totalCards`.

## `cards.js`
- `buildCardTextures(images)` — renders all 52 faces + back to Pixi `Texture`s via Canvas (2x resolution). `images` = `{ court_J, court_Q, court_K, card_back }` (HTMLImageElement-like, e.g. `Texture.source.resource`). Returns `{ faces: Map<'AS'|...,Texture>, back: Texture, width, height }`.
- `class CardView(card, atlas)` — Pixi `Container` with a `Sprite`; `.setFaceUp(bool)`, `.flip(motion, duration)` (3D scaleX flip, swaps texture at the midpoint).

Suits: spades use a stylized leaf-spade shape (lounge motif) but stay red/black-correct and instantly recognizable.

## `chips.js`
- `DENOMINATIONS = [1000, 420, 100, 25, 5, 1]`.
- `chipBreakdown(amount, denoms?)` — greedy breakdown → `{ breakdown: Map<denom,count>, remainder }`.
- `makeChipSprite(denom, textures)` — `textures` keyed `chip_1`, `chip_5`, ... `chip_1000`.
- `class ChipStack(denom, textures, chipHeight=8)` — `.setCount(n)` stacks chips with vertical offset.
- `flyChip(parent, motion, denom, textures, x0, y0, x1, y1, opts)` — animated bet placement / payout; `motion` is a `shared/motion.js` `Motion` instance.

## `embed.js`
Portrait-first phone-app embedding helpers (games run standalone OR inside an iframe on the in-game phone):
- `isEmbedded()` — true if `window.self !== window.top`.
- `isEmbedRequested()` — true if `?embed=1` is in the URL.
- `isEmbedMode()` — either of the above; use this to hide the lobby/back button (`body.embedded .lobby-back` is hidden by `table-ui.css`).
- `setupEmbedViewport()` — call once at boot: locks page scrolling, fixes body position, adds `.embedded` class when applicable.
- `requestFullscreenIfStandalone()` — only requests fullscreen on touch devices when NOT embedded (never inside an iframe).
- `safeAreaInsets()` — reads `--sai-*` custom properties (wired to `env(safe-area-inset-*)` in `table-ui.css`).

## `table-ui.css`
Lounge-themed (emerald/gold/neon) control-bar styles: `.table-ui`, `.balance`, `.bet-display`, buttons (`.primary` for main CTA), `.chip-picker .chip-btn(.selected)`. Touch-friendly (min 44px targets), responsive breakpoints for phone portrait/landscape.

## Tests
`node src/tables/kit/deck.test.js` and `node src/tables/kit/chips.test.js`.

## Status
See `READY` in this folder once published — it lists the exact exported API frozen for downstream consumers (Blackjack, Poker).
