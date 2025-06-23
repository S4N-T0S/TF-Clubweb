import { ArrowUp } from 'lucide-react';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { BackToTopProps } from '../types/propTypes';

// Throttle function to limit how often a function can be called.
const throttle = (func, limit) => {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

export const BackToTop = ({ isMobile }) => {
  const [isVisible, setIsVisible] = useState(false);

  // Cross-browser way to get scroll position
  const getScrollPosition = () => {
    return Math.max(
      window.pageYOffset,
      document.documentElement.scrollTop,
      document.body.scrollTop
    );
  };

  // Create a stable reference to the scroll check function
  const checkScroll = useCallback(() => {
    if (getScrollPosition() > 300) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, []);

  // Create throttled version of checkScroll
  const handleScroll = useMemo(
    () => throttle(checkScroll, 100),
    [checkScroll]
  );

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const scrollToTop = () => {
    // Try smooth scroll with fallback
    if ('scrollBehavior' in document.documentElement.style) {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } else {
      // Fallback for browsers that don't support smooth scrolling
      const scrollStep = -window.scrollY / (500 / 15); // 500ms duration
      const scrollInterval = setInterval(() => {
        if (window.scrollY !== 0) {
          window.scrollBy(0, scrollStep);
        } else {
          clearInterval(scrollInterval);
        }
      }, 15);
    }
  };

  return (
    <button
      className={`fixed bg-blue-600 text-white p-3 rounded-full shadow-lg transition-opacity duration-200 hover:bg-blue-700 z-40 ${
        isMobile 
          ? 'bottom-16 right-4' // Positioned above the mobile navbar 
          : 'bottom-4 right-4'  // Keep existing desktop positioning
      } ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={scrollToTop}
      aria-label="Back to top"
      style={{ visibility: isVisible ? 'visible' : 'hidden' }}
    >
      <ArrowUp className="w-6 h-6" />
    </button>
  );
};

BackToTop.propTypes = BackToTopProps;