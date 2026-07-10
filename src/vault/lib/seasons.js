// THE FINALS season starts (UTC), for overlaying markers on the vault's time
// charts. These are the confirmed launch dates — edit a date here (or add the
// next season) when a new season drops.
//
// The GDPR export itself can't date seasons — its season identifiers are opaque
// numbers and many of its record timestamps are backfilled to one migration date.
const day = (iso) => Date.parse(`${iso}T00:00:00Z`);

export const SEASONS = [
  { n: 1, label: 'S1', startMs: day('2023-12-08') },
  { n: 2, label: 'S2', startMs: day('2024-03-14') },
  { n: 3, label: 'S3', startMs: day('2024-06-13') },
  { n: 4, label: 'S4', startMs: day('2024-09-26') },
  { n: 5, label: 'S5', startMs: day('2024-12-12') },
  { n: 6, label: 'S6', startMs: day('2025-03-20') },
  { n: 7, label: 'S7', startMs: day('2025-06-12') },
  { n: 8, label: 'S8', startMs: day('2025-09-10') },
  { n: 9, label: 'S9', startMs: day('2025-12-10') },
  { n: 10, label: 'S10', startMs: day('2026-03-26') },
  { n: 11, label: 'S11', startMs: day('2026-07-09') },
];

// Season starts that fall within [minMs, maxMs] — for overlaying on a time axis
export const seasonsInRange = (minMs, maxMs) => {
  if (minMs == null || maxMs == null || maxMs <= minMs) return [];
  return SEASONS.filter((s) => s.startMs >= minMs && s.startMs <= maxMs);
};
