import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Trophy,
  Sun, Moon, Sunset, CloudFog, CloudLightning, CloudRain, Wind, Snowflake, Sparkles,
} from 'lucide-react';
import { Badge } from './ui';
import { num, ordinal, cash, compact } from '../lib/format';

// The pieces that render one match, shared by MatchesPage and the Skill Rating
// graph's match modal. Nothing here is page-specific: the filter chips and
// pagination stay in MatchesPage. The style constants live in lib/matchStyle.js
// so this file exports components only.

// One recognizable map photo as the card background. `focus` (object-position)
// frames the shot; the dark overlay keeps foreground text legible. `null` src
// just renders nothing (the plain card shows).
export const MapBg = ({ src, focus = '50% 40%', zoom = 1, overlay = 'bg-gray-900/90' }) =>
  src ? (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {zoom < 1 && (
        <div
          className="absolute inset-0 blur-xl scale-110"
          style={{ backgroundImage: `url("${src}")`, backgroundSize: 'cover', backgroundPosition: focus }}
        />
      )}
      <div
        className="absolute inset-0 bg-no-repeat"
        style={{ backgroundImage: `url("${src}")`, backgroundPosition: focus, backgroundSize: zoom === 1 ? 'cover' : `${zoom * 100}% auto` }}
      />
      <div className={`absolute inset-0 ${overlay}`} />
    </div>
  ) : null;

// Time/weather modifier shown as an icon instead of swapping the whole photo.
const COND_ICON = {
  day: Sun, night: Moon, sunset: Sunset, fog: CloudFog,
  storm: CloudLightning, rain: CloudRain, sandstorm: Wind, snow: Snowflake, event: Sparkles,
};
export const ConditionTag = ({ type, label, className = '' }) => {
  if (!label) return null;
  const Icon = COND_ICON[type];
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      {label}
    </span>
  );
};

// One item you got kills with (weapon, gadget or spec). The wiki icons carry a
// light in-game "card" backdrop, so we show them as small rounded tiles — that
// reads as a deliberate weapon card rather than a white box on the dark UI.
const KillTile = ({ it }) => (
  <li className="flex items-center gap-2.5 text-xs">
    <span className="w-9 h-9 rounded-md overflow-hidden bg-linear-to-b from-gray-300 to-gray-400 ring-1 ring-black/25 flex items-center justify-center shrink-0">
      {it.icon ? (
        <img src={it.icon} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[8px] text-gray-700 text-center leading-tight px-0.5">{it.name}</span>
      )}
    </span>
    <span className="flex-1 min-w-0">
      <span className="text-gray-100 block truncate">{it.name}</span>
      {it.type && it.type !== 'Weapon' && it.type !== 'Event' && (
        <span className="text-[10px] text-gray-500 uppercase tracking-wide">{it.type}</span>
      )}
    </span>
    <span className="text-white font-semibold tabular-nums">{it.kills}</span>
  </li>
);

