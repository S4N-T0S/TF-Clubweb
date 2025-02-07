import { useState, useCallback, useRef, useEffect } from 'react';

export const useOnHold = (callback, duration = 1700) => {  // Increased default duration
  const [isHolding, setIsHolding] = useState(false);
  const timerRef = useRef(null);
  const visualFeedbackTimerRef = useRef(null);
  const nodeRef = useRef(null);
  const lastScrollTop = useRef(0);
  const scrollCheckInterval = useRef(null);

  const cleanup = useCallback(() => {
    timerRef.current && clearTimeout(timerRef.current);
    visualFeedbackTimerRef.current && clearTimeout(visualFeedbackTimerRef.current);
    scrollCheckInterval.current && clearInterval(scrollCheckInterval.current);
    timerRef.current = null;
    visualFeedbackTimerRef.current = null;
    scrollCheckInterval.current = null;
    setIsHolding(false);
  }, []);

  const checkIfScrolling = useCallback(() => {
    if (window.scrollY !== lastScrollTop.current) {
      cleanup();
      lastScrollTop.current = window.scrollY;
    }
  }, [cleanup]);

  const startHold = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('a')) return;

    lastScrollTop.current = window.scrollY;
    scrollCheckInterval.current = setInterval(checkIfScrolling, 30);  // More frequent checks for scrolling

    // Increased the prevention delay from 250ms to 700ms
    visualFeedbackTimerRef.current = setTimeout(() => {
      setIsHolding(true);
    }, 700);

    // Main callback after full duration
    timerRef.current = setTimeout(() => {
      callback();
      cleanup();
    }, duration);

  }, [callback, duration, checkIfScrolling, cleanup]);

  // Cancel immediately on any movement
  const touchMoveHandler = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const ref = useCallback(node => {
    if (node) {
      nodeRef.current = node;
      node.addEventListener('touchmove', touchMoveHandler, { passive: false });
    }
  }, [touchMoveHandler]);

  useEffect(() => {
    return () => {
      nodeRef.current?.removeEventListener('touchmove', touchMoveHandler);
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