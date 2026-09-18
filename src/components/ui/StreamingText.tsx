'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * A heading that arrives the way a model emits one: token by token, each
 * settling out of blur, with a caret that runs ahead and retires at the end.
 *
 * It starts when the heading scrolls into view rather than on mount, so the
 * effect is spent where someone is actually looking. With reduced motion, or
 * before hydration, the text is simply there.
 */
export default function StreamingText({
  text,
  className = '',
  as: Tag = 'span',
  step = 42,
}: {
  text: string;
  className?: string;
  as?: 'span' | 'h1' | 'h2' | 'h3';
  step?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<'idle' | 'streaming' | 'done'>('idle');

  // Whitespace stays attached to its token so the spacing survives
  // `display: inline-block`, and lines still break between words.
  const tokens = useMemo(() => text.match(/\S+\s*/g) ?? [text], [text]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setState('done');
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      setState('streaming');
      window.setTimeout(() => setState('done'), tokens.length * step + 520);
    }, { rootMargin: '-8% 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [tokens.length, step]);

  return (
    <Tag
      ref={ref as never}
      className={className}
      data-stream={state}
      style={{ '--step': `${step}ms` } as React.CSSProperties}
    >
      {tokens.map((token, i) => (
        <span key={i} data-token="" style={{ '--i': i } as React.CSSProperties}>
          {token}
        </span>
      ))}
      <span data-caret="" aria-hidden="true" />
    </Tag>
  );
}
