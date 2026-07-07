import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, House, Globe, Trophy, Zap, Crosshair, UserSearch, Users, ShieldCheck, Info, Ellipsis } from 'lucide-react';
import { SiDiscord } from 'react-icons/si';
import { ThemeSwitcher } from '../ThemeSwitcher';
import { DISCORD_URL } from '../../constants';

const GHOST_ICON_CLASS =
  'flex items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white';

const MENU_ITEM_CLASS =
  'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700/50';

// A primary view tab: quiet ghost link with a blue underline when active and an optional yellow "new events" dot 
const TabLink = ({ to, icon: Icon, label, active, onClick, showDot }) => (
  <Link
    to={to}
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={`relative flex h-full items-center gap-1.5 px-3 text-sm font-medium transition-colors ${
      active ? 'text-blue-300' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
    }`}
  >
    <Icon className="w-4 h-4" />
    {label}
    {showDot && (
      <>
        <span aria-hidden="true" className="absolute top-3 right-1 w-1.5 h-1.5 rounded-full bg-yellow-400" />
        <span className="sr-only">(new events)</span>
      </>
    )}
    {active && <span aria-hidden="true" className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-blue-400" />}
  </Link>
);

// The "⋯" overflow menu. Same interaction contract as ThemeSwitcher's popover:
// outside mousedown closes, Escape closes and refocuses the trigger, arrow keys
// and Home/End move focus, first item is focused on open.
const OverflowMenu = ({ onOpenMembers, onOpenInfo }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);

  const close = useCallback((focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

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

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  const onMenuKeyDown = (e) => {
    const items = itemRefs.current.filter(Boolean);
    const count = items.length;
    const current = items.findIndex((el) => el === document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(current + 1 + count) % count]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(current - 1 + count) % count]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[count - 1]?.focus();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={GHOST_ICON_CLASS}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More options"
        title="More"
      >
        <Ellipsis className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="More"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl border border-gray-700 bg-gray-800 p-1.5 shadow-2xl"
        >
          <Link
            to="/members"
            ref={(el) => (itemRefs.current[0] = el)}
            role="menuitem"
            onClick={(e) => { e.preventDefault(); close(); onOpenMembers(); }}
            className={MENU_ITEM_CLASS}
          >
            <Users className="w-4 h-4" />
            OG Members
          </Link>
          <Link
            to="/gdpr-vault"
            ref={(el) => (itemRefs.current[1] = el)}
            role="menuitem"
            onClick={() => close()}
            className={MENU_ITEM_CLASS}
          >
            <ShieldCheck className="w-4 h-4" />
            Data Vault
          </Link>
          <div role="separator" className="my-1 h-px bg-gray-700" />
          <Link
            to="/info"
            ref={(el) => (itemRefs.current[2] = el)}
            role="menuitem"
            onClick={(e) => { e.preventDefault(); close(); onOpenInfo(); }}
            className={MENU_ITEM_CLASS}
          >
            <Info className="w-4 h-4" />
            About this site
          </Link>
          <a
            href={DISCORD_URL}
            ref={(el) => (itemRefs.current[3] = el)}
            role="menuitem"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => close()}
            className={MENU_ITEM_CLASS}
          >
            <SiDiscord className="w-4 h-4" />
            Discord
          </a>
        </div>
      )}
    </div>
  );
};

// Sticky app bar owning all top-level navigation. Desktop: brand, view tabs,
// search, overflow menu and theme picker. Mobile: brand + search only (the
// bottom tab bar owns view switching).
export const AppNavBar = ({ activeTab, isMobile, onOpenSearch, onOpenMembers, onOpenInfo, hasNewEvents }) => {
  return (
    <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 h-12 md:h-14">
        <Link to="/hub" className="mr-2 flex items-center gap-2 whitespace-nowrap font-bold text-white">
          <Crown className="w-5 h-5 text-yellow-400" />
          OG Club
        </Link>

        {!isMobile ? (
          <>
            <nav aria-label="Primary" className="flex h-full items-stretch">
              <TabLink to="/hub" icon={House} label="Hub" active={activeTab === 'hub'} />
              <TabLink to="/leaderboard" icon={Globe} label="Leaderboard" active={activeTab === 'global'} />
              <TabLink to="/clubs" icon={Trophy} label="Clubs" active={activeTab === 'clubs'} />
              <TabLink to="/events" icon={Zap} label="Events" active={activeTab === 'events'} showDot={hasNewEvents} />
              <TabLink to="/spray-patterns" icon={Crosshair} label="Sprays" active={activeTab === 'spray'} />
            </nav>

            <div className="ml-auto flex items-center gap-1">
              <Link
                to="/history"
                onClick={(e) => { e.preventDefault(); onOpenSearch(); }}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              >
                <UserSearch className="w-4 h-4" />
                Search players
              </Link>
              <OverflowMenu onOpenMembers={onOpenMembers} onOpenInfo={onOpenInfo} />
              <span aria-hidden="true" className="mx-1 h-6 w-px bg-gray-700" />
              <ThemeSwitcher triggerClassName={GHOST_ICON_CLASS} />
            </div>
          </>
        ) : (
          <Link
            to="/history"
            onClick={(e) => { e.preventDefault(); onOpenSearch(); }}
            aria-label="Search players"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <UserSearch className="w-5 h-5" />
          </Link>
        )}
      </div>
    </header>
  );
};
