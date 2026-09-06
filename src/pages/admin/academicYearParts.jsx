/**
 * The pieces that know what an academic year *is* — everything the list frame
 * in listParts.jsx does not.
 *
 * A year is a span of dates, so almost all of this is calendar arithmetic: where
 * today sits inside a year, how long a year runs for, and what the year after
 * the last one should be called. The screen leads with that rather than with a
 * table of two dates, because "which year is running and how far through it are
 * we" is the question an admin opens this page with.
 *
 * Same file convention as designationParts.jsx and dashboardParts.jsx.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Alert, Badge, Button, Modal } from '../../components/ui/index';
import { Blank, Drawer, DrawerFoot, fmtDate } from './listParts';

const DAY = 86400000;

/**
 * Every comparison on this page is between CALENDAR DAYS, never instants.
 *
 * A year's dates are stored at UTC midnight of the day they mean (see
 * class.controller.js), so an instant comparison against local midnight puts
 * the first day of a session on the wrong side of "has it started" for half the
 * world — in IST, 01 Apr 00:00 UTC is 05:30 on the 1st, which is still "after
 * today" at local midnight. Both sides are therefore reduced to a day number:
 * the stored date by its UTC parts, today by its local ones.
 */
const dayOf = (d) => {
  const x = new Date(d);
  return Number.isNaN(x.getTime())
    ? NaN
    : Math.floor(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) / DAY);
};

/** Today, as the same day number. */
export const todayDay = () => {
  const n = new Date();
  return Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / DAY);
};

/** Whole days from a to b. */
const days = (a, b) => dayOf(b) - dayOf(a);

/**
 * Where the year sits against the calendar — which is not the same thing as its
 * status. `status: 'active'` is the year the school is *working in* (one per
 * school, set by hand); the phase is where today falls inside its dates. They
 * usually agree, and the row says so when they don't.
 */
export const phaseOf = (year, today = todayDay()) => {
  if (!year?.startDate || !year?.endDate) return 'unknown';
  const from = dayOf(year.startDate);
  const to   = dayOf(year.endDate);
  if (Number.isNaN(from) || Number.isNaN(to)) return 'unknown';
  if (from > today) return 'upcoming';
  if (to   < today) return 'ended';
  return 'running';
};

export const PHASE = {
  running:  { label: 'In session',  tone: 'green',  icon: 'activity' },
  upcoming: { label: 'Not started', tone: 'blue',   icon: 'sunrise' },
  ended:    { label: 'Completed',   tone: 'amber',  icon: 'checkCircle' },
  unknown:  { label: 'No dates',    tone: 'indigo', icon: 'alert' },
};

/** How far through the year today is, and what is left of it. */
export const progressOf = (year, today = todayDay()) => {
  if (!year?.startDate || !year?.endDate) return null;
  const total = Math.max(1, days(year.startDate, year.endDate));
  const gone  = today - dayOf(year.startDate);
  return {
    total,
    elapsed:   Math.min(Math.max(gone, 0), total),
    remaining: Math.min(Math.max(total - gone, 0), total),
    pct:       Math.min(100, Math.max(0, Math.round((gone / total) * 100))),
  };
};

/** "12 months", or "5 months" for a short one — the length at a glance. */
export const spanLabel = (start, end) => {
  if (!start || !end) return '';
  const months = Math.max(1, Math.round(days(start, end) / 30.44));
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.round((months / 12) * 10) / 10;
  return years === 1 ? '12 months' : `${years} years`;
};

/** "in 4 months", "3 weeks ago" — a distance, not a date. */
export const distance = (date, today = todayDay()) => {
  const d = dayOf(date) - today;
  if (d === 0) return 'today';
  const n = Math.abs(d);
  const unit = n < 14 ? [n, `day${n === 1 ? '' : 's'}`]
    : n < 60 ? [Math.round(n / 7), 'weeks']
      : n < 365 ? [Math.round(n / 30.44), 'months']
        : [Math.round((n / 365) * 10) / 10, 'years'];
  return d > 0 ? `in ${unit[0]} ${unit[1]}` : `${unit[0]} ${unit[1]} ago`;
};

const iso = (d) => new Date(d).toISOString().slice(0, 10);

