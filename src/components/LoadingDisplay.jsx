import { Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { LoadingDisplayProps } from '../types/propTypes';

const loadingMessages = [
  "Stealing cashout...",
  "Wiping enemy teams...",
  "Preparing destructible environments...",
  "Loading grappling hooks...",
  "Calculating vault locations...",
  "Charge 'N' Slamming the enemies...",
  "Activating thermal vision...",
  "Recruiting contestants...",
  "Buffing server performance...",
  "Counting prize money...",
  "Deleting Kyoto 1568...",
  "Warming up the audience..."
];

export const LoadingDisplay = ({ variant = 'page' }) => {
  const [currentMessage, setCurrentMessage] = useState(
    loadingMessages[Math.floor(Math.random() * loadingMessages.length)]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessage(prevMessage => {
        const currentIndex = loadingMessages.indexOf(prevMessage);
        const nextIndex = (currentIndex + 1) % loadingMessages.length;
        return loadingMessages[nextIndex];
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const isPage = variant === 'page';
  
  const containerClass = isPage 
    ? "min-h-screen flex flex-col items-center justify-center bg-gray-900" 
    : "flex flex-col items-center justify-center py-8";

  const iconClass = isPage ? "w-16 h-16" : "w-12 h-12";
  const textClass = isPage ? "text-lg" : "text-base";

  return (
    <div className={containerClass}>
      <Loader2 className={`${iconClass} animate-spin text-blue-500`} />
      <p className={`mt-4 ${textClass} text-gray-300`}>{currentMessage}</p>
    </div>
  );
};

LoadingDisplay.propTypes =  LoadingDisplayProps;