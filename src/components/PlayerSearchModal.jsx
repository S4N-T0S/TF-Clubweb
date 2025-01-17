import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, AlertTriangle, X } from 'lucide-react';
import { searchPlayerHistory } from '../services/historicalDataService';
import { Hexagon } from './icons/Hexagon';
import { getLeagueInfo } from '../utils/leagueUtils';
import { useMobileDetect } from '../hooks/useMobileDetect';
import { PlayerSearchModalProps } from '../types/propTypes';

const PlayerSearchModal = ({ isOpen, onClose, initialSearch, cachedS5Data }) => {
  const [searchState, setSearchState] = useState({
    query: '',
    results: [],
    isSearching: false,
    error: '',
    suggestions: []
  });
  
  const modalRef = useRef(null);
  const inputRef = useRef(null);
  const isMobile = useMobileDetect();

  // Simple Embark ID validation
  const isValidEmbarkId = (id) => /^.+#\d{4}$/.test(id);
  const isPartialEmbarkId = (id) => id.length >= 1;

  const handleSearch = useCallback(async (queryInput) => {
    const query = (queryInput || searchState.query).trim();
    
    if (!isValidEmbarkId(query)) {
      setSearchState(prev => ({
        ...prev,
        error: 'Please enter a valid Embark ID (must include # followed by 4 numbers)',
        isSearching: false
      }));
      return;
    }

    setSearchState(prev => ({
      ...prev,
      isSearching: true,
      error: '',
      suggestions: []
    }));

    try {
      const results = await searchPlayerHistory(query, cachedS5Data);
      setSearchState(prev => ({
        ...prev,
        results,
        isSearching: false,
        query
      }));
    } catch {
      setSearchState(prev => ({
        ...prev,
        error: 'Failed to search player history',
        isSearching: false
      }));
    }
  }, [cachedS5Data]);

  const handleClose = useCallback(() => {
    setSearchState({
      query: '',
      results: [],
      isSearching: false,
      error: '',
      suggestions: []
    });
    onClose();
  }, [onClose]);

  const updateSuggestions = useCallback((query) => {
    if (!cachedS5Data || !isPartialEmbarkId(query)) {
      setSearchState(prev => ({ ...prev, suggestions: [] }));
      return;
    }
  
    const lowercaseQuery = query.toLowerCase();
    const matchingPlayers = cachedS5Data
      .filter(player => 
        player.name && player.name.toLowerCase().includes(lowercaseQuery)
      )
      .slice(0, 5)
      .map(player => ({
        ...player,
        displayRank: player.league || 'Unknown'
      }));
  
    setSearchState(prev => ({
      ...prev,
      suggestions: matchingPlayers
    }));
  }, [cachedS5Data]);

  const handleInputChange = (e) => {
    const newQuery = e.target.value;
    setSearchState(prev => ({ 
      ...prev, 
      query: newQuery,
      error: ''
    }));
    updateSuggestions(newQuery);
  };

  const handleSuggestionClick = (suggestion) => {
    handleSearch(suggestion.name);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (searchState.suggestions.length > 0) {
        handleSearch(searchState.suggestions[0].name);
      } else {
        handleSearch(searchState.query);
      }
    }
  };

  useEffect(() => {
    if (isOpen && initialSearch) {
      setSearchState(prev => ({ ...prev, query: initialSearch }));
      handleSearch(initialSearch);
    } else if (!isOpen) {
      // Clear state when modal closes
      setSearchState({
        query: '',
        results: [],
        isSearching: false,
        error: '',
        suggestions: []
      });
    }
  }, [isOpen, initialSearch, handleSearch]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      if (initialSearch) {
        setSearchState(prev => ({ ...prev, query: initialSearch }));
        handleSearch(initialSearch);
      } else {
        setSearchState(prev => ({
          ...prev,
          query: '',
          results: [],
          isSearching: false,
          error: '',
          suggestions: []
        }));
        // Clear any previous results but keep the component ready for new input
        if (inputRef.current && !isMobile) {
          inputRef.current.focus();
        }
      }
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, initialSearch, handleSearch, isMobile, handleClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-gray-800 rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4
          scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Player History Search</h2>
          <button 
            onClick={handleClose}
            className="sm:hidden p-2 hover:bg-gray-700 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="mb-4 p-4 bg-gray-700 rounded-lg text-gray-300">
          <p>This tool searches for players across Open Beta and Seasons 1-5. When you enter an Embark ID, it will find any associated Steam, Xbox, or PSN usernames from these records and show all results linked to those accounts.</p>
        </div>

        <div className="relative">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={searchState.query}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="Enter Embark ID (e.g. 00#0000)"
              className={`flex-1 px-4 py-2 bg-gray-700 border rounded-lg text-white
                ${searchState.error ? 'border-red-500' : 'border-gray-600 focus:border-blue-500'}`}
            />
            <button
              onClick={() => handleSearch(searchState.query)}
              disabled={searchState.isSearching}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50
                flex items-center justify-center"
            >
              <Search className={`w-5 h-5 ${searchState.isSearching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {searchState.suggestions.length > 0 && (
            <div className="absolute z-10 w-full bg-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto mt-1">
              {searchState.suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.name}-${index}`}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full px-4 py-2 text-left hover:bg-gray-600 flex justify-between items-center"
                >
                <span className="text-white">{suggestion.name}</span>
                <span className="text-gray-300">{suggestion.displayRank}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {searchState.error && (
          <div className="mt-4 p-3 bg-red-900 bg-opacity-20 border border-red-700 rounded-lg text-red-400">
            {searchState.error}
          </div>
        )}

        <div className="mt-6 grid gap-4">
          {searchState.results.length === 0 && !searchState.error && !searchState.isSearching && (
            <div className="p-4 bg-gray-700 rounded-lg text-gray-300 text-center">
              No results found
            </div>
          )}

          {searchState.results.map((result, index) => (
            <div 
              key={`${result.season}-${index}`}
              className={`p-4 bg-gray-700 rounded-lg hover:bg-gray-650 transition-colors
                ${result.foundViaSteamName ? 'border-2 border-yellow-500' : ''}`}
            >
              <div className="flex justify-between items-start mb-3">
                <span className="text-lg font-medium text-blue-400">{result.season}</span>
                {result.rank && (
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-gray-300 ${result.isTop500 ? 'border-2 border-red-500 rounded px-2' : ''}`}>
                      Rank #{result.rank}
                    </span>
                    {!result.name && (
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <span className="text-xs text-red-400">
                          Platform-specific leaderboard rank
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2 text-gray-300">
                {result.name && <p>Embark ID: {result.name}</p>}
                {result.steamName && (
                  <div className="flex items-center gap-2">
                    <p>Steam: {result.steamName}</p>
                    {result.foundViaSteamName && (
                      <div className="relative group">
                        <AlertTriangle className="w-4 h-4 text-yellow-400" />
                        <span className="absolute hidden group-hover:block bg-gray-900 text-white px-2 py-1 rounded -mt-8 ml-4">
                          Steam names are not unique, this could be a different user.
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {result.psnName && <p>PSN: {result.psnName}</p>}
                {result.xboxName && <p>Xbox: {result.xboxName}</p>}
                
                <div className="mt-3 pt-3 border-t border-gray-600 flex items-center gap-2">
                  <Hexagon className={getLeagueInfo(null, result.league).style} />
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
      </div>
    </div>
  );
};

PlayerSearchModal.propTypes = PlayerSearchModalProps;

export default PlayerSearchModal;