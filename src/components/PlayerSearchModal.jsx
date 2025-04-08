import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, AlertTriangle, X, ChevronUp, ChevronDown, Users } from 'lucide-react';
import { searchPlayerHistory } from '../services/historicalDataService';
import { Hexagon } from './icons/Hexagon';
import { PlatformIcons } from './icons/Platforms';
import { getLeagueInfo } from '../utils/leagueUtils';
import { PlayerSearchModalProps } from '../types/propTypes';
import { isValidEmbarkId, formatUsernameForUrl } from '../utils/urlHandler';
import { useModal } from '../context/ModalContext';

const PlayerSearchModal = ({ isOpen, onClose, initialSearch, currentSeasonData, onSearch, isMobile, onClubClick }) => {
  const { setIsModalOpen, modalRef, setOnClose } = useModal();
  const [searchState, setSearchState] = useState({
    query: '',
    results: [],
    isSearching: false,
    error: '',
    suggestions: [],
    selectedIndex: -1
  });
  
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(false);
  const inputRef = useRef(null);
  const initialSearchRef = useRef(false);

  const toggleExplanation = () => {
    setIsExplanationExpanded(!isExplanationExpanded);
  };

  const isPartialEmbarkId = (id) => id.length >= 1;

  const handleSearch = useCallback(async (queryInput, skipUrlUpdate = false) => {
    const query = queryInput.trim();
    
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
      suggestions: [],
      selectedIndex: -1
    }));
  
    try {
      const results = await searchPlayerHistory(query, currentSeasonData);
      setSearchState(prev => ({
        ...prev,
        results,
        isSearching: false,
        query
      }));
      
      // Only update URL if not skipping and not from initial search
      if (!skipUrlUpdate) {
        const formattedQuery = formatUsernameForUrl(query);
        onSearch(formattedQuery);
      }
    } catch {
      setSearchState(prev => ({
        ...prev,
        error: 'Failed to search player history',
        isSearching: false
      }));
    }
  }, [currentSeasonData, onSearch]);

  const handleClose = useCallback(() => {
    setSearchState({
      query: '',
      results: [],
      isSearching: false,
      error: '',
      suggestions: [],
      selectedIndex: -1
    });
    initialSearchRef.current = false;
    onClose();
  }, [onClose]);

  const updateSuggestions = useCallback((query) => {
    if (!currentSeasonData || !isPartialEmbarkId(query)) {
      setSearchState(prev => ({ ...prev, suggestions: [], selectedIndex: -1 }));
      return;
    }
  
    const lowercaseQuery = query.toLowerCase();
    const matchingPlayers = currentSeasonData
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
      suggestions: matchingPlayers,
      selectedIndex: -1
    }));
  }, [currentSeasonData]);

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
    const { suggestions, selectedIndex } = searchState;
    
    if (suggestions.length === 0) {
      if (e.key === 'Enter') {
        handleSearch(searchState.query);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSearchState(prev => ({
          ...prev,
          selectedIndex: (prev.selectedIndex + 1) % suggestions.length
        }));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSearchState(prev => ({
          ...prev,
          selectedIndex: prev.selectedIndex <= 0 
            ? suggestions.length - 1 
            : prev.selectedIndex - 1
        }));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSearch(suggestions[selectedIndex].name);
        } else if (suggestions.length > 0) {
          handleSearch(suggestions[0].name);
        } else {
          handleSearch(searchState.query);
        }
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (isOpen && initialSearch && !initialSearchRef.current) {
      initialSearchRef.current = true;
      setSearchState(prev => ({ ...prev, query: initialSearch }));
      handleSearch(initialSearch, true); // Skip URL update for initial search
    } else if (!isOpen) {
      initialSearchRef.current = false;
      setSearchState({
        query: '',
        results: [],
        isSearching: false,
        error: '',
        suggestions: [],
        selectedIndex: -1
      });
    }
  }, [isOpen, initialSearch, handleSearch]);

  useEffect(() => {
    if (isOpen) {
      setIsModalOpen(isOpen);
      setOnClose(() => handleClose);
    }

    return () => {
      setIsModalOpen(false);
      setOnClose(null);
    };
  }, [isOpen, setIsModalOpen, handleClose, setOnClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-gray-800 rounded-lg p-6 w-full sm:w-2/3 h-[80vh] m-4 flex flex-col"
      >
        <div className="flex-shrink-0">
          <div className="flex items-center mb-4 relative">
            <button 
              onClick={handleClose}
              className="sm:hidden absolute right-0 p-2 hover:bg-gray-700 rounded-lg"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
            <h2 className="text-xl font-bold text-white w-full text-center">Player History Search</h2>
          </div>

          <div className="mb-4">
            <div 
              onClick={toggleExplanation}
              className="p-4 bg-gray-700 rounded-lg text-gray-300 flex justify-between items-center cursor-pointer sm:hidden"
            >
              <span className="text-sm">Tap to view search tool details</span>
              {isExplanationExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
            
            {/* Full explanation visible on desktop, conditional on mobile */}
            <div className={`
              bg-gray-700 rounded-lg text-gray-300 
              ${isMobile 
                ? `${isExplanationExpanded ? 'block' : 'hidden'}` 
                : 'block'
              } p-4 text-sm
            `}>
              <p>This tool searches the leaderboards for Open Beta and Seasons 1-5 using an Embark ID. It identifies any linked Steam, Xbox, or PSN usernames from these records and performs additional searches on those accounts to uncover more associated records. All linked accounts and results are displayed. Note: The autofill feature only works for players in the top 10k, but you can manually enter an Embark ID for inactive players.</p>
            </div>
          </div>

          <div className="relative mb-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={searchState.query}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyPress}
                  placeholder="Enter Embark ID (e.g. 00#0000)"
                  autoComplete="off"
                  className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white
                    ${searchState.error ? 'border-red-500' : 'border-gray-600 focus:border-blue-500'}
                    ${isMobile ? 'text-base' : ''}`}
                />
                {searchState.suggestions.length > 0 && (
                  <div className="absolute z-10 w-full bg-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto mt-1">
                    {searchState.suggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion.name}-${index}`}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className={`w-full px-4 py-2 text-left hover:bg-gray-600 flex justify-between items-center
                          ${index === searchState.selectedIndex ? 'bg-gray-600' : ''}`}
                      >
                        <span className="text-white">{suggestion.name}</span>
                        <span className="text-gray-300">{suggestion.displayRank}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleSearch(searchState.query)}
                disabled={searchState.isSearching}
                className={`
                  px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50
                  flex items-center justify-center
                  ${isMobile ? 'w-16' : ''}
                `}
              >
                <Search className={`w-5 h-5 ${searchState.isSearching ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {searchState.error && (
            <div className="mb-4 p-3 bg-red-900 bg-opacity-20 border border-red-700 rounded-lg text-red-400">
              {searchState.error}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {searchState.results.length === 0 && !searchState.error && !searchState.isSearching && searchState.query && (
              <div className="col-span-1 sm:col-span-2 p-4 bg-gray-700 rounded-lg text-gray-300 text-center">
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
                        Rank #{result.rank.toLocaleString()}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {result.name && (
                      <p title="Embark username" className="flex items-center">
                        <PlatformIcons.Embark />
                        {result.name}
                      </p>
                    )}
                    {result.clubTag && (
                      <p title="Club membership" className="flex items-center">
                        <Users className="w-4 h-4 inline-block mr-1" />
                        <span
                          className="text-blue-400 hover:text-blue-300 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            onClubClick(result.clubTag, result.seasonKey);
                          }}
                        >
                          {result.clubTag}
                        </span>
                      </p>
                    )}
                    {result.steamName && (
                      <div className="flex items-center gap-2">
                        <p title="Steam display name" className="flex items-center">
                          <PlatformIcons.Steam />
                          {result.steamName}
                        </p>
                        {result.foundViaSteamName && (
                          <div className="relative group">
                            <AlertTriangle className="w-4 h-4 text-yellow-400 hover:cursor-help" />
                            <span className="absolute hidden group-hover:block bg-gray-900 text-white px-2 py-1 rounded text-sm -top-10 left-1/2 -translate-x-1/2 z-50 w-48 hover:cursor-help">
                              Steam names are not unique, this could be a different player.
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {result.psnName && (
                      <p title="PSN username" className="flex items-center">
                        <PlatformIcons.PSN />
                        {result.psnName}
                      </p>
                    )}
                    {result.xboxName && (
                      <p title="Xbox username" className="flex items-center">
                        <PlatformIcons.Xbox />
                        {result.xboxName}
                      </p>
                    )}
                  </div>
                  
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
    </div>
  );
};

PlayerSearchModal.propTypes = PlayerSearchModalProps;

export default PlayerSearchModal;