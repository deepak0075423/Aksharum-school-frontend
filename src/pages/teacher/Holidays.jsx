/**
 * Teacher → Holidays.
 *
 * Two questions, two tabs. **My holidays** is "when am I off?" — the days the
 * school has declared for staff, on a calendar and in two lists, because a
 * holiday three weeks out and one that has been and gone are read differently.
 * **My class holidays** is "when do my classes not meet?" — days off for the
 * classes this teacher takes, which do not stop the teacher working and are
 * therefore a schedule question, not a leave one.
 *
 * Read-only on purpose: holidays are declared by the school. A teacher who
 * wants a day off applies for leave, and the card on the right says so rather
 * than offering a button that would only ever be refused.
 *
 * Built on the admin screen's parts (pages/admin/holidayParts) so a type is
 * named, coloured and dated the same way wherever it is read — including the
 * date handling, which keeps everything as `YYYY-MM-DD` strings from end to
 * end. A holiday parsed into a Date and printed back is a holiday that lands on
 * the wrong day for anyone west of Greenwich.
 */
import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { useModules } from '../../contexts/ModulesContext';
import { getHolidays, getClassHolidays } from '../../api/teacher.api';
import { Alert, Button, Modal, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { ListTable, ListFooter } from '../admin/listParts';
import {
  HolidayDialog, HolidayList, MonthCalendar, TypeChip, dayKey, daysOf, daysUntil,
  fmtRange, spanDays, statusOf, tintFor, today,
} from '../admin/holidayParts';

const MONTH_START = () => { const n = new Date(); return [n.getFullYear(), n.getMonth()]; };

/** Is this day inside the current calendar month? */
const inThisMonth = (key) => key.slice(0, 7) === today().slice(0, 7);

const thisMonthName = () => new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/** How far off the nearest holiday still to come is, said in words. */
const nextLine = (list) => {
  const soon = list
    .filter((h) => statusOf(h) !== 'past')
    .map((h) => daysUntil(dayKey(h.startDate)))
    .sort((a, b) => a - b)[0];
  if (soon === undefined) return 'Nothing scheduled';
  if (soon <= 0) return 'One is on today';
  if (soon === 1) return 'The next is tomorrow';
  return `The next is in ${soon} days`;
};

// The three figures above "My Holidays", and the four above the class tab.
// Returned as data so the header can lay them out without knowing which tab it
// is drawing.
const myStats = (list) => {
  const past = list.filter((h) => statusOf(h) === 'past').length;
  return [
    { icon: 'calendar', tone: 'indigo', value: list.length, label: 'Total holidays',
      caption: `${past} been · ${list.length - past} to come` },
    { icon: 'sunrise', tone: 'green', value: list.length - past, label: 'Still to come',
      caption: nextLine(list) },
    { icon: 'checkSquare', tone: 'amber', value: list.filter((h) => daysOf(h).some(inThisMonth)).length,
      label: 'This month', caption: thisMonthName() },
  ];
};

const classStats = (list) => [
  { icon: 'calendar', tone: 'indigo', value: list.length, label: 'Class holidays',
    caption: 'Across the classes you take' },
  { icon: 'sunrise', tone: 'green', value: list.filter((h) => statusOf(h) !== 'past').length,
    label: 'Still to come', caption: nextLine(list) },
  { icon: 'checkSquare', tone: 'amber', value: list.filter((h) => daysOf(h).some(inThisMonth)).length,
    label: 'This month', caption: thisMonthName() },
  { icon: 'users', tone: 'purple', value: new Set(list.flatMap((h) => h.myClasses || [])).size,
    label: 'Classes affected', caption: 'Of the ones you teach' },
];

export default function TeacherHolidays() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'class' ? 'class' : 'my';
  const setTab = (t) => setParams((p) => { if (t === 'class') p.set('tab', t); else p.delete('tab'); return p; }, { replace: true });

  const { data: mineData, meta: mineMeta, loading: loadingMine } = useFetch(getHolidays);
  const { data: clsData,  meta: clsMeta,  loading: loadingCls }  = useFetch(getClassHolidays);

  const mine    = useMemo(() => (Array.isArray(mineData) ? mineData : []), [mineData]);
  const classes = useMemo(() => (Array.isArray(clsData) ? clsData : []), [clsData]);
  // The school's own type list, so a type is named and coloured as the school
  // set it up rather than from a guess baked into this page.
  const types   = mineMeta?.types || clsMeta?.types || [];

  // The figures belong to whichever tab is open — the counts on the class tab
  // are about classes, not about the reader's own days off.
  const stats = tab === 'my' ? myStats(mine) : classStats(classes);

  return (
    <div className="page listpg holpg holtch">
      <header className="holtch-top">
        <div className="holtch-title">
          <span className="holtch-title__icon tint-indigo"><Icon name="calendarDays" size={26} /></span>
          <div>
            <h1>{tab === 'my' ? 'My Holidays' : 'My Class Holidays'}</h1>
            <p>
              {tab === 'my'
                ? 'All holidays that apply to you and your classes.'
                : 'Holidays for classes where you are class teacher, vice class teacher, or subject teacher.'}
            </p>
          </div>
        </div>

        <div className="holtch-figs">
          {stats.map((f) => (
            <div className="holtch-fig" key={f.label}>
              <span className={`holtch-fig__icon tint-${f.tone}`}><Icon name={f.icon} size={19} /></span>
              <span>
                <b>{f.value}</b>
                <small>{f.label}</small>
                <em>{f.caption}</em>
              </span>
            </div>
          ))}
        </div>
      </header>

      <nav className="holtch-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'my'}
          className={tab === 'my' ? 'is-on' : ''} onClick={() => setTab('my')}>
          My Holidays
        </button>
        <button type="button" role="tab" aria-selected={tab === 'class'}
          className={tab === 'class' ? 'is-on' : ''} onClick={() => setTab('class')}>
          My Class Holidays
          {classes.length ? <b>{classes.length}</b> : null}
        </button>
      </nav>

      {tab === 'my'
        ? <MyHolidays holidays={mine} classHolidays={classes} types={types} loading={loadingMine} />
        : <ClassHolidays holidays={classes} types={types} loading={loadingCls}
            classNames={clsMeta?.classes || []} />}
    </div>
  );

}

