import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const ModalContext = createContext(null);

export const ModalProvider = ({ children }) => {
  const [modalStack, setModalStack] = useState([]);

  const isModalOpen = modalStack.length > 0;

  useEffect(() => {
    document.body.style.overflow = isModalOpen ? 'hidden' : 'unset';
    document.body.style.overscrollBehavior = isModalOpen ? 'none' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
      document.body.style.overscrollBehavior = 'unset';
    };
  }, [isModalOpen]);

  const handleOutsideClick = useCallback((event) => {
    if (modalStack.length > 0) {
      const topModal = modalStack[modalStack.length - 1];

      // Ignore clicks on toast notifications, which are rendered outside the modal DOM tree.
      if (event.target.closest('[data-toast-container="true"]')) {
        return;
      }
      
      if (topModal.ref.current && !topModal.ref.current.contains(event.target)) {
        if (topModal.onClose) {
          // Prevent text selection when clicking outside the modal to close it.
          // This can happen if the user drags the mouse slightly during the click.
          event.preventDefault();
          topModal.onClose();
        }
      }
    }
  }, [modalStack]);

  // Escape closes the top-most modal, mirroring the outside-click contract.
  // defaultPrevented respects inner widgets (menus, sheets) that already
  // consumed the key; isComposing ignores IME cancellation.
  const handleEscapeKey = useCallback((event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
    if (modalStack.length > 0) {
      modalStack[modalStack.length - 1].onClose?.();
    }
  }, [modalStack]);

  useEffect(() => {
    if (isModalOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleEscapeKey);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isModalOpen, handleOutsideClick, handleEscapeKey]);

  const registerModal = useCallback((onClose, ref, options = {}) => {
    const { type = 'main' } = options; // Default to 'main' modal type
    setModalStack(stack => [...stack, { onClose, ref, type }]);
  }, []);

  const unregisterModal = useCallback(() => {
    // Unregister the top-most modal
    setModalStack(stack => stack.slice(0, stack.length - 1));
  }, []);

  const isTopModal = useCallback((ref) => {
    if (modalStack.length === 0) return false;
    return modalStack[modalStack.length - 1].ref === ref;
  }, [modalStack]);
  
  const value = { registerModal, unregisterModal, isTopModal, isModalOpen };

  return (
    <ModalContext.Provider value={value}>
      {children}
    </ModalContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useModal = (isOpen, onClose, options) => {
    const context = useContext(ModalContext);
    if (context === null) {
        throw new Error('useModal must be used within a ModalProvider');
    }
    
    const { registerModal, unregisterModal, isTopModal, isModalOpen } = context;
    const modalRef = useRef(null);
    const [isActive, setIsActive] = useState(false);

    // We calculate this on every render, as the modal stack could have changed.
    const isCurrentlyTop = isTopModal(modalRef);

    // Keep the latest onClose in a ref so requestClose stays referentially stable.
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    // Exit is instant: no fade-out. The modal unmounts (via its router-driven
    // onClose) the instant it's dismissed, so whatever is underneath — a stacked
    // modal or the page itself — is revealed with zero downtime. The guard makes a
    // double trigger (e.g. an outside-click racing the X button) a no-op, so we
    // never fire onClose — and therefore never navigate — twice.
    const closingRef = useRef(false);
    const requestClose = useCallback(() => {
        if (closingRef.current) return;
        closingRef.current = true;
        onCloseRef.current?.();
    }, []);

    useEffect(() => {
        if (isOpen) {
            // Reset the close guard on (re)open, then register requestClose (not the
            // raw onClose) so the provider's outside-click handler shares the same
            // single-fire close path.
            closingRef.current = false;
            registerModal(requestClose, modalRef, options);
            return () => {
                unregisterModal();
            };
        }
    }, [isOpen, requestClose, modalRef, options, registerModal, unregisterModal]);

    // Entrance only. Fade in once, shortly after mount, then stay active for the
    // modal's whole life — even while covered by a modal above it — so being
    // re-revealed when the modal above closes is instant, with no second fade-in.
    // (Closing unmounts the modal, so isActive resets naturally on the next open.)
    useEffect(() => {
        if (isActive) return;
        const timer = setTimeout(() => setIsActive(true), 10);
        return () => clearTimeout(timer);
    }, [isActive]);

    return { modalRef, isTopModal: isCurrentlyTop, isActive, requestClose, isModalOpen };
};
