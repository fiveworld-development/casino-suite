// Embed/viewport helpers shared by table games running standalone OR inside an iframe on the
// in-game phone (portrait-first: 390x844 / 360x780 are the primary target, landscape/PC also supported).

/** True when running inside another window (e.g. the phone-app iframe). */
export function isEmbedded() {
  try { return window.self !== window.top; } catch { return true; } // cross-origin access throws -> embedded
}

/** True when the URL explicitly requests embed chrome (hides lobby/back button etc). */
export function isEmbedRequested() {
  return new URLSearchParams(location.search).get('embed') === '1';
}

/** Combined check callers should use to decide whether to show "back to lobby" UI, call
 *  requestFullscreen, etc. */
export function isEmbedMode() {
  return isEmbedded() || isEmbedRequested();
}

/**
 * Applies embed-safe page setup: disables body scrolling, respects safe-area insets, and
 * (only when NOT embedded) is the sole place allowed to request fullscreen on touch devices.
 * Call once at boot.
 */
export function setupEmbedViewport() {
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.inset = '0';
  document.body.style.touchAction = 'none';
  if (isEmbedMode()) document.body.classList.add('embedded');
}

/** Only call requestFullscreen when it's safe (standalone touch devices, never inside an iframe). */
export function requestFullscreenIfStandalone() {
  if (isEmbedMode()) return;
  if (matchMedia('(pointer: coarse)').matches) {
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
  }
}

/** CSS safe-area inset values as a `{ top, right, bottom, left }` px object (0 if unsupported). */
export function safeAreaInsets() {
  const cs = getComputedStyle(document.documentElement);
  const px = (v) => Number.parseFloat(v) || 0;
  return {
    top: px(cs.getPropertyValue('--sai-top')),
    right: px(cs.getPropertyValue('--sai-right')),
    bottom: px(cs.getPropertyValue('--sai-bottom')),
    left: px(cs.getPropertyValue('--sai-left')),
  };
}

/**
 * Soft, blurred copy of a background image, computed once on the CPU by stepwise down- and up-scaling.
 * Replaces a live BlurFilter, which re-renders the whole screen through several passes every frame (costly on phones).
 */
export function blurredTexture(img, Texture) {
  const step = (src, w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, w, h);
    return c;
  };
  const r = img.height / img.width;
  const tiny = step(step(step(img, 384, Math.round(384 * r)), 96, Math.round(96 * r)), 48, Math.round(48 * r));
  return Texture.from(step(step(tiny, 192, Math.round(192 * r)), 512, Math.round(512 * r)));
}