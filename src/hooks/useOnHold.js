import { useState, useCallback, useRef, useEffect } from 'react';

export const useOnHold = (callback, duration = 1000) => {
  const [isHolding, setIsHolding] = useState(false);
  const timerRef = useRef(null);
  const visualFeedbackTimerRef = useRef(null);
  const startTimeRef = useRef(null);
  const preventDefaultRef = useRef(false);
  const nodeRef = useRef(null);

  const startHold = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('a')) {
      return;
    }
    
    startTimeRef.current = Date.now();
    preventDefaultRef.current = false;
    
    timerRef.current = setTimeout(() => {
      callback();
      setIsHolding(false);
      timerRef.current = null;
    }, duration);

    visualFeedbackTimerRef.current = setTimeout(() => {
      setIsHolding(true);
      preventDefaultRef.current = true;
    }, 250);
  }, [callback, duration]);

  const endHold = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (visualFeedbackTimerRef.current) {
      clearTimeout(visualFeedbackTimerRef.current);
      visualFeedbackTimerRef.current = null;
    }
    preventDefaultRef.current = false;
    setIsHolding(false);
  }, []);

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
    };
  }, [touchMoveHandler]);

  const holdProps = {
    onTouchStart: startHold,
    onTouchEnd: endHold,
    onTouchCancel: endHold,
    onMouseDown: startHold,
    onMouseUp: endHold,
    onMouseLeave: endHold,
    style: { 
      touchAction: 'manipulation',
      WebkitUserSelect: 'none',
      userSelect: 'none'
    }
  };

  return { isHolding, holdProps, ref };
};