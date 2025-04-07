import { useState, useEffect, useMemo } from 'react';

export const usePagination = (items, itemsPerPage, isMobile) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ field: null, direction: 'default' });
  const resetSort = () => {
    setSortConfig({ field: null, direction: 'default' });
  };

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Scroll to a specific index new function
  const scrollToIndex = (index) => {
    const targetPage = Math.ceil((index) / itemsPerPage);
    setCurrentPage(targetPage);
    
    setTimeout(() => {
      // For desktop, we need to account for the header row
      // For mobile, we minus 1 because the first row is the column header
      const rowIndex = (index % itemsPerPage) + itemsPerPage - (isMobile && 1);
      
      // Use different selectors for mobile and desktop
      const selector = isMobile ? '[class*="player-row"]' : 'tr';

      const rows = document.querySelectorAll(selector);
      const targetRow = rows[rowIndex];
      
      if (targetRow) {
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetRow.classList.add('highlight-animation');
        setTimeout(() => {
          targetRow.classList.remove('highlight-animation');
        }, 2000);
      }
    }, 100);
  };

  // Handle sort
  const handleSort = (field) => {
    setSortConfig(prevConfig => {
      if (prevConfig.field !== field) {
        return { field, direction: 'asc' };
      }
      
      const nextDirection = 
        prevConfig.direction === 'asc' ? 'desc' :
        prevConfig.direction === 'desc' ? 'default' : 'asc';
      
      return {
        field: nextDirection === 'default' ? null : field,
        direction: nextDirection
      };
    });
  };

  // Memoize filtered and sorted items
  const processedItems = useMemo(() => {
    // First filter
    const filtered = items.filter(item => {
      const searchLower = searchQuery.toLowerCase();
      
      // Handle clan items (items with 'tag' property)
      if ('tag' in item) {
        return item.tag.toLowerCase().includes(searchLower);
      }
      
      // Handle player items
      const displayName = item.clubTag ? `[${item.clubTag}] ${item.name}` : item.name;
      
      return (
        displayName.toLowerCase().includes(searchLower) ||
        (item.steamName && item.steamName.toLowerCase().includes(searchLower)) ||
        (item.psnName && item.psnName.toLowerCase().includes(searchLower)) ||
        (item.xboxName && item.xboxName.toLowerCase().includes(searchLower))
      );
    });

    // Then sort if needed
    if (sortConfig.field && sortConfig.direction !== 'default') {
      return [...filtered].sort((a, b) => {
        let comparison = 0;
        switch (sortConfig.field) {
          case 'season': {
            const seasonOrder = ['OB', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
            comparison = seasonOrder.indexOf(a.season) - seasonOrder.indexOf(b.season);
            break;
          }
          case 'originalRank':
            comparison = a.originalRank - b.originalRank;
            break;
          case 'rank':
            comparison = a.rank - b.rank;
            break;
          case 'tag':
            comparison = a.tag.localeCompare(b.tag);
            break;
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'memberCount':
            comparison = a.memberCount - b.memberCount;
            break;
          case 'totalScore':
            comparison = a.totalScore - b.totalScore;
            break;
          case 'score':
            comparison = a.rankScore - b.rankScore;
            break;
          case 'change':
            comparison = (a.change || 0) - (b.change || 0);
            break;
          default:
            return 0;
        }
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return filtered;
  }, [items, searchQuery, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(processedItems.length / itemsPerPage));
  const currentPage2 = Math.min(currentPage, totalPages);
  const startIndex = (currentPage2 - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = processedItems.slice(startIndex, endIndex);

  const handlePageChange = (newPage) => {
    setCurrentPage(Math.min(Math.max(1, newPage), totalPages));
  };

  return {
    searchQuery,
    setSearchQuery,
    currentItems,
    currentPage: currentPage2,
    totalPages,
    startIndex,
    endIndex,
    handlePageChange,
    filteredItems: processedItems,
    sortConfig,
    handleSort,
    scrollToIndex,
    resetSort
  };
};