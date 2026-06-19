import { createContext, useContext } from 'react';

// The vault session context + its accessor hook
export const VaultDataContext = createContext(null);

export const useVaultData = () => {
  const ctx = useContext(VaultDataContext);
  if (!ctx) throw new Error('useVaultData must be used within VaultDataProvider');
  return ctx;
};
