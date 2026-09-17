/**
 * Teacher → Attendance → Student Corrections.
 *
 * Requests from students to change a mark on a register this teacher holds —
 * the section's registers for a class or vice class teacher, their own
 * subjects' registers for a subject teacher in a subject-wise school. A request
 * can be approved, rejected, or sent back with a question the student answers
 * (with files) on their own attendance page. "New Correction" is the teacher
 * changing a mark themselves, kept as an approved request so the change has a
 * record of who made it and why.
 *
 * Notifications link here with ?tab=corrections&focus=<id>.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import {
  createStudentCorrection, getAttendance, getStudentCorrections, requestCorrectionInfo, reviewCorrection,
} from '../../../api/teacher.api';
import { Button, Modal, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Pager, ShowingCount } from '../../admin/leaveParts';
import { MenuItem, RowMenu, fileUrl } from '../../admin/listParts';
import {
  Card, Empty, Frame, MARKS, MenuButton, MenuRow, PillSelect, STATUS, SoftAvatar, StatusPill, Tile,
  dateOf, fmtDay, fmtMonth, fmtMonthYear, fmtStamp, monthShort, todayKey,
} from '../../../components/attendance/parts';

const LIMIT = 8;
const CHIPS = [
  { value: '', label: 'All', count: 'all' },
  { value: 'pending', label: 'Pending', count: 'pending' },
  { value: 'approved', label: 'Approved', count: 'approved' },
  { value: 'rejected', label: 'Rejected', count: 'rejected' },
];
const reqStatus = (s) => (s === 'pending' ? 'waiting' : s);
const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '0%');
const stamp = fmtStamp;
const markLabel = (m) => STATUS[m || 'unmarked']?.label || m;

const EVENT = {
  submitted:      { title: 'Request submitted',          tone: 'green' },
  info_requested: { title: 'More information requested', tone: 'amber' },
  replied:        { title: 'Student replied',            tone: 'indigo' },
  approved:       { title: 'Approved',                   tone: 'green' },
  rejected:       { title: 'Rejected',                   tone: 'red' },
  corrected:      { title: 'Corrected by teacher',       tone: 'indigo' },
};
const ROLE = { student: 'Student', teacher: 'Teacher', school_admin: 'School Admin' };

export default function StudentCorrections({ tab, onTab, focus }) {
  const [status, setStatus]   = useState('');
  const [section, setSection] = useState('');
  const [month, setMonth]     = useState(todayKey().slice(0, 7));
  const [query, setQuery]     = useState('');
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [version, setVersion] = useState(0);
  const [picked, setPicked]   = useState(focus || null);
  const [focusId, setFocusId] = useState(focus || null);
  const [decision, setDecision] = useState(null);  // { row, kind: 'approve'|'reject'|'info' }
  const [creating, setCreating] = useState(false);
  const [howTo, setHowTo]     = useState(false);
  const [timeline, setTimeline] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [query]);

  // A notification names a request that may be from any month: open on it
  // without a month filter, once.
  const { data, meta, loading } = useFetch(() => getStudentCorrections({
    status: status || undefined, section: section || undefined, search: search || undefined,
    month: focusId ? undefined : month, page, limit: LIMIT, focus: focusId || undefined,
  }), [status, section, month, search, page, version, focusId]);

  const rows     = Array.isArray(data) ? data : [];
  const counts   = meta?.counts || { all: 0, pending: 0, approved: 0, rejected: 0 };
  const sections = meta?.sections || [];
  const mode     = meta?.mode || 'day';

  // One class of their own: the filter names it rather than reading "All classes".
  const [pickedDefault, setPickedDefault] = useState(false);
  useEffect(() => {
    if (pickedDefault || !meta) return;
    setPickedDefault(true);
    if (sections.length === 1 && !section) setSection(sections[0]._id);
  }, [meta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!meta) return;
    if (focusId && meta.page && meta.page !== page) setPage(meta.page);
    if (focusId) { if (meta.focusFound === false) toast.error('That request is not on a register you hold'); setFocusId(null); }
  }, [meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = rows.find((r) => r._id === picked) || (picked ? null : rows[0]) || null;
  useEffect(() => {
    if (picked && !loading && rows.length && !rows.some((r) => r._id === picked)) setPicked(rows[0]._id);
  }, [rows, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = (row) => { if (row?._id) setPicked(row._id); setVersion((v) => v + 1); };
  const monthOptions = useMemo(() => {
    const now = todayKey().slice(0, 7);
    return Array.from({ length: 12 }, (_, i) => {
      const d = dateOf(`${now}-01`); d.setMonth(d.getMonth() - i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  }, []);

  const rail = (
    <>
      <Card title="Request Details" className="tat-reqcard"
        actions={selected ? <StatusPill status={reqStatus(selected.status)} /> : null}>
        {!selected ? <Empty icon="fileDoc" title="No request selected">Pick a request to see it here.</Empty>
          : <RequestDetails row={selected} onDecide={(kind) => setDecision({ row: selected, kind })} />}
      </Card>
      <Card title="Recent Activity"
        actions={selected ? <button type="button" className="tat-link" onClick={() => setTimeline(true)}>View All</button> : null}>
        {!selected ? <p className="tat-muted tat-small">The request's history shows here.</p>
          : <Timeline row={selected} limit={3} />}
      </Card>
    </>
  );

  return (
    <Frame tab={tab} onTab={onTab} rail={rail} railAlign="content" railWidth="lg"
      subtitle="Take attendance, track student presence and manage corrections."
      actions={(
        <>
          <span className="tat-split">
            <button type="button" className="tat-btn tat-btn--primary tat-btn--lg" onClick={() => setCreating(true)}>
              <Icon name="plus" size={19} /> New Correction
            </button>
            <MenuButton caret className="tat-btn tat-btn--primary tat-btn--lg tat-split__caret" align="right" title="More ways to correct">
              <MenuRow icon="pencil" onClick={() => setCreating(true)}>Correct one student&rsquo;s mark</MenuRow>
              <MenuRow icon="calendar" onClick={() => onTab('mark')}>Edit a whole day&rsquo;s register</MenuRow>
            </MenuButton>
          </span>
          <button type="button" className="tat-btn tat-btn--lg" onClick={() => setHowTo(true)}>
            <Icon name="info" size={19} /> How it works?
          </button>
        </>
      )}>

      <div className="tat-tiles tat-tiles--4">
        <Tile layout="corner" icon="users" tone="indigo" value={counts.all} label="Total Requests" caption={focusId ? 'All months' : month === todayKey().slice(0, 7) ? 'This Month' : fmtMonth(`${month}-01`)} />
        <Tile layout="corner" icon="check" solid="circle" tone="green" value={counts.approved} label="Approved" note={pct(counts.approved, counts.all)} />
        <Tile layout="corner" icon="clock" tone="amber" value={counts.pending} label="Pending" note={pct(counts.pending, counts.all)} />
        <Tile layout="corner" icon="user" tone="red" value={counts.rejected} label="Rejected" note={pct(counts.rejected, counts.all)} />
      </div>

      <section className="tat-card">
        <div className="tat-filters">
          <div className="tat-chips" role="radiogroup" aria-label="Status">
            {CHIPS.map((c) => (
              <button key={c.label} type="button" role="radio" aria-checked={status === c.value}
                className={`tat-chipbtn${status === c.value ? ' is-on' : ''}`}
                onClick={() => { setStatus(c.value); setPage(1); }}>
                {c.label} ({counts[c.count] ?? 0})
              </button>
            ))}
          </div>
          <span className="tat-toolbar__gap" />
          <PillSelect value={section} onChange={(v) => { setSection(v); setPage(1); }} className="tat-pillselect--sm tat-pillselect--class">
            <option value="">All classes</option>
            {sections.map((s) => <option key={s._id} value={s._id}>{s.label}</option>)}
          </PillSelect>
          <PillSelect iconRight="calendar" value={month} onChange={(v) => { setMonth(v); setPage(1); }} className="tat-pillselect--sm tat-pillselect--month">
            {monthOptions.map((m) => <option key={m} value={m}>{fmtMonthYear(m)}</option>)}
          </PillSelect>
        </div>
        <label className="tat-search tat-search--wide">
          <Icon name="search" size={18} />
          <input value={query} placeholder="Search by student name, roll no. or reason..." aria-label="Search requests"
            onChange={(e) => setQuery(e.target.value)} />
        </label>

        {loading && !data ? <div className="tat-center"><Spinner /></div>
          : rows.length === 0 ? (
            <Empty icon="checkCircle" title={counts.all ? 'Nothing matches' : 'No correction requests'}>
              {counts.all ? 'Try another status or month.' : 'Requests students raise about your registers appear here.'}
            </Empty>
          ) : (
            <div className={`tat-tablewrap${loading ? ' is-loading' : ''}`}>
              <table className="tat-table tat-table--corr">
                <thead>
                  <tr>
                    <th>#</th><th>Student</th><th>Date</th><th>Current Mark</th><th>Requested Mark</th>
                    <th>Reason</th><th>Status</th><th>Submitted On</th><th className="tat-table__act">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r._id} data-focus-id={r._id} className={`is-clickable${selected?._id === r._id ? ' is-picked' : ''}`}
                      onClick={() => setPicked(r._id)}>
                      <td className="tat-muted">{((meta?.page || page) - 1) * LIMIT + i + 1}</td>
                      <td><span className="tat-who"><SoftAvatar name={r.student.name} src={r.student.photo} /><b>{r.student.name}</b></span></td>
                      <td>
                        {fmtDay(r.date)}
                        {r.subject ? <small className="tat-sub">{r.subject.name}</small> : null}
                      </td>
                      <td><StatusPill status={r.currentStatus || 'unmarked'} /></td>
                      <td><StatusPill status={r.requestedStatus} /></td>
                      <td className="tat-table__reason" title={r.reason}>{r.reason}</td>
                      <td>
                        <StatusPill status={reqStatus(r.status)} />
                        {r.awaitingReply ? <small className="tat-sub">Asked for info</small> : null}
                      </td>
                      <td className="tat-stamp">
                        {`${String(new Date(r.createdAt).getDate()).padStart(2, '0')} ${monthShort(new Date(r.createdAt))} ${new Date(r.createdAt).getFullYear()}`}
                        <small>{new Date(r.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</small>
                      </td>
                      <td className="tat-table__act" onClick={(e) => e.stopPropagation()}>
                        <RowMenu>
                          <MenuItem icon="eye" onClick={() => setPicked(r._id)}>View details</MenuItem>
                          {r.status === 'pending' && <>
                            <MenuItem icon="checkCircle" onClick={() => setDecision({ row: r, kind: 'approve' })}>Approve</MenuItem>
                            <MenuItem icon="closeCircle" danger onClick={() => setDecision({ row: r, kind: 'reject' })}>Reject</MenuItem>
                            <MenuItem icon="chat" onClick={() => setDecision({ row: r, kind: 'info' })}>Request more info</MenuItem>
                          </>}
                        </RowMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <footer className="tat-foot">
          <ShowingCount page={meta?.page || page} limit={LIMIT} count={rows.length} total={meta?.total || 0} noun="request" />
          <Pager page={meta?.page || page} pages={meta?.pages || 1} onPage={setPage} />
        </footer>
      </section>

      {decision && <DecisionDialog {...decision} onClose={() => setDecision(null)}
        onDone={(row) => { setDecision(null); refresh(row); }} />}
      {creating && <NewCorrection sections={sections} mode={mode} onClose={() => setCreating(false)}
        onDone={(row) => { setCreating(false); setStatus(''); setMonth(row.date.slice(0, 7)); refresh(row); }} />}
      <Modal open={timeline && !!selected} onClose={() => setTimeline(false)} maxWidth={520}
        title={<span className="tat-modaltitle"><Icon name="activity" size={20} /> {selected?.student.name} · {selected ? fmtDay(selected.date) : ''}</span>}
        footer={<Button variant="secondary" onClick={() => setTimeline(false)}>Close</Button>}>
        {selected && <Timeline row={selected} full />}
      </Modal>
      <Modal open={howTo} onClose={() => setHowTo(false)} maxWidth={560}
        title={<span className="tat-modaltitle"><Icon name="info" size={20} /> How corrections work</span>}
        footer={<Button onClick={() => setHowTo(false)}>Got it</Button>}>
        <ol className="tat-steps">
          <li><b>A student asks.</b> From their attendance page, for a day in the last month{mode === 'subject' ? ' and one subject’s register' : ''}, with a reason and any proof — a medical certificate, a note from home.</li>
          <li><b>You review it here.</b> It is waiting on whoever holds that register: the class or vice class teacher{mode === 'subject' ? ', or that subject’s teacher' : ''}.</li>
          <li><b>Need more?</b> &ldquo;Request More Info&rdquo; sends the student your question. Their reply and files join the request&rsquo;s activity.</li>
          <li><b>Approve or reject.</b> Approving writes the requested mark onto the register; the student is told either way, with your remarks.</li>
          <li><b>Correcting it yourself?</b> &ldquo;New Correction&rdquo; changes a mark directly and keeps it here as an approved request, so the change has a record.</li>
        </ol>
      </Modal>
    </Frame>
  );
}

function RequestDetails({ row, onDecide }) {
  const r = row;
  return (
    <div className="tat-reqdetail">
      <div className="tat-reqdetail__who">
        <SoftAvatar name={r.student.name} src={r.student.photo} size={44} />
        <div>
          <b>{r.student.name}</b>
          <small>{[r.student.rollNumber && `Roll No: ${r.student.rollNumber}`, r.section.label].filter(Boolean).join(' | ')}</small>
        </div>
      </div>
      <dl className="tat-reqdetail__rows">
        <div><dt><Icon name="calendar" size={16} />Date</dt>
          <dd>{dateOf(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} ({dateOf(r.date).toLocaleDateString('en-GB', { weekday: 'long' })})</dd></div>
        {r.subject ? <div><dt><Icon name="layers" size={16} />Subject</dt><dd>{r.subject.name}</dd></div> : null}
        <div><dt><i className="tat-dotlg" style={{ background: STATUS[r.currentStatus || 'unmarked'].dot }} />Current Mark</dt>
          <dd className={`tat-ink--${STATUS[r.currentStatus || 'unmarked'].tone}`}>{markLabel(r.currentStatus)}</dd></div>
        <div><dt><i className="tat-dotlg" style={{ background: STATUS[r.requestedStatus].dot }} />Requested Mark</dt>
          <dd className={`tat-ink--${STATUS[r.requestedStatus].tone}`}>{markLabel(r.requestedStatus)}</dd></div>
        <div><dt><Icon name="fileDoc" size={16} />Reason</dt><dd>{r.reason}</dd></div>
        <div><dt><Icon name="upload" size={17} />Attachments</dt>
          <dd>{r.attachments.length ? (
            <span className="tat-files">
              {r.attachments.map((f) => (
                <a key={f.url} className="tat-file" href={fileUrl(f.url)} target="_blank" rel="noreferrer" title={f.name}>
                  <Icon name={/pdf/i.test(f.type || f.name) ? 'filePdf' : /image/i.test(f.type || '') ? 'fileImage' : 'fileDoc'} size={17} />
                  <span>{f.name}</span><Icon name="externalLink" size={16} />
                </a>
              ))}
            </span>
          ) : <span className="tat-muted">None</span>}</dd></div>
        <div><dt><Icon name="clock" size={16} />Submitted On</dt><dd>{stamp(r.createdAt)}{r.source === 'teacher' ? ' · by teacher' : ''}</dd></div>
        <div><dt><Icon name="history" size={16} />Updated On</dt><dd>{r.updatedAt && r.updatedAt !== r.createdAt ? stamp(r.updatedAt) : '-'}</dd></div>
        <div><dt><Icon name="chat" size={16} />Remarks</dt><dd>{r.teacherRemarks || '-'}</dd></div>
      </dl>
      {r.status === 'pending' && (
        <div className="tat-reqdetail__acts">
          <button type="button" className="tat-btn tat-btn--approve" onClick={() => onDecide('approve')}><Icon name="check" size={15} strokeWidth={2.4} /> Approve</button>
          <button type="button" className="tat-btn tat-btn--reject" onClick={() => onDecide('reject')}><Icon name="close" size={15} strokeWidth={2.4} /> Reject</button>
          <button type="button" className="tat-btn tat-btn--outline" onClick={() => onDecide('info')}><Icon name="arrowUpRight" size={15} strokeWidth={2.2} /> Request More Info</button>
        </div>
      )}
    </div>
  );
}

/** What happened to a request, oldest first, and what it is waiting on now. */
function Timeline({ row, limit, full }) {
  const events = (row.history || []).map((h) => ({
    key: `${h.event}-${h.at}`, tone: EVENT[h.event]?.tone || 'indigo', title: EVENT[h.event]?.title || h.event,
    by: h.byName ? `By ${h.byName}${ROLE[h.role] ? ` (${ROLE[h.role]})` : ''}` : '', at: h.at,
    message: h.event === 'submitted' ? '' : h.message, files: h.attachments || [],
  }));
  if (!events.length) {
    events.push({ key: 'created', tone: 'green', title: 'Request submitted', by: `By ${row.student.name} (Student)`, at: row.createdAt, files: [] });
    if (row.reviewedAt) events.push({ key: 'reviewed', tone: row.status === 'approved' ? 'green' : 'red', title: row.status === 'approved' ? 'Approved' : 'Rejected', by: row.reviewedBy?.name ? `By ${row.reviewedBy.name}` : '', at: row.reviewedAt, message: row.teacherRemarks, files: [] });
  }
  if (row.status === 'pending') {
    events.push(row.awaitingReply
      ? { key: 'waiting', tone: 'muted', title: 'Waiting for the student’s reply', by: 'No reply yet', files: [] }
      : { key: 'waiting', tone: 'muted', title: 'Waiting for approval', by: 'No updates yet', files: [] });
  }
  const shown = full || !limit ? events : events.slice(-limit);
  return (
    <ol className="tat-timeline">
      {shown.map((e) => (
        <li key={e.key} className={`tat-timeline__item tat-timeline__item--${e.tone}`}>
          <i />
          <div>
            <b>{e.title}</b>
            {e.by ? <small>{e.by}</small> : null}
            {full && e.message ? <p>{e.message}</p> : null}
            {full && e.files.length ? (
              <span className="tat-files">
                {e.files.map((u) => <a key={u} className="tat-file" href={fileUrl(u)} target="_blank" rel="noreferrer"><Icon name="fileDoc" size={15} /><span>{u.split('/').pop()}</span></a>)}
              </span>
            ) : null}
          </div>
          {e.at ? <time>{stamp(e.at)}</time> : null}
        </li>
      ))}
    </ol>
  );
}

