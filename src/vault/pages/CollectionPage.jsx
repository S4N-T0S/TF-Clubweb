import { useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shirt, Images, ImageOff, WifiOff, RefreshCw, SlidersHorizontal, ChevronDown, IdCard, Shuffle, Star } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { useItemImages } from '../hooks/useItemImages';
import { PageHeader, Panel, Badge, EmptyState, Note, HoverTip } from '../components/ui';
import { ListSearch, SearchEcho } from '../components/ListSearch';
import { useListSearch } from '../../hooks/useListSearch';
import { Pagination } from '../../components/Pagination';
import { ITEM_GROUPS, ITEM_CLASSES, RARITIES } from '../lib/itemImages';
import { num, date } from '../lib/format';
import { VAULT_BASE } from '../../constants';
import { sponsorOf, when } from '../lib/itemStyle';
import { SEASONS } from '../lib/seasons';
import { usePictures } from '../context/PicturesContext';
import { ItemTile, ItemCard, ItemPicture, PicturesProvider } from '../components/ItemPicture';
import { ItemIcon } from '../components/MatchParts';
import { WardrobeStats } from '../components/WardrobeStats';

const PER_PAGE = 24;
const ARCH_TONE = { Light: 'blue', Medium: 'emerald', Heavy: 'red' };
const INITIAL = { group: 'All', slot: 'All', rarity: 'any', season: 'any', weapon: 'any', pics: 'any', fav: 'any', sort: 'new' };

const SLOT_ORDER = [...new Set(Object.values(ITEM_CLASSES).map((c) => c.label))];
const slotRank = (s) => {
  const i = SLOT_ORDER.indexOf(s);
  return i < 0 ? SLOT_ORDER.length : i;
};
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byName = (a, b) => collator.compare(a.name, b.name) || collator.compare(a.detail ?? '', b.detail ?? '') || collator.compare(a.slot, b.slot);
// Rows without the value sink to the end in both directions.
const by = (get, dir) => (a, b) => {
  const x = get(a);
  const y = get(b);
  return x == null || y == null ? (x == null) - (y == null) : dir * (x - y);
};
const byNewest = by((it) => it.ms, -1);
const then = (cmp) => (a, b) => cmp(a, b) || byNewest(a, b) || byName(a, b);
const rarityRank = (it) => (it.rarity ? RARITIES.indexOf(it.rarity) : null);
const SORTS = {
  new: { label: 'Newest first', cmp: byNewest },
  old: { label: 'Oldest first', cmp: then(by((it) => it.ms, 1)) },
  name: { label: 'Name', cmp: byName },
  rarity: { label: 'Rarity', cmp: then(by(rarityRank, -1)) },
  season: { label: 'Season added', cmp: then(by((it) => it.season, -1)) },
  worn: { label: 'Most worn', cmp: then(by((it) => it.worn?.rounds, -1)), needsWorn: true },
};
// The tile's third line: the figure the list is sorted by, else the acquired date.
const figure = (it, sort) => {
  const base =
    sort === 'rarity' ? (it.rarity ?? 'no rarity recorded')
      : sort === 'season' ? (it.season != null ? `Season ${it.season}` : 'no season recorded')
        : sort === 'worn' ? (it.worn ? `${num(it.worn.rounds)} ${it.worn.rounds === 1 ? 'round' : 'rounds'}` : 'not in a round record')
          : when(it);
  return it.amount !== 1 ? `${base} · ×${num(it.amount)}` : base;
};

const GRID = 'grid grid-cols-3 gap-2 @xl:grid-cols-4 @xl:gap-3 @4xl:grid-cols-6';
const chip = (on) => `shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${on ? 'bg-emerald-600 text-white' : 'bg-gray-900/60 text-gray-400 hover:text-white'}`;
const tabChip = (on) => `shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${on ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`;
const pill = (on) => `shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${on ? 'bg-emerald-600/20 text-emerald-300 ring-1 ring-emerald-500/40' : 'bg-gray-900/60 text-gray-400 hover:text-white'}`;
const SELECT = 'min-w-0 rounded-lg bg-gray-700 px-2.5 py-1.5 text-sm text-white outline-hidden ring-1 ring-inset ring-transparent focus:ring-emerald-500 scheme-dark disabled:opacity-50';
const CARD_GRID = 'grid max-w-sm grid-cols-6 gap-2 @xl:max-w-none @xl:grid-cols-5 @xl:gap-3';
const SEASON_11_MS = SEASONS.find((s) => s.n === 11)?.startMs;
const LEVEL_NOTE = (
  <>
    {' '}A badge’s level is its <code>PlayerCardCustomization.Level</code>, shown when above 0. The export does not say what a level stands for.
  </>
);
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-emerald-500';
const SPLIT = 'grid items-start gap-x-4 gap-y-4 @2xl:grid-cols-2';

