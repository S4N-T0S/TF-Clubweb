import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Shirt, Crosshair, Smile, User, IdCard, Users, Volume2, Mic, Hand, Clapperboard, Scan, ImageOff, Play, Square, Star } from 'lucide-react';
import { HoverTip } from './ui';
import { ITEM_CLASSES, classHasPictures } from '../lib/itemImages';
import { rarityOf, sponsorOf, when } from '../lib/itemStyle';
import { num, date } from '../lib/format';
import { Pictures, usePictures } from '../context/PicturesContext';

const GROUP_GLYPH = { Outfit: Shirt, Body: User, Weapons: Crosshair, Emotes: Smile, 'Player card': IdCard, Club: Users };
const SLOT_GLYPH = {
  Sound: Volume2, Voice: Mic, Gesture: Hand, Sight: Scan,
  'Inspect animation': Clapperboard, 'Deploy animation': Clapperboard, 'Tactical reload': Clapperboard, 'Empty reload': Clapperboard, 'Cycle action': Clapperboard,
  'Primary animation': Clapperboard, 'Secondary animation': Clapperboard, Animation: Clapperboard,
};
const glyphOf = (it) => (Object.hasOwn(SLOT_GLYPH, it.slot) ? SLOT_GLYPH[it.slot] : Object.hasOwn(GROUP_GLYPH, it.group) ? GROUP_GLYPH[it.group] : Shirt);

const SHARED_ICON = new Set(['Sound', 'Gesture', 'Voice', 'Inspect animation', 'Deploy animation', 'Tactical reload', 'Empty reload', 'Cycle action', 'Primary animation', 'Secondary animation', 'Animation']);
const noPictureReason = (it) =>
  SHARED_ICON.has(it.slot) ? 'The wiki shows this kind with one shared icon, so it has no picture of its own.'
    : it.slot === 'Hair' ? 'Every hair is named “Hair”, so none can be matched to its picture.'
      : Object.hasOwn(ITEM_CLASSES, it.klass) && !classHasPictures(it.klass) ? 'The wiki has no pictures of this kind.'
        : it.slot === 'Card badge' ? 'One badge name covers several tier pictures, so none is chosen.'
          : it.internal ? 'The export names this item with an internal label, which the wiki does not use.'
            : 'No wiki picture fits this item, or more than one does.';

// One per page, around everything that shows a picture. `images` is the page's one useItemImages() result.
export const PicturesProvider = ({ images, children }) => {
  const { status, imageOf, soundOf, retry } = images;
  const [failed, setFailed] = useState(() => new Set());
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(null);
  const audio = useRef(null);
  // One sound bite at a time. Playing the one that is on stops it.
  const play = useCallback((src) => {
    const was = audio.current;
    audio.current = null;
    was?.pause();
    if (was?.dataset.src === src) return setPlaying(null);
    const next = new Audio(src);
    next.dataset.src = src;
    const done = () => {
      if (audio.current !== next) return;
      audio.current = null;
      setPlaying(null);
    };
    next.addEventListener('ended', done);
    next.addEventListener('error', done);
    audio.current = next;
    setPlaying(src);
    next.play().catch(done);
  }, []);
  useEffect(() => () => audio.current?.pause(), []);
  const srcOf = useCallback((it) => (classHasPictures(it.klass) ? imageOf(it) : null), [imageOf]);
  const fail = useCallback((src) => setFailed((s) => (s.has(src) ? s : new Set(s).add(src))), []);
  const forget = useCallback(
    (src) =>
      setFailed((s) => {
        if (!s.has(src)) return s;
        const n = new Set(s);
        n.delete(src);
        return n;
      }),
    []
  );
  const tryAgain = useCallback(() => {
    retry();
    setAttempt((a) => a + 1);
  }, [retry]);
  useEffect(() => {
    const again = () => setAttempt((a) => a + 1);
    window.addEventListener('online', again);
    return () => window.removeEventListener('online', again);
  }, []);
  const value = useMemo(
    () => ({ status, srcOf, soundOf, failed, attempt, fail, forget, tryAgain, playing, play }),
    [status, srcOf, soundOf, failed, attempt, fail, forget, tryAgain, playing, play]
  );
  return <Pictures.Provider value={value}>{children}</Pictures.Provider>;
};

