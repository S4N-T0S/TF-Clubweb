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

  const registerModal = useCallback((onClose, ref) => {
    setModalStack(stack => [...stack, { onClose, ref }]);
  }, []);

  const unregisterModal = useCallback(() => {
    // Unregister the top-most modal
    setModalStack(stack => stack.slice(0, stack.length - 1));
  }, []);

  const value = { registerModal, unregisterModal };

  return (
    <ModalContext.Provider value={value}>
      {children}
    </ModalContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useModal = (isOpen, onClose) => {
    const context = useContext(ModalContext);
    if (context === null) {
        throw new Error('useModal must be used within a ModalProvider');
    }
    
    const { registerModal, unregisterModal } = context;
    const modalRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            registerModal(onClose, modalRef);
            return () => {
                unregisterModal();
            };
        }
    }, [isOpen, onClose, modalRef, registerModal, unregisterModal]);

    return modalRef;
};


ModalProvider.propTypes = ModalProviderProps;