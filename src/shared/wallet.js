// Play-money wallet shared by all games (no real money anywhere).
import { locale } from './i18n.js';

const KEY = 'arcade.balance';
export const START_BALANCE = 100000;

const read = () => {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : START_BALANCE;
  } catch { return START_BALANCE; }
};

let balance = read();
const listeners = new Set();

export const wallet = {
  get balance() { return balance; },
  set(v) {
    balance = Math.round(v * 100) / 100;
    try { localStorage.setItem(KEY, String(balance)); } catch { /* private mode */ }
    listeners.forEach((fn) => fn(balance));
  },
  add(v) { this.set(balance + v); },
  take(v) {
    if (v > balance + 1e-9) return false;
    this.set(balance - v);
    return true;
  },
  refill() { this.set(START_BALANCE); },
  on(fn) { listeners.add(fn); fn(balance); },
};

export const money = (v) =>
  v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
