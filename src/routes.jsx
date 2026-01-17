import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import App from './App';
import OverlayRoot from './components/overlay/OverlayRoot';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { path: 'hub', element: null },
      { path: 'leaderboard', element: null },
      { path: 'clubs', element: null },
      
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
    path: '*',
    element: <Navigate to="/" replace />
  }
]);

export const Router = () => <RouterProvider router={router} />;