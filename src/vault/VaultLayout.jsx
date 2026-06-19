import { NavLink, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { User, Swords, Crosshair, Layers, BarChart3, Wallet, Radar, ShieldAlert, WifiOff, LogOut, RotateCcw, FlaskConical } from 'lucide-react';
import { useVaultData } from './context/VaultDataContext';
import { VAULT_BASE } from './constants';
import { BackToTop } from '../components/BackToTop';
import { useMobileDetect } from '../hooks/useMobileDetect';

// Absolute paths
const NAV = [
  { to: VAULT_BASE, end: true, icon: User, label: 'Career' },
  { to: `${VAULT_BASE}/matches`, icon: Swords, label: 'Matches' },
  { to: `${VAULT_BASE}/weapons`, icon: Crosshair, label: 'Weapons' },
  { to: `${VAULT_BASE}/breakdown`, icon: BarChart3, label: 'Breakdown' },
  { to: `${VAULT_BASE}/loadouts`, icon: Layers, label: 'Loadouts' },
  { to: `${VAULT_BASE}/purchases`, icon: Wallet, label: 'Purchases' },
  { to: `${VAULT_BASE}/sessions`, icon: Radar, label: 'Sessions' },
  { to: `${VAULT_BASE}/account`, icon: ShieldAlert, label: 'Account & Bans' },
];

const navClass = ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-emerald-600/20 text-emerald-300' : 'text-gray-400 hover:text-white hover:bg-gray-700/60'
  }`;

export const VaultLayout = ({ children }) => {
  const { model, isSample, reset } = useVaultData();
  const isMobile = useMobileDetect() || false;
  const name = model?.identity?.fullName || model?.identity?.displayName || 'Player';

  return (
    <div className="min-h-screen">
      {/* Private, post-upload session views — keep them out of search indexes. */}
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Sample-data banner — make it unmistakable that this isn't a real account. */}
      {isSample ? (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-amber-950/70 border-b border-amber-700/50 text-amber-200 text-xs py-1.5 px-4">
          <FlaskConical className="w-3.5 h-3.5 shrink-0" />
          <span>Sample data — a fictional player so you can preview the dashboard. The numbers aren’t real.</span>
          <button onClick={reset} className="font-semibold underline underline-offset-2 hover:text-amber-100">
            Load your own export
          </button>
        </div>
      ) : (
        /* Offline assurance banner — always visible inside the vault. */
        <div className="flex items-center justify-center gap-2 bg-emerald-950/60 border-b border-emerald-800/40 text-emerald-300 text-xs py-1.5 px-4">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline mode — your data stays on this device and is never uploaded.</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-4 flex flex-col lg:flex-row gap-4">
        {/* Sidebar */}
        <aside className="lg:w-60 shrink-0">
          <div className="bg-gray-800 rounded-xl p-4 lg:sticky lg:top-4">
            <div className="px-1 pb-3 mb-3 border-b border-gray-700">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Viewing data for</p>
              <p className="text-white font-semibold truncate" title={name}>{name}</p>
            </div>

            <nav className="flex lg:flex-col gap-1 overflow-x-auto">
              {NAV.map((item) => (
                <NavLink key={item.label} to={item.to} end={item.end} className={navClass}>
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="mt-4 pt-3 border-t border-gray-700 flex lg:flex-col gap-1">
              <button
                onClick={reset}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-700/60 transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> <span>Load another</span>
              </button>
              <Link
                to="/hub"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-700/60 transition-colors"
              >
                <LogOut className="w-4 h-4" /> <span>Exit to site</span>
              </Link>
            </div>
          </div>
        </aside>

        {/* Page content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>

      <BackToTop isMobile={isMobile} />
    </div>
  );
};