// Stays mounted after an error, so its failure is counted until it leaves the screen or is retried.
const Photo = ({ src, hidden }) => {
  const { fail, forget } = usePictures();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => () => forget(src), [src, forget]);
  return (
    <div className={`absolute inset-0 bg-linear-to-b from-gray-300 to-gray-400 ${hidden ? 'hidden' : ''}`}>
      <img
        src={src}
        alt=""
        width="192"
        height="192"
        decoding="async"
        draggable="false"
        onLoad={() => setLoaded(true)}
        onError={() => fail(src)}
        className={`h-full w-full object-cover transition-opacity duration-200 motion-reduce:transition-none ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
};

// A square that fills its parent's width. Solid wash and glyph means no picture exists, dashed and
// pulsing means the index is loading, dashed with a mark means offline or a failed picture.
export const ItemPicture = ({ item, className = '' }) => {
  const { status, srcOf, soundOf, failed, attempt, playing, play } = usePictures();
  const has = classHasPictures(item.klass);
  const src = has ? srcOf(item) : null;
  const sound = soundOf(item);
  const look = !has ? 'none' : src ? (failed.has(src) ? 'lost' : 'photo') : status === 'loading' ? 'wait' : status === 'offline' ? 'lost' : 'none';
  const Glyph = glyphOf(item);
  const r = rarityOf(item);
  return (
    <div className={`relative aspect-square overflow-hidden bg-gray-900/60 ${className}`}>
      {src && <Photo key={`${src}#${attempt}`} src={src} hidden={look === 'lost'} />}
      {look === 'none' && (
        <div className={`absolute inset-0 grid place-items-center ${r ? r.wash : 'bg-gray-700/30'}`}>
          {sound ? (
            <button
              type="button"
              aria-label={`${playing === sound ? 'Stop' : 'Play'} ${item.name}`}
              aria-pressed={playing === sound}
              onClick={(e) => {
                e.stopPropagation();
                play(sound);
              }}
              className={`grid h-10 w-10 place-items-center rounded-full transition-colors ${playing === sound ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-emerald-600 hover:text-white'}`}
            >
              {playing === sound ? <Square className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
            </button>
          ) : (
            <Glyph className="h-1/3 w-1/3 max-h-10 max-w-10 text-gray-500" strokeWidth={1.5} aria-hidden="true" />
          )}
        </div>
      )}
      {(look === 'wait' || look === 'lost') && (
        <div className={`absolute inset-[6%] grid place-items-center rounded-md border border-dashed border-gray-600 ${look === 'wait' ? 'motion-safe:animate-pulse' : ''}`}>
          <Glyph className="h-1/3 w-1/3 max-h-10 max-w-10 text-gray-600" strokeWidth={1.5} aria-hidden="true" />
          {look === 'lost' && <ImageOff className="absolute bottom-1 right-1 h-3.5 w-3.5 text-gray-500" aria-hidden="true" />}
        </div>
      )}
      {r && <span className={`absolute inset-x-0 bottom-0 h-0.75 ${r.bar}`} />}
    </div>
  );
};

const DETAIL_LABEL = { Hair: 'Style', BodyType: 'Build' };
const range = (a, b) => (date(a) === date(b) ? date(a) : `${date(a)} to ${date(b)}`);

export const ItemCard = ({ item: it }) => {
  const { status, srcOf, failed } = usePictures();
  const has = classHasPictures(it.klass);
  const src = has ? srcOf(it) : null;
  const picture = !has
    ? noPictureReason(it)
    : src ? (failed.has(src) ? 'This picture did not load.' : null)
      : status === 'loading' ? null
        : status === 'offline' ? 'The picture index could not be loaded.'
          : noPictureReason(it);
  const w = it.worn;
  const r = rarityOf(it);
  const rows = [
    [it.equipment ? 'For' : Object.hasOwn(DETAIL_LABEL, it.klass) ? DETAIL_LABEL[it.klass] : 'Detail', it.detail],
    ['Rarity', it.rarity && (
      <span className="inline-flex items-center gap-1.5">
        {r && <span className={`h-2 w-2 rounded-full ${r.bar}`} />}
        {it.rarity}
      </span>
    )],
    ['Level', it.level],
    ['Added in', it.season != null ? `Season ${it.season}` : null],
    ['Sponsor', sponsorOf(it)],
    ['Acquired', when(it)],
    ['Amount', it.amount !== 1 ? num(it.amount) : null],
    ['Favourite in', it.favourite?.packs.join(', ')],
    ['Worn', w ? `${num(w.rounds)} ${w.rounds === 1 ? 'round' : 'rounds'}${w.firstMs != null && w.lastMs != null ? `, ${range(w.firstMs, w.lastMs)}` : ''}` : null],
    ['Embark type', it.label],
  ].filter(([, v]) => v);
  return (
    <div className="text-left">
      <p className={`text-sm font-semibold ${it.internal ? 'break-all font-mono text-gray-400' : 'wrap-break-word text-white'}`}>{it.name}</p>
      <p className="mb-2 text-[11px] text-gray-400">{it.group} · {it.slot}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-gray-400">{k}</dt>
            <dd className="min-w-0 wrap-break-word text-gray-200">{v}</dd>
          </div>
        ))}
      </dl>
      {picture && <p className="mt-2 text-[11px] text-gray-500">{picture}</p>}
    </div>
  );
};

// The whole tile is the tap target. `sub` replaces the third line (the acquired date by default).
export const ItemTile = ({ item: it, sub }) => (
  <HoverTip
    width={264}
    label={`${it.name}, ${it.detail ? `${it.detail}, ` : ''}${it.slot}${it.rarity ? `, ${it.rarity}` : ''}${it.level != null ? `, Level ${it.level}` : ''}${it.favourite ? ', favourite' : ''}${sub ? `, ${sub}` : ''}`}
    tip={<ItemCard item={it} />}
    className="relative block h-full overflow-hidden rounded-lg bg-gray-900/50 transition-colors hover:bg-gray-900/80 focus-visible:outline-2 focus-visible:outline-emerald-500"
  >
    <ItemPicture item={it} />
    {it.level != null && <span className="absolute top-1 left-1 rounded bg-gray-900/85 px-1.5 py-0.5 text-[10px] leading-none font-semibold tabular-nums text-gray-100">Level {it.level}</span>}
    {it.favourite && (
      <span aria-hidden="true" className="absolute top-1 left-1 grid h-5 w-5 place-items-center rounded-full bg-gray-900/80 text-yellow-300 ring-1 ring-black/25">
        <Star className="h-3 w-3" fill="currentColor" />
      </span>
    )}
    <div className="px-1.5 pt-1 pb-1.5 text-left">
      <p className={`line-clamp-2 min-h-8 text-[11px] leading-4 ${it.internal ? 'break-all font-mono text-gray-500' : 'wrap-break-word font-medium text-gray-100'}`}>{it.name}</p>
      <p className="truncate text-[10px] leading-4 text-gray-400">{it.detail ? `${it.detail} · ${it.slot}` : it.slot}</p>
      <p className="truncate text-[10px] leading-4 tabular-nums text-gray-500">{sub ?? when(it)}</p>
    </div>
  </HoverTip>
);
