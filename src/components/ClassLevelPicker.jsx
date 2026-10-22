import React from 'react';
import { PRE_PRIMARY, SCHOOL_CLASSES, levelOf } from '../utils/classLevels';

/**
 * Choosing one of the standard classes (utils/classLevels) — the Add Class
 * form and both ends of Bulk Create.
 *
 * A dropdown, pre-primary first: Playgroup / Pre-Nursery, Nursery, LKG / KG1,
 * UKG / KG2, then Class 1 to Class 12. `taken` maps a class number to the
 * class the year already has there, which is shown and cannot be picked
 * again. The value is the class number, as a string ('' for none).
 */
export function ClassLevelSelect({ id, value, onChange, taken = null, placeholder = 'Select a class', required = false }) {
  const option = (l) => {
    const have = taken?.get(l.number);
    return (
      <option key={l.number} value={String(l.number)} disabled={!!have}>
        {l.label}{have ? ` — added${have.className && have.className !== l.label ? ` as ${have.className}` : ''}` : ''}
      </option>
    );
  };
  return (
    <select id={id} className="form-control" value={value} required={required}
      onChange={(e) => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      <optgroup label="Pre-primary">{PRE_PRIMARY.map(option)}</optgroup>
      <optgroup label="Class 1 – 12">{SCHOOL_CLASSES.map(option)}</optgroup>
    </select>
  );
}

/**
 * Which of its two names a pre-primary class goes by — Playgroup or
 * Pre-Nursery, LKG or KG1, UKG or KG2. Nothing is drawn for a class with one
 * name. `value` is the chosen name; the class's first name when unset.
 */
export function ClassNameChoice({ number, value, onChange, label }) {
  const lvl = levelOf(number);
  if (!lvl || lvl.names.length < 2) return null;
  const chosen = value || lvl.names[0];
  return (
    <div className="clvl-names" role="radiogroup" aria-label={label || `Name for ${lvl.label}`}>
      {label && <span className="clvl-names__label">{label}</span>}
      {lvl.names.map((n) => (
        <label key={n} className={`clvl-names__opt${chosen === n ? ' is-on' : ''}`}>
          <input type="radio" name={`clvl-${lvl.number}`} value={n} checked={chosen === n} onChange={() => onChange(n)} />
          {n}
        </label>
      ))}
    </div>
  );
}

/** The class number → existing class, for `taken` above. */
export const takenBy = (classes = []) => new Map((classes || []).map((c) => [Number(c.classNumber), c]));
