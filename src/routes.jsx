import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import App from './App';
import OverlayRoot from './components/overlay/OverlayRoot';
import { LoadingDisplay } from './components/LoadingDisplay';
import { LazyBoundary } from './components/LazyBoundary';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
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
]);

export const Router = () => <RouterProvider router={router} />;