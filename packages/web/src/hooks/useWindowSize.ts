import { useEffect, useState } from 'react';

export function useWindowSize() {
  const [size, setSize] = useState<[number, number]>([
    typeof window !== 'undefined' ? window.innerWidth : 1024,
    typeof window !== 'undefined' ? window.innerHeight : 768,
  ]);

  useEffect(() => {
    const handle = () => {
      setSize([window.innerWidth, window.innerHeight]);
    };
    window.addEventListener('resize', handle, { passive: true });
    return () => {
      window.removeEventListener('resize', handle);
    };
  }, []);

  return size;
}
