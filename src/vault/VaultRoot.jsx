import { Buffer } from 'buffer';
import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

// mmdb-lib (offline GeoIP, lazy-loaded on the Sessions page) reads a global `Buffer` at module-eval time. Set it here — the vault entry — so it exists before any sub-module loads, and stays out of the main app bundle.
if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = Buffer;
import { VaultDataProvider } from './context/VaultDataProvider';
import { useVaultData } from './context/VaultDataContext';
import { VaultLanding } from './VaultLanding';
import { VaultLayout } from './VaultLayout';
import { BetaBanner } from './components/BetaBanner';
import { CareerPage } from './pages/CareerPage';
import { RatingsPage } from './pages/RatingsPage';
import { MatchesPage } from './pages/MatchesPage';
import { WeaponsPage } from './pages/WeaponsPage';
import { BreakdownPage } from './pages/BreakdownPage';
import { LoadoutsPage } from './pages/LoadoutsPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { SessionsPage } from './pages/SessionsPage';
import { EmailsPage } from './pages/EmailsPage';
import { AccountPage } from './pages/AccountPage';
import { preloadVaultImages } from './lib/preload';
import { VAULT_BASE } from './constants';

// Gate: until an export is parsed, every vault path shows the upload landing
const VaultInner = () => {
  const { hasData } = useVaultData();
  const location = useLocation();
  if (!hasData) {
    const onBase = location.pathname === VAULT_BASE || location.pathname === `${VAULT_BASE}/`;
    return onBase ? <VaultLanding /> : <Navigate to={VAULT_BASE} replace />;
  }
  return (
    <VaultLayout>
      <Routes>
        <Route index element={<CareerPage />} />
        <Route path="ratings" element={<RatingsPage />} />
        <Route path="matches" element={<MatchesPage />} />
        <Route path="weapons" element={<WeaponsPage />} />
        <Route path="breakdown" element={<BreakdownPage />} />
        <Route path="loadouts" element={<LoadoutsPage />} />
        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="emails" element={<EmailsPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to={VAULT_BASE} replace />} />
      </Routes>
    </VaultLayout>
  );
};

// Self-contained: renders NONE of the leaderboard app, makes NO network calls
// Per-page SEO/robots is set deeper: the landing page (VaultLanding) is indexable with full meta; the data sub-pages (VaultLayout) are noindex
const VaultRoot = () => {
  useEffect(() => {
    preloadVaultImages();
  }, []);

  return (
    <VaultDataProvider>
      <Helmet>
        <title>Your Data Vault — OG Club</title>
      </Helmet>
      <VaultInner />
      <BetaBanner />
    </VaultDataProvider>
  );
};

export default VaultRoot;
