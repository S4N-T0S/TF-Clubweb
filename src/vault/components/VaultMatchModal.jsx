import { X, Trophy, MapPin } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useVaultModal } from '../hooks/useVaultModal';
import { MapBg, ConditionTag, KillsTooltip, RankDeltaRow, RoundRow } from './MatchParts';
import { OVER_PHOTO, categoryTone, ARCH_TONE } from '../lib/matchStyle';
import { Badge } from './ui';
import { num, decimal, duration, dateTime, cash, compact } from '../lib/format';

// One match, opened from a point on the graph. Built from MatchParts rather than
// restating the Match history card, so the two can't drift apart. The rounds are
// always expanded here: the click already picked out this one match.
export const VaultMatchModal = ({ match, onClose }) => {
  const { isActive } = useVaultModal(onClose);
  const m = match;
  const tone = categoryTone[m.mode?.category] || 'gray';
  const mapName = m.mapName || m.map?.display;

  return createPortal(
    <div
      className={`modal-overlay ${isActive ? 'is-active' : ''} fixed inset-0 bg-black/75 flex items-center justify-center z-80 p-0 sm:p-4`}
      role="dialog"
      aria-modal="true"
      aria-label="Match details"
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div className="modal-box relative w-full sm:max-w-3xl bg-gray-800 border border-white/10 rounded-none sm:rounded-lg shadow-2xl flex flex-col max-h-full sm:max-h-[85dvh] overflow-hidden">
        <div className="relative shrink-0">
          <MapBg src={m.mapImage} focus={m.mapFocus} zoom={m.mapZoom} />
          <div className="relative" style={m.mapImage ? OVER_PHOTO : undefined}>
            {/* pr-14 reserves the corner for the absolutely positioned close
                button: without it a wide result like "2nd of 8" runs under it. */}
            <div className="p-4 pr-14 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-semibold">{m.mode?.label}</span>
                  <Badge tone={tone}>{m.mode?.category}</Badge>
                  {!m.mode?.confirmed && <span className="text-[10px] text-gray-400">heuristic</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-300 mt-1 flex-wrap">
                  <span>{dateTime(m.start)}</span>
                  {mapName && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {mapName}
                    </span>
                  )}
                  {!m.isTournament && m.condition && <ConditionTag type={m.rounds[0]?.condType} label={m.condition} />}
                  {m.durationMs != null && <span>{duration(m.durationMs)}</span>}
                  {m.archetypes?.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      {m.archetypes.map((a) => (
                        <Badge key={a} tone={ARCH_TONE[a] || 'gray'}>
                          {a}
                        </Badge>
                      ))}
                    </span>
                  )}
                </div>
              </div>

              <div className="sm:text-right shrink-0">
                {m.isTournament && m.isBracket ? (
                  <div className="flex sm:flex-col items-center sm:items-end gap-2">
                    <div className="flex items-center gap-2">
                      {m.tournamentWon && (
                        <Badge tone="yellow">
                          <Trophy className="w-3 h-3" />Won
                        </Badge>
                      )}
                      {m.placement ? (
                        <span className="text-sm font-semibold text-white">
                          {m.placement.label}
                          {m.placement.of ? ` of ${m.placement.of}` : ''}
                        </span>
                      ) : (
                        <span className="text-sm text-white">{m.stageReachedLabel || 'Tournament'}</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-300">
                      {m.rounds.length} round{m.rounds.length !== 1 ? 's' : ''} · {cash(m.currency)}
                    </span>
                  </div>
                ) : (
                  <div className="flex sm:flex-col items-center sm:items-end gap-2">
                    {m.won ? <Badge tone="emerald">Win</Badge> : <Badge tone="gray">Loss</Badge>}
                    <span className="text-xs text-gray-300">{cash(m.currency)}</span>
                  </div>
                )}
              </div>

            </div>

            <button
              onClick={onClose}
              aria-label="Close match details"
              className="absolute top-3 right-3 p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Whole-match totals. The K/D carries the weapons tooltip, as it
                does on the Match history card. */}
            <div className="px-4 pb-4">
              <KillsTooltip items={m.weaponKills} label="Weapons used">
                <div className="grid grid-cols-5 gap-2 rounded-lg bg-gray-950/45 py-2">
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-gray-300">Kills</p>
                    <p className="text-lg font-bold text-white">{m.kills}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-gray-300">Deaths</p>
                    <p className="text-lg font-bold text-white">{m.deaths}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-gray-300">K/D</p>
                    <p className="text-lg font-bold text-emerald-300 underline decoration-dotted decoration-white/40 underline-offset-4">{decimal(m.kd)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-gray-300">Dmg</p>
                    <p className="text-lg font-bold text-white tabular-nums">{compact(m.damage)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-gray-300">Rev</p>
                    <p className="text-lg font-bold text-white tabular-nums">{num(m.revives)}</p>
                  </div>
                </div>
              </KillsTooltip>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto border-t border-white/10 px-3 py-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 px-1 mb-1">
            {mapName ? `${mapName} · ` : ''}
            {m.rounds.length} round{m.rounds.length !== 1 ? 's' : ''} · total cashout {cash(m.currency)}
          </p>
          {m.rankUpdate && <RankDeltaRow ru={m.rankUpdate} />}
          {m.rounds.map((r, i) => (
            <RoundRow key={r.matchId ? `${r.matchId}-${i}` : i} r={r} />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};
