/**
 * Hostel → Attendance (Sep 2026 redesign, to the user's mockup).
 *
 * Three views: the roll call, its history, and the corrections waiting on
 * somebody. The register (GET /hostel/admin/board/attendance) is one hostel's
 * residents for a date and session, whole — a roll call is submitted for
 * everyone at once, so the marks held here always cover every resident and the
 * table only pages and searches what it already has.
 *
 * A student with nothing saved yet starts on the suggested mark (on leave if
 * they are on approved leave, else present), which is how a warden takes a roll
 * call: touch the exceptions, submit. Until it is submitted the screen says so.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { di, today } from '../shared';
import { PageHead, words, count } from './hsUI';
import {
  Kpis, Kpi, FilterBar, FField, FSearch, FSelect, FDateRange, LineTabs, Btn, IconBtn, Popover, ListCard, DataTable, Pager,
  EmptyRows, BulkBar, Badge, Person, TwoLine, useListState, useBoardData, exportCsv, fmtDate, fmtTime,
} from './hsList';
import { ROOM_TYPES } from './hsRoom';
import { FormModal, FormSection, Fld, RadioCards } from './hsForm';

const SESSION_LABEL = { morning: 'Morning', evening: 'Evening', night: 'Night', roll_call: 'Roll call' };
const sessionLabel = (s, times = {}) => `${SESSION_LABEL[s] || words(s)}${times?.[s] ? ` (${times[s]})` : ''}`;
const STATUS = {
  present: ['Present', 'green'], absent: ['Absent', 'red'], late: ['Late', 'amber'],
  excused: ['Excused', 'blue'], on_leave: ['On leave', 'blue'],
};
const MarkTag = ({ value }) => { const [text, tone] = STATUS[value] || [words(value), 'slate']; return <Badge tone={tone} strong>{text}</Badge>; };
/** The three columns of the register: which one a mark lights up. */
const GROUP = { present: 'present', late: 'present', absent: 'absent', on_leave: 'leave', excused: 'leave' };
const PER_PAGE = 7;
/** A share of the roll to one decimal — "88.9". */
const share = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0);
const roomOf = (r) => {
  if (!r.roomNumber) return '—';
  const b = r.buildingCode || r.buildingName || '';
  const room = String(r.roomNumber).replace(/^room\s*/i, 'R');
  return `${b ? `${b} - ` : ''}${room}${r.bedNumber ? ` (Bed ${r.bedNumber})` : ''}`;
};

