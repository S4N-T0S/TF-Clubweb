import { PaginationProps } from '../types/propTypes';

export const Pagination = ({ 
  currentPage, 
  totalPages, 
  startIndex, 
  endIndex, 
  totalItems, 
  onPageChange,
  scrollRef,
  className = 'mt-4' // default is margin-top 4
}) => {
  const handleScrollToTop = () => {
    if (scrollRef && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleScrollToBottom = () => {
    if (scrollRef && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  };

  return (
    <div className={`flex flex-col sm:flex-row justify-between items-center gap-4 ${className}`}>
      <div className="text-sm text-gray-400 text-center sm:text-left">
        Showing {totalItems === 0 ? 0 : (startIndex + 1).toLocaleString()}-
        {Math.min(endIndex, totalItems).toLocaleString()} of {totalItems.toLocaleString()} results
      </div>
      <div className="flex gap-2 flex-wrap justify-center">
        <button
          onClick={() => { onPageChange(1); handleScrollToTop(); }}
          disabled={currentPage === 1}
          className={`px-3 py-1 rounded ${
            currentPage === 1 
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          First
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={`px-3 py-1 rounded ${
            currentPage === 1 
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`px-3 py-1 rounded ${
            currentPage === totalPages 
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Next
        </button>
        <button
          onClick={() => { onPageChange(totalPages); handleScrollToBottom(); }}
          disabled={currentPage === totalPages}
          className={`px-3 py-1 rounded ${
            currentPage === totalPages 
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Last
        </button>
      </div>
    </div>
  );
};

Pagination.propTypes =  PaginationProps;