/**
 * The pieces of the Employee Directory's reports screen.
 *
 * Every report is built server-side from the same employee set the directory
 * lists, through the same `matches()` filter — which means the filters on this
 * page are not a client-side nicety: they are sent with the request, so the
 * table on screen and the file that downloads are the same rows. That was the
 * capability the old screen never used.
 *
 * The catalogue itself comes from the server (`listReports`). The map below
 * only adds what a key cannot carry — an icon and a sentence — and anything it
 * does not recognise still renders, so a report added server-side appears here
 * without a frontend change.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import usePhone from '../../hooks/usePhone';
import Icon from '../../components/ui/icons';
import Tabs from '../../components/ui/Tabs';

export const REPORT_META = {
  directory: { icon: 'users', tone: 'indigo',
    desc: 'Every employee with their designation, department, contact details and assignments.' },
  'by-department': { icon: 'building', tone: 'blue',
    desc: 'Headcount per department, split by teaching and non-teaching staff.' },
  'by-designation': { icon: 'badge', tone: 'purple',
    desc: 'Headcount per designation, split by teaching and non-teaching staff.' },
  'by-subject': { icon: 'book', tone: 'teal',
    desc: 'Which teachers are attached to each subject, and how many.' },
  'by-class': { icon: 'grid', tone: 'green',
    desc: 'Who teaches in each class and section, and in what role.' },
  'active-inactive': { icon: 'power', tone: 'amber',
    desc: 'Employment status across the school — active, on leave and inactive.' },
  'new-joiners': { icon: 'userPlus', tone: 'green',
    desc: 'Everyone who joined during the running academic year — the same people the New joiners tile counts.' },
  'service-length': { icon: 'clock', tone: 'blue',
    desc: 'How long each person working here has served, longest first.' },
  birthdays: { icon: 'calendarDays', tone: 'pink',
    desc: 'Birthdays through the year, by month — the day and month only.' },
  'by-gender': { icon: 'users', tone: 'purple',
    desc: 'Headcount by gender, split by teaching and non-teaching staff.' },
  'by-qualification': { icon: 'bookOpen', tone: 'teal',
    desc: 'Headcount by highest qualification on file.' },
  exits: { icon: 'power', tone: 'amber',
    desc: 'Everyone serving notice or who has left, with their last working day and reason.' },
  'profile-completion': { icon: 'activity', tone: 'indigo',
    desc: 'How much of each record is on file, and what is still missing.' },
  'pending-verification': { icon: 'checkCircle', tone: 'amber',
    desc: 'Employees working here with sections still waiting to be signed off.' },
  'missing-documents': { icon: 'files', tone: 'pink',
    desc: 'Who still owes the office a document — a required one not uploaded, or one that was rejected.' },
};

export const metaFor = (key) => REPORT_META[key] || { icon: 'chart', tone: 'indigo', desc: '' };

// ── The catalogue ────────────────────────────────────────────────────────────

/** The reports this school can run. Scrolls rather than wrapping onto two rows. */
export const ReportTabs = ({ reports, active, onPick }) => (
  <Tabs
    variant="pill"
    label="Reports"
    value={active}
    onChange={onPick}
    items={reports.map(r => ({ key: r.key, label: r.label, icon: metaFor(r.key).icon }))}
  />
);

// ── The table ────────────────────────────────────────────────────────────────

/**
 * A column heading that sorts.
 *
 * Sorting happens in the browser: the whole report is already here, and a round
 * trip to reorder rows the client is holding is a round trip for nothing. It is
 * numeric-aware, so a headcount column does not sort 10 before 2.
 */
export const SortHead = ({ label, index, sort, onSort }) => {
  const on = sort.by === index;
  return (
    <th>
      <button type="button" className={`edrsort${on ? ' is-on' : ''}`} onClick={() => onSort(index)}
        aria-label={`Sort by ${label}`}>
        {label}
        <Icon name={on && sort.dir === 'desc' ? 'arrowDown' : 'arrowUp'} size={12} />
      </button>
    </th>
  );
};

export const sortRows = (rows, { by, dir }) => {
  if (by == null) return rows;
  const num = (v) => {
    const raw = String(v ?? '').trim();
    // A date as the reports print it (31-01-2027) sorts by the calendar, not
    // by its first two digits.
    const date = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
    if (date) return Number(`${date[3]}${date[2]}${date[1]}`);
    const s = raw.replace(/[, ]/g, '');
    return s !== '' && !Number.isNaN(Number(s)) ? Number(s) : null;
  };
  const out = [...rows].sort((a, b) => {
    const x = a[by];
    const y = b[by];
    const nx = num(x);
    const ny = num(y);
    if (nx !== null && ny !== null) return nx - ny;
    return String(x ?? '').localeCompare(String(y ?? ''), 'en', { numeric: true, sensitivity: 'base' });
  });
  return dir === 'desc' ? out.reverse() : out;
};

/** An empty cell is a fact — say so rather than leaving a hole in the row. */
export const Cell = ({ value }) => (
  value === '' || value == null
    ? <span className="ed-none">—</span>
    // One line; a long value (a list of classes) ends in "…" with the whole of
    // it in the title — and in full under "More" or on a phone's card.
    : <span className="edrcell" title={String(value)}>{String(value)}</span>
);

