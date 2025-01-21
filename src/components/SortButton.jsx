import { List, ArrowUpNarrowWide, ArrowDownNarrowWide } from 'lucide-react';
import { SortButtonProps } from '../types/propTypes';

export const SortButton = ({ field, sortConfig, onSort }) => {
  const isActive = sortConfig.field === field;
  
  const icons = {
    default: <List className="w-4 h-4" />,
    asc: <ArrowUpNarrowWide className="w-4 h-4" />,
    desc: <ArrowDownNarrowWide className="w-4 h-4" />
  };

  const getIcon = () => {
    if (!isActive) return icons.default;
    return icons[sortConfig.direction];
  };

  return (
    <button 
      onClick={() => onSort(field)}
      className="ml-2 p-1 hover:bg-gray-600 rounded transition-colors"
    >
      {getIcon()}
    </button>
  );
};

SortButton.propTypes = SortButtonProps;