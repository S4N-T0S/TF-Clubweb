import { useState, useEffect } from 'react';

export const useSwipe = (onSwipeLeft, onSwipeRight) => {
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [isHorizontalScroll, setIsHorizontalScroll] = useState(false);

  const minSwipeDistance = 50;

  useEffect(() => {
    const onTouchStart = (e) => {
      const target = e.target;
      const scrollableParent = findScrollableParent(target);
      
      if (scrollableParent && scrollableParent.scrollWidth > scrollableParent.clientWidth) {
        setIsHorizontalScroll(true);
      } else {
        setIsHorizontalScroll(false);
      }

      setTouchEnd(null);
      setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e) => {
      setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
      if (!touchStart || !touchEnd || isHorizontalScroll) return;
      
      const distance = touchStart - touchEnd;
      const isLeftSwipe = distance > minSwipeDistance;
      const isRightSwipe = distance < -minSwipeDistance;
      
      if (isLeftSwipe && onSwipeLeft) onSwipeLeft();
      if (isRightSwipe && onSwipeRight) onSwipeRight();
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

    document.addEventListener('touchstart', onTouchStart);
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [onSwipeLeft, onSwipeRight, touchStart, touchEnd, isHorizontalScroll]);
};