// ═════════════════════════════════════════════════════════════════════════════
//  My holidays
// ═════════════════════════════════════════════════════════════════════════════

function MyHolidays({ holidays, classHolidays, types, loading }) {
  const { isEnabled } = useModules();
  const [month, setMonth] = useState(MONTH_START);
  const [picked, setPicked] = useState(null);

  const groups = useMemo(() => {
    const out = { ongoing: [], upcoming: [], past: [] };
    holidays.forEach((h) => out[statusOf(h)].push(h));
    // Nearest first for what is coming, most recent first for what has gone.
    out.upcoming.sort((a, b) => dayKey(a.startDate).localeCompare(dayKey(b.startDate)));
    out.past.sort((a, b) => dayKey(b.startDate).localeCompare(dayKey(a.startDate)));
    return out;
  }, [holidays]);

  // The calendar carries both sets: a teacher looking at a month wants every
  // day their timetable changes, whoever the day was declared for. `mine` marks
  // which is which, so the legend under it can mean something.
  const byDay = useMemo(() => {
    const out = {};
    const add = (h, own) => daysOf(h).forEach((k) => {
      (out[k] ||= []).push(own ? { ...h, mine: true } : { ...h, mine: false });
    });
    holidays.forEach((h) => add(h, true));
    classHolidays.forEach((h) => add(h, false));
    return out;
  }, [holidays, classHolidays]);

  const counts = useMemo(() => {
    const out = {};
    holidays.forEach((h) => { out[h.type] = (out[h.type] || 0) + 1; });
    return out;
  }, [holidays]);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <>
      <div className="holgrid">
        <div className="holtch-col">
          {/* No title: the month it is showing is the only heading a calendar
              needs, and it is already in the nav. */}
          <MonthCalendar
            title={null}
            month={month} onMonth={setMonth} byDay={byDay} types={types} onPick={setPicked}
            onToday={() => setMonth(MONTH_START())}
            showAdjacent
            legend={(
              <p className="holcal__legend">
                <span><i className="is-mine" />Your holiday</span>
                <span><i className="is-class" />Class holiday</span>
                <span><i className="is-today" />Today</span>
              </p>
            )} />

          <section className="card holtch-types">
            <header className="holrail__head">
              <span className="holcal__icon tint-purple"><Icon name="layers" size={16} /></span>
              <h2>Holiday types</h2>
            </header>
            {types.length ? (
              <ul>
                {types.map((t) => (
                  <li key={t}>
                    <i className={`tint-${tintFor(t, types)}`} />
                    <span>
                      <b>{t}</b>
                      <small>{counts[t] ? `${counts[t]} of yours this year` : 'None of yours this year'}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="holtch-none">The school has not set up its holiday types yet.</p>}
          </section>
        </div>

        <div className="holside">
          {/* Holidays are the school's to declare. The one thing a teacher can
              do about a day off is ask for leave — so that is what this offers,
              and only where the school actually runs the leave module. */}
          {isEnabled('leave') && (
          <section className="card holtch-leave">
            <span className="holcal__icon tint-blue"><Icon name="umbrella" size={17} /></span>
            <div>
              <h2>Need a day off?</h2>
              <p>
                Holidays are declared by the school and appear here on their own.
                To take a day that is not one of them, apply for leave.
              </p>
            </div>
            <Link className="btn btn-primary btn-sm" to="/teacher/leave">
              <Icon name="plus" size={15} /> Apply for leave
            </Link>
          </section>
          )}

          <HolidayList title="Coming up" icon="clock" tone="green"
            holidays={[...groups.ongoing, ...groups.upcoming]} types={types} onPick={setPicked}
            empty="Nothing on the calendar yet." />

          <HolidayList title="Already been" icon="refresh" tone="amber"
            holidays={groups.past} types={types} onPick={setPicked}
            empty="No holidays have passed this year." />
        </div>
      </div>

      <HolidayDialog holiday={picked} types={types} onClose={() => setPicked(null)} />
    </>
  );
}

/** One list of holidays, newest concern first. */
function ClassHolidays({ holidays, types, loading, classNames }) {
  const [cls,   setCls]   = useState('');
  const [type,  setType]  = useState('');
  const [from,  setFrom]  = useState('');
  const [to,    setTo]    = useState('');
  const [term,  setTerm]  = useState('');
  const [page,  setPage]  = useState(1);
  const [size,  setSize]  = useState(10);
  const [picked, setPicked] = useState(null);

  // Filtered here rather than at the server: this is one teacher's classes for
  // one academic year — tens of rows, already in hand. A round trip per
  // keystroke would be slower than the filter it asked for.
  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    return holidays.filter((h) => {
      if (cls && !(h.myClasses || []).includes(cls)) return false;
      if (type && h.type !== type) return false;
      const s = dayKey(h.startDate);
      const e = dayKey(h.endDate) || s;
      if (from && e < from) return false;
      if (to && s > to) return false;
      if (q && !(`${h.name} ${h.description || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [holidays, cls, type, from, to, term]);

  const anyFilter = !!(cls || type || from || to || term);
  const clearAll = () => { setCls(''); setType(''); setFrom(''); setTo(''); setTerm(''); setPage(1); };

  const pages = Math.max(1, Math.ceil(rows.length / size));
  const shown = rows.slice((Math.min(page, pages) - 1) * size, Math.min(page, pages) * size);

  const columns = [
    {
      key: 'name', className: 'holcol-name', label: 'Holiday',
      render: (h) => (
        <span className="holname">
          <b>{h.name}</b>
          {h.description ? <small title={h.description}>{h.description}</small> : null}
        </span>
      ),
    },
    {
      key: 'dates', className: 'holcol-dates', label: 'Date(s)',
      render: (h) => (
        <span className="holdate">
          <span>{fmtRange(h)}</span>
          <small>{spanDays(h) === 1 ? '1 day' : `${spanDays(h)} days`}</small>
        </span>
      ),
    },
    {
      key: 'classes', className: 'holcol-app', label: 'Your classes',
      render: (h) => {
        const own = h.myClasses || [];
        const others = (h.applicability?.classes || []).length - own.length;
        return (
          <span className="holclasses">
            {own.length ? own.join(', ') : <em>—</em>}
            {others > 0 ? <em> +{others} other</em> : null}
          </span>
        );
      },
    },
    { key: 'type', className: 'holcol-type', label: 'Type', render: (h) => <TypeChip type={h.type} types={types} /> },
    {
      key: 'status', className: 'holcol-status', label: 'When',
      render: (h) => {
        const st = statusOf(h);
        const away = daysUntil(dayKey(h.startDate));
        return (
          <span className={`holstatus is-${st}`}>
            {st === 'past' ? 'Been' : st === 'ongoing' ? 'On now' : away === 1 ? 'Tomorrow' : `in ${away} days`}
          </span>
        );
      },
    },
    {
      key: 'actions', className: 'ltable__acts', label: '',
      render: (h) => (
        <Button variant="secondary" size="sm" onClick={() => setPicked(h)}>
          <Icon name="eye" size={14} /> Details
        </Button>
      ),
    },
  ];

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <>
      <section className="card holtch-card">
        <div className="holtch-filters">
          <select className="form-control" value={cls} aria-label="Class"
            onChange={(e) => { setCls(e.target.value); setPage(1); }}>
            <option value="">All your classes</option>
            {classNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select className="form-control" value={type} aria-label="Holiday type"
            onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          <label className="holtch-range">
            <input type="date" className="form-control" value={from} max={to || undefined}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From date" />
            <Icon name="arrowRight" size={14} />
            <input type="date" className="form-control" value={to} min={from || undefined}
              onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To date" />
          </label>

          <div className="holtch-search">
            <Icon name="search" size={15} />
            <input className="form-control" value={term} placeholder="Search by name or note…"
              onChange={(e) => { setTerm(e.target.value); setPage(1); }} aria-label="Search class holidays" />
          </div>

          <Button variant="secondary" onClick={clearAll} disabled={!anyFilter}>Clear</Button>
        </div>

        <ListTable
          columns={columns}
          rows={shown}
          loading={false}
          startIndex={(Math.min(page, pages) - 1) * size}
          emptyIcon={anyFilter ? '🔍' : '🏫'}
          emptyTitle={anyFilter ? 'Nothing matches those filters' : 'No class holidays'}
          emptyMessage={anyFilter
            ? 'Try a wider date range, or clear the filters.'
            : 'None of the classes you take has a holiday of its own this year.'}
          emptyAction={anyFilter ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button> : null}
        />

        <ListFooter
          page={Math.min(page, pages)} pages={pages} total={rows.length}
          limit={size} count={shown.length} noun="class holiday"
          onPage={setPage} onLimit={(n) => { setSize(n); setPage(1); }} />
      </section>

      <Alert variant="info">
        These are holidays for classes where you are the class teacher, the vice class teacher
        or a subject teacher. They close the class, not the school — your own days off are on
        the <b>My holidays</b> tab.
      </Alert>

      <HolidayDialog holiday={picked} types={types} onClose={() => setPicked(null)} />
    </>
  );
}
