import React from 'react';

/**
 * A file chooser drawn by us instead of the browser.
 *
 * The native <input type="file"> paints its own "Choose File | No file chosen"
 * and, in a narrow column on a phone, squeezes the second half to "n…sen".
 * Here the input is visually hidden (still focusable and still what the
 * surrounding <label> points at) and the box shows a button plus the chosen
 * name — the name drops under the button when the column is too narrow, and a
 * long file name wraps instead of being cut.
 *
 * `ref` reaches the real input, so a caller can still clear it
 * (`ref.current.value = ''`).
 */
const FilePick = React.forwardRef(({ accept, onChange, fileName, error, id, disabled }, ref) => (
  <label className={`fpick${error ? ' fpick--error' : ''}${disabled ? ' fpick--off' : ''}`}>
    <input ref={ref} id={id} type="file" className="fpick__input" accept={accept}
      disabled={disabled} onChange={onChange} />
    <span className="fpick__btn" aria-hidden="true">Choose file</span>
    <span className={`fpick__name${fileName ? ' is-set' : ''}`}>{fileName || 'No file chosen'}</span>
  </label>
));
FilePick.displayName = 'FilePick';
export default FilePick;

/** What an identity or record scan may be: a PDF or a picture. */
export const SCAN_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

/**
 * True for a PDF / JPG / PNG — by name AND, where the browser says, by type.
 * The accept list only steers the picker; "All files" in it lets an Excel
 * sheet through, so the pick itself is checked too (the server refuses it as
 * well — middleware/upload.js scanFilter).
 */
export const isScan = (file) => {
  if (!file) return false;
  const named = /\.(pdf|jpe?g|png)$/i.test(file.name || '');
  const type = file.type || '';
  const typed = !type || /^(application\/pdf|image\/(jpeg|png))$/.test(type);
  return named && typed;
};
