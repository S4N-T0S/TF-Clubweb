// PlayerSearchModal.jsx

import { useState } from 'react';
import { Search, X, AlertTriangle } from 'lucide-react';
import { validateEmbarkId } from '../utils/validateEmbarkId';
import { searchPlayerHistory } from '../services/historicalDataService';
import { Hexagon } from './icons/Hexagon';
import { getLeagueStyle } from '../utils/styles';

const PlayerSearchModal = ({ isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!validateEmbarkId(searchQuery)) {
      setError('Please enter a valid Embark ID (must include # followed by 4 numbers)');
      return;
    }

    setError('');
    setIsSearching(true);
    setHasSearched(true);

    try {
      const searchResults = await searchPlayerHistory(searchQuery);
      setResults(searchResults);
    } catch (err) {
      setError('Failed to search player history');
    } finally {
      setIsSearching(false);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (error && validateEmbarkId(value)) {
      setError('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Extreme Player History Search</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-4 p-4 bg-gray-700 rounded-lg text-gray-300">
          <p>This tool searches for players across Open Beta and Seasons 1-5. When you enter an Embark ID, it will find any associated Steam, Xbox, or PSN usernames from these records and show all results linked to those accounts.</p>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="Enter Embark ID (e.g. 00#0000)"
                className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white
                  ${error 
                    ? 'border-red-500 focus:border-red-500' 
                    : 'border-gray-600 focus:border-blue-500'}`}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSearching ? (
                <Search className="w-5 h-5 animate-spin" />
              ) : (
                <Search className="w-5 h-5" />
              )}
            </button>
          </div>
          {error && (
            <div className="p-3 bg-red-900 bg-opacity-20 border border-red-700 rounded-lg text-red-400">
              {error}
            </div>
          )}
        </div>

        {hasSearched && !error && results.length === 0 && !isSearching && (
          <div className="p-4 bg-gray-700 rounded-lg text-gray-300 text-center">
            No results found for this Embark ID
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            {results.map((result, index) => (
              <div 
                key={`${result.season}-${index}`}
                className={`p-4 bg-gray-700 rounded-lg ${
                  result.foundViaSteamName ? 'border-2 border-yellow-500' : ''
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-blue-400 font-medium">{result.season}</span>
                  {result.rank && (
                    <span className={`text-gray-300 ${result.isTop500 ? 'border-2 border-red-500 rounded px-2' : ''}`}>
                      Rank #{result.rank}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {result.name && (
                    <p className="text-white">Embark ID: {result.name}</p>
                  )}
                  {result.steamName && (
                    <div className="flex items-center gap-2">
                      <p className="text-gray-300">Steam: {result.steamName}</p>
                      {result.foundViaSteamName && (
                        <div className="relative group">
                          <AlertTriangle className="w-4 h-4 text-yellow-400" />
                          <div className="absolute hidden group-hover:block bg-gray-900 text-white px-2 py-1 rounded -mt-8 ml-4">
                            Steam names are not unique, this could be a different user.
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {result.psnName && (
                    <p className="text-gray-300">PSN: {result.psnName}</p>
                  )}
                  {result.xboxName && (
                    <p className="text-gray-300">Xbox: {result.xboxName}</p>
                  )}
                  
                  <div className="mt-2 pt-2 border-t border-gray-600 flex items-center gap-2">
                    <Hexagon className={getLeagueStyle(result.league, result.rank)} />
                    <div className="flex flex-col">
                      <span className="text-gray-200">{result.league}</span>
                      {result.score && (
                        <span className="text-sm text-gray-400">
                          {result.score.toLocaleString()} points
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerSearchModal;