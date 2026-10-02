import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shirt, Images, ImageOff, WifiOff, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { useItemImages } from '../hooks/useItemImages';
import { PageHeader, Panel, Badge, EmptyState, Note } from '../components/ui';
import { ListSearch, SearchEcho } from '../components/ListSearch';
import { useListSearch } from '../../hooks/useListSearch';
import { Pagination } from '../../components/Pagination';
import { ITEM_GROUPS, ITEM_CLASSES, RARITIES } from '../lib/itemImages';
import { num, date } from '../lib/format';
import { VAULT_BASE } from '../../constants';
import { sponsorOf, when } from '../lib/itemStyle';
import { usePictures } from '../context/PicturesContext';
import { ItemTile, PicturesProvider } from '../components/ItemPicture';
import { WardrobeStats } from '../components/WardrobeStats';

const PER_PAGE = 24;
const ARCH_TONE = { Light: 'blue', Medium: 'emerald', Heavy: 'red' };
const INITIAL = { group: 'All', slot: 'All', rarity: 'any', season: 'any', weapon: 'any', pics: 'any', sort: 'new' };

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
          (pics === 'any' || (pics === 'with') === (srcOf(it) != null))
      ),
    [cosmetics, f, pics, srcOf]
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

  const active = (f.rarity !== 'any') + (f.season !== 'any') + (f.weapon !== 'any') + (pics !== 'any');
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
          </div>
          {(narrowed || q) && (
            <>
              <span className="text-[11px] tabular-nums text-gray-500">{num(shown.length)} of {num(cosmetics.length)}</span>
              <button type="button" onClick={clear} className="text-xs text-emerald-400 hover:underline">Clear filters</button>
            </>
          )}
          <select aria-label="Sort" value={f.sort} onChange={(e) => set({ sort: e.target.value })} className={`${SELECT} ml-auto`}>
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
        {inventory.copies?.rows > 0 &&
          ` Preview builds keep their own copy of the inventory, so ${num(inventory.copies.rows)} rows from ${num(inventory.copies.blocks)} preview ${inventory.copies.blocks === 1 ? 'copy' : 'copies'} are left out.`}
        {wardrobe.has && <> Rounds worn count the rounds whose <code>CustomizationItemAssetIDs</code> list the item, a list that never holds weapon skins, emotes or sprays.</>}
        {' '}Quests, currencies, battle passes and the other rows that are not cosmetics are on the{' '}
        <Link to={`${VAULT_BASE}/purchases`} className="text-emerald-400 hover:underline">Purchases page</Link>.
      </Note>
    </Panel>
  );
};

export const OutfitsTab = ({ outfits }) => {
  const [packId, setPackId] = useState(null);
  const pack = outfits.find((p) => p.id === packId) ?? outfits.find((p) => p.active) ?? outfits[0];
  const pieces = useMemo(() => [...pack.clothes].sort((a, b) => slotRank(a.slot) - slotRank(b.slot)), [pack]);
  return (
    <Panel title={`Saved outfits (${num(outfits.length)})`}>
      {outfits.length > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-2">
          {outfits.map((p) => (
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
        {pieces.length > 0 && (
          <ul className={GRID}>
            {pieces.map((it, i) => (
              <li key={i} className="min-w-0">
                <ItemTile item={it} />
              </li>
            ))}
          </ul>
        )}
        <dl className="mt-4 space-y-1 text-xs">
          {[...(pieces.length ? [] : [{ label: 'Clothes', names: null }]), ...pack.slots, { label: 'Spray', names: pack.spray }, { label: 'Emote wheel', names: pack.emotes }].map((s) => (
            <div key={s.label} className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-500">{s.label}</dt>
              <dd className="min-w-0 wrap-break-word text-gray-300">{s.names ? <Names names={s.names} /> : <span className="text-gray-600">not listed in this export</span>}</dd>
            </div>
          ))}
        </dl>
      </div>
      <Note>
        {outfits.some((p) => p.clothes.length === 0) && (
          <>
            Clothes come from each outfit’s <code>CustomizationItemIDs</code>, and some exports list only an emote there.{' '}
          </>
        )}
        The weapons and gadgets saved with each of these are on the Loadouts page.
      </Note>
    </Panel>
  );
};

export const CollectionBody = ({ inventory, wardrobe }) => {
  const images = useItemImages();
  const cosmetics = useMemo(() => inventory.items.filter((it) => it.klass), [inventory.items]);
  const outfits = useMemo(() => inventory.packs.filter((p) => p.clothes.length || p.slots.length || p.spray.length || p.emotes.length), [inventory.packs]);
  const [tab, setTab] = useState('items');
  const tabs = [
    { key: 'items', label: 'Cosmetics' },
    ...(outfits.length ? [{ key: 'outfits', label: 'Saved outfits' }] : []),
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
      {tab === 'outfits' && <OutfitsTab outfits={outfits} />}
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
  const subtitle = n > 0 ? `${num(n)} ${n === 1 ? 'cosmetic' : 'cosmetics'} owned${inventory.firstMs != null ? ` · oldest item on record ${date(inventory.firstMs)}` : ''}` : 'Cosmetics and saved outfits';
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
