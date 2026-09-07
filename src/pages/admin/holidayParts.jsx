/**
 * The pieces of the admin Holidays screen.
 *
 * Dates here are handled as **date strings, never as local Date objects**. A
 * holiday is stored at UTC midnight, so asking a `Date` what day it is gives
 * the day before in any timezone west of Greenwich — the calendar would mark
 * the wrong squares. Every key, comparison and range walk below runs on the
 * `YYYY-MM-DD` slice instead, which is the same everywhere.
 *
 * A holiday type is free text the school manages, so its colour cannot be
 * stored — it is taken from the app's icon-tint order by the type's position in
 * that list. The name is always printed beside the dot, so the colour is a
 * second channel and never the only one; past the eighth type it drops to
 * neutral rather than starting the order again.
 */
import React, { useMemo, useState } from 'react';
import { Badge, Button, Modal, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';

// ── Dates ────────────────────────────────────────────────────────────────────

/** The calendar day a stored timestamp belongs to, free of any timezone. */
export const dayKey = (d) => (d ? String(typeof d === 'string' ? d : d.toISOString()).slice(0, 10) : '');

export const today = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

/** Days from one date string to another, counting both ends. */
export const spanDays = (h) => {
  const s = dayKey(h.startDate);
  const e = dayKey(h.endDate) || s;
  if (!s) return 0;
  return Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / 86400000) + 1;
};

export const daysUntil = (key) =>
  Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000);

export const statusOf = (h) => {
  const t = today();
  const s = dayKey(h.startDate);
  const e = dayKey(h.endDate) || s;
  if (e < t) return 'past';
  if (s > t) return 'upcoming';
  return 'ongoing';
};

