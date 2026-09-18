'use client';

import { useEffect, useState } from 'react';
import { useThemeStore } from '@/lib/stores/themeStore';

type MediaQueryListWithDeprecated = MediaQueryList & {
  addListener?: (listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void) => void;
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;

    const apply = () => {
      const effective = 'dark' as const; // night only
      void theme;
      root.classList.remove('light', 'dark');
      root.classList.add(effective);
      root.setAttribute('data-theme', effective);
    };

    apply();

    // If following system, update on OS preference changes
    let media: MediaQueryList | null = null;
    const onChange = () => apply();
    if (theme === 'system' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      media = window.matchMedia('(prefers-color-scheme: dark)') as MediaQueryListWithDeprecated;
      try {
        media.addEventListener('change', onChange);
      } catch {
        // Safari <14 fallback - addListener is deprecated
        media?.addListener?.(onChange);
      }
    }

    return () => {
      if (media) {
        try {
          media.removeEventListener('change', onChange);
        } catch {
          // Safari <14 fallback - removeListener is deprecated
          (media as MediaQueryListWithDeprecated)?.removeListener?.(onChange);
        }
      }
    };
  }, [theme, mounted]);

  // The initial theme is applied by the inline script in app/layout.tsx.
  // Keep the page visible during hydration so a client-side error cannot hide
  // the entire site, including the navigation.
  return <>{children}</>;
}
