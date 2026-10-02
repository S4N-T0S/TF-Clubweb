import { useMemo, useState } from 'react';
import { ChevronDown, Shirt } from 'lucide-react';
import { Panel, StatCard, Badge, EmptyState, Note, HoverTip } from './ui';
import { num, pct, date } from '../lib/format';
import { ItemPicture } from './ItemPicture';

const GROUPS = {
  Outfit: { label: 'Outfit pieces', noun: 'outfit pieces', title: 'Most worn outfit pieces', slots: 'Most worn in each outfit slot' },
  Body: { label: 'Body features', noun: 'body features', title: 'Most worn body features', slots: 'Most worn in each body slot' },
};
const CLASSES = ['Light', 'Medium', 'Heavy'];
const TOP = 8;
const THIN = 0.02;
const RECORDED_FROM = { BodyType: [Date.UTC(2024, 10, 20), 'body type', 'November 2024'], Voice: [Date.UTC(2025, 6, 24), 'voice', 'July 2025'] };
const SIGNATURE = ['Upper body', 'Lower body', 'Headwear', 'Facewear', 'Feet'];

const share = (v) => (v > 0 && v < 0.01 ? '<1%' : `${Math.round(v * 100)}%`);
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const span = (a, b) => (a == null || b == null ? null : date(a) === date(b) ? date(a) : `${date(a)} to ${date(b)}`);
const pill = (on, inPanel) =>
  `shrink-0 min-h-10 @2xl:min-h-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
    on ? 'bg-emerald-600 text-white' : `${inPanel ? 'bg-gray-900/60' : 'bg-gray-800'} text-gray-400 hover:text-white`
  }`;

const Thumb = ({ item, className }) => (
  <span aria-hidden="true" className={`block shrink-0 overflow-hidden rounded-md ${className}`}>
    <ItemPicture item={item} />
  </span>
);

const Name = ({ it, sub, className = 'text-sm text-white' }) => (
  <span className="block truncate min-w-0">
    <span className={it.internal ? 'font-mono text-xs text-gray-500' : className}>{it.name}</span>
    {sub && <span className={`ml-1.5 text-[11px] ${it.detail ? 'text-gray-400' : 'font-mono text-gray-500'}`}>{sub}</span>}
  </span>
);