export default function Attendance() {
  const [tab, setTab] = useState('register');
  const [pending, setPending] = useState(null);
  // Each view owns the page head's buttons; it portals them into this slot.
  const [slot, setSlot] = useState(null);

  return (
    <div className="hs-page">
      <PageHead title="Hostel Attendance" subtitle="Mark daily attendance for hostel residents. Manage leave, history and corrections.">
        <span className="hs-head__slot" ref={setSlot} />
      </PageHead>

      <LineTabs rule value={tab} onChange={setTab} label="Attendance views"
        items={[
          { key: 'register', label: 'Take Roll Call' },
          { key: 'history', label: 'Attendance History' },
          { key: 'corrections', label: 'Corrections & Requests', count: pending || undefined, tone: 'warn' },
        ]} />

      {tab === 'register'
        ? <RollCall slot={slot} onPending={setPending} />
        : <History key={tab} corrections={tab === 'corrections'} slot={slot} onPending={setPending} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Take Roll Call
 * ═══════════════════════════════════════════════════════════════════════════ */
function RollCall({ slot, onPending }) {
  const [q, setQ] = useState({ hostel: '', building: '', floor: '', roomType: '', session: '', date: today() });
  const { data, loading, reload } = useBoardData((p) => api.getBoard('attendance', p), q);
  const { data: meta } = useFetch(api.getMeta, []);

  const [marks, setMarks] = useState({});
  const [notes, setNotes] = useState({});
  const [saving, setSaving] = useState(false);
  const [term, setTerm] = useState('');
  const [show, setShow] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [menu, setMenu] = useState(null);           // { row, anchor }
  const [correct, setCorrect] = useState(null);
  const [importing, setImporting] = useState(false);
  const filterBtn = useRef(null);
  const menuAnchor = useRef(null);

  const rows = useMemo(() => data?.rows || [], [data]);
  const hostelId = data?.hostel || '';
  const buildings = (meta?.buildings || []).filter((b) => String(b.hostel) === String(hostelId));
  const floors = (meta?.floors || []).filter((f) => (q.building ? String(f.building) === q.building : String(f.hostel) === String(hostelId)));

  // A fresh register: what is saved, else the suggestion.
  useEffect(() => {
    if (!data) return;
    setMarks(Object.fromEntries(rows.map((r) => [r.studentId, r.recordStatus || r.suggested])));
    setNotes(Object.fromEntries(rows.map((r) => [r.studentId, r.recordRemarks || ''])));
    setSelected(new Set());
    onPending?.(data.pendingCorrections || 0);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [term, show, q]);

  const unsaved = rows.filter((r) => !r.recordId).length;
  const changed = rows.filter((r) => r.recordId && (marks[r.studentId] !== r.recordStatus || (notes[r.studentId] || '') !== (r.recordRemarks || ''))).length;
  const tally = useMemo(() => {
    const n = { present: 0, absent: 0, leave: 0, none: 0 };
    rows.forEach((r) => { n[GROUP[marks[r.studentId]] || 'none'] += 1; });
    return n;
  }, [rows, marks]);

  const visible = useMemo(() => {
    const s = term.trim().toLowerCase();
    return rows.map((r, i) => ({ ...r, _n: i + 1 })).filter((r) => {
      if (show !== 'all' && (GROUP[marks[r.studentId]] || 'none') !== show) return false;
      if (!s) return true;
      return [r.studentName, r.studentRoll, r.studentAdmissionNo, r.roomNumber, r.roomCode, roomOf(r)].some((v) => String(v || '').toLowerCase().includes(s));
    });
  }, [rows, term, show, marks]);
  const pages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const at = Math.min(page, pages);
  const pageRows = visible.slice((at - 1) * PER_PAGE, at * PER_PAGE);

  const mark = (ids, status) => setMarks((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, status])) }));
  const toggle = (id, status) => setMarks((m) => ({ ...m, [id]: m[id] === status ? null : status }));

  const submit = async () => {
    const records = rows.filter((r) => marks[r.studentId]).map((r) => ({ student: r.studentId, status: marks[r.studentId], remarks: notes[r.studentId] || '' }));
    if (!records.length) { toast.error('Nobody is marked yet'); return; }
    setSaving(true);
    try {
      const r = await api.markAttendance({ hostel: hostelId, session: data.session, date: q.date, records });
      const d = r.data ?? r;
      toast.success(`${d.created} marked, ${d.updated} updated`);
      if (d.skipped?.length) toast(`${d.skipped.length} skipped`, { icon: 'ℹ️' });
      if (tally.none) toast(`${tally.none} student${tally.none === 1 ? '' : 's'} left unmarked`, { icon: 'ℹ️' });
      reload();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const previousDay = () => {
    const d = new Date(`${q.date}T00:00:00`);
    d.setDate(d.getDate() - 1);
    setQ((s) => ({ ...s, date: di(d) }));
  };

  const submitCorrection = async () => {
    try {
      await api.correctAttendance(correct.row.recordId, { status: correct.status, reason: correct.reason });
      toast.success('Correction recorded');
      setCorrect(null); reload();
    } catch (err) { toast.error(err.message); }
  };

  const total = rows.length;
  const pct = (n) => share(n, total);
  const state = !total ? null
    : unsaved === total ? { tone: 'amber', text: 'This roll call has not been submitted — the marks shown are suggestions.' }
      : unsaved || changed ? { tone: 'amber', text: `${count(unsaved + changed)} unsaved change${unsaved + changed === 1 ? '' : 's'} — submit to save.` }
        : null;

  const columns = [
    { key: 'n', label: '#', render: (r) => r._n, className: 'hs-table__num' },
    { key: 'student', label: 'Student', render: (r) => <Person name={r.studentName} src={r.studentPhoto} sub={r.studentRoll ? `Roll ${r.studentRoll}` : r.studentAdmissionNo} size={32} strong={false} /> },
    { key: 'class', label: 'Class', render: (r) => r.studentClass || '—' },
    { key: 'room', label: 'Room', render: (r) => roomOf(r), nowrap: true },
    { key: 'status', label: 'Status', render: (r) => {
      const m = marks[r.studentId];
      return (
        <span className="hs-seg" role="group" aria-label={`Mark ${r.studentName}`}>
          <button type="button" className={`hs-seg__b is-present${GROUP[m] === 'present' ? ' is-on' : ''}${m === 'late' ? ' is-late' : ''}`}
            aria-pressed={GROUP[m] === 'present'} onClick={() => toggle(r.studentId, 'present')}>{m === 'late' ? 'Late' : 'Present'}</button>
          <button type="button" className={`hs-seg__b is-absent${m === 'absent' ? ' is-on' : ''}`}
            aria-pressed={m === 'absent'} onClick={() => toggle(r.studentId, 'absent')}>Absent</button>
          <button type="button" className={`hs-seg__b is-leave${GROUP[m] === 'leave' ? ' is-on' : ''}`}
            aria-pressed={GROUP[m] === 'leave'} onClick={() => toggle(r.studentId, 'on_leave')}>{m === 'excused' ? 'Excused' : 'Leave'}</button>
        </span>
      );
    } },
    { key: 'remarks', label: 'Remarks', render: (r) => (
      <span className="hs-remark">
        <input value={notes[r.studentId] || ''} onChange={(e) => setNotes((n) => ({ ...n, [r.studentId]: e.target.value }))}
          placeholder={r.leaveType ? `${words(r.leaveType)} leave` : r.outpassStatus ? 'Out on a pass' : 'Add remark...'} aria-label={`Remark for ${r.studentName}`} maxLength={200} />
        <IconBtn icon="chat" size="sm" label={`More for ${r.studentName}`} className="hs-remark__more"
          onClick={(e) => { menuAnchor.current = e.currentTarget; setMenu(menu?.row.studentId === r.studentId ? null : { row: r }); }} />
      </span>
    ) },
  ];

  return (
    <>
      {slot ? createPortal(
        <>
          <Btn className="hs-btn--accent" icon="upload" onClick={() => setImporting(true)} disabled={!rows.length}>Import</Btn>
          <Btn className="hs-btn--accent" icon="history" onClick={previousDay}>Mark Previous Day</Btn>
          <Btn kind="primary" onClick={submit} disabled={saving || !rows.length}>{saving ? 'Submitting…' : 'Submit Attendance'}</Btn>
        </>, slot,
      ) : null}
      <Kpis cols={4} size="xs">
        <Kpi tone="green" icon="group" value={total} label="Total Residents" note="Alloted rooms" />
        <Kpi tone="green" icon="checkCircle" value={tally.present} label="Present" pct={pct(tally.present)} pctTone="green" />
        <Kpi tone="red" icon="xCircle" value={tally.absent} label="Absent" pct={pct(tally.absent)} pctTone="red" />
        <Kpi tone="sky" icon="minusCircle" value={tally.leave} label="On Leave" pct={pct(tally.leave)} pctTone="blue" />
      </Kpis>

      <FilterBar>
        <FField label="Hostel">
          <FSelect value={hostelId} onChange={(v) => setQ((s) => ({ ...s, hostel: v, building: '', floor: '' }))} label="Hostel"
            options={(data?.hostels || []).map((h) => ({ value: h._id, label: h.name }))} {...(data?.hostels?.length ? null : { all: 'No hostels' })} />
        </FField>
        <FField label="Building">
          <FSelect value={q.building} onChange={(v) => setQ((s) => ({ ...s, building: v, floor: '' }))} all="All buildings"
            options={buildings.map((b) => ({ value: b._id, label: b.name }))} />
        </FField>
        <FField label="Floor">
          <FSelect value={q.floor} onChange={(v) => setQ((s) => ({ ...s, floor: v }))} all="All floors"
            options={floors.map((f) => ({ value: f._id, label: f.name }))} />
        </FField>
        <FField label="Room Type">
          <FSelect value={q.roomType} onChange={(v) => setQ((s) => ({ ...s, roomType: v }))} all="All rooms"
            options={ROOM_TYPES.map(([value, label]) => ({ value, label }))} />
        </FField>
        <FField label="Session" grow={1.3}>
          <FSelect value={data?.session || q.session} onChange={(v) => setQ((s) => ({ ...s, session: v }))} label="Session"
            options={(data?.sessions || ['morning']).map((s) => ({ value: s, label: sessionLabel(s, data?.sessionTimes) }))} />
        </FField>
        <FField label="Date" grow={0.9}>
          <input type="date" value={q.date} max={today()} onChange={(e) => e.target.value && setQ((s) => ({ ...s, date: e.target.value }))} />
        </FField>
      </FilterBar>

      <ListCard className="hs-lcard--roll" head={(
        <>
          <h3 className="hs-roll__title">Students ({count(total)})</h3>
          <ul className="hs-roll__key">
            {[['present', `Present (${tally.present})`], ['absent', `Absent (${tally.absent})`], ['leave', `On Leave (${tally.leave})`], ['none', `Not Marked (${tally.none})`]].map(([k, text]) => (
              <li key={k}>
                <button type="button" className={`hs-roll__chip is-${k}${show === k ? ' is-on' : ''}`} aria-pressed={show === k}
                  onClick={() => setShow(show === k ? 'all' : k)} title={show === k ? 'Show everyone' : `Show only ${text}`}>
                  <i aria-hidden />{text}
                </button>
              </li>
            ))}
          </ul>
          <FSearch value={term} onChange={setTerm} placeholder="Search by name, roll no or room..." grow={0} width="264px" />
          <Btn ref={filterBtn} icon="filter" aria-haspopup="menu" aria-expanded={filterOpen} onClick={() => setFilterOpen((o) => !o)}>Filter{show !== 'all' ? ' · 1' : ''}</Btn>
          <Popover anchor={filterBtn} open={filterOpen} onClose={() => setFilterOpen(false)} label="Filter the register">
            <div className="hs-menu2" role="menu">
              {[['all', 'Everyone'], ['present', 'Present'], ['absent', 'Absent'], ['leave', 'On leave'], ['none', 'Not marked']].map(([k, text]) => (
                <button key={k} type="button" role="menuitemradio" aria-checked={show === k} className={`hs-menu2__item${show === k ? ' is-on' : ''}`}
                  onClick={() => { setShow(k); setFilterOpen(false); }}><span>{text}</span></button>
              ))}
              <div className="hs-menu2__rule" role="separator" />
              <button type="button" role="menuitem" className="hs-menu2__item" onClick={() => { mark(rows.filter((r) => !marks[r.studentId]).map((r) => r.studentId), 'present'); setFilterOpen(false); }} disabled={!tally.none}>
                <span>Mark the unmarked present</span>
              </button>
              <button type="button" role="menuitem" className="hs-menu2__item" onClick={() => { mark(rows.map((r) => r.studentId), 'present'); setFilterOpen(false); }}>
                <span>Mark everyone present</span>
              </button>
            </div>
          </Popover>
        </>
      )}>
        {state ? <p className={`hs-roll__state is-${state.tone}`} role="status">{state.text}</p> : null}
        <BulkBar count={selected.size} noun="student" onClear={() => setSelected(new Set())}>
          <Btn size="sm" kind="success" onClick={() => mark([...selected], 'present')}>Mark Present</Btn>
          <Btn size="sm" kind="danger" onClick={() => mark([...selected], 'absent')}>Mark Absent</Btn>
          <Btn size="sm" onClick={() => mark([...selected], 'on_leave')}>Mark Leave</Btn>
        </BulkBar>
        <DataTable
          columns={columns} rows={pageRows} rowKey="studentId" loading={loading} pad={5} headPad={11} dense
          selected={selected} onSelect={setSelected}
          empty={(
            <EmptyRows icon="group" title={total ? 'Nobody matches' : 'No residents'}
              action={total ? <Btn icon="refresh" onClick={() => { setTerm(''); setShow('all'); }}>Clear</Btn> : null}>
              {total ? 'Clear the search or the filter to see every resident.' : 'This hostel has no active residents for the selected filters.'}
            </EmptyRows>
          )}
        />
        <Pager page={at} pages={pages} total={visible.length} limit={PER_PAGE} noun={visible.length === 1 ? 'student' : 'students'} onPage={setPage} size="sm" />
      </ListCard>
      {data?.submittedAt && !state ? (
        <p className="hs-roll__saved">Submitted {fmtDate(data.submittedAt)}, {fmtTime(data.submittedAt)}{data.submittedBy ? ` by ${data.submittedBy}` : ''}.</p>
      ) : null}

      {/* A row's extras: the two marks the three buttons do not show, and the correction. */}
      <Popover anchor={menuAnchor} open={!!menu} onClose={() => setMenu(null)} label="More for this student">
        {menu ? (
          <div className="hs-menu2" role="menu">
            <button type="button" role="menuitem" className="hs-menu2__item" onClick={() => { mark([menu.row.studentId], 'late'); setMenu(null); }}><span>Mark late<small>Arrived after the roll call</small></span></button>
            <button type="button" role="menuitem" className="hs-menu2__item" onClick={() => { mark([menu.row.studentId], 'excused'); setMenu(null); }}><span>Mark excused<small>Away with permission</small></span></button>
            <button type="button" role="menuitem" className="hs-menu2__item" onClick={() => { mark([menu.row.studentId], null); setMenu(null); }}><span>Clear the mark</span></button>
            <div className="hs-menu2__rule" role="separator" />
            <button type="button" role="menuitem" className="hs-menu2__item" disabled={!menu.row.recordId}
              onClick={() => { setCorrect({ row: menu.row, status: menu.row.recordStatus, reason: '' }); setMenu(null); }}>
              <span>Correct the saved mark…<small>{menu.row.recordId ? 'Keeps the old value; may need approval' : 'Nothing is saved for this student yet'}</small></span>
            </button>
          </div>
        ) : null}
      </Popover>

      <FormModal open={!!correct} onClose={() => setCorrect(null)} onSubmit={submitCorrection} width={540}
        icon="pencilSquare" title="Correct Attendance" subtitle={correct ? `${correct.row.studentName} — the previous value is kept, and the correction may need approval.` : ''}
        submitLabel="Submit Correction" submitIcon="check">
        {correct ? (
          <FormSection>
            <p className="hsf-msg">Currently marked <MarkTag value={correct.row.recordStatus} />.</p>
            <RadioCards label="Corrected Status" required cols={3} value={correct.status} onChange={(v) => setCorrect((c) => ({ ...c, status: v }))}
              options={Object.entries(STATUS).map(([v, [l]]) => [v, l])} />
            <Fld label="Reason" required count={[correct.reason.length, 300]}>
              <textarea rows={3} maxLength={300} value={correct.reason} placeholder="Why the mark was wrong" onChange={(e) => setCorrect((c) => ({ ...c, reason: e.target.value }))} />
            </Fld>
          </FormSection>
        ) : null}
      </FormModal>

      <ImportMarks open={importing} onClose={() => setImporting(false)} rows={rows} marks={marks} notes={notes}
        label={`${fmtDate(`${q.date}T00:00:00`)} · ${sessionLabel(data?.session)}`}
        onApply={(m, n) => { setMarks((x) => ({ ...x, ...m })); setNotes((x) => ({ ...x, ...n })); }} />
    </>
  );
}

/* ── Import a roll call from a sheet ─────────────────────────────────────── */

/** A CSV line → cells, honouring quotes. */
function cells(line) {
  const out = []; let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
const WORD = {
  p: 'present', present: 'present', a: 'absent', absent: 'absent', l: 'on_leave', leave: 'on_leave', 'on leave': 'on_leave', on_leave: 'on_leave',
  late: 'late', excused: 'excused', e: 'excused',
};

function ImportMarks({ open, onClose, rows, marks, notes, label, onApply }) {
  const [result, setResult] = useState(null);
  useEffect(() => { if (open) setResult(null); }, [open]);

  const template = () => exportCsv('hostel-roll-call.csv', [
    { label: 'Admission No', value: (r) => r.studentAdmissionNo }, { label: 'Roll No', value: (r) => r.studentRoll },
    { label: 'Name', value: (r) => r.studentName }, { label: 'Class', value: (r) => r.studentClass },
    { label: 'Room', value: (r) => roomOf(r) },
    { label: 'Status', value: (r) => (STATUS[marks[r.studentId]] || [''])[0] },
    { label: 'Remark', value: (r) => notes[r.studentId] || '' },
  ], rows);

  const read = async (file) => {
    if (!file) return;
    try {
      const text = (await file.text()).replace(/^﻿/, '');
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { toast.error('That file has no rows under its header'); return; }
      const header = cells(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
      const col = (...names) => header.findIndex((h) => names.includes(h));
      const iAdm = col('admissionno', 'admissionnumber', 'admno'); const iRoll = col('rollno', 'roll', 'rollnumber');
      const iName = col('name', 'student', 'studentname'); const iStatus = col('status', 'mark', 'attendance'); const iNote = col('remark', 'remarks', 'note');
      if (iStatus < 0 || (iAdm < 0 && iRoll < 0 && iName < 0)) {
        toast.error('The sheet needs a Status column and one of Admission No, Roll No or Name'); return;
      }
      const norm = (v) => String(v || '').trim().toLowerCase();
      const m = {}; const n = {}; const missed = []; let applied = 0;
      lines.slice(1).forEach((line, i) => {
        const c = cells(line);
        const status = WORD[norm(c[iStatus])];
        const who = rows.find((r) => (iAdm >= 0 && norm(c[iAdm]) && norm(r.studentAdmissionNo) === norm(c[iAdm])))
          || rows.find((r) => iName >= 0 && norm(c[iName]) && norm(r.studentName) === norm(c[iName]) && (iRoll < 0 || !norm(c[iRoll]) || norm(r.studentRoll) === norm(c[iRoll])));
        if (!who) { missed.push(`Row ${i + 2}: no resident matches ${c[iAdm] || c[iName] || 'this line'}`); return; }
        if (!status) { missed.push(`Row ${i + 2}: “${c[iStatus] || ''}” is not a status`); return; }
        m[who.studentId] = status;
        if (iNote >= 0) n[who.studentId] = c[iNote] || '';
        applied += 1;
      });
      onApply(m, n);
      setResult({ applied, missed });
      if (applied) toast.success(`${applied} mark${applied === 1 ? '' : 's'} read — review and submit`);
    } catch (err) { toast.error(`Could not read that file: ${err.message}`); }
  };

  return (
    <FormModal open={open} onClose={onClose} width={600} icon="upload" title="Import a Roll Call"
      subtitle={`Fill in a sheet for ${label} and load it here. Nothing is saved until you press Submit Attendance.`}
      hideSubmit cancelLabel={result ? 'Done' : 'Cancel'}>
      <FormSection>
        <div className="hsf-fld">
          <span className="hsf-fld__label">1. Download the register</span>
          <div><Btn icon="download" onClick={template} disabled={!rows.length}>Download template (CSV)</Btn></div>
          <span className="hsf-hint">One line per resident. Set Status to Present, Absent, Leave, Late or Excused (P / A / L work too).</span>
        </div>
        <Fld label="2. Load the filled sheet" icon="upload">
          <input id="hs-att-file" type="file" accept=".csv,text/csv" onChange={(e) => { read(e.target.files?.[0]); e.target.value = ''; }} />
        </Fld>
        {result ? (
          <div className={`hs-result${result.missed.length ? ' hs-result--bad' : ''}`}>
            <h4>{result.applied} mark{result.applied === 1 ? '' : 's'} read{result.missed.length ? `, ${result.missed.length} line${result.missed.length === 1 ? '' : 's'} skipped` : ''}</h4>
            {result.missed.slice(0, 8).map((x) => <p key={x}>{x}</p>)}
            {result.missed.length > 8 ? <p>…and {result.missed.length - 8} more.</p> : null}
          </div>
        ) : null}
      </FormSection>
    </FormModal>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Attendance History  ·  Corrections & Requests
 * ═══════════════════════════════════════════════════════════════════════════ */
const APPROVAL = { pending: ['Awaiting approval', 'amber'], approved: ['Approved', 'green'], rejected: ['Rejected', 'red'] };

function History({ corrections, slot, onPending }) {
  const { state, set, setPage, reset } = useListState(
    { limit: 10, tab: corrections ? 'corrections' : 'all', hostel: '', session: '', status: '', from: '', to: '' }, { fromUrl: [] },
  );
  const { data, loading, reload } = useBoardData((q) => api.getBoard('attendance-history', q), state);
  const { data: meta } = useFetch(api.getMeta, []);
  const [busy, setBusy] = useState('');
  const rows = data?.rows || [];

  useEffect(() => { if (data?.tabs) onPending?.(data.tabs.pending || 0); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    try {
      const res = await api.getBoard('attendance-history', { ...state, page: 1, limit: 5000 });
      exportCsv(corrections ? 'hostel-attendance-corrections.csv' : 'hostel-attendance-history.csv', [
        { label: 'Date', value: (r) => fmtDate(r.date) }, { label: 'Session', value: (r) => SESSION_LABEL[r.session] || r.session },
        { label: 'Student', value: (r) => r.studentName }, { label: 'Roll', value: (r) => r.studentRoll },
        { label: 'Class', value: (r) => r.studentClass }, { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Room', value: (r) => r.roomNumber },
        { label: 'Status', value: (r) => (STATUS[r.status] || [r.status])[0] }, { label: 'Was', value: (r) => (r.previousStatus ? (STATUS[r.previousStatus] || [r.previousStatus])[0] : '') },
        { label: 'Remark', value: (r) => r.remarks }, { label: 'Marked by', value: (r) => r.markedByName },
        { label: 'Correction', value: (r) => (r.approvalStatus === 'not_required' ? '' : (APPROVAL[r.approvalStatus] || [r.approvalStatus])[0]) },
        { label: 'Reason', value: (r) => r.correctionReason },
      ], (res.data ?? res).rows || []);
    } catch (err) { toast.error(err.message); }
  };
  const decide = async (row, approve) => {
    setBusy(row._id);
    try {
      await api.approveCorrection(row._id, { approve });
      toast.success(approve ? 'Correction approved' : 'Correction rejected — the earlier mark is restored');
      reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(''); }
  };

  const who = { key: 'student', label: 'Student', render: (r) => <Person name={r.studentName} src={r.studentPhoto} sub={r.studentRoll ? `Roll ${r.studentRoll}` : r.studentAdmissionNo} size={32} strong={false} /> };
  const when = { key: 'date', label: 'Date', render: (r) => <TwoLine top={fmtDate(r.date)} sub={SESSION_LABEL[r.session] || words(r.session)} />, nowrap: true };
  const decideCell = (r) => (r.approvalStatus === 'pending' ? (
    <>
      <Btn size="sm" kind="success" icon="check" disabled={busy === r._id} onClick={() => decide(r, true)}>Approve</Btn>
      <Btn size="sm" kind="danger" icon="close" disabled={busy === r._id} onClick={() => decide(r, false)}>Reject</Btn>
    </>
  ) : null);
  const approval = (r) => { const [text, tone] = APPROVAL[r.approvalStatus] || [words(r.approvalStatus), 'slate']; return <Badge tone={tone} pill>{text}</Badge>; };

  const columns = corrections ? [
    when, who,
    { key: 'class', label: 'Class', render: (r) => r.studentClass || '—' },
    { key: 'change', label: 'Change', render: (r) => (
      <span className="hs-change">{r.previousStatus ? <MarkTag value={r.previousStatus} /> : <span className="hs-muted">—</span>}<span aria-hidden>→</span><MarkTag value={r.status} /></span>
    ) },
    { key: 'reason', label: 'Reason', render: (r) => r.correctionReason || '—' },
    { key: 'by', label: 'Requested By', render: (r) => <TwoLine top={r.correctedByName || '—'} sub={r.correctedAt ? `${fmtDate(r.correctedAt)}, ${fmtTime(r.correctedAt)}` : ''} /> },
    { key: 'approval', label: 'Status', render: (r) => (
      <span className="hs-stack">{approval(r)}{r.approvalStatus !== 'pending' && r.approvedByName ? <small>by {r.approvedByName}</small> : null}</span>
    ) },
  ] : [
    when, who,
    { key: 'class', label: 'Class', render: (r) => r.studentClass || '—' },
    { key: 'room', label: 'Room', render: (r) => roomOf(r) },
    { key: 'status', label: 'Status', render: (r) => (
      <span className="hs-stack"><MarkTag value={r.status} />{r.previousStatus ? <small>was {(STATUS[r.previousStatus] || [r.previousStatus])[0].toLowerCase()}</small> : null}</span>
    ) },
    { key: 'remarks', label: 'Remarks', render: (r) => r.remarks || '—' },
    { key: 'by', label: 'Marked By', render: (r) => <TwoLine top={r.markedByName || '—'} sub={r.markedAt ? `${fmtDate(r.markedAt)}, ${fmtTime(r.markedAt)}` : ''} /> },
    { key: 'approval', label: 'Correction', render: (r) => (r.approvalStatus === 'not_required' ? <span className="hs-muted">—</span> : approval(r)) },
  ];

  const filtered = !!(state.search || state.hostel || state.session || state.status || state.from || state.to);

  return (
    <>
      {slot ? createPortal(<Btn className="hs-btn--accent" icon="download" onClick={download}>Export</Btn>, slot) : null}
      <FilterBar>
        <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search by name, roll no or room..." grow={2} width="240px" />
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={(meta?.hostels || []).map((h) => ({ value: h._id, label: h.name }))} width="130px" />
        <FSelect value={state.session} onChange={(v) => set({ session: v })} all="All sessions" options={Object.entries(SESSION_LABEL).map(([value, label]) => ({ value, label }))} width="130px" />
        {corrections
          ? <FSelect value={state.tab} onChange={(v) => set({ tab: v })} options={[{ value: 'corrections', label: 'All corrections' }, { value: 'pending', label: 'Awaiting approval' }]} label="Which corrections" width="150px" />
          : <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={Object.entries(STATUS).map(([value, [label]]) => ({ value, label }))} width="130px" />}
        <FDateRange from={state.from} to={state.to} onChange={(v) => set(v)} width="270px" />
        <Btn icon="refresh" onClick={reset}>Reset</Btn>
      </FilterBar>

      <ListCard>
        <DataTable
          select={false} columns={columns} rows={rows} loading={loading} pad={8} headPad={12}
          actions={corrections || rows.some((r) => r.approvalStatus === 'pending') ? decideCell : undefined}
          empty={(
            <EmptyRows icon={corrections ? 'checkCircle' : 'calendar'} title={filtered ? 'Nothing matches these filters' : corrections ? 'No corrections' : 'No attendance records'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : null}>
              {corrections ? 'A mark changed after it was saved shows here, with who changed it and why.' : 'Roll calls appear here once they are submitted.'}
            </EmptyRows>
          )}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={corrections ? 'corrections' : 'records'} onPage={setPage} size="sm" />
      </ListCard>
    </>
  );
}
