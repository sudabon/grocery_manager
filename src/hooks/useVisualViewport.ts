import { useEffect, useRef } from 'react';

export function useVisualViewport() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const offset = Math.min(0, viewport.offsetTop + viewport.height - window.innerHeight);
      if (ref.current) ref.current.style.transform = `translateY(${offset}px)`;
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return ref;
}
