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
import React from 'react';
import Icon from '../../components/ui/icons';

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
    desc: 'Everyone who joined during the running academic year.' },
  'profile-completion': { icon: 'activity', tone: 'indigo',
    desc: 'How much of each record is on file, and what is still missing.' },
  'pending-verification': { icon: 'checkCircle', tone: 'amber',
    desc: 'Employees with sections still waiting to be signed off.' },
  'missing-documents': { icon: 'files', tone: 'pink',
    desc: 'Documents a record still needs before it can be verified.' },
};

export const metaFor = (key) => REPORT_META[key] || { icon: 'chart', tone: 'indigo', desc: '' };

// ── The catalogue ────────────────────────────────────────────────────────────

/** The reports this school can run. Scrolls rather than wrapping onto two rows. */
export const ReportTabs = ({ reports, active, onPick }) => (
  <nav className="edrtabs" aria-label="Reports">
    {reports.map((r) => {
      const m = metaFor(r.key);
      return (
        <button key={r.key} type="button" onClick={() => onPick(r.key)}
          className={`edrtab${active === r.key ? ' is-on' : ''}`} aria-pressed={active === r.key}>
          <Icon name={m.icon} size={15} /> {r.label}
        </button>
      );
    })}
  </nav>
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
    const s = String(v ?? '').replace(/[, ]/g, '');
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
  value === '' || value == null ? <span className="ed-none">—</span> : <>{String(value)}</>
);

// ── Summary ──────────────────────────────────────────────────────────────────

export const Tile = ({ icon, tone, value, label, caption, captionTone }) => (
  <div className="edl-stat">
    <span className={`edl-stat__icon tint-${tone}`}><Icon name={icon} size={22} /></span>
    <span className="edl-stat__body">
      <span className="edl-stat__value">{value ?? 0}</span>
      <span className="edl-stat__label">{label}</span>
      {caption ? <span className={`edl-stat__cap${captionTone ? ` is-${captionTone}` : ''}`}>{caption}</span> : null}
    </span>
  </div>
);

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
      ? <>Filtered. CSV, Excel and Print all carry these filters, so the file holds the same {filtered} {filtered === 1 ? 'row' : 'rows'} shown here.</>
      : <>Nothing is filtered, so an export holds all {filtered} {filtered === 1 ? 'row' : 'rows'}. Narrow the report and the file narrows with it.</>}
  </p>
);
