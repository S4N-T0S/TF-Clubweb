import { BarChart3, Users, Crown, Activity } from 'lucide-react';

export const HubView = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 animate-fade-in-up">
      <div className="bg-gray-700/50 p-6 rounded-2xl mb-6 shadow-xl border border-gray-600">
        <Crown className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-3xl font-bold text-white mb-2">Welcome to OG Club</h2>
        <p className="text-gray-400 max-w-md">
          The central hub for The Finals leaderboard statistics, history tracking, and club management.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-4xl mt-8">
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col items-center">
            <Activity className="w-8 h-8 text-blue-400 mb-3" />
            <h3 className="text-lg font-semibold text-white">Live Rankings</h3>
            <p className="text-sm text-gray-400 mt-2">Real-time leaderboard updates with detailed history.</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col items-center">
            <BarChart3 className="w-8 h-8 text-green-400 mb-3" />
            <h3 className="text-lg font-semibold text-white">Season Stats</h3>
            <p className="text-sm text-gray-400 mt-2">Comprehensive graphs and performance tracking.</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col items-center">
            <Users className="w-8 h-8 text-indigo-400 mb-3" />
            <h3 className="text-lg font-semibold text-white">Club Insights</h3>
            <p className="text-sm text-gray-400 mt-2">Track top clubs and member movements.</p>
        </div>
      </div>
      
      <div className="mt-12 text-gray-500 text-sm italic">
        Hub is under construction...
      </div>
    </div>
  );
};