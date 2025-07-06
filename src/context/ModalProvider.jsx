import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { ModalProviderProps } from '../types/propTypes';

const ModalContext = createContext(null);

export const ModalProvider = ({ children }) => {
  const [modalStack, setModalStack] = useState([]);

  const isModalOpen = modalStack.length > 0;

  useEffect(() => {
    document.body.style.overflow = isModalOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
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

  useEffect(() => {
    if (isModalOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isModalOpen, handleOutsideClick]);

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
  
  const isEffectivelyTopModal = useCallback((ref) => {
    if (modalStack.length === 0) return false;
    
    const modalIndex = modalStack.findIndex(m => m.ref === ref);
    if (modalIndex === -1) return false; // Not in stack

    // It's effectively top if it's the top modal itself.
    if (modalIndex === modalStack.length - 1) return true;

    // Or if all modals stacked on top of it are of type 'nested'.
    for (let i = modalIndex + 1; i < modalStack.length; i++) {
      if (modalStack[i].type !== 'nested') {
        return false; // Found a 'main' modal on top.
      }
    }
    
    return true; // All modals on top are nested.
  }, [modalStack]);

  const value = { registerModal, unregisterModal, isTopModal, isEffectivelyTopModal };

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
    
    const { registerModal, unregisterModal, isTopModal, isEffectivelyTopModal } = context;
    const modalRef = useRef(null);
    const [isActive, setIsActive] = useState(false);

    // We calculate these on every render, as the modal stack could have changed.
    const isCurrentlyTop = isTopModal(modalRef);
    const isEffectivelyTop = isEffectivelyTopModal(modalRef);

    useEffect(() => {
        if (isOpen) {
            // Pass options to registerModal.
            registerModal(onClose, modalRef, options);
            return () => {
                unregisterModal();
            };
        }
    }, [isOpen, onClose, modalRef, options, registerModal, unregisterModal]);

    // This effect manages the 'active' state for animations.
    // It becomes active if it's "effectively" the top modal.
    useEffect(() => {
        // Use a short timeout to allow the modal to be rendered before applying the animation classes.
        if (isEffectivelyTop) {
            const timer = setTimeout(() => setIsActive(true), 10);
            return () => clearTimeout(timer);
        } else {
            setIsActive(false);
        }
    }, [isEffectivelyTop]);

    return { modalRef, isTopModal: isCurrentlyTop, isActive };
};


ModalProvider.propTypes = ModalProviderProps;