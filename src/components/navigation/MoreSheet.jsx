import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Crosshair, ShieldCheck, Users, Info, Palette } from 'lucide-react';
import { SiDiscord } from 'react-icons/si';
import { useTheme } from '../../context/ThemeProvider';
import { ThemeSwatch } from '../ThemeSwitcher';
import { DISCORD_URL } from '../../constants';

const TILE_CLASS =
  'flex items-center gap-2.5 rounded-xl bg-gray-700 px-3 py-3 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600';

const ROW_CLASS =
  'mt-2 flex items-center gap-2.5 rounded-xl bg-gray-700 px-3 py-2.5 text-sm font-medium text-gray-200';

// Bottom sheet opened by the tab bar's "More" slot. Plain local UI state, not
// part of the modal/history system. Always mounted and class-toggled so the
// open/close transitions run both ways; `inert` keeps the closed sheet out of
// the tab order and accessibility tree.
export const MoreSheet = ({ open, onClose, onOpenMembers, onOpenInfo }) => {
  const { themeId, setTheme, themes } = useTheme();
  const sheetRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) sheetRef.current?.focus();
  }, [open]);

  // Lock page scroll while open. Restoring the previous value (rather than
  // clearing) avoids fighting ModalProvider when a modal opens from the sheet.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-black/55 transition-opacity duration-200 motion-reduce:transition-none ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="More"
        inert={!open}
        tabIndex={-1}
        ref={sheetRef}
        className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-white/10 bg-gray-800 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 motion-reduce:transition-none ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-9 rounded-full bg-gray-600" />

        <div className="grid grid-cols-2 gap-2">
          <Link to="/spray-patterns" onClick={onClose} className={TILE_CLASS}>
            <Crosshair className="w-4 h-4 text-red-400" />
            Sprays
          </Link>
          <Link to="/gdpr-vault" onClick={onClose} className={TILE_CLASS}>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Data Vault
          </Link>
          <Link
            to="/members"
            onClick={(e) => { e.preventDefault(); onClose(); onOpenMembers(); }}
            className={TILE_CLASS}
          >
            <Users className="w-4 h-4" />
            Members
          </Link>
          <Link
            to="/info"
            onClick={(e) => { e.preventDefault(); onClose(); onOpenInfo(); }}
            className={TILE_CLASS}
          >
            <Info className="w-4 h-4" />
            About
          </Link>
        </div>

        <div className={`${ROW_CLASS} justify-between`}>
          <span className="flex items-center gap-2.5">
            <Palette className="w-4 h-4" />
            Theme
          </span>
          <span className="flex gap-1.5">
            {themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                aria-pressed={theme.id === themeId}
                aria-label={theme.label}
                onClick={() => setTheme(theme.id)}
                className={`rounded-lg transition-shadow ${
                  theme.id === themeId ? 'ring-2 ring-blue-400' : 'ring-1 ring-white/10'
                }`}
              >
                <ThemeSwatch themeId={theme.id} />
              </button>
            ))}
          </span>
        </div>

        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className={`${ROW_CLASS} transition-colors hover:bg-gray-600`}
        >
          <SiDiscord className="w-4 h-4" />
          Join our Discord
        </a>
      </div>
    </>
  );
};
