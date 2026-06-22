import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { THEMES, DEFAULT_THEME_ID, THEME_STORAGE_KEY, isValidThemeId } from '../theme/themes';

const ThemeContext = createContext(null);

const getInitialTheme = () => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && isValidThemeId(stored)) return stored;
  } catch (error) {
    console.error('Error reading theme from localStorage:', error);
  }
  return DEFAULT_THEME_ID;
};

export const ThemeProvider = ({ children }) => {
  const [themeId, setThemeId] = useState(getInitialTheme);

  // Keep <html data-theme> and localStorage in step with the active theme.
  // The inline boot script sets the attribute first (to avoid a flash); this
  // re-affirms it and handles every change made after mount.
  useEffect(() => {
    document.documentElement.dataset.theme = themeId;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch (error) {
      console.error('Error saving theme to localStorage:', error);
    }
  }, [themeId]);

  const setTheme = useCallback((id) => {
    setThemeId(isValidThemeId(id) ? id : DEFAULT_THEME_ID);
  }, []);

  const value = useMemo(() => ({ themeId, setTheme, themes: THEMES }), [themeId, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
