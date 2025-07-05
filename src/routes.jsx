import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import App from './App';
import OverlayRoot from './components/overlay/OverlayRoot';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        path: 'graph/:season/:graph',
        element: null // Handled by App component
      },
      {
        path: 'graph/:graph', // Kept for backward compatibility with old links
        element: null // Handled by App component
      },
      {
        path: 'history',
        element: null // Handled by App component
      },
      {
        path: 'history/:history',
        element: null // Handled by App component
      },
      {
        path: 'events',
        element: null // Handled by App component
      },
      {
        path: 'info',
        element: null // Handled by App component
      },
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