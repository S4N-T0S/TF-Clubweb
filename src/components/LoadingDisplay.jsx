import { Loader2 } from 'lucide-react';

export const LoadingDisplay = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900">
    <Loader2 className="w-16 h-16 animate-spin text-blue-500" />
    <p className="mt-4 text-lg text-gray-300">Loading club data...</p>
  </div>
);