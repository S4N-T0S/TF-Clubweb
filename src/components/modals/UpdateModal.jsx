import { useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { createPortal } from 'react-dom';
import { UpdateModalProps } from '../../types/propTypes';

export const UpdateModal = ({ isVisible }) => {
  const [countdown, setCountdown] = useState(4);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isVisible) return;

    // Ensure the user cannot interact with the page whilst the update is pending
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    // 1. Start the progress bar animation slightly after mount 
    // to ensure the browser paints 0% first before smoothly transitioning to 100%
    const animationTimer = setTimeout(() => {
      setProgress(100);
    }, 50);

    // 2. Handle the text ticking down (4 -> 3 -> 2 -> 1)
    const textTimer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    // 3. Trigger the actual reload exactly when the 4 seconds are up 
    // and the bar has finished reaching 100%
    const reloadTimer = setTimeout(() => {
      window.location.reload();
    }, 4000);

    return () => {
      clearTimeout(animationTimer);
      clearInterval(textTimer);
      clearTimeout(reloadTimer);
      document.body.style.overflow = 'unset';
      document.body.style.overscrollBehavior = 'unset';
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm p-4 animate-fade-in-fast">
      <div className="bg-gray-800 rounded-2xl p-6 max-w-sm w-full border border-blue-500/50 shadow-2xl flex flex-col items-center text-center">
        <div className="p-4 bg-blue-900/30 rounded-full mb-4">
          <RefreshCcw className="w-8 h-8 text-blue-400 animate-spin" style={{ animationDuration: '4s' }} />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Update Available</h3>
        <p className="text-gray-300 mb-6 text-sm">
          A new version of the application has been released. Refreshing your page to apply the update in {countdown}...
        </p>
        <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-blue-500 h-full ease-linear"
            style={{ 
              width: `${progress}%`,
              transitionDuration: '4s',
              transitionProperty: 'width' 
            }}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

UpdateModal.propTypes = UpdateModalProps;