import { Router } from './routes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from './context/ThemeProvider';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import { DiscordGateProvider } from './components/DiscordGate';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <ThemeProvider>
        <RootErrorBoundary>
          <DiscordGateProvider>
            <Router />
          </DiscordGateProvider>
        </RootErrorBoundary>
      </ThemeProvider>
    </HelmetProvider>
  </StrictMode>
);