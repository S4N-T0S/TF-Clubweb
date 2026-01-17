import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, LifeBuoy } from 'lucide-react';
import { ErrorDisplayProps } from '../types/propTypes';

export const ErrorDisplay = ({ error, onRetry, variant = 'page' }) => {
  const [showDetails, setShowDetails] = useState(false);
  const isPage = variant === 'page';

  // Determine container sizing based on variant
  const containerClass = isPage
    ? "min-h-[60vh] flex items-center justify-center p-4"
    : "flex items-center justify-center py-8 px-4";
    
  const boxClass = isPage 
    ? "w-full max-w-lg bg-gray-800 rounded-xl shadow-2xl border border-gray-700 overflow-hidden"
    : "w-full bg-gray-800 rounded-lg border border-gray-700 overflow-hidden";

  // Handle both string errors and Error objects
  const errorMessage = typeof error === 'string' ? error : error?.message || 'An unknown error occurred';
  const errorStack = error?.stack || null;
  const errorContext = error?.context || null;

  // Logic to determine if Technical Details adds value
  // We only show the dropdown if:
  // 1. The message was long enough to be truncated in the header (>= 60 chars)
  // 2. OR there is a stack trace (it's a real code/crash error)
  // 3. OR there is extra context attached
  const isMessageTruncated = errorMessage.length >= 60;
  const hasHiddenDetails = isMessageTruncated || errorStack || errorContext;

  return (
    <div className={containerClass}>
      <div className={boxClass}>
        {/* Header Section */}
        <div className="bg-red-900/20 p-6 flex flex-col items-center text-center border-b border-gray-700">
          <div className="p-3 bg-red-900/30 rounded-full mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Connection Issue</h3>
          <p className="text-gray-300 text-sm mb-6">
             {isMessageTruncated ? "We couldn't load the requested data." : errorMessage}
          </p>
          
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium active:scale-95 transform duration-150"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>

        {/* Footer Section */}
        <div className="bg-gray-800/50 p-4">
            <div className="flex flex-col">
                {/* Contact Hint - Always visible */}
                <div className={`flex items-center justify-center gap-2 text-xs text-gray-500 ${hasHiddenDetails ? 'mb-4' : ''}`}>
                    <LifeBuoy className="w-3 h-3" />
                    <span>If this persists, please contact the admin.</span>
                </div>

                {/* Collapsible Technical Details - Only visible if there is actual extra info */}
                {hasHiddenDetails && (
                  <>
                    <button 
                        onClick={() => setShowDetails(!showDetails)}
                        className={`flex items-center justify-between w-full px-3 py-2 text-xs font-mono text-gray-500 bg-gray-900/50 hover:bg-gray-900 border border-gray-700 transition-colors ${
                          showDetails ? 'rounded-t border-b-0' : 'rounded'
                        }`}
                    >
                        <span>Technical Details</span>
                        {showDetails ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>

                    {showDetails && (
                        <div className="p-3 bg-black/40 rounded-b border border-gray-700 border-t-0 text-left overflow-x-auto">
                            <p className="text-xs text-red-400 font-mono break-words whitespace-pre-wrap">
                                {errorMessage}
                            </p>
                            {errorContext && (
                                <p className="text-xs text-gray-500 font-mono mt-2 border-t border-gray-700 pt-2">
                                    Context: {JSON.stringify(errorContext)}
                                </p>
                            )}
                            {errorStack && (
                                <details className="mt-2 group">
                                    <summary className="text-[10px] text-gray-600 cursor-pointer hover:text-gray-400 list-none flex items-center gap-1">
                                      <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                                      Stack Trace
                                    </summary>
                                    <pre className="text-[10px] text-gray-600 mt-1 whitespace-pre-wrap pl-4">
                                        {errorStack}
                                    </pre>
                                </details>
                            )}
                        </div>
                    )}
                  </>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

ErrorDisplay.propTypes = ErrorDisplayProps;