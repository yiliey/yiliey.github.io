'use client';

import { useEffect, useState } from 'react';

/**
 * The theme that is actually on the page right now.
 *
 * The canvas layers used `useTheme()` from next-themes, but this site never
 * mounts next-themes' provider (it has its own zustand ThemeProvider), so that
 * hook always returned `undefined` and every particle stayed in its light-mode
 * colour — dark ink dots on a dark background. Reading the attribute that both
 * the inline boot script and ThemeProvider write is correct in both cases, and
 * keeps the canvases out of the theme plumbing entirely.
 */
export function useResolvedTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const root = document.documentElement;
    const read = () =>
      setTheme(root.getAttribute('data-theme') === 'dark' || root.classList.contains('dark') ? 'dark' : 'light');

    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

/**
 * True when the visitor has asked for less motion, or is on a device where
 * "move the cursor closer" is not an available gesture. Both cases get the
 * content plainly, with no noise in front of it.
 */
export function useCalmMode(): boolean {
  const [calm, setCalm] = useState(true); // assume calm until proven otherwise

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce), (hover: none), (pointer: coarse)');
    const sync = () => setCalm(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return calm;
}
