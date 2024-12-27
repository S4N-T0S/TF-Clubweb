import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Clock, X } from 'lucide-react';

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

const formatTtl = (ttl) => {
  if (ttl <= 0) return 'now';
  const minutes = Math.ceil(ttl / 60);
  return minutes === 1 ? 'in 1 minute' : `in ${minutes} minutes`;
};

const Toast = ({ message, type, onClose, timestamp, ttl }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 z-50 animate-fade-in max-w-[90vw] sm:max-w-md">
      <div className={`rounded-lg shadow-lg p-4 flex items-center gap-3 ${
        type === 'success' ? 'bg-green-600' : 
        type === 'error' ? 'bg-red-600' :
        'bg-blue-600'
      }`}>
        {type === 'success' ? (
          <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
        ) : type === 'error' ? (
          <AlertCircle className="w-5 h-5 text-white shrink-0" />
        ) : (
          <Clock className="w-5 h-5 text-white shrink-0" />
        )}
        
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium break-words">{message}</p>
          {timestamp && (
            <p className="text-white/80 text-sm">Last updated {formatTimestamp(timestamp)}</p>
          )}
          {ttl && (
            <p className="text-white/80 text-sm">Update available {formatTtl(ttl)}</p>
          )}
        </div>

        <button 
          onClick={onClose}
          className="sm:hidden text-white/80 hover:text-white rounded-full hover:bg-white/10 shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default Toast;