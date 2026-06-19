import { CalendarClock } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { date } from '../lib/format';

// A persistent reminder that the dashboard is a point-in-time snapshot, not live
// data — so a banned/inactive player doesn't think it's still updating. The "as
// of" date is whichever is later: the SAR request date (from the README pdf name,
// see lib/ingest.js) or the player's last recorded activity (see model meta).
function freshnessMessage(snap) {
  const asOf = date(snap.asOfMs);
  if (snap.asOfSource === 'request') {
    return `Snapshot, not live data — accurate as of your data request (${snap.requestLabel || asOf}).`;
  }
  // Last activity is the more recent bound.
  if (snap.requestLabel) {
    return `Snapshot, not live data — accurate to your last activity (${asOf}); data requested ${snap.requestLabel}.`;
  }
  return `Snapshot, not live data — accurate as of your last recorded activity (${asOf}).`;
}

export const DataFreshnessBanner = () => {
  const { model } = useVaultData();
  const snap = model?.meta?.snapshot;
  if (!snap || snap.asOfMs == null) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-slate-900/70 border-b border-slate-700/50 text-slate-300 text-xs py-1.5 px-4">
      <CalendarClock className="w-3.5 h-3.5 shrink-0" />
      <span>{freshnessMessage(snap)}</span>
    </div>
  );
};
