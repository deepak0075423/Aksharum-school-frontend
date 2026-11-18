import { useEffect, useState } from 'react';

/**
 * Whether a CSS media query matches right now, following a rotation or a
 * resize — `useMediaQuery('(max-width: 1024px)')`.
 *
 * usePhone() is this with the phone line fixed in; this takes any line, for a
 * screen that switches layout at a tablet width too (the Documents list shows
 * cards only on phones and tablets: its table cannot fit there without a
 * sideways scroll).
 */
export default function useMediaQuery(query) {
  const read = () => {
    try { return window.matchMedia(query).matches; } catch { return false; }
  };
  const [matches, setMatches] = useState(read);

  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(query); } catch { return undefined; }
    const on = () => setMatches(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on);
    else mq.addListener(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on);
      else mq.removeListener(on);
    };
  }, [query]);

  return matches;
}
