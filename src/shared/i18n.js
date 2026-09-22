// Tiny i18n layer shared by every game (German + English).
// Language: ?lang=de|en  >  saved choice  >  browser language (German browsers get German, everyone else English).
// Games register their own string tables; HTML uses data-i18n attributes (see applyI18n).
const KEY = 'arcade.lang';
export const LANGS = ['de', 'en'];

function detect() {
  if (typeof location === 'undefined') return 'de'; // Node (tests, simulations)
  const q = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(q)) {
    try { localStorage.setItem(KEY, q); } catch { /* private mode */ }
    return q;
  }
  try {
    const s = localStorage.getItem(KEY);
    if (LANGS.includes(s)) return s;
  } catch { /* private mode */ }
  return (globalThis.navigator?.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
}

export const lang = detect();
export const locale = lang === 'de' ? 'de-DE' : 'en-US';
if (typeof document !== 'undefined') document.documentElement.lang = lang;

const dict = { de: {}, en: {} };

/** Register string tables: register({ de: { key: '…' }, en: { key: '…' } }). */
export function register(tables) {
  for (const l of LANGS) Object.assign(dict[l], tables[l]);
}

/** Translate a key; {name} placeholders are filled from vars. Falls back to German, then the key. */
export function t(key, vars) {
  let s = dict[lang][key] ?? dict.de[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}

/** Pick between inline variants: tr('Einsatz', 'Bet'). Handy for one-off strings. */
export const tr = (de, en) => (lang === 'de' ? de : en);

/**
 * Translate markup: data-i18n (text), data-i18n-html (trusted, own strings only),
 * data-i18n-title / -alt / -aria / -placeholder (attributes).
 */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  for (const [data, attr, name] of [['i18n-title', 'i18nTitle', 'title'], ['i18n-alt', 'i18nAlt', 'alt'], ['i18n-aria', 'i18nAria', 'aria-label'], ['i18n-placeholder', 'i18nPlaceholder', 'placeholder']]) {
    root.querySelectorAll(`[data-${data}]`).forEach((el) => el.setAttribute(name, t(el.dataset[attr])));
  }
}

export function setLang(l) {
  if (!LANGS.includes(l) || l === lang) return;
  try { localStorage.setItem(KEY, l); } catch { /* private mode */ }
  const u = new URL(location.href);
  u.searchParams.set('lang', l);
  location.replace(u.toString());
}

/** DE | EN segmented switch; mounted on every start screen and in the lobby. */
export function langSwitch() {
  const wrap = document.createElement('div');
  wrap.className = 'lang-switch';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', lang === 'de' ? 'Sprache' : 'Language');
  for (const l of LANGS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = l.toUpperCase();
    b.setAttribute('aria-pressed', String(l === lang));
    if (l === lang) b.classList.add('on');
    b.onclick = (e) => { e.stopPropagation(); setLang(l); };
    wrap.appendChild(b);
  }
  return wrap;
}

// shared strings used by the start screen and every game
register({
  de: {
    'load.play': 'Spielen',
    'load.note': 'Spielgeld · Kein Echtgeld · 18+',
    'load.ready': 'Bereit',
    'common.balance': 'Guthaben',
    'common.playMoney': 'Spielgeld',
    'common.win': 'Gewinn',
    'common.bet': 'Einsatz',
    'common.lobby': 'Lobby',
    'common.sound': 'Ton',
    'common.info': 'Spielinfo',
    'common.refill': 'Spielgeld auffüllen',
    'common.close': 'Schließen',
    'common.cancel': 'Abbrechen',
    'common.noFunds': 'Nicht genug Guthaben',
  },
  en: {
    'load.play': 'Play',
    'load.note': 'Play money · No real money · 18+',
    'load.ready': 'Ready',
    'common.balance': 'Balance',
    'common.playMoney': 'Play money',
    'common.win': 'Win',
    'common.bet': 'Bet',
    'common.lobby': 'Lobby',
    'common.sound': 'Sound',
    'common.info': 'Game info',
    'common.refill': 'Refill play money',
    'common.close': 'Close',
    'common.cancel': 'Cancel',
    'common.noFunds': 'Not enough balance',
  },
});

// start screens: translate the shared markup and mount the language switch
if (typeof document !== 'undefined') {
  const boot = () => {
    applyI18n();
    const loader = document.getElementById('loader');
    if (loader && !loader.querySelector('.lang-switch')) loader.appendChild(langSwitch());
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else queueMicrotask(boot); // after the whole module graph ran, so every game dictionary is registered
}
