import React, { useEffect, useRef, useState } from 'react';
import { searchMembers } from '../../api/library.api';
import DropdownPanel, { isInsideDropdown } from '../ui/DropdownPanel';

// The issue counter used to ask the librarian to paste a user UUID, because the
// only member lookup in the app was admin-only and a Librarian-designated
// teacher could not call it. This talks to the library's own lookup instead.
//
// The result rows carry the member's live loan count and outstanding fine, so a
// refusal is visible before the form is submitted rather than after.
/**
 * `compact` drops the label and tightens the control so it sits in a filter bar
 * next to the select boxes, rather than as a form field in a modal.
 */
export default function MemberPicker({ value, onChange, role, label = 'Member', autoFocus, compact = false, placeholder }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [picked,  setPicked]  = useState(null);
  const boxRef   = useRef(null);
  const fieldRef = useRef(null);   // what the suggestion list is anchored to

  useEffect(() => {
    if (!value) setPicked(null);
  }, [value]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    let live = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await searchMembers(query.trim(), role);
        if (live) { setResults(res?.data || []); setOpen(true); }
      } catch { if (live) setResults([]); }
      finally { if (live) setLoading(false); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query, role]);

  // Clicking away closes the list without clearing what was already picked.
  // The list is portalled to <body>, so "inside" has to account for that too.
  useEffect(() => {
    const away = (e) => { if (!isInsideDropdown(e.target, boxRef.current)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const choose = (m) => {
    setPicked(m);
    setQuery('');
    setResults([]);
    setOpen(false);
    onChange(m._id, m);
  };

  const clear = () => { setPicked(null); setQuery(''); onChange('', null); };

  const hint = placeholder || 'Search by name or admission number…';

  return (
    <div className={compact ? '' : 'form-group'} ref={boxRef} style={compact ? { width: 220 } : undefined}>
      {!compact && <label className="form-label required">{label}</label>}

      {picked ? (
        compact ? (
          // In a filter bar the picked member is a chip the width of the field,
          // so the row does not reflow when someone is chosen.
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                        background: 'var(--bg)', height: 38 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: '0.85rem', fontWeight: 600,
                           overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {picked.name}
            </span>
            <button type="button" className="btn-icon" onClick={clear} title="Clear member filter"
              style={{ color: 'var(--text-muted)', lineHeight: 1 }}>✕</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{picked.name}</strong>
              <div className="text-muted text-sm">
                {[picked.identifier, picked.detail, picked.role].filter(Boolean).join(' · ')}
              </div>
            </div>
            <MemberState m={picked} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={clear}>Change</button>
          </div>
        )
      ) : (
        <div ref={fieldRef}>
          <input
            className="form-control"
            autoFocus={autoFocus}
            placeholder={hint}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
          />
        </div>
      )}

      <DropdownPanel anchorRef={fieldRef} open={open && !picked}>
        {loading && <div style={{ padding: 12 }} className="text-muted text-sm">Searching…</div>}
        {!loading && results.length === 0 && (
          <div style={{ padding: 12 }} className="text-muted text-sm">No member matches “{query}”.</div>
        )}
        {results.map(m => (
          <button key={m._id} type="button" onClick={() => choose(m)}
            style={{
              display: 'flex', width: '100%', gap: 10, alignItems: 'center', textAlign: 'left',
              padding: '9px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
            }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: '0.92rem' }}>{m.name}</strong>
              <span className="text-muted text-sm" style={{ display: 'block' }}>
                {[m.identifier, m.detail, m.role].filter(Boolean).join(' · ')}
              </span>
            </span>
            <MemberState m={m} />
          </button>
        ))}
      </DropdownPanel>
    </div>
  );
}

// What would stop this person borrowing, shown before the librarian commits.
const MemberState = ({ m }) => (
  <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
    {m.overdue > 0 && <span className="badge badge-danger">{m.overdue} overdue</span>}
    {m.finesDue > 0 && <span className="badge badge-warning">₹{m.finesDue}</span>}
    {!m.overdue && !m.finesDue && <span className="badge badge-muted">{m.booksOut} out</span>}
  </span>
);
