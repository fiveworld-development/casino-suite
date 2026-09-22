// Background-music panel: tap the music button → a small panel with an on/off switch and a
// large, touch-friendly volume slider. Shared by both slots; settings are saved for all games.
import './music-control.css';
import { t } from './i18n.js';

export function mountMusicControl(button, sfx) {
  const panel = document.createElement('div');
  panel.className = 'music-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="mp-head">
      <span class="mp-title"></span>
      <button type="button" class="mp-toggle" role="switch"></button>
    </div>
    <div class="mp-row">
      <svg class="mp-ico" viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/></svg>
      <input type="range" class="mp-slider" min="0" max="100" step="1">
      <span class="mp-val"></span>
    </div>`;
  document.body.appendChild(panel);
  const title = panel.querySelector('.mp-title');
  const toggle = panel.querySelector('.mp-toggle');
  const slider = panel.querySelector('.mp-slider');
  const val = panel.querySelector('.mp-val');
  title.textContent = t('common.musicTitle');
  slider.setAttribute('aria-label', t('common.musicVolume'));

  const render = () => {
    const pct = Math.round(sfx.musicVolume * 100);
    slider.value = String(pct);
    slider.style.setProperty('--fill', `${pct}%`);
    val.textContent = sfx.musicMuted ? t('common.off') : `${pct} %`;
    toggle.textContent = sfx.musicMuted ? t('common.off') : t('common.on');
    toggle.setAttribute('aria-checked', String(!sfx.musicMuted));
    toggle.classList.toggle('on', !sfx.musicMuted);
    panel.classList.toggle('muted', sfx.musicMuted);
    button.classList.toggle('off', sfx.musicMuted || sfx.musicVolume === 0);
  };

  // next to the button, always fully on screen (bottom bar on phones, side column in landscape)
  const place = () => {
    const b = button.getBoundingClientRect();
    const w = panel.offsetWidth, h = panel.offsetHeight, m = 10;
    const sideBar = b.left > window.innerWidth * 0.6 && b.top < window.innerHeight * 0.5;
    let x = sideBar ? b.left - w - m : b.left + b.width / 2 - w / 2;
    let y = sideBar ? b.top + b.height / 2 - h / 2 : b.top - h - m;
    x = Math.min(Math.max(m, x), window.innerWidth - w - m);
    y = Math.min(Math.max(m, y), window.innerHeight - h - m);
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  };

  const open = () => { panel.hidden = false; render(); place(); };
  const close = () => { panel.hidden = true; };

  button.onclick = (e) => { e.stopPropagation(); panel.hidden ? open() : close(); };
  toggle.onclick = (e) => { e.stopPropagation(); sfx.setMusicMuted(!sfx.musicMuted); render(); };
  slider.oninput = () => {
    const v = Number(slider.value) / 100;
    sfx.setMusicVolume(v);
    if (sfx.musicMuted && v > 0) sfx.setMusicMuted(false); // moving the slider switches the music back on
    render();
  };
  // taps inside the panel never reach the game (no accidental spins)
  for (const ev of ['pointerdown', 'pointerup', 'click', 'touchstart']) panel.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  // A tap outside only closes the panel. It is caught in the capture phase and stopped, so it can
  // never reach the game underneath – otherwise closing the panel would also start a (paid) spin.
  window.addEventListener('pointerdown', (e) => {
    if (panel.hidden || panel.contains(e.target) || button.contains(e.target)) return;
    e.stopPropagation();
    e.preventDefault();
    close();
    const eat = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('pointerup', eat, { capture: true, once: true });
    window.addEventListener('click', eat, { capture: true, once: true });
  }, { capture: true });
  window.addEventListener('resize', () => { if (!panel.hidden) place(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  render();
}
