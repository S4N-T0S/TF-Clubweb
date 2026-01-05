import { Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { LoadingDisplayProps } from '../types/propTypes';

const loadingMessages = [
  "Stealing cashout...",
  "Wiping enemy teams...",
  "Preparing destructible environments...",
  "Equipping comically large spoon...",
  "Popping. Pouring. Performing...",
  "Nerfing the Stun Gun (again)...",
  "Renewing Holtow Sun Insurance...",
  "Checking Scotty's caffeine levels...",
  "Calculating vault locations...",
  "Getting winched by a Heavy...",
  "Charge 'N' Slamming the enemies...",
  "Signing with ISEUL-T...",
  "Reviving teammate in the gas...",
  "Solo-queueing with two Lights...",
  "Activating thermal vision...",
  "Drinking 6 cans of OSPUZE...",
  "Buffing server performance...",
  "Deleting Kyoto 1568...",
  "Whiffing the RPG...",
  "Counting prize money...",
  "Complaining about Light players..."
];

export const LoadingDisplay = ({ variant = 'page', message }) => {
  const [currentMessage, setCurrentMessage] = useState(
    loadingMessages[Math.floor(Math.random() * loadingMessages.length)]
  );

  useEffect(() => {
    // If a specific message is provided, do not rotate messages
    if (message) return;

    const interval = setInterval(() => {
      setCurrentMessage(prevMessage => {
        const currentIndex = loadingMessages.indexOf(prevMessage);
        const nextIndex = (currentIndex + 1) % loadingMessages.length;
        return loadingMessages[nextIndex];
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [message]);

  const isPage = variant === 'page';
  
  const containerClass = isPage 
    ? "min-h-screen flex flex-col items-center justify-center bg-gray-900" 
    : "flex flex-col items-center justify-center py-8";

  const iconClass = isPage ? "w-16 h-16" : "w-12 h-12";
  const textClass = isPage ? "text-lg" : "text-base";

  return (
    <div className={containerClass}>
      <Loader2 className={`${iconClass} animate-spin text-blue-500`} />
      <p className={`mt-4 ${textClass} text-gray-300`}>{message || currentMessage}</p>
    </div>
  );
};

LoadingDisplay.propTypes = LoadingDisplayProps;