import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import {
  PageHeader, Button, Badge, Spinner, Empty, Modal, Table, Pagination,
} from '../../../components/ui/index';
import { StatusBadge, Filters, label, today, dd, dt } from '../shared';

const MARKS = [
  { v: 'present', l: 'Present', tone: 'success' },
  { v: 'absent',  l: 'Absent',  tone: 'danger' },
  { v: 'late',    l: 'Late',    tone: 'warning' },
  { v: 'excused', l: 'Excused', tone: 'info' },
  { v: 'on_leave', l: 'On leave', tone: 'info' },
];
const SESSIONS = ['morning', 'evening', 'night', 'roll_call'];

export default function Attendance() {
  const [tab, setTab] = useState('register');
  const [q, setQ] = useState({ hostel: '', session: 'morning', date: today(), floor: '', room: '' });
  const [register, setRegister] = useState(null);
  const [marks, setMarks] = useState({});
  const [loading, setLoad] = useState(false);
  const [saving, setSaving] = useState(false);
  const [correct, setCorrect] = useState(null);
  const [hist, setHist] = useState({ rows: [], page: 1, pages: 1, total: 0 });
  const [histLoading, setHistLoad] = useState(false);
  const [histQ, setHistQ] = useState({ session: '', status: '', from: '', to: '' });

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const floors = (meta?.floors || []).filter((f) => !q.hostel || String(f.hostel) === q.hostel);
  const rooms = (meta?.rooms || []).filter((r) => (!q.hostel || String(r.hostel) === q.hostel) && (!q.floor || String(r.floor) === q.floor));

  useEffect(() => { if (!q.hostel && hostels.length) setQ((s) => ({ ...s, hostel: hostels[0]._id })); }, [hostels]); // eslint-disable-line

  const loadRegister = useCallback(async () => {
    if (!q.hostel) return;
    setLoad(true);
    try {
      const r = await api.getRegister({ ...q, floor: q.floor || undefined, room: q.room || undefined });
      const d = r.data ?? r;
      setRegister(d);
      // Seed with what is already marked; otherwise the suggested value, so a
      // warden usually only touches the exceptions.
      setMarks(Object.fromEntries(d.rows.map((x) => [
        String(x.student?._id || x.student),
        x.record?.status || x.suggested,
      ])));
    } catch (err) { toast.error(err.message); setRegister(null); } finally { setLoad(false); }
  }, [q]);
  useEffect(() => { if (tab === 'register') loadRegister(); }, [tab, loadRegister]);

  const loadHistory = useCallback(async (page = 1) => {
    setHistLoad(true);
    try {
      const r = await api.getAttendanceHistory({ page, limit: 25, hostel: q.hostel || undefined, ...histQ });
      const d = r.data ?? r;
      setHist({ rows: d.data || [], page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setHistLoad(false); }
  }, [q.hostel, histQ]);
  useEffect(() => { if (tab === 'history') loadHistory(1); }, [tab, loadHistory]);

  const setAll = (status) => {
    if (!register) return;
    setMarks(Object.fromEntries(register.rows.map((x) => [String(x.student?._id || x.student), status])));
  };

  const submit = async () => {
    setSaving(true);
    try {
      const records = Object.entries(marks).map(([student, status]) => ({ student, status }));
      const r = await api.markAttendance({ hostel: q.hostel, session: q.session, date: q.date, records });
      const d = r.data ?? r;
      toast.success(`${d.created} marked, ${d.updated} updated`);
      if (d.skipped?.length) toast(`${d.skipped.length} skipped`, { icon: 'ℹ️' });
      loadRegister();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const submitCorrection = async () => {
    try {
      await api.correctAttendance(correct.row.record._id, { status: correct.status, reason: correct.reason });
      toast.success('Correction recorded');
      setCorrect(null); loadRegister();
    } catch (err) { toast.error(err.message); }
  };

  const approveCorrection = async (row) => {
    try {
      await api.approveCorrection(row._id, { approve: true });
      toast.success('Correction approved');
      loadHistory(hist.page);
    } catch (err) { toast.error(err.message); }
  };

  const summary = register?.summary || {};

  const histColumns = [
    { key: 'date', label: 'Date', render: (r) => dd(r.date) },
    { key: 'session', label: 'Session', render: (r) => <Badge variant="muted">{label(r.session)}</Badge> },
    { key: 'student', label: 'Student', render: (r) => r.student?.name || '—' },
    { key: 'room', label: 'Room', render: (r) => r.room?.roomNumber || '—' },
    { key: 'status', label: 'Status', render: (r) => (
      <div>
        <StatusBadge value={r.status} />
        {r.previousStatus && (
          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>was {label(r.previousStatus)}</div>
        )}
      </div>
    ) },
    { key: 'marked', label: 'Marked by', render: (r) => (
      <div style={{ fontSize: '.78rem' }}>
        {r.markedBy?.name || '—'}
        <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{dt(r.markedAt)}</div>
      </div>
    ) },
    { key: 'approval', label: 'Correction', render: (r) => r.approvalStatus === 'not_required'
      ? <span className="text-muted">—</span>
      : <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <StatusBadge value={r.approvalStatus} />
          {r.approvalStatus === 'pending' && <Button size="sm" onClick={() => approveCorrection(r)}>Approve</Button>}
        </div> },
  ];

  return (
    <div className="page">
      <PageHeader title="Hostel Attendance" subtitle="Roll call by session — one record per student, date and session" />

      <div className="tabs">
        <button className={`tab${tab === 'register' ? ' active' : ''}`} onClick={() => setTab('register')}>Take roll call</button>
        <button className={`tab${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>History & corrections</button>
      </div>

      {tab === 'register' ? (
        <>
          <Filters>
            <select className="form-control" style={{ maxWidth: 220 }} value={q.hostel} onChange={(e) => setQ((s) => ({ ...s, hostel: e.target.value, floor: '', room: '' }))}>
              {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
            </select>
            <select className="form-control" style={{ maxWidth: 150 }} value={q.session} onChange={(e) => setQ((s) => ({ ...s, session: e.target.value }))}>
              {SESSIONS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
            <input className="form-control" style={{ maxWidth: 170 }} type="date" value={q.date} max={today()} onChange={(e) => setQ((s) => ({ ...s, date: e.target.value }))} />
            <select className="form-control" style={{ maxWidth: 160 }} value={q.floor} onChange={(e) => setQ((s) => ({ ...s, floor: e.target.value, room: '' }))}>
              <option value="">All floors</option>
              {floors.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
            </select>
            <select className="form-control" style={{ maxWidth: 150 }} value={q.room} onChange={(e) => setQ((s) => ({ ...s, room: e.target.value }))}>
              <option value="">All rooms</option>
              {rooms.map((r) => <option key={r._id} value={r._id}>Room {r.roomNumber}</option>)}
            </select>
          </Filters>

          {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
            : !register?.rows?.length ? <Empty icon="✅" title="No residents" message="This hostel has no active residents for the selected filters." />
            : (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Mark everyone:</span>
                {MARKS.slice(0, 3).map((m) => (
                  <Button key={m.v} size="sm" variant="secondary" onClick={() => setAll(m.v)}>{m.l}</Button>
                ))}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(summary).map(([k, v]) => (
                    <Badge key={k} variant={MARKS.find((m) => m.v === k)?.tone || 'muted'}>{label(k)}: {v}</Badge>
                  ))}
                </span>
              </div>

              <div className="card"><div className="card-body" style={{ padding: 0 }}>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Student</th><th>Room</th><th>Note</th><th>Mark</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {register.rows.map((r) => {
                        const sid = String(r.student?._id || r.student);
                        return (
                          <tr key={sid}>
                            <td>
                              <strong>{r.student?.name}</strong>
                              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.student?.email}</div>
                            </td>
                            <td style={{ fontSize: '.82rem' }}>
                              {r.room?.roomNumber || '—'}
                              <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{r.floor?.name}</div>
                            </td>
                            <td>
                              {r.onLeave && <Badge variant="info">on leave to {dd(r.onLeave.toDate)}</Badge>}
                              {r.onOutpass && <Badge variant="warning">outpass {r.onOutpass.status}</Badge>}
                              {!r.onLeave && !r.onOutpass && <span className="text-muted" style={{ fontSize: '.78rem' }}>—</span>}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {MARKS.map((m) => (
                                  <button key={m.v} type="button"
                                    onClick={() => setMarks((s) => ({ ...s, [sid]: m.v }))}
                                    className={`btn btn-sm ${marks[sid] === m.v ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ padding: '3px 9px', fontSize: '.74rem' }}>
                                    {m.l}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td>
                              {r.record && (
                                <Button size="sm" variant="secondary"
                                  onClick={() => setCorrect({ row: r, status: r.record.status, reason: '' })}>
                                  Correct
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div></div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <Button loading={saving} onClick={submit}>Save roll call ({register.rows.length})</Button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <Filters>
            <select className="form-control" style={{ maxWidth: 220 }} value={q.hostel} onChange={(e) => setQ((s) => ({ ...s, hostel: e.target.value }))}>
              <option value="">All hostels</option>
              {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
            </select>
            <select className="form-control" style={{ maxWidth: 150 }} value={histQ.session} onChange={(e) => setHistQ((s) => ({ ...s, session: e.target.value }))}>
              <option value="">All sessions</option>
              {SESSIONS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
            <select className="form-control" style={{ maxWidth: 150 }} value={histQ.status} onChange={(e) => setHistQ((s) => ({ ...s, status: e.target.value }))}>
              <option value="">All statuses</option>
              {MARKS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
            <input className="form-control" style={{ maxWidth: 160 }} type="date" value={histQ.from} onChange={(e) => setHistQ((s) => ({ ...s, from: e.target.value }))} />
            <input className="form-control" style={{ maxWidth: 160 }} type="date" value={histQ.to} onChange={(e) => setHistQ((s) => ({ ...s, to: e.target.value }))} />
          </Filters>

          <div className="card"><div className="card-body" style={{ padding: 0 }}>
            <Table columns={histColumns} data={hist.rows} loading={histLoading} emptyIcon="📋" emptyTitle="No attendance records" />
          </div></div>
          <Pagination page={hist.page} pages={hist.pages} total={hist.total} onPage={loadHistory} />
        </>
      )}

      <Modal open={!!correct} onClose={() => setCorrect(null)} maxWidth={480} title="Correct attendance"
        footer={<>
          <Button variant="secondary" onClick={() => setCorrect(null)}>Cancel</Button>
          <Button onClick={submitCorrection}>Submit correction</Button>
        </>}>
        {correct && (
          <>
            <p style={{ fontSize: '.86rem', marginTop: 0 }}>
              <strong>{correct.row.student?.name}</strong> is currently marked{' '}
              <StatusBadge value={correct.row.record?.status} />.
            </p>
            <div className="form-group">
              <label className="form-label">Corrected status</label>
              <select className="form-control" value={correct.status} onChange={(e) => setCorrect((c) => ({ ...c, status: e.target.value }))}>
                {MARKS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Reason</label>
              <textarea className="form-control" rows={3} value={correct.reason} onChange={(e) => setCorrect((c) => ({ ...c, reason: e.target.value }))} />
            </div>
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
              The previous value is kept, and the correction may need approval depending on your hostel settings.
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
