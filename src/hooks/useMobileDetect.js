import { useState, useEffect, useCallback } from 'react';

export const useMobileDetect = (breakpoint = 768) => {
  const getIsMobile = useCallback(() => window.innerWidth <= breakpoint, [breakpoint]);
  const [isMobile, setIsMobile] = useState(getIsMobile);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(getIsMobile());
    };

    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getIsMobile]);

  return isMobile;
};