/**
 * Health Checkups (Oct 2026) — checkups recorded, and checkups scheduled for
 * a class or a section (a dental camp, the annual health check) with a sheet
 * to record a whole class's results in one go. Height and weight recorded
 * here become each student's latest measurements.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Btn, Badge, Status, StudentCell, Empty, Kebab, Spin, Note, Field, Select, Person } from '../mdUI';
import { CHECKUP_TYPE, CHECKUP_OUTCOME, FOLLOW_STATE, fmtDay, todayStr, labelOf, errorText, studentLine, checkupLine } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, BoardPanel, ClassFilter, DateFilter } from './mdList';

const SHEET_COLS = {
  general: ['heightCm', 'weightKg', 'visionLeft', 'visionRight'],
  vision: ['visionLeft', 'visionRight', 'colourVision'], dental: ['dental'], hearing: ['hearingLeft', 'hearingRight'],
  height: ['heightCm'], weight: ['weightKg'], bmi: ['heightCm', 'weightKg'], bp: ['bpSystolic', 'bpDiastolic', 'pulse'], physical: ['heightCm', 'weightKg'],
};
const SHEET_LABEL = { heightCm: 'Height (cm)', weightKg: 'Weight (kg)', visionLeft: 'Vision L', visionRight: 'Vision R', colourVision: 'Colour vision', dental: 'Dental findings', hearingLeft: 'Hearing L', hearingRight: 'Hearing R', bpSystolic: 'BP sys.', bpDiastolic: 'BP dia.', pulse: 'Pulse' };
const NUM = ['heightCm', 'weightKg', 'bpSystolic', 'bpDiastolic', 'pulse'];

/** Record a whole session's results — one row per student. */
function CheckupSheet({ sessionId, onClose, onDone }) {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState({});
  const [head, setHead] = useState({ checkedOn: todayStr(), professional: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.getCheckupSession(sessionId).then((r) => {
      const d = r?.data ?? r;
      setData(d);
      setHead((h) => ({ ...h, professional: d.rows[0]?.professional || '' }));
      setRows(Object.fromEntries(d.rows.map((x) => [x._id, { results: x.results || {}, outcome: x.outcome || 'normal', findings: x.findings || '', absent: false }])));
    }).catch((e) => setErr(errorText(e)));
  }, [sessionId]);
  const cols = SHEET_COLS[data?.type] || SHEET_COLS.general;
  const set = (id, patch) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const res = await api.saveCheckupSheet({ ...head, rows: Object.entries(rows).filter(([id]) => data.rows.find((x) => x._id === id)?.status === 'scheduled').map(([id, v]) => ({ id, ...v })) });
      const out = res?.data ?? res;
      toast.success(`${out.saved} result${out.saved === 1 ? '' : 's'} saved`);
      if (out.failed?.length) setErr(`${out.failed.length} could not be saved: ${out.failed[0].message}`);
      else { onDone(); onClose(); }
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={busy ? () => {} : onClose} title={data ? `${data.sessionName} — results` : 'Checkup results'} maxWidth={1100}
      footer={<><Btn onClick={onClose} disabled={busy}>Close</Btn><Btn kind="primary" busy={busy} onClick={save} disabled={!data}>Save results</Btn></>}>
      <div className="md-form">
        {err ? <Note tone="red" icon="alert">{err}</Note> : null}
        {!data ? <Spin /> : (
          <>
            <div className="md-form__grid">
              <Field label="Checked on"><input className="md-input" type="date" max={todayStr()} value={head.checkedOn} onChange={(e) => setHead({ ...head, checkedOn: e.target.value })} /></Field>
              <Field label="Checked by"><input data-text="name" className="md-input" value={head.professional} onChange={(e) => setHead({ ...head, professional: e.target.value })} /></Field>
            </div>
            <Note tone="indigo" icon="info">{labelOf(CHECKUP_TYPE, data.type)} · {data.rows.length} students. Fill in what was measured; leave a row empty (or mark absent) and it stays scheduled.</Note>
            <div className="md-tablewrap" style={{ border: '1px solid var(--md-line-2)', borderRadius: 12 }}>
              <table className="md-table" style={{ '--md-minw': '900px' }}>
                <thead><tr><th>Student</th>{cols.map((c) => <th key={c}>{SHEET_LABEL[c]}</th>)}<th>Outcome</th><th>Findings</th><th>Absent</th></tr></thead>
                <tbody>
                  {data.rows.map((x) => {
                    const v = rows[x._id] || {};
                    const done = x.status !== 'scheduled';
                    return (
                      <tr key={x._id} className={done ? 'is-off' : ''}>
                        <td data-label="Student" className="is-primary"><Person name={x.studentName} photo={x.studentPhoto} size={30} sub={studentLine(x)} /></td>
                        {cols.map((c) => (
                          <td key={c} data-label={SHEET_LABEL[c]}>
                            <input className="md-input" style={{ height: 34, minWidth: c === 'dental' ? 180 : 80 }} disabled={done || v.absent} type={NUM.includes(c) ? 'number' : 'text'} step="0.1"
                              value={v.results?.[c] ?? ''} onChange={(e) => set(x._id, { results: { ...v.results, [c]: e.target.value } })} />
                          </td>
                        ))}
                        <td data-label="Outcome"><Select value={v.outcome} onChange={(o) => set(x._id, { outcome: o })} disabled={done || v.absent} options={Object.entries(CHECKUP_OUTCOME).map(([value, o]) => ({ value, label: o.label }))} /></td>
                        <td data-label="Findings"><input className="md-input" style={{ height: 34, minWidth: 160 }} disabled={done || v.absent} value={v.findings} onChange={(e) => set(x._id, { findings: e.target.value })} /></td>
                        <td data-label="Absent">{done ? <Badge tone="green" size="sm">Done</Badge> : <input type="checkbox" className="md-check" checked={!!v.absent} onChange={(e) => set(x._id, { absent: e.target.checked })} aria-label="Absent" />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function MedicalCheckups() {
  const nav = useNavigate();
  const board = useBoard('checkups', { tab: 'completed' });
  const { meta, forms, drawer, elements } = useMedWorkspace(board.reload);
  const [sheet, setSheet] = useState(null);
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'type', label: 'Checkup', render: (r) => <span className="md-two"><b>{labelOf(CHECKUP_TYPE, r.type)}</b><em>{r.sessionName || r.professional}</em></span>, csv: (r) => labelOf(CHECKUP_TYPE, r.type) },
    { key: 'date', label: 'Date', render: (r) => (r.status === 'scheduled' ? <span className="md-two"><b>{fmtDay(r.scheduledOn)}</b><em className={r.missedDate ? 'is-warn' : ''}>{r.missedDate ? 'Date passed — not recorded' : 'Scheduled'}</em></span> : fmtDay(r.checkedOn)), csv: (r) => fmtDay(r.checkedOn || r.scheduledOn) },
    { key: 'results', label: 'Results', render: (r) => <span className="md-clamp">{checkupLine(r.results, r.findings) || '—'}</span> },
    { key: 'outcome', label: 'Outcome', render: (r) => (
      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {r.status === 'scheduled' ? <Badge tone="indigo">Scheduled</Badge> : r.outcome ? <Status of="checkupOutcome" value={r.outcome} /> : <Badge tone="green">Completed</Badge>}
        {r.followUpState ? <Badge tone={FOLLOW_STATE[r.followUpState].tone} size="sm">Follow-up {FOLLOW_STATE[r.followUpState].label.toLowerCase()}</Badge> : null}
      </span>
    ), csv: (r) => (r.status === 'scheduled' ? 'Scheduled' : labelOf(CHECKUP_OUTCOME, r.outcome)) },
    { key: 'acts', label: '', align: 'right', stop: true, render: (r) => (
      <span className="md-acts">
        {r.status === 'scheduled' ? <Btn size="sm" kind="primary" onClick={() => forms.open('checkup', { checkup: r })}>Record</Btn> : null}
        {r.followUpState ? <Btn size="sm" onClick={() => forms.open('followUp', { kind: 'checkup', id: r._id })}>Follow-up</Btn> : null}
        <Kebab items={[
          r.status === 'scheduled' && r.sessionId ? { label: 'Results sheet for the session', icon: 'listDots', onClick: () => setSheet(r.sessionId) } : null,
          r.status !== 'scheduled' ? { label: 'Edit', icon: 'pencil', onClick: () => forms.open('checkup', { checkup: r }) } : null,
          r.status === 'scheduled' ? { label: 'Cancel', icon: 'close', onClick: () => drawer.confirm({ title: 'Cancel this checkup?', reason: true, reasonLabel: 'Why', confirmLabel: 'Cancel checkup', run: async (why) => { await api.cancelCheckup(r._id, { reason: why }); board.reload(); } }) } : null,
          { label: 'Open medical profile', icon: 'user', onClick: () => nav(`/admin/medical/students/${r.studentId}?tab=checkups`) },
        ]} />
      </span>
    ) },
  ];
  return (
    <Page>
      <PageHead icon="clipboard" tone="teal" title="Health Checkups" subtitle="General, vision, dental, hearing, height and weight, blood pressure and physical checkups. Schedule one for a class, then record everyone's results on one sheet.">
        <Btn icon="calendarCheck" onClick={() => forms.open('checkupSchedule')}>Schedule for a class</Btn>
        <Btn kind="primary" icon="plus" onClick={() => forms.open('checkup')}>Add Health Checkup</Btn>
      </PageHead>
      {board.q.sessionId && board.data?.rows?.length ? (
        <Note tone="teal" icon="calendarCheck" action={<><Btn size="sm" kind="primary" onClick={() => setSheet(board.q.sessionId)}>Open results sheet</Btn><Btn size="sm" kind="ghost" onClick={() => board.setQ({ sessionId: '' })}>Show all</Btn></>}>
          Showing one checkup session: <b>{board.data.rows[0].sessionName}</b>.
        </Note>
      ) : null}
      <BoardPanel board={board} columns={columns} noun="checkup" searchPlaceholder="Search student, session or findings" exportName="health-checkups"
        filters={<>
          <ClassFilter meta={meta} q={board.q} setQ={board.setQ} />
          <Select value={board.q.type} onChange={(v) => board.setQ({ type: v })} all="Any checkup" label="Type" options={Object.entries(CHECKUP_TYPE).map(([value, label]) => ({ value, label }))} />
          <DateFilter q={board.q} setQ={board.setQ} />
        </>}
        empty={<Empty compact title="No checkups here" action={<Btn icon="calendarCheck" onClick={() => forms.open('checkupSchedule')}>Schedule for a class</Btn>}>Record a student's checkup, or schedule one for a whole class.</Empty>} />
      {sheet ? <CheckupSheet sessionId={sheet} onClose={() => setSheet(null)} onDone={board.reload} /> : null}
      {elements}
    </Page>
  );
}