export const STATUS = {
  upcoming: { label: 'Upcoming', variant: 'info' },
  ongoing:  { label: 'On now',   variant: 'success' },
  past:     { label: 'Past',     variant: 'muted' },
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export const fmtDayKey = (key) => {
  if (!key) return '—';
  const [y, m, d] = key.split('-').map(Number);
  // Built from the parts, so the printed date is the stored one whatever the
  // reader's clock says.
  return new Date(y, m - 1, d).toLocaleDateString('en-IN',
    { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export const fmtRange = (h) => {
  const s = dayKey(h.startDate);
  const e = dayKey(h.endDate) || s;
  return s === e ? fmtDayKey(s) : `${fmtDayKey(s)} – ${fmtDayKey(e)}`;
};

/** Every calendar day a holiday covers. */
export const daysOf = (h) => {
  const s = dayKey(h.startDate);
  const e = dayKey(h.endDate) || s;
  if (!s) return [];
  const out = [];
  for (let t = Date.parse(`${s}T00:00:00Z`); t <= Date.parse(`${e}T00:00:00Z`); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
};

/** Holidays that overlap the given range — what the form warns about. */
export const clashesWith = (holidays, startKey, endKey, ignoreId) => holidays.filter((h) => {
  if (ignoreId && h._id === ignoreId) return false;
  const s = dayKey(h.startDate);
  const e = dayKey(h.endDate) || s;
  return s <= endKey && e >= startKey;
});

// ── Type colours ─────────────────────────────────────────────────────────────

const TINTS = ['indigo', 'blue', 'green', 'amber', 'purple', 'pink', 'teal', 'orange'];

/** A type's tint, fixed by its place in the school's list. */
export const tintFor = (type, types) => {
  const i = types.findIndex((t) => t.toLowerCase() === String(type || '').toLowerCase());
  return i >= 0 && i < TINTS.length ? TINTS[i] : 'muted';
};

export const TypeChip = ({ type, types }) => (
  <span className={`holtype holtype--${tintFor(type, types)}`}>
    <i />{type || 'Untyped'}
  </span>
);

// ── Cells ────────────────────────────────────────────────────────────────────

export const HolidayCell = ({ h }) => (
  <div className="holname">
    <b>{h.name}</b>
    {h.description ? <small title={h.description}>{h.description}</small> : null}
  </div>
);

export const DateCell = ({ h }) => {
  const n = spanDays(h);
  return (
    <div className="holdate">
      <span>{fmtRange(h)}</span>
      <small>{n === 1 ? 'Single day' : `${n} days`}</small>
    </div>
  );
};

/**
 * Who a holiday reaches.
 *
 * The class list is named rather than counted — "3 classes" is not an answer to
 * "which classes", and it is the difference between checking a holiday and
 * opening it to check.
 */
export const AppliesCell = ({ h, classNames }) => {
  const scope = h.applicability?.scope || 'all';
  if (scope !== 'specific_classes') return <Badge variant="info">Whole school</Badge>;
  const ids = (h.applicability?.classes || []).map((c) => String(c?._id ?? c));
  const named = ids.map((id) => classNames[id]).filter(Boolean);
  if (!named.length) return <Badge variant="warning">{ids.length || 'No'} classes</Badge>;
  return (
    <span className="holclasses" title={named.join(', ')}>
      {named.slice(0, 2).join(', ')}
      {named.length > 2 ? <em> +{named.length - 2}</em> : null}
    </span>
  );
};

// ── The month calendar ───────────────────────────────────────────────────────

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The month, with the holidays on it.
 *
 * A marked day carries a dot per holiday type that falls on it, and opens that
 * holiday when there is something to open — the calendar is the fastest way to
 * find the row you meant.
 */
export const MonthCalendar = ({ title = 'Calendar', month, onMonth, byDay, types, onPick }) => {
  const [y, m] = month;
  const first = new Date(y, m, 1);
  const total = new Date(y, m + 1, 0).getDate();
  const lead = first.getDay();
  const t = today();

  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  const step = (by) => {
    const d = new Date(y, m + by, 1);
    onMonth([d.getFullYear(), d.getMonth()]);
  };

  return (
    <section className="card holcal">
      <header className="holcal__head">
        <span className="holcal__icon tint-indigo"><Icon name="calendarDays" size={16} /></span>
        <h2>{title}</h2>
        <div className="holcal__nav">
          <button type="button" onClick={() => step(-1)} aria-label="Previous month">
            <Icon name="chevronLeft" size={15} />
          </button>
          <b>{MONTH_NAMES[m]} {y}</b>
          <button type="button" onClick={() => step(1)} aria-label="Next month">
            <Icon name="chevronRight" size={15} />
          </button>
        </div>
      </header>

      <div className="holcal__grid">
        {DOW.map((d) => <span key={d} className="holcal__dow">{d}</span>)}
        {cells.map((d, i) => {
          if (d == null) return <span key={`p${i}`} className="holcal__pad" />;
          const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const on = byDay[key] || [];
          const cls = [
            'holcal__day',
            on.length ? 'is-holiday' : '',
            key === t ? 'is-today' : '',
          ].filter(Boolean).join(' ');
          const label = on.length
            ? `${d} — ${on.map((h) => h.name).join(', ')}`
            : undefined;
          return on.length && onPick
            ? (
              <button key={key} type="button" className={cls} title={label} onClick={() => onPick(on[0])}>
                {d}
                <span className="holcal__dots">
                  {on.slice(0, 3).map((h) => (
                    <i key={h._id} className={`tint-${tintFor(h.type, types)}`} />
                  ))}
                </span>
              </button>
            )
            : (
              <span key={key} className={cls} title={label}>
                {d}
                {on.length ? (
                  <span className="holcal__dots">
                    {on.slice(0, 3).map((h) => <i key={h._id} className={`tint-${tintFor(h.type, types)}`} />)}
                  </span>
                ) : null}
              </span>
            );
        })}
      </div>

      <p className="holcal__foot">
        <Icon name="checkCircle" size={13} />
        Marked days are holidays in this list. Today is outlined.
      </p>
    </section>
  );
};

// ── The rail ─────────────────────────────────────────────────────────────────

export const UpcomingPanel = ({ holidays, types, onPick }) => (
  <section className="card holrail">
    <header className="holrail__head">
      <span className="holcal__icon tint-green"><Icon name="clock" size={16} /></span>
      <h2>Next up</h2>
    </header>
    {holidays.length
      ? (
        <ul className="holnext">
          {holidays.map((h) => {
            const away = daysUntil(dayKey(h.startDate));
            return (
              <li key={h._id}>
                <span className={`holnext__mark tint-${tintFor(h.type, types)}`}>
                  {new Date(`${dayKey(h.startDate)}T00:00:00Z`).getUTCDate()}
                </span>
                <button type="button" onClick={() => onPick?.(h)} disabled={!onPick}>
                  <b>{h.name}</b>
                  <small>{fmtRange(h)}</small>
                </button>
                <em>{away <= 0 ? 'Today' : away === 1 ? 'Tomorrow' : `in ${away} days`}</em>
              </li>
            );
          })}
        </ul>
      )
      : (
        <div className="holempty">
          <Icon name="calendar" size={22} />
          <p>Nothing coming up</p>
          <span>Holidays with a future date appear here.</span>
        </div>
      )}
  </section>
);

export const TypesPanel = ({ types, counts, onManage }) => (
  <section className="card holrail">
    <header className="holrail__head">
      <span className="holcal__icon tint-purple"><Icon name="layers" size={16} /></span>
      <h2>Holiday types</h2>
      <button type="button" className="holrail__link" onClick={onManage}>
        Manage <Icon name="chevronRight" size={13} />
      </button>
    </header>
    <ul className="holtypes">
      {types.map((t) => (
        <li key={t}>
          <i className={`tint-${tintFor(t, types)}`} />
          <span>{t}</span>
          <b>{counts[t] || 0}</b>
        </li>
      ))}
    </ul>
  </section>
);

// ── Add / edit ───────────────────────────────────────────────────────────────

const EMPTY = {
  name: '', mode: 'single', startDate: '', endDate: '', type: '', description: '',
  scope: 'all', classes: [], notify: true,
};

export const formFrom = (h, types) => (h
  ? {
    name: h.name || '',
    mode: dayKey(h.startDate) === (dayKey(h.endDate) || dayKey(h.startDate)) ? 'single' : 'range',
    startDate: dayKey(h.startDate),
    endDate: dayKey(h.endDate) || dayKey(h.startDate),
    type: h.type || '',
    description: h.description || '',
    // Legacy department-scoped rows open as school-wide, which is how the
    // server already reads them.
    scope: h.applicability?.scope === 'specific_classes' ? 'specific_classes' : 'all',
    classes: (h.applicability?.classes || []).map((c) => String(c?._id ?? c)),
    notify: true,
  }
  : { ...EMPTY, type: types[0] || '' });

const DESC_MAX = 250;

/**
 * The holiday form.
 *
 * Single day is the common case and is the default, so the second date only
 * appears when a range is actually being set. The panel beside it says what
 * will be saved — the weekdays, the length, and anything already on those days,
 * which is the mistake this form is otherwise good at hiding.
 *
 * The notify switch is offered on **create only**: updating a holiday sends no
 * notification, and a switch that did nothing would be a lie about it.
 */
export const HolidayForm = ({
  open, holiday, form, setForm, types, classes, holidays, saving, error, onClose, onSave,
}) => {
  const isEdit = !!holiday;
  const start = form.startDate;
  const end = form.mode === 'single' ? form.startDate : (form.endDate || form.startDate);
  const clashes = start && end ? clashesWith(holidays, start, end, holiday?._id) : [];
  const days = start && end
    ? Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1)
    : 0;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleClass = (id) => setForm((f) => ({
    ...f,
    classes: f.classes.includes(id) ? f.classes.filter((x) => x !== id) : [...f.classes, id],
  }));

  return (
    <Modal open={open} onClose={onClose} maxWidth={900}
      title={isEdit ? 'Edit holiday' : 'Add holiday'}
      footer={
        <div className="holform__foot">
          {!isEdit && (
            <label className="holswitch">
              <input type="checkbox" checked={form.notify}
                onChange={(e) => set({ notify: e.target.checked })} />
              <span className="holswitch__track"><span /></span>
              <span className="holswitch__text">
                <b>Notify everyone it applies to</b>
                <small>Sends an in-app notification now</small>
              </span>
            </label>
          )}
          <div className="holform__btns">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button form="holiday-form" type="submit" loading={saving}>
              {isEdit ? 'Save changes' : 'Add holiday'}
            </Button>
          </div>
        </div>
      }>
      <div className="holform">
        <form id="holiday-form" onSubmit={onSave} className="holform__main">
          {error ? <div className="holform__err"><Icon name="alert" size={15} />{error}</div> : null}

          <div className="form-group">
            <label className="form-label required" htmlFor="hol-name">Holiday name</label>
            <input id="hol-name" className="form-control" required autoFocus maxLength={120}
              value={form.name} onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. Diwali, Summer Break, Annual Day" />
          </div>

          <fieldset className="form-group holdur">
            <legend className="form-label required">Date</legend>
            <div className="holdur__pick">
              <label>
                <input type="radio" name="hol-mode" checked={form.mode === 'single'}
                  onChange={() => set({ mode: 'single', endDate: form.startDate })} />
                Single day
              </label>
              <label>
                <input type="radio" name="hol-mode" checked={form.mode === 'range'}
                  onChange={() => set({ mode: 'range', endDate: form.endDate || form.startDate })} />
                Date range
              </label>
            </div>
            <div className={`holdur__dates${form.mode === 'range' ? ' is-range' : ''}`}>
              <input type="date" className="form-control" required value={form.startDate}
                aria-label={form.mode === 'range' ? 'First day' : 'Date'}
                onChange={(e) => set({
                  startDate: e.target.value,
                  endDate: form.mode === 'single' || (form.endDate && form.endDate < e.target.value)
                    ? e.target.value : form.endDate,
                })} />
              {form.mode === 'range' && (
                <>
                  <span aria-hidden>→</span>
                  <input type="date" className="form-control" required min={form.startDate}
                    aria-label="Last day" value={form.endDate}
                    onChange={(e) => set({ endDate: e.target.value })} />
                </>
              )}
            </div>
          </fieldset>

          <div className="form-group">
            <label className="form-label required" htmlFor="hol-type">Type</label>
            <select id="hol-type" className="form-control" value={form.type}
              onChange={(e) => set({ type: e.target.value })}>
              <option value="">— Select —</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="hol-scope">Applies to</label>
            <select id="hol-scope" className="form-control" value={form.scope}
              onChange={(e) => set({ scope: e.target.value, classes: [] })}>
              <option value="all">The whole school</option>
              <option value="specific_classes">Specific classes</option>
            </select>
            {/* Teachers are never shown a class-specific holiday — the server
                filters those to the students and parents of those classes. */}
            {form.scope === 'specific_classes' && (
              <p className="holhint">
                <Icon name="alert" size={13} />
                Students and parents of these classes see it. Teachers and staff do not.
              </p>
            )}
          </div>

          {form.scope === 'specific_classes' && (
            <div className="form-group">
              <label className="form-label">Classes</label>
              {classes.length
                ? (
                  <div className="holclasspick">
                    {classes.map((c) => (
                      <label key={c._id}>
                        <input type="checkbox" checked={form.classes.includes(c._id)}
                          onChange={() => toggleClass(c._id)} />
                        {c.className}
                      </label>
                    ))}
                  </div>
                )
                : <p className="holhint">No classes have been created yet.</p>}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="hol-desc">Description</label>
            <textarea id="hol-desc" className="form-control" rows={3} maxLength={DESC_MAX}
              value={form.description} onChange={(e) => set({ description: e.target.value })}
              placeholder="Optional note — what this holiday is for" />
            <span className="holcount">{form.description.length}/{DESC_MAX}</span>
          </div>
        </form>

        <aside className="holform__side">
          <div className="holpreview">
            <h3><Icon name="calendar" size={14} /> What will be saved</h3>
            {start
              ? (
                <>
                  <b>{fmtDayKey(start)}</b>
                  {end !== start ? <b>to {fmtDayKey(end)}</b> : null}
                  <span>{days === 1 ? 'One day' : `${days} days`}</span>
                  {form.type ? <TypeChip type={form.type} types={types} /> : null}
                </>
              )
              : <p className="holhint">Pick a date to see it here.</p>}
          </div>

          {/* Two holidays on the same day is usually a duplicate being typed in
              for the second time. Said before saving, not after. */}
          {clashes.length > 0 && (
            <div className="holclash">
              <h3><Icon name="alert" size={14} /> Already on these days</h3>
              <ul>
                {clashes.slice(0, 4).map((c) => (
                  <li key={c._id}><b>{c.name}</b><small>{fmtRange(c)}</small></li>
                ))}
              </ul>
              {clashes.length > 4 ? <small>and {clashes.length - 4} more</small> : null}
              <p>Saving anyway is allowed — the school calendar can hold both.</p>
            </div>
          )}

          <div className="holfacts">
            <h3><Icon name="checkCircle" size={14} /> What happens</h3>
            <ul>
              <li>It appears on the school calendar for everyone it applies to.</li>
              <li>{isEdit
                ? 'Editing sends no notification — only a new holiday does.'
                : form.notify
                  ? 'An in-app notification goes out as soon as you save.'
                  : 'No notification is sent.'}</li>
              <li>It can be edited or deleted afterwards.</li>
            </ul>
          </div>
        </aside>
      </div>
    </Modal>
  );
};

// ── Holiday types ────────────────────────────────────────────────────────────

/**
 * The school's own list of types.
 *
 * Each row carries how many holidays wear it, because that is the number that
 * decides whether it can go. A type in use cannot be deleted — the server
 * refuses it too — so it is offered a rename instead, which carries those
 * holidays across.
 */
export const TypesDialog = ({ open, types, counts, saving, onClose, onSave }) => {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null);   // { from, to }

  const add = (e) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    if (types.some((t) => t.toLowerCase() === name.toLowerCase())) return;
    onSave([...types, name]).then(() => setDraft(''));
  };

  const rename = (e) => {
    e.preventDefault();
    const to = editing.to.trim();
    if (!to || to === editing.from) return setEditing(null);
    if (types.some((t) => t.toLowerCase() === to.toLowerCase())) return;
    onSave(
      types.map((t) => (t === editing.from ? to : t)),
      [{ from: editing.from, to }],
    ).then(() => setEditing(null));
  };

  return (
    <Modal open={open} onClose={onClose} title="Holiday types"
      footer={<Button variant="secondary" onClick={onClose}>Done</Button>}>
      <p className="holhint" style={{ marginTop: 0 }}>
        These are the options in the Type dropdown, and they group the calendar.
      </p>

      <ul className="holtypelist">
        {types.map((t) => {
          const used = counts[t] || 0;
          const isEditing = editing?.from === t;
          return (
            <li key={t}>
              <i className={`tint-${tintFor(t, types)}`} />
              {isEditing
                ? (
                  <form onSubmit={rename} className="holtypelist__edit">
                    <input className="form-control" autoFocus value={editing.to}
                      onChange={(e) => setEditing({ from: t, to: e.target.value })} />
                    <Button type="submit" size="sm" loading={saving}>Rename</Button>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                  </form>
                )
                : (
                  <>
                    <span className="holtypelist__name">{t}</span>
                    <span className="holtypelist__use">
                      {used ? `${used} holiday${used === 1 ? '' : 's'}` : 'Not used yet'}
                    </span>
                    <button type="button" className="holtypelist__btn" disabled={saving}
                      onClick={() => setEditing({ from: t, to: t })} aria-label={`Rename ${t}`}>
                      <Icon name="pencil" size={14} />
                    </button>
                    <button type="button" className="holtypelist__btn is-danger"
                      disabled={saving || !!used || types.length <= 1}
                      title={used
                        ? `${used} holiday${used === 1 ? '' : 's'} still use this type — rename it instead`
                        : types.length <= 1 ? 'Keep at least one type' : `Delete ${t}`}
                      onClick={() => onSave(types.filter((x) => x !== t))}
                      aria-label={`Delete ${t}`}>
                      <Icon name="trash" size={14} />
                    </button>
                  </>
                )}
            </li>
          );
        })}
      </ul>

      <form onSubmit={add} className="holtypeadd">
        <input className="form-control" value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Regional Festival, Sports Day" aria-label="New holiday type" />
        <Button type="submit" loading={saving} disabled={!draft.trim()}>
          <Icon name="plus" size={15} /> Add
        </Button>
      </form>
    </Modal>
  );
};

// ── Import ───────────────────────────────────────────────────────────────────

const STEPS = ['Template', 'Choose file', 'Check and import'];

/**
 * The import, in three steps.
 *
 * The middle step is a real dry run: the server parses the file through exactly
 * the same code the import uses and writes nothing, so the preview is what will
 * land — including the rows it will refuse.
 */
export const ImportDialog = ({ open, busy, preview, fileName, onClose, onTemplate, onFile, onConfirm }) => {
  const [drag, setDrag] = useState(false);
  const step = preview ? 3 : fileName ? 2 : 1;

  const take = (file) => { if (file) onFile(file); };

  return (
    <Modal open={open} onClose={onClose} maxWidth={720} title="Import holidays"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm} loading={busy} disabled={!preview?.valid}>
          Import {preview?.valid ? `${preview.valid} holiday${preview.valid === 1 ? '' : 's'}` : ''}
        </Button>
      </>}>
      <ol className="holsteps">
        {STEPS.map((s, i) => (
          <li key={s} className={step > i + 1 ? 'is-done' : step === i + 1 ? 'is-on' : ''}>
            <span>{step > i + 1 ? <Icon name="checkCircle" size={14} /> : i + 1}</span>{s}
          </li>
        ))}
      </ol>

      <div className="holimport__tpl">
        <span className="holcal__icon tint-green"><Icon name="files" size={18} /></span>
        <div>
          <b>Start from the template</b>
          <small>
            Columns: name, startDate, endDate, type, description. Dates as YYYY-MM-DD;
            a type the school does not have falls back to the first one.
          </small>
        </div>
        <Button variant="secondary" onClick={onTemplate}>
          <Icon name="download" size={15} /> Download
        </Button>
      </div>

      <label className={`holdrop${drag ? ' is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files?.[0]); }}>
        <input type="file" accept=".xlsx,.xls,.csv"
          onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
        <Icon name="upload" size={26} />
        <b>{fileName || 'Drop your file here, or click to choose'}</b>
        <small>.xlsx, .xls or .csv</small>
      </label>

      {busy && !preview && (
        <div className="holimport__busy"><Spinner size="sm" /> Reading the file…</div>
      )}

      {preview && (
        <div className="holimport__out">
          <div className="holimport__counts">
            <span className="is-ok"><b>{preview.valid}</b> ready to import</span>
            {preview.invalid ? <span className="is-bad"><b>{preview.invalid}</b> rows skipped</span> : null}
            <span><b>{preview.total}</b> rows in the file</span>
          </div>

          {preview.rows?.length ? (
            <div className="table-wrap holimport__table">
              <table className="table">
                <thead><tr><th>Holiday</th><th>Date(s)</th><th>Type</th></tr></thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={`${r.name}-${i}`}>
                      <td>{r.name}</td>
                      <td>{fmtRange(r)}</td>
                      <td>{r.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {preview.errors?.length ? (
            <ul className="holimport__errs">
              {preview.errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}
              {preview.errors.length > 6 ? <li>…and {preview.errors.length - 6} more</li> : null}
            </ul>
          ) : null}

          <p className="holhint">
            <Icon name="alert" size={13} />
            Imported holidays apply to the whole school and are notified as one summary.
          </p>
        </div>
      )}
    </Modal>
  );
};

// ── Read-only list ───────────────────────────────────────────────────────────

/** What applies to the person looking — no actions, because there are none. */
export const MineList = ({ holidays, types }) => {
  const grouped = useMemo(() => {
    const out = { ongoing: [], upcoming: [], past: [] };
    holidays.forEach((h) => out[statusOf(h)].push(h));
    return out;
  }, [holidays]);

  const section = (key, title) => (grouped[key].length ? (
    <div key={key} className="holmine__group">
      <h3>{title} <span>{grouped[key].length}</span></h3>
      <ul>
        {grouped[key].map((h) => (
          <li key={h._id}>
            <span className={`holnext__mark tint-${tintFor(h.type, types)}`}>
              {new Date(`${dayKey(h.startDate)}T00:00:00Z`).getUTCDate()}
            </span>
            <div>
              <b>{h.name}</b>
              <small>{fmtRange(h)} · {spanDays(h) === 1 ? '1 day' : `${spanDays(h)} days`}</small>
              {h.description ? <p>{h.description}</p> : null}
            </div>
            <TypeChip type={h.type} types={types} />
          </li>
        ))}
      </ul>
    </div>
  ) : null);

  return (
    <div className="holmine">
      {section('ongoing', 'On now')}
      {section('upcoming', 'Coming up')}
      {section('past', 'Already been')}
    </div>
  );
};
