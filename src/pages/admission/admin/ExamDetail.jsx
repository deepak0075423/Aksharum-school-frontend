/**
 * One exam or interview: its setup, its questions (online), its candidates —
 * scheduling, roll numbers, slots and panels, admit cards and attendance —
 * and its results.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import Tabs from '../../../components/ui/Tabs';
import {
  Page, Head, Panel, Btn, Chip, ResultsChip, StatusChip, Table, Empty, ErrorBox, Spin, Dialog, ConfirmDialog, Field, Input, Select, Check, Toggle, Note, IconBtn,
  Ico, KV, useLoad, useSelection,
} from '../admUI';
import { fmtDate, fmtTime, fmtDateTime, errMsg, toLocalInput, toDateInput, EXAM_MODE, plural } from '../meta';
import { useAdmission, StaffChecks, openFile } from './parts';
import { ExamForm, examToForm, formToExam, QuestionDialog, QuestionLine, ResultsBoard } from './examParts';
import { EXAM_STATUS } from './Exams';

const BASE = '/admin/admissions';

export default function ExamDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: d, loading, error, reload } = useLoad(() => admin.exam(id), [id]);
  const [tab, setTab] = useState('setup');
  const [ask, setAsk] = useState(null);   // 'cancel' | 'delete' | 'schedule'
  const [busy, setBusy] = useState(false);
  if (loading && !d) return <Spin />;
  if (error && !d) return <ErrorBox error={error} onRetry={reload} />;
  const exam = d.exam;
  const online = exam.mode === 'online';
  const counts = d.candidates || {};
  const scheduled = Object.entries(counts).filter(([k]) => k !== 'withdrawn').reduce((s, [, v]) => s + v, 0);
  const schedule = async () => {
    setBusy(true);
    try { await admin.scheduleExam(exam._id); toast.success('Scheduled — now add the candidates'); setTab('candidates'); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Page>
      <Link to={`${BASE}/exams`} className="adm-linkbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--primary)' }}><Ico name="arrowLeft" size={14} />Exams</Link>
      <Head eyebrow={`${EXAM_MODE[exam.mode]} · ${fmtDateTime(exam.startsAt)}`} title={exam.name}
        subtitle={`${plural(scheduled, 'candidate')}${online ? ` · ${plural(d.questions.filter((q) => q.isActive !== false).length, 'question')} · ${exam.maxMarks} marks` : ` · ${exam.maxMarks} marks`}`}>
        <Chip tone={EXAM_STATUS[exam.status]?.[1]}>{EXAM_STATUS[exam.status]?.[0]}</Chip>
        <ResultsChip status={exam.resultsStatus} />
        {exam.status === 'draft' ? <Btn kind="primary" icon="calendarDays" busy={busy} disabled={d.readiness.length > 0} onClick={schedule}>Schedule</Btn> : null}
        {exam.status === 'draft' && !scheduled ? <Btn kind="ghost" icon="trash" onClick={() => setAsk('delete')}>Delete</Btn> : null}
        {['draft', 'scheduled', 'completed'].includes(exam.status) && !['approved', 'published'].includes(exam.resultsStatus) ? <Btn kind="ghost" icon="closeCircle" onClick={() => setAsk('cancel')}>Cancel exam</Btn> : null}
      </Head>
      {exam.status === 'draft' && d.readiness.length ? <Note tone="amber" icon="alert"><b>Before scheduling:</b> {d.readiness.join('; ')}.</Note> : null}
      {exam.status === 'cancelled' ? <Note tone="red" icon="closeCircle">This exam was cancelled. The families scheduled for it were told.</Note> : null}
      <Tabs variant="line" value={tab} onChange={setTab} items={[
        { key: 'setup', label: 'Setup' },
        ...(online ? [{ key: 'questions', label: 'Questions', count: d.questions.length }] : []),
        ...(!online ? [{ key: 'times', label: 'Times families choose', count: exam.booking?.enabled ? (exam.booking.slots || []).length : undefined }] : []),
        { key: 'candidates', label: 'Candidates', count: scheduled },
        { key: 'results', label: 'Results' },
      ]} />
      {tab === 'setup' ? <Setup exam={exam} reload={reload} /> : null}
      {tab === 'questions' ? <Questions d={d} reload={reload} /> : null}
      {tab === 'times' ? <BookingTimes exam={exam} reload={reload} /> : null}
      {tab === 'candidates' ? <Candidates exam={exam} reload={reload} /> : null}
      {tab === 'results' ? <ResultsBoard examId={exam._id} onChanged={reload} /> : null}

      <ConfirmDialog open={ask === 'cancel'} onClose={() => setAsk(null)} title="Cancel this exam?" confirmLabel="Cancel exam" reason reasonLabel="Reason (families are told)"
        message="Every scheduled family gets an update and an email." onConfirm={async (why) => { try { await admin.cancelExam(exam._id, why); toast.success('Exam cancelled'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
      <ConfirmDialog open={ask === 'delete'} onClose={() => setAsk(null)} title="Delete this draft exam?" confirmLabel="Delete"
        onConfirm={async () => { try { await admin.deleteExam(exam._id); toast.success('Deleted'); nav(`${BASE}/exams`); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </Page>
  );
}

function Setup({ exam, reload }) {
  const [f, setF] = useState(() => examToForm(exam));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(examToForm(exam)); }, [exam]);
  const locked = exam.status !== 'draft';
  const save = async () => {
    setBusy(true);
    try { await admin.updateExam(exam._id, formToExam(f)); toast.success('Saved'); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  if (exam.status === 'cancelled') return <Panel><ExamSummary exam={exam} /></Panel>;
  return (
    <Panel title="Setup" icon="settings" right={<Btn kind="primary" icon="save" busy={busy} onClick={save}>Save</Btn>}>
      {locked ? <Note icon="info">The exam is scheduled: its kind and round stay as families were told. Dates, venue and instructions can still change — tell families yourself if they do.</Note> : null}
      <div className="adm-mt"><ExamForm f={f} setF={setF} locked={locked} /></div>
      <div className="adm-row adm-mt" style={{ justifyContent: 'flex-end' }}><Btn kind="primary" icon="save" busy={busy} onClick={save}>Save</Btn></div>
    </Panel>
  );
}

function ExamSummary({ exam }) {
  const adm = useAdmission();
  return (
    <KV cols={3} items={[
      ['Round', adm.roundName(exam.round)], ['Classes', (exam.classes || []).map((c) => adm.className(c)).join(', ')],
      ['Starts', fmtDateTime(exam.startsAt)], ['Ends', fmtDateTime(exam.endsAt)], ['Duration', `${exam.durationMinutes} min`],
      ['Venue', [exam.venue?.name, exam.venue?.room].filter(Boolean).join(', ')],
    ]} />
  );
}

/* ── Questions ────────────────────────────────────────────────────────────── */

