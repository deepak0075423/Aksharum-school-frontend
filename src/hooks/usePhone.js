import { useEffect, useState } from 'react';

/**
 * True while the screen is phone-sized (≤ 640px — the same line the app's
 * phone layouts use in global.css), and follows a rotation or a resize.
 *
 * For screens that offer a choice of layout (Grid / List, Card / Table) and
 * only show the card layout on a phone: the choice made on a desktop is kept,
 * it is simply not applied while the screen is this narrow.
 */
const QUERY = '(max-width: 640px)';

export default function usePhone() {
  const read = () => {
    try { return window.matchMedia(QUERY).matches; } catch { return false; }
  };
  const [phone, setPhone] = useState(read);

  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(QUERY); } catch { return undefined; }
    const on = () => setPhone(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on);
    else mq.addListener(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on);
      else mq.removeListener(on);
    };
  }, []);

  return phone;
}
