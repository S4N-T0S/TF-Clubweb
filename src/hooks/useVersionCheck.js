import { useState, useEffect, useRef } from 'react';
import { useVisibility } from './useVisibility';

export const useVersionCheck = (checkIntervalMs = 5 * 60 * 1000) => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  
  const currentVersionRef = useRef(null);
  const lastCheckTimeRef = useRef(0); // 0 ensures it always triggers on the very first check
  
  const isVisible = useVisibility();

  useEffect(() => {
    // Stop all checking if an update is already pending
    if (updateAvailable) return;

    let timeoutId;

    const checkVersion = async () => {
      // Immediately update the timestamp to prevent hot-loops if the fetch fails
      lastCheckTimeRef.current = Date.now(); 
      
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store'
        });

        if (!response.ok) return;

        const data = await response.json();
        const fetchedVersion = data.version;

        if (!currentVersionRef.current) {
          // Establish baseline version
          currentVersionRef.current = fetchedVersion;
        } else if (currentVersionRef.current !== fetchedVersion) {
          // Version has changed
          setUpdateAvailable(true);
        }
      } catch (error) {
        console.error('Failed to check for frontend updates:', error);
      }
    };

    const executeCheckAndScheduleNext = async () => {
      await checkVersion();
      
      // After checking, schedule the next check exactly checkIntervalMs from now
      // (but only if the tab is still visible)
      if (isVisible) {
        timeoutId = setTimeout(executeCheckAndScheduleNext, checkIntervalMs);
      }
    };

    if (isVisible) {
      const now = Date.now();
      const timeSinceLastCheck = now - lastCheckTimeRef.current;

      if (timeSinceLastCheck >= checkIntervalMs) {
        // It's been more than checkIntervalMs since the last check (or it's the first load).
        executeCheckAndScheduleNext();
      } else {
        // They tabbed back in, but it hasn't been checkIntervalMs yet.
        // Calculate the remaining time and schedule the check for then.
        const remainingTime = checkIntervalMs - timeSinceLastCheck;
        timeoutId = setTimeout(executeCheckAndScheduleNext, remainingTime);
      }
    } else if (!currentVersionRef.current) {
      // If the app was opened in a background tab, we must do ONE check 
      // just to get the baseline version. No timers are scheduled.
      checkVersion();
    }

    // Cleanup the timeout if the user tabs out or the component unmounts
    return () => clearTimeout(timeoutId);
    
  }, [isVisible, updateAvailable, checkIntervalMs]);

  return updateAvailable;
};