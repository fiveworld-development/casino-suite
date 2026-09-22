// Chip sprites, stacks, and bet-placement/collection animation helpers.
import { Sprite, Container } from 'pixi.js';

export const DENOMINATIONS = [1000, 420, 100, 25, 5, 1];

/**
 * Greedy breakdown of an amount into available chip denominations (largest first).
 * Returns { breakdown: Map<denom, count>, remainder } — remainder is >0 only if the
 * amount isn't representable exactly with the given denominations (e.g. fractional cents).
 */
export function chipBreakdown(amount, denoms = DENOMINATIONS) {
  let remaining = Math.round(amount); // chips are whole-unit denominations
  const breakdown = new Map();
  const sorted = [...denoms].sort((a, b) => b - a);
  for (const d of sorted) {
    if (remaining <= 0) break;
    const count = Math.floor(remaining / d);
    if (count > 0) {
      breakdown.set(d, count);
      remaining -= count * d;
    }
  }
  return { breakdown, remainder: remaining };
}

/** Builds a Sprite for one chip of the given denomination using preloaded textures keyed 'chip_<d>'. */
export function makeChipSprite(denom, textures) {
  const tex = textures[`chip_${denom}`];
  const s = new Sprite(tex);
  s.anchor.set(0.5);
  return s;
}

/** A visual stack of chips for one denomination, with physical vertical offset per chip. */
export class ChipStack extends Container {
  constructor(denom, textures, chipHeight = 8) {
    super();
    this.denom = denom;
    this.textures = textures;
    this.chipHeight = chipHeight;
    this.count = 0;
  }

  setCount(n) {
    while (this.children.length < n) {
      const s = makeChipSprite(this.denom, this.textures);
      s.y = -this.children.length * this.chipHeight;
      s.scale.set(0.45);
      this.addChildAt(s, 0);
    }
    while (this.children.length > n) this.removeChildAt(this.children.length - 1);
    this.count = n;
  }
}

/** Animates a chip flying from (x0,y0) to (x1,y1) — used for bet placement and dealer payout. */
export async function flyChip(parent, motion, denom, textures, x0, y0, x1, y1, opts = {}) {
  const s = makeChipSprite(denom, textures);
  s.scale.set(0.45);
  s.position.set(x0, y0);
  parent.addChild(s);
  await Promise.all([
    motion.tween(s.position, { x: x1, y: y1 }, opts.duration ?? 380),
    motion.tween(s.scale, { x: 0.45, y: 0.45 }, opts.duration ?? 380),
  ]);
  if (opts.destroy !== false) s.destroy();
  return s;
}
