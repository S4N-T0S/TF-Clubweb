import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { ModalContextProps } from '../types/propTypes';

const ModalContext = createContext();

export const ModalProvider = ({ children }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [onClose, setOnClose] = useState(null);
  const modalRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = isModalOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen]);

  const handleOutsideClick = useCallback((event) => {
    if (modalRef.current && !modalRef.current.contains(event.target)) {
      if (onClose) onClose();
      setIsModalOpen(false);
    }
  }, [onClose]);

  useEffect(() => {
    if (isModalOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isModalOpen, handleOutsideClick]);

  return (
    <ModalContext.Provider value={{ isModalOpen, setIsModalOpen, modalRef, setOnClose }}>
      {children}
    </ModalContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useModal = () => useContext(ModalContext);

ModalProvider.propTypes = ModalContextProps;