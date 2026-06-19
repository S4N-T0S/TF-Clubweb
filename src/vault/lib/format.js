// Small display helpers for the vault pages
import { format } from 'date-fns';

export const num = (n) => (n == null ? '—' : Number(n).toLocaleString());

export const decimal = (n, places = 2) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(places));

export const pct = (n) => (n == null ? '—' : `${(n <= 1 ? n * 100 : n).toFixed(1)}%`);

// ms -> "1,127h" style total playtime
export const hours = (ms) => (ms ? `${Math.round(ms / 3_600_000).toLocaleString()}h` : '—');

// ms -> "32m" / "1h 04m" for a single match duration
export const duration = (ms) => {
  if (!ms || ms < 0) return '—';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};

// Accepts ISO string or epoch ms
export const date = (v, fmt = 'd MMM yyyy') => {
  if (v == null) return '—';
  const d = typeof v === 'number' ? new Date(v) : new Date(/^\d{12,}$/.test(String(v)) ? Number(v) : v);
  return Number.isNaN(d.getTime()) ? '—' : format(d, fmt);
};

export const dateTime = (v) => date(v, 'd MMM yyyy, HH:mm');

// Format a fiat amount with its ISO currency code (19.99, "EUR" -> "€19.99").
// Falls back to "<amount> <code>" if the code isn't a valid ISO currency, or to
// a bare 2-dp number when no currency is known.
export const money = (amount, currency) => {
  if (amount == null || !Number.isFinite(amount)) return '—';
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }
  return amount.toFixed(2);
};

// In-match virtual cash (the cashout "$"), an integer -> "$50,000".
export const cash = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : `$${Number(n).toLocaleString()}`);

// 1 -> "1st", 2 -> "2nd" ...
export const ordinal = (n) => {
  if (n == null) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
