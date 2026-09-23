// Sound panel: tap the music (slots) or sound (tables) button → a small panel with on/off switches
// and large, touch-friendly volume sliders. Settings are saved and shared by all games.
//   slots:  background music (switch + slider) and sound effects (slider)
//   tables: all sound (switch) and sound effects (slider)
import './music-control.css';
import { t } from './i18n.js';

const ICON = '<svg class="mp-ico" viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/></svg>';

export function mountMusicControl(button, sfx, { music = true } = {}) {
  const sections = [];
  if (music) {
    sections.push({
      title: t('common.musicTitle'), aria: t('common.musicVolume'),
      muted: () => sfx.musicMuted, setMuted: (m) => sfx.setMusicMuted(m),
      vol: () => sfx.musicVolume, setVol: (v) => sfx.setMusicVolume(v),
    });
    sections.push({
      title: t('common.sfxTitle'), aria: t('common.sfxVolume'),
      muted: () => false, vol: () => sfx.sfxVolume, setVol: (v) => sfx.setSfxVolume(v),
    });
  } else {
    // tables: the switch is the global sound switch, the slider sets the effects volume
    sections.push({
      title: t('common.sfxTitle'), aria: t('common.sfxVolume'),
      muted: () => sfx.muted, setMuted: (m) => sfx.setMuted(m),
      vol: () => sfx.sfxVolume, setVol: (v) => sfx.setSfxVolume(v),
    });
  }

  const panel = document.createElement('div');
  panel.className = 'music-panel';
  panel.hidden = true;
  panel.innerHTML = sections.map(() => `
    <div class="mp-sec">
      <div class="mp-head">
        <span class="mp-title"></span>
        <button type="button" class="mp-toggle" role="switch"></button>
      </div>
      <div class="mp-row">${ICON}<input type="range" class="mp-slider" min="0" max="100" step="1"><span class="mp-val"></span></div>
    </div>`).join('');
  document.body.appendChild(panel);

  const els = [...panel.querySelectorAll('.mp-sec')].map((el, i) => {
    const s = sections[i];
    const e = { el, s, toggle: el.querySelector('.mp-toggle'), slider: el.querySelector('.mp-slider'), val: el.querySelector('.mp-val') };
    el.querySelector('.mp-title').textContent = s.title;
    e.slider.setAttribute('aria-label', s.aria);
    if (!s.setMuted) e.toggle.remove();
    return e;
  });

  const render = () => {
    for (const { el, s, toggle, slider, val } of els) {
      const pct = Math.round(s.vol() * 100), m = s.muted();
      slider.value = String(pct);
      slider.style.setProperty('--fill', `${pct}%`);
      val.textContent = m ? t('common.off') : `${pct} %`;
      toggle.textContent = m ? t('common.off') : t('common.on');
      toggle.setAttribute('aria-checked', String(!m));
      toggle.classList.toggle('on', !m);
      el.classList.toggle('muted', m);
    }
    const first = sections[0];
    button.classList.toggle('off', first.muted() || first.vol() === 0);
  };

  for (const { s, toggle, slider } of els) {
    toggle.onclick = (e) => { e.stopPropagation(); s.setMuted(!s.muted()); render(); };
    slider.oninput = () => {
      const v = Number(slider.value) / 100;
      s.setVol(v);
      if (s.setMuted && s.muted() && v > 0) s.setMuted(false); // moving the slider switches it back on
      render();
    };
  }

  // next to the button, always fully on screen (bottom bar on phones, side column in landscape)
  const place = () => {
    const b = button.getBoundingClientRect();
    const w = panel.offsetWidth, h = panel.offsetHeight, m = 10;
    const sideBar = b.left > window.innerWidth * 0.6 && b.top < window.innerHeight * 0.5;
    let x = sideBar ? b.left - w - m : b.left + b.width / 2 - w / 2;
    let y = sideBar ? b.top + b.height / 2 - h / 2 : b.top - h - m;
    if (!sideBar && y < m) y = b.bottom + m; // button at the top of the screen: open below it
    x = Math.min(Math.max(m, x), window.innerWidth - w - m);
    y = Math.min(Math.max(m, y), window.innerHeight - h - m);
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  };

  const open = () => { panel.hidden = false; render(); place(); };
  const close = () => { panel.hidden = true; };

  button.onclick = (e) => { e.stopPropagation(); panel.hidden ? open() : close(); };
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
  return { render };
}
