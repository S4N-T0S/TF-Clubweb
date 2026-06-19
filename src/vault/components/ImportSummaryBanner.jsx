import { useState } from 'react';
import { AlertTriangle, RotateCcw, Check } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';

// Shown at the top of the dashboard after a real import that was missing one or more
// expected SAR components (see lib/ingest.js → summarizeFileset). A full export arrives
// as several separate files/zips, so it's easy to load only some and not notice. This is
// deliberately non-blocking: the user can keep exploring (the dependent pages just sit
// empty) or re-import with the missing parts included.
export const ImportSummaryBanner = () => {
  const { importSummary, reset } = useVaultData();
  const [dismissed, setDismissed] = useState(false);
  if (!importSummary || importSummary.complete || dismissed) return null;

  const { missing, foundCount, total } = importSummary;
  const n = missing.length;

  return (
    <div className="mb-5 rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 sm:p-5 animate-fade-in-up">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-200">Some expected files weren’t found in this import</p>
          <p className="text-xs text-amber-200/70 mt-1 leading-relaxed">
            We loaded {foundCount} of {total} data files, but {n === 1 ? 'one part' : `${n} parts`} of your export
            {n === 1 ? ' wasn’t' : ' weren’t'} detected. Embark sends these as separate files (or zips), so it’s easy to
            miss one. Everything else still works — the pages below will just be empty. You can keep exploring, or re-import
            with {n === 1 ? 'it' : 'them'} included.
          </p>

          <ul className="mt-3 space-y-1.5">
            {missing.map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 shrink-0 mt-1.5" />
                <span className="text-gray-300">
                  <code className="text-amber-200/90">{c.file}</code> — {c.label}
                  <span className="text-gray-500"> · powers {c.powers}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 bg-amber-600/90 hover:bg-amber-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Re-import files
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="inline-flex items-center gap-1.5 bg-gray-700/70 hover:bg-gray-600 text-gray-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Continue anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
