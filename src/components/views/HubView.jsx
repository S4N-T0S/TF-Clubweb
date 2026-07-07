import { Link } from 'react-router-dom';
import { Crown, Globe, Trophy, Crosshair, Sparkles, Zap, ShieldCheck } from 'lucide-react';

// Feature tiles.
const FEATURES = [
  {
    to: '/leaderboard',
    icon: Globe,
    title: 'Live Leaderboard',
    desc: 'Real-time ranked leaderboard with history, graphs and seasonal data.',
    color: 'text-blue-400',
    ring: 'hover:border-blue-500/60',
  },
  {
    to: '/clubs',
    icon: Trophy,
    title: 'Top Clubs',
    desc: 'Best performing clubs ranked by aggregate score.',
    color: 'text-yellow-400',
    ring: 'hover:border-yellow-500/60',
  },
  {
    to: '/events',
    icon: Zap,
    title: 'Live Events',
    desc: 'Recent bans, name changes, club moves and rank-score adjustments.',
    color: 'text-purple-400',
    ring: 'hover:border-purple-500/60',
  },
  {
    to: '/spray-patterns',
    icon: Crosshair,
    title: 'Spray Patterns',
    desc: 'Interactive spray patterns, recoil guides and a practice trainer for the game\'s guns.',
    color: 'text-red-400',
    ring: 'hover:border-red-500/60',
  },
  {
    to: '/gdpr-vault',
    icon: ShieldCheck,
    title: 'Your Data Vault',
    desc: 'Load your GDPR data export and explore it privately — offline, nothing uploaded.',
    color: 'text-emerald-400',
    ring: 'hover:border-emerald-500/60',
    badge: 'Beta',
    badgeTone: 'orange',
  },
];

const FeatureTile = ({ to, icon: Icon, title, desc, color, ring, badge, badgeTone }) => (
  <Link
    to={to}
    className={`group relative bg-gray-800 p-6 rounded-xl border border-gray-700 ${ring} transition-colors flex flex-col`}
  >
    {badge && (
      <span
        className={`absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
          badgeTone === 'orange' ? 'bg-orange-500/20 text-orange-300' : 'bg-emerald-500/20 text-emerald-300'
        }`}
      >
        {badge}
      </span>
    )}
    <Icon className={`w-8 h-8 ${color} mb-3`} />
    <h3 className="text-lg font-semibold text-white">{title}</h3>
    <p className="text-sm text-gray-400 mt-2">{desc}</p>
  </Link>
);

export const HubView = () => {
  return (
    <div className="animate-fade-in-up">
      <div className="text-center bg-gray-700/50 p-6 rounded-2xl mb-8 shadow-xl border border-gray-600">
        <Crown className="w-14 h-14 text-yellow-400 mx-auto mb-3" />
        <h2 className="text-3xl font-bold text-white mb-2">Welcome to OG Club</h2>
        <p className="text-gray-400 max-w-md mx-auto">
          The central hub for THE FINALS leaderboard statistics, history tracking,
          weapon guides and club management.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map((f) => (
          <FeatureTile key={f.to} {...f} />
        ))}

        {/* Placeholder signalling room for upcoming dashboards/graphs */}
        <div className="bg-gray-800/40 p-6 rounded-xl border border-dashed border-gray-700 flex flex-col items-center justify-center text-center">
          <Sparkles className="w-7 h-7 text-gray-500 mb-2" />
          <h3 className="text-sm font-semibold text-gray-400">More coming soon</h3>
          <p className="text-xs text-gray-500 mt-1">Open to suggestions!</p>
        </div>
      </div>
    </div>
  );
};
