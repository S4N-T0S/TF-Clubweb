import { useEffect } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 z-50 animate-fade-in">
      <div className={`rounded-lg shadow-lg p-4 flex items-center gap-2 ${
        type === 'success' ? 'bg-green-600' : 'bg-blue-600'
      }`}>
        {type === 'success' ? (
          <CheckCircle2 className="w-5 h-5 text-white" />
        ) : (
          <AlertCircle className="w-5 h-5 text-white" />
        )}
        <p className="text-white font-medium">{message}</p>
      </div>
    </div>
  );
};

export default Toast;