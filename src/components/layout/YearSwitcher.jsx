import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import { viewYear, viewYearHeader, setViewYear, onViewYearChange } from '../../utils/yearView';
import Icon from '../ui/icons';

/**
 * The academic year the whole app is showing (Nov 2026).
 *
 * Every module reads one academic year: the school's active year, unless this
 * switcher is on another. Choosing a year here changes what every list, tile
 * and report shows — nothing else: new entries still go to the school's current
 * year, which the notice under the header says while another year is in view.
 *
 * Offered to the people who work with records — administrators and teachers.
 * Students and parents always see the school's current year.
 */
const STAFF = ['school_admin', 'teacher'];

function useYears() {
  const { user } = useAuth();
  const schoolId = user?.school?._id || user?.school || '';
  const staff = STAFF.includes(user?.role);
  const [state, setState] = useState({ years: [], active: '', viewing: '' });

  const load = useCallback(() => {
    if (!staff || !schoolId) {
      // A student's or parent's seat in the same tab never carries a year
      // somebody chose while signed in as staff.
      if (user?.role && !staff && viewYearHeader()) setViewYear('', '');
      setState({ years: [], active: '', viewing: '' });
      return;
    }
    api.get('/profile/academic-years')
      .then((r) => {
        const d = r?.data || {};
        const years = Array.isArray(d.years) ? d.years : [];
        // A stored choice the school no longer has (a deleted year, another
        // school's year after switching account) is dropped.
        const stored = viewYear(schoolId);
        if (stored && !years.some((y) => String(y._id) === stored)) setViewYear(schoolId, '');
        setState({ years, active: d.active || '', viewing: (stored && years.some((y) => String(y._id) === stored)) ? stored : (d.active || d.viewing || '') });
      })
      .catch(() => {});
  }, [staff, schoolId, user?.role]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onViewYearChange(() => load()), [load]);
  // The Academic Years screen changed the list (added, renamed, set active).
  useEffect(() => {
    const again = () => load();
    window.addEventListener('academic-years:changed', again);
    return () => window.removeEventListener('academic-years:changed', again);
  }, [load]);

  return { ...state, schoolId, staff };
}

export default function YearSwitcher() {
  const { years, active, viewing, schoolId, staff } = useYears();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc  = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  // Nothing to switch between: say nothing.
  if (!staff || years.length < 2) return null;

  const current = years.find((y) => String(y._id) === String(viewing)) || null;
  const elsewhere = !!current && String(current._id) !== String(active);

  const pick = (id) => {
    setOpen(false);
    if (String(id) === String(viewing)) return;
    setViewYear(schoolId, String(id) === String(active) ? '' : id);
  };

  return (
    <div className="dropdown yearsw" ref={ref}>
      <button type="button" className={`yearsw__btn${elsewhere ? ' is-elsewhere' : ''}`}
        onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        title="Academic year shown across the app">
        <Icon name="calendar" size={16} />
        <span className="yearsw__text">
          <span className="yearsw__label">Academic year</span>
          <span className="yearsw__value">{current?.yearName || '—'}</span>
        </span>
        <Icon name="chevronDown" size={14} className="yearsw__caret" />
      </button>

      {open && (
        <div className="dropdown-menu yearsw__menu" role="listbox" aria-label="Academic year">
          <div className="yearsw__head">Show data for</div>
          {[...years].reverse().map((y) => {
            const on = String(y._id) === String(viewing);
            return (
              <button key={y._id} type="button" role="option" aria-selected={on}
                className={`dropdown-item yearsw__item${on ? ' is-on' : ''}`} onClick={() => pick(y._id)}>
                <span className="yearsw__name">{y.yearName}</span>
                {String(y._id) === String(active) && <span className="yearsw__tag">Current</span>}
                {on && <Icon name="check" size={16} className="yearsw__check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Shown under the header while a year other than the school's current one is
 * in view — so nobody mistakes last year's lists for today's, and everybody
 * knows where a new entry will go.
 */
export function YearViewNotice() {
  const { years, active, viewing, schoolId, staff } = useYears();
  if (!staff || !viewing || !active || String(viewing) === String(active)) return null;
  const shown = years.find((y) => String(y._id) === String(viewing));
  const now   = years.find((y) => String(y._id) === String(active));
  if (!shown) return null;
  return (
    <div className="yearnote" role="status">
      <Icon name="calendar" size={16} />
      <span>
        You are viewing <strong>{shown.yearName}</strong>. Lists and reports show that year’s records;
        anything you add is saved to the current year{now ? <> (<strong>{now.yearName}</strong>)</> : null}.
      </span>
      <button type="button" className="yearnote__back" onClick={() => setViewYear(schoolId, '')}>
        Back to {now?.yearName || 'current year'}
      </button>
    </div>
  );
}
