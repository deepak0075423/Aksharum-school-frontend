/**
 * Tags and small cells the ticket-like hostel screens share — Complaints,
 * Maintenance, Incidents, Discipline: the priority tag, the "assigned to" cell,
 * a date that turns red when it has passed, and the extra-filters popover.
 */
import React, { useRef, useState } from 'react';
import { words } from './hsUI';
import { Badge, Avatar, Btn, Popover, fmtDate, fmtTime } from './hsList';

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const PRIORITY_TONE = { low: 'green', medium: 'amber', high: 'red', urgent: 'red' };
export const Priority = ({ value }) => <Badge tone={PRIORITY_TONE[value] || 'slate'} size="lg" strong={value === 'urgent'}>{words(value)}</Badge>;

/** "Ramesh Kumar" → "Ramesh K." — how the mockups print an assignee. */
export const shortName = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : (parts[0] || '');
};

export const Assignee = ({ name, src, size = 32 }) => (name
  ? <span className="hs-person" title={name}><Avatar name={name} src={src} size={size} /><span className="hs-assignee">{shortName(name)}</span></span>
  : <span className="hs-muted">-</span>);

/** A date on one line and its time under it. */
export const stamp = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '');

/** A due date; red once it has passed and the work is still open. */
export const DueDate = ({ at, late }) => (at ? <span className={late ? 'hs-due is-late' : 'hs-due'}>{fmtDate(at)}</span> : <span className="hs-muted">-</span>);

/**
 * The "Filter" button and what is behind it: groups of single-choice options.
 *   groups: [{ key, title, options: [[value, label]], value, onPick }]
 *   kind:   the button's look — 'primary' where a mockup fills it (Documents)
 */
export function MoreFilters({ groups = [], onReset, kind = 'outline' }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const active = groups.filter((g) => g.value).length;
  return (
    <>
      <Btn ref={btn} kind={kind} icon="filter" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Filter{active ? ` · ${active}` : ''}</Btn>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} label="More filters">
        <div className="hs-menu2" role="menu">
          {groups.map((g, gi) => (
            <React.Fragment key={g.key}>
              {gi ? <div className="hs-menu2__rule" role="separator" /> : null}
              {g.title ? <div className="hs-menu2__title">{g.title}</div> : null}
              {g.options.map(([v, text]) => (
                <button key={v || 'any'} type="button" role="menuitemradio" aria-checked={(g.value || '') === v}
                  className={`hs-menu2__item${(g.value || '') === v ? ' is-on' : ''}`} onClick={() => { g.onPick(v); setOpen(false); }}>
                  <span>{text}</span>
                </button>
              ))}
            </React.Fragment>
          ))}
          {onReset ? (
            <>
              <div className="hs-menu2__rule" role="separator" />
              <button type="button" role="menuitem" className="hs-menu2__item" onClick={() => { onReset(); setOpen(false); }}><span>Reset all filters</span></button>
            </>
          ) : null}
        </div>
      </Popover>
    </>
  );
}
