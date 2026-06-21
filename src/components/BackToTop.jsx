import { ArrowUp } from 'lucide-react';
import { useEffect, useState } from 'react';

// Show the button once the page is scrolled past this many pixels.
const SCROLL_THRESHOLD = 300;

export const BackToTop = ({ isMobile }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isMobile) return;
    // Preferred path: drop a sentinel SCROLL_THRESHOLD px down the page and let the browser report when it crosses the viewport edge.
    if ('IntersectionObserver' in window) {
      const sentinel = document.createElement('div');
      sentinel.style.cssText =
        `position:absolute;top:${SCROLL_THRESHOLD}px;left:0;width:1px;height:1px;pointer-events:none;`;
      document.body.appendChild(sentinel);

      const observer = new IntersectionObserver(
        ([entry]) => setIsVisible(!entry.isIntersecting),
        { threshold: 0 }
      );
      observer.observe(sentinel);

      return () => {
        observer.disconnect();
        sentinel.remove();
      };
    }

    // Fallback for browsers without IntersectionObserver: an rAF-throttled scroll handler.
    const getScrollPosition = () =>
      Math.max(
        window.pageYOffset,
        document.documentElement.scrollTop,
        document.body.scrollTop
      );

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setIsVisible(getScrollPosition() > SCROLL_THRESHOLD);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // sync the initial state (e.g. page loaded already scrolled)
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile]);

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

  // Mobile screens have little room to spare, so the back-to-top button is desktop-only
  if (isMobile) return null;

  return (
    <button
      className={`fixed bg-blue-600 text-white p-3 rounded-full shadow-lg transition-opacity duration-200 hover:bg-blue-700 z-40 bottom-4 right-4 ${
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
