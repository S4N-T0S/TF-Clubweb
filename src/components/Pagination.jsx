import { PaginationProps } from '../types/propTypes';

export const Pagination = ({ 
  currentPage, 
  totalPages, 
  startIndex, 
  endIndex, 
  totalItems, 
  onPageChange 
}) => {

  return (
    <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
      <div className="text-sm text-gray-400 text-center sm:text-left">
        Showing {totalItems === 0 ? 0 : (startIndex + 1).toLocaleString()}-
        {Math.min(endIndex, totalItems).toLocaleString()} of {totalItems.toLocaleString()} results
      </div>
      <div className="flex gap-2 flex-wrap justify-center">
        <button
          onClick={() => { onPageChange(1); window.scrollTo(0, 0); }}
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
          onClick={() => { onPageChange(totalPages); window.scrollTo(0, document.body.scrollHeight); }}
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