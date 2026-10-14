import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bug, ExternalLink, Lightbulb, Megaphone } from 'lucide-react';
import { SiDiscord } from 'react-icons/si';
import { DISCORD_URL } from '../constants';

const DiscordGateContext = createContext(null);

const USES = [
  [Bug, 'Bug reports and help'],
  [Lightbulb, 'Suggestions'],
  [Megaphone, 'Update announcements'],
];

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400';

const DiscordGateDialog = ({ onClose }) => {
  const panelRef = useRef(null);
  const armedRef = useRef(false);
  const [isActive, setIsActive] = useState(false);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const show = setTimeout(() => setIsActive(true), 10);
    const arm = setTimeout(() => {
      armedRef.current = true;
    }, 400);
    return () => {
      clearTimeout(show);
      clearTimeout(arm);
    };
  }, []);

  useEffect(() => {
    panelRef.current?.focus();
    const { overflow, overscrollBehavior } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !e.isComposing && !e.defaultPrevented) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      const items = panel.querySelectorAll('a[href], button');
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !panel.contains(active);
      if (e.shiftKey && (outside || active === panel || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (outside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('popstate', onClose);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('popstate', onClose);
      document.body.style.overflow = overflow;
      document.body.style.overscrollBehavior = overscrollBehavior;
    };
  }, [onClose]);

  return createPortal(
    <div
      onClickCapture={(e) => {
        if (!armedRef.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      style={{ pointerEvents: 'auto' }}
      className={`modal-overlay ${isActive ? 'is-active' : ''} fixed inset-0 z-70 flex items-end justify-center sm:items-center sm:p-4`}
    >
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/75" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className="modal-box relative max-h-[calc(100dvh-2rem)] w-full origin-bottom overflow-y-auto overscroll-contain rounded-t-2xl border-t border-white/10 bg-gray-800 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl outline-none sm:max-w-sm sm:origin-center sm:rounded-2xl sm:border sm:p-6"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300"
          >
            <SiDiscord className="h-5 w-5" />
          </span>
          <h2 id={titleId} className="text-lg font-semibold text-white">
            Before you join our Discord
          </h2>
        </div>

        <div id={descId} className="mt-4 text-sm">
          <p className="text-gray-300">This server is only used for:</p>
          <ul className="mt-2 space-y-2 text-gray-100">
            {USES.map(([Icon, label]) => (
              <li key={label} className="flex items-center gap-2.5">
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400" />
                {label}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-gray-300">
            It is not for general THE FINALS chat, finding teammates or joining the OG Club.
          </p>
        </div>

        <div className="mt-5 flex gap-2 sm:mt-6 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`h-11 shrink-0 rounded-lg bg-gray-700 px-4 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600 hover:text-white sm:h-10 ${FOCUS_RING}`}
          >
            Not now
          </button>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setTimeout(onClose, 0)}
            className={`flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 sm:h-10 sm:flex-none ${FOCUS_RING}`}
          >
            Continue to Discord
            <ExternalLink aria-hidden="true" className="hidden h-4 w-4 min-[360px]:block" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
};

export const DiscordGateProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const openerRef = useRef(null);

  const request = useCallback((e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const active = document.activeElement;
    openerRef.current = active && active !== document.body ? active : e.currentTarget;
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
  }, []);

  return (
    <DiscordGateContext.Provider value={request}>
      {children}
      {isOpen && <DiscordGateDialog onClose={close} />}
    </DiscordGateContext.Provider>
  );
};

export const DiscordLink = ({ onClick, ...props }) => {
  const request = useContext(DiscordGateContext);
  return (
    <a
      {...props}
      href={DISCORD_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        onClick?.(e);
        request?.(e);
      }}
    />
  );
};
