import { Router } from './routes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from './context/ThemeProvider';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <ThemeProvider>
        <RootErrorBoundary>
          <Router />
        </RootErrorBoundary>
      </ThemeProvider>
    </HelmetProvider>
  </StrictMode>
);