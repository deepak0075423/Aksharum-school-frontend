/**
 * Publish readiness on screen: the checklist, the Publish button that stays
 * disabled until it passes (and says why when pressed), and the row-menu entry.
 *
 * Imports nothing from the exam parts, so both pages/admin/examParts.jsx and
 * pages/exams/examShared.jsx can use it without importing each other.
 */
import React, { useEffect, useRef, useState } from 'react';
import Icon from '../../components/ui/icons';
import { MenuItem } from '../admin/documentParts';

/** Every publish check, ticked or not, with what to do about the ones that are not. */
export function ReadinessList({ readiness, dense = false }) {
  if (!readiness) return null;
  return (
    <ul className={`apxready${dense ? ' apxready--dense' : ''}`}>
      {readiness.checks.map((c) => (
        <li key={c.key} className={c.ok ? 'is-ok' : 'is-missing'}>
          <Icon name={c.ok ? 'checkCircle' : 'alert'} size={17} />
          <span>
            <strong>{c.label}</strong>
            <small>{c.detail}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ReadinessPanel({ readiness, title = 'Publish checklist', children }) {
  if (!readiness) return null;
  const done = readiness.checks.filter((c) => c.ok).length;
  return (
    <section className={`apxreadypanel${readiness.ready ? ' is-ready' : ''}`}>
      <header>
        <strong>{title}</strong>
        <span>{readiness.ready ? 'Ready to publish' : `${done} of ${readiness.checks.length} complete`}</span>
      </header>
      <div className="apxreadypanel__bar"><span style={{ width: `${(done / readiness.checks.length) * 100}%` }} /></div>
      <ReadinessList readiness={readiness} />
      {children}
    </section>
  );
}

/**
 * Publish, only once the exam is complete.
 *
 * Looks and announces itself disabled until every check passes, but still
 * answers a click: pressing it opens the list of what is incomplete, rather
 * than doing nothing and leaving the teacher to guess why.
 */
export function PublishButton({ readiness, onPublish, busy, label = 'Publish Exam', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const ready = !!readiness?.ready;

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  useEffect(() => { if (ready) setOpen(false); }, [ready]);

  const missing = readiness?.checks.filter((c) => !c.ok) || [];
  return (
    <span className="apxpublish" ref={ref}>
      <button type="button"
        className={`btn btn-primary apxpublish__btn${ready ? '' : ' is-blocked'}`}
        aria-disabled={!ready || busy}
        aria-expanded={ready ? undefined : open}
        title={ready ? 'Publish to students' : readiness?.message}
        onClick={() => { if (busy) return; if (ready) onPublish(); else setOpen((o) => !o); }}>
        <Icon name={ready ? 'checkCircle' : 'alert'} size={16} />
        {busy ? 'Publishing…' : label}
      </button>
      {open && !ready && (
        <div className={`apxpublish__pop apxpublish__pop--${align}`} role="alert">
          <strong>Can’t publish yet</strong>
          <p>Finish {missing.length === 1 ? 'this' : `these ${missing.length} things`} first:</p>
          <ul>
            {missing.map((c) => <li key={c.key}><Icon name="alert" size={14} /><span><b>{c.label}:</b> {c.detail}</span></li>)}
          </ul>
        </div>
      )}
    </span>
  );
}

/** The Publish entry in a row menu — still clickable when blocked, so it can say why. */
export const PublishMenuItem = ({ exam, onPublish }) => (exam.readiness?.ready
  ? <MenuItem icon="checkCircle" onClick={onPublish}>Publish</MenuItem>
  : (
    <button type="button" className="docmenu__item apxmenu__blocked" aria-disabled="true" onClick={onPublish}
      title={exam.readiness?.message}>
      <Icon name="alert" size={16} />
      <span>Publish<small>{exam.readiness?.checks.find((c) => !c.ok)?.detail}</small></span>
    </button>
  ));
