import { Hexagon } from './icons/Hexagon';

// Ordered low -> high. Selecting a league sets it as the minimum rank
const leagues = [
  { name: 'Bronze', short: 'B', textColor: 'text-amber-700' },
  { name: 'Silver', short: 'S', textColor: 'text-gray-300' },
  { name: 'Gold', short: 'G', textColor: 'text-yellow-400' },
  { name: 'Platinum', short: 'P', textColor: 'text-cyan-300' },
  { name: 'Diamond', short: 'D', textColor: 'text-[#60a5fa]' },
  { name: 'Ruby', short: 'R', textColor: 'text-red-600' },
];

export const LeagueRangeSlider = ({ value, onChange }) => {
  const current = leagues[value];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm bg-gray-900 px-3 py-2 rounded-md">
        <span className="text-gray-300">Minimum Rank</span>
        {value === 0 ? (
          <span className="font-semibold text-gray-200">All Ranks</span>
        ) : (
          <div className="flex items-center gap-1.5">
            <Hexagon className={`${current.textColor} w-4 h-4`} />
            <span className={`font-semibold ${current.textColor}`}>{current.name}</span>
            <span className="text-gray-500">&amp; up</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Minimum rank">
        {leagues.map((league, index) => {
          const included = index >= value;
          const selected = index === value;
          return (
            <button
              key={league.name}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${league.name} and above`}
              title={`${league.name} and above`}
              onClick={() => onChange(index)}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg border transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500
                ${selected
                  ? 'border-gray-400 bg-gray-700'
                  : 'border-transparent bg-gray-900/40 hover:bg-gray-700/60'}`}
            >
              <Hexagon className={`w-5 h-5 shrink-0 transition-colors ${included ? league.textColor : 'text-gray-600'}`} />
              <span className={`text-xs font-semibold transition-colors ${included ? 'text-gray-200' : 'text-gray-500'}`}>
                {league.short}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
