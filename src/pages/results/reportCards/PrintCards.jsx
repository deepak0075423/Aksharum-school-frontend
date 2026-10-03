/**
 * Prints report cards — one, or a whole section's — without the app around
 * them. The cards are drawn into a layer of their own at the end of <body>;
 * while it is there the print styles (styles/results.css, "Report cards")
 * hide everything else, give each card an A4 page, and keep the colours.
 *
 * The browser's print dialog opens once the cards are laid out and the
 * school's logo has loaded (or failed), and the layer goes when it closes.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReportCardSheet from './ReportCardSheet';

export default function PrintCards({ frame, cards, family = false, onDone }) {
  const box = useRef(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    document.body.classList.add('rc-printing');
    let gone = false;
    const onFocus = () => setTimeout(finish, 300);
    function cleanup() {
      document.body.classList.remove('rc-printing');
      window.removeEventListener('afterprint', finish);
      window.removeEventListener('focus', onFocus);
    }
    function finish() {
      if (gone) return;
      gone = true;
      cleanup();
      done.current?.();
    }
    // Every image settled — loaded or broken — before the dialog, or 2.5s at most.
    const images = [...(box.current?.querySelectorAll('img') || [])];
    const settled = Promise.all(images.map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
    Promise.race([settled, new Promise((r) => setTimeout(r, 2500))]).then(() => {
      if (gone) return;
      window.addEventListener('afterprint', finish);
      // Two frames, so the layer is laid out before the dialog takes its picture.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (gone) return;
        window.print();
        // Where printing does not block (some mobile browsers), the page
        // getting its focus back is the dialog closing.
        window.addEventListener('focus', onFocus);
      }));
    });
    return () => { gone = true; cleanup(); };
  }, []);

  return createPortal(
    <div className="rc-print" ref={box}>
      {cards.map((c) => <ReportCardSheet key={c.student._id} frame={frame} card={c} family={family} />)}
    </div>,
    document.body,
  );
}
