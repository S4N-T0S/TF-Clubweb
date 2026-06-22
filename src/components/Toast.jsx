import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, X, Loader2, Info } from 'lucide-react';
import { formatTimeAgo } from '../utils/timeUtils';

const formatTtl = (ttl, type) => {
  // Handle cases where TTL has expired or is zero.
  if (ttl <= 0) {
    if (type === 'success') {
      return 'Checking for update...';
    }
    // Logic to handle the user-facing cooldown message for stale data warnings and errors.
    // This tells the user when they can try fetching fresh data again.
    if (type === 'warning' || type === 'error') {
      return 'Trying again in 2 minutes';
    }
    // A sensible fallback for other types, though unlikely to be used with a zero TTL.
    return 'Retrying...';
  }

  // If TTL is positive, calculate remaining minutes.
  // We convert ttl from seconds to milliseconds for the function.
  const minutes = Math.ceil(ttl / 60);
  const minuteText = minutes === 1 ? '1 minute' : `${minutes} minutes`;
  
  if (type === 'success') {
    return `Will check for update in ${minuteText}`;
  }
  return `Trying again in ${minuteText}`;
};

// Map of toast types to their default properties
const TOAST_TYPE_CONFIG = {
  loading: {
    icon: Loader2,
    iconClassName: 'animate-spin',
    bar: 'bg-blue-500',
    iconChip: 'bg-blue-500/10',
    iconColor: 'text-blue-400'
  },
  success: {
    icon: CheckCircle2,
    bar: 'bg-emerald-500',
    iconChip: 'bg-emerald-500/10',
    iconColor: 'text-emerald-400'
  },
  error: {
    icon: AlertCircle,
    bar: 'bg-red-500',
    iconChip: 'bg-red-500/10',
    iconColor: 'text-red-400'
  },
  warning: {
    icon: AlertCircle,
    bar: 'bg-amber-500',
    iconChip: 'bg-amber-500/10',
    iconColor: 'text-amber-400'
  },
  info: {
    icon: Info,
    bar: 'bg-blue-500',
    iconChip: 'bg-blue-500/10',
    iconColor: 'text-blue-400'
  },
  default: {
    icon: Clock,
    bar: 'bg-blue-500',
    iconChip: 'bg-blue-500/10',
    iconColor: 'text-blue-400'
  }
};

