/**
 * The section editor's dialogs and side panels.
 *
 * Split out of the screen itself because the screen is already a four-step
 * workflow over a drag-and-drop grid; the five things that open ON TOP of it
 * read better as their own file than as another six hundred lines under it.
 */
import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  Field, Pick, Chip, Note, Panel, KV, Search, SwitchRow, CheckRow,
  toneFor, TONE_BG, TONE_INK, hhmm, timeRange, duration, toMinutes, plural,
} from './ttUI';

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = {
  Monday: 'Monday', Tuesday: 'Tuesday', Wednesday: 'Wednesday',
  Thursday: 'Thursday', Friday: 'Friday', Saturday: 'Saturday',
};
export const MAX_EXTRA = 2;

/** A blank grid to start from when a section has never had one saved. */
export const defaultPeriods = () => Array.from({ length: 8 }, (_, i) => ({
  periodNumber: i + 1, startTime: '', endTime: '', isRecess: false, recessName: 'Break',
}));

export const isTeaching = (p) => !p.isRecess;

/** Minutes of teaching, and minutes of break, in one day of a grid. */
export function gridMinutes(periods) {
  let teaching = 0;
  let breaks = 0;
  for (const p of periods) {
    const a = toMinutes(p.startTime);
    const b = toMinutes(p.endTime);
    if (a == null || b == null || b <= a) continue;
    if (p.isRecess) breaks += b - a; else teaching += b - a;
  }
  return { teaching, breaks };
}

/* ══════════════════════════════════════════════════════════════════════════
   Step 2 — the period grid for this section
══════════════════════════════════════════════════════════════════════════ */

