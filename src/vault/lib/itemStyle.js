// How a cosmetic is shown: rarity colours and the short strings the tiles and cards share.
import { SEASON_SPONSORS } from './gameMeta';
import { normName } from './itemImages';
import { date } from './format';

// Rare is sky, not blue: the themes remap blue-* as their accent.
export const RARITY = {
  Common: { bar: 'bg-gray-400', wash: 'bg-gray-400/10' },
  Rare: { bar: 'bg-sky-400', wash: 'bg-sky-400/10' },
  Epic: { bar: 'bg-purple-400', wash: 'bg-purple-400/10' },
  Legendary: { bar: 'bg-amber-400', wash: 'bg-amber-400/10' },
  Mythic: { bar: 'bg-rose-400', wash: 'bg-rose-400/10' },
};
export const rarityOf = (it) => (it.rarity && Object.hasOwn(RARITY, it.rarity) ? RARITY[it.rarity] : null);

const SPONSOR_NAME = new Map(Object.values(SEASON_SPONSORS).flat().map((n) => [normName(n), n]));
export const sponsorOf = (it) => (it.sponsor ? SPONSOR_NAME.get(it.sponsor) ?? it.sponsor : null);
export const when = (it) => (it.ms == null ? 'no date on record' : `${it.before ? 'by ' : ''}${date(it.ms)}`);