const DECISION = {
  approve: { title: 'Approve correction', icon: 'checkCircle', verb: 'Approve', label: 'Remarks (optional)', required: false },
  reject:  { title: 'Reject correction',  icon: 'closeCircle', verb: 'Reject',  label: 'Why it is rejected', required: true },
  info:    { title: 'Request more information', icon: 'chat', verb: 'Send to student', label: 'What do you need from the student?', required: true },
};

function DecisionDialog({ row, kind, onClose, onDone }) {
  const d = DECISION[kind];
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault();
    if (d.required && !text.trim()) return toast.error('Please add a note');
    setBusy(true);
    try {
      const res = kind === 'info'
        ? await requestCorrectionInfo(row._id, { message: text.trim() })
        : await reviewCorrection({ id: row._id, status: kind === 'approve' ? 'approved' : 'rejected', remarks: text.trim() });
      toast.success(kind === 'info' ? 'Question sent to the student' : kind === 'approve' ? 'Approved — the mark is updated' : 'Rejected');
      onDone(res?.data ?? res);
    } catch (err) { toast.error(err?.message || 'Could not update the request'); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} maxWidth={480}
      title={<span className="tat-modaltitle"><Icon name={d.icon} size={20} /> {d.title}</span>}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="tat-decide" loading={busy} variant={kind === 'reject' ? 'danger' : 'primary'}>{d.verb}</Button>
      </>}>
      <form id="tat-decide" onSubmit={go} className="tat-form">
        <p className="tat-small">
          <b>{row.student.name}</b> · {fmtDay(row.date)}{row.subject ? ` · ${row.subject.name}` : ''} · {markLabel(row.currentStatus)} → <b>{markLabel(row.requestedStatus)}</b>
        </p>
        <div className="form-group">
          <label className={`form-label${d.required ? ' required' : ''}`} htmlFor="tat-decide-text">{d.label}</label>
          <textarea id="tat-decide-text" className="form-control" rows={3} maxLength={500} value={text}
            placeholder={kind === 'info' ? 'e.g. Please attach the doctor’s note for that day' : ''}
            onChange={(e) => setText(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}

/** A teacher changing a mark themselves, with the reason on record. */
function NewCorrection({ sections, mode, onClose, onDone }) {
  const [section, setSection] = useState(sections[0]?._id || '');
  const [subject, setSubject] = useState('');
  const [date, setDate]       = useState(todayKey());
  const [student, setStudent] = useState('');
  const [mark, setMark]       = useState('present');
  const [reason, setReason]   = useState('');
  const [busy, setBusy]       = useState(false);

  const { data: reg, loading } = useFetch(
    () => (section ? getAttendance({ section, subject: subject || undefined, date }) : Promise.resolve(null)), [section, subject, date]);
  useEffect(() => { if (reg?.subject?._id && reg.subject._id !== subject) setSubject(reg.subject._id); }, [reg]); // eslint-disable-line react-hooks/exhaustive-deps
  const students = reg?.students || [];
  const was = reg?.records?.find((r) => String(r.student) === student)?.status || null;

  const go = async (e) => {
    e.preventDefault();
    if (!student) return toast.error('Choose a student');
    if (!reason.trim()) return toast.error('Give a reason for the correction');
    setBusy(true);
    try {
      const res = await createStudentCorrection({ studentId: student, date, section, subject: subject || undefined, status: mark, reason: reason.trim() });
      toast.success('Mark corrected');
      onDone(res?.data ?? res);
    } catch (err) { toast.error(err?.message || 'Could not correct the mark'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} maxWidth={560}
      title={<span className="tat-modaltitle"><Icon name="pencil" size={20} /> New correction</span>}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="tat-newcorr" loading={busy} disabled={!student || mark === was}>Correct mark</Button>
      </>}>
      <form id="tat-newcorr" onSubmit={go} className="tat-form">
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label required" htmlFor="tat-nc-section">Class</label>
            <select id="tat-nc-section" className="form-control" value={section} onChange={(e) => { setSection(e.target.value); setSubject(''); setStudent(''); }}>
              {sections.map((s) => <option key={s._id} value={s._id}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required" htmlFor="tat-nc-date">Date</label>
            <input id="tat-nc-date" type="date" className="form-control" max={todayKey()} value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
        </div>
        {mode === 'subject' && (
          <div className="form-group">
            <label className="form-label required" htmlFor="tat-nc-subject">Subject register</label>
            <select id="tat-nc-subject" className="form-control" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {(reg?.subjects || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
        )}
        <div className="form-group">
          <label className="form-label required" htmlFor="tat-nc-student">Student</label>
          <select id="tat-nc-student" className="form-control" value={student} onChange={(e) => setStudent(e.target.value)} disabled={loading}>
            <option value="">{loading ? 'Loading…' : students.length ? 'Choose a student' : 'No students in this class'}</option>
            {students.map((s) => {
              const m = reg?.records?.find((r) => String(r.student) === s._id)?.status;
              return <option key={s._id} value={s._id}>{s.rollNumber ? `${s.rollNumber}. ` : ''}{s.name} — {markLabel(m)}</option>;
            })}
          </select>
        </div>
        <div className="form-group">
          <span className="form-label required">Correct mark</span>
          <div className="tat-markpick" role="radiogroup" aria-label="Correct mark">
            {MARKS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mark === m}
                className={`tat-mark tat-mark--${STATUS[m].tone}${mark === m ? ' is-on' : ''}`} onClick={() => setMark(m)}>
                <i aria-hidden>{mark === m ? <Icon name="check" size={11} /> : null}</i>{STATUS[m].label}
              </button>
            ))}
          </div>
          {student ? <small className="tat-muted">Currently {markLabel(was).toLowerCase()}{mark === was ? ' — choose a different mark' : ''}.</small> : null}
        </div>
        <div className="form-group">
          <label className="form-label required" htmlFor="tat-nc-reason">Reason</label>
          <textarea id="tat-nc-reason" className="form-control" rows={3} maxLength={500} value={reason}
            placeholder="e.g. Was on a school trip, marked absent by mistake" onChange={(e) => setReason(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
