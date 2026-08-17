import { useEffect, useRef, useState } from 'react';

// Escape-to-close, body scroll lock and focus restore for the vault's overlays.
// The leaderboard app gets these from ModalProvider, which renders inside App;
// the vault is a SIBLING route, so useModal() there throws on a null context.
// Outside-click is left out — a backdrop sibling's onClick covers it without a
// ref.
//
// A hook rather than per-modal effects because the stack has to be shared state:
// the graph modal opens the settings modal on top of itself, and independent
// copies would fight over the lock and over which one Escape closes.

// Open overlays, oldest first. Shared at module scope so nesting works.
const stack = [];

const applyLock = () => {
  // Same properties and values ModalProvider sets, so if both ever run they
  // can't leave the body in disagreeing states.
  document.body.style.overflow = 'hidden';
  document.body.style.overscrollBehavior = 'none';
};
const releaseLock = () => {
  document.body.style.overflow = 'unset';
  document.body.style.overscrollBehavior = 'unset';
};

export const useVaultModal = (onClose) => {
  const [isActive, setIsActive] = useState(false);

  // Keep the latest handler without re-binding the key listener every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // One identity per mounted overlay, used to find its place in the stack.
  const tokenRef = useRef(null);
  if (tokenRef.current === null) tokenRef.current = {};

  useEffect(() => {
    const token = tokenRef.current;
    stack.push(token);
    // Lock on the way in, release only when the LAST overlay leaves. Without the
    // count, closing a nested settings modal would unlock the page while the
    // graph behind it is still open.
    if (stack.length === 1) applyLock();

    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return;
      // Only the top-most overlay answers, or Escape closes the whole nest at
      // once, matching ModalProvider.
      if (stack[stack.length - 1] !== token) return;
      onCloseRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const i = stack.indexOf(token);
      if (i !== -1) stack.splice(i, 1);
      if (stack.length === 0) releaseLock();
    };
  }, []);

  // Entrance: .modal-overlay starts at opacity 0 and transitions on .is-active
  // (src/index.css). The rAF matters — flipping it in the same paint as the
  // mount means the browser never sees the start state and the fade never runs.
  useEffect(() => {
    const id = requestAnimationFrame(() => setIsActive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Return focus to whatever opened the overlay, which may have been reached by
  // keyboard. Captured through a ref guarded to the first run: StrictMode
  // invokes effects twice, and the second pass would capture focus already
  // moved inside the overlay.
  const openerRef = useRef(null);
  useEffect(() => {
    if (openerRef.current === null) openerRef.current = document.activeElement;
    return () => {
      const opener = openerRef.current;
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, []);

  return { isActive };
};
