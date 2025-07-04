import { useState, useEffect } from 'react';

export const useSwipe = (onSwipeLeft, onSwipeRight, options = {}) => {
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [isHorizontalScroll, setIsHorizontalScroll] = useState(false);
  const [slideDirection, setSlideDirection] = useState('');
  const [showIndicator, setShowIndicator] = useState(false);

  const {
    minSwipeDistance = 50,
    enableIndicator = true,
    onSwipeStart,
    onSwipeEnd,
    isSwipeActive = true,
    targetRef // Added to target a specific element
  } = options;

  useEffect(() => {
    const targetElement = targetRef?.current;
    if (!targetElement) return; // Only run if target element exists

    const onTouchStart = (e) => {
      if (!isSwipeActive) return;

      const target = e.target;
      const scrollableParent = findScrollableParent(target);
      
      if (scrollableParent && scrollableParent.scrollWidth > scrollableParent.clientWidth) {
        setIsHorizontalScroll(true);
      } else {
        setIsHorizontalScroll(false);
      }

      setTouchEnd(null);
      setTouchStart(e.targetTouches[0].clientX);
      onSwipeStart?.();
    };

    const onTouchMove = (e) => {
      setTouchEnd(e.targetTouches[0].clientX);
    };

    const handleSwipeAnimation = (direction, callback) => {
      setSlideDirection(`slide-${direction}-enter`);
      setShowIndicator(enableIndicator);
      callback?.();
      
      setTimeout(() => {
        setSlideDirection('slide-center');
      }, 50);

      setTimeout(() => {
        setShowIndicator(false);
      }, 800);
    };

    const onTouchEnd = () => {
      if (!isSwipeActive || !touchStart || !touchEnd || isHorizontalScroll) return;
      
      const distance = touchStart - touchEnd;
      const isLeftSwipe = distance > minSwipeDistance;
      const isRightSwipe = distance < -minSwipeDistance;
      
      if (isLeftSwipe && onSwipeLeft) {
        handleSwipeAnimation('left', onSwipeLeft);
      }
      if (isRightSwipe && onSwipeRight) {
        handleSwipeAnimation('right', onSwipeRight);
      }

      onSwipeEnd?.();
    };

    const findScrollableParent = (element) => {
      while (element) {
        if (element.scrollWidth > element.clientWidth) {
          return element;
        }
        element = element.parentElement;
      }
      return null;
    };

    targetElement.addEventListener('touchstart', onTouchStart);
    targetElement.addEventListener('touchmove', onTouchMove);
    targetElement.addEventListener('touchend', onTouchEnd);

    return () => {
      targetElement.removeEventListener('touchstart', onTouchStart);
      targetElement.removeEventListener('touchmove', onTouchMove);
      targetElement.removeEventListener('touchend', onTouchEnd);
    };
  }, [onSwipeLeft, onSwipeRight, touchStart, touchEnd, isHorizontalScroll, minSwipeDistance, enableIndicator, onSwipeStart, onSwipeEnd, isSwipeActive, targetRef]);

  return {
    slideDirection,
    showIndicator,
    setShowIndicator
  };
};