// Hover (or tap) the K/D to see what you got kills with — for a single round or
// a whole match. Rendered in a portal so the card's overflow-hidden / rounded
// corners can't clip it.
export const KillsTooltip = ({ items, label, children }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left + r.width / 2, y: r.top });
  };
  // Dismiss on scroll / resize / outside tap (the fixed tooltip would otherwise
  // float away on scroll, and a tap-opened one needs an outside-tap to close).
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);
  return (
    <div
      ref={ref}
      className="cursor-help"
      onMouseEnter={() => {
        place();
        setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        place();
        setOpen((o) => !o);
      }}
    >
      {children}
      {open &&
        pos &&
        createPortal(
          <div
            style={{ position: 'fixed', left: pos.x, top: pos.y - 10, transform: 'translate(-50%, -100%)', zIndex: 90 }}
            className="pointer-events-none w-60 rounded-xl bg-gray-900/98 border border-gray-700 shadow-2xl p-3"
          >
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">{label}</p>
            {items?.length ? (
              <ul className="space-y-1.5">
                {items.map((it) => (
                  <KillTile key={it.id} it={it} />
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">No kills recorded.</p>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

// What the tournament moved your ranked score by, and what every other finish
// would have paid. Ranked only, and only since the log existed, so callers skip
// the strip rather than render a zero.
export const RankDeltaRow = ({ ru }) => {
  // `|| 0` normalises -0, which formats as "-0".
  const sign = (v) => `${v > 0 ? '+' : ''}${num(v || 0)}`;
  return (
    <div className="relative px-3 py-2 rounded-lg bg-gray-950/45">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[10px] uppercase tracking-wider text-gray-400">Rank score</p>
        <span className="text-sm font-semibold text-gray-100 tabular-nums">
          {num(ru.before)} <span className="text-gray-400">→</span> {num(ru.after)}
        </span>
        <span className={`text-sm font-bold tabular-nums ${ru.delta > 0 ? 'text-emerald-300' : ru.delta < 0 ? 'text-red-300' : 'text-gray-400'}`}>
          {sign(ru.delta)}
        </span>
        {ru.bonusKind === 'performance' && (
          <span
            className="text-[10px] text-emerald-300/80 border-b border-dotted border-emerald-500/40 cursor-help"
            title="More than the flat value of your placement. From Season 11 the game tops each result up based on how you personally performed, so this is the part your own play earned rather than where your team finished."
          >
            incl. {sign(ru.bonus)} for your play
          </span>
        )}
        {ru.bonusKind === 'adjustment' && (
          <span
            className="text-[10px] text-sky-300/80 border-b border-dotted border-sky-500/40 cursor-help"
            title="Your score moved this much in your favour beyond what the placement alone was worth, outside the seasons and ranks where the performance bonus pays — every case we've seen softened a loss. The game does correct matches a cheater affected, which is the usual reason, but the export never records why, so this is the amount, not the cause."
          >
            incl. {sign(ru.bonus)} adjustment
          </span>
        )}
        {ru.penalty < 0 && (
          <span
            className="text-[10px] text-red-300/80 border-b border-dotted border-red-500/40 cursor-help"
            title="Deducted on top of the placement value, e.g. for leaving a match early."
          >
            incl. {num(ru.penalty)} penalty
          </span>
        )}
        {ru.adjusted === 'reverted' && (
          <Badge tone="red">
            <span title="The server later rolled this result back. Your season total already accounts for it.">Reverted</span>
          </Badge>
        )}
        {ru.adjusted === 'penalty' && (
          <Badge tone="red">
            <span title="A penalty applied to this match, e.g. for leaving early.">Penalty</span>
          </Badge>
        )}
        {!ru.ladder && (
          <span
            className="text-[10px] text-gray-500 border-b border-dotted border-gray-600 cursor-help"
            title="This match records the points change without what each finishing place was worth. The game only started recording that in Season 6, and the odd later match is missing it too."
          >
            no placement values
          </span>
        )}
      </div>
      {ru.ladder && (
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 mt-2">
          {ru.ladder.map((slot, i) => (
            <div
              key={i}
              className={`text-center rounded px-1 py-0.5 ${slot.mine ? 'bg-emerald-500/15 ring-1 ring-emerald-400/50' : ''}`}
            >
              <p className={`text-[9px] uppercase ${slot.mine ? 'text-emerald-300' : 'text-gray-500'}`}>{ordinal(i + 1)}</p>
              <p className={`text-[11px] font-semibold tabular-nums ${slot.mine ? 'text-white' : slot.rp > 0 ? 'text-emerald-300/70' : slot.rp < 0 ? 'text-red-300/70' : 'text-gray-400'}`}>
                {sign(slot.rp)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// One bracket round inside an expanded tournament. The map is constant across a
// tournament (shown once on the card), so a round highlights what VARIES: the
// time/weather, the layout, the weapon used, placement, cashout and combat.
export const RoundRow = ({ r }) => (
  <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3 px-3 py-2 rounded-lg bg-gray-950/45">
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap text-sm font-semibold text-gray-100">
        <span>{r.stageLabel}</span>
        {r.tournamentWon && (
          <Badge tone="yellow">
            <Trophy className="w-3 h-3" />Won
          </Badge>
        )}
        {r.backfill && <span className="text-[10px] font-normal text-gray-400">joined in progress</span>}
        {r.disconnected && <span className="text-[10px] font-normal text-red-300">disconnected</span>}
        <span className="ml-auto sm:hidden inline-flex items-center gap-2 text-xs font-normal text-gray-300">
          <ConditionTag type={r.condType} label={r.condition} />
          {r.layout && <span className="text-gray-400">{r.layout.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>}
        </span>
      </div>
      <div className="hidden sm:flex text-xs text-gray-300 mt-0.5 items-center gap-2 flex-wrap">
        <ConditionTag type={r.condType} label={r.condition} />
        {r.layout && <span className="text-gray-400">· {r.layout.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>}
      </div>
    </div>
    <div className="flex items-center justify-between sm:justify-end gap-2 gap-y-1 sm:gap-6 flex-wrap shrink-0 text-right">
      <div className="w-12 sm:w-16">
        <p className="text-[10px] uppercase text-gray-400">Place</p>
        <p className={`text-sm font-semibold ${r.roundWon ? 'text-emerald-300' : 'text-gray-100'}`}>
          {r.position != null ? `${ordinal(r.position)} / ${r.stageTeams}` : '—'}
        </p>
      </div>
      <div className="w-16 sm:w-20">
        <p className="text-[10px] uppercase text-gray-400">Cashout</p>
        <p className="text-sm font-semibold text-white">{cash(r.currency)}</p>
      </div>
      <div className="w-12">
        <p className="text-[10px] uppercase text-gray-400">Dmg</p>
        <p className="text-sm font-semibold text-gray-100 tabular-nums">{compact(r.damage)}</p>
      </div>
      <div className="w-9">
        <p className="text-[10px] uppercase text-gray-400">Rev</p>
        <p className="text-sm font-semibold text-gray-100 tabular-nums">{r.revives}</p>
      </div>
      <KillsTooltip items={r.weaponKills} label="Killed with">
        <div className="w-12 sm:w-14">
          <p className="text-[10px] uppercase text-gray-400">K / D</p>
          <p className="text-sm font-semibold text-gray-100 tabular-nums underline decoration-dotted decoration-gray-500 underline-offset-2">
            {r.kills}/{r.deaths}
          </p>
        </div>
      </KillsTooltip>
    </div>
  </div>
);
