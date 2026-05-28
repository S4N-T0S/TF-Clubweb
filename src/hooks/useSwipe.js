import { useEffect, useRef, useState } from 'react';

export const useSwipe = (onSwipeLeft, onSwipeRight, options = {}) => {
  const [slideDirection, setSlideDirection] = useState('');
  const [showIndicator, setShowIndicator] = useState(false);

  const {
    minSwipeDistance = 50,
    enableIndicator = true,
    onSwipeStart,
    onSwipeEnd,
    isSwipeActive = true,
    targetRef
  } = options;

  // Keep the latest callbacks/config in refs so the touch listeners can be
  // bound a single time and never go stale. Re-binding on every touchmove (the
  // previous implementation) made gestures drop events and feel inconsistent.
  const cfgRef = useRef();
  cfgRef.current = {
    onSwipeLeft, onSwipeRight, onSwipeStart, onSwipeEnd,
    minSwipeDistance, enableIndicator, isSwipeActive,
  };

  useEffect(() => {
    const targetElement = targetRef?.current;
    if (!targetElement) return undefined;

    // Per-gesture tracking lives in a ref, not state, so updating it never
    // re-runs this effect (which would rebind listeners mid-swipe).
    const gesture = { startX: 0, startY: 0, x: 0, y: 0, horizontalScroll: false };
    let timers = [];

    const findScrollableParent = (element) => {
      while (element && element !== targetElement.parentElement) {
        if (element.scrollWidth > element.clientWidth) return element;
        element = element.parentElement;
      }
      return null;
    };

    const onTouchStart = (e) => {
      if (!cfgRef.current.isSwipeActive) return;
      const scrollable = findScrollableParent(e.target);
      gesture.horizontalScroll = !!scrollable;
      const t = e.targetTouches[0];
      gesture.startX = gesture.x = t.clientX;
      gesture.startY = gesture.y = t.clientY;
      cfgRef.current.onSwipeStart?.();
    };

    const onTouchMove = (e) => {
      const t = e.targetTouches[0];
      gesture.x = t.clientX;
      gesture.y = t.clientY;
    };

    const runAnimation = (direction, callback) => {
      setSlideDirection(`slide-${direction}-enter`);
      setShowIndicator(cfgRef.current.enableIndicator);
      callback?.();
      timers.push(setTimeout(() => setSlideDirection('slide-center'), 50));
      timers.push(setTimeout(() => setShowIndicator(false), 800));
    };

    const onTouchEnd = () => {
      const cfg = cfgRef.current;
      if (!cfg.isSwipeActive || gesture.horizontalScroll) return;

      const dx = gesture.startX - gesture.x;
      const dy = gesture.startY - gesture.y;

      // Only treat as a horizontal swipe when horizontal travel dominates —
      // otherwise vertical scrolling through long content fires a false swipe.
      if (Math.abs(dx) <= Math.abs(dy)) { cfg.onSwipeEnd?.(); return; }

      if (dx > cfg.minSwipeDistance && cfg.onSwipeLeft) {
        runAnimation('left', cfg.onSwipeLeft);
      } else if (dx < -cfg.minSwipeDistance && cfg.onSwipeRight) {
        runAnimation('right', cfg.onSwipeRight);
      }
      cfg.onSwipeEnd?.();
    };

    targetElement.addEventListener('touchstart', onTouchStart);
    targetElement.addEventListener('touchmove', onTouchMove);
    targetElement.addEventListener('touchend', onTouchEnd);

    return () => {
      targetElement.removeEventListener('touchstart', onTouchStart);
      targetElement.removeEventListener('touchmove', onTouchMove);
      targetElement.removeEventListener('touchend', onTouchEnd);
      timers.forEach(clearTimeout);
    };
  }, [targetRef]);

  return {
    slideDirection,
    showIndicator,
    setShowIndicator
  };
};