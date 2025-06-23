import { Search, X } from 'lucide-react';
import { SearchBarProps } from '../types/propTypes';

export const SearchBar = ({ 
  value, 
  onChange, 
  placeholder = "Search by Embark, Steam, PSN, Xbox, or club tag! e.g: [OG] ttvscruy",
  searchInputRef
}) => {

  const handleSearch = (searchValue) => {
    // No need to clean up the search value here
    onChange(searchValue);
  };

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-5 w-5 text-gray-400" />
      </div>
      <input
        ref={searchInputRef}
        type="text"
        value={value}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={`w-full pl-10 pr-10 py-2 border rounded-lg bg-gray-700 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          value ? 'border-blue-500' : 'border-gray-600'
        }`}
      />
      {value && (
        <button
          type="button"
          onClick={() => handleSearch('')}
          className="absolute inset-y-0 right-0 pr-3 flex items-center hover:text-gray-200 transition-colors"
        >
          <X className="h-5 w-5 text-gray-400" />
        </button>
      )}
    </div>
  );
};

SearchBar.propTypes = SearchBarProps;