/**
 * A report as a table that never scrolls sideways (Nov 23 2026).
 *
 * Reports differ in their columns, so which ones fit cannot be written into a
 * stylesheet: the table is drawn with all of them, and while it is wider than
 * its box the last column is folded away — before the browser paints, so it
 * never shows half-drawn. What is folded opens under the row from its "+N"
 * button. A wider window brings the columns back. On a phone every row is a
 * card with every column.
 */
export function ReportTable({ columns, rows, start, sort, onSort }) {
  const phone = usePhone();
  const wrapRef = useRef(null);
  const tableRef = useRef(null);
  const [fit, setFit] = useState(columns.length);
  const [open, setOpen] = useState(null);
  const shape = `${columns.join('|')}#${start}#${rows.length}#${sort.by}#${sort.dir}`;

  // New columns or a new page of rows: start from all of them again.
  useLayoutEffect(() => { setFit(columns.length); setOpen(null); }, [shape]); // eslint-disable-line react-hooks/exhaustive-deps
  // Fold one more until it fits — every render, before paint.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const table = tableRef.current;
    if (!wrap || !table) return;
    if (table.scrollWidth > wrap.clientWidth + 1 && fit > 1) setFit(fit - 1);
  });
  // Room again: try every column once more (the fold above takes it back down).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return undefined;
    let was = wrap.clientWidth;
    const ro = new ResizeObserver(() => {
      const now = wrap.clientWidth;
      if (now > was + 4) setFit(columns.length);
      was = now;
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [columns.length, phone]);

  if (phone) {
    return (
      <ol className="edrcards" start={start + 1}>
        {rows.map((row, i) => (
          <li key={start + i} className="edrcard">
            <span className="edrcard__num">{start + i + 1}</span>
            <dl>
              {columns.map((c, j) => (
                <div key={c}><dt>{c}</dt><dd><Cell value={row[j]} /></dd></div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    );
  }

  const hidden = columns.length - fit;
  return (
    <div className="table-wrap" ref={wrapRef}>
      <table className="table edl-table edrtable" ref={tableRef}>
        <thead>
          <tr>
            <th className="edrtable__num">#</th>
            {columns.slice(0, fit).map((c, i) => (
              <SortHead key={c} label={c} index={i} sort={sort} onSort={onSort} />
            ))}
            {hidden > 0 && <th className="edrtable__more"><span className="sr-only">More</span></th>}
          </tr>
        </thead>
        <tbody>
          {/* A report row is a positional array with no id of its own — the
              position IS its identity here. */}
          {rows.map((row, i) => (
            <React.Fragment key={start + i}>
              <tr className={open === i ? 'is-open' : undefined}>
                <td className="edrtable__num">{start + i + 1}</td>
                {row.slice(0, fit).map((cell, j) => <td key={j}><Cell value={cell} /></td>)}
                {hidden > 0 && (
                  <td className="edrtable__more">
                    <button type="button" className="edrmore" aria-expanded={open === i}
                      onClick={() => setOpen(open === i ? null : i)}
                      title={open === i ? 'Hide the other columns' : `Show ${columns.slice(fit).join(', ')}`}>
                      +{hidden}
                      <Icon name="chevronDown" size={13} />
                    </button>
                  </td>
                )}
              </tr>
              {hidden > 0 && open === i && (
                <tr className="edrtable__detail">
                  <td colSpan={fit + 2}>
                    <dl className="edrdetail">
                      {columns.slice(fit).map((c, j) => (
                        <div key={c}><dt>{c}</dt><dd><Cell value={row[fit + j]} /></dd></div>
                      ))}
                    </dl>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────

export const Tile = ({ icon, tone, value, label, caption, captionTone, to }) => {
  const body = (
    <>
      <span className={`edl-stat__icon tint-${tone}`}><Icon name={icon} size={22} /></span>
      <span className="edl-stat__body">
        <span className="edl-stat__value">{value ?? 0}</span>
        <span className="edl-stat__label">{label}</span>
        {caption ? <span className={`edl-stat__cap${captionTone ? ` is-${captionTone}` : ''}`}>{caption}</span> : null}
      </span>
    </>
  );
  // `to`: the employee list, filtered to the people the figure counts.
  return to
    ? <Link to={to} className="edl-stat edl-stat--btn">{body}</Link>
    : <div className="edl-stat">{body}</div>;
};

/**
 * What the export will contain.
 *
 * The filters are sent to the server with the download, so the file is the rows
 * on screen rather than the whole school. Saying so is what stops somebody
 * filtering the table, exporting, and finding four hundred rows in the
 * spreadsheet.
 */
export const ExportNote = ({ filtered, anyFilter }) => (
  <p className="edrnote">
    <Icon name={anyFilter ? 'filter' : 'download'} size={14} />
    {anyFilter
      ? <>Filtered. CSV and Excel both carry these filters, so the file holds the same {filtered} {filtered === 1 ? 'row' : 'rows'} shown here.</>
      : <>Nothing is filtered, so an export holds all {filtered} {filtered === 1 ? 'row' : 'rows'}. Narrow the report and the file narrows with it.</>}
  </p>
);
