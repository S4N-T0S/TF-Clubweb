import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, X, Loader2, Info } from 'lucide-react';
import { ToastProps } from '../types/propTypes';

const MAX_ACCEPTABLE_AGE = 30 * 60; // 30 minutes in seconds

const formatMessage = (message) => { // Quick and dirty formatting for messages...
  if (!message || typeof message !== 'string') return message;
  if (!message.includes('\n')) return message;
  
  const [firstLine, ...rest] = message.split('\n');
  return (
    <>
      {firstLine}<br />
      <span className="text-sm">{rest.join('\n')}</span>
    </>
  );
};

const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  const minutes = Math.floor((Date.now() - date) / 1000 / 60);

  if (minutes == 0) return 'now';

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  return date.toLocaleDateString();
};

const formatTtl = (ttl, type) => {
  if (ttl <= 0) return type === 'success' ? 'Up to date!' : 'Retrying...';
  const minutes = Math.ceil(ttl / 60);
  
  if (type === 'success') {
    return minutes === 1 ? 'Update available in 1 minute' : `Update available in ${minutes} minutes`;
  }
  return minutes === 1 ? 'Retrying in 1 minute' : `Retrying in ${minutes} minutes`;
};

const getDataAge = (timestamp) => {
  if (!timestamp) return Infinity;
  return Math.floor((Date.now() - timestamp) / 1000);
};

const Toast = ({ message, type, timestamp, ttl }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [currentMessage, setCurrentMessage] = useState(message);

  // Show toast whenever new message arrives
  useEffect(() => {
    if (message && timestamp) {  // Check for both message and timestamp
      setCurrentMessage(message);
      setIsVisible(true);
      
      // Auto-hide after 2.5 seconds
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [message, timestamp]);

  const dataAge = getDataAge(timestamp);
  const isDataTooOld = dataAge > MAX_ACCEPTABLE_AGE;

  const getBgColor = () => {
    if (type === 'loading') return 'bg-blue-600';
    if (type === 'success') return 'bg-green-600';
    if (type === 'error') return 'bg-red-600';
    if (type === 'warning' && isDataTooOld) return 'bg-red-600';
    if (type === 'warning') return 'bg-orange-500';
    return 'bg-blue-600';
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-white shrink-0" />;
      case 'error':
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-white shrink-0" />;
      case 'loading':
        return <Loader2 className="w-5 h-5 text-white shrink-0 animate-spin" />;
      case 'info':
        return <Info className="w-5 h-5 text-white shrink-0" />;
      default:
        return <Clock className="w-5 h-5 text-white shrink-0" />;
    }
  };

  if (!currentMessage || !isVisible) return null;

  return (
    <div className={`fixed top-4 right-4 z-50 transition-opacity duration-300 ${
      isVisible ? 'opacity-100' : 'opacity-0'
    } max-w-sm`}>
      <div className={`rounded-lg shadow-lg p-4 flex items-center gap-3 ${getBgColor()} text-white`}>
        {getIcon()}
        
        <div className="flex-1 min-w-0">
          <p className="font-medium break-words">
            {isDataTooOld
              ? 'Data is significantly outdated' 
              : formatMessage(currentMessage)}
          </p>
          {type === 'success' || type === 'error' || type === 'warning' ? (
            <>
              {timestamp && (
                <p className="text-white/80 text-sm">Last updated {formatTimestamp(timestamp)}</p>
              )}
              {ttl && (
                <p className="text-white/80 text-sm">{formatTtl(ttl, type)}</p>
              )}
            </>
          ) : null}
        </div>

        <button 
          onClick={() => setIsVisible(false)}
          className="sm:hidden text-white/80 hover:text-white rounded-full hover:bg-white/10 shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

Toast.propTypes = ToastProps;
export default Toast;