const piecesOf = (look) => [look.skin, look.charm, look.sticker, look.sight, look.screen, ...look.animations, ...look.more].filter(Boolean);
const dressed = (e) => e.look != null;
const hasLooks = (p) => [...p.equipped, ...p.reserve, ...p.also].some(dressed);
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

const Names = ({ names }) =>
  names.length === 0 ? (
    <span className="text-gray-600">none</span>
  ) : (
    names.map((n, i) => (
      <span key={i}>
        {i > 0 && ', '}
        {n ?? <span className="text-gray-600">item not found in this export</span>}
      </span>
    ))
  );

export const PictureStatus = ({ cosmetics }) => {
  const { status, srcOf, failed, tryAgain } = usePictures();
  const pictured = useMemo(() => (status === 'ready' ? cosmetics.reduce((s, it) => s + (srcOf(it) ? 1 : 0), 0) : 0), [status, cosmetics, srcOf]);
  const lost = status === 'ready' && failed.size > 0;
  const warn = status === 'offline' || lost;
  const Icon = status === 'offline' ? WifiOff : lost ? ImageOff : status === 'loading' ? RefreshCw : Images;
  const n = cosmetics.length;
  const text =
    status === 'offline' ? 'The picture index could not be loaded, so no pictures are shown. Pictures need a connection.'
      : lost ? `${num(failed.size)} ${failed.size === 1 ? 'picture' : 'pictures'} on this page did not load.`
        : status === 'loading' ? 'Loading the picture index. Pictures need a connection.'
          : pictured === 0 ? `Pictures need a connection. None of your ${num(n)} ${n === 1 ? 'cosmetic has' : 'cosmetics has'} a picture.`
            : `Pictures need a connection. ${num(pictured)} of your ${num(n)} ${n === 1 ? 'cosmetic' : 'cosmetics'} ${pictured === 1 ? 'has' : 'have'} a picture.`;
  return (
    <div role="status" className={`flex items-start gap-2.5 rounded-xl px-4 py-2.5 text-xs ${warn ? 'border border-amber-700/40 bg-amber-950/30 text-amber-200/90' : 'bg-gray-800 text-gray-400'}`}>
      <Icon className={`mt-px h-4 w-4 shrink-0 ${warn ? 'text-amber-400' : 'text-gray-500'} ${status === 'loading' ? 'motion-safe:animate-spin' : ''}`} />
      <p className="min-w-0 flex-1">{text}</p>
      {warn && (
        <button type="button" onClick={tryAgain} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-700 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-600">
          <RefreshCw className="h-3 w-3" /> Try again
        </button>
      )}
    </div>
  );
};

