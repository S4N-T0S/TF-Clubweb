import { useState, useCallback, useRef, useEffect } from 'react';

export const useOnHold = (callback, duration = 1000) => {
  const [isHolding, setIsHolding] = useState(false);
  const timerRef = useRef(null);
  const visualFeedbackTimerRef = useRef(null);
  const startTimeRef = useRef(null);
  const preventDefaultRef = useRef(false);
  const nodeRef = useRef(null);
  const lastScrollTop = useRef(0);
  const scrollCheckInterval = useRef(null);

  // Create a cleanup function that can be reused
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (visualFeedbackTimerRef.current) {
      clearTimeout(visualFeedbackTimerRef.current);
      visualFeedbackTimerRef.current = null;
    }
    if (scrollCheckInterval.current) {
      clearInterval(scrollCheckInterval.current);
      scrollCheckInterval.current = null;
    }
    preventDefaultRef.current = false;
    setIsHolding(false);
  }, []);

  const checkIfScrolling = useCallback(() => {
    const currentScrollTop = window.scrollY;
    if (currentScrollTop !== lastScrollTop.current) {
      cleanup();
      lastScrollTop.current = currentScrollTop;
    }
  }, [cleanup]);

  const startHold = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('a')) {
      return;
    }

    lastScrollTop.current = window.scrollY;
    scrollCheckInterval.current = setInterval(checkIfScrolling, 50);
    
    startTimeRef.current = Date.now();
    preventDefaultRef.current = false;
    
    timerRef.current = setTimeout(() => {
      callback();
      cleanup();
    }, duration);

    visualFeedbackTimerRef.current = setTimeout(() => {
      setIsHolding(true);
      preventDefaultRef.current = true;
    }, 250);
  }, [callback, duration, checkIfScrolling, cleanup]);

  const touchMoveHandler = useCallback((e) => {
    if (preventDefaultRef.current) {
      e.preventDefault();
    }
  }, []);

  // Ref callback
  const ref = useCallback(node => {
    if (node) {
      nodeRef.current = node;
      node.addEventListener('touchmove', touchMoveHandler, { passive: false });
    }
  }, [touchMoveHandler]);

  // Cleanup with useEffect
  useEffect(() => {
    return () => {
      if (nodeRef.current) {
        nodeRef.current.removeEventListener('touchmove', touchMoveHandler);
      }
      cleanup();
    };
  }, [touchMoveHandler, cleanup]);

  const holdProps = {
    onTouchStart: startHold,
    onTouchEnd: cleanup,
    onTouchCancel: cleanup,
    onMouseDown: startHold,
    onMouseUp: cleanup,
    onMouseLeave: cleanup,
    style: { 
      touchAction: 'pan-y',
      WebkitUserSelect: 'none',
      userSelect: 'none'
    }
  };

  return { isHolding, holdProps, ref };
};