/** The month and year printed on the calendar leaf, in the date's own terms. */
const leafMonth = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
  : '—');
const leafYear = (d) => (d ? new Date(d).getUTCFullYear() : '??');

/** "2027-2028" from a session's dates — the name almost every school uses. */
export const nameForDates = (start, end) => {
  if (!start || !end) return '';
  const a = new Date(start).getUTCFullYear();
  const b = new Date(end).getUTCFullYear();
  return a === b ? String(a) : `${a}-${b}`;
};

/**
 * The year that should come after the ones already there: it starts the day the
 * last one ends and runs the same length. Adding next year is the single most
 * common thing done on this page, so the form opens already filled in with it.
 */
export const nextYearSuggestion = (years = []) => {
  const last = [...years].sort((a, b) => new Date(b.endDate) - new Date(a.endDate))[0];
  if (!last) {
    // Nothing to continue from: April to March, the Indian school session.
    const y = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    return { yearName: `${y}-${y + 1}`, startDate: `${y}-04-01`, endDate: `${y + 1}-03-31` };
  }
  const start = new Date(new Date(last.endDate).getTime() + DAY);
  const end   = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  const endDate = new Date(end.getTime() - DAY);
  return { yearName: nameForDates(start, endDate), startDate: iso(start), endDate: iso(endDate) };
};

/**
 * The years this one would overlap. Two years of a school may not cover the same
 * date — every "current year" lookup in the app assumes one year per date — and
 * the server refuses it, so the form says so before the request is sent.
 */
export const overlapsWith = (years, { startDate, endDate }, exceptId) => {
  if (!startDate || !endDate) return null;
  const s = new Date(startDate);
  const e = new Date(endDate);
  return (years || []).find((y) => String(y._id) !== String(exceptId)
    && new Date(y.startDate) <= e && new Date(y.endDate) >= s) || null;
};

// ── Cells ────────────────────────────────────────────────────────────────────

/** The year's identity: a torn-off calendar leaf, its name, and its phase. */
export const YearCell = ({ year }) => {
  const phase = phaseOf(year);
  return (
    <div className="aywho">
      <span className={`ayleaf ayleaf--${phase}`}>
        <span className="ayleaf__top">{leafMonth(year.startDate)}</span>
        <span className="ayleaf__year">{leafYear(year.startDate)}</span>
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="aywho__name">{year.yearName}</div>
        <div className="aywho__sub">
          {phase === 'running'  && `Ends ${distance(year.endDate)}`}
          {phase === 'upcoming' && `Starts ${distance(year.startDate)}`}
          {phase === 'ended'    && `Ended ${distance(year.endDate)}`}
          {phase === 'unknown'  && 'Dates missing'}
        </div>
      </div>
    </div>
  );
};

/**
 * The dates, with the year's own progress under them.
 *
 * The bar is the reason this column is worth its width: a session two thirds
 * gone is the cue to start building the next year, and no pair of dates says
 * that as fast as a bar does.
 */
export const SessionCell = ({ year }) => {
  const p     = progressOf(year);
  const phase = phaseOf(year);
  return (
    <div className="aysession">
      <div className="aysession__dates">
        {fmtDate(year.startDate) || <Blank />}
        <Icon name="arrowRight" size={13} />
        {fmtDate(year.endDate) || <Blank />}
      </div>
      {p && (
        <>
          <div className={`aybar aybar--${phase}`} role="presentation">
            <span style={{ width: `${phase === 'ended' ? 100 : p.pct}%` }} />
          </div>
          <div className="aysession__meta">
            {phase === 'running'  && `${p.pct}% through · ${p.remaining} days left`}
            {phase === 'upcoming' && `${spanLabel(year.startDate, year.endDate)} · not started`}
            {phase === 'ended'    && `${spanLabel(year.startDate, year.endDate)} · finished`}
          </div>
        </>
      )}
    </div>
  );
};

/** A count with what it is made of underneath — 12 classes, 48 sections. */
export const CountCell = ({ value, sub, to, muted }) => {
  const body = (
    <>
      <span className={`aycount__n${muted && !value ? ' aycount__n--zero' : ''}`}>{value ?? 0}</span>
      {sub ? <span className="aycount__sub">{sub}</span> : null}
    </>
  );
  return to && value
    ? <Link className="aycount aycount--link" to={to}>{body}</Link>
    : <div className="aycount">{body}</div>;
};