export const CosmeticsTab = ({ cosmetics, inventory, wardrobe, hidden }) => {
  const { status, srcOf } = usePictures();
  const [f, setF] = useState(INITIAL);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const topRef = useRef(null);
  const searchRef = useRef(null);
  const set = (patch) => {
    setF((s) => ({ ...s, ...patch }));
    setPage(1);
  };

  const groupCounts = useMemo(() => {
    const c = new Map();
    for (const it of cosmetics) c.set(it.group, (c.get(it.group) ?? 0) + 1);
    return c;
  }, [cosmetics]);
  const groups = [['All', cosmetics.length], ...ITEM_GROUPS.filter((g) => groupCounts.has(g)).map((g) => [g, groupCounts.get(g)]), ...[...groupCounts].filter(([g]) => !ITEM_GROUPS.includes(g))];
  const slots = useMemo(() => {
    if (f.group === 'All') return [];
    const c = new Map();
    for (const it of cosmetics) if (it.group === f.group) c.set(it.slot, (c.get(it.slot) ?? 0) + 1);
    return [...c].sort((a, b) => slotRank(a[0]) - slotRank(b[0]));
  }, [cosmetics, f.group]);
  const options = useMemo(() => {
    const seasons = new Set();
    const weapons = new Set();
    let noSeason = false;
    let noRarity = false;
    for (const it of cosmetics) {
      if (it.season == null) noSeason = true;
      else seasons.add(it.season);
      if (it.equipment) weapons.add(it.equipment);
      if (!it.rarity) noRarity = true;
    }
    return { seasons: [...seasons].sort((a, b) => b - a), weapons: [...weapons].sort(collator.compare), noSeason, noRarity, rarities: RARITIES.filter((r) => cosmetics.some((it) => it.rarity === r)) };
  }, [cosmetics]);
  const showWeapon = options.weapons.length > 0 && (f.group === 'All' || f.group === 'Weapons');
  const fav = inventory.favourites;
  const showFav = fav.skins > 0 && (f.group === 'All' || f.group === 'Weapons');
  const favOnly = showFav && f.fav === 'only';
  const pics = status === 'ready' ? f.pics : 'any';

  const scoped = useMemo(
    () =>
      cosmetics.filter(
        (it) =>
          (f.group === 'All' || it.group === f.group) &&
          (f.slot === 'All' || it.slot === f.slot) &&
          (f.rarity === 'any' || (f.rarity === 'none' ? !it.rarity : it.rarity === f.rarity)) &&
          (f.season === 'any' || (f.season === 'none' ? it.season == null : it.season === Number(f.season))) &&
          (f.weapon === 'any' || it.equipment === f.weapon) &&
          (!favOnly || it.favourite != null) &&
          (pics === 'any' || (pics === 'with') === (srcOf(it) != null))
      ),
    [cosmetics, f, favOnly, pics, srcOf]
  );
  const { query, setQuery, filtered: shown } = useListSearch(
    scoped,
    (it) => [it.name, it.slot, it.group, it.detail, it.rarity, sponsorOf(it), it.label, it.season != null ? `S${it.season} Season ${it.season}` : null],
    () => setPage(1)
  );
  const sorted = useMemo(() => (f.sort === 'new' ? shown : [...shown].sort(SORTS[f.sort].cmp)), [shown, f.sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PER_PAGE;
  const slice = sorted.slice(start, start + PER_PAGE);

  const active = (f.rarity !== 'any') + (f.season !== 'any') + (f.weapon !== 'any') + (pics !== 'any') + favOnly;
  const narrowed = f.group !== 'All' || f.slot !== 'All' || active > 0;
  const q = query.trim();
  const clear = () => {
    set({ ...INITIAL, sort: f.sort });
    setQuery('');
  };

  if (hidden) return null;
  return (
    <Panel
      title={`Cosmetics you own (${num(cosmetics.length)})`}
      action={<ListSearch value={query} onChange={setQuery} placeholder="Search name, slot or weapon…" matched={shown.length} total={scoped.length} className="w-full sm:w-72" inputRef={searchRef} />}
    >
      <div className="@container">
        <div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Group">
          {groups.map(([g, c]) => (
            <button key={g} type="button" aria-pressed={f.group === g} onClick={() => set({ group: g, slot: 'All', weapon: 'any' })} className={chip(f.group === g)}>
              {g} <span className="tabular-nums opacity-70">{num(c)}</span>
            </button>
          ))}
        </div>
        {slots.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-2 @3xl:flex-wrap" role="group" aria-label="Slot">
            {[['All', groupCounts.get(f.group)], ...slots].map(([s, c]) => (
              <button key={s} type="button" aria-pressed={f.slot === s} onClick={() => set({ slot: s })} className={pill(f.slot === s)}>
                {s} <span className="tabular-nums opacity-70">{num(c)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-1 mb-3 flex flex-wrap items-center gap-2">
          <div className="contents @xl:flex @xl:min-w-0 @xl:flex-1 @xl:flex-wrap @xl:items-center @xl:gap-2">
            <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-200 hover:text-white @xl:hidden">
              <SlidersHorizontal className="h-4 w-4" /> Filters
              {active > 0 && <Badge tone="emerald">{active}</Badge>}
            </button>
            <div className={`${open ? 'grid' : 'hidden'} order-last w-full grid-cols-2 gap-2 @xl:order-none @xl:flex @xl:w-auto @xl:flex-wrap`}>
              <select aria-label="Rarity" value={f.rarity} onChange={(e) => set({ rarity: e.target.value })} className={SELECT}>
                <option value="any">Any rarity</option>
                {options.rarities.map((r) => <option key={r} value={r}>{r}</option>)}
                {options.noRarity && <option value="none">No rarity recorded</option>}
              </select>
              <select aria-label="Season added" value={f.season} onChange={(e) => set({ season: e.target.value })} className={SELECT}>
                <option value="any">Any season</option>
                {options.seasons.map((s) => <option key={s} value={s}>Season {s}</option>)}
                {options.noSeason && <option value="none">No season recorded</option>}
              </select>
              <select
                aria-label="Picture"
                value={pics}
                onChange={(e) => set({ pics: e.target.value })}
                disabled={status !== 'ready'}
                title={status !== 'ready' ? 'Available once the picture index has loaded' : undefined}
                className={SELECT}
              >
                <option value="any">Any picture</option>
                <option value="with">With a picture</option>
                <option value="without">Without a picture</option>
              </select>
              {showWeapon && (
                <select aria-label="Weapon" value={f.weapon} onChange={(e) => set({ weapon: e.target.value })} className={SELECT}>
                  <option value="any">Any weapon</option>
                  {options.weapons.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              )}
              {showFav && (
                <select aria-label="Favourite" value={f.fav} onChange={(e) => set({ fav: e.target.value })} className={SELECT}>
                  <option value="any">Favourite or not</option>
                  <option value="only">Favourites only</option>
                </select>
              )}
            </div>
            {(narrowed || q) && (
              <>
                <span className="text-[11px] tabular-nums text-gray-500">{num(shown.length)} of {num(cosmetics.length)}</span>
                <button type="button" onClick={clear} className="text-xs text-emerald-400 hover:underline">Clear filters</button>
              </>
            )}
          </div>
          <select aria-label="Sort" value={f.sort} onChange={(e) => set({ sort: e.target.value })} className={`${SELECT} ml-auto @xl:self-start`}>
            {Object.entries(SORTS).filter(([, s]) => !s.needsWorn || wardrobe.has).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
        </div>

        <div ref={topRef} className="scroll-mt-4" />
        {slice.length === 0 ? (
          <EmptyState icon={Shirt} title={q ? (narrowed ? `No cosmetics match “${q}” with these filters` : `No cosmetics match “${q}”`) : 'No cosmetics match these filters'}>
            <button type="button" onClick={clear} className="text-emerald-400 hover:underline">Clear filters</button>
          </EmptyState>
        ) : (
          <ul className={GRID}>
            {slice.map((it) => (
              <li key={it.id} className="min-w-0">
                <ItemTile item={it} sub={figure(it, f.sort)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchEcho value={query} onClear={() => setQuery('')} focusRef={searchRef} />
        {sorted.length > 0 && (
          <div className="flex-1">
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              startIndex={start}
              endIndex={start + PER_PAGE}
              totalItems={sorted.length}
              onPageChange={(p) => {
                setPage(p);
                topRef.current?.scrollIntoView({ block: 'start' });
              }}
              edgeScroll={false}
              variant="compact"
            />
          </div>
        )}
      </div>

      <Note>
        Names and dates come from your <code>InventoryItem</code> records, and slot, rarity, season and sponsor from Embark’s key file.
        {cosmetics.some((it) => it.internal) && ' Some names are Embark’s internal labels rather than what the game shows, and those with an underscore or braces are set in grey monospace.'}
        {cosmetics.some((it) => it.before) && ' A date marked “by” is the earliest time the row was written, because a later migration replaced its creation date.'}
        {cosmetics.some((it) => it.level != null) && LEVEL_NOTE}
        {inventory.copies?.rows > 0 &&
          ` Preview builds keep their own copy of the inventory, so ${num(inventory.copies.rows)} rows from ${num(inventory.copies.blocks)} preview ${inventory.copies.blocks === 1 ? 'copy' : 'copies'} are left out.`}
        {wardrobe.has && <> Rounds worn count the rounds whose <code>CustomizationItemAssetIDs</code> list the item, a list that never holds weapon skins, emotes or sprays.</>}
        {fav.skins > 0 && <> A star marks a skin that a saved contestant lists as a favourite in <code>ItemSkinRandomizers</code>, {num(fav.skins)} in all.</>}
        {fav.gone.skins > 0 && (
          <>
            {' '}
            {fav.skins > 0 ? `${num(fav.gone.skins)} other owned` : <>Favourites come from <code>ItemSkinRandomizers</code>, where {num(fav.gone.skins)} owned</>}
            {fav.gone.skins === 1 ? ' skin is a favourite' : ' skins are favourites'} only in contestants this export no longer lists, so {fav.gone.skins === 1 ? 'it has' : 'they have'} no star.
          </>
        )}
        {' '}Quests, currencies, battle passes and the other rows that are not cosmetics are on the{' '}
        <Link to={`${VAULT_BASE}/purchases`} className="text-emerald-400 hover:underline">Purchases page</Link>.
      </Note>
    </Panel>
  );
};

const Piece = ({ item }) => (
  <HoverTip
    width={264}
    label={[item.name, item.slot, item.rarity].filter(Boolean).join(', ')}
    tip={<ItemCard item={item} />}
    className="flex items-center gap-2 rounded-md p-0.5 transition-colors hover:bg-gray-700/30 focus-visible:outline-2 focus-visible:outline-emerald-500"
  >
    <span aria-hidden="true" className="block w-8 shrink-0 overflow-hidden rounded-md">
      <ItemPicture item={item} />
    </span>
    <span className={`min-w-0 flex-1 truncate text-xs ${item.internal ? 'font-mono text-gray-500' : 'text-gray-100'}`}>{item.name}</span>
    <span className="shrink-0 text-[10px] text-gray-500">{item.slot}</span>
  </HoverTip>
);

const keyOf = (packId, e) => `${packId}|${e.id}`;
const halves = (xs) => [xs.slice(0, Math.ceil(xs.length / 2)), xs.slice(Math.ceil(xs.length / 2))];
const extras = (look) => piecesOf(look).length - (look.skin ? 1 : 0);
const opens = (look) => extras(look) > 0 || look.favourites.length > 0;

const Row = ({ e, open, onToggle }) => {
  const id = useId();
  const { look } = e;
  const { skin } = look;
  const more = extras(look);
  const shuffled = look.shuffle && 'Deep Shuffle on (random skin)';
  const favs = look.favourites.length > 0 && `${num(look.favourites.length)} favourite ${look.favourites.length === 1 ? 'skin' : 'skins'}`;
  const expands = opens(look);
  const lost = look.unresolved > 0 && `${num(look.unresolved)} attached ${look.unresolved === 1 ? 'item' : 'items'} not found in this export`;
  const grid = 'grid w-full grid-cols-[40px_minmax(0,1fr)_16px] items-center gap-x-2.5 p-2 text-left';
  const hover = `rounded-lg transition-colors hover:bg-gray-700/30 ${FOCUS}`;
  const face = (
    <>
      <span aria-hidden="true" className="block w-10 overflow-hidden rounded-md">
        {skin ? <ItemPicture item={skin} /> : <ItemIcon it={e} className="h-10 w-10" />}
      </span>
      <span className="min-w-0">
        <span className={`block truncate text-sm font-medium ${e.name ? 'text-white' : 'text-gray-600'}`}>{e.name ?? 'item not found in this export'}</span>
        <span className="flex items-baseline justify-between gap-2 text-xs">
          <span className={`truncate ${skin ? (skin.internal ? 'font-mono text-gray-500' : 'text-gray-400') : 'text-gray-600'}`}>{skin ? skin.name : 'No skin attached'}</span>
          {more > 0 && <span className="shrink-0 text-[11px] tabular-nums text-gray-500">{skin ? `+${num(more)} more` : `${num(more)} ${more === 1 ? 'piece' : 'pieces'}`}</span>}
        </span>
        {(shuffled || favs || lost) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] leading-4">
            {shuffled && (
              <span className="inline-flex items-center gap-1 text-emerald-300">
                <Shuffle className="h-3 w-3 shrink-0" aria-hidden="true" />
                {shuffled}
              </span>
            )}
            {favs && (
              <span className="inline-flex items-center gap-1 text-yellow-300">
                <Star className="h-3 w-3 shrink-0" fill="currentColor" aria-hidden="true" />
                {favs}
              </span>
            )}
            {lost && <span className="text-gray-600">{lost}</span>}
          </span>
        )}
      </span>
    </>
  );
  return (
    <li className={`min-w-0 rounded-lg ${open && expands ? 'bg-gray-900/80 ring-1 ring-gray-700' : 'bg-gray-900/50'}`}>
      {expands ? (
        <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className={`${grid} ${hover}`}>
          {face}
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      ) : skin ? (
        <HoverTip width={264} label={[e.name, skin.name, skin.rarity, shuffled, favs, lost].filter(Boolean).join(', ')} tip={<ItemCard item={skin} />} className={`${grid} ${hover}`}>
          {face}
          <span />
        </HoverTip>
      ) : (
        <div className={grid}>
          {face}
          <span />
        </div>
      )}
      {open && expands && (
        <div id={id} className="border-t border-white/10 p-2">
          <ul className="space-y-0.5">
            {piecesOf(look).map((it, i) => (
              <li key={i} className="min-w-0">
                <Piece item={it} />
              </li>
            ))}
          </ul>
          {look.favourites.length > 0 && (
            <>
              <p className="px-0.5 pt-2.5 pb-1 text-[10px] uppercase tracking-wider text-gray-500">Favourite skins</p>
              <ul className="space-y-0.5">
                {look.favourites.map((it, i) => (
                  <li key={i} className="min-w-0">
                    <Piece item={it} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  );
};

const Rows = ({ entries, packId, open, flip }) => (
  <ul className="min-w-0 space-y-1.5">
    {entries.map((e, i) => {
      const key = keyOf(packId, e);
      return <Row key={`${e.id}#${i}`} e={e} open={open.has(key)} onToggle={() => flip([key], !open.has(key))} />;
    })}
  </ul>
);

const Group = ({ label, entries, packId, open, flip }) => {
  if (entries.length === 0) return null;
  const shown = entries.filter(dressed);
  const bare = entries.filter((e) => !dressed(e)).map((e) => e.name ?? 'an item not found in this export');
  const keys = shown.filter((e) => opens(e.look)).map((e) => keyOf(packId, e));
  const every = keys.length > 0 && keys.every((k) => open.has(k));
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
        {keys.length > 1 && (
          <button
            type="button"
            onClick={() => flip(keys, !every)}
            aria-label={`${every ? 'Close' : 'Open'} all ${label.toLowerCase()} items`}
            className={`-my-1 rounded-md px-2 py-1 text-xs text-emerald-400 transition-colors hover:bg-gray-700/40 ${FOCUS}`}
          >
            {every ? 'Close all' : 'Open all'}
          </button>
        )}
      </div>
      {shown.length > 0 && <Rows entries={shown} packId={packId} open={open} flip={flip} />}
      {bare.length > 0 && <p className={`text-xs text-gray-500 ${shown.length > 0 ? 'mt-2' : ''}`}>No cosmetics are saved for {andList(bare)}.</p>}
    </div>
  );
};

const Fold = ({ label, hint, open, onToggle, children }) => {
  const id = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${open ? 'bg-gray-900/80 text-white' : 'bg-gray-900/50 text-gray-300 hover:text-white'} ${FOCUS}`}
      >
        <span className="min-w-0 flex-1">{label}</span>
        {hint && <span className="shrink-0 font-normal tabular-nums text-gray-500">{hint}</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={id} className="mt-3">
          {children}
        </div>
      )}
    </div>
  );
};

export const ContestantsTab = ({ contestants, savedOutfits, wishlistPacks }) => {
  const [packId, setPackId] = useState(null);
  const [open, setOpen] = useState(() => new Set(typeof window !== 'undefined' && window.matchMedia?.('(min-width: 48rem)').matches ? ['wears'] : []));
  const pack = contestants.find((p) => p.id === packId) ?? contestants.find((p) => p.active) ?? contestants[0];
  const pieces = useMemo(() => [...pack.clothes].sort((a, b) => slotRank(a.slot) - slotRank(b.slot)), [pack]);
  const { looks, flagged } = useMemo(
    () => ({
      looks: contestants.some(hasLooks),
      flagged: contestants.some((p) => [...p.equipped, ...p.reserve, ...p.also].some((e) => e.look?.shuffle)),
    }),
    [contestants]
  );
  const flip = (keys, on) =>
    setOpen((s) => {
      const next = new Set(s);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  const fold = (k) => ({ open: open.has(k), onToggle: () => flip([k], !open.has(k)) });
  const lists = { packId: pack.id, open, flip };
  const dressedPack = hasLooks(pack);
  const also = pack.also.filter(dressed);
  return (
    <Panel title={`Saved contestants (${num(contestants.length)})`}>
      {contestants.length > 1 && (
        <div role="group" aria-label="Contestant" className="mb-3 flex flex-wrap gap-2">
          {contestants.map((p) => (
            <button key={p.id} type="button" aria-pressed={p.id === pack.id} onClick={() => setPackId(p.id)} className={chip(p.id === pack.id)}>
              {p.title}
            </button>
          ))}
        </div>
      )}
      <div className="@container">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <span className="truncate">{pack.title}</span>
          {pack.archetype && <Badge tone={ARCH_TONE[pack.archetype] || 'gray'}>{pack.archetype}</Badge>}
          {pack.active && <Badge tone="yellow">Selected</Badge>}
        </p>
        {dressedPack && (
          <div className="space-y-4">
            <div className={SPLIT}>
              <Group label="Equipped" entries={pack.equipped} {...lists} />
              <Group label="Reserve" entries={pack.reserve} {...lists} />
            </div>
            {also.length > 0 && (
              <Fold label="Not carried, with cosmetics saved" hint={num(also.length)} {...fold('also')}>
                <div className="grid items-start gap-y-1.5 @2xl:grid-cols-2 @2xl:gap-x-4">
                  {halves(also).map((half, i) => half.length > 0 && <Rows key={i} entries={half} {...lists} />)}
                </div>
              </Fold>
            )}
          </div>
        )}
        <div className={dressedPack ? 'mt-4 border-t border-gray-700/50 pt-4' : ''}>
          {pieces.length > 0 && (
            <Fold label="Wearing" hint={`${num(pieces.length)} ${pieces.length === 1 ? 'item' : 'items'}`} {...fold('wears')}>
              <ul className={GRID}>
                {pieces.map((it, i) => (
                  <li key={i} className="min-w-0">
                    <ItemTile item={it} />
                  </li>
                ))}
              </ul>
            </Fold>
          )}
          <dl className={`space-y-1 text-xs ${pieces.length ? 'mt-4' : ''}`}>
            {[
              ...(pieces.length ? [] : [{ label: 'Wearing', names: null }]),
              ...pack.slots,
              { label: 'Spray', names: pack.spray },
              { label: 'Emote wheel', names: pack.emotes },
              ...(looks && !dressedPack ? [{ label: 'Weapon cosmetics', names: null }] : []),
            ].map((s) => (
              <div key={s.label} className="flex gap-2">
                <dt className="w-28 shrink-0 text-gray-500">{s.label}</dt>
                <dd className="min-w-0 wrap-break-word text-gray-300">{s.names ? <Names names={s.names} /> : <span className="text-gray-600">not listed in this export</span>}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <Note>
        {contestants.some((p) => p.clothes.length === 0) && (
          <>
            What a contestant wears comes from its <code>CustomizationItemIDs</code>, and some exports list only an emote there.{' '}
          </>
        )}
        {looks ? (
          <>
            Weapon cosmetics come from each contestant’s <code>ItemAttachments</code>
            {flagged && (
              <>
                , and favourites and Deep Shuffle from <code>ItemSkinRandomizers</code>
              </>
            )}
            .
          </>
        ) : (
          'The weapons and gadgets saved with each contestant are on the Loadouts page.'
        )}
        {savedOutfits > 0 && (
          <>
            {' '}The export lists the {savedOutfits === 1 ? 'outfit' : `${num(savedOutfits)} outfits`} saved in the game’s wardrobe as{savedOutfits === 1 ? ' a' : ''}{' '}
            <code>CustomizationAppearancePack</code> {savedOutfits === 1 ? 'row without its pieces' : 'rows without their pieces'}.
          </>
        )}
        {wishlistPacks > 0 && (
          <>
            {' '}{savedOutfits > 0 ? 'It also lists' : 'The export lists'} {num(wishlistPacks)} {wishlistPacks === 1 ? 'row' : 'rows'} named <code>WishlistCustomizationAppearancePack</code>
            {savedOutfits > 0 && ', which that count leaves out'}.
          </>
        )}
      </Note>
    </Panel>
  );
};

const EmptySlot = ({ slot, gap }) => (
  <div className="h-full overflow-hidden rounded-lg border border-dashed border-gray-700">
    <div className="grid aspect-square place-items-center">
      <IdCard className="h-1/3 w-1/3 max-h-10 max-w-10 text-gray-600" strokeWidth={1.5} aria-hidden="true" />
    </div>
    <div className="px-1.5 pt-1 pb-1.5 text-left">
      <p className="min-h-8 text-[11px] leading-4 text-gray-400">{gap ? 'Empty or not listed' : 'Empty'}</p>
      <p className="truncate text-[10px] leading-4 text-gray-500">{slot}</p>
    </div>
  </div>
);

const NoBadges = ({ gap }) => (
  <div className="flex h-full min-h-14 items-center justify-center gap-2 rounded-lg border border-dashed border-gray-700 px-3 text-xs text-gray-400">
    <IdCard className="h-4 w-4 shrink-0 text-gray-600" aria-hidden="true" />
    {gap ? 'No badges set or listed' : 'No badges set'}
  </div>
);

export const PlayerCardTab = ({ card }) => {
  const { srcOf } = usePictures();
  const { savedMs, background, border, badges, contestantCards: n, linkedCards: m, current } = card;
  const gap = card.unresolved > 0;
  const before = !current && savedMs != null && savedMs < SEASON_11_MS;
  return (
    <Panel
      title="Player card"
      action={savedMs != null && <span className="text-xs tabular-nums text-gray-500">Last written {date(savedMs)}{before && ', before Season 11'}</span>}
    >
      {!current && (
        <p className="mb-3 rounded-lg border border-gray-700 bg-gray-900/40 px-3 py-2.5 text-xs text-gray-300">
          {m > 0
            ? `Your saved contestants point at ${m === 1 ? 'one other card' : `${num(m)} other cards`}, and the export does not say what ${m === 1 ? 'it holds' : 'they hold'}, so this card may differ from what the game shows.`
            : `The export also lists ${num(n)} per-contestant ${n === 1 ? 'card' : 'cards'} and does not say what ${n === 1 ? 'it holds' : 'they hold'}, so this card may differ from what the game shows.`}
        </p>
      )}
      <div className="@container">
        <ul className={CARD_GRID}>
          <li className="col-span-3 min-w-0 @xl:col-span-1">{background ? <ItemTile item={background} /> : <EmptySlot slot={ITEM_CLASSES.CardBackground.label} gap={gap} />}</li>
          <li className="col-span-3 min-w-0 @xl:col-span-1">{border ? <ItemTile item={border} /> : <EmptySlot slot={ITEM_CLASSES.CardBorder.label} gap={gap} />}</li>
          {badges.some(Boolean) ? (
            badges.map((it, i) => (
              <li key={i} className="col-span-2 min-w-0 @xl:col-span-1">
                {it ? <ItemTile item={it} /> : <EmptySlot slot={ITEM_CLASSES.CardBadge.label} gap={gap} />}
              </li>
            ))
          ) : (
            <li className="col-span-6 min-w-0 @xl:col-span-3">
              <NoBadges gap={gap} />
            </li>
          )}
        </ul>
      </div>
      <Note>
        The slots{savedMs != null && ' and the date'} come from the <code>PlayerCard</code> item
        {current ? '.' : <>, and the {m > 0 ? 'contestants’ own' : 'per-contestant'} cards are the <code>PersistentEntity</code> items named <code>PlayerCard</code>.</>}
        {badges.some((it) => it?.level != null) && LEVEL_NOTE}
        {border && srcOf(border) && ' A border’s picture is a close-up of its band.'}
      </Note>
    </Panel>
  );
};

export const CollectionBody = ({ inventory, wardrobe }) => {
  const images = useItemImages();
  const cosmetics = useMemo(() => inventory.items.filter((it) => it.klass), [inventory.items]);
  const contestants = useMemo(() => inventory.packs.filter((p) => p.clothes.length || p.slots.length || p.spray.length || p.emotes.length || hasLooks(p)), [inventory.packs]);
  const [tab, setTab] = useState('items');
  const tabs = [
    { key: 'items', label: 'Cosmetics' },
    ...(contestants.length ? [{ key: 'contestants', label: 'Saved contestants' }] : []),
    ...(inventory.playerCard ? [{ key: 'card', label: 'Player card' }] : []),
    ...(wardrobe.has ? [{ key: 'worn', label: 'Wardrobe' }] : []),
  ];
  return (
    <PicturesProvider images={images}>
      <PictureStatus cosmetics={cosmetics} />
      {tabs.length > 1 && (
        <div role="group" aria-label="Collection sections" className="flex gap-2 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)} className={tabChip(tab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      <CosmeticsTab cosmetics={cosmetics} inventory={inventory} wardrobe={wardrobe} hidden={tab !== 'items'} />
      {tab === 'contestants' && <ContestantsTab contestants={contestants} savedOutfits={inventory.savedOutfits} wishlistPacks={inventory.wishlistPacks} />}
      {tab === 'card' && <PlayerCardTab card={inventory.playerCard} />}
      {tab === 'worn' && <WardrobeStats wardrobe={wardrobe} inventory={inventory} />}
      <Note>
        Pictures and sound bites are from{' '}
        <a href="https://www.thefinals.wiki" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">thefinals.wiki</a>, matched to your
        items by name, slot, weapon, sponsor, rarity and season. The index, every picture shown and every sound played are downloaded from this site, so its logs can show which
        ones your browser asked for.
      </Note>
    </PicturesProvider>
  );
};

export const CollectionPage = () => {
  const { model } = useVaultData();
  const { inventory, wardrobe } = model;
  const n = useMemo(() => inventory.items.reduce((s, it) => s + (it.klass ? 1 : 0), 0), [inventory.items]);
  const subtitle = n > 0 ? `${num(n)} ${n === 1 ? 'cosmetic' : 'cosmetics'} owned${inventory.firstMs != null ? ` · oldest item on record ${date(inventory.firstMs)}` : ''}` : 'Cosmetics and saved contestants';
  const purchases = <Link to={`${VAULT_BASE}/purchases`} className="text-emerald-400 hover:underline">Purchases page</Link>;
  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader icon={Shirt} title="Collection" subtitle={subtitle} />
      {!inventory.has ? (
        <EmptyState icon={Shirt} title="No inventory in this export">This export has no InventoryItem records.</EmptyState>
      ) : !inventory.hasNames ? (
        <EmptyState icon={Shirt} title="Item names need a newer export">
          Exports made since September 2026 name each item. This one stores only each item’s type and quantity, so its items are counted by type on the {purchases}.
        </EmptyState>
      ) : n === 0 ? (
        <EmptyState icon={Shirt} title="No cosmetics in this export">
          None of the named items in this export are cosmetics. Everything else you own is on the {purchases}.
        </EmptyState>
      ) : (
        <CollectionBody inventory={inventory} wardrobe={wardrobe} />
      )}
    </div>
  );
};
