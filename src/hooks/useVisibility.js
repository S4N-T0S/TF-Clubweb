import { useState, useEffect } from 'react';

// The Page Visibility API is unavailable during SSR and in some older browsers.
// When it's missing report "visible" so that auto-updaters keep running.
const isVisibilitySupported = () =>
  typeof document !== 'undefined' && typeof document.visibilityState === 'string';

export const useVisibility = () => {
  const [isVisible, setIsVisible] = useState(() =>
    isVisibilitySupported() ? document.visibilityState === 'visible' : true
  );

  useEffect(() => {
    // No API support (or SSR) -> stay "visible"; there's nothing to listen to.
    if (!isVisibilitySupported()) return;

    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
};