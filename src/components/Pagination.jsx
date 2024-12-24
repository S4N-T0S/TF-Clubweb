export const Pagination = ({ 
    currentPage, 
    totalPages, 
    startIndex, 
    endIndex, 
    totalItems, 
    onPageChange 
  }) => {
    const handleLastPage = () => {
      onPageChange(totalPages);
      window.scrollTo(0, document.body.scrollHeight);
    };
  
    return (
      <div className="mt-4 flex justify-between items-center">
        <div className="text-sm text-gray-400">
          Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems} results
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onPageChange(1)}
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
            onClick={handleLastPage}
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