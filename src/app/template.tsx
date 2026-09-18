'use client';

/**
 * A template remounts on every navigation, which is what lets the incoming
 * page animate in. The page does not pop: it settles in over most of a second
 * while the meteors behind it are still decaying, so it reads as having been
 * carried in by them rather than swapped underneath them.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-arrive">{children}</div>;
}
