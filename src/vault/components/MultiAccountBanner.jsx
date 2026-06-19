import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UsersRound, Check, ArrowRight } from 'lucide-react';
import { useVaultData } from '../context/VaultDataContext';
import { VAULT_BASE } from '../constants';

// Shown at the top of the dashboard when the imported export contains MORE THAN ONE Embark account 
export const MultiAccountBanner = () => {
  const { model } = useVaultData();
  const [dismissed, setDismissed] = useState(false);
  if (!model?.multiAccount || dismissed) return null;

  const accounts = model.accounts || [];
  const names = accounts.map((a) => a.fullName).filter(Boolean);

  return (
    <div className="mb-5 rounded-xl border border-blue-700/50 bg-blue-950/30 p-4 sm:p-5 animate-fade-in-up">
      <div className="flex items-start gap-3">
        <UsersRound className="w-5 h-5 text-blue-300 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-blue-100">
            This export contains data for {accounts.length} Embark accounts
          </p>
          {names.length > 0 && <p className="text-xs text-blue-200 mt-0.5">{names.join('  ·  ')}</p>}
          <p className="text-xs text-blue-200/70 mt-1.5 leading-relaxed">
            Embark returns every account registered to your email in one package, so this import bundles them together. The
            stats across the dashboard are the accounts <strong>combined</strong>; the per-account breakdown (names, emails and
            verification) is on the Account &amp; Bans page.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to={`${VAULT_BASE}/account`}
              className="inline-flex items-center gap-1.5 bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              View accounts <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={() => setDismissed(true)}
              className="inline-flex items-center gap-1.5 bg-gray-700/70 hover:bg-gray-600 text-gray-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