const Toast = ({ 
  message,
  type = 'info',
  timestamp,
  showMeta = false,
  ttl,
  title,
  icon: CustomIcon,
  textSize = 'normal',
  position = 'top-right',
  duration = 2500,
  showCloseButton,
  isMobile,
  onClose
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const effectiveShowClose = showCloseButton ?? isMobile;
  const [currentMessage, setCurrentMessage] = useState(message);
  
  // Text size mapping
  const textSizeClasses = {
    small: 'text-xs',
    normal: 'text-sm',
    large: 'text-base',
    xlarge: 'text-lg'
  };
  
  // Position mapping
  const positionClasses = {
    'top-right': 'top-2 right-2 sm:top-4 sm:right-4',
    'top-left': 'top-2 left-2 sm:top-4 sm:left-4',
    'bottom-right': 'bottom-2 right-2 sm:bottom-4 sm:right-4',
    'bottom-left': 'bottom-2 left-2 sm:bottom-4 sm:left-4',
    'top-center': 'top-2 left-1/2 -translate-x-1/2',
    'bottom-center': 'bottom-2 left-1/2 -translate-x-1/2'
  };

  // Show toast whenever new message arrives
  useEffect(() => {
    if (message) {
      setCurrentMessage(message);
      setIsVisible(true);
      
      // Auto-hide after specified duration
      if (duration !== Infinity) {
        const timer = setTimeout(() => {
          setIsVisible(false);
          if (onClose) onClose();
        }, duration);
  
        return () => clearTimeout(timer);
      }
    }
  }, [message, timestamp, duration, onClose]);

  // Get toast configuration based on type
  const toastConfig = TOAST_TYPE_CONFIG[type] || TOAST_TYPE_CONFIG.default;
  
  // Allow override of default icon with custom icon
  const IconComponent = CustomIcon || toastConfig.icon;

  const handleClose = () => {
    setIsVisible(false);
    if (onClose) onClose();
  };

  if (!currentMessage || !isVisible) return null;

  // Get CSS classes based on configuration
  const textSizeClass = textSizeClasses[textSize] || textSizeClasses.normal;
  const positionClass = positionClasses[position] || positionClasses['top-right'];

  return (
    <div 
      data-toast-container="true"
      className={`fixed ${positionClass} z-60 transition-all duration-300 ease-out ${
        isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95'
      } max-w-[90vw] sm:max-w-sm w-auto`}
    >
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gray-800/95 backdrop-blur-sm shadow-xl shadow-black/40 min-w-40">
        <span aria-hidden="true" className={`pointer-events-none absolute inset-y-0 left-0 w-1 ${toastConfig.bar}`} />

        <div className="flex items-center gap-3 p-4 pl-5">
          <div className={`shrink-0 rounded-lg p-1.5 ${toastConfig.iconChip}`}>
            <IconComponent className={`w-5 h-5 ${toastConfig.iconColor} ${toastConfig.iconClassName || ''}`} />
          </div>

          <div className="flex-1 min-w-0 break-anywhere">
            {title && (
              <p className={`font-semibold text-gray-100 ${textSizeClass} mb-0.5`}>{title}</p>
            )}
            <p className={`${!title ? 'font-medium' : ''} text-gray-200 ${textSizeClass} wrap-break-word`}>
              {currentMessage}
            </p>
            {showMeta && (timestamp || typeof ttl === 'number') ? (
              <div className="mt-1.5 space-y-0.5">
                {timestamp && (
                  <p className="text-gray-400 text-xs">Last updated {formatTimeAgo(timestamp)}</p>
                )}
                {typeof ttl === 'number' && (
                  <p className="text-gray-400 text-xs">{formatTtl(ttl, type)}</p>
                )}
              </div>
            ) : null}
          </div>

          {effectiveShowClose && (
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-white rounded-lg hover:bg-white/10 shrink-0 p-1 self-center flex items-center transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Toast;

/* Complete example of setToastMessage with all available options

  // The main content of the toast notification
  // This can be a simple string or include newlines for multi-line messages
  message: "Your changes have been saved successfully!",
  
  // Type of notification that determines the color scheme and default icon
  // Options: 'success', 'error', 'warning', 'info', 'loading', 'default'
  type: "success",

  // Timestamp is required for unique toast but also used for "Last updated" display
  timestamp: Date.now(),

  // Optional: showMeta is used when providing information and we want to display ttl and timestamp. Defaults to false.
  showMeta: true or false,
  
  // Optional: Add a bold title above the message
  // Useful for emphasizing the purpose or category of the notification
  title: "Changes Saved",
  
  // Optional: Custom icon to override the default icon for the selected type
  // Import and use any icon from lucide-react or other compatible icon libraries
  icon: SaveIcon,
  
  // Optional: Control the text size of the notification message and title
  // Options: 'small', 'normal', 'large', 'xlarge'
  textSize: "normal",
  
  // Optional: Position of the toast on the screen
  // Options: 'top-right', 'top-left', 'bottom-right', 'bottom-left', 'top-center', 'bottom-center'
  position: "top-right",
  
  // Optional: Time in milliseconds before the toast auto-dismisses
  // Set to Infinity to keep the toast visible until manually closed
  duration: 5000,
  
  // Optional: Control whether the close button is displayed
  // Set to false to remove the close button (useful for brief notifications)
  showCloseButton: true or false,
  
  // Optional: Function to call when the toast is closed (either by timeout or manually)
  // Useful for cleanup actions or triggering follow-up processes
  onClose: () => console.log("Toast notification closed"),
  
  // Optional: Time-to-live in seconds for the cached data
  // Used to show when next update should be available from API
  ttl: 600 // 10 minutes
});
*/