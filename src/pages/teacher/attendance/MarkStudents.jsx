/**
 * Teacher → Attendance → Mark Students.
 *
 * One register at a time: a section on a day — and, when the school takes
 * attendance subject-wise, one subject (the Subject control is live only then;
 * a day-wise register is "General / Homeroom"). Marks are edited in place and
 * saved together; only rows that changed are sent, so fixing one student does
 * not re-announce the rest.
 *
 * The rail follows the register on screen: its month, the actions that act on
 * the whole register, and the registers most recently taken.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import {
  getAttendance, getAttendanceCalendar, getRecentRegisters, markAttendance,
} from '../../../api/teacher.api';
import { Modal, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Pager, ShowingCount } from '../../admin/leaveParts';
import {
  Card, Empty, Frame, MARKS, MenuButton, MenuRow, MonthCalendar, PillSelect, STATUS, SoftAvatar, Tile,
  addDays, dateOf, downloadCsv, fmtDay, fmtLongDay, plural, todayKey,
} from '../../../components/attendance/parts';

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '0%');
const tone = (p) => (p == null ? 'muted' : p >= 80 ? 'green' : p >= 60 ? 'amber' : 'red');

const CAL_LEGEND = [
  { key: 'present', label: 'Present' }, { key: 'absent', label: 'Absent' }, { key: 'late', label: 'Late' },
  { key: 'half-day', label: 'Half-Day' }, { key: 'unmarked', label: 'Not Marked' },
];
const CAL_TITLE = {
  present: 'Everyone attended', absent: 'Some students absent', late: 'Some students late',
  'half-day': 'Some students on a half day', unmarked: 'No register taken',
};

export default function MarkStudents({ tab, onTab, initialSection }) {
  const today = todayKey();
  const [section, setSection] = useState(initialSection || '');
  const [subject, setSubject] = useState('');
  const [date, setDate]       = useState(today);
  const [month, setMonth]     = useState(today.slice(0, 7) + '-01');
  const [marks, setMarks]     = useState({});   // studentId → status (unsaved)
  const [notes, setNotes]     = useState({});   // studentId → remark (unsaved)
  const [query, setQuery]     = useState('');
  const [page, setPage]       = useState(1);
  const [perPage, setPerPage] = useState(8);
  const [showRemarks, setShowRemarks] = useState(true);
  const [picked, setPicked]   = useState([]);
  const [saving, setSaving]   = useState(false);
  const [version, setVersion] = useState(0);
  const [allRecent, setAllRecent] = useState(false);

  const { data: reg, loading } = useFetch(
    () => getAttendance({ section: section || undefined, subject: subject || undefined, date }),
    [section, subject, date, version]);

  // The server answers with the register it opened; follow it, so the controls
  // show what is on screen rather than what was asked for.
  useEffect(() => {
    if (!reg) return;
    if (reg.refused) toast.error(reg.refused);
    if (reg.section?._id && reg.section._id !== section) setSection(reg.section._id);
    if (reg.subject?._id && reg.subject._id !== subject) setSubject(reg.subject._id);
  }, [reg]); // eslint-disable-line react-hooks/exhaustive-deps

  // A different register starts clean.
  useEffect(() => { setMarks({}); setNotes({}); setPicked([]); setPage(1); }, [section, subject, date]);
  useEffect(() => { setMonth(`${date.slice(0, 7)}-01`); }, [date]);

  const { data: cal, loading: calLoading } = useFetch(
    () => (section ? getAttendanceCalendar({ section, subject: subject || undefined, month: month.slice(0, 7) }) : Promise.resolve(null)),
    [section, subject, month, version]);
  const { data: recentData, loading: recentLoading } = useFetch(() => getRecentRegisters({ limit: allRecent ? 20 : 3 }), [version, allRecent]);
  const recent = Array.isArray(recentData) ? recentData : [];

  const mode     = reg?.mode || 'day';
  const students = reg?.students || [];
  const saved    = useMemo(() => Object.fromEntries((reg?.records || []).map((r) => [String(r.student), r])), [reg]);
  const current  = (s) => marks[s._id] ?? saved[s._id]?.status ?? null;
  const remarkOf = (s) => notes[s._id] ?? saved[s._id]?.remarks ?? '';

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, 'half-day': 0, unmarked: 0 };
    students.forEach((s) => { c[current(s) || 'unmarked'] += 1; });
    return c;
  }, [students, marks, saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const changes = useMemo(() => students.filter((s) => {
    const was = saved[s._id];
    const now = current(s);
    if (!now) return false;
    return now !== was?.status || (notes[s._id] !== undefined && notes[s._id] !== (was?.remarks || ''));
  }), [students, marks, notes, saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const matched = q
    ? students.filter((s) => s.name.toLowerCase().includes(q) || String(s.rollNumber).toLowerCase().includes(q))
    : students;
  const pages = Math.max(1, Math.ceil(matched.length / perPage));
  const safePage = Math.min(page, pages);
  const rows = matched.slice((safePage - 1) * perPage, safePage * perPage);
  const allPicked = rows.length > 0 && rows.every((r) => picked.includes(r._id));

  const locked = !!reg?.future || !reg?.section || (mode === 'subject' && !reg?.subject);
  const setMark = (id, status) => { if (!locked) setMarks((m) => ({ ...m, [id]: status })); };
  const markMany = (ids, status) => setMarks((m) => { const n = { ...m }; ids.forEach((id) => { n[id] = status; }); return n; });

  const save = async () => {
    if (!changes.length) return toast('Nothing new to save');
    setSaving(true);
    try {
      await markAttendance({
        date, section, subject: subject || undefined,
        records: changes.map((s) => ({ studentId: s._id, status: current(s), remarks: remarkOf(s) })),
      });
      const left = students.filter((s) => !current(s)).length;
      toast.success(`${plural(changes.length, 'mark')} saved${left ? ` · ${plural(left, 'student')} still not marked` : ''}`);
      setVersion((v) => v + 1);
    } catch (e) { toast.error(e?.message || 'Could not save the register'); }
    finally { setSaving(false); }
  };

  /** Fill the students nobody has marked from the last register before this day. */
  const autoFill = async () => {
    const earlier = (cal?.days || []).filter((d) => d.key < date && d.total).map((d) => d.key).sort().pop();
    let from = earlier;
    if (!from) {
      const prev = await getAttendanceCalendar({ section, subject: subject || undefined, month: addDays(month, -1).slice(0, 7) }).catch(() => null);
      from = (prev?.data?.days || prev?.days || []).filter((d) => d.total).map((d) => d.key).sort().pop();
    }
    if (!from) return toast('No earlier register to copy from');
    const res = await getAttendance({ section, subject: subject || undefined, date: from }).catch(() => null);
    const byStudent = Object.fromEntries(((res?.data ?? res)?.records || []).map((r) => [String(r.student), r.status]));
    const fill = students.filter((s) => !current(s) && byStudent[s._id]);
    if (!fill.length) return toast(`Everyone is already marked — nothing to copy from ${fmtDay(from)}`);
    setMarks((m) => { const n = { ...m }; fill.forEach((s) => { n[s._id] = byStudent[s._id]; }); return n; });
    toast.success(`${plural(fill.length, 'student')} filled from ${fmtDay(from)}`);
  };

  const download = () => {
    const where = `${reg?.section?.label || 'register'}${reg?.subject ? ` ${reg.subject.name}` : ''}`;
    downloadCsv(`attendance-${where.replace(/[^\w]+/g, '-').toLowerCase()}-${date}.csv`,
      ['Roll No', 'Student', 'Status', 'Remark', 'Date', 'Class', 'Subject'],
      students.map((s) => [s.rollNumber, s.name, current(s) ? STATUS[current(s)].label : 'Not marked', remarkOf(s),
        date, reg?.section?.label || '', reg?.subject?.name || 'General / Homeroom']));
  };

  const calDays = useMemo(() => Object.fromEntries((cal?.days || []).map((d) => [d.key, {
    state: d.state,
    title: d.total ? `${fmtDay(d.key)} · ${d.present + d.late + d.halfDay} of ${d.total} attended (${d.percentage}%)`
      : d.label ? `${fmtDay(d.key)} · ${d.label}` : CAL_TITLE[d.state] ? `${fmtDay(d.key)} · ${CAL_TITLE[d.state]}` : fmtDay(d.key),
  }])), [cal]);

  const openRegister = (r) => {
    setAllRecent(false);
    setSection(r.section._id);
    setSubject(r.subject?._id || '');
    setDate(r.date);
  };

  const sections = reg?.sections || [];
  const subjects = reg?.subjects || [];
  const dayOff = reg?.dayOff;
  const weekday = WEEKDAY[dateOf(date).getDay()];

  const rail = (
    <>
      <Card title="Attendance Calendar" className="tat-calcard">
        <MonthCalendar month={month} onMonth={setMonth} days={calDays} selected={date}
          onSelect={(k) => setDate(k)} legend={CAL_LEGEND} loading={calLoading} />
      </Card>
      <Card title="Quick Actions">
        <div className="tat-quick">
          <button type="button" className="tat-quick__btn tat-quick__btn--primary" onClick={save} disabled={saving || locked}>
            {saving ? <Spinner size="sm" /> : <Icon name="save" size={20} />} Save Attendance
            {changes.length ? <span className="tat-quick__count">{changes.length}</span> : null}
          </button>
          <button type="button" className="tat-quick__btn" disabled={locked || !students.length}
            onClick={() => markMany(students.map((s) => s._id), 'present')}>
            <Icon name="users" size={20} /> Mark All Present
          </button>
          <button type="button" className="tat-quick__btn" title="Undo every mark and remark you have not saved"
            onClick={() => {
              if (!Object.keys(marks).length && !Object.keys(notes).length) return toast('Nothing unsaved to clear');
              setMarks({}); setNotes({});
            }}>
            <Icon name="refresh" size={20} /> Clear All
          </button>
          <button type="button" className="tat-quick__btn" disabled={!students.length} onClick={download}>
            <Icon name="download" size={20} /> Download Sheet
          </button>
        </div>
      </Card>
      <Card title="Recent Classes"
        actions={<button type="button" className="tat-link" onClick={() => setAllRecent(true)}>View All <Icon name="chevronRight" size={15} /><Icon name="chevronRight" size={15} style={{ marginLeft: -11 }} /></button>}>
        {recentLoading && !recent.length ? <div className="tat-center"><Spinner size="sm" /></div>
          : !recent.length ? <p className="tat-muted tat-small">No registers taken yet.</p>
          : <RecentList items={recent} onOpen={openRegister} />}
      </Card>
      <Modal open={allRecent} onClose={() => setAllRecent(false)} title="Recent registers" maxWidth={520}>
        {recentLoading ? <div className="tat-center"><Spinner /></div> : <RecentList items={recent} onOpen={openRegister} />}
      </Modal>
    </>
  );

  return (
    <Frame tab={tab} onTab={onTab} rail={rail} tabStyle="pills" railWidth="sm"
      subtitle="Take attendance, track student presence and manage corrections."
      actions={<span className="tat-datechip"><Icon name="calendar" size={20} />{fmtLongDay(today)}</span>}>

      <section className="tat-card tat-regbar">
        <div className="tat-regbar__who">
          <span className="tat-card__icon tat-t--indigo"><Icon name="bookOpen" size={26} /></span>
          <div>
            {sections.length > 1 ? (
              <label className="tat-regbar__pick">
                <select value={section} aria-label="Section" onChange={(e) => { setSection(e.target.value); setSubject(''); }}>
                  {sections.map((s) => <option key={s._id} value={s._id}>{s.label}</option>)}
                </select>
                <Icon name="chevronDown" size={15} />
              </label>
            ) : <b>{reg?.section?.label || (loading ? 'Loading…' : 'No section')}</b>}
            <small>{reg?.section ? `Class Teacher: ${reg.section.classTeacher || 'Not assigned'}` : 'You have no register to take'}</small>
          </div>
        </div>
        {mode === 'subject' ? (
          <PillSelect icon="percent" label="Subject" value={subject} onChange={setSubject} disabled={!subjects.length}>
            {!subjects.length && <option value="">No subjects</option>}
            {subjects.map((s) => (
              <option key={s._id} value={s._id}>{s.name}{s.days?.includes(weekday) ? ' · today' : ''}</option>
            ))}
          </PillSelect>
        ) : (
          <PillSelect icon="percent" label="Subject" value="day" onChange={() => {}} disabled
            className="tat-pillselect--fixed">
            <option value="day">General / Homeroom</option>
          </PillSelect>
        )}
        <label className="tat-dateinput">
          <Icon name="calendar" size={18} />
          <input type="date" value={date} max={today} aria-label="Date" onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <div className="tat-daystep">
          <button type="button" className="tat-iconbtn" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
            <Icon name="chevronLeft" size={18} />
          </button>
          <button type="button" className="tat-btn" onClick={() => setDate(today)}>Today</button>
          <button type="button" className="tat-iconbtn" aria-label="Next day" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}>
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
      </section>

      <div className="tat-tiles tat-tiles--5">
        <Tile icon="users" tone="green" value={students.length} label="Total Students" />
        <Tile icon="shieldCheck" solid tone="green" value={counts.present} label="Present" note={pct(counts.present, students.length)} />
        <Tile icon="user" tone="red" value={counts.absent} label="Absent" note={pct(counts.absent, students.length)} />
        <Tile icon="gauge" tone="amber" value={counts.late} label="Late" note={pct(counts.late, students.length)} />
        <Tile icon="halfDay" tone="indigo" value={counts['half-day']} label="Half-Day" note={pct(counts['half-day'], students.length)} />
      </div>

      <section className="tat-card">
        {(dayOff || reg?.future) && (
          <div className="tat-callout tat-callout--warn">
            <Icon name="alert" size={17} />
            <span>
              {reg?.future ? 'This day has not happened yet — attendance can be marked from the day itself.'
                : dayOff.status === 'holiday' ? <>{fmtDay(date)} is a holiday — <b>{dayOff.label}</b>. Registers are not usually taken.</>
                : <>{fmtDay(date)} is not a working day. Registers are not usually taken.</>}
            </span>
          </div>
        )}
        <div className="tat-toolbar">
          <label className="tat-search">
            <Icon name="search" size={17} />
            <input value={query} placeholder="Search by name or roll number..." aria-label="Search students"
              onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          </label>
          <span className="tat-toolbar__gap" />
          <button type="button" className="tat-btn tat-btn--soft" onClick={autoFill} disabled={locked || !students.length}
            title="Fill students not yet marked from the last register taken">
            <Icon name="wand" size={18} /> Auto Fill
          </button>
          <MenuButton label={picked.length ? `Bulk Actions (${picked.length})` : 'Bulk Actions'} align="right">
            {MARKS.map((m) => (
              <MenuRow key={m} icon="check" disabled={!picked.length || locked} onClick={() => markMany(picked, m)}>
                Mark selected {STATUS[m].label}
              </MenuRow>
            ))}
            <MenuRow icon="refresh" disabled={!picked.length} onClick={() => setMarks((mk) => {
              const n = { ...mk }; picked.forEach((id) => { delete n[id]; }); return n;
            })}>Undo changes on selected</MenuRow>
          </MenuButton>
          <MenuButton icon="settings" caret={false} className="tat-iconbtn" align="right" title="Table options">
            {[8, 20, 50].map((n) => (
              <MenuRow key={n} icon={perPage === n ? 'check' : 'list'} onClick={() => { setPerPage(n); setPage(1); }}>{n} rows per page</MenuRow>
            ))}
            <MenuRow icon={showRemarks ? 'eyeOff' : 'eye'} onClick={() => setShowRemarks((v) => !v)}>
              {showRemarks ? 'Hide remark column' : 'Show remark column'}
            </MenuRow>
          </MenuButton>
        </div>

        {loading && !reg ? <div className="tat-center"><Spinner /></div>
          : !reg?.section ? (
            <Empty icon="clipboard" title="No register to take">
              {mode === 'subject'
                ? 'You are not the class teacher, vice class teacher or a subject teacher of any section this year.'
                : 'You are not the class teacher or vice class teacher of any section, so there is no register to mark.'}
            </Empty>
          ) : mode === 'subject' && !reg?.subject ? (
            <Empty icon="layers" title="No subject to register">No subject is linked to this section yet.</Empty>
          ) : !students.length ? (
            <Empty icon="users" title="No students in this section">Students placed in the section appear here.</Empty>
          ) : (
            <div className={`tat-tablewrap${loading ? ' is-loading' : ''}`}>
              <table className="tat-table tat-table--register">
                <thead>
                  <tr>
                    <th className="tat-table__tick">
                      <input type="checkbox" aria-label="Select all on this page" checked={allPicked}
                        onChange={() => setPicked((p) => (allPicked ? p.filter((id) => !rows.some((r) => r._id === id)) : [...new Set([...p, ...rows.map((r) => r._id)])]))} />
                    </th>
                    <th>#</th><th>Student Name</th><th>Roll No</th>
                    {MARKS.map((m) => <th key={m}>{STATUS[m].label}</th>)}
                    {showRemarks && <th>Remark (Optional)</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s, i) => {
                    const now = current(s);
                    const edited = marks[s._id] !== undefined && marks[s._id] !== saved[s._id]?.status;
                    return (
                      <tr key={s._id} className={edited ? 'is-edited' : ''}>
                        <td className="tat-table__tick">
                          <input type="checkbox" aria-label={`Select ${s.name}`} checked={picked.includes(s._id)}
                            onChange={() => setPicked((p) => (p.includes(s._id) ? p.filter((x) => x !== s._id) : [...p, s._id]))} />
                        </td>
                        <td className="tat-muted">{(safePage - 1) * perPage + i + 1}</td>
                        <td><span className="tat-who"><SoftAvatar name={s.name} src={s.photo} /><b>{s.name}</b></span></td>
                        <td>{s.rollNumber || '—'}</td>
                        {MARKS.map((m) => (
                          <td key={m}>
                            <button type="button" role="radio" aria-checked={now === m} disabled={locked}
                              aria-label={`${s.name}: ${STATUS[m].label}`}
                              className={`tat-mark tat-mark--${STATUS[m].tone}${now === m ? ' is-on' : ''}`}
                              onClick={() => setMark(s._id, m)}>
                              <i aria-hidden>{now === m ? <Icon name="check" size={11} /> : null}</i>{STATUS[m].label}
                            </button>
                          </td>
                        ))}
                        {showRemarks && (
                          <td>
                            <input className="tat-remark" value={remarkOf(s)} maxLength={300} placeholder="Add remark..."
                              aria-label={`Remark for ${s.name}`} disabled={locked}
                              onChange={(e) => setNotes((n) => ({ ...n, [s._id]: e.target.value }))} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        {students.length > 0 && (
          <footer className="tat-foot">
            <ShowingCount page={safePage} limit={perPage} count={rows.length} total={matched.length} noun="student" />
            <Pager page={safePage} pages={pages} onPage={setPage} />
          </footer>
        )}
      </section>
    </Frame>
  );
}

function RecentList({ items, onOpen }) {
  return (
    <ul className="tat-recent">
      {items.map((r) => (
        <li key={r._id}>
          <button type="button" onClick={() => onOpen(r)}>
            <span className={`tat-card__icon tat-t--${r.subject ? 'pink' : 'indigo'}`}><Icon name={r.subject ? 'users' : 'bookOpen'} size={20} /></span>
            <span className="tat-recent__text"><b>{r.section.label}</b><small>{r.caption}</small></span>
            <span className="tat-recent__side">
              <small>{fmtDay(r.date)}</small>
              <span className={`tat-pct tat-pct--${tone(r.percentage)}`}>{r.percentage == null ? '—' : `${r.percentage}%`}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
