/**
 * Hostel → Allocations: the two things that are not "one resident, one bed".
 *
 *   TransferRequests  room changes waiting for a decision — a warden's move
 *                     that needs an administrator's approval, or a resident's
 *                     own request, where the office also chooses the bed.
 *   RolloverModal     year end: every resident of the closing year is carried
 *                     into the new one in the same bed, or checked out.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import { words } from './hsUI';
import { Btn, Badge, ListCard, DataTable, EmptyRows, Person, TwoLine, fmtDate, fmtTime } from './hsList';
import { FormModal, FormSection, Grid, Fld, PersonCard, InfoNote, bedFits } from './hsForm';
import { newestYear } from '../../../utils/listOrder';

const REQ_STATE = { pending: ['Waiting', 'amber'], approved: ['Approved', 'green'], rejected: ['Not approved', 'red'], cancelled: ['Cancelled', 'slate'] };
const place = (hostel, room, bed) => [hostel, room, bed ? `Bed ${bed}` : ''].filter(Boolean).join(' · ');

export function TransferRequests({ refreshKey, canDecide, hostels = [], roomsById = {}, onDone }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [act, setAct] = useState(null);           // { row, action: 'approve' | 'reject' }
  const [form, setForm] = useState({ bed: '', remark: '' });
  const [beds, setBeds] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await api.getTransferRequests(); setData(r.data ?? r); }
    catch (err) { toast.error(err.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [refreshKey]); // eslint-disable-line

  const open = async (row, action) => {
    setAct({ row, action });
    setForm({ bed: row.toBed && row.toBedStatus === 'available' ? String(row.toBed) : '', remark: '' });
    if (action !== 'approve') return;
    try { const r = await api.getBeds({ status: 'available' }); setBeds(r.data ?? r); }
    catch (err) { toast.error(`The free beds could not be loaded — ${err.message}`); setBeds([]); }
  };
  const hostelName = (id) => hostels.find((h) => String(h._id) === String(id))?.name || '';
  // Only beds the engine would accept for this resident.
  const usable = useMemo(() => beds.filter((b) => {
    const room = roomsById[String(b.room?._id || b.room)];
    return (!room || !['maintenance', 'inactive'].includes(room.status)) && bedFits(b, act?.row.studentKind || 'student');
  }), [beds, act, roomsById]);

  const submit = async () => {
    if (act.action === 'approve' && !form.bed) { toast.error('Choose the bed to move them to'); return; }
    setBusy(true);
    try {
      await api.decideTransferRequest(act.row._id, { action: act.action, remark: form.remark, bed: form.bed || null });
      toast.success(act.action === 'approve' ? `${act.row.studentName} has been moved` : 'Request turned down');
      setAct(null); await load(); onDone?.();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const rows = data?.rows || [];
  const columns = [
    { key: 'no', label: 'Request', render: (r) => <TwoLine top={r.requestNumber} sub={fmtDate(r.createdAt)} strong />, nowrap: true },
    { key: 'who', label: 'Resident', render: (r) => <Person name={r.studentName} src={r.studentPhoto} sub={r.studentKind === 'teacher' ? 'Teacher' : 'Student'} strong={false} /> },
    { key: 'from', label: 'From', render: (r) => place(r.fromHostelName, r.fromRoom, r.fromBedNumber) || '—' },
    { key: 'to', label: 'To', render: (r) => (r.toBed
      ? place(r.toHostelName, r.toRoom, r.toBedNumber)
      : <TwoLine top="Office to choose" sub={r.preference ? `Prefers: ${r.preference}` : ''} />) },
    { key: 'why', label: 'Reason', render: (r) => <span className="hs-clip" title={r.reason}>{r.reason || '—'}</span> },
    { key: 'by', label: 'Asked By', render: (r) => <TwoLine top={r.requestedByName || '—'} sub={words(r.requestedByRole)} /> },
    { key: 'status', label: 'Status', render: (r) => {
      const [text, tone] = REQ_STATE[r.status] || [words(r.status), 'slate'];
      return (
        <span className="hs-stack">
          <Badge tone={tone} size="lg">{text}</Badge>
          {r.status !== 'pending' && (r.decidedByName || r.decisionRemark) ? <small title={r.decisionRemark || ''}>{[r.decidedByName, r.decidedAt ? fmtDate(r.decidedAt) : ''].filter(Boolean).join(' · ')}</small> : null}
        </span>
      );
    } },
  ];

  return (
    <>
      <ListCard>
        <DataTable select={false} columns={columns} rows={rows} loading={loading} pad={7} headPad={11}
          actions={(r) => (r.status === 'pending' && canDecide ? (
            <>
              <Btn size="sm" kind="success" onClick={() => open(r, 'approve')}>Approve</Btn>
              <Btn size="sm" kind="danger" onClick={() => open(r, 'reject')}>Reject</Btn>
            </>
          ) : r.status === 'pending' ? <span className="hs-muted">With the administrators</span> : null)}
          empty={<EmptyRows icon="swap" title="No room changes requested">A resident’s request to change room, and a warden’s move that needs approval, wait here for a decision.</EmptyRows>} />
      </ListCard>

      <FormModal open={!!act} onClose={() => setAct(null)} busy={busy} onSubmit={submit} width={560}
        icon={act?.action === 'approve' ? 'swap' : 'closeCircle'} iconTone={act?.action === 'approve' ? 'green' : 'red'}
        title={act?.action === 'approve' ? 'Approve Room Change' : 'Turn Down Room Change'}
        subtitle={act ? `${act.row.requestNumber} · asked by ${act.row.requestedByName || words(act.row.requestedByRole)} on ${fmtDate(act.row.createdAt)}` : ''}
        submitLabel={act?.action === 'approve' ? 'Approve & Move' : 'Reject'} submitIcon={act?.action === 'approve' ? 'check' : undefined}
        tone={act?.action === 'approve' ? undefined : 'danger'}>
        {act ? (
          <FormSection>
            <PersonCard name={act.row.studentName} photo={act.row.studentPhoto}
              meta={[act.row.fromHostelName, act.row.fromRoom, act.row.fromBedNumber ? `Bed ${act.row.fromBedNumber}` : '']} badge="Current bed" badgeTone="slate" />
            <InfoNote title="Why">{act.row.reason}{act.row.preference ? ` — prefers: ${act.row.preference}` : ''}</InfoNote>
            {act.action === 'approve' ? (
              <Fld label="Move To" required icon="oBed"
                hint={act.row.toBed && act.row.toBedStatus !== 'available' ? 'The bed that was asked for has since been taken — choose another' : `${usable.length} free bed${usable.length === 1 ? '' : 's'} that suit this resident`}
                hintTone={act.row.toBed && act.row.toBedStatus !== 'available' ? 'bad' : undefined}>
                <select value={form.bed} required onChange={(e) => setForm((f) => ({ ...f, bed: e.target.value }))}>
                  <option value="">Select a free bed</option>
                  {usable.map((b) => <option key={b._id} value={b._id}>{[hostelName(b.hostel), b.room?.roomNumber, `Bed ${b.bedNumber}`].filter(Boolean).join(' · ')}</option>)}
                </select>
              </Fld>
            ) : null}
            <Fld label={act.action === 'approve' ? 'Remark' : 'Reason'} required={act.action === 'reject'} optional={act.action === 'approve'} count={[form.remark.length, 300]}>
              <textarea rows={3} maxLength={300} required={act.action === 'reject'} value={form.remark}
                placeholder={act.action === 'reject' ? 'Why the request is turned down — the resident is told' : ''}
                onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} />
            </Fld>
          </FormSection>
        ) : null}
      </FormModal>
    </>
  );
}

const CHOICES = [['carry', 'Carry forward'], ['vacate', 'Check out'], ['skip', 'Leave as is']];

export function RolloverModal({ open, onClose, years = [], hostels = [], onDone }) {
  const [toYear, setToYear] = useState('');
  const [rows, setRows] = useState(null);
  const [choice, setChoice] = useState({});
  const [hostel, setHostel] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setResult(null); setReason(''); setHostel(''); setChoice({}); setRows(null);
    setToYear(years.find((y) => y.status === 'active')?._id || newestYear(years)?._id || '');
    api.getBoard('allocations', { tab: 'active', limit: 500 })
      .then((r) => setRows((r.data ?? r).rows || []))
      .catch((err) => { toast.error(err.message); setRows([]); });
  }, [open]); // eslint-disable-line

  const yearName = (id) => years.find((y) => String(y._id) === String(id))?.yearName || 'Earlier year';
  // Whoever is already filed under the chosen year has nothing to roll over.
  const due = useMemo(() => (rows || []).filter((r) => String(r.academicYear) !== String(toYear)), [rows, toYear]);
  const shown = due.filter((r) => !hostel || String(r.hostelId) === hostel);
  const pick = (id) => choice[id] || 'carry';
  const setAll = (v) => setChoice((c) => ({ ...c, ...Object.fromEntries(shown.map((r) => [r._id, v])) }));
  const carry = due.filter((r) => pick(r._id) === 'carry').map((r) => r._id);
  const vacate = due.filter((r) => pick(r._id) === 'vacate').map((r) => r._id);

  const submit = async () => {
    if (result) { onClose(); return; }
    if (!carry.length && !vacate.length) { toast.error('Nobody is set to carry forward or check out'); return; }
    setBusy(true);
    try {
      const r = await api.rolloverAllocations({ toYear, carry, vacate, reason });
      setResult(r.data ?? r); onDone?.();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <FormModal open={open} onClose={onClose} busy={busy} onSubmit={submit} width={860}
      icon="calendar" title="Year-end Rollover" subtitle="Carry each resident into the new academic year in the same bed, or check them out."
      submitLabel={result ? 'Done' : `Roll Over ${carry.length + vacate.length || ''}`.trim()} submitIcon="check" cancelLabel={result ? 'Close' : 'Cancel'}>
      {result ? (
        <FormSection>
          <InfoNote tone={result.failed?.length ? 'amber' : 'blue'}>{result.carried} carried forward into {yearName(toYear)}, {result.vacated} checked out{result.failed?.length ? `, ${result.failed.length} not done` : ''}.</InfoNote>
          {result.failed?.length ? (
            <div className="hs-result hs-result--bad"><h4>Not done</h4>{result.failed.map((x) => <p key={x.allocation}><strong>{x.studentName || 'Resident'}</strong> — {x.reason}</p>)}</div>
          ) : null}
        </FormSection>
      ) : (
        <FormSection>
          <Grid cols={2}>
            <Fld label="Carry Residents Into" required icon="calendar">
              <select value={toYear} required onChange={(e) => setToYear(e.target.value)}>
                {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}{y.status === 'active' ? ' (current)' : ''}</option>)}
              </select>
            </Fld>
            <Fld label="Show" icon="oBuilding">
              <select value={hostel} onChange={(e) => setHostel(e.target.value)}>
                <option value="">All hostels</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </Fld>
          </Grid>
          <div className="hsf-fld">
            <span className="hsf-fld__label">Residents <small>({due.length} still filed under an earlier year)</small></span>
            <div className="hs-rollbar">
              <span>{carry.length} carry forward · {vacate.length} check out</span>
              <span>
                <button type="button" className="hs-linkbtn" onClick={() => setAll('carry')}>All carry forward</button>
                <button type="button" className="hs-linkbtn" onClick={() => setAll('vacate')}>All check out</button>
                <button type="button" className="hs-linkbtn" onClick={() => setAll('skip')}>Leave all</button>
              </span>
            </div>
            <div className="hsf-checklist hs-rolllist">
              {rows === null ? <p className="hs-muted">Loading the residents…</p> : null}
              {rows !== null && !shown.length ? <p className="hs-muted">{due.length ? 'Nobody in this hostel needs rolling over.' : `Every resident is already filed under ${yearName(toYear)}.`}</p> : null}
              {shown.map((r) => (
                <div key={r._id} className="hs-rollrow">
                  <span><strong>{r.studentName}</strong><small>{[r.studentClass, r.hostelName, r.roomNumber, r.bedNumber ? `Bed ${r.bedNumber}` : '', yearName(r.academicYear)].filter(Boolean).join(' · ')}{r.accountInactive ? ' · account inactive' : ''}</small></span>
                  <select value={pick(r._id)} aria-label={`What happens to ${r.studentName}`} onChange={(e) => setChoice((c) => ({ ...c, [r._id]: e.target.value }))}>
                    {CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <Fld label="Note" optional count={[reason.length, 200]}>
            <input maxLength={200} value={reason} placeholder="Kept in each resident’s allocation history" onChange={(e) => setReason(e.target.value)} />
          </Fld>
          <InfoNote>Carrying forward keeps the bed and the stay — it is filed under the new year and noted in the history. Checking out is an ordinary release: the bed is freed, the mess enrolment ends and unused passes are cancelled. Security deposits are not refunded here; refund them from Fees, or release a resident on their own to settle it at checkout.</InfoNote>
        </FormSection>
      )}
    </FormModal>
  );
}