function Questions({ d, reload }) {
  const exam = d.exam;
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [importing, setImporting] = useState(false);
  const [list, setList] = useState(d.questions);
  useEffect(() => setList(d.questions), [d.questions]);
  const locked = d.questionsLocked || exam.status === 'cancelled';
  const move = async (i, dir) => {
    const next = [...list];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    try { await admin.orderQuestions(exam._id, next.map((q) => q._id)); } catch (e) { toast.error(errMsg(e)); reload(); }
  };
  const total = list.reduce((s, q) => s + (Number(q.marks) || 0), 0);
  return (
    <Panel pad={false} title="Questions" sub={`${list.length} question(s) · ${total} marks`} icon="list"
      right={locked ? <Chip tone="amber" icon="lock">Locked — applicants have started</Chip> : <><Btn icon="layers" onClick={() => setImporting(true)}>From the bank</Btn><Btn kind="primary" icon="plus" onClick={() => setEdit({})}>Add a question</Btn></>}>
      <Table rows={list} empty={<Empty icon="list" title="No questions yet" action={!locked ? <Btn kind="primary" onClick={() => setEdit({})}>Add the first</Btn> : null} />}
        columns={[
          { key: 'ord', label: '', width: 64, render: (q) => {
            const i = list.indexOf(q);
            return locked ? <span className="adm-muted">{i + 1}</span> : <div className="adm-row" style={{ gap: 0, flexWrap: 'nowrap' }}><IconBtn icon="arrowUp" label="Up" disabled={i === 0} onClick={() => move(i, -1)} /><IconBtn icon="arrowDown" label="Down" disabled={i === list.length - 1} onClick={() => move(i, 1)} /></div>;
          } },
          { key: 'q', label: 'Question', render: (q) => <QuestionLine q={q} n={list.indexOf(q) + 1} /> },
          { key: 'subj', label: 'Subject', render: (q) => exam.subjects?.find((s) => s.key === q.subjectKey)?.name || '—' },
          { key: 'marks', label: 'Marks', align: 'right', render: (q) => <>{q.marks}{q.negativeMarks ? <div className="adm-muted" style={{ fontSize: '.72rem' }}>−{q.negativeMarks}</div> : null}</> },
          { key: 'act', label: '', render: (q) => (locked ? null : (
            <div className="adm-row" style={{ gap: 2, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
              <IconBtn icon="pencil" label="Edit" onClick={() => setEdit(q)} />
              <IconBtn icon="trash" kind="danger" label="Delete" onClick={() => setDel(q)} />
            </div>
          )) },
        ]} />
      <QuestionDialog open={!!edit} question={edit?._id ? edit : null} examId={exam._id} subjects={exam.subjects || []} onClose={() => setEdit(null)} onDone={reload} />
      <ImportDialog open={importing} examId={exam._id} onClose={() => setImporting(false)} onDone={reload} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Delete this question?" confirmLabel="Delete"
        onConfirm={async () => { try { await admin.deleteQuestion(del._id); toast.success('Deleted'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </Panel>
  );
}

function ImportDialog({ open, examId, onClose, onDone }) {
  const sel = useSelection();
  const { data, loading } = useLoad(() => (open ? admin.bank({}) : Promise.resolve({ data: [] })), [open]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) sel.clear(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => {
    setBusy(true);
    try { const r = await admin.importQuestions(examId, [...sel.ids]); toast.success(`${r.data.added} question(s) added`); onClose(); onDone(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Add questions from the bank" width={780}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!sel.ids.size} onClick={go}>Add {sel.ids.size || ''}</Btn></>}>
      {loading ? <Spin /> : (
        <Table dense rows={data || []} selection={sel} empty={<Empty compact icon="layers" title="The bank is empty">Add questions under Exams → Question bank.</Empty>}
          columns={[{ key: 'q', label: 'Question', render: (q) => <QuestionLine q={q} /> }, { key: 'm', label: 'Marks', align: 'right', render: (q) => q.marks }]} />
      )}
    </Dialog>
  );
}

/* ── Candidates ───────────────────────────────────────────────────────────── */

function Candidates({ exam, reload: reloadExam }) {
  const adm = useAdmission();
  const board = useLoad(() => admin.results(exam._id), [exam._id]);
  const eligible = useLoad(() => (exam.status === 'scheduled' ? admin.eligible(exam._id) : Promise.resolve({ data: [] })), [exam._id, exam.status]);
  const sel = useSelection();
  const [busy, setBusy] = useState('');
  const [slot, setSlot] = useState(null);
  const [remove, setRemove] = useState(null);
  const reload = () => { board.reload(); eligible.reload(); reloadExam(); };
  const add = async (which) => {
    setBusy(which === 'all' ? 'all' : 'some');
    try { const r = await admin.assignCandidates(exam._id, which === 'all' ? 'all' : [...sel.ids]); toast.success(`${r.data.added} scheduled — families are told`); sel.clear(); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const attend = async (cid, present) => {
    try { await admin.attendance(exam._id, cid, present); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const online = exam.mode === 'online';
  const rows = board.data?.board || [];
  return (
    <>
      {exam.status === 'scheduled' ? (
        <Panel pad={false} title="Can be scheduled" sub={`${(eligible.data || []).length} application(s) of ${(exam.classes || []).map((c) => adm.className(c)).join(', ')} that meet the exam's conditions`} icon="userPlus"
          right={<><Btn size="sm" busy={busy === 'some'} disabled={!sel.ids.size} onClick={() => add('some')}>Schedule selected</Btn><Btn size="sm" kind="primary" busy={busy === 'all'} disabled={!(eligible.data || []).length} onClick={() => add('all')}>Schedule all</Btn></>}>
          {eligible.loading && !eligible.data ? <Spin /> : (
            <Table dense rows={eligible.data || []} selection={sel}
              empty={<Empty compact icon="userPlus" title="Nobody waiting to be scheduled">Applications appear here when they reach the statuses the exam allows.</Empty>}
              columns={[
                { key: 'n', label: 'Application', render: (r) => <><b>{r.studentName}</b> <span className="adm-num adm-muted">{r.applicationNumber}</span></> },
                { key: 'c', label: 'Class', render: (r) => adm.className(r.class) },
                { key: 's', label: 'Status', render: (r) => <StatusChip status={r.status} /> },
              ]} />
          )}
        </Panel>
      ) : exam.status === 'draft' ? <Note icon="info">Schedule the exam first — then the applications that qualify can be added.</Note> : null}

      <Panel pad={false} title="Scheduled" icon="users">
        {board.loading && !board.data ? <Spin /> : board.error && !board.data ? <ErrorBox error={board.error} onRetry={board.reload} /> : (
          <Table rows={rows} rowKey={(b) => b.candidateId} empty={<Empty compact icon="users" title="Nobody scheduled yet" />}
            columns={[
              { key: 'roll', label: 'Roll no.', render: (b) => <span className="adm-num">{b.rollNumber}</span> },
              { key: 's', label: 'Student', render: (b) => <Link to={`${BASE}/applications/${b.applicationId}`}><b>{b.studentName}</b></Link> },
              { key: 'when', label: exam.mode === 'interview' ? 'Slot' : 'Time', render: (b) => (exam.booking?.enabled && !b.slotId && !b.slot
                ? <Chip tone="amber">Not chosen yet</Chip>
                : <>{fmtDateTime(b.slot || exam.startsAt)}{b.slotId ? <div className="adm-muted" style={{ fontSize: '.72rem' }}>a bookable time</div> : null}</>) },
              { key: 'room', label: 'Room', render: (b) => b.room || '—' },
              { key: 'att', label: online ? 'Attempt' : 'Attendance', render: (b) => (online
                ? (b.attemptId ? <Chip tone="green">{b.attemptStatus.replace('_', ' ')}</Chip> : <Chip tone={b.candidateStatus === 'absent' ? 'red' : 'gray'}>{b.candidateStatus}</Chip>)
                : (
                  <div className="adm-row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    <Btn size="sm" kind={['present', 'evaluated'].includes(b.candidateStatus) ? 'success' : 'outline'} disabled={b.resultStatus && ['approved', 'published'].includes(b.resultStatus)} onClick={() => attend(b.candidateId, true)}>Present</Btn>
                    <Btn size="sm" kind={b.candidateStatus === 'absent' ? 'danger' : 'outline'} disabled={b.resultStatus && ['approved', 'published'].includes(b.resultStatus)} onClick={() => attend(b.candidateId, false)}>Absent</Btn>
                  </div>
                )) },
              { key: 'act', label: '', render: (b) => (
                <div className="adm-row" style={{ gap: 2, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                  {exam.admitCard?.enabled ? <IconBtn icon="idCard" label="Admit card" onClick={() => openFile(admin.admitUrl(exam._id, b.candidateId))} /> : null}
                  <IconBtn icon="calendar" label="Slot, room and panel" onClick={() => setSlot(b)} />
                  {!b.attemptId && !b.resultId ? <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => setRemove(b)} /> : null}
                </div>
              ) },
            ]} />
        )}
      </Panel>
      <SlotDialog row={slot} exam={exam} onClose={() => setSlot(null)} onDone={reload} />
      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} title={`Remove ${remove?.studentName || ''} from this exam?`} confirmLabel="Remove"
        onConfirm={async () => { try { await admin.removeCandidate(exam._id, remove.candidateId); toast.success('Removed'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </>
  );
}

function SlotDialog({ row, exam, onClose, onDone }) {
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const times = (exam.booking?.slots || []);
  const taken = useLoad(() => (row && times.length ? admin.examSlots(exam._id) : Promise.resolve({ data: null })), [row?.candidateId]);
  useEffect(() => { if (row) setF({ slot: toLocalInput(row.slot), slotId: row.slotId || '', force: false, room: row.room || '', panel: [], extraMinutes: row.extraMinutes || 0, extraReason: '' }); }, [row]);
  const go = async () => {
    setBusy(true);
    try {
      const time = f.slotId && f.slotId !== (row.slotId || '')
        ? { slotId: f.slotId, force: !!f.force }
        : f.slotId ? {} : { slot: f.slot ? new Date(f.slot).toISOString() : null };
      const extra = exam.mode === 'online' && (Number(f.extraMinutes) || 0) !== (row.extraMinutes || 0) ? { extraMinutes: Number(f.extraMinutes) || 0, extraReason: (f.extraReason || '').trim() } : {};
      await admin.updateCandidate(exam._id, row.candidateId, { ...time, ...extra, room: f.room.trim(), ...(exam.mode === 'interview' ? { panel: f.panel } : {}) });
      toast.success('Saved');
      onClose();
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!row} onClose={onClose} title={`${row?.studentName || ''} — ${row?.rollNumber || ''}`} width={560}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={go}>Save</Btn></>}>
      {times.length ? (
        <Field label="One of the bookable times" hint="The family is told. Leave on “Another time” to set one by hand." className="adm-mbottom">
          <Select value={f.slotId || ''} onChange={(e) => setF({ ...f, slotId: e.target.value })}>
            <option value="">Another time…</option>
            {times.map((t) => {
              const n = taken.data?.slots?.find((x) => x.id === t.id)?.taken;
              return <option key={t.id} value={t.id}>{fmtDateTime(t.startsAt)}{t.room ? ` · ${t.room}` : ''}{n != null ? ` — ${n}/${t.capacity} taken` : ''}</option>;
            })}
          </Select>
          {f.slotId && f.slotId !== (row?.slotId || '') ? <Check checked={!!f.force} onChange={(v) => setF({ ...f, force: v })}>Place them even if the time is full</Check> : null}
        </Field>
      ) : null}
      <div className="adm-grid2">
        {!f.slotId ? <Field label={exam.mode === 'interview' ? 'Interview slot' : 'Own time'} hint="Empty: the exam's time"><Input type="datetime-local" value={f.slot || ''} onChange={(e) => setF({ ...f, slot: e.target.value })} /></Field> : null}
        <Field label="Room"><Input value={f.room || ''} onChange={(e) => setF({ ...f, room: e.target.value })} maxLength={60} data-text="code" /></Field>
      </div>
      {exam.mode === 'online' ? (
        <div className="adm-grid2 adm-mt">
          <Field label="Extra time (minutes)" hint="An accommodation — spread over the sections, and it may run past the window"><Input type="number" min="0" max="180" step="5" value={f.extraMinutes ?? 0} onChange={(e) => setF({ ...f, extraMinutes: e.target.value })} /></Field>
          <Field label="Why" required={Number(f.extraMinutes) > 0} hint="e.g. a certificate, a writer"><Input value={f.extraReason || ''} maxLength={200} onChange={(e) => setF({ ...f, extraReason: e.target.value })} /></Field>
        </div>
      ) : null}
      {exam.mode === 'interview' ? (
        <Field label="Interview panel" hint="They see this interview under their admission duties and may enter its marks." className="adm-mt">
          <StaffChecks value={f.panel || []} onChange={(v) => setF({ ...f, panel: v })} max={6} />
        </Field>
      ) : null}
    </Dialog>
  );
}

/* ── Times families choose (services/admission/slots.js) ─────────────────── */

/**
 * The times a family may pick for this exam or interview, each with room for
 * so many; how late a time may still be changed, and how often. A time someone
 * holds cannot be removed, moved or shrunk below what is taken — the server
 * refuses it.
 */
function BookingTimes({ exam, reload }) {
  const office = useLoad(() => admin.examSlots(exam._id), [exam._id, exam.updatedAt]);
  const [b, setB] = useState(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const x = exam.booking || {};
    setB({ enabled: !!x.enabled, changeUntilHours: x.changeUntilHours ?? 24, maxChanges: x.maxChanges ?? 2, slots: (x.slots || []).map((s) => ({ ...s })) });
  }, [exam]);
  if (!b) return <Spin />;
  const takenOf = (id) => office.data?.slots?.find((x) => x.id === id)?.taken || 0;
  const save = async (next = b) => {
    setBusy(true);
    try {
      await admin.updateExam(exam._id, { booking: { ...next, slots: next.slots.map((s) => ({ ...(s.id ? { id: s.id } : {}), startsAt: new Date(s.startsAt).toISOString(), capacity: Number(s.capacity) || 1, room: (s.room || '').trim() })) } });
      toast.success('Saved');
      reload();
      office.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const setSlot = (i, patch) => setB({ ...b, slots: b.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <Panel title="Times families choose" icon="calendarDays" right={<Btn kind="primary" icon="save" busy={busy} onClick={() => save()}>Save</Btn>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Toggle checked={b.enabled} onChange={(v) => setB({ ...b, enabled: v })} label="Families choose their own time"
          sub="Each scheduled family picks one of the times below on its application page. The admit card follows the time chosen." />
        <div className="adm-grid3">
          <Field label="Book or change until (hours before)"><Input type="number" min="0" max="168" step="1" value={b.changeUntilHours} onChange={(e) => setB({ ...b, changeUntilHours: Number(e.target.value) || 0 })} /></Field>
          <Field label="Changes a family may make"><Input type="number" min="0" max="10" step="1" value={b.maxChanges} onChange={(e) => setB({ ...b, maxChanges: Number(e.target.value) || 0 })} /></Field>
          <Field label="Not chosen yet"><div style={{ paddingTop: 8 }}><b>{office.data?.unbooked ?? '—'}</b> candidate(s)</div></Field>
        </div>
        <Table dense rows={b.slots} rowKey={(s) => s.id || s.tempKey}
          empty={<Empty compact icon="calendar" title="No times yet" action={<Btn size="sm" kind="primary" onClick={() => setAdding(true)}>Add times</Btn>} />}
          columns={[
            { key: 'd', label: 'Day', render: (s) => fmtDate(s.startsAt) },
            { key: 't', label: 'Time', render: (s) => <b>{fmtTime(s.startsAt)}</b> },
            { key: 'c', label: 'Places', render: (s, i) => <Input type="number" min={Math.max(1, takenOf(s.id))} max="500" step="1" style={{ width: 90 }} value={s.capacity} onChange={(e) => setSlot(i, { capacity: e.target.value })} aria-label="Places" /> },
            { key: 'r', label: 'Room', render: (s, i) => <Input style={{ width: 140 }} value={s.room || ''} maxLength={60} onChange={(e) => setSlot(i, { room: e.target.value })} data-text="code" aria-label="Room" /> },
            { key: 'k', label: 'Taken', render: (s) => (s.id ? `${takenOf(s.id)} / ${s.capacity}` : <Chip tone="indigo">New</Chip>) },
            { key: 'x', label: '', render: (s, i) => (takenOf(s.id) ? null : <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => setB({ ...b, slots: b.slots.filter((_, j) => j !== i) })} />) },
          ]} />
        <div className="adm-row"><Btn size="sm" kind="ghost" icon="plus" onClick={() => setAdding(true)}>Add times</Btn></div>
      </div>
      {adding ? <AddTimes onClose={() => setAdding(false)} onAdd={(list) => { setB({ ...b, slots: [...b.slots, ...list].sort((x, y) => new Date(x.startsAt) - new Date(y.startsAt)) }); setAdding(false); }} /> : null}
    </Panel>
  );
}

function AddTimes({ onClose, onAdd }) {
  const [f, setF] = useState({ day: toDateInput(new Date(Date.now() + 86400000)), times: '09:00, 09:30, 10:00, 10:30', capacity: 2, room: '' });
  const list = String(f.times).split(/[,\s]+/).filter((t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t)).map((t) => {
    const [h, m] = t.split(':').map(Number);
    const d = new Date(`${f.day}T00:00:00`); d.setHours(h, m, 0, 0);
    return { startsAt: d.toISOString(), capacity: Number(f.capacity) || 1, room: f.room.trim(), tempKey: `${t}-${Math.random().toString(36).slice(2)}` };
  }).filter((x) => new Date(x.startsAt) > new Date());
  return (
    <Dialog open onClose={onClose} title="Add times" width={520}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!list.length} onClick={() => onAdd(list)}>Add {list.length} time{list.length === 1 ? '' : 's'}</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-grid2">
          <Field label="Day"><Input type="date" min={toDateInput(new Date())} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} /></Field>
          <Field label="Places in each"><Input type="number" min="1" max="500" step="1" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
        </div>
        <Field label="Times" hint="24-hour, separated by commas"><Input value={f.times} onChange={(e) => setF({ ...f, times: e.target.value })} data-text="code" /></Field>
        <Field label="Room" hint="Optional"><Input value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} maxLength={60} data-text="code" /></Field>
        <Note icon="info">Remember to save the times on the exam once they are added.</Note>
      </div>
    </Dialog>
  );
}
