import { useState, useEffect, useMemo } from 'react';
import { filterPlayerByQuery } from '../utils/searchUtils';

export const usePagination = (items, itemsPerPage, isMobile) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ field: null, direction: 'default' });
  const resetSort = () => {
    setSortConfig({ field: null, direction: 'default' });
  };
  const resetPage = () => {
    setCurrentPage(1);
  };

  // Reset page when search changes
  useEffect(() => {
    resetPage();
  }, [searchQuery]);

  // Scroll to a specific index new function
  const scrollToIndex = (index) => {
    const targetPage = Math.ceil((index) / itemsPerPage);
    setCurrentPage(targetPage);
    
    setTimeout(() => {
      // For desktop, we account for the header row.
      // For mobile, we don't need an offset as each item is distinct.
      const rowIndex = (index % itemsPerPage) + itemsPerPage - (isMobile && 1);
      
      // Revert to older selectors
      const selector = isMobile ? '[class*="player-row"]' : 'tr';

      const rows = document.querySelectorAll(selector);
      const targetRow = rows[rowIndex];
      
      if (targetRow) {
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetRow.classList.add('highlight-animation');
        setTimeout(() => {
          targetRow.classList.remove('highlight-animation');
        }, 2000);
      } else {
        console.warn(`Could not find row at index ${rowIndex} to scroll to.`);
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
    const filtered = items.filter(item => {
      // Handle player items (items with 'name' property) - This is for GlobalView
      if (item.name) {
        return filterPlayerByQuery(item, searchQuery);
      }

      // Handle club list items (items with 'tag' property) - This is for a different view
      if ('tag' in item) {
        // Sanitize the query by removing any brackets for this specific search type.
        const sanitizedQuery = searchQuery.toLowerCase().replace(/[[\]]/g, '');
        return item.tag.toLowerCase().includes(sanitizedQuery);
      }
      
      // If the item doesn't match known filterable structures (e.g., it's an event),
      // let it pass through. The consuming component (EventsView) handles its own filtering.
      return true;
    });

    // Then sort if needed
    if (sortConfig.field && sortConfig.direction !== 'default') {
      return [...filtered].sort((a, b) => {
        let comparison = 0;
        switch (sortConfig.field) {
          case 'season': {
            const seasonOrder = ['OB', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'];
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
    resetSort,
    resetPage
  };
};