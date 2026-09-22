// Builds the 1280x640 share image (Open Graph / Twitter / GitHub social preview).
// Usage: node scripts/social-image.js  → public/og-image.jpg + docs/social-preview.png
import sharp from 'sharp';

const W = 1280, H = 640;
const bg = await sharp('docs/screenshots/krakens-hoard-still.webp').resize(W, H, { fit: 'cover' }).modulate({ brightness: 0.45 }).blur(6).toBuffer();
const logo = (f, h) => sharp(f).resize({ height: h }).toBuffer();
const logos = await Promise.all([
  logo('public/assets/krakens-hoard/logo.webp', 150),
  logo('public/assets/haze-kings/logo.webp', 150),
  logo('public/assets/blackjack/logo_blackjack.webp', 150),
  logo('public/assets/poker/logo_poker.webp', 150),
]);
const widths = await Promise.all(logos.map(async (b) => (await sharp(b).metadata()).width));
const gap = 24, total = widths.reduce((a, w) => a + w, 0) + gap * 3;
let x = Math.round((W - total) / 2);
const placed = logos.map((input, i) => { const o = { input, left: x, top: 300 }; x += widths[i] + gap; return o; });

const text = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf0"/><stop offset="1" stop-color="#f2c350"/></linearGradient></defs>
  <text x="640" y="150" text-anchor="middle" font-family="Montserrat, 'Segoe UI', Arial, sans-serif" font-weight="900" font-size="92" fill="url(#g)" letter-spacing="2">CASINO SUITE</text>
  <text x="640" y="215" text-anchor="middle" font-family="Montserrat, 'Segoe UI', Arial, sans-serif" font-weight="700" font-size="32" fill="#e8eef6">Free browser casino games · Slots · Blackjack · Texas Hold'em</text>
  <text x="640" y="598" text-anchor="middle" font-family="Montserrat, 'Segoe UI', Arial, sans-serif" font-weight="700" font-size="24" fill="#9fb0c4">Play money · HTML5 · PixiJS · Free for non-commercial use</text>
</svg>`);

const img = sharp(bg).composite([{ input: text, left: 0, top: 0 }, ...placed]);
await img.clone().jpeg({ quality: 88 }).toFile('public/og-image.jpg');
await img.clone().png().toFile('docs/social-preview.png');
console.log('saved public/og-image.jpg and docs/social-preview.png');
