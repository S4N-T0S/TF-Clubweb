import { Search } from 'lucide-react';
import { SearchBarProps } from '../types/propTypes';
import { useId } from 'react';

export const SearchBar = ({ 
  value, 
  onChange, 
  placeholder = "Search by Embark, Steam, PSN, Xbox, or club tag! e.g: [OG] ttvscruy",
  searchInputRef
}) => {
  const searchId = useId();

  const handleSearch = (searchValue) => {
    // Clean up the search value and pass it to parent
    const trimmedValue = searchValue.trim();
    onChange(trimmedValue);
  };

  return (
    <div className="relative mb-4">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-5 w-5 text-gray-400" />
      </div>
      <input
        id={searchId}
        ref={searchInputRef}
        type="text"
        value={value}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full pl-10 pr-4 py-2 border rounded-lg bg-gray-700 border-gray-600 text-gray-200 focus:outline-none focus:border-blue-500"
      />
    </div>
  );
};

SearchBar.propTypes = SearchBarProps;