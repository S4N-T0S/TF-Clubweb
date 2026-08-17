import { createPortal } from 'react-dom';
import { X, Settings, Gem, UserPen, ChevronsUpDown } from 'lucide-react';
import { useVaultModal } from '../hooks/useVaultModal';

// Mirrors the toggle in src/components/modals/GraphModal.jsx, including the
// grayscale/opacity treatment that makes an off filter read as switched off
// rather than merely unselected.
const FilterToggleButton = ({ label, isActive, onClick, Icon, textColorClass, activeBorderClass }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={isActive}
    className={`grow sm:grow-0 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all w-full border ${
      isActive
        ? `${activeBorderClass} bg-gray-800/80 shadow-inner`
        : 'border-gray-700 bg-gray-800/30 hover:bg-gray-700/50 opacity-60 hover:opacity-100 grayscale-[0.5]'
    }`}
  >
    <Icon className={`w-4 h-4 ${isActive ? textColorClass : 'text-gray-400'}`} />
    <span className={`${isActive ? textColorClass : 'text-gray-400'} font-medium`}>{label}</span>
  </button>
);

// The vault's cut of the leaderboard's graph settings: same shell, minus every
// filter whose data doesn't exist here (clubs, bans, the Ruby line, the
// rank/score metric switch). Event colours stay semantic rather than emerald,
// since they mean what they mean on the live graph.
export const VaultGraphSettings = ({ settings, onChange, onClose, nameEventCount, adjustmentCount }) => {
  const { isActive } = useVaultModal(onClose);
  const set = (key) => onChange((prev) => ({ ...prev, [key]: !prev[key] }));

  return createPortal(
    <div
      className={`modal-overlay ${isActive ? 'is-active' : ''} fixed inset-0 bg-black/75 flex items-center justify-center z-80 p-4`}
      role="dialog"
      aria-modal="true"
      aria-label="Graph settings"
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div className="modal-box relative bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-700 shadow-2xl">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-400" />
            Graph Settings
          </h3>
          <button onClick={onClose} aria-label="Close settings" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2.5">Display</h4>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <FilterToggleButton
            label="Leagues"
            Icon={Gem}
            isActive={settings.showLeagueLines}
            onClick={() => set('showLeagueLines')}
            textColorClass="text-blue-400"
            activeBorderClass="border-blue-500/50"
          />
        </div>

        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2.5">Events</h4>
        <div className="grid grid-cols-2 gap-3">
          <FilterToggleButton
            label="Names"
            Icon={UserPen}
            isActive={settings.showNameChanges}
            onClick={() => set('showNameChanges')}
            textColorClass="text-indigo-400"
            activeBorderClass="border-indigo-500/50"
          />
          <FilterToggleButton
            label="Scores"
            Icon={ChevronsUpDown}
            isActive={settings.showAdjustments}
            onClick={() => set('showAdjustments')}
            textColorClass="text-yellow-400"
            activeBorderClass="border-yellow-500/50"
          />
        </div>

        {/* Counts, not a log: the leaderboard's event list exists because it
            merges several players' timelines, and there's only ever one here. */}
        <p className="text-xs text-gray-500 mt-5 leading-relaxed">
          This season has {nameEventCount} name {nameEventCount === 1 ? 'change' : 'changes'} and {adjustmentCount}{' '}
          {adjustmentCount === 1 ? 'adjustment' : 'adjustments'}. Hidden types stay off the graph until you turn them back on.
        </p>
      </div>
    </div>,
    document.body
  );
};
