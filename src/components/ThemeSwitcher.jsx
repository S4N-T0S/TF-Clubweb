import { useEffect, useRef, useState, useCallback } from 'react';
import { Palette, Check } from 'lucide-react';
import { useTheme } from '../context/ThemeProvider';

const PLACEMENT = {
  'bottom-end': 'top-full mt-2 right-0',
  'bottom-start': 'top-full mt-2 left-0',
  'top-end': 'bottom-full mb-2 right-0',
  'top-start': 'bottom-full mb-2 left-0',
};

const DEFAULT_TRIGGER_CLASS =
  'flex items-center justify-center px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors';

// A tiny live preview of a theme's surface ramp
const ThemeSwatch = ({ themeId }) => (
  <span
    data-theme={themeId}
    aria-hidden="true"
    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-900 ring-1 ring-white/10"
  >
    <span className="flex h-5 w-5 items-center justify-center gap-0.5 rounded bg-gray-800">
      <span className="h-2.5 w-1.5 rounded-xs bg-gray-600" />
      <span className="h-2.5 w-1.5 rounded-xs bg-blue-500" />
    </span>
  </span>
);

export const ThemeSwitcher = ({ placement = 'bottom-end', triggerClassName = DEFAULT_TRIGGER_CLASS }) => {
  const { themeId, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);

  const close = useCallback((focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  // Dismiss on an outside click or Escape while the menu is open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  // Move focus onto the active option when the menu opens, so arrow keys and screen readers start from the right place.
  useEffect(() => {
    if (!open) return;
    const activeIndex = Math.max(0, themes.findIndex((t) => t.id === themeId));
    optionRefs.current[activeIndex]?.focus();
  }, [open, themeId, themes]);

  const onMenuKeyDown = (e) => {
    const count = themes.length;
    const current = optionRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      optionRefs.current[(current + 1 + count) % count]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      optionRefs.current[(current - 1 + count) % count]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      optionRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      optionRefs.current[count - 1]?.focus();
    }
  };

  const handleSelect = (id) => {
    setTheme(id);
    close(true);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change theme"
        title="Theme"
      >
        <Palette className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme"
          onKeyDown={onMenuKeyDown}
          className={`absolute z-50 w-64 rounded-xl border border-gray-700 bg-gray-800 p-1.5 shadow-2xl ${PLACEMENT[placement]}`}
        >
          {themes.map((theme, i) => {
            const active = theme.id === themeId;
            return (
              <button
                key={theme.id}
                ref={(el) => (optionRefs.current[i] = el)}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => handleSelect(theme.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                  active ? 'bg-gray-700/70' : 'hover:bg-gray-700/50'
                }`}
              >
                <ThemeSwatch themeId={theme.id} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-white">{theme.label}</span>
                  <span className="block truncate text-xs text-gray-400">{theme.blurb}</span>
                </span>
                <Check
                  className={`w-4 h-4 shrink-0 text-blue-400 transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
