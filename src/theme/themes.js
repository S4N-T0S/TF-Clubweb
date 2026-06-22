export const THEME_STORAGE_KEY = 'theme';

export const DEFAULT_THEME_ID = 'default';

export const THEMES = [
  { id: 'default', label: 'Slate', blurb: 'The signature blue-grey' },
  { id: 'midnight', label: 'Midnight', blurb: 'Deep, inky navy' },
  { id: 'amoled', label: 'AMOLED', blurb: 'True black for OLED' },
];

export const isValidThemeId = (id) => THEMES.some((theme) => theme.id === id);
