/**
 * Today's register, for every student in the school.
 *
 * Filters sit in the card head (class, section, search); the counts under the
 * title double as the status filter. Ticking rows offers present / absent /
 * late for exactly those rows. "Mark All" fills in only the students nobody
 * has marked yet — a teacher's absences are never overwritten by it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import {
  getAttendanceToday, markAllStudentAttendance, markStudentAttendance,
} from '../../../api/admin.api';
import { Button, Modal } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Avatar, MenuItem, MenuSep, RowMenu, useSelection } from '../listParts';
import { DialogHead, Pager, ShowingCount } from '../leaveParts';
import {
  Card, EmptyNote, STATUS, StatusPill, fmtTime, plural, todayKey,
} from '../attendanceParts';

const LIMIT = 10;
const MARKS = ['present', 'absent', 'late'];

export default function TodayAttendance({ defaultClass = '', version, onChanged, onOpenRegister }) {
  const today = todayKey();
  const [cls, setCls]         = useState(defaultClass);
  const [section, setSection] = useState('');
  const [status, setStatus]   = useState('');
  const [query, setQuery]     = useState('');
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [busy, setBusy]       = useState(false);
  const [markAll, setMarkAll] = useState(false);

  // The header's class filter leads; this card can still be narrowed on its own.
  useEffect(() => { setCls(defaultClass); setSection(''); setPage(1); }, [defaultClass]);
  useEffect(() => {
    const t = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, meta, loading, refetch } = useFetch(
    () => getAttendanceToday({ date: today, class: cls || undefined, section: section || undefined,
      search: search || undefined, status: status || undefined, page, limit: LIMIT }),
    [cls, section, search, status, page, version],
  );
  const rows    = Array.isArray(data) ? data : [];
  const counts  = meta?.counts || { total: 0, present: 0, absent: 0, late: 0, unmarked: 0 };
  const classes = meta?.classes || [];
  const sections = useMemo(() => classes.find((c) => c._id === cls)?.sections || [], [classes, cls]);
  const sel = useSelection(rows, `${cls}|${section}|${search}|${status}|${page}`);

  const scope = cls
    ? `${classes.find((c) => c._id === cls)?.className || 'this class'}${section ? ` ${sections.find((s) => s._id === section)?.sectionName || ''}` : ''}`
    : 'all classes';

  // The page's refresh signal refetches this card along with the figures above it.
  const done = () => { sel.clear(); if (onChanged) onChanged(); else refetch(); };

  const markRows = async (targets, mark) => {
    setBusy(true);
    try {
      const res = await markStudentAttendance({
        date: today,
        records: targets.map((r) => ({ studentId: r._id, section: r.section, status: mark })),
      });
      const out = res?.data ?? res;
      toast.success(out.changed
        ? `${plural(out.changed, 'student')} marked ${STATUS[mark].label.toLowerCase()}`
        : 'Already marked that way — nothing changed');
      done();
    } catch (e) { toast.error(e?.message || 'Could not save the marks'); }
    finally { setBusy(false); }
  };

  const pickStatus = (s) => { setStatus((cur) => (cur === s ? '' : s)); setPage(1); };
  const pickClass  = (v) => { setCls(v); setSection(''); setPage(1); };

  const countChip = (key, n) => (
    <button key={key} type="button" onClick={() => pickStatus(key)} aria-pressed={status === key}
      className={`atn-count${status === key ? ' is-on' : ''}`}>
      <i style={{ background: STATUS[key].dot }} aria-hidden />{n} {STATUS[key].label.toLowerCase()}
    </button>
  );

  return (
    <Card className="atn-today"
      title="Today's Attendance"
      sub={
        <span className="atn-counts">
          <span>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          {countChip('present', counts.present)}
          {countChip('absent', counts.absent)}
          {countChip('late', counts.late)}
          {countChip('unmarked', counts.unmarked)}
        </span>
      }
      actions={
        <>
          <button type="button" className="atn-btn-soft" onClick={() => setMarkAll(true)} disabled={!counts.unmarked}>
            Mark All
          </button>
          <select className="atn-mini-select" value={cls} onChange={(e) => pickClass(e.target.value)} aria-label="Class">
            <option value="">All classes</option>
            {classes.map((c) => <option key={c._id} value={c._id}>{c.className}</option>)}
          </select>
          <select className="atn-mini-select" value={section} disabled={!cls}
            onChange={(e) => { setSection(e.target.value); setPage(1); }} aria-label="Section"
            title={cls ? undefined : 'Pick a class first'}>
            <option value="">All sections</option>
            {sections.map((s) => <option key={s._id} value={s._id}>Section {s.sectionName}</option>)}
          </select>
          <label className="atn-search">
            <Icon name="search" size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search students..." aria-label="Search students" />
          </label>
        </>
      }>

      {sel.ids.length > 0 && (
        <div className="atn-selbar" role="region" aria-label="Selected students">
          <b>{plural(sel.ids.length, 'student')} selected</b>
          {MARKS.map((m) => (
            <button key={m} type="button" className={`atn-selbar__btn atn-selbar__btn--${STATUS[m].tone}`}
              disabled={busy} onClick={() => markRows(sel.rows, m)}>
              Mark {STATUS[m].label.toLowerCase()}
            </button>
          ))}
          <button type="button" className="atn-textbtn" onClick={sel.clear}>Clear</button>
        </div>
      )}

      {!loading && rows.length === 0 ? (
        <EmptyNote icon="users" title={counts.total ? 'No students match' : 'No students here'}>
          {counts.total
            ? 'Try a different status, class or search.'
            : 'Students appear once they are placed in a section of the running academic year.'}
        </EmptyNote>
      ) : (
        <div className={`table-wrap${loading ? ' atn-dim' : ''}`}>
          <table className="atn-table atn-table--roster">
            <thead>
              <tr>
                <th className="atn-table__tick">
                  <input type="checkbox" checked={sel.allOn} onChange={sel.toggleAll}
                    ref={(el) => { if (el) el.indeterminate = sel.some; }} aria-label="Select all students on this page" />
                </th>
                <th>Student</th><th>Class</th><th>Section</th><th>Status</th><th>Marked at</th>
                <th className="atn-table__act">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} data-focus-id={r._id} className={sel.has(r._id) ? 'is-picked' : undefined}>
                  <td className="atn-table__tick">
                    <input type="checkbox" checked={sel.has(r._id)} onChange={() => sel.toggle(r._id)} aria-label={`Select ${r.name}`} />
                  </td>
                  <td>
                    <span className="atn-who">
                      <Avatar name={r.name} src={r.photo} size={34} tone="indigo" />
                      <span><b>{r.name}</b>{r.rollNumber ? <small>Roll {r.rollNumber}</small> : null}</span>
                    </span>
                  </td>
                  <td>{r.className}</td>
                  <td>{r.sectionName}</td>
                  <td><StatusPill status={r.status || 'unmarked'} /></td>
                  <td title={r.markedBy ? `by ${r.markedBy}` : undefined}>
                    {r.markedAt ? fmtTime(r.markedAt) : <span className="atn-muted">—</span>}
                  </td>
                  <td className="atn-table__act">
                    <RowMenu label={`Actions for ${r.name}`}>
                      {MARKS.filter((m) => m !== r.status).map((m) => (
                        <MenuItem key={m} icon={m === 'present' ? 'checkCircle' : m === 'absent' ? 'closeCircle' : 'clock'}
                          onClick={() => markRows([r], m)}>Mark {STATUS[m].label.toLowerCase()}</MenuItem>
                      ))}
                      <MenuSep />
                      <MenuItem icon="clipboard" onClick={() => onOpenRegister(r.section, today)}>Open section register</MenuItem>
                      <MenuItem icon="chart" to={`/admin/student-analytics/${r._id}`}>Student analytics</MenuItem>
                    </RowMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(meta?.total || 0) > 0 && (
        <footer className="atn-foot">
          <ShowingCount page={page} limit={LIMIT} count={rows.length} total={meta.total} noun="student" />
          <Pager page={page} pages={meta.pages} onPage={setPage} />
        </footer>
      )}

      {markAll && (
        <MarkAllDialog count={counts.unmarked} scope={scope} busy={busy}
          onClose={() => setMarkAll(false)}
          onConfirm={async (mark) => {
            setBusy(true);
            try {
              const res = await markAllStudentAttendance({
                date: today, status: mark, class: cls || undefined, section: section || undefined, search: search || undefined,
              });
              const out = res?.data ?? res;
              toast.success(`${plural(out.saved || 0, 'student')} marked ${STATUS[mark].label.toLowerCase()}`);
              setMarkAll(false);
              done();
            } catch (e) { toast.error(e?.message || 'Could not mark attendance'); }
            finally { setBusy(false); }
          }} />
      )}
    </Card>
  );
}

function MarkAllDialog({ count, scope, busy, onClose, onConfirm }) {
  const [mark, setMark] = useState('present');
  return (
    <Modal open onClose={onClose} maxWidth={500}
      title={<DialogHead icon="checkSquare" title="Mark all" subtitle={`Today, ${scope}`} />}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={() => onConfirm(mark)}>Mark {plural(count, 'student')}</Button>
      </>}>
      <p className="atn-dlgtext">
        {plural(count, 'student')} in {scope} {count === 1 ? 'has' : 'have'} not been marked today.
        Everyone already marked keeps the mark they have.
      </p>
      <div className="atn-choices" role="radiogroup" aria-label="Mark them as">
        {MARKS.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mark === m}
            className={`atn-choice atn-choice--${STATUS[m].tone}${mark === m ? ' is-on' : ''}`} onClick={() => setMark(m)}>
            <Icon name={m === 'present' ? 'checkCircle' : m === 'absent' ? 'closeCircle' : 'clock'} size={20} />
            {STATUS[m].label}
          </button>
        ))}
      </div>
      {mark !== 'present' && (
        <div className="atn-callout atn-callout--warn">
          <Icon name="alert" size={17} />
          <span>Students and their parents are notified of every absent or late mark.</span>
        </div>
      )}
    </Modal>
  );
}
