import { ErrorDisplayProps } from '../types/propTypes';

export const ErrorDisplay = ({ error, onRetry, variant = 'page' }) => {
  const isPage = variant === 'page';

  const containerClass = isPage
    ? "min-h-screen flex items-center justify-center bg-gray-900"
    : "flex items-center justify-center py-8";
    
  const boxClass = isPage 
    ? "text-center p-8 bg-gray-800 rounded-lg shadow-xl"
    : "text-center p-8 bg-gray-800 rounded-lg shadow-xl border border-gray-700";

  const textClass = isPage ? "text-xl" : "text-lg";

  return (
    <div className={containerClass}>
      <div className={boxClass}>
        <p className={`text-red-400 ${textClass}`}>Error: {error}</p>
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    </div>
  );
};

ErrorDisplay.propTypes = ErrorDisplayProps;