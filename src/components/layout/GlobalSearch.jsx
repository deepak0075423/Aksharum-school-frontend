import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTeachers, getStudents, getClasses } from '../../api/admin.api';
import Icon from '../ui/icons';

/**
 * One search box for the three things an admin looks up all day — a teacher, a
 * student, a class.
 *
 * It searches the endpoints that already exist rather than a new one: teachers
 * and students both take `?search=`, and the class list is small enough to
 * filter here (fetched once, on first use, then reused).
 *
 * A hit navigates to the list page with the term prefilled AND `?focus=<id>`,
 * so the record is both the only row on screen and visibly flagged when it
 * lands — see hooks/useFocusHighlight.js. Prefilling matters: without it a name
 * on page four of a paginated list would never render for the highlight to find.
 */

const MIN_CHARS  = 2;
const DEBOUNCE   = 280;
const PER_GROUP  = 4;

const unwrap = (res) => {
  const d = res?.data ?? res;
  return Array.isArray(d) ? d : (d?.data ?? []);
};

export default function GlobalSearch() {
  const navigate = useNavigate();
  const boxRef   = useRef(null);
  const inputRef = useRef(null);
  const classesRef = useRef(null);        // fetched once, then cached for the session

  const [term,    setTerm]    = useState('');
  const [open,    setOpen]    = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [results, setResults] = useState([]);
  const [cursor,  setCursor]  = useState(0);

  // Close on an outside click, the way the header's other dropdowns do.
  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // ⌘K / Ctrl-K focuses the box from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const runSearch = useCallback(async (q) => {
    setBusy(true);
    try {
      if (!classesRef.current) {
        classesRef.current = await getClasses().then(unwrap).catch(() => []);
      }
      const [teachers, students] = await Promise.all([
        getTeachers({ search: q, limit: PER_GROUP, status: 'active' }).then(unwrap).catch(() => []),
        getStudents({ search: q, limit: PER_GROUP }).then(unwrap).catch(() => []),
      ]);

      const needle  = q.toLowerCase();
      const classes = (classesRef.current || [])
        .filter(c => (c.className || '').toLowerCase().includes(needle))
        .slice(0, PER_GROUP);

      const rows = [
        ...teachers.slice(0, PER_GROUP).map(t => ({
          id: t._id, kind: 'Teacher', icon: 'teacher',
          title: t.name, sub: t.designation || t.email || '',
          to: `/admin/teachers?search=${encodeURIComponent(t.name || '')}&focus=${t._id}`,
        })),
        ...students.slice(0, PER_GROUP).map(s => ({
          id: s._id, kind: 'Student', icon: 'student',
          title: s.name,
          sub: [s.className, s.sectionName].filter(Boolean).join(' · ')
            || (s.rollNumber ? `Roll ${s.rollNumber}` : s.email || ''),
          to: `/admin/student-analytics/${s._id}`,
        })),
        ...classes.map(c => ({
          id: c._id, kind: 'Class', icon: 'building',
          title: c.className, sub: 'View sections',
          to: `/admin/classes/${c._id}`,
        })),
      ];
      setResults(rows);
      setCursor(0);
    } finally {
      setBusy(false);
    }
  }, []);

  // Debounced so typing a name is one request, not eight.
  useEffect(() => {
    const q = term.trim();
    if (q.length < MIN_CHARS) { setResults([]); setBusy(false); return undefined; }
    const t = setTimeout(() => runSearch(q), DEBOUNCE);
    return () => clearTimeout(t);
  }, [term, runSearch]);

  const go = (row) => {
    if (!row) return;
    setOpen(false);
    setTerm('');
    setResults([]);
    inputRef.current?.blur();
    navigate(row.to);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape')      { setOpen(false); inputRef.current?.blur(); return; }
    if (!results.length) return;
    if (e.key === 'ArrowDown')   { e.preventDefault(); setCursor(c => (c + 1) % results.length); }
    if (e.key === 'ArrowUp')     { e.preventDefault(); setCursor(c => (c - 1 + results.length) % results.length); }
    if (e.key === 'Enter')       { e.preventDefault(); go(results[cursor]); }
  };

  const q       = term.trim();
  const showing = open && q.length >= MIN_CHARS;

  return (
    <div className="gsearch" ref={boxRef}>
      <Icon name="search" size={17} className="gsearch__icon" />
      <input
        ref={inputRef}
        value={term}
        onChange={e => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search students, teachers, classes..."
        aria-label="Search students, teachers and classes"
        autoComplete="off"
      />
      {term
        ? (
          <button className="gsearch__clear" onClick={() => { setTerm(''); inputRef.current?.focus(); }}
            aria-label="Clear search" type="button">
            <Icon name="close" size={14} />
          </button>
        )
        : <kbd className="gsearch__kbd">⌘K</kbd>}

      {showing && (
        <div className="gsearch__panel">
          {busy && !results.length && <div className="gsearch__msg">Searching…</div>}
          {!busy && !results.length && <div className="gsearch__msg">No matches for “{q}”</div>}
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${r.id}`}
              type="button"
              className={`gsearch__row${i === cursor ? ' on' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => go(r)}
            >
              <span className="gsearch__row-icon"><Icon name={r.icon} size={17} /></span>
              <span className="gsearch__row-text">
                <span className="gsearch__row-title">{r.title}</span>
                {r.sub && <span className="gsearch__row-sub">{r.sub}</span>}
              </span>
              <span className="gsearch__row-kind">{r.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
