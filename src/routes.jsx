import { useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import App from './App';
import OverlayRoot from './components/overlay/OverlayRoot';
import { LoadingDisplay } from './components/LoadingDisplay';
import { LazyBoundary } from './components/LazyBoundary';
import { RouteErrorBoundary, CrashScreen } from './components/RootErrorBoundary';
import { loadHistoricalData, isHistoricalDataLoaded } from './services/historicalDataService';

// The leaderboard app reads SEASONS[key].data synchronously, so it mounts only once the
// season blob is in. The vault and overlay routes never read it and skip the wait.
const HistoricalDataGate = ({ children }) => {
  const [status, setStatus] = useState(() => (isHistoricalDataLoaded() ? 'ready' : 'loading'));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status !== 'loading') return;
    let live = true;
    loadHistoricalData().then(
      () => { if (live) setStatus('ready'); },
      (e) => { if (live) { setError(e); setStatus('failed'); } }
    );
    return () => { live = false; };
  }, [status]);

  if (status === 'ready') return children;
  if (status === 'failed') return <CrashScreen title="Connection Issue" error={error} />;
  return <LoadingDisplay />;
};

const router = createBrowserRouter([
  {
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: '/',
        element: <HistoricalDataGate><App /></HistoricalDataGate>,
        children: [
          { path: 'hub', element: null },
          { path: 'leaderboard', element: null },
          { path: 'clubs', element: null },

          { path: 'spray-patterns', element: null },
          { path: 'spray-patterns/:weapon', element: null },

          { path: 'graph/:season/:graph', element: null },
          { path: 'graph/:graph', element: null }, // Backward compat

          { path: 'history', element: null },
          { path: 'history/:history', element: null },

          { path: 'members', element: null },
          { path: 'events', element: null },
          { path: 'info', element: null },
        ]
      },
      {
        path: '/overlay/*',
        element: <OverlayRoot />
      },
      {
        path: '/gdpr-vault/*',
        element: (
          // The GDPR/SAR data vault is a fully separate, offline route tree.
          <LazyBoundary
            loader={() => import('./vault/VaultRoot')}
            fallback={<LoadingDisplay iconColor="text-emerald-400" />}
            variant="inline"
          >
            {(VaultRoot) => <VaultRoot />}
          </LazyBoundary>
        )
      },
      {
        path: '*',
        element: <Navigate to="/" replace />
      }
    ]
  }
]);

export const Router = () => <RouterProvider router={router} />;