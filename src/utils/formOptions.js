/**
 * Values held by a dropdown (Nov 2026).
 *
 * A <select> can only show a value spelled exactly like one of its options.
 * Records carry older spellings — "male" from an early import, "A-" with a
 * hyphen where the list says "A−" with a minus sign, a state typed by hand —
 * and such a value used to sit in the edit wizards unseen: the dropdown looked
 * blank, the step's "required" check was satisfied because the value was not
 * empty, and only the final save (or the server, "Gender must be Male, Female
 * or Other") objected, steps later.
 *
 * So: snap a stored value onto its option when a form loads, and on Next
 * accept only a value the dropdown can actually show. What the admin sees is
 * then exactly what is checked and saved.
 */

export const GENDERS = ['Male', 'Female', 'Other'];

// Same text, whatever its case, spacing, or minus/hyphen/dash.
const fold = (v) => String(v ?? '')
  .replace(/[‐-―−]/g, '-')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

/** The option `value` stands for, written as the list writes it — '' when none. */
export function snapToOption(value, options) {
  if (value === null || value === undefined || value === '') return '';
  if (options.includes(value)) return value;
  const f = fold(value);
  return options.find((o) => fold(o) === f) || '';
}

/** Blank, or exactly one of `options` — i.e. something the dropdown can show. */
export const isOptionOrBlank = (value, options) => !value || options.includes(value);
