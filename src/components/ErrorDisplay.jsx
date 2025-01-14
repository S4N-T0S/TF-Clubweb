import { ErrorDisplayProps } from '../types/propTypes';

export const ErrorDisplay = ({ error, onRetry }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-900">
    <div className="text-center p-8 bg-gray-800 rounded-lg shadow-xl">
      <p className="text-red-400 text-xl">Error: {error}</p>
      <button 
        onClick={onRetry}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Retry
      </button>
    </div>
  </div>
);

ErrorDisplay.propTypes = ErrorDisplayProps;