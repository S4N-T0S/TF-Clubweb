import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { filterPlayerByQuery } from '../utils/searchUtils';

export const usePagination = (items, itemsPerPage, isMobile, { customSorters = {}, urlSync = false } = {}) => {
  // Always call useSearchParams (hooks must run unconditionally) but only consume it when urlSync is on.
  const [searchParams, setSearchParams] = useSearchParams();
  const [stateCurrentPage, setStateCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ field: null, direction: 'default' });

  // When urlSync, currentPage is derived from the ?page= search param (default 1).
  const urlPageRaw = parseInt(searchParams.get('page'), 10);
  const urlPage = Number.isFinite(urlPageRaw) && urlPageRaw > 0 ? urlPageRaw : 1;
  const currentPage = urlSync ? urlPage : stateCurrentPage;

  // Internal setter. When urlSync, writes ?page=N (or removes it for page 1)
  // while preserving any other query params already in the URL.
  const setPage = (newPage, { replace = false } = {}) => {
    if (urlSync) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (newPage <= 1) next.delete('page');
        else next.set('page', String(newPage));
        return next;
      }, { replace });
    } else {
      setStateCurrentPage(newPage);
    }
  };

  const resetSort = () => {
    setSortConfig({ field: null, direction: 'default' });
  };
  // Filter/season changes call this; use replace so we don't pollute history.
  const resetPage = () => {
    setPage(1, { replace: true });
  };

  // Reset page when search changes. Compares to the previous value (rather
  // than using a boolean "first run" flag) so this is idempotent under
  // React's StrictMode dev double-invocation of effects. Without this,
  // deep-linking to /leaderboard?page=4 would have ?page=4 wiped on mount
  // because StrictMode runs the mount-effect twice.
  const prevSearchQuery = useRef(searchQuery);
  useEffect(() => {
    if (prevSearchQuery.current !== searchQuery) {
      prevSearchQuery.current = searchQuery;
      resetPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Scroll to a specific index new function
  const scrollToIndex = (index) => {
    const targetPage = Math.ceil((index) / itemsPerPage);
    setPage(targetPage, { replace: true });
    
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
        if (customSorters[sortConfig.field]) {
          return customSorters[sortConfig.field](a, b, sortConfig.direction);
        }

        let comparison = 0;
        switch (sortConfig.field) {
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
          case 'averageScore':
            comparison = a.averageScore - b.averageScore;
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
  }, [items, searchQuery, sortConfig, customSorters]);

  const totalPages = Math.max(1, Math.ceil(processedItems.length / itemsPerPage));
  const currentPage2 = Math.min(currentPage, totalPages);
  const startIndex = (currentPage2 - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = processedItems.slice(startIndex, endIndex);

  const handlePageChange = (newPage) => {
    // Use replace for programmatic changes (swipe, scrollToIndex, sort reset etc.)
    // so we don't add a history entry for every flick of the wrist.
    // User clicks on the <Link>-based page buttons go through the browser nav (push).
    setPage(Math.min(Math.max(1, newPage), totalPages), { replace: true });
  };

  // When urlSync is on, return a builder for /current-path?page=N URLs that
  // preserves any other existing search params. Returns null when off so the
  // <Pagination/> component falls back to plain buttons.
  const buildPageHref = !urlSync ? null : (n) => {
    const next = new URLSearchParams(searchParams);
    const clamped = Math.min(Math.max(1, n), totalPages);
    if (clamped <= 1) next.delete('page');
    else next.set('page', String(clamped));
    const qs = next.toString();
    return { search: qs ? `?${qs}` : '' };
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
    buildPageHref,
    filteredItems: processedItems,
    sortConfig,
    handleSort,
    scrollToIndex,
    resetSort,
    resetPage
  };
};