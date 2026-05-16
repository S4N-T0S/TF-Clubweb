import { Search, X } from 'lucide-react';
import { SearchBarProps } from '../types/propTypes';
import { useState, useEffect, useRef } from 'react';

export const SearchBar = ({ 
  value, 
  onChange, 
  placeholder = "Search by Embark, Steam, PSN, Xbox, or club tag! e.g: [OG] ttvscruy",
  searchInputRef
}) => {
  const [localValue, setLocalValue] = useState(value || '');
  const isFocused = useRef(false);

  useEffect(() => {
    // Only update the local value from external props if the user isn't currently typing.
    // This prevents React Router's asynchronous URL updates from clobbering the input.
    if (!isFocused.current) {
      setLocalValue(value || '');
    }
  }, [value]);

  const handleSearch = (searchValue) => {
    setLocalValue(searchValue);
    onChange(searchValue);
  };

  const clearSearch = () => {
    setLocalValue('');
    onChange('');
    if (searchInputRef?.current) {
      searchInputRef.current.focus();
    }
  };

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-5 w-5 text-gray-400" />
      </div>
      <input
        ref={searchInputRef}
        type="text"
        value={localValue}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => { isFocused.current = true; }}
        onBlur={() => { isFocused.current = false; }}
        placeholder={placeholder}
        autoComplete="off"
        className={`w-full pl-10 pr-10 py-2 border rounded-lg bg-gray-700 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          localValue ? 'border-blue-500' : 'border-gray-600'
        }`}
      />
      {localValue && (
        <button
          type="button"
          onClick={clearSearch}
          className="absolute inset-y-0 right-0 pr-3 flex items-center hover:text-gray-200 transition-colors"
        >
          <X className="h-5 w-5 text-gray-400" />
        </button>
      )}
    </div>
  );
};

SearchBar.propTypes = SearchBarProps;