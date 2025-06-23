import { useCallback, useEffect, useRef, useState } from 'react';
import { Hexagon } from './icons/Hexagon';

// Added hex values for creating a CSS gradient for the track
const leagues = [
  { name: 'Bronze', short: 'B', color: 'bg-amber-700', textColor: 'text-amber-700', hex: '#b45309' },
  { name: 'Silver', short: 'S', color: 'bg-gray-400', textColor: 'text-gray-300', hex: '#d1d5db' },
  { name: 'Gold', short: 'G', color: 'bg-yellow-400', textColor: 'text-yellow-400', hex: '#facc15' },
  { name: 'Platinum', short: 'P', color: 'bg-cyan-300', textColor: 'text-cyan-300', hex: '#67e8f9' },
  { name: 'Diamond', short: 'D', color: 'bg-blue-400', textColor: 'text-blue-400', hex: '#60a5fa' },
  { name: 'Ruby', short: 'R', color: 'bg-red-600', textColor: 'text-red-600', hex: '#dc2626' },
];
const NUM_STEPS = leagues.length - 1;

// Helper to create the gradient background style for the slider track
const getTrackBackgroundStyle = (minValue) => {
  const selectedLeagues = leagues.slice(minValue);
  if (selectedLeagues.length <= 1) {
    return { background: leagues[minValue].hex };
  }
  const colors = selectedLeagues.map(l => l.hex);
  return {
    background: `linear-gradient(to right, ${colors.join(', ')})`,
  };
};

export const LeagueRangeSlider = ({ value, onChange }) => {
  const trackRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const getPercentage = (val) => (val / NUM_STEPS) * 100;
  const handlePos = getPercentage(value);

  const handleDrag = useCallback((event) => {
    if (!isDragging || !trackRef.current) return;

    if (event.cancelable) event.preventDefault();

    const trackRect = trackRef.current.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const relativeX = clientX - trackRect.left;
    const percentage = Math.max(0, Math.min(100, (relativeX / trackRect.width) * 100));
    const newValue = Math.round((percentage / 100) * NUM_STEPS);
    
    onChange(newValue);
  }, [isDragging, onChange]);

  const stopDrag = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('touchmove', handleDrag, { passive: false });
      window.addEventListener('mouseup', stopDrag);
      window.addEventListener('touchend', stopDrag);
    }
    return () => {
      document.body.style.userSelect = 'auto';
      document.body.style.cursor = 'default';
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('touchmove', handleDrag);
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchend', stopDrag);
    };
  }, [isDragging, handleDrag, stopDrag]);
  
  const currentLeague = leagues[value];

  return (
    <div className="flex flex-col space-y-4 pt-1 px-1">
      {/* Current Selection Display */}
      <div className="flex items-center justify-between text-sm bg-gray-900 px-3 py-2 rounded-md">
        <span className="text-gray-300">Minimum Rank</span>
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${currentLeague.textColor}`}>{currentLeague.name}</span>
          <Hexagon className={`${currentLeague.textColor} w-4 h-4`} />
        </div>
      </div>

      {/* Slider component */}
      <div className="relative flex items-center h-10">
        <div ref={trackRef} className="relative w-full h-2 rounded-full bg-gray-700 mx-2">
          {/* Active part of the track (from handle to end) */}
          <div 
            className="absolute h-full rounded-full"
            style={{
              left: `${handlePos}%`,
              width: `${100 - handlePos}%`,
              ...getTrackBackgroundStyle(value)
            }}
          />
          
          {/* Clickable points for each league step */}
          <div className="absolute w-full h-full flex justify-between items-center">
            {leagues.map((_, index) => (
                <button
                    key={index}
                    onClick={() => onChange(index)}
                    className="w-4 h-4 rounded-full flex items-center justify-center"
                    aria-label={`Set minimum league to ${leagues[index].name}`}
                >
                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full group-hover:bg-white transition-colors"></div>
                </button>
            ))}
          </div>

          {/* Slider Handle */}
          <button
            onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
            onTouchStart={() => setIsDragging(true)}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 flex items-center justify-center rounded-full ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 ${currentLeague.textColor.replace('text', 'focus:ring')}`}
            style={{ left: `${handlePos}%`, zIndex: 10 }}
            aria-label={`Minimum league: ${currentLeague.name}`}
          >
            <Hexagon className={`${currentLeague.textColor} w-6 h-6 drop-shadow-md`} />
          </button>
        </div>
      </div>
    </div>
  );
};