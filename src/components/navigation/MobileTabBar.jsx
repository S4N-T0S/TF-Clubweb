import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { House, Globe, Trophy, Zap, Menu } from 'lucide-react';
import { MoreSheet } from './MoreSheet';

const SLOT_CLASS = 'flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-[10px] font-medium';

// One tab-bar slot: a Link for the view slots, a button for "More". The icon
// sits in a pill that fills with the accent when active (Material 3 style).
const TabSlot = ({ to, icon: Icon, label, active, onClick, showDot, buttonRef, ...buttonProps }) => {
  const colour = active ? 'text-blue-300' : 'text-gray-400';
  const content = (
    <>
      <span className={`relative flex h-6 w-11 items-center justify-center rounded-full ${active ? 'bg-blue-500/20' : ''}`}>
        <Icon className="w-5.5 h-5.5" />
        {showDot && (
          <>
            <span aria-hidden="true" className="absolute -top-0.5 right-0 w-1.5 h-1.5 rounded-full bg-yellow-400" />
            <span className="sr-only">(new events)</span>
          </>
        )}
      </span>
      {label}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        onClick={onClick}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={`${SLOT_CLASS} ${colour}`}
      >
        {content}
      </Link>
    );
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`${SLOT_CLASS} ${colour}`}
      {...buttonProps}
    >
      {content}
    </button>
  );
};

// Fixed bottom tab bar: five labeled slots, always visible, safe-area aware.
// Owns the More sheet's open state (plain local UI state, no URL).
export const MobileTabBar = ({ activeTab, onOpenMembers, onOpenInfo, hasNewEvents }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const moreBtnRef = useRef(null);

  const closeSheet = () => {
    setSheetOpen(false);
    moreBtnRef.current?.focus();
  };

  // Tab taps scroll back to the top (the old handleTabNavClick behaviour).
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-t border-gray-700 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex">
          <TabSlot to="/hub" icon={House} label="Hub" active={activeTab === 'hub'} onClick={scrollToTop} />
          <TabSlot to="/leaderboard" icon={Globe} label="Ranks" active={activeTab === 'global'} onClick={scrollToTop} />
          <TabSlot to="/clubs" icon={Trophy} label="Clubs" active={activeTab === 'clubs'} onClick={scrollToTop} />
          <TabSlot
            to="/events"
            icon={Zap}
            label="Events"
            active={activeTab === 'events'}
            onClick={scrollToTop}
            showDot={hasNewEvents}
          />
          <TabSlot
            icon={Menu}
            label="More"
            active={false}
            onClick={() => setSheetOpen(true)}
            buttonRef={moreBtnRef}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
          />
        </div>
      </nav>

      {/* Sibling of the nav, not a child: the nav's backdrop-blur creates a
          containing block that would trap the sheet's fixed positioning. */}
      <MoreSheet open={sheetOpen} onClose={closeSheet} onOpenMembers={onOpenMembers} onOpenInfo={onOpenInfo} />
    </>
  );
};
