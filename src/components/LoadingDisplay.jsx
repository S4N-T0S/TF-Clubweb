import { Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

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

export const LoadingDisplay = () => {
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900">
      <Loader2 className="w-16 h-16 animate-spin text-blue-500" />
      <p className="mt-4 text-lg text-gray-300">{currentMessage}</p>
    </div>
  );
};