import { useCallback, useMemo, useState } from 'react';
import { ingestFiles, summarizeFileset } from '../lib/ingest';
import { parseFileset } from '../lib/parse';
import { buildModel } from '../lib/model';
import { buildSampleRaw } from '../lib/sampleData';
import { preloadVaultImages } from '../lib/preload';
import { VaultDataContext } from './VaultDataContext';

// Holds the parsed export for the whole vault session. Lives above the vault's
// internal <Routes> so navigating between sub-pages never re-parses.
//
// Everything here is in-memory only: no persistence to disk/IndexedDB, no
// network. Reloading the tab discards the data — by design, for a privacy tool.
//
// Upgrade path: ingest+parse+model are pure modules, so the heavy parse step
// can be moved into a Web Worker (new Worker(new URL('../lib/worker.js', ...)))
// without touching the pages. Kept on the main thread for the baseline, with
// async yielding so the UI stays responsive.
//
// The context object and the useVaultData hook live in ./VaultDataContext so
// this file can export only a component — required for React Fast Refresh.

export const VaultDataProvider = ({ children }) => {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);
  const [model, setModel] = useState(null);
  const [isSample, setIsSample] = useState(false);
  // Which expected SAR components turned up in the last real import (null for the sample / before any load)
  const [importSummary, setImportSummary] = useState(null);

  const load = useCallback(async (fileList) => {
    setStatus('loading');
    setError(null);
    setIsSample(false);
    setImportSummary(null);
    setProgress('Reading files…');
    // Warm the weapon/map image cache now (during import) so the Matches page
    // and weapon-filter picker are ready by the time the user gets there.
    preloadVaultImages();
    try {
      const fileset = await ingestFiles(fileList, setProgress);
      setImportSummary(summarizeFileset(fileset));
      const raw = await parseFileset(fileset, setProgress);
      setProgress('Building dashboards…');
      const built = buildModel(raw);
      setModel(built);
      setStatus('ready');
      setProgress('');
    } catch (e) {
      console.error('[vault] load failed:', e);
      setError(e?.message || 'Failed to read this export.');
      setStatus('error');
    }
  }, []);

  // Load the built-in fictional player so visitors can explore the dashboard
  // before their own export arrives. Synthesised entirely in-browser through the
  // same buildModel() pipeline a real upload uses — see lib/sampleData.js.
  const loadSample = useCallback(() => {
    setError(null);
    setProgress('');
    setImportSummary(null);
    preloadVaultImages();
    try {
      setModel(buildModel(buildSampleRaw()));
      setIsSample(true);
      setStatus('ready');
    } catch (e) {
      console.error('[vault] sample build failed:', e);
      setError(e?.message || 'Failed to build the sample.');
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    setModel(null);
    setError(null);
    setProgress('');
    setIsSample(false);
    setImportSummary(null);
    setStatus('idle');
  }, []);

  const value = useMemo(
    () => ({ status, progress, error, model, isSample, importSummary, hasData: status === 'ready' && !!model, load, loadSample, reset }),
    [status, progress, error, model, isSample, importSummary, load, loadSample, reset]
  );

  return <VaultDataContext.Provider value={value}>{children}</VaultDataContext.Provider>;
};