/** Active / Inactive, plus the phase when the two say different things. */
export const StatusCell = ({ year }) => {
  const phase = phaseOf(year);
  const p     = PHASE[phase];
  return (
    <div className="aystatus">
      <Badge variant={year.status === 'active' ? 'success' : 'muted'}>
        {year.status === 'active' ? 'Active' : 'Inactive'}
      </Badge>
      <span className={`aychip aychip--${p.tone}`}><Icon name={p.icon} size={12} /> {p.label}</span>
    </div>
  );
};

// ── Detail drawer ────────────────────────────────────────────────────────────

const Field = ({ label, children }) => (
  <div className="lfield"><dt>{label}</dt><dd>{children}</dd></div>
);

/** The whole year — its calendar, what it holds, and what can be done to it. */
export function YearDrawer({ year, onClose, onEdit, onImport, onSetActive }) {
  if (!year) return null;
  const phase = phaseOf(year);
  const p     = progressOf(year);
  const empty = !year.classes && !year.sections && !year.subjects;

  return (
    <Drawer open onClose={onClose}>
      <div className="ldrawer__head">
        <span className={`ayleaf ayleaf--${phase}`} style={{ width: 52, height: 56 }}>
          <span className="ayleaf__top">{leafMonth(year.startDate)}</span>
          <span className="ayleaf__year">{leafYear(year.startDate)}</span>
        </span>
        <div className="ldrawer__id">
          <h3>{year.yearName}</h3>
          <p>{fmtDate(year.startDate)} – {fmtDate(year.endDate)}</p>
          <div className="ldrawer__tags">
            <Badge variant={year.status === 'active' ? 'success' : 'muted'}>
              {year.status === 'active' ? 'Active year' : 'Inactive'}
            </Badge>
            <Badge variant="info">{PHASE[phase].label}</Badge>
          </div>
        </div>
        <button type="button" className="lact" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="ldrawer__body">
        <section className="ldrawer__sec">
          <h4>Calendar</h4>
          <dl>
            <Field label="Starts">{fmtDate(year.startDate) || <Blank />}</Field>
            <Field label="Ends">{fmtDate(year.endDate) || <Blank />}</Field>
            <Field label="Length">{spanLabel(year.startDate, year.endDate) || <Blank />}</Field>
            {p && phase === 'running' && (
              <>
                <Field label="Elapsed">{p.elapsed} days ({p.pct}%)</Field>
                <Field label="Remaining">{p.remaining} days</Field>
              </>
            )}
            {p && phase === 'upcoming' && <Field label="Begins">{distance(year.startDate)}</Field>}
            {p && phase === 'ended'    && <Field label="Finished">{distance(year.endDate)}</Field>}
          </dl>
        </section>

        <section className="ldrawer__sec">
          <h4>What this year holds</h4>
          <dl>
            <Field label="Classes">{year.classes || 0}</Field>
            <Field label="Sections">{year.sections || 0}</Field>
            <Field label="Subjects">{year.subjects || 0}</Field>
            <Field label="Students enrolled">{year.students || 0}</Field>
          </dl>
          {empty && (
            <div style={{ marginTop: 14 }}>
              <Alert variant="info">
                Nothing has been set up in this year yet. Import another year&rsquo;s classes,
                sections and subjects instead of building them again by hand.
              </Alert>
            </div>
          )}
        </section>

        {year.status !== 'active' && phase === 'running' && (
          <div style={{ marginTop: 20 }}>
            <Alert variant="warning">
              Today falls inside this year, but the school is working in a different one.
              Attendance, timetables and results are all recorded against the active year.
            </Alert>
          </div>
        )}
      </div>

      <DrawerFoot>
        {year.status !== 'active' && (
          <Button variant="secondary" onClick={() => onSetActive(year)}>
            <Icon name="checkCircle" size={15} /> Set active
          </Button>
        )}
        <Button variant="secondary" onClick={() => onImport(year)}>
          <Icon name="upload" size={15} /> Import structure
        </Button>
        <Button onClick={() => onEdit(year)}><Icon name="pencil" size={15} /> Edit</Button>
      </DrawerFoot>
    </Drawer>
  );
}

