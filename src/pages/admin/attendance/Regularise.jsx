/**
 * Admin → Attendance → Regularise Attendance.
 *
 * Set or correct anyone's attendance for a past day directly — no request, no
 * approval. Staff are corrected by their punch times (their status is derived
 * from those), students by a status on their section's register.
 *
 * The panel beside the form shows what that day holds right now and updates
 * after saving, so the office corrects the record it can see rather than one it
 * assumes — the old form applied changes blind.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getRegularizeDay, regularizeStaffAttendance, regularizeStudentAttendance, searchRegularizePeople,
} from '../../../api/admin.api';
import { Button, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Avatar } from '../listParts';
import { FormStep } from '../leaveParts';
import {
  Card, EmptyNote, ROLE_LABEL, STATUS, StatusPill, fmtClock, fmtDay, fmtTime, todayKey, workedFor,
} from '../attendanceParts';

const blankForm = () => ({ date: todayKey(), checkIn: '', checkOut: '', status: 'present', remarks: '' });

const subtitleOf = (p) => (p.role === 'student'
  ? [[p.className, p.sectionName].filter(Boolean).join(' '), p.rollNumber && `Roll ${p.rollNumber}`].filter(Boolean).join(' · ') || p.email
  : p.email);

const RoleTag = ({ role }) => <span className={`atn-role atn-role--${role}`}>{ROLE_LABEL[role] || role}</span>;

export default function Regularise({ onChanged }) {
  const [q, setQ]           = useState('');
  const [people, setPeople] = useState([]);
  const [finding, setFinding] = useState(false);
  const [person, setPerson] = useState(null);
  const [form, setForm]     = useState(blankForm);
  const [day, setDay]       = useState(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tick, setTick]     = useState(0);

  // Search as you type; paused while someone is picked.
  useEffect(() => {
    if (person) return undefined;
    const t = setTimeout(async () => {
      setFinding(true);
      try {
        const res = await searchRegularizePeople({ search: q.trim() || undefined });
        const list = res?.data ?? res;
        setPeople(Array.isArray(list) ? list : []);
      } catch { setPeople([]); }
      finally { setFinding(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, person]);

  // What the picked day holds now.
  useEffect(() => {
    if (!person || !form.date) { setDay(null); return undefined; }
    let live = true;
    setDayLoading(true);
    getRegularizeDay({ userId: person._id, date: form.date })
      .then((res) => {
        if (!live) return;
        const d = res?.data ?? res;
        setDay(d);
        // Start from the recorded punches, so fixing a missing clock-out does
        // not mean retyping the clock-in that was fine.
        if (d?.kind === 'staff') setForm((f) => ({ ...f, checkIn: d.checkIn || '', checkOut: d.checkOut || '' }));
        if (d?.kind === 'student' && d.status) setForm((f) => ({ ...f, status: d.status }));
      })
      .catch(() => live && setDay(null))
      .finally(() => live && setDayLoading(false));
    return () => { live = false; };
  }, [person, form.date, tick]);

  const isStudent = person?.role === 'student';
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const reset = () => { setPerson(null); setQ(''); setForm(blankForm()); setDay(null); };

  const unchanged = day && (isStudent
    ? day.status === form.status
    : (day.checkIn || '') === form.checkIn && (day.checkOut || '') === form.checkOut);
  const offDay = !isStudent && day && ['holiday', 'weekend', 'leave'].includes(day.status);

  const apply = async (e) => {
    e.preventDefault();
    if (!person) return toast.error('Pick a person first');
    setSaving(true);
    try {
      if (isStudent) {
        await regularizeStudentAttendance({ studentId: person._id, date: form.date, status: form.status, remarks: form.remarks });
      } else {
        if (!form.checkIn && !form.checkOut) { setSaving(false); return toast.error('Enter a clock-in and/or clock-out time'); }
        await regularizeStaffAttendance({ teacherId: person._id, date: form.date, checkIn: form.checkIn, checkOut: form.checkOut, remarks: form.remarks });
      }
      toast.success(`Attendance updated for ${person.name}`);
      setForm((f) => ({ ...f, remarks: '' }));
      setTick((t) => t + 1);
      onChanged?.();
    } catch (err) { toast.error(err?.message || 'Could not update attendance'); }
    finally { setSaving(false); }
  };

  return (
    <div className="atn-body atn-body--form">
      <Card className="atn-regform" title="Regularise attendance"
        sub="Correct anyone's attendance for a day that has passed. It applies immediately — no approval step.">
        <form onSubmit={apply} className="atn-form">
          <FormStep n={1} title="Who" note="Staff and students, by name or email.">
            {person ? (
              <div className="atn-picked">
                <Avatar name={person.name} size={40} />
                <span className="atn-picked__text">
                  <b>{person.name} <RoleTag role={person.role} /></b>
                  <small>{subtitleOf(person)}</small>
                </span>
                <button type="button" className="atn-btn-ghost" onClick={reset}>Change</button>
              </div>
            ) : (
              <div className="atn-finder">
                <label className="atn-search atn-search--wide">
                  <Icon name="search" size={16} />
                  <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
                    placeholder="Search staff or students…" aria-label="Search people" />
                  {finding && <Spinner size="sm" />}
                </label>
                <ul className="atn-people" role="listbox" aria-label="People">
                  {people.map((p) => (
                    <li key={p._id}>
                      <button type="button" role="option" aria-selected="false" onClick={() => setPerson(p)}>
                        <Avatar name={p.name} size={32} />
                        <span><b>{p.name}</b><small>{subtitleOf(p)}</small></span>
                        <RoleTag role={p.role} />
                      </button>
                    </li>
                  ))}
                  {!finding && people.length === 0 && <li className="atn-people__none">No one matches “{q}”.</li>}
                </ul>
              </div>
            )}
          </FormStep>

          <FormStep n={2} title="Which day" note="Today or earlier.">
            <input type="date" className="form-control atn-date" required max={todayKey()} value={form.date}
              onChange={set('date')} aria-label="Date" />
          </FormStep>

          <FormStep n={3} title={isStudent ? 'Mark as' : 'Punch times'}
            note={person ? (isStudent ? 'Written to the section register for that day.' : 'The day counts as present once a clock-in exists.') : 'Pick a person first.'}>
            {isStudent ? (
              <div className="atn-choices" role="radiogroup" aria-label="Status">
                {['present', 'late', 'absent'].map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={form.status === m}
                    className={`atn-choice atn-choice--${STATUS[m].tone}${form.status === m ? ' is-on' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, status: m }))}>
                    <Icon name={m === 'present' ? 'checkCircle' : m === 'absent' ? 'closeCircle' : 'clock'} size={19} />
                    {STATUS[m].label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="atn-rg-in">Clock-in</label>
                  <input id="atn-rg-in" type="time" className="form-control" value={form.checkIn} onChange={set('checkIn')} disabled={!person} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="atn-rg-out">Clock-out</label>
                  <input id="atn-rg-out" type="time" className="form-control" value={form.checkOut} onChange={set('checkOut')} disabled={!person} />
                </div>
              </div>
            )}
          </FormStep>

          <FormStep n={4} title="Remarks" note="Optional — kept on the record.">
            <input className="form-control" value={form.remarks} onChange={set('remarks')} maxLength={300}
              placeholder="e.g. Biometric was down in the morning" disabled={!person} />
          </FormStep>

          <div className="atn-formfoot">
            {person && <button type="button" className="atn-textbtn" onClick={reset}>Start over</button>}
            <Button type="submit" loading={saving} disabled={!person || unchanged}
              title={unchanged ? 'This is already what the day holds' : undefined}>
              Apply regularisation
            </Button>
          </div>
        </form>
      </Card>

      <aside className="atn-rail">
        <Card title="Currently recorded" sub={person ? `${person.name} · ${fmtDay(form.date)}` : 'Pick a person and a day'}>
          {!person ? (
            <EmptyNote icon="user" title="Nobody picked">What that day holds shows here before you change it.</EmptyNote>
          ) : dayLoading && !day ? (
            <div className="atn-center"><Spinner /></div>
          ) : !day ? (
            <EmptyNote icon="alert" title="Could not read that day" />
          ) : day.kind === 'staff' ? (
            <div className={`atn-now${dayLoading ? ' is-loading' : ''}`}>
              <StatusPill status={day.status || 'unmarked'} label={day.status ? undefined : 'Upcoming'} />
              {day.label ? <p className="atn-now__label">{day.label}</p> : null}
              <div className="atn-facts">
                <div><span>Clock in</span><b>{day.checkIn ? fmtClock(day.checkIn) : '—'}</b></div>
                <div><span>Clock out</span><b>{day.checkOut ? fmtClock(day.checkOut) : '—'}</b></div>
                <div><span>Worked</span><b>{workedFor(day.checkIn, day.checkOut) || '—'}</b></div>
              </div>
              {day.remarks ? <p className="atn-now__meta">“{day.remarks}”{day.markedBy ? ` — ${day.markedBy}` : ''}</p> : null}
              {offDay && (
                <div className="atn-callout atn-callout--warn">
                  <Icon name="alert" size={17} />
                  <span>{STATUS[day.status].label} — attendance is not owed. Punches saved here still count as present.</span>
                </div>
              )}
              {day.pendingRequest && (
                <div className="atn-callout atn-callout--info">
                  <Icon name="clock" size={17} />
                  <span>{person.name} already asked for this day to be corrected. Applying here settles the day; review the request under Regularization Requests.</span>
                </div>
              )}
            </div>
          ) : (
            <div className={`atn-now${dayLoading ? ' is-loading' : ''}`}>
              <StatusPill status={day.status || 'unmarked'} />
              <div className="atn-facts">
                <div><span>Section</span><b>{[day.person.className, day.person.sectionName].filter(Boolean).join(' ') || '—'}</b></div>
                <div><span>Register</span><b>{day.registerTaken ? 'Taken' : 'Not taken'}</b></div>
                <div><span>Marked</span><b>{day.markedAt ? fmtTime(day.markedAt) : '—'}</b></div>
              </div>
              {day.markedBy ? <p className="atn-now__meta">Marked by {day.markedBy}</p> : null}
              {!day.enrolled && (
                <div className="atn-callout atn-callout--warn">
                  <Icon name="alert" size={17} />
                  <span>Not placed in a section, so there is no register to write to.</span>
                </div>
              )}
              {day.pendingRequest && (
                <div className="atn-callout atn-callout--info">
                  <Icon name="clock" size={17} />
                  <span>A correction to <b>{STATUS[day.pendingRequest.requestedStatus]?.label.toLowerCase()}</b> is waiting with the class teacher.</span>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="How this works">
          <ul className="atn-rules">
            <li><b>Staff</b> are present on any day with a clock-in. Enter only the punch that is missing — an existing punch is never blanked.</li>
            <li><b>Students</b> are marked on their section&rsquo;s register. If no register was taken that day, one is opened for the section.</li>
            <li>Nothing here needs approval, and every change carries “Regularized by admin” in its remarks.</li>
            <li>Staff who ask for a correction themselves appear under <b>Regularization Requests</b>.</li>
          </ul>
        </Card>
      </aside>
    </div>
  );
}