const ItemTip = ({ e, sub }) => (
  <>
    <p className={e.item.internal ? 'font-mono text-xs text-gray-300 break-all' : 'text-sm font-semibold text-white wrap-break-word'}>{e.item.name}</p>
    {sub && <p className="text-xs text-gray-300 wrap-break-word">{sub}</p>}
    <p className="text-[11px] text-gray-400 mb-2">{[e.item.slot, e.item.rarity, e.item.season != null && `Season ${e.item.season}`].filter(Boolean).join(' · ')}</p>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {[
        ['Worn in', plural(e.rounds, 'round', 'rounds')],
        ['First worn', date(e.firstMs)],
        ['Last worn', date(e.lastMs)],
        ...(CLASSES.some((c) => e.byClass[c]) ? [['Classes', CLASSES.filter((c) => e.byClass[c]).map((c) => `${c} ${num(e.byClass[c])}`).join(', ')]] : []),
      ].map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-gray-400">{k}</dt>
          <dd className="text-gray-200 tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  </>
);

const MostWorn = ({ w, facts, group }) => {
  const [picked, setPicked] = useState('All');
  const classes = CLASSES.filter((c) => w.byClass?.[c] > 0);
  const cls = classes.includes(picked) ? picked : 'All';
  const base = cls === 'All' ? w.rounds : w.byClass[cls];
  const rows = useMemo(
    () =>
      w.items
        .filter((e) => e.item.group === group)
        .map((e) => ({ e, n: cls === 'All' ? e.rounds : e.byClass[cls] || 0 }))
        .filter((r) => r.n > 0)
        .sort((a, b) => b.n - a.n || a.e.item.name.localeCompare(b.e.item.name)),
    [w.items, group, cls]
  );
  const once = rows.filter((r) => r.n === 1).length;
  const of = cls === 'All' ? 'rounds' : `${cls} rounds`;
  const late = Object.keys(RECORDED_FROM)
    .filter((k) => group === 'Body' && w.firstMs != null && w.firstMs < RECORDED_FROM[k][0] && w.slots.some((s) => s.klass === k && s.rounds < w.rounds))
    .map((k) => RECORDED_FROM[k]);

  return (
    <Panel title={GROUPS[group].title}>
      {classes.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-4" role="group" aria-label="Class">
          {['All', ...classes].map((c) => (
            <button key={c} type="button" aria-pressed={cls === c} onClick={() => setPicked(c)} className={pill(cls === c, true)}>
              {c}
            </button>
          ))}
          <span className="text-xs text-gray-500 tabular-nums">
            {num(base)} {of}
          </span>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">Nothing in this group was worn in a round on record.</p>
      ) : (
        <ul className="grid gap-3 @2xl:grid-cols-2 @2xl:grid-flow-col @2xl:grid-rows-4 @2xl:gap-x-8">
          {rows.slice(0, TOP).map(({ e, n }) => (
            <li key={e.item.id} className="min-w-0">
              <HoverTip tip={<ItemTip e={e} sub={facts.sub(e.item)} />} width={260} label={`${e.item.name}, ${e.item.slot}, ${plural(n, 'round', 'rounds')}`} className="flex items-center gap-2.5">
                <Thumb item={e.item} className="w-10" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <Name it={e.item} sub={facts.sub(e.item)} />
                    <span className="text-xs text-gray-400 tabular-nums shrink-0">{num(n)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-emerald-500/70 rounded-full" style={{ width: `${Math.max(2, (n / base) * 100)}%` }} />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {e.item.slot} · {share(n / base)} of {of}
                  </p>
                </div>
              </HoverTip>
            </li>
          ))}
        </ul>
      )}
      {once > 0 && (
        <p className="text-xs text-gray-500 mt-3">
          Of the {num(rows.length)} {GROUPS[group].noun} worn{cls === 'All' ? '' : ` on ${cls}`}, {num(once)} {once === 1 ? 'appears' : 'appear'} in one round only.
        </p>
      )}
      {late.length > 0 && (
        <Note>
          {late[0][1].replace(/^./, (c) => c.toUpperCase())} is recorded only from {late[0][2]}
          {late[1] ? ` and ${late[1][1]} only from ${late[1][2]}, so earlier rounds count as rounds without them.` : ', so earlier rounds count as rounds without one.'}
        </Note>
      )}
    </Panel>
  );
};

const SlotTable = ({ w, facts, group }) => {
  const [open, setOpen] = useState(null);
  const slots = w.slots.filter((s) => s.group === group);
  const thin = slots.filter((s) => s.rounds < THIN * w.rounds).map((s) => s.label);
  const left = facts.unlisted.filter(([, u]) => u.group === group);
  const owns = (rows) => rows.map(([label, u]) => `${label} (${num(u.n)} owned)`);
  const unrecorded = owns(left.filter(([, u]) => w.unrecorded.includes(u.klass)));
  const unlisted = owns(left.filter(([, u]) => !w.unrecorded.includes(u.klass)));
  const grid = 'grid grid-cols-[minmax(0,1fr)_auto_16px] @2xl:grid-cols-[112px_minmax(0,1fr)_128px_104px_16px] items-center gap-x-3 @2xl:gap-x-4';
  if (slots.length === 0) return null;
  return (
    <Panel title={GROUPS[group].slots}>
      <p className="text-xs text-gray-500 -mt-1 mb-3">Shares are of the rounds that list the slot.</p>
      <div className={`${grid} hidden @2xl:grid px-2.5 pb-1.5 text-[10px] uppercase tracking-wider text-gray-500`}>
        <span>Slot</span>
        <span>Most worn</span>
        <span className="text-right">Rounds</span>
        <span className="text-right">Worn of owned</span>
        <span />
      </div>
      <ul className="divide-y divide-gray-700/50">
        {slots.map((s) => {
          const top = s.top;
          const isOpen = open === s.klass;
          const worn = isOpen ? w.items.filter((e) => e.item.klass === s.klass) : [];
          const notWorn = facts.notWorn.get(s.klass) ?? [];
          return (
            <li key={s.klass}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.klass)} className={`${grid} w-full text-left px-2.5 py-2 rounded-lg hover:bg-gray-700/30 transition-colors`}>
                <span className="hidden @2xl:block text-sm text-gray-300">{s.label}</span>
                <span className="min-w-0">
                  <span className="@2xl:hidden block text-[10px] uppercase tracking-wider text-gray-500">{s.label}</span>
                  {top ? <Name it={top.item} sub={facts.sub(top.item)} /> : <span className="block text-sm text-gray-500">none of your items</span>}
                </span>
                <span className="hidden @2xl:block text-right">
                  {top && (
                    <>
                      <span className="block font-semibold tabular-nums text-white leading-none">{num(top.rounds)}</span>
                      <span className="block mt-1 h-0.75 bg-gray-700 rounded-full overflow-hidden">
                        <span className="block h-full bg-emerald-500/70 rounded-full" style={{ width: `${Math.max(2, (top.rounds / s.rounds) * 100)}%` }} />
                      </span>
                      <span className="block mt-0.5 text-[10px] text-gray-500 tabular-nums">
                        {share(top.rounds / s.rounds)} of {num(s.rounds)}
                      </span>
                    </>
                  )}
                </span>
                <span className="hidden @2xl:block text-right text-sm text-gray-300 tabular-nums">
                  {num(s.worn)} of {num(s.owned)}
                </span>
                <span className="@2xl:hidden text-right text-[11px] tabular-nums">
                  <span className="block text-gray-400">
                    {num(s.worn)} of {num(s.owned)} worn
                  </span>
                  {top && (
                    <span className="block text-gray-500">
                      {share(top.rounds / s.rounds)} of {num(s.rounds)}
                    </span>
                  )}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-2.5 pb-3 space-y-2 text-xs">
                  <p className="text-gray-500">Listed in {plural(s.rounds, 'round', 'rounds')}, {share(s.rounds / w.rounds)} of all {num(w.rounds)}.</p>
                  {worn.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Worn ({num(worn.length)})</p>
                      <p className="text-gray-300 wrap-break-word">
                        {worn.map((e, i) => (
                          <span key={e.item.id}>
                            {i > 0 && <span className="text-gray-600"> · </span>}
                            <span className={e.item.internal ? 'font-mono text-gray-500' : ''}>{e.item.name}</span>
                            {facts.sub(e.item) && <span className="text-gray-500"> ({facts.sub(e.item)})</span>}
                            <span className="text-gray-500 tabular-nums"> {num(e.rounds)}</span>
                          </span>
                        ))}
                      </p>
                    </div>
                  )}
                  {notWorn.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Not worn ({num(notWorn.length)})</p>
                      <p className="text-gray-400 wrap-break-word">
                        {notWorn.map((item, i) => (
                          <span key={item.id}>
                            {i > 0 && <span className="text-gray-600"> · </span>}
                            <span className={item.internal ? 'font-mono text-gray-500' : ''}>{item.name}</span>
                            {facts.sub(item) && <span className="text-gray-500"> ({facts.sub(item)})</span>}
                          </span>
                        ))}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {(unlisted.length > 0 || unrecorded.length > 0 || thin.length > 0) && (
        <Note>
          {[
            unlisted.length > 0 && `Slots that no round lists are not counted: ${andList(unlisted)}.`,
            unrecorded.length > 0 &&
              `${andList(unrecorded)} ${unrecorded.length === 1 ? 'is' : 'are'} not counted either: the exports seen so far never list a watch, and list a pet only in January 2024.`,
            thin.length > 0 && `${andList(thin)} ${thin.length === 1 ? 'is' : 'are'} listed in fewer than 2% of rounds.`,
          ]
            .filter(Boolean)
            .join(' ')}
        </Note>
      )}
    </Panel>
  );
};

const Outfits = ({ w, facts }) => {
  const [open, setOpen] = useState(null);
  const outfitRounds = w.rounds - w.uniformRounds;
  const leadIds = new Set((w.outfits[0]?.items ?? []).map((p) => p.id));
  const d = w.distinctOutfits;
  return (
    <Panel title="Most worn outfits">
      {w.outfits.length > 0 && (
        <ul className="space-y-2">
          {w.outfits.map((o, i) => {
            const isOpen = open === o.key;
            const pieces = o.items;
            const sig = SIGNATURE.map((s) => o.items.find((p) => p.slot === s)).filter(Boolean).slice(0, 3);
            const shown = sig.length ? sig : pieces.slice(0, 3);
            const ids = new Set(o.items.map((p) => p.id));
            const diff = i === 0 ? [] : [...new Set([...o.items.filter((p) => !leadIds.has(p.id)), ...w.outfits[0].items.filter((p) => !ids.has(p.id))].map((p) => p.slot))].sort();
            const dates = span(o.firstMs, o.lastMs);
            return (
              <li key={o.key} className="bg-gray-900/50 rounded-lg overflow-hidden">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : o.key)}
                  className="w-full text-left p-3 grid grid-cols-[20px_40px_minmax(0,1fr)_16px] @2xl:grid-cols-[24px_40px_minmax(0,1fr)_112px_16px] items-center gap-x-2.5 hover:bg-gray-700/30 transition-colors"
                >
                  <span className="text-center text-sm font-bold text-gray-500 tabular-nums">{i + 1}</span>
                  <Thumb item={shown[0]} className="w-10" />
                  <span className="min-w-0">
                    <span className="text-sm text-white line-clamp-2">{shown.map((p) => p.name).join(' · ')}</span>
                    <span className="@2xl:hidden block text-[11px] text-gray-500 tabular-nums mt-0.5">
                      {plural(o.rounds, 'round', 'rounds')} · {pct(o.rounds / w.rounds)} of rounds
                    </span>
                    {diff.length > 0 && <span className="block text-[11px] text-gray-500">Differs from #1 in {diff.length <= 3 ? andList(diff) : `${diff.length} slots`}</span>}
                  </span>
                  <span className="hidden @2xl:block text-right">
                    <span className="block font-semibold tabular-nums text-white leading-none">{num(o.rounds)}</span>
                    <span className="block mt-0.5 text-[10px] text-gray-500 tabular-nums">{pct(o.rounds / w.rounds)} of rounds</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="border-t border-white/10 px-3 py-3">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs mb-3">
                      {dates && (
                        <>
                          <dt className="text-gray-400">Worn</dt>
                          <dd className="text-gray-200 tabular-nums">{dates}</dd>
                        </>
                      )}
                      {CLASSES.some((c) => o.byClass[c]) && (
                        <>
                          <dt className="text-gray-400">Classes</dt>
                          <dd className="text-gray-200 tabular-nums">{CLASSES.filter((c) => o.byClass[c]).map((c) => `${c} ${num(o.byClass[c])}`).join(', ')}</dd>
                        </>
                      )}
                    </dl>
                    <ul className="grid gap-1.5 @2xl:grid-cols-2 @2xl:gap-x-6">
                      {pieces.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 min-w-0">
                          <Thumb item={p} className="w-8" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[10px] uppercase tracking-wider text-gray-500">{p.slot}</span>
                            <Name it={p} sub={facts.sub(p)} className="text-xs text-gray-200" />
                          </span>
                          {i > 0 && !leadIds.has(p.id) && <Badge tone="indigo">Not in #1</Badge>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className={`text-xs text-gray-500 ${w.outfits.length ? 'mt-3' : ''}`}>
        {outfitRounds === 0
          ? 'Every round on record lists a piece that is not in your inventory, so no outfit is counted.'
          : `${d === 1 ? '1 outfit' : `${num(d)} different outfits`} in ${plural(outfitRounds, 'round', 'rounds')}.${w.outfits.length === 0 ? ' None was worn in more than one round.' : ''}${
              w.changes != null && d > 0 ? ` Compared with the last round on the same class, the outfit changed ${plural(w.changes, 'time', 'times')}.` : ''
            }`}
      </p>
      <Note>
        An outfit is the exact set of your outfit pieces listed for a round, so one changed piece makes a different outfit and a changed body feature does not.
        {w.uniformRounds > 0 &&
          ` ${plural(w.uniformRounds, 'round lists', 'rounds list')} a piece that is not in your inventory, such as an event uniform, so ${w.uniformRounds === 1 ? 'it counts' : 'they count'} for items but not for outfits.`}
      </Note>
    </Panel>
  );
};

function wardrobeFacts(w, inventory) {
  const wornIds = new Set(w.items.map((e) => e.item.id));
  const listed = new Set(w.slots.map((s) => s.klass));
  const names = new Map();
  const notWorn = new Map();
  const unlisted = new Map();
  const seen = new Set();
  for (const item of inventory.items) {
    if (!item.klass || item.id == null || seen.has(item.id)) continue;
    seen.add(item.id);
    const key = `${item.klass}|${item.name}`;
    names.set(key, (names.get(key) || 0) + 1);
    if (item.group !== 'Outfit' && item.group !== 'Body') continue;
    if (!listed.has(item.klass)) unlisted.set(item.slot, { group: item.group, klass: item.klass, n: (unlisted.get(item.slot)?.n || 0) + 1 });
    else if (!wornIds.has(item.id)) {
      if (!notWorn.has(item.klass)) notWorn.set(item.klass, []);
      notWorn.get(item.klass).push(item);
    }
  }
  for (const list of notWorn.values()) list.sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity) || a.name.localeCompare(b.name));
  return {
    notWorn,
    unlisted: [...unlisted].sort((a, b) => a[0].localeCompare(b[0])),
    sub: (item) => item.detail || (names.get(`${item.klass}|${item.name}`) > 1 && item.asset ? item.asset.replace(/^DA_/, '') : null),
  };
}

export const WardrobeStats = ({ wardrobe: w, inventory }) => {
  const [group, setGroup] = useState('Outfit');

  const facts = useMemo(() => wardrobeFacts(w, inventory), [w, inventory]);

  if (!w.has)
    return (
      <EmptyState icon={Shirt} title="No worn items on record">
        {inventory.hasNames ? 'None of the rounds in this export lists what you wore.' : 'Exports made from September 2026 list what you wore in each round. This one is older.'}
      </EmptyState>
    );
  if (w.items.length === 0)
    return (
      <EmptyState icon={Shirt} title="No worn item is in your inventory">
        Your rounds list what you wore, but none of those items is in your inventory.
      </EmptyState>
    );

  const top = w.outfits[0];
  const groups = Object.keys(GROUPS).filter((g) => w.slots.some((s) => s.group === g));
  const g = groups.includes(group) ? group : groups[0];
  const range =
    w.firstMs != null && w.lastMs != null ? (
      <>
        <span className="whitespace-nowrap">{date(w.firstMs)}</span> to <span className="whitespace-nowrap">{date(w.lastMs)}</span>
      </>
    ) : null;

  return (
    <div className="@container space-y-4">
      <div className="grid grid-cols-2 @2xl:grid-cols-4 gap-4">
        <StatCard label="Rounds on record" value={num(w.rounds)} sub={range ?? `of your ${num(w.totalRounds)} rounds`} />
        <StatCard label="Outfits worn" value={num(w.distinctOutfits)} sub={top ? `most worn in ${num(top.rounds)} rounds` : 'none worn in more than one round'} />
        <StatCard label="Items worn" value={num(w.items.length)} sub={`of ${num(w.ownedWearable)} owned in slots your rounds list`} />
        <StatCard label="Not worn" value={num(w.neverWorn)} sub={`${pct(w.neverWorn / w.ownedWearable)} of those ${num(w.ownedWearable)}`} />
      </div>

      {groups.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Group">
          {groups.map((k) => (
            <button key={k} type="button" aria-pressed={g === k} onClick={() => setGroup(k)} className={pill(g === k)}>
              {GROUPS[k].label}
            </button>
          ))}
        </div>
      )}

      <MostWorn key={g} w={w} facts={facts} group={g} />
      <SlotTable key={`slots-${g}`} w={w} facts={facts} group={g} />
      <Outfits w={w} facts={facts} />

      <Note>
        Worn items come from each round’s <code>CustomizationItemAssetIDs</code>, listed for{' '}
        {w.rounds === w.totalRounds ? `all ${num(w.rounds)} of your rounds` : `${num(w.rounds)} of your ${num(w.totalRounds)} rounds`}. Rounds against bots, on the practice range
        and on preview builds are not counted, so an item worn only there shows as not worn. The export does not say whether a list is the outfit at the start or the end of the round.
      </Note>
    </div>
  );
};