export function PeriodStructure({
  form, setForm, autoCalc, setAutoCalc, onAutoCalc, onLoadTemplate, saving, onSave, saturday,
}) {
  const periods = form.periods;
  const setPeriod = (i, patch) => setForm((f) => ({
    ...f, periods: f.periods.map((p, k) => (k === i ? { ...p, ...patch } : p)),
  }));
  const removePeriod = (i) => setForm((f) => {
    const kept = f.periods.filter((_, k) => k !== i);
    let n = 0;
    return { ...f, periods: kept.map((p) => (p.isRecess ? p : { ...p, periodNumber: ++n })) };
  });
  const addPeriod = (isRecess) => setForm((f) => ({
    ...f,
    periods: [...f.periods, isRecess
      ? { periodNumber: 0, startTime: '', endTime: '', isRecess: true, recessName: 'Break' }
      : { periodNumber: f.periods.filter((p) => !p.isRecess).length + 1, startTime: '', endTime: '', isRecess: false }],
  }));

  const mins = gridMinutes(periods);

  return (
    <div className="tt-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="tt-setgrid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <strong style={{ fontSize: '.95rem' }}>School timing</strong>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Field label="School starts at">
              <input type="time" className="form-control" value={form.schoolStartTime}
                onChange={(e) => setForm((f) => ({ ...f, schoolStartTime: e.target.value }))} />
            </Field>
            <Field label="School ends at">
              <input type="time" className="form-control" value={form.schoolEndTime}
                onChange={(e) => setForm((f) => ({ ...f, schoolEndTime: e.target.value }))} />
            </Field>
          </div>
          <SaturdayLine config={saturday} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <strong style={{ fontSize: '.95rem' }}>Lay the day out for me</strong>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Field label="Periods">
              <input type="number" min="1" max="14" className="form-control" style={{ width: 92 }}
                value={autoCalc.totalPeriods}
                onChange={(e) => setAutoCalc((a) => ({ ...a, totalPeriods: e.target.value }))} />
            </Field>
            <Field label="Lunch after P#">
              <input type="number" min="0" className="form-control" style={{ width: 110 }}
                value={autoCalc.lunchAfterPeriod}
                onChange={(e) => setAutoCalc((a) => ({ ...a, lunchAfterPeriod: e.target.value }))} />
            </Field>
            <Field label="Lunch (minutes)">
              <input type="number" min="0" className="form-control" style={{ width: 120 }}
                value={autoCalc.lunchTimeTotalInMinutes}
                onChange={(e) => setAutoCalc((a) => ({ ...a, lunchTimeTotalInMinutes: e.target.value }))} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button size="sm" onClick={onAutoCalc}>Calculate periods</Button>
            <Button size="sm" variant="secondary" onClick={onLoadTemplate}>Load school grid</Button>
          </div>
          <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
            Periods are split evenly; any leftover minutes go to the last one.
          </span>
        </div>
      </div>

      <div className="tt-tablewrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
        <table className="tt-table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>#</th><th>Starts</th><th>Ends</th>
              <th style={{ width: 110 }}>Break?</th><th>Label</th><th style={{ width: 52 }} />
            </tr>
          </thead>
          <tbody>
            {periods.map((p, i) => (
              <tr key={i} className={p.isRecess ? 'is-break' : ''}>
                <td>
                  {p.isRecess
                    ? <Chip tone="amber">Break</Chip>
                    : <span className="tt-period">{p.periodNumber}</span>}
                </td>
                <td><input type="time" className="form-control" value={p.startTime || ''}
                  onChange={(e) => setPeriod(i, { startTime: e.target.value })} /></td>
                <td><input type="time" className="form-control" value={p.endTime || ''}
                  onChange={(e) => setPeriod(i, { endTime: e.target.value })} /></td>
                <td>
                  <CheckRow checked={!!p.isRecess} onChange={(v) => setPeriod(i, { isRecess: v })}>
                    Break
                  </CheckRow>
                </td>
                <td>
                  {p.isRecess
                    ? <input className="form-control" value={p.recessName || 'Break'}
                        onChange={(e) => setPeriod(i, { recessName: e.target.value })} />
                    : <span className="tt-table__muted">Teaching period</span>}
                </td>
                <td>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removePeriod(i)}
                    aria-label="Remove this row">
                    <Icon name="trash" size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {!periods.length && (
              <tr><td colSpan={6}>
                <div className="tt-table__empty">
                  <strong>No periods yet</strong>
                  <span>Use “Calculate periods”, load the school grid, or add rows one at a time.</span>
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button size="sm" variant="secondary" onClick={() => addPeriod(false)}>+ Teaching period</Button>
        <Button size="sm" variant="secondary" onClick={() => addPeriod(true)}>+ Break</Button>
        <span style={{ marginLeft: 'auto', fontSize: '.8rem', color: 'var(--text-muted)' }}>
          {plural(periods.filter(isTeaching).length, 'teaching period')} · {duration(mins.teaching)} taught
          · {duration(mins.breaks)} of breaks
        </span>
        <Button onClick={onSave} loading={saving}>Save period structure</Button>
      </div>
    </div>
  );
}

const SAT_MODE = { all: 'Every Saturday', '1_3_5': '1st, 3rd & 5th Saturday', '2_4': '2nd & 4th Saturday' };

export function SaturdayLine({ config }) {
  if (!config) return null;
  const tone = !config.working ? 'red' : config.halfDay ? 'amber' : 'green';
  const label = !config.working
    ? 'Saturday is a holiday'
    : `${SAT_MODE[config.mode] || 'Saturday'}${config.halfDay ? ' — half day' : ' — working'}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Chip tone={tone} dot>{label}</Chip>
      <span style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>
        Set in <a href="/admin/school-settings">School Settings</a>
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The cell editor
══════════════════════════════════════════════════════════════════════════ */

export function CellModal({
  day, period, subjects, teachers, teacherLoading,
  subject, teacher, extraSubs, merged, sameSections,
  extraTeacherOpts, extraTeacherLoading,
  onSubjectChange, onTeacherChange, onExtraChange, onExtraSubjectChange, onMergedChange,
  onSave, onClose, onClear,
}) {
  const used = new Set([subject, ...extraSubs.map((e) => e.subject)].filter(Boolean));

  const addExtra = () => {
    if (extraSubs.length >= MAX_EXTRA) return;
    onExtraChange([...extraSubs, { subject: '', teacher: '', subjectName: '', teacherName: '' }]);
  };
  const setExtra = (i, patch) => onExtraChange(extraSubs.map((e, k) => (k === i ? { ...e, ...patch } : e)));

  return (
    <Modal open onClose={onClose} maxWidth={520}
      title={`${day} · Period ${period}`}
      footer={<>
        <Button variant="danger" onClick={onClear}>Clear slot</Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={onSave}>Save slot</Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!subjects.length ? (
          <Note tone="warn">
            This section has no subjects assigned yet. Set them on the section’s own page
            before building its week.
          </Note>
        ) : (
          <Field label="Subject" required>
            <select className="form-control" value={subject} onChange={(e) => onSubjectChange(e.target.value)}>
              <option value="">Choose a subject…</option>
              {subjects.map((s) => <option key={s._id} value={s._id}>{s.subjectName}</option>)}
            </select>
          </Field>
        )}

        {subject && (
          <Field label="Teacher"
            hint={teacherLoading ? 'Checking who is free at this time…'
              : teachers.length ? 'Only teachers free at this exact slot are listed.'
              : 'Nobody is free for this slot — everyone who teaches this subject is already booked.'}>
            <select className="form-control" value={teacher} disabled={teacherLoading}
              onChange={(e) => onTeacherChange(e.target.value)}>
              <option value="">
                {teacherLoading ? 'Loading…' : teachers.length ? 'Choose a teacher (optional)' : 'No free teacher'}
              </option>
              {teachers.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </Field>
        )}

        {extraSubs.map((e, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10, alignItems: 'flex-end',
            padding: 12, borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)',
          }}>
            <Field label={`Also in this period (${i + 1})`} grow>
              <select className="form-control" value={e.subject}
                onChange={(ev) => { setExtra(i, { subject: ev.target.value, teacher: '' }); onExtraSubjectChange(i, ev.target.value); }}>
                <option value="">Choose a subject…</option>
                {subjects.filter((s) => !used.has(s._id) || s._id === e.subject)
                  .map((s) => <option key={s._id} value={s._id}>{s.subjectName}</option>)}
              </select>
            </Field>
            <Field label="Teacher" grow>
              <select className="form-control" value={e.teacher} disabled={!!extraTeacherLoading?.[i]}
                onChange={(ev) => setExtra(i, { teacher: ev.target.value })}>
                <option value="">{extraTeacherLoading?.[i] ? 'Loading…' : 'Optional'}</option>
                {(extraTeacherOpts?.[i] || []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </Field>
            <button type="button" className="btn btn-secondary btn-sm"
              onClick={() => onExtraChange(extraSubs.filter((_, k) => k !== i))} aria-label="Remove">
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}

        {subject && extraSubs.length < MAX_EXTRA && (
          <Button size="sm" variant="secondary" onClick={addExtra}>+ Split this period</Button>
        )}

        {sameSections.length > 0 && (
          <Field label="Taught together with"
            hint="The other sections sitting in this lesson. One teacher, one room, one class.">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {sameSections.map((sec) => {
                const on = merged.includes(sec._id);
                return (
                  <button key={sec._id} type="button"
                    className={`btn btn-${on ? 'primary' : 'secondary'} btn-sm`}
                    onClick={() => onMergedChange(on ? merged.filter((x) => x !== sec._id) : [...merged, sec._id])}>
                    {sec.className} · {sec.sectionName}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Auto fill
══════════════════════════════════════════════════════════════════════════ */

export function AutoFillModal({ subjects, loading, ppw, setPpw, days, genDays, setGenDays, slots, busy, onRun, onClose }) {
  const total = Object.values(ppw).reduce((n, v) => n + (v || 0), 0);
  const over = total > slots;

  return (
    <Modal open onClose={onClose} maxWidth={560} title="Auto fill this section"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={onRun} loading={busy} disabled={!subjects.length || !total || over}>
          Fill {plural(total, 'period')}
        </Button>
      </>}>
      {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Note tone="info">
            This lays subjects into this section’s empty week only. It does <strong>not</strong> check
            whether a teacher is already busy elsewhere — for a school-wide, conflict-free
            schedule use <a href="/admin/timetable/generate">Generate</a>.
          </Note>

          {!subjects.length && (
            <Note tone="warn">No subjects are assigned to this section yet.</Note>
          )}

          <Field label="Days to fill">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {days.map((d) => {
                const on = genDays.includes(d);
                return (
                  <button key={d} type="button" className={`btn btn-${on ? 'primary' : 'secondary'} btn-sm`}
                    onClick={() => setGenDays((p) => (on ? p.filter((x) => x !== d) : [...p, d]))}>
                    {d.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </Field>

          {subjects.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <strong style={{ fontSize: '.88rem' }}>Periods a week</strong>
                <span style={{ fontSize: '.82rem', color: over ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {total} of {slots} slots
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {subjects.map((s) => (
                  <div key={s._id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '.86rem' }}>{s.subjectName}</div>
                      <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                        {s.teacher?.name || 'No teacher assigned'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button type="button" className="btn btn-secondary btn-sm" style={{ width: 30, padding: 0 }}
                        onClick={() => setPpw((p) => ({ ...p, [s._id]: Math.max(0, (p[s._id] || 0) - 1) }))}>−</button>
                      <strong style={{ minWidth: 18, textAlign: 'center' }}>{ppw[s._id] || 0}</strong>
                      <button type="button" className="btn btn-secondary btn-sm" style={{ width: 30, padding: 0 }}
                        onClick={() => setPpw((p) => ({ ...p, [s._id]: (p[s._id] || 0) + 1 }))}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Copy from another section
══════════════════════════════════════════════════════════════════════════ */

export function CopyModal({ classes, current, busy, onCopy, onClose }) {
  const [sectionId, setSectionId] = useState('');
  const [withTeachers, setWithTeachers] = useState(true);

  const options = useMemo(() => classes.flatMap((c) => (c.sections || [])
    .filter((s) => String(s._id) !== String(current?._id))
    .map((s) => ({ _id: s._id, label: `${c.className} · Section ${s.sectionName}` }))), [classes, current]);

  return (
    <Modal open onClose={onClose} maxWidth={480} title="Copy a week from another section"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onCopy(sectionId, withTeachers)} loading={busy} disabled={!sectionId}>
          Copy into this section
        </Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Note tone="warn">
          Whatever is on screen for {current ? `${current.className} · ${current.sectionName}` : 'this section'} is
          replaced. Nothing is saved until you press Save Timetable, so you can still back out.
        </Note>
        <Field label="Copy from" required>
          <select className="form-control" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">Choose a section…</option>
            {options.map((o) => <option key={o._id} value={o._id}>{o.label}</option>)}
          </select>
        </Field>
        <SwitchRow checked={withTeachers} onChange={setWithTeachers} lead
          title="Bring the teachers across too"
          hint="Off copies subjects only, leaving every teacher to be chosen again — useful when the
                two sections are taught by different staff." />
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Import from a generated version
══════════════════════════════════════════════════════════════════════════ */

export function ImportModal({ versions, loading, busy, onImport, onClose }) {
  const [versionId, setVersionId] = useState('');
  return (
    <Modal open onClose={onClose} maxWidth={520} title="Import this section’s week from a version"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onImport(versionId)} loading={busy} disabled={!versionId}>Import</Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Note tone="info">
          Pulls what the generator worked out for this section, into the editor. Review it here
          and save — the version itself is left untouched.
        </Note>
        {loading ? <div style={{ padding: 30, textAlign: 'center' }}><Spinner /></div> : !versions.length ? (
          <Note tone="quiet">
            No generated versions for this year yet. Run <a href="/admin/timetable/generate">Generate</a> first.
          </Note>
        ) : (
          <Field label="Version" required>
            <select className="form-control" value={versionId} onChange={(e) => setVersionId(e.target.value)}>
              <option value="">Choose a version…</option>
              {versions.map((v) => (
                <option key={v._id} value={v._id}>
                  v{v.versionNumber} · {v.label || 'Untitled'} ({v.status})
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The whole class, side by side
══════════════════════════════════════════════════════════════════════════ */

export function FullWeekModal({ klass, weeks, days, loading, onClose }) {
  return (
    <Modal open onClose={onClose} maxWidth={1040}
      title={`${klass?.className || 'Class'} — every section’s week`}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {loading ? <div style={{ padding: 50, textAlign: 'center' }}><Spinner /></div> : !weeks.length ? (
        <Note tone="quiet">Nothing is saved for this class yet.</Note>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {weeks.map((w) => (
            <div key={w.sectionId}>
              <strong style={{ fontSize: '.92rem' }}>Section {w.sectionName}</strong>
              <div className="tt-tablewrap" style={{ marginTop: 8 }}>
                <table className="tt-week">
                  <thead>
                    <tr>
                      <th>Period</th>
                      {days.map((d) => <th key={d}>{d.slice(0, 3)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {w.periods.filter(isTeaching).map((p) => (
                      <tr key={p.periodNumber}>
                        <td className="tt-week__rowhead">
                          <span className="tt-period">{p.periodNumber}</span>
                          <small>{timeRange(p.startTime, p.endTime)}</small>
                        </td>
                        {days.map((d) => {
                          const cell = w.cells[`${d}-${p.periodNumber}`];
                          const tone = toneFor(cell?.subject);
                          return (
                            <td key={d}>
                              {cell ? (
                                <div className="tt-cell is-set" style={{
                                  background: TONE_BG[tone], borderColor: TONE_INK[tone] + '55', color: TONE_INK[tone],
                                }}>
                                  <span className="tt-cell__subject">{cell.subjectName}</span>
                                  <span className="tt-cell__teacher">{cell.teacherName || 'No teacher'}</span>
                                </div>
                              ) : <div className="tt-cell"><span className="tt-cell__empty">—</span></div>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Step 4 — what is about to be saved
══════════════════════════════════════════════════════════════════════════ */

export function ReviewPanel({ section, periods, days, cells, subjects, onJump }) {
  const teaching = periods.filter(isTeaching);
  const slots = teaching.length * days.length;
  const filled = Object.values(cells).filter((c) => c?.subject).length;
  const noTeacher = Object.values(cells).filter((c) => c?.subject && !c.teacher).length;

  const perSubject = new Map();
  for (const cell of Object.values(cells)) {
    if (!cell?.subject) continue;
    perSubject.set(cell.subject, (perSubject.get(cell.subject) || 0) + 1);
  }
  const unused = subjects.filter((s) => !perSubject.has(s._id));

  return (
    <div className="tt-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="tt-setgrid">
        <Panel icon="checkSquare" title="Before you save">
          {filled === slots
            ? <Note tone="good">Every one of the {slots} slots is filled.</Note>
            : <Note tone="warn">{plural(slots - filled, 'slot')} still empty, out of {slots}.</Note>}
          {noTeacher > 0 && (
            <Note tone="warn">
              {plural(noTeacher, 'period has', 'periods have')} a subject but no teacher. They save
              fine, but nobody is expected in the room.
            </Note>
          )}
          {unused.length > 0 && (
            <Note tone="quiet">
              Not timetabled at all: {unused.map((s) => s.subjectName).join(', ')}.
            </Note>
          )}
          <KV icon="calendar" k="Section" v={section ? `${section.className} · ${section.sectionName}` : '—'} />
          <KV icon="clock" k="Teaching periods a day" v={teaching.length} />
          <KV icon="calendarDays" k="Working days" v={days.length} />
          <KV icon="layers" k="Slots filled" v={`${filled} of ${slots}`} />
        </Panel>

        <Panel icon="book" title="Periods per subject">
          {!perSubject.size
            ? <Note tone="quiet">Nothing placed yet.</Note>
            : [...perSubject.entries()]
              .map(([id, n]) => {
                const subject = subjects.find((s) => s._id === id);
                const tone = toneFor(id);
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: TONE_INK[tone], flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: '.85rem' }}>
                      {subject?.subjectName || 'Subject'}
                    </span>
                    <Chip tone={tone}>{plural(n, 'period')}</Chip>
                  </div>
                );
              })}
          <Button size="sm" variant="secondary" onClick={onJump}>Back to the grid</Button>
        </Panel>
      </div>
    </div>
  );
}