// ── The form ─────────────────────────────────────────────────────────────────

const BLANK = { yearName: '', startDate: '', endDate: '' };

/**
 * Add or edit a year.
 *
 * Three fields, but the work is in what it says back: the name follows the dates
 * until the admin types one of their own, the length and the overlap are checked
 * as the dates are picked, and a new year opens pre-filled with the one that
 * should come next — which is the only year most schools ever add.
 */
export function YearForm({ open, year, years, saving, error, onClose, onSave }) {
  const [form, setForm]   = useState(BLANK);
  const [named, setNamed] = useState(false);   // has the admin taken the name over?
  const [touched, setTouched] = useState(false);

  // Filled once, when the dialog opens. Deliberately NOT re-run when `years`
  // changes: a refresh underneath an open form would throw away what is being
  // typed into it.
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    if (year) {
      setForm({
        yearName:  year.yearName || '',
        startDate: year.startDate?.slice(0, 10) || '',
        endDate:   year.endDate?.slice(0, 10) || '',
      });
      setNamed(true);
    } else {
      setForm(nextYearSuggestion(years));
      setNamed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, year?._id]);

  const set = (patch) => setForm((f) => {
    const next = { ...f, ...patch };
    // The name tracks the dates until it is typed into, so picking April 2027 to
    // March 2028 fills in "2027-2028" without anyone being asked for it.
    if (!named && (patch.startDate || patch.endDate)) {
      next.yearName = nameForDates(next.startDate, next.endDate) || next.yearName;
    }
    return next;
  });

  const clash   = overlapsWith(years, form, year?._id);
  const backwards = form.startDate && form.endDate && new Date(form.endDate) <= new Date(form.startDate);
  const dupName = (years || []).find((y) => String(y._id) !== String(year?._id)
    && y.yearName.trim().toLowerCase() === form.yearName.trim().toLowerCase());

  const problem = !form.yearName.trim() ? 'Give the year a name, such as 2027-2028.'
    : dupName    ? `An academic year called “${dupName.yearName}” already exists.`
      : !form.startDate ? 'Pick the day the session starts.'
        : !form.endDate   ? 'Pick the day the session ends.'
          : backwards     ? 'The end date must come after the start date.'
            : clash       ? `These dates overlap “${clash.yearName}” (${fmtDate(clash.startDate)} – ${fmtDate(clash.endDate)}). Academic years cannot overlap.`
              : '';

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    onSave({ ...form, yearName: form.yearName.trim() });
  };

  return (
    <Modal open={open} onClose={onClose} title={year ? 'Edit Academic Year' : 'Add Academic Year'}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button form="ay-form" type="submit" loading={saving} disabled={!!problem && touched}>
          {year ? 'Save changes' : 'Create year'}
        </Button>
      </>}>
      <form id="ay-form" onSubmit={submit} noValidate>
        {error   && <div style={{ marginBottom: 14 }}><Alert variant="danger">{error}</Alert></div>}
        {!year && !touched && !problem && (
          <div style={{ marginBottom: 14 }}>
            <Alert variant="info">
              Pre-filled with the year that follows the last one. Change anything that does not match your session.
            </Alert>
          </div>
        )}

        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label required">Start date</label>
            <input type="date" className="form-control" value={form.startDate}
              onChange={(e) => set({ startDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label required">End date</label>
            <input type="date" className="form-control" value={form.endDate}
              onChange={(e) => set({ endDate: e.target.value })} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label required">Year name</label>
          <input className="form-control" maxLength={40} placeholder="2027-2028" value={form.yearName}
            onChange={(e) => { setNamed(true); setForm((f) => ({ ...f, yearName: e.target.value })); }} />
          <div className="form-hint">
            What staff will see everywhere this year is picked — on classes, attendance, results and fees.
          </div>
        </div>

        {/* One line that says what is about to be saved, or what is wrong with
            it. Shown as a warning the moment the dates clash, not on submit —
            the server refuses an overlap and there is no reason to wait for it. */}
        {problem && (touched || clash || backwards)
          ? <Alert variant="warning">{problem}</Alert>
          : (
            <div className="aypreview">
              <Icon name="calendarDays" size={18} />
              <div>
                <b>{form.yearName || 'This year'}</b> runs {fmtDate(form.startDate)} to {fmtDate(form.endDate)}
                <span> · {spanLabel(form.startDate, form.endDate)}</span>
              </div>
            </div>
          )}

        {year && year.status === 'active' && (
          <div style={{ marginTop: 14 }}>
            <Alert variant="info">
              This is the active year. Moving its dates changes which session today falls in.
            </Alert>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

/**
 * Setting the active year is the widest-reaching action on the page — it decides
 * which classes, timetables and results the whole school sees — so it says what
 * it is replacing before it does it.
 */
export const SetActiveDialog = ({ year, current, saving, onClose, onConfirm }) => (
  <Modal open={!!year} onClose={onClose} title="Set the active academic year" maxWidth={480}
    footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button onClick={onConfirm} loading={saving}>Set as active</Button>
    </>}>
    <p style={{ color: 'var(--text-muted)', fontSize: '.9rem', lineHeight: 1.6 }}>
      <b style={{ color: 'var(--text)' }}>{year?.yearName}</b> becomes the year the school works in.
      Classes, sections, timetables, attendance and results all default to it from now on.
    </p>
    {current && (
      <div style={{ marginTop: 14 }}>
        <Alert variant="warning">
          “{current.yearName}” stops being the active year. Nothing recorded in it is lost — it is
          still there to open and report on.
        </Alert>
      </div>
    )}
    {year && !year.classes && (
      <div style={{ marginTop: 14 }}>
        <Alert variant="info">
          This year has no classes yet. Import a previous year&rsquo;s structure straight after,
          or staff will find their class lists empty.
        </Alert>
      </div>
    )}
  </Modal>
);

/**
 * Why a delete was refused.
 *
 * Nothing in the database cascades from a year, so a year still holding classes
 * cannot be removed without orphaning them. The dialog shows exactly what is in
 * the way and where to go and remove it.
 */
export const InUseDialog = ({ state, onClose }) => (
  <Modal open={!!state} onClose={onClose} title="This year is still in use" maxWidth={480}
    footer={<>
      <Button variant="secondary" onClick={onClose}>Close</Button>
      <Link to="/admin/classes" className="btn btn-primary" onClick={onClose}>Open Classes</Link>
    </>}>
    <p style={{ color: 'var(--text-muted)', fontSize: '.9rem', lineHeight: 1.6 }}>
      {state?.message}
    </p>
    {state?.counts && (
      <div className="lblock">
        {[
          ['Classes',  state.counts.classes,  'grid'],
          ['Sections', state.counts.sections, 'layers'],
          ['Subjects', state.counts.subjects, 'book'],
          ['Students', state.counts.students, 'student'],
        ].filter(([, n]) => n > 0).map(([label, n, icon]) => (
          <div key={label} className="lblock__row">
            <Icon name={icon} size={16} /> <b>{n}</b> {label.toLowerCase()}
          </div>
        ))}
      </div>
    )}
  </Modal>
);

/**
 * The panel closing the page: what the active year decides, and how next year
 * gets built. It is the tip that used to sit under the table, given somewhere
 * to live and something to link to.
 */
export const RolloverPanel = ({ active, next, onImport }) => (
  <section className="lpanel lhelp">
    <span className="lhelp__mark"><Icon name="repeat" size={22} /></span>
    <div className="lhelp__body">
      <h2>Building next year</h2>
      <p>
        {active
          ? <>The school is working in <b>{active.yearName}</b> — every class, timetable and result is
            recorded against it. </>
          : <>No year is active yet, so class creation and subject assignment are held up until one is set. </>}
        Rather than retyping it, a new year can copy the classes, sections, subjects and subject
        teachers of an existing one, and nothing already there is overwritten.
      </p>
      {next
        ? (
          <Button variant="secondary" onClick={() => onImport(next)}>
            <Icon name="upload" size={15} /> Import into {next.yearName}
          </Button>
        )
        : <Link to="/admin/classes" className="btn btn-secondary">Go to Classes <Icon name="arrowRight" size={15} /></Link>}
    </div>
  </section>
);
