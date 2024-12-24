import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';

const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  const minutes = Math.floor((Date.now() - date) / 1000 / 60);
  
  if (minutes < 60) {
    return `${minutes} minutes ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hours ago`;
  }
  return date.toLocaleDateString();
};

const Toast = ({ message, type, onClose, timestamp, ttl }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 z-50 animate-fade-in">
      <div className={`rounded-lg shadow-lg p-4 flex items-center gap-2 ${
        type === 'success' ? 'bg-green-600' : 
        type === 'error' ? 'bg-red-600' :
        'bg-blue-600'
      }`}>
        {type === 'success' ? (
          <CheckCircle2 className="w-5 h-5 text-white" />
        ) : type === 'error' ? (
          <AlertCircle className="w-5 h-5 text-white" />
        ) : (
          <Clock className="w-5 h-5 text-white" />
        )}
        <div className="flex flex-col">
          <p className="text-white font-medium">{message}</p>
          {timestamp && (
            <p className="text-white/80 text-sm">Last updated: {formatTimestamp(timestamp)}</p>
          )}
          {ttl && (
            <p className="text-white/80 text-sm">Retrying in {Math.ceil(ttl / 60)} minutes</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Toast;