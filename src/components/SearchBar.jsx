import { Search } from 'lucide-react';

export const SearchBar = ({ value, onChange }) => (
  <div className="relative mb-4">
    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      <Search className="h-5 w-5 text-gray-400" />
    </div>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search players or club tags! Or even both e.g: [OG] ttvscruy"
      className="w-full pl-10 pr-4 py-2 border rounded-lg bg-gray-700 border-gray-600 text-gray-200 focus:outline-none focus:border-blue-500"
    />
  